# handover.ai architecture

Six views of the system. Each one has a PNG for slides and Mermaid source that GitHub Enterprise renders inline. The system overview is hand-drawn SVG.

1. [System architecture](#1-system-architecture)
2. [End-to-end flow](#2-end-to-end-flow)
3. [Agent graph](#3-agent-graph-langgraph)
4. [What each connector finds](#4-what-each-connector-finds)
5. [Case lifecycle](#5-case-lifecycle)
6. [Data model](#6-data-model)

## 1. System architecture

![System architecture](diagrams/01-system.png)

- **Case service** (Java, Spring Boot) is the system of record. It owns cases, items, evidence, answers, packs and approvals, and it is the only thing the UI and HR systems talk to.
- **Interview agent** (Python, LangGraph) is stateless toward the business. It gets items and evidence, keeps its own interview checkpoints, and returns questions, a pack or a cited answer.
- **Connectors** are plugins behind one interface, `discover(person) → items + evidence`. Adding a tool never touches the core.
- **HRIS-agnostic**: Workday is one producer of the `person.departed` CloudEvent; any HR system or a form can send the same shape.

## 2. End-to-end flow

![End-to-end flow](diagrams/02-sequence.png)

```mermaid
sequenceDiagram
  autonumber
  participant WD as Workday / HRIS
  participant BE as Case service (Spring Boot)
  participant CN as Connectors
  participant AG as Interview agent (LangGraph)
  actor L as Leaver
  actor M as Manager
  actor S as Successor

  WD->>BE: POST /v1/events person.departed
  BE->>BE: Create case (idempotent on event id)
  BE->>CN: discover(person) on every enabled connector
  CN-->>BE: Owned items + evidence (E1, E2, ...)
  BE->>AG: POST /runs {items, evidence}
  AG->>AG: Score risk, plan interview (riskiest first)
  AG-->>BE: First question (graph paused)
  loop Until risky items are covered
    L->>BE: Answer in the web app
    BE->>AG: POST /runs/{id}/answer
    AG-->>BE: Follow-up or next question
  end
  AG-->>BE: Drafted pack: every fact cites evidence or an answer
  M->>BE: Assign new owners for approvals and duties
  M->>BE: Approve and publish
  S->>BE: Ask a question
  BE->>AG: POST /ask {pack, evidence, answers}
  AG-->>BE: Cited answer, or "not covered"
  BE-->>S: Answer with sources
```

## 3. Agent graph (LangGraph)

![Agent graph](diagrams/03-agent-graph.png)

`wait_for_answer` calls `interrupt()`: the graph checkpoints and returns, so an interview can pause for days and resume where it left off. The question is written in its own node, so resuming never re-runs that LLM call. Risk scoring is rule-based, not LLM-based, so every score can be explained in the UI.

| Signal | Effect on risk |
| --- | --- |
| Item kind | recurring duty / approval +0.30, service / customer / on-call +0.25, repo / ticket queue +0.15 |
| No runbook or docs | +0.35 |
| Activity (last 90–180 days) | up to +0.30 |
| Ownership share | up to +0.20 (e.g. owns 61% of commits) |
| Touched in the last 2 weeks | +0.05 |
| Must be reassigned (approver, on-call, meeting owner, file owner) | +0.10 |

Items scoring 0.5 or more are interviewed, riskiest first, with at most 6 topics and one follow-up per topic when an answer is vague.

```mermaid
flowchart TD
  START(["START: items + evidence"]) --> A["analyze<br/>rule-based risk score per item"]
  A --> P["plan<br/>queue items with risk ≥ 0.5, riskiest first, max 6"]
  P --> R1{"Anything<br/>to ask?"}
  R1 -- yes --> Q["prepare_question<br/>LLM writes one question from the evidence"]
  R1 -- no --> D
  Q --> W[["wait_for_answer<br/>interrupt(): checkpoint and pause<br/>(hours or days)"]]
  W --> REC["record_answer<br/>save I#, maybe one follow-up if vague"]
  REC --> R2{"Follow-up,<br/>more items,<br/>or finished?"}
  R2 -- "follow-up / next item" --> Q
  R2 -- "queue empty or Finish pressed" --> D["draft_pack<br/>LLM writes 8 sections, citations checked against real ids"]
  D --> END(["END: pack"])

  classDef pause fill:#e5ecfd,stroke:#1d4ed8,color:#0c2a6b
  classDef llm fill:#efe8fc,stroke:#6d28d9,color:#3b1580
  class W pause
  class Q,D,REC llm
```

## 4. What each connector finds

![Connectors](diagrams/04-connectors.png)

Amber items are **rights or duties that stop working when the account closes**: approvals, required reviewers, on-call slots, meetings they organize, and files they own. They are flagged "must reassign", interviewed for decision criteria, and tracked until each has a new owner.

```mermaid
flowchart LR
  P(("Departing<br/>person"))
  P --> GH["GitHub / GHE"]
  P --> JI["Jira / JSM"]
  P --> CF["Confluence"]
  P --> GD["Google Drive"]
  P --> GC["Google Calendar"]
  P --> PD["PagerDuty"]

  GH --> G1["Repos by ownership share<br/>(their commits ÷ all commits, 180 days)"]
  GH --> G2["Sole-owner files<br/>(≥ 80% of a file's commits)"]
  GH --> G3["CODEOWNERS paths<br/>→ approval, must reassign"]
  JI --> J1["Open work per project"]
  JI --> J2["Approvals: pendingBy / approvedBy<br/>→ approval, must reassign"]
  CF --> C1["Pages they wrote or edited<br/>→ existing docs, agent context"]
  GD --> D1["Shared files they own<br/>→ transfer ownership"]
  GC --> K1["Recurring meetings they run<br/>→ recurring duty, must reassign"]
  PD --> O1["Escalation policies + incidents<br/>→ on-call, must reassign"]

  classDef must fill:#fdf0dc,stroke:#b45309,color:#5c2c04
  classDef know fill:#e3f2ef,stroke:#0f766e,color:#0b3b37
  class G3,J2,D1,K1,O1 must
  class G1,G2,J1,C1 know
```

## 5. Case lifecycle

![Case lifecycle](diagrams/05-lifecycle.png)

```mermaid
stateDiagram-v2
  [*] --> MAPPING: person.departed event
  MAPPING --> INTERVIEWING: agent has questions
  MAPPING --> REVIEW: nothing risky to ask
  MAPPING --> FAILED: agent unreachable
  FAILED --> INTERVIEWING: Retry
  INTERVIEWING --> INTERVIEWING: answer
  INTERVIEWING --> REVIEW: all covered or Finish
  REVIEW --> PUBLISHED: manager approves
  PUBLISHED --> PUBLISHED: successor asks
  PUBLISHED --> [*]
```

## 6. Data model

![Data model](diagrams/06-data-model.png)

```mermaid
erDiagram
  HANDOVER_CASE ||--o{ OWNED_ITEM : owns
  HANDOVER_CASE ||--o{ EVIDENCE_CHUNK : "has evidence"
  HANDOVER_CASE ||--o{ INTERVIEW_TURN : "has answers"
  HANDOVER_CASE ||--o{ PACK_QUESTION : "gets questions"
  OWNED_ITEM ||--o{ EVIDENCE_CHUNK : "backed by"
  OWNED_ITEM ||--o{ INTERVIEW_TURN : "explained by"

  HANDOVER_CASE {
    string id PK
    string eventId UK
    string personName
    date lastDay
    string status
    string agentRunId
    text packJson
    string approvedBy
  }
  OWNED_ITEM {
    string id PK
    string kind
    string title
    string source
    float ownershipShare
    bool needsReassignment
    float riskScore
    string coverage
    string successor
  }
  EVIDENCE_CHUNK {
    long id PK
    string label "E1, E2..."
    string source
    text text
  }
  INTERVIEW_TURN {
    long id PK
    string label "I1, I2..."
    text question
    text answer
  }
  PACK_QUESTION {
    long id PK
    text question
    text answer
    string citations
    bool covered
  }
```
