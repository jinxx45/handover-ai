"""LLM layer.

`get_llm()` returns a real chat model (Anthropic or OpenAI-compatible) when an API
key is configured, otherwise `MockLlm`, a deterministic template engine so the
whole product can be demoed offline. Both implement the same four methods.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Optional, Protocol

from pydantic import BaseModel, Field

from .models import (
    Answer, Attachment, BackfillProfile, Evidence, Item, ItemAnalysis, KnowledgePack, OnboardingKit, PackSection, Skill,
)
from .retrieval import Chunk

log = logging.getLogger(__name__)

PACK_SECTIONS = [
    ("overview", "About the role"),
    ("systems", "Systems they own"),
    ("recurring", "Regular tasks"),
    ("approvals", "Approvals to hand over"),
    ("people", "People to know"),
    ("open_work", "Work in progress"),
    ("landmines", "What goes wrong and how to fix it"),
    ("links", "Links"),
]


class Llm(Protocol):
    name: str

    def question(self, person: str, item: Item, evidence: list[Evidence], answered: list[Answer]) -> str: ...

    def followup(self, item: Item, question: str, answer: str) -> Optional[str]: ...

    def draft_pack(
        self,
        person: str,
        role: Optional[str],
        items: list[Item],
        analysis: list[ItemAnalysis],
        answers: list[Answer],
        evidence: list[Evidence],
    ) -> KnowledgePack: ...

    def answer(self, question: str, chunks: list[Chunk]) -> tuple[str, list[str]]: ...

    def skills(self, person: str, role: Optional[str], items: list[Item], evidence: list[Evidence],
               answers: list[Answer]) -> BackfillProfile: ...

    def onboarding(self, person: str, role: Optional[str], manager: Optional[str], items: list[Item],
                   evidence: list[Evidence], answers: list[Answer], attachments: list[Attachment],
                   skills: list[Skill]) -> OnboardingKit: ...


# --------------------------------------------------------------------------- mock


def _plain(text: str) -> str:
    """Markdown to plain text: drop links' URLs, bold markers and citation tags."""
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\[(?:E|I|S)\d+\]", "", text)
    text = re.sub(r"\s*\[(?:Link|Recording):[^\]]*\]", "", text)
    text = text.replace("**", "").replace(" (link)", "").replace("Q: ", "").replace(" A: ", " — ")
    return text


def _short(text: str, n: int = 160) -> str:
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1].rsplit(" ", 1)[0] + "…"


