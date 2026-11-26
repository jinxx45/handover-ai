# handover.ai

**When someone leaves, their know-how shouldn't.** handover.ai turns a departing employee's notice period into a cited knowledge pack and an "ask the predecessor" assistant for their successor.

1. An HR system (Workday or any HRIS) sends a `person.departed` event.
2. Connectors map what the person really owns: repos where they hold most of the commits, files only they touch, approvals they sign, on-call slots, meetings they run, files they own.
3. A LangGraph agent scores risk and interviews the person **only** about what no document explains.
4. The agent drafts a pack where every fact cites its source (`E` = work evidence, `I` = interview answer).
5. Approvals and duties that die with the account (approver roles, required reviewers, on-call, meeting ownership, file ownership) are flagged **must reassign** until each has a new owner.
6. The leaver reviews, the manager approves, and the successor asks questions with cited answers.

Architecture diagrams: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
ui/        React + Vite + TypeScript         :5173 dev  /  :3000 docker
backend/   Java 21, Spring Boot 3, JPA        :8080   cases, connectors, orchestration
agent/     Python, FastAPI, LangGraph         :8000   risk scoring, interview graph, pack, Q&A
```

```
Workday / HRIS ──event──▶ backend ──▶ connectors (GitHub, Jira, demo fixtures)
                             │
                             ├──▶ agent: analyze → plan → [question → wait → record]* → draft pack
                             │
         ui ◀──── /v1 ───────┘          (Postgres stores cases, items, evidence, turns, packs)
```

## How the map is built: automatic first, then people

1. **Automatic.** The resignation event triggers every connected tool (see the Connections page). Each returns what the person owns, with evidence.
2. **The person leaving checks it.** On "What they own" they remove anything that isn't theirs (**Not Priya's**) and add what tools can't see (**Add something**): a promise to a customer, a task done from memory, an informal approval. Each added item says who added it.
3. **The manager checks it too** and names a new owner for every approval or duty that dies with the account.
4. **Live during the interview.** Added items are scored, and risky ones join the interview queue; removed items leave it. The current question isn't disturbed.

## Backfill: skills for the next hire

The **Backfill** tab works out what the replacement needs, from what the person actually owned rather than an old job ad:

- **Inputs:** repo languages and ownership share (GitHub), services and scripts, documents (Confluence, Drive), tickets and approvals (Jira, Workday), on-call (PagerDuty), recurring meetings (Calendar), and the interview answers.
- **Output:** a suggested title, a two-line summary of the role as it's really done, and skills grouped as technical, responsibilities, business knowledge and people. Each is marked must-have or nice-to-have and linked to the evidence behind it.
- **Copy as job description** puts it on the clipboard as Markdown, ready for a requisition.
- With an LLM key the agent reasons over everything. Offline, a transparent rule set scores each skill by how many owned items need it, weighted by activity, ownership share and whether it dies with the account.

Run it again after the interview; answers sharpen it.

## Voice answers and recordings

- **Speak instead of typing.** The interview has a **Speak** button that dictates into the answer box, using the browser's built-in speech recognition (Chrome, Edge, Safari). No audio is stored.
- **Show instead of tell.** Any question or answer can carry a **video or link**: paste a Google Drive, Loom, YouTube or SharePoint link, upload a video, or **record your screen** with narration right in the browser. Recordings play inline in the interview, appear in the pack under "Recordings and links", and feed the onboarding kit.
- Uploads are stored by the backend in `MEDIA_DIR` (default `./data/media`, a Docker volume in compose), up to `MAX_UPLOAD` (200MB).

## Onboarding kit: built for this role, not the whole team

The **Onboarding kit** tab gives the person who backfills the role a 90-day plan made from the previous person's real work:

- **Week 1:** read the pack, watch the recorded walkthroughs, request access to the exact systems, and meet the people the leaver named in the interview ("Arun on platform owns the Kafka cluster").
- **Weeks 2 to 4:** shadow or run the riskiest systems and recurring duties, each with the leaver's own instructions.
- **Days 31 to 60:** take over approvals and duties nobody else has been given, and close the must-have skill gaps from the Backfill tab.
- **Days 61 to 90:** write the runbooks that don't exist yet.

Tasks can be ticked off, and **Copy as checklist** gives a Markdown version. It runs alongside the company's standard onboarding and covers what only this role needs.

## Run it

### Option A: Docker (one command)

```bash
cd dotenv
docker compose up --build
# open http://localhost:3000
```

### Option B: three terminals (best while developing)

```bash
# 1) agent
cd agent
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 2) backend  (the "local" profile uses an embedded H2 database, no Postgres needed)
cd backend
SPRING_PROFILES_ACTIVE=local mvn spring-boot:run       # Windows PowerShell: $env:SPRING_PROFILES_ACTIVE="local"; mvn spring-boot:run

