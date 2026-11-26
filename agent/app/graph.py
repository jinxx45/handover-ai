"""The Handover interview graph.

    analyze -> plan -> [prepare_question -> wait_for_answer -> record_answer]* -> draft_pack -> END

`wait_for_answer` calls `interrupt()`: the graph checkpoints and returns control to
the API. The run resumes (hours or days later) when the backend posts the answer.
Question generation lives in its own node so that resuming never re-runs the LLM
call that produced the question.
"""
from __future__ import annotations

import os
import sqlite3
from typing import Any, Optional, TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from .llm import get_llm
from .models import Answer, Evidence, Item, ItemAnalysis
from .scoring import analyze

FINISH = "__finish__"
MAX_QUESTIONS = int(os.getenv("MAX_QUESTIONS", "6"))


class HandoverState(TypedDict, total=False):
    case_id: str
    person_name: str
    role: Optional[str]
    items: list[dict]
    evidence: list[dict]
    analysis: list[dict]
    queue: list[str]  # item ids still to interview, riskiest first
    current: Optional[dict]  # {itemId, itemTitle, question, isFollowup}
    followed_up: list[str]  # item ids that already got their one follow-up
    answers: list[dict]
    asked: int
    finished: bool
    pack: Optional[dict]


def _items(state: HandoverState) -> list[Item]:
    return [Item.model_validate(i) for i in state.get("items", [])]


def _evidence(state: HandoverState) -> list[Evidence]:
    return [Evidence.model_validate(e) for e in state.get("evidence", [])]


def _answers(state: HandoverState) -> list[Answer]:
    return [Answer.model_validate(a) for a in state.get("answers", [])]


# --------------------------------------------------------------------------- nodes


def analyze_node(state: HandoverState) -> dict[str, Any]:
    result = analyze(_items(state))
    return {"analysis": [a.model_dump() for a in result]}


def plan_node(state: HandoverState) -> dict[str, Any]:
    queue = [a["item_id"] for a in state["analysis"] if a["needs_interview"]][:MAX_QUESTIONS]
    return {"queue": queue, "answers": [], "followed_up": [], "asked": 0, "finished": False, "current": None}


def prepare_question_node(state: HandoverState) -> dict[str, Any]:
    current = state.get("current")
    if current and current.get("isFollowup"):
        return {}  # record_answer already prepared a follow-up
    item_id = state["queue"][0]
    item = next(i for i in _items(state) if i.id == item_id)
    evidence = [e for e in _evidence(state) if e.item_id == item_id]
    q = get_llm().question(state["person_name"], item, evidence, _answers(state))
    return {"current": {"itemId": item.id, "itemTitle": item.title, "question": q, "isFollowup": False}}


def wait_for_answer_node(state: HandoverState) -> dict[str, Any]:
    current = state["current"]
    remaining = len(state.get("queue", []))
    answer = interrupt({**current, "remaining": remaining})
    return {"current": {**current, "answer": answer}}


def record_answer_node(state: HandoverState) -> dict[str, Any]:
    current = state["current"]
    answer = str(current.get("answer", "")).strip()
    queue = list(state.get("queue", []))
    if answer == FINISH:
        return {"finished": True, "queue": [], "current": None}

    answers = list(state.get("answers", []))
    asked = state.get("asked", 0) + 1
    if answer:
        answers.append(
            {"id": f"I{len(answers) + 1}", "itemId": current["itemId"], "question": current["question"], "answer": answer}
        )

    followed = list(state.get("followed_up", []))
    if answer and not current.get("isFollowup") and current["itemId"] not in followed:
        item = next(i for i in _items(state) if i.id == current["itemId"])
        fq = get_llm().followup(item, current["question"], answer)
        if fq:
            followed.append(item.id)
            return {
                "answers": answers,
                "asked": asked,
                "followed_up": followed,
                "current": {"itemId": item.id, "itemTitle": item.title, "question": fq, "isFollowup": True},
            }

    if queue and queue[0] == current["itemId"]:
        queue.pop(0)
    return {"answers": answers, "asked": asked, "queue": queue, "followed_up": followed, "current": None}


def draft_pack_node(state: HandoverState) -> dict[str, Any]:
    analysis = [ItemAnalysis.model_validate(a) for a in state["analysis"]]
    pack = get_llm().draft_pack(
        state["person_name"], state.get("role"), _items(state), analysis, _answers(state), _evidence(state)
    )
    return {"pack": pack.model_dump(), "current": None}


def route_next(state: HandoverState) -> str:
    if state.get("finished"):
        return "draft_pack"
    current = state.get("current")
    if current and current.get("isFollowup"):
        return "prepare_question"
    return "prepare_question" if state.get("queue") else "draft_pack"


# --------------------------------------------------------------------------- build


def _postgres_checkpointer():
    """Keep interviews in Postgres (e.g. Neon) when DATABASE_URL is set, so a restart or redeploy
    on a host with a throwaway disk (Render free tier) does not lose a half-finished interview."""
    url = os.getenv("DATABASE_URL")
    if not url:
        return None
    from langgraph.checkpoint.postgres import PostgresSaver
    from psycopg.rows import dict_row
    from psycopg_pool import ConnectionPool

    # prepare_threshold=None keeps it working behind PgBouncer-style poolers such as Neon's pooled endpoint.
    pool = ConnectionPool(
        url,
        min_size=1,
        max_size=int(os.getenv("DB_POOL_SIZE", "4")),
        kwargs={"autocommit": True, "prepare_threshold": None, "row_factory": dict_row},
        check=ConnectionPool.check_connection,
        open=True,
    )
    saver = PostgresSaver(pool)
    saver.setup()
    return saver


def build_graph(checkpointer=None):
    g = StateGraph(HandoverState)
    g.add_node("analyze", analyze_node)
    g.add_node("plan", plan_node)
    g.add_node("prepare_question", prepare_question_node)
    g.add_node("wait_for_answer", wait_for_answer_node)
    g.add_node("record_answer", record_answer_node)
    g.add_node("draft_pack", draft_pack_node)

    g.add_edge(START, "analyze")
    g.add_edge("analyze", "plan")
    g.add_conditional_edges("plan", route_next, ["prepare_question", "draft_pack"])
    g.add_edge("prepare_question", "wait_for_answer")
    g.add_edge("wait_for_answer", "record_answer")
    g.add_conditional_edges("record_answer", route_next, ["prepare_question", "draft_pack"])
    g.add_edge("draft_pack", END)

    if checkpointer is None:
        checkpointer = _postgres_checkpointer()
    if checkpointer is None:
        path = os.getenv("CHECKPOINT_DB", "handover_checkpoints.sqlite")
        if path == ":memory:":
            checkpointer = InMemorySaver()
        else:
            checkpointer = SqliteSaver(sqlite3.connect(path, check_same_thread=False))
    return g.compile(checkpointer=checkpointer)