class MockLlm:
    """Deterministic, offline. Good enough to demo the full flow without an API key."""

    name = "mock"

    def skills(self, person, role, items, evidence, answers) -> BackfillProfile:
        from .skills import mock_profile

        return mock_profile(person, role, items, evidence, answers)

    def onboarding(self, person, role, manager, items, evidence, answers, attachments, skills) -> OnboardingKit:
        from .onboarding import mock_kit

        return mock_kit(person, role, manager, items, evidence, answers, attachments, skills)

    def question(self, person: str, item: Item, evidence: list[Evidence], answered: list[Answer]) -> str:
        first = person.split()[0]
        if item.kind == "recurring_task":
            return (
                f"{first}, you run '{item.title}' and the steps aren't written down. "
                "When does it happen, what are the steps, and what usually goes wrong?"
            )
        if item.kind == "approval":
            return (
                f"{first}, '{item.title}' needs a new owner when you leave. What do you check before you approve, "
                "when do you say no, and who should take it over?"
            )
        if item.kind == "oncall":
            return (
                f"You're on '{item.title}'. Which alerts really matter, what do you do first, "
                "and who should take your place?"
            )
        if item.kind == "customer":
            return (
                f"What should the next person know about {item.title}? "
                "Who is the main contact, and what have you promised them?"
            )
        if item.kind in ("service", "repo"):
            return (
                f"{first}, there's no runbook for {item.title}. When it breaks, what do you check first, "
                "and is there anything unusual about how it's released or set up?"
            )
        if item.kind in ("ticket_queue", "ticket"):
            return f"For '{item.title}', which ones matter most, and what is the next step on each?"
        return f"What should the next person know about '{item.title}' that isn't written down?"

    def followup(self, item: Item, question: str, answer: str) -> Optional[str]:
        if len(answer.split()) < 12:
            return "Can you add a little more? For example, who to call when it fails, or a link to start from."
        return None

    def draft_pack(self, person, role, items, analysis, answers, evidence) -> KnowledgePack:
        by_id = {i.id: i for i in items}
        risk = {a.item_id: a for a in analysis}
        ev_by_item: dict[str, list[Evidence]] = {}
        for e in evidence:
            ev_by_item.setdefault(e.item_id or "", []).append(e)
        ans_by_item: dict[str, list[Answer]] = {}
        for a in answers:
            ans_by_item.setdefault(a.item_id or "", []).append(a)

        def cite_item(i: Item) -> tuple[str, list[str]]:
            cites = [e.id for e in ev_by_item.get(i.id, [])[:2]] + [a.id for a in ans_by_item.get(i.id, [])]
            return ("".join(f" [{c}]" for c in cites), cites)

        sections: list[PackSection] = []

        high = [a for a in analysis if a.needs_interview]
        overview_cites: list[str] = []
        sections.append(
            PackSection(
                key="overview",
                heading="About the role",
                body=(
                    f"{person}{' (' + role + ')' if role else ''} owns {len(items)} things across "
                    f"{len({i.source for i in items})} tools. {len(high)} of them weren't written down anywhere, "
                    f"so the interview covered them in {len(answers)} answers."
                    + (f" {sum(i.needs_reassignment for i in items)} approvals or duties need a new owner."
                       if any(i.needs_reassignment for i in items) else "")
                ),
                citations=overview_cites,
            )
        )

        def bullets(kinds: tuple[str, ...]) -> tuple[str, list[str]]:
            lines, cites = [], []
            for i in sorted((i for i in items if i.kind in kinds), key=lambda x: -risk[x.id].risk_score if x.id in risk else 0):
                c_txt, c = cite_item(i)
                cites += c
                name = f"[{i.title}]({i.url})" if i.url else i.title
                ans = ans_by_item.get(i.id)
                best = max(ans, key=lambda a: len(a.answer)) if ans else None
                note = f": {_short(best.answer, 140)}" if best else (f": {_short(ev_by_item[i.id][0].text, 120)}" if ev_by_item.get(i.id) else "")
                flag = " **Needs a new owner.**" if i.needs_reassignment else ""
                share = f" ({round(i.ownership_share * 100)}% of the code changes)" if i.kind in ("service", "repo") and i.ownership_share and i.ownership_share >= 0.3 else ""
                lines.append(f"- **{name}**{share}{note}{flag}{c_txt}")
            return ("\n".join(lines), cites)

        for key, heading, kinds in [
            ("systems", "Systems they own", ("service", "repo")),
            ("recurring", "Regular tasks", ("recurring_task",)),
            ("approvals", "Approvals to hand over", ("approval", "oncall")),
            ("people", "People to know", ("customer", "contact")),
            ("open_work", "Work in progress", ("ticket_queue", "ticket")),
        ]:
            body, cites = bullets(kinds)
            if body:
                sections.append(PackSection(key=key, heading=heading, body=body, citations=cites))

        lm_lines, lm_cites = [], []
        for a in answers:
            if len(a.answer.split()) < 6:
                continue  # too short to be a useful landmine; it is still in the interview record
            it = by_id.get(a.item_id or "")
            title = it.title if it else "General"
            lm_lines.append(f"- **{title}:** {_short(a.answer, 260)} [{a.id}]")
            lm_cites.append(a.id)
        if lm_lines:
            sections.append(
                PackSection(key="landmines", heading="What goes wrong and how to fix it", body="\n".join(lm_lines), citations=lm_cites)
            )

        tool = {"github": "GitHub", "jira": "Jira", "confluence": "Confluence", "google-drive": "Google Drive",
                "drive": "Google Drive", "calendar": "Calendar", "pagerduty": "PagerDuty", "workday": "Workday"}
        link_lines = [f"- [{i.title}]({i.url}), in {tool.get(i.source, i.source)}" for i in items if i.url]
        if link_lines:
            sections.append(PackSection(key="links", heading="Links", body="\n".join(link_lines), citations=[]))

        return KnowledgePack(
            title=f"Handover notes: {person}",
            summary=f"What {person.split()[0]}'s replacement needs to keep things running. Built from {len(evidence)} work records and {len(answers)} interview answers.",
            sections=sections,
        )

    def answer(self, question: str, chunks: list[Chunk]) -> tuple[str, list[str]]:
        from .retrieval import tokenize

        q = set(tokenize(question))
        parts, cites = [], []
        # Prefer what the person said, then work evidence, then pack prose; never quote the link list.
        rank = {"I": 0, "E": 1, "S": 2}
        usable = [c for c in chunks if c.label != "Links"]
        ordered = sorted(usable[:6], key=lambda c: rank.get(c.id[0], 3))
        for c in ordered:
            # For interview chunks, quote what the person said, not the agent's question.
            raw = c.text.split(" A: ", 1)[-1] if c.id.startswith("I") else c.text
            text = _plain(raw)
            # Pick the single most relevant line/sentence of the chunk, not the whole section.
            pieces = [p.strip(" -") for p in re.split(r"\n|(?<=[.!?])\s+", text) if len(p.strip()) > 20]
            best = max(pieces or [text], key=lambda p: len(q & set(tokenize(p))))
            if c.id.startswith("I") and len(q & set(tokenize(best))) == 0:
                best = text  # the chunk matched on its question; the answer itself is the useful part
            elif len(q & set(tokenize(best))) == 0:
                continue
            if best in parts:
                continue
            parts.append(_short(best, 260))
            cites.append(c.id)
            if len(parts) == 2 or c.id.startswith("I"):
                break  # one direct answer from the person beats two loosely related snippets
        if not parts:
            return ("", [])
        return (" ".join(f"{p} [{cid}]" for p, cid in zip(parts, cites)), cites)


