"""Request/response models shared by the API, the graph and the LLM layer."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

ItemKind = Literal[
    "repo", "service", "doc", "ticket_queue", "ticket", "customer", "recurring_task", "contact",
    "approval", "oncall", "other"
]


class Item(BaseModel):
    """Something the departing person owns, discovered by a backend connector."""

    id: str
    kind: ItemKind = "other"
    title: str
    source: str = "unknown"
    url: Optional[str] = None
    activity: int = Field(0, description="Recent activity count (commits, ticket updates, edits) in the last 90 days")
    has_docs: bool = Field(False, alias="hasDocs")
    last_activity_days: Optional[int] = Field(None, alias="lastActivityDays")
    ownership_share: Optional[float] = Field(
        None, alias="ownershipShare", description="Person's share of all changes to this item (0-1), if known"
    )
    needs_reassignment: bool = Field(
        False, alias="needsReassignment", description="A right or duty (approver, on-call) that must get a new owner"
    )
    successor: Optional[str] = None

    model_config = {"populate_by_name": True}


class Evidence(BaseModel):
    """A piece of text pulled from a work tool, tied to an item. ids look like E1, E2…"""

    id: str
    item_id: Optional[str] = Field(None, alias="itemId")
    source: str = "unknown"
    url: Optional[str] = None
    text: str

    model_config = {"populate_by_name": True}


class Answer(BaseModel):
    """One interview answer. ids look like I1, I2…"""

    id: str
    item_id: Optional[str] = Field(None, alias="itemId")
    question: str
    answer: str

    model_config = {"populate_by_name": True}


class StartRun(BaseModel):
    case_id: str = Field(alias="caseId")
    person_name: str = Field(alias="personName")
    role: Optional[str] = None
    items: list[Item]
    evidence: list[Evidence] = []

    model_config = {"populate_by_name": True}


class AnswerRequest(BaseModel):
    answer: str


class ItemAnalysis(BaseModel):
    item_id: str = Field(serialization_alias="itemId")
    risk_score: float = Field(serialization_alias="riskScore")
    reason: str
    needs_interview: bool = Field(serialization_alias="needsInterview")


class Question(BaseModel):
    item_id: str = Field(serialization_alias="itemId")
    item_title: str = Field(serialization_alias="itemTitle")
    question: str
    is_followup: bool = Field(False, serialization_alias="isFollowup")
    remaining: int = 0


class PackSection(BaseModel):
    key: str
    heading: str
    body: str = Field(description="Markdown body. Cite sources inline like [E3] or [I2].")
    citations: list[str] = []


class KnowledgePack(BaseModel):
    title: str
    summary: str
    sections: list[PackSection]


class RunResponse(BaseModel):
    run_id: str = Field(serialization_alias="runId")
    status: Literal["INTERVIEWING", "DRAFTED"]
    analysis: list[ItemAnalysis] = []
    question: Optional[Question] = None
    answers: list[Answer] = []
    pack: Optional[KnowledgePack] = None


class UpdateItems(BaseModel):
    """Manual corrections to the ownership map while a run is in progress."""

    add: list[Item] = []
    evidence: list[Evidence] = []
    remove: list[str] = []


class SkillsRequest(BaseModel):
    person_name: str = Field(alias="personName")
    role: Optional[str] = None
    items: list[Item]
    evidence: list[Evidence] = []
    answers: list[Answer] = []

    model_config = {"populate_by_name": True}


class Skill(BaseModel):
    name: str = Field(description="Short skill name, e.g. 'Kafka operations' or 'Change approval (CAB)'")
    category: Literal["Technical", "Domain", "Responsibility", "People"]
    priority: Literal["must", "nice"] = Field(description="must = the role fails without it; nice = helps")
    why: str = Field(description="One sentence grounded in the evidence, saying where the role uses it")
    citations: list[str] = Field(default_factory=list, description="Evidence or answer ids, like E3 or I2")


class BackfillProfile(BaseModel):
    title: str = Field(description="Suggested job title for the backfill")
    summary: str = Field(description="Two or three sentences describing the role as it is actually done")
    skills: list[Skill]


class Attachment(BaseModel):
    """A video, recording or link added to an interview answer or an item."""

    id: str
    item_id: Optional[str] = Field(None, alias="itemId")
    turn_label: Optional[str] = Field(None, alias="turnLabel")
    kind: Literal["link", "video", "audio"] = "link"
    url: str
    title: str

    model_config = {"populate_by_name": True}


class OnboardingRequest(BaseModel):
    person_name: str = Field(alias="personName")
    role: Optional[str] = None
    manager_name: Optional[str] = Field(None, alias="managerName")
    items: list[Item]
    evidence: list[Evidence] = []
    answers: list[Answer] = []
    attachments: list[Attachment] = []
    skills: Optional[list[Skill]] = None

    model_config = {"populate_by_name": True}


class KitTask(BaseModel):
    title: str
    detail: str = ""
    type: Literal["read", "watch", "meet", "shadow", "do", "learn"]
    item_id: Optional[str] = Field(None, serialization_alias="itemId")
    link: Optional[str] = None
    citations: list[str] = Field(default_factory=list)


class KitPhase(BaseModel):
    name: str
    goal: str
    tasks: list[KitTask]


class KitPerson(BaseModel):
    name: str
    why: str
    citations: list[str] = Field(default_factory=list)


class OnboardingKit(BaseModel):
    title: str
    intro: str
    phases: list[KitPhase]
    people: list[KitPerson]


class AskRequest(BaseModel):
    question: str
    pack: Optional[KnowledgePack] = None
    evidence: list[Evidence] = []
    answers: list[Answer] = []


class AskResponse(BaseModel):
    answer: str
    citations: list[str] = []
    covered: bool = True
