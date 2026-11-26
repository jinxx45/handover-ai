"""Onboarding kit for the person who backfills a role.

A generic kit tells every new hire the same things. This one is built from what the previous person
actually owned: their riskiest systems, recurring duties with real timing, approvals they will inherit,
the people the leaver said to talk to, and the walkthrough videos recorded during the interview.
"""
from __future__ import annotations

import re

from .models import (
    Answer, Attachment, Evidence, Item, KitPerson, KitPhase, KitTask, OnboardingKit, Skill,
)

_NAME_AFTER = re.compile(r"\b(?:tell|email|call|ask|ping|with|to|by)\s+([A-Z][a-z]{2,})\b")
_NAME_BEFORE = re.compile(
    r"\b([A-Z][a-z]{2,})(?=\s+(?:should|can|owns|takes|expects|from|on platform|in finance|in risk|chairs|runs)\b)"
)
_NOT_NAMES = {
    "The", "This", "That", "When", "Then", "Check", "Run", "Most", "Every", "Level", "Time", "Expenses", "Limits",
    "Go", "Prod", "Transfer", "Nothing", "Finance", "Kafka", "Workday", "Jira", "Slack", "Confluence", "Angular",
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "January", "February", "March", "December", "Payroll",
    "Payments", "Our", "Their", "Only", "Also", "Just", "Make", "Keep", "Order", "Orders", "Release", "Checkout",
    "Production", "Staging", "Search", "GitHub", "PagerDuty",
}


_ATTACHED = re.compile(r"\s*\[(?:Link|Recording):[^\]]*\]")


def _short(text: str, n: int = 180) -> str:
    text = " ".join(_ATTACHED.sub("", text).split())
    return text if len(text) <= n else text[: n - 1].rsplit(" ", 1)[0] + "…"


def _sentence_with(name: str, text: str) -> str:
    for s in re.split(r"(?<=[.;!?])\s+", text):
        if name in s:
            return _short(s.strip(" ;"), 150)
    return _short(text, 150)


def people_to_meet(manager: str | None, items: list[Item], answers: list[Answer]) -> list[KitPerson]:
    found: dict[str, KitPerson] = {}
    for a in answers:
        for rx in (_NAME_AFTER, _NAME_BEFORE):
            for m in rx.finditer(a.answer):
                name = m.group(1)
                if name in _NOT_NAMES:
                    continue
                if name not in found:
                    found[name] = KitPerson(name=name, why=_sentence_with(name, a.answer), citations=[a.id])
                elif a.id not in found[name].citations:
                    found[name].citations.append(a.id)
    for i in items:
        if i.kind == "contact":
            name = i.title.split(" (")[0]
            first = name.split()[0]
            if first in found:
                found[first].name = name
            else:
                found[name] = KitPerson(name=name, why=f"Works closely with this role.")
        if i.successor and i.successor.split()[0] not in found and i.successor not in found:
            found[i.successor] = KitPerson(name=i.successor, why=f"Now owns {i.title}.")
    people = list(found.values())
    if manager:
        people.insert(0, KitPerson(name=manager, why="Your manager. Agree what you own by day 30."))
    return people[:8]