# --------------------------------------------------------------------------- real


class _Question(BaseModel):
    question: str = Field(description="One specific question, max 45 words, grounded in the evidence.")


class _Followup(BaseModel):
    needed: bool = Field(description="True only if the answer is too vague to act on.")
    question: str = Field("", description="The follow-up question if needed, max 35 words.")


class _Answer(BaseModel):
    answer: str = Field(description="Answer in 2-6 sentences, citing sources inline like [S2] or [I1].")
    citations: list[str] = Field(description="Ids of the sources used.")
    covered: bool = Field(description="False if the sources do not answer the question.")


class ChatLlm:
    """Wraps a LangChain chat model; every call uses structured output."""

    def __init__(self, model, name: str):
        self.model = model
        self.name = name

    def _ask(self, schema, system: str, user: str):
        return self.model.with_structured_output(schema).invoke([("system", system), ("user", user)])

    def question(self, person, item, evidence, answered) -> str:
        ev = "\n".join(f"[{e.id}] ({e.source}) {_short(e.text, 400)}" for e in evidence[:6]) or "No evidence."
        prev = "\n".join(f"- {a.question} -> {_short(a.answer, 200)}" for a in answered[-4:]) or "None yet."
        out = self._ask(
            _Question,
            "You interview an employee who is leaving, to capture knowledge their successor will need. "
            "Ask ONE concrete question about tacit knowledge that the evidence does NOT already explain: failure modes, "
            "first checks, hidden dependencies, people to call, timing. Be warm and brief. Use their first name once.",
            f"Employee: {person}\nItem: {item.title} (kind={item.kind}, source={item.source}, activity={item.activity}, has_docs={item.has_docs})\n"
            f"Evidence:\n{ev}\n\nAlready asked:\n{prev}",
        )
        return out.question

    def followup(self, item, question, answer) -> Optional[str]:
        out = self._ask(
            _Followup,
            "Decide if an interview answer is specific enough for a successor to act on (names, steps, commands, links). "
            "If not, write one short follow-up question. Never ask more than needed.",
            f"Item: {item.title}\nQuestion: {question}\nAnswer: {answer}",
        )
        return out.question if out.needed and out.question else None

    def draft_pack(self, person, role, items, analysis, answers, evidence) -> KnowledgePack:
        payload = {
            "person": person,
            "role": role,
            "items": [i.model_dump(by_alias=True) for i in items],
            "risk": [a.model_dump(by_alias=True) for a in analysis],
            "interview_answers": [a.model_dump(by_alias=True) for a in answers],
            "evidence": [{"id": e.id, "itemId": e.item_id, "source": e.source, "text": _short(e.text, 600)} for e in evidence[:60]],
        }
        keys = ", ".join(f"{k} ('{h}')" for k, h in PACK_SECTIONS)
        pack: KnowledgePack = self._ask(
            KnowledgePack,
            "You write a handover pack for the successor of a departing employee. Use ONLY the provided data; never invent "
            "names, numbers or steps. Every bullet that states a fact must cite its source id inline, like [E4] or [I2]. "
            f"Write exactly these sections, in order, with these keys and headings: {keys}. Bodies are concise markdown "
            "bullets. Put interview insights about failures and workarounds in 'landmines'. In 'approvals', list every item "
            "with needsReassignment=true: what is approved, the decision criteria from the interview, and that it needs "
            "a new owner before the last day. Title: 'Handover notes: <name>'.",
            json.dumps(payload, ensure_ascii=False),
        )
        valid = {e.id for e in evidence} | {a.id for a in answers}
        for s in pack.sections:
            found = set(re.findall(r"\[([EI]\d+)\]", s.body))
            s.citations = sorted((set(s.citations) | found) & valid)
        return pack

    def skills(self, person, role, items, evidence, answers) -> BackfillProfile:
        payload = {
            "person": person,
            "role": role,
            "items": [i.model_dump(by_alias=True) for i in items],
            "evidence": [{"id": e.id, "itemId": e.item_id, "text": _short(e.text, 500)} for e in evidence[:80]],
            "interview_answers": [a.model_dump(by_alias=True) for a in answers],
        }
        profile: BackfillProfile = self._ask(
            BackfillProfile,
            "You help a manager backfill a role after someone leaves. From what the person actually owned and did "
            "(repos and their languages, services, documents, tickets, approvals, on-call, recurring duties, interview "
            "answers), list 6 to 12 skills the replacement needs. Use only the data; cite evidence or answer ids for "
            "each skill. Mark 'must' only where the role fails without it. Categories: Technical, Domain, "
            "Responsibility (approvals, releases, on-call), People. Also suggest a job title and a 2-3 sentence "
            "summary of the role as it is really done, not a generic job ad.",
            json.dumps(payload, ensure_ascii=False),
        )
        valid = {e.id for e in evidence} | {a.id for a in answers}
        for sk in profile.skills:
            sk.citations = [c for c in sk.citations if c in valid]
        return profile

    def onboarding(self, person, role, manager, items, evidence, answers, attachments, skills) -> OnboardingKit:
        payload = {
            "previous_person": person, "role": role, "manager": manager,
            "items": [i.model_dump(by_alias=True) for i in items],
            "evidence": [{"id": e.id, "itemId": e.item_id, "text": _short(e.text, 400)} for e in evidence[:60]],
            "interview_answers": [a.model_dump(by_alias=True) for a in answers],
            "recordings_and_links": [a.model_dump(by_alias=True) for a in attachments],
            "backfill_skills": [s.model_dump() for s in skills],
        }
        kit: OnboardingKit = self._ask(
            OnboardingKit,
            "Write a 90-day onboarding kit for the person who replaces a departing employee. It must be specific to "
            "this role, not generic company onboarding: name the actual systems, duties, approvals, people and "
            "recordings from the data. Phases: 'Week 1', 'Weeks 2 to 4', 'Days 31 to 60', 'Days 61 to 90'. Task types: "
            "read, watch (for recordings and video links), meet, shadow, do, learn. Put recurring duties where their "
            "real timing falls, include taking over every item with needsReassignment, add learning tasks for "
            "must-have skills, and in the last phase ask them to write missing runbooks. People to meet: names that "
            "appear in the answers or contacts, with why. Cite evidence or answer ids. Use only the data.",
            json.dumps(payload, ensure_ascii=False),
        )
        valid = {e.id for e in evidence} | {a.id for a in answers}
        for ph in kit.phases:
            for t in ph.tasks:
                t.citations = [c for c in t.citations if c in valid]
        return kit

    def answer(self, question, chunks) -> tuple[str, list[str]]:
        ctx = "\n\n".join(f"[{c.id}] {c.label}: {_short(c.text, 900)}" for c in chunks)
        out: _Answer = self._ask(
            _Answer,
            "You answer a successor's question using ONLY the handover sources below. Cite ids inline. If the sources do "
            "not contain the answer, set covered=false and say it is not covered in the handover.",
            f"Sources:\n{ctx}\n\nQuestion: {question}",
        )
        ids = {c.id for c in chunks}
        cites = [c for c in out.citations if c in ids]
        if not out.covered:
            return ("", [])
        return out.answer, cites


