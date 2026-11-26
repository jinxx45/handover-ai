"""Backfill profile: the skills the next person in this role needs, inferred from what the leaver owned.

The mock path is a transparent keyword map over items, evidence and interview answers, so every skill
it proposes points at the text that triggered it. The LLM path (llm.py) does the same with judgement.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .models import Answer, BackfillProfile, Evidence, Item, Skill


@dataclass
class _Rule:
    name: str
    category: str
    pattern: str
    why: str
    kinds: tuple[str, ...] = ()  # also triggered by owning an item of these kinds
    hits: list[str] = field(default_factory=list)
    weight: float = 0.0


def _rules() -> list[_Rule]:
    return [
        _Rule("Angular and TypeScript", "Technical", r"\bangular\b|typescript|\bscss\b", "Builds and fixes the Angular web app"),
        _Rule("Workday reports and business processes", "Technical", r"workday report|custom workday|business process|in workday", "Builds Workday reports and runs approvals in Workday"),
        _Rule("Workday integrations", "Technical", r"integration", "Releases and supports Workday integrations"),
        _Rule("Kafka and event-driven services", "Technical", r"\bkafka\b|dead-letter|\bdlq\b|consumer|topic", "Runs services that consume and replay Kafka events"),
        _Rule("Kotlin / JVM services", "Technical", r"\bkotlin\b|\.kt\b|\bjvm\b|\bjava\b|spring", "Maintains JVM service code"),
        _Rule("Python scripting", "Technical", r"\bpython\b|\.py\b", "Owns Python scripts that run business processes"),
        _Rule("AWS (S3) and cloud data", "Technical", r"\bs3\b|\baws\b|s3://", "Reads and writes data in cloud storage"),
        _Rule("SQL and relational data", "Technical", r"\bsql\b|postgres|ledger|query", "Reconciles and queries business data"),
        _Rule("On-call support", "Technical", r"on-call|incident|escalation|paged|pagerduty", "Responds to alerts on the on-call rotation", ("oncall",)),
        _Rule("Code review", "Technical", r"codeowners|required reviewer|pull request", "Is a required reviewer, so changes wait on their approval"),
        _Rule("Running releases", "Responsibility", r"release|go/no-go|deploy|rollout", "Plans and runs releases"),
        _Rule("Release sign-off", "Responsibility", r"change request|\bcab\b|rollback", "Approves production changes and checks their rollback plans"),
        _Rule("Production access approvals", "Responsibility", r"production access|break-glass|access request", "Approves who gets production access and for how long"),
        _Rule("Approvals", "Responsibility", r"approv", "Approves requests that wait on them", ("approval",)),
        _Rule("Regular scheduled tasks", "Responsibility", r"quarter|monthly|weekly|last business day|recurring", "Does tasks on a schedule that others depend on", ("recurring_task",)),
        _Rule("Billing and payments", "Domain", r"billing|invoice|payment|payments", "Understands how invoices and payments flow"),
        _Rule("Finance reconciliation", "Domain", r"reconcil|ledger|fx\b|revenue", "Reconciles revenue against the ledger with Finance"),
        _Rule("Fraud and transaction risk", "Domain", r"fraud|transaction limit|limits", "Owns rules that limit risky transactions"),
        _Rule("Order management", "Domain", r"\boms\b|order list|order search|orders?\b", "Knows how orders move through the order management system"),
        _Rule("Payroll", "Domain", r"payroll|pay day|\bpay\b", "Knows how payroll runs and what to check before pay day"),
        _Rule("Customer relationships", "People", r"renewal|account plan|customer success", "Keeps commitments with named customers", ("customer",)),
        _Rule("Working with other teams", "People", r"finance lead|controller|notice before|recon sync|stakeholder|go/no-go|operations lead|vendor|check-in", "Agrees priorities and changes with other teams", ("contact",)),
        _Rule("People management", "People", r"direct reports|time off|headcount|1:1|team okrs", "Manages a team and approves their requests"),
    ]


def _short(text: str, n: int = 160) -> str:
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1].rsplit(" ", 1)[0] + "…"


def mock_profile(person: str, role: str | None, items: list[Item], evidence: list[Evidence], answers: list[Answer]) -> BackfillProfile:
    rules = _rules()
    # How much each owned item matters to the role: activity, and whether it dies with the account.
    weight = {
        i.id: 0.6 + min(i.activity, 40) / 40 + (0.4 if i.needs_reassignment else 0) - (0.3 if i.has_docs else 0)
        + (i.ownership_share or 0)  # code they mostly wrote themselves needs the same skills in the next person
        for i in items
    }
    sources: list[tuple[str, str, str]] = []  # (citation id, item id, text)
    sources += [(e.id, e.item_id or "", e.text) for e in evidence]
    sources += [(a.id, a.item_id or "", a.answer) for a in answers]
    sources += [("", i.id, i.title) for i in items]

    scored = []
    for r in rules:
        rx = re.compile(r.pattern, re.I)
        item_hits: set[str] = {i.id for i in items if i.kind in r.kinds}
        answered = 0
        for cid, iid, text in sources:
            if rx.search(text):
                if iid:
                    item_hits.add(iid)
                if cid and cid not in r.hits:
                    r.hits.append(cid)
                if cid.startswith("I"):
                    answered += 1
        # A skill matters when several owned things need it, not when a word appears often.
        r.weight = sum(weight.get(i, 0.5) for i in item_hits) + 0.25 * answered
        if r.weight > 0:
            scored.append((r, len(item_hits)))

    scored.sort(key=lambda x: x[0].weight, reverse=True)
    found = scored[:12]
    if not found:
        return BackfillProfile(title=role or "Backfill", summary="Not enough evidence to infer skills yet.", skills=[])
    top = found[0][0].weight
    skills = []
    for rank, (r, n_items) in enumerate(found):
        must = rank < 7 and r.weight >= max(1.4, top * 0.2)
        skills.append(Skill(name=r.name, category=r.category, priority="must" if must else "nice",
                            why=r.why + ".", citations=r.hits[:4]))
    first = person.split()[0]
    musts = [s.name[0].lower() + s.name[1:] if not s.name.split()[0].isupper() and s.name.split()[0] not in ("Kafka", "Python", "Kotlin", "SQL", "AWS", "Angular", "Workday") else s.name for s in skills if s.priority == "must"][:3]
    summary = (
        f"Takes over {first}'s {len(items)} systems, tasks and approvals. "
        f"The most important skills are {', '.join(musts[:-1]) + ' and ' + musts[-1] if len(musts) > 1 else ''.join(musts)}."
    )
    return BackfillProfile(title=role or "Backfill", summary=summary, skills=skills)