# 3) ui
cd ui
npm install
npm run dev                                            # http://localhost:5173
```

## Deploy: Render + Neon (free tiers)

1. **Neon:** create a project in the Singapore region. Open *Connect*, turn **Connection pooling off**, show the password and copy the connection string: `postgresql://USER:PASS@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require…`
2. **Render:** go to *New, then Blueprint*, and pick this repo. `render.yaml` creates `handover-agent`, `handover-backend` and `handoverai` (the site, at handoverai.onrender.com). Paste that one connection string into `DATABASE_URL` for both the agent and the backend; the backend converts it to JDBC itself. Also set:
   - `AGENT_URL`: the agent's `https://….onrender.com`
   - `CORS_ORIGINS`: the UI's URL
   - `ANTHROPIC_API_KEY`, plus `LLM_PROVIDER=anthropic`, if you want a real model
3. If Render gives the backend a URL other than `handover-backend.onrender.com` (ours is `handover-backend-nvfj`), change the `/v1/*` rewrite at the bottom of `render.yaml`.
4. Tables are created on first start: Hibernate creates the app tables, and the agent creates its checkpoint tables.

Free-tier caveats:
- Services sleep after 15 minutes idle and take about a minute to wake. Open the agent, backend and UI URLs 5 minutes before you demo.
- The free disk is wiped on restart, so uploaded recordings don't survive one. Drive and YouTube links do.
- Uploads are capped at 50 MB on Render.

## Using a real LLM

The agent runs fully offline with a deterministic mock LLM, so the demo works with no keys. For real questions and real pack writing, copy `agent/.env.example` to `agent/.env` and set one of:

| Variable | Example |
| --- | --- |
| `ANTHROPIC_API_KEY` | uses `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`) |
| `OPENAI_API_KEY` | uses `OPENAI_MODEL`; set `OPENAI_BASE_URL` for Azure or an internal gateway |

If the model call fails mid-demo, the agent falls back to the mock for that step instead of erroring.

## Connectors (optional)

Set these on the backend. Without them, the demo people use seeded data from `backend/src/main/resources/demo/`: Priya (engineer), Meera (engineering manager with approvals) and Karthik (customer success).