class FallbackLlm:
    """Tries the real model; on any error (network, quota, bad output) uses the mock so a live demo never dies."""

    def __init__(self, primary: Llm):
        self.primary = primary
        self.backup = MockLlm()
        self.name = primary.name

    def _try(self, method: str, *args):
        try:
            return getattr(self.primary, method)(*args)
        except Exception as exc:
            log.warning("LLM %s failed (%s); using mock output", method, exc)
            return getattr(self.backup, method)(*args)

    def question(self, *args):
        return self._try("question", *args)

    def followup(self, *args):
        return self._try("followup", *args)

    def draft_pack(self, *args):
        return self._try("draft_pack", *args)

    def answer(self, *args):
        return self._try("answer", *args)

    def skills(self, *args):
        return self._try("skills", *args)

    def onboarding(self, *args):
        return self._try("onboarding", *args)


_cached: Optional[Llm] = None


def get_llm() -> Llm:
    """Provider from LLM_PROVIDER (anthropic | openai | mock); auto-detects from API keys when unset."""
    global _cached
    if _cached is not None:
        return _cached
    provider = os.getenv("LLM_PROVIDER", "").lower()
    if not provider:
        provider = "anthropic" if os.getenv("ANTHROPIC_API_KEY") else "openai" if os.getenv("OPENAI_API_KEY") else "mock"
    try:
        if provider == "anthropic":
            from langchain_anthropic import ChatAnthropic

            model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5")
            _cached = ChatLlm(ChatAnthropic(model=model, temperature=0.2, max_tokens=4096), f"anthropic:{model}")
        elif provider == "openai":
            from langchain_openai import ChatOpenAI

            model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
            # OPENAI_BASE_URL lets you point at Azure/OpenAI-compatible internal gateways.
            _cached = ChatLlm(ChatOpenAI(model=model, temperature=0.2, base_url=os.getenv("OPENAI_BASE_URL") or None), f"openai:{model}")
        else:
            _cached = MockLlm()
    except Exception as exc:  # missing key, bad config → still demoable
        log.warning("Falling back to mock LLM: %s", exc)
        _cached = MockLlm()
    if not isinstance(_cached, MockLlm):
        _cached = FallbackLlm(_cached)
    log.info("LLM provider: %s", _cached.name)
    return _cached


def set_llm(llm: Llm) -> None:
    """Used by tests."""
    global _cached
    _cached = llm
