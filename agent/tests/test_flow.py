import os

os.environ["CHECKPOINT_DB"] = ":memory:"
os.environ["LLM_PROVIDER"] = "mock"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)

ITEMS = [
    {"id": "it-1", "kind": "recurring_task", "title": "Quarter-end revenue reconciliation script", "source": "github", "activity": 12, "hasDocs": False, "lastActivityDays": 5},
    {"id": "it-2", "kind": "service", "title": "billing-sync service", "source": "github", "activity": 28, "hasDocs": False},
    {"id": "it-3", "kind": "doc", "title": "Team onboarding guide", "source": "drive", "activity": 1, "hasDocs": True},
]
EVIDENCE = [
    {"id": "E1", "itemId": "it-1", "source": "github", "text": "reconcile_q.py runs on the last business day; reads ledger exports from S3."},
    {"id": "E2", "itemId": "it-2", "source": "jira", "text": "BILL-142 billing-sync retries failed 3 times last quarter."},
]


def start():
    r = client.post("/runs", json={"caseId": "c1", "personName": "Elena Marsh", "role": "Senior engineer", "items": ITEMS, "evidence": EVIDENCE})
    assert r.status_code == 200, r.text
    return r.json()


def test_health():
    assert client.get("/health").json()["status"] == "ok"


def test_full_interview_produces_cited_pack():
    run = start()
    assert run["status"] == "INTERVIEWING"
    # Riskiest item first; the documented doc item is not interviewed.
    risk = [a["riskScore"] for a in run["analysis"]]
    assert risk == sorted(risk, reverse=True)
    assert {a["itemId"] for a in run["analysis"] if a["needsInterview"]} == {"it-1", "it-2"}
    first_item = run["question"]["itemId"]
    other_item = ({"it-1", "it-2"} - {first_item}).pop()

    long_answer = "Run it every Tuesday after the 10am freeze: merge to main, tag the release, then post the notes and ask Grace in Order Operations to check the order list."
    # A short answer triggers one follow-up on the same item.
    r = client.post(f"/runs/{run['runId']}/answer", json={"answer": "It just runs."}).json()
    assert r["question"]["isFollowup"] is True and r["question"]["itemId"] == first_item
    r = client.post(f"/runs/{run['runId']}/answer", json={"answer": long_answer}).json()
    assert r["question"]["itemId"] == other_item and r["question"]["isFollowup"] is False
    r = client.post(f"/runs/{run['runId']}/answer", json={"answer": "Check the dead-letter queue first, then restart the consumer; Felix on platform owns the Kafka cluster it reads from."}).json()
    assert r["status"] == "DRAFTED"
    pack = r["pack"]
    keys = [s["key"] for s in pack["sections"]]
    assert keys[0] == "overview" and "landmines" in keys
    landmines = next(s for s in pack["sections"] if s["key"] == "landmines")
    assert "I2" in landmines["citations"]

    ask = client.post("/ask", json={"question": "What breaks at quarter end?", "pack": pack, "evidence": EVIDENCE, "answers": r["answers"]}).json()
    assert ask["covered"] is True and ask["citations"]

    nope = client.post("/ask", json={"question": "zebra giraffe xylophone", "pack": pack, "evidence": EVIDENCE, "answers": r["answers"]}).json()
    assert nope["covered"] is False


def test_finish_early_drafts_pack():
    run = start()
    r = client.post(f"/runs/{run['runId']}/finish").json()
    assert r["status"] == "DRAFTED" and r["pack"]["sections"]


def test_unknown_run_404():
    assert client.get("/runs/nope").status_code == 404


