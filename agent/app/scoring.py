"""Deterministic risk scoring.

Risk answers one question: "if this person left tomorrow, how likely is it that
their successor gets stuck on this item?" We keep it rule-based (not LLM-based)
so the score is explainable in the UI and stable between runs.
"""
from __future__ import annotations

from .models import Item, ItemAnalysis

# How much each kind of item tends to hurt when knowledge about it is lost.
KIND_WEIGHT = {
    "recurring_task": 0.30,
    "approval": 0.30,
    "oncall": 0.25,
    "service": 0.25,
    "customer": 0.25,
    "repo": 0.15,
    "ticket_queue": 0.15,
    "ticket": 0.05,
    "doc": 0.0,
    "contact": 0.10,
    "other": 0.05,
}

INTERVIEW_THRESHOLD = 0.5


def score_item(item: Item) -> ItemAnalysis:
    reasons: list[str] = []
    score = KIND_WEIGHT.get(item.kind, 0.05)

    if not item.has_docs and item.kind != "doc":
        score += 0.35
        reasons.append("no runbook or docs found")
    else:
        reasons.append("documented")

    # Activity: saturate at 30 events in 90 days.
    activity_part = min(item.activity, 30) / 30 * 0.3
    score += activity_part
    if item.activity >= 10:
        reasons.append(f"{item.activity} recent changes")
    elif item.activity > 0:
        reasons.append(f"{item.activity} recent changes (low)")

    if item.last_activity_days is not None and item.last_activity_days <= 14:
        score += 0.05
        reasons.append("touched in the last 2 weeks")

    if item.ownership_share is not None:
        score += min(item.ownership_share, 1.0) * 0.2
        if item.ownership_share >= 0.5:
            reasons.append(f"owns {round(item.ownership_share * 100)}% of changes")
        else:
            reasons.append(f"{round(item.ownership_share * 100)}% of changes")

    if item.kind == "recurring_task":
        reasons.append("recurring duty, easy to forget")
    if item.needs_reassignment:
        score += 0.1
        reasons.append("approval or duty must be reassigned")

    score = round(min(score, 1.0), 2)
    return ItemAnalysis(
        item_id=item.id,
        risk_score=score,
        reason="; ".join(reasons),
        needs_interview=score >= INTERVIEW_THRESHOLD,
    )


def analyze(items: list[Item]) -> list[ItemAnalysis]:
    return sorted((score_item(i) for i in items), key=lambda a: a.risk_score, reverse=True)