def mock_kit(person: str, role: str | None, manager: str | None, items: list[Item], evidence: list[Evidence],
             answers: list[Answer], attachments: list[Attachment], skills: list[Skill]) -> OnboardingKit:
    first = person.split()[0]
    by_item_answers: dict[str, list[Answer]] = {}
    for a in answers:
        by_item_answers.setdefault(a.item_id or "", []).append(a)

    def best_answer(item_id: str) -> Answer | None:
        ans = by_item_answers.get(item_id)
        return max(ans, key=lambda a: len(a.answer)) if ans else None

    def risk(i: Item) -> float:
        return min(i.activity, 30) / 30 + (0.5 if not i.has_docs else 0) + (0.4 if i.needs_reassignment else 0) + (i.ownership_share or 0)

    ranked = sorted(items, key=risk, reverse=True)
    people = people_to_meet(manager, items, answers)

    # ---- week 1: context
    week1: list[KitTask] = [
        KitTask(title=f"Read {first}'s handover notes", detail="Start with \"What goes wrong and how to fix it\".", type="read", link="#pack"),
    ]
    for att in attachments:
        video_host = any(h in att.url for h in ("loom.com", "youtube", "youtu.be", "vimeo"))
        looks_like_video = re.search(r"video|recording|walkthrough|demo", att.title, re.I)
        if att.kind in ("video", "audio") or video_host or looks_like_video:
            week1.append(KitTask(title=f"Watch: {att.title}", detail=f"Recorded by {first}.", type="watch",
                                 link=att.url, item_id=att.item_id, citations=[att.turn_label] if att.turn_label else []))
        else:
            week1.append(KitTask(title=f"Read: {att.title}", detail=f"Shared by {first}.", type="read",
                                 link=att.url, item_id=att.item_id, citations=[att.turn_label] if att.turn_label else []))
    for i in [i for i in items if i.kind == "doc" and i.url][:2]:
        week1.append(KitTask(title=f"Skim {i.title}", type="read", link=i.url, item_id=i.id))
    systems = [i for i in ranked if i.kind in ("repo", "service")][:4]
    if systems:
        week1.append(KitTask(title="Request access", detail="To " + ", ".join(s.title for s in systems) + ".", type="do"))
    for p in people[:3]:
        week1.append(KitTask(title=f"Meet {p.name}", detail=p.why, type="meet", citations=p.citations))

    # ---- weeks 2-4: shadow and run the risky work
    weeks2: list[KitTask] = []
    for i in [i for i in ranked if i.kind not in ("doc", "contact")][:5]:
        a = best_answer(i.id)
        verb = "Run" if i.kind == "recurring_task" else "Shadow" if i.kind in ("service", "repo", "oncall") else "Learn"
        detail = _short(a.answer, 200) if a else "Not written down yet. Ask your manager."
        weeks2.append(KitTask(title=f"{verb}: {i.title}", detail=detail, type={"Run": "do", "Shadow": "shadow"}.get(verb, "learn"),
                              item_id=i.id, link=i.url, citations=[a.id] if a else []))

    # ---- days 31-60: own it
    own: list[KitTask] = []
    for i in [i for i in items if i.needs_reassignment and not i.successor][:5]:
        a = best_answer(i.id)
        how = f" How {first} did it: {_short(a.answer, 150)}" if a else ""
        own.append(KitTask(title=f"Take over: {i.title}", detail=("Agree the handover with your manager." + how).strip(),
                           type="do", item_id=i.id, citations=[a.id] if a else []))
    for sk in [s for s in skills if s.priority == "must"][:4]:
        own.append(KitTask(title=f"Learn: {sk.name}", detail=sk.why, type="learn", citations=sk.citations[:2]))

    # ---- days 61-90: leave it better than you found it
    better: list[KitTask] = []
    for i in [i for i in ranked if not i.has_docs and i.kind in ("service", "repo", "recurring_task", "oncall")][:3]:
        a = best_answer(i.id)
        better.append(KitTask(title=f"Write the runbook for {i.title}", detail="None exists yet. Start from the interview answer." if a else "None exists yet.",
                              type="do", item_id=i.id, citations=[a.id] if a else []))

    phases = [
        KitPhase(name="Week 1", goal="Learn the basics and meet the people you will work with.", tasks=week1),
        KitPhase(name="Weeks 2 to 4", goal=f"Learn {first}'s systems and tasks, most important first.", tasks=weeks2),
        KitPhase(name="Days 31 to 60", goal="Take over approvals and tasks, and learn the skills you are missing.", tasks=own),
        KitPhase(name="Days 61 to 90", goal="Write down what is still only in people's heads.", tasks=better),
    ]
    phases = [p for p in phases if p.tasks]
    return OnboardingKit(
        title=f"Your first 90 days as {role or 'the new hire'}",
        intro=(f"Built from the {len(items)} things {first} owned and {len(answers)} interview answers"
               + (f", plus {len(attachments)} recordings or links" if attachments else "")
               + ". Use it alongside the standard company onboarding. This covers what only this role needs."),
        phases=phases,
        people=people,
    )