def test_manager_approvals_are_interviewed_and_flagged():
    items = [
        {"id": "ap-1", "kind": "approval", "title": "Production access requests (PAY project)", "source": "jira", "activity": 22, "hasDocs": False, "needsReassignment": True},
        {"id": "rp-1", "kind": "repo", "title": "payments-api", "source": "github", "activity": 15, "hasDocs": False, "ownershipShare": 0.64},
        {"id": "dc-1", "kind": "doc", "title": "Team wiki", "source": "confluence", "activity": 2, "hasDocs": True},
    ]
    run = client.post("/runs", json={"caseId": "m1", "personName": "Sofia Brandt", "items": items, "evidence": []}).json()
    analysis = {a["itemId"]: a for a in run["analysis"]}
    assert analysis["ap-1"]["needsInterview"] and "reassigned" in analysis["ap-1"]["reason"]
    assert "64%" in analysis["rp-1"]["reason"]
    assert run["question"]["itemId"] == "ap-1" and "approve" in run["question"]["question"]
    r = client.post(f"/runs/{run['runId']}/finish").json()
    approvals = next(s for s in r["pack"]["sections"] if s["key"] == "approvals")
    assert "Production access requests" in approvals["body"] and "new owner" in approvals["body"]


def test_manual_items_join_and_leave_the_interview():
    run = start()
    first = run["question"]["itemId"]
    added = {"id": "man-1", "kind": "recurring_task", "title": "Monthly vendor invoice check", "source": "manual", "activity": 0, "hasDocs": False, "needsReassignment": True}
    r = client.post(f"/runs/{run['runId']}/items", json={"add": [added], "evidence": [{"id": "E9", "itemId": "man-1", "source": "manual", "text": "Checks vendor invoices on the 1st."}], "remove": ["it-3"]}).json()
    assert r["status"] == "INTERVIEWING" and r["question"]["itemId"] == first  # same pending question
    ids = {a["itemId"] for a in r["analysis"]}
    assert "man-1" in ids and "it-3" not in ids
    seen = []
    for _ in range(10):
        if r["status"] != "INTERVIEWING":
            break
        seen.append(r["question"]["itemId"])
        r = client.post(f"/runs/{run['runId']}/answer", json={"answer": "Detailed answer with enough words to avoid a follow-up question here."}).json()
    assert "man-1" in seen and r["status"] == "DRAFTED"


def test_backfill_skills_are_grounded_in_evidence():
    r = client.post("/skills", json={"personName": "Elena Marsh", "role": "Senior engineer", "items": ITEMS, "evidence": EVIDENCE,
                                     "answers": [{"id": "I1", "itemId": "it-2", "question": "q", "answer": "Check the Kafka dead-letter queue, then replay."}]}).json()
    names = [s["name"] for s in r["skills"]]
    assert any("Kafka" in n for n in names) and any("reconciliation" in n.lower() for n in names)
    kafka = next(s for s in r["skills"] if "Kafka" in s["name"])
    assert "I1" in kafka["citations"] and kafka["priority"] in ("must", "nice")
    assert r["title"] and r["summary"]


def test_onboarding_kit_is_specific_to_the_role():
    answers = [
        {"id": "I1", "itemId": "it-1", "question": "q", "answer": "Run it after finance uploads the ledger; tell Grace in order operations when it goes red."},
        {"id": "I2", "itemId": "it-2", "question": "q", "answer": "Check the DLQ first. Felix on platform owns the Kafka cluster."},
    ]
    att = [{"id": "A1", "itemId": "it-1", "turnLabel": "I1", "kind": "video", "url": "/v1/media/recon.webm", "title": "Running the quarter-end recon"}]
    r = client.post("/onboarding", json={"personName": "Elena Marsh", "role": "Senior engineer", "managerName": "Marcus Whitfield",
                                         "items": ITEMS, "evidence": EVIDENCE, "answers": answers, "attachments": att}).json()
    tasks = [t for ph in r["phases"] for t in ph["tasks"]]
    assert r["phases"][0]["name"] == "Week 1"
    assert any(t["type"] == "watch" and t["link"] == "/v1/media/recon.webm" for t in tasks)
    names = [p["name"] for p in r["people"]]
    assert "Marcus Whitfield" in names and "Felix" in names and "Grace" in names
    assert any("billing-sync" in t["title"] for t in tasks)
