"""Handover agent service (FastAPI).

Endpoints (called only by the backend, never by the browser):
    POST /runs                  start a run for a case -> first question (or pack)
    POST /runs/{run_id}/answer  resume with the leaver's answer -> next question (or pack)
    POST /runs/{run_id}/finish  stop interviewing and draft the pack now
    GET  /runs/{run_id}         current state
    POST /ask                   successor question -> cited answer (stateless)
    POST /skills                skills the backfill needs, with evidence (stateless)
    POST /onboarding            90-day onboarding kit for the backfill (stateless)
    GET  /health
"""
from __future__ import annotations

import logging
import os
import uuid

from fastapi import FastAPI, HTTPException
from langgraph.types import Command

from .graph import FINISH, build_graph
from .llm import get_llm
from .models import (
    Answer,
    AskRequest,
    AskResponse,
    AnswerRequest,
    ItemAnalysis,
    KnowledgePack,
    Question,
    RunResponse,
    BackfillProfile,
    OnboardingKit,
    OnboardingRequest,
    SkillsRequest,
    StartRun,
    UpdateItems,
)
from .scoring import analyze
from .retrieval import build_chunks, search

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("handover.agent")

app = FastAPI(title="Handover agent", version="1.0.0")
graph = build_graph()


def _config(run_id: str) -> dict:
    return {"configurable": {"thread_id": run_id}}


def _response(run_id: str) -> RunResponse:
    snap = graph.get_state(_config(run_id))
    if not snap or not snap.values:
        raise HTTPException(status_code=404, detail="run not found")
    values = snap.values
    analysis = [ItemAnalysis.model_validate(a) for a in values.get("analysis", [])]
    answers = [Answer.model_validate(a) for a in values.get("answers", [])]

    pending = [i for task in snap.tasks for i in task.interrupts]
    if pending:
        payload = pending[0].value
        return RunResponse(
            run_id=run_id,
            status="INTERVIEWING",
            analysis=analysis,
            answers=answers,
            question=Question(
                item_id=payload["itemId"],
                item_title=payload["itemTitle"],
                question=payload["question"],
                is_followup=payload.get("isFollowup", False),
                remaining=payload.get("remaining", 0),
            ),
        )
    pack = values.get("pack")
    return RunResponse(
        run_id=run_id,
        status="DRAFTED",
        analysis=analysis,
        answers=answers,
        pack=KnowledgePack.model_validate(pack) if pack else None,
    )


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "llm": get_llm().name}


@app.post("/runs", response_model=RunResponse, response_model_by_alias=True)
def start_run(req: StartRun) -> RunResponse:
    run_id = f"{req.case_id}-{uuid.uuid4().hex[:8]}"
    log.info("start run %s for %s with %d items", run_id, req.person_name, len(req.items))
    graph.invoke(
        {
            "case_id": req.case_id,
            "person_name": req.person_name,
            "role": req.role,
            "items": [i.model_dump(by_alias=True) for i in req.items],
            "evidence": [e.model_dump(by_alias=True) for e in req.evidence],
        },
        _config(run_id),
    )
    return _response(run_id)


@app.post("/runs/{run_id}/answer", response_model=RunResponse, response_model_by_alias=True)
def answer(run_id: str, req: AnswerRequest) -> RunResponse:
    current = _response(run_id)
    if current.status != "INTERVIEWING":
        raise HTTPException(status_code=409, detail="run is not waiting for an answer")
    if not req.answer.strip():
        raise HTTPException(status_code=422, detail="answer is empty")
    graph.invoke(Command(resume=req.answer), _config(run_id))
    return _response(run_id)


@app.post("/runs/{run_id}/finish", response_model=RunResponse, response_model_by_alias=True)
def finish(run_id: str) -> RunResponse:
    current = _response(run_id)
    if current.status == "INTERVIEWING":
        graph.invoke(Command(resume=FINISH), _config(run_id))
    return _response(run_id)


@app.post("/runs/{run_id}/items", response_model=RunResponse, response_model_by_alias=True)
def update_items(run_id: str, req: UpdateItems) -> RunResponse:
    """Apply manual map changes (added or removed items). While interviewing, new risky items join the
    question queue and removed ones leave it; the current question stays as it is."""
    current = _response(run_id)
    values = graph.get_state(_config(run_id)).values
    removed = set(req.remove)
    items = [i for i in values.get("items", []) if i["id"] not in removed]
    items += [i.model_dump(by_alias=True) for i in req.add]
    evidence = [e for e in values.get("evidence", []) if e.get("itemId") not in removed]
    evidence += [e.model_dump(by_alias=True) for e in req.evidence]
    from .models import Item as ItemModel

    analysis = analyze([ItemModel.model_validate(i) for i in items])
    update: dict = {"items": items, "evidence": evidence, "analysis": [a.model_dump() for a in analysis]}
    if current.status == "INTERVIEWING":
        queue = [q for q in values.get("queue", []) if q not in removed]
        asked = {a["itemId"] for a in values.get("answers", [])}
        new_ids = {i.id for i in req.add}
        queue += [a.item_id for a in analysis if a.item_id in new_ids and a.needs_interview and a.item_id not in asked]
        update["queue"] = queue
        # as_node keeps the graph parked on the same pending question.
        graph.update_state(_config(run_id), update, as_node="prepare_question")
        graph.invoke(None, _config(run_id))  # re-enter wait_for_answer so the same question is pending again
    else:
        graph.update_state(_config(run_id), update, as_node="draft_pack")
    log.info("run %s: +%d items, -%d items", run_id, len(req.add), len(removed))
    return _response(run_id)


@app.get("/runs/{run_id}", response_model=RunResponse, response_model_by_alias=True)
def get_run(run_id: str) -> RunResponse:
    return _response(run_id)


@app.post("/skills", response_model=BackfillProfile)
def skills(req: SkillsRequest) -> BackfillProfile:
    """Skills the backfill needs, inferred from items, evidence and interview answers. Stateless."""
    return get_llm().skills(req.person_name, req.role, req.items, req.evidence, req.answers)


@app.post("/onboarding", response_model=OnboardingKit, response_model_by_alias=True)
def onboarding(req: OnboardingRequest) -> OnboardingKit:
    """A 90-day onboarding kit for whoever backfills the role. Stateless."""
    llm = get_llm()
    skills = req.skills or llm.skills(req.person_name, req.role, req.items, req.evidence, req.answers).skills
    return llm.onboarding(req.person_name, req.role, req.manager_name, req.items, req.evidence, req.answers,
                          req.attachments, skills)


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest) -> AskResponse:
    chunks = build_chunks(req.pack, req.answers, req.evidence)
    hits = search(req.question, chunks, k=6)
    if not hits:
        return AskResponse(
            answer="This isn't covered in the handover pack. Ask the manager, or add it to the pack once you find out.",
            citations=[],
            covered=False,
        )
    text, cites = get_llm().answer(req.question, [c for c, _ in hits])
    if not text:
        return AskResponse(
            answer="This isn't covered in the handover pack. Ask the manager, or add it to the pack once you find out.",
            citations=[],
            covered=False,
        )
    return AskResponse(answer=text, citations=cites, covered=True)