| Connector | Variables | What it finds |
| --- | --- | --- |
| GitHub / GHE | `GITHUB_API_URL` (`https://<ghe-host>/api/v3` for Enterprise), `GITHUB_TOKEN`, `GITHUB_ORG` | Repos ranked by **ownership share** (their commits ÷ all commits, 180 days), **sole-owner files** (≥ 80% of a file's commits), **CODEOWNERS** paths where they are a required reviewer (must reassign), runbook present or not |
| Jira / JSM | `JIRA_BASE_URL`, `JIRA_TOKEN`, `JIRA_EMAIL`, optional `JIRA_APPROVAL_JQL_PENDING` / `_HISTORY` | Open work per project; **approvals** via `approval = pendingBy(...)` / `approvedBy(...)` (must reassign) |
| Confluence | `CONFLUENCE_BASE_URL`, `CONFLUENCE_TOKEN`, `CONFLUENCE_EMAIL` | Pages they created or edited, used as existing docs and agent context |
| Google Drive | `GOOGLE_ACCESS_TOKEN`, `GOOGLE_DRIVE_ENABLED` | Files they own; shared ones become a "transfer ownership" item |
| Google Calendar | `GOOGLE_ACCESS_TOKEN`, `GOOGLE_CALENDAR_ENABLED` | Recurring meetings they organize, which become recurring duties to hand over |
| PagerDuty | `PAGERDUTY_TOKEN`, `PAGERDUTY_API_URL` | Escalation policies and on-call slots, plus incidents handled |

The event must carry `githubLogin` for GitHub and `email` for the others. Atlassian tools use basic auth when an email is set (Cloud) and a bearer token otherwise (Server/DC). On Jira Cloud the approval JQL may need an accountId instead of an email; override it with the two JQL variables.

## API

The UI only talks to the backend.

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/v1/events` | Intake for a CloudEvents `person.departed` event (idempotent on `id`) |
| GET | `/v1/cases`, `/v1/cases/{id}` | List cases; one case with items, interview, pack, Q&A |
| POST | `/v1/cases/{id}/interview/answer` | `{ "answer": "…" }` → next question or drafted pack |
| POST | `/v1/cases/{id}/interview/finish` | Stop interviewing and draft the pack now |
| POST | `/v1/cases/{id}/pack/approve` | `{ "approver": "…" }` → published |
| POST | `/v1/cases/{id}/ask` | `{ "question": "…" }` → cited answer, or "not covered" |
| PATCH | `/v1/cases/{id}/items/{itemId}` | `{ "successor": "…" }` |
| POST | `/v1/cases/{id}/items` | Add an item by hand: `{ "title", "kind", "notes", "needsReassignment", "addedBy" }` |
| DELETE | `/v1/cases/{id}/items/{itemId}` | "Not theirs": hide it and drop it from the interview |
| GET | `/v1/connectors` | Which tools are connected |
| POST | `/v1/cases/{id}/backfill` | Work out the skills the backfill needs (stored on the case) |
| POST | `/v1/cases/{id}/onboarding` | Build the onboarding kit for the backfill |
| POST | `/v1/cases/{id}/attachments` | Add a link: `{ "url", "title", "itemId", "turnLabel" }` |
| POST | `/v1/cases/{id}/attachments/upload` | Upload or record a video/audio file (multipart `file`, `title`, `itemId`, `turnLabel`) |
| DELETE | `/v1/cases/{id}/attachments/{attachmentId}` | Remove an attachment |
| GET | `/v1/media/{name}` | Stream an uploaded recording |
| POST | `/v1/cases/{id}/retry` | Re-run the agent for a failed case |
| GET / POST | `/v1/demo/people`, `/v1/demo/people/{id}/depart` | Demo: fire an event as if from Workday |

Example event, as an HRIS would send it:

```bash
curl -X POST localhost:8080/v1/events -H 'Content-Type: application/json' -d '{
  "specversion":"1.0","type":"person.departed","source":"workday","id":"evt-001",
  "data":{"personId":"priya","name":"Priya Raman","email":"priya.raman@acme.example",
          "role":"Senior Software Engineer","managerName":"Suresh Iyer","lastDay":"2026-12-09"}}'
```

## 4-minute demo script: three points of view

Every case has a **See it as** switch at the top: the person leaving, their manager, and the new hire. Same case and data, a different job for each. The view is in the URL (`?as=leaver`, `?as=manager`, `?as=newhire`), so you can open three tabs side by side.

**1. Priya, who is leaving (about 90 seconds)**
1. Home, then **Priya resigns**. You land in Priya's view: "Hi Priya", her notice period, and the interview.
2. Answer one question in a few words to show the follow-up, then answer properly. Press **Speak** to dictate one answer.
3. On the quarter-end reconciliation question, **Add a recording or a Drive link** and record the screen.
4. Open **What you own**: she can remove "Not mine" and add something the tools can't see. New owners are read-only for her; the manager decides those.
5. Finish. **Your handover pack** asks her to check it for anything wrong or private.

**2. Suresh, her manager (about 90 seconds)**
1. Switch to **Suresh Iyer**. The headline counts what's at risk and what still needs a new owner.
2. **What they own**: ranked by ownership share (billing-sync: 61% of changes), a CODEOWNERS approval and an on-call slot. Type new owners.
3. Mid-interview, **Interview** is read-only for him: "Priya answers from her own view".
4. **Handover pack**, then **Publish**. **Backfill** gives the skills for the job description, and **Onboarding kit** gives the kit he can rebuild.
5. Optional: Home, then **Meera resigns** to show a manager leaving. Her map is mostly approvals and the agent asks how she decides on each.

**3. The new hire (about 60 seconds)**
1. Switch to **New hire**. Before publish they see "Priya's handover is still being prepared"; after publish they get **Your first 90 days**.
2. Tick off week 1 tasks; people to meet come from Priya's answers.
3. **Ask Priya's handover**: "How do I replay a failed billing-sync batch?" gets an answer with a source. "What is the office wifi password?" gets "not covered".

## Tests

```bash
cd agent && pytest            # full interview flow, follow-ups, pack citations, Q&A
cd backend && mvn test
cd ui && npm run typecheck
```

## Team split

| Person A: platform and UI | Person B: agent and AI |
| --- | --- |
| `backend/`: events, cases, connectors, approvals | `agent/`: graph, prompts, scoring, Q&A |
| `ui/`: screens and demo flow | demo data in `backend/src/main/resources/demo/`, slides |
