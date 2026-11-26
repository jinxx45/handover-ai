"""handover.ai agent logic. Pure functions, no network, no API key needed.

Every function takes the full case as plain dicts and returns plain dicts, so the
backend owns all state and the agent stays stateless.

Item shape (from the backend connectors):
  id, kind, title, source, risk (0-100), documented (bool), mustReassign (bool),
  newOwner, removed (bool), freq, reasons [str], evidence [{id,text,source}],
  skills [[name, category]]
Turn shape: {itemId, question, answer, followUp (bool), attachments [{type,url,name}]}
"""
import re

QUESTIONS = {
    "repo": "Walk me through {title}. What breaks first, and what does the next owner need to know that isn't written down?",
    "script": "{title} runs {freq}. What are the steps, the gotchas, and how do you know it worked?",
    "approval": "How do you decide whether to approve {title}? What makes you reject one, and who should approve after you?",
    "duty": "What does {title} involve in practice, and which alerts or requests are noise versus real?",
    "meeting": "What is the real purpose of {title}, and what decisions actually get made there?",
    "drive": "What is in {title}, how is it kept up to date, and who else depends on it?",
    "ticket": "Where did you leave {title}, and what is the very next step?",
    "doc": "Is {title} still accurate? What is missing from it?",
    "other": "Tell me what the next owner needs to know about {title}.",
}
FOLLOW_UP = "Can you give one concrete example, a time this went wrong and what you did about it?"
MIN_WORDS = 12
MAX_QUESTIONS = 6
STOP = set("the a an and or of to in on for is are was were be it this that what how do does did i you we they with at by from as can will should my your our about when which who whom if then so not no".split())


def active(case):
    return [i for i in case["items"] if not i.get("removed")]


def needs_interview(i):
    return i["risk"] >= 40 and (not i.get("documented") or i.get("mustReassign"))


def queue(case):
    q = [i for i in active(case) if needs_interview(i)]
    q.sort(key=lambda i: -i["risk"])
    return q[:MAX_QUESTIONS]


def question_for(item):
    t = QUESTIONS.get(item["kind"], QUESTIONS["other"])
    return t.format(title=item["title"], freq=item.get("freq") or "on a schedule")


def words(s):
    return re.findall(r"[A-Za-z0-9_\-\.]+", s)


def next_question(case):
    """Return {done, itemId, question, followUp, remaining, total}."""
    q = queue(case)
    turns = [t for t in case.get("turns", []) if t.get("answer")]
    by_item = {}
    for t in turns:
        by_item.setdefault(t["itemId"], []).append(t)
    total = len(q)
    # follow-up for the most recent short main answer
    if turns:
        last = turns[-1]
        if (not last.get("followUp") and len(words(last["answer"])) < MIN_WORDS
                and not any(t.get("followUp") for t in by_item.get(last["itemId"], []))
                and any(i["id"] == last["itemId"] for i in q)):
            return {"done": False, "itemId": last["itemId"], "question": FOLLOW_UP,
                    "followUp": True, "remaining": total - len(by_item) + 1, "total": total}
    for item in q:
        if item["id"] not in by_item:
            return {"done": False, "itemId": item["id"], "question": question_for(item),
                    "followUp": False,
                    "remaining": total - len(by_item), "total": total}
    return {"done": True, "remaining": 0, "total": total}


# ---------------------------------------------------------------- pack

def _answers(case, item_id):
    return [t for t in case.get("turns", []) if t["itemId"] == item_id and t.get("answer")]


def extract_people(text):
    names = set()
    for m in re.finditer(r"\b(?i:ask|talk to|meet|contact|ping|page|call|see)\s+([A-Z][a-z]{2,})", text):
        names.add(m.group(1))
    for m in re.finditer(r"\b([A-Z][a-z]{2,})\s+(?:owns|handles|knows|runs|maintains|approves|should take)\b", text):
        if m.group(1) not in ("It", "This", "That", "She", "He", "They", "Nobody"):
            names.add(m.group(1))
    return names


def build_pack(case):
    person = case["person"]
    items = sorted(active(case), key=lambda i: -i["risk"])
    refs = {}
    sections = []

    def ev_ref(e):
        refs[e["id"]] = {"id": e["id"], "type": "evidence", "label": e["source"], "text": e["text"]}
        return e["id"]

    def ans_ref(item, idx, t):
        rid = f"a-{item['id']}-{idx}"
        refs[rid] = {"id": rid, "type": "interview", "label": "Interview", "text": t["answer"]}
        return rid

    captured = sum(1 for i in items if _answers(case, i["id"]) or i.get("documented"))
    to_assign = [i for i in items if i.get("mustReassign") and not i.get("newOwner")]
    sections.append({"title": "Summary", "kind": "summary", "paragraphs": [{
        "text": f"{person['name']} ({person['role']}) leaves on {person['lastDay']}. "
                f"{len(items)} things were found in their name; {captured} are documented or captured "
                f"in the interview. {len(to_assign)} stop working when the account closes and still need a new owner.",
        "cites": []}]})

    for it in items:
        paras = []
        facts = " ".join(e["text"].rstrip(".") + "." for e in it["evidence"][:3])
        if facts:
            paras.append({"text": facts, "cites": [ev_ref(e) for e in it["evidence"][:3]]})
        for idx, t in enumerate(_answers(case, it["id"])):
            paras.append({"text": f"{it['title']}: {t['answer']}", "cites": [ans_ref(it, idx, t)],
                          "interview": True})
        owner = it.get("newOwner")
        if it.get("mustReassign"):
            paras.append({"text": f"{it['title']} stops working when {person['first']}'s account closes. "
                                  + (f"New owner: {owner}." if owner else "Needs a new owner."),
                          "cites": [], "flag": "owner" if owner else "needs-owner"})
        sections.append({"title": it["title"], "kind": it["kind"], "itemId": it["id"],
                         "risk": it["risk"], "paragraphs": paras})

    people = set()
    for t in case.get("turns", []):
        people |= extract_people(t.get("answer", ""))
    if people:
        sections.append({"title": "People to know", "kind": "people", "paragraphs": [{
            "text": "Named in the interview: " + ", ".join(sorted(people)) + ".", "cites": []}]})

    links = []
    for t in case.get("turns", []):
        for a in t.get("attachments", []):
            links.append({"name": a.get("name") or a.get("url"), "url": a["url"], "type": a.get("type", "link"),
                          "itemId": t["itemId"]})
    if links:
        sections.append({"title": "Recordings and links", "kind": "links", "links": links, "paragraphs": []})
    return {"sections": sections, "refs": refs, "people": sorted(people)}


# ---------------------------------------------------------------- ask

def _tokens(s):
    """Lowercase, split on punctuation (so quarter-end-recon.sh gives quarter, end, recon), 5-letter stems."""
    out = set()
    for w in re.findall(r"[A-Za-z0-9]+", s.lower()):
        if len(w) > 2 and w not in STOP:
            out.add(w[:5])
    return out


def ask(pack, question):
    q = _tokens(question)
    best, best_score = None, 0
    for sec in pack["sections"]:
        for p in sec.get("paragraphs", []):
            hay = _tokens(sec["title"] + " " + p["text"])
            score = len(q & hay) + (1.5 if p.get("interview") else 0) * (1 if q & hay else 0)
            if score > best_score:
                best, best_score, best_sec = p, score, sec
    matched = len(q & _tokens(best["text"] + " " + best_sec["title"])) if best else 0
    if not best or matched < 2:
        return {"covered": False, "answer": f"That isn't covered in the handover. Ask {pack.get('owner', 'the manager')}.",
                "cites": []}
    cites = [pack["refs"][c] for c in best["cites"] if c in pack["refs"]]
    text = best["text"]
    if best.get("interview"):
        text = f"{pack.get('personFirst', 'They')} said: {text.split(': ', 1)[-1]}"
    return {"covered": True, "answer": text, "section": best_sec["title"], "cites": cites}


# ---------------------------------------------------------------- backfill

CATS = {"technical": "Technical", "responsibility": "Responsibilities they carry",
        "business": "Business knowledge", "people": "Working with people"}


def backfill(case):
    person = case["person"]
    skills = {}
    for it in active(case):
        w = it["risk"] / 100 * (1.4 if it.get("mustReassign") else 1.0) * (1.2 if not it.get("documented") else 0.8)
        for name, cat in it.get("skills", []):
            s = skills.setdefault(name, {"name": name, "category": cat, "score": 0.0, "evidence": []})
            s["score"] += w
            s["evidence"].append(it["title"])
    answers = " ".join(t["answer"].lower() for t in case.get("turns", []) if t.get("answer"))
    for s in skills.values():
        if s["name"].lower() in answers:
            s["score"] += 0.4
            s["evidence"].append("Interview answers")
        s["score"] = round(s["score"], 2)
        s["level"] = "must" if s["score"] >= 1.25 else "nice"
        s["evidence"] = sorted(set(s["evidence"]))
    ordered = sorted(skills.values(), key=lambda s: -s["score"])
    groups = [{"key": k, "label": v, "skills": [s for s in ordered if s["category"] == k]} for k, v in CATS.items()]
    groups = [g for g in groups if g["skills"]]
    musts = [s["name"] for s in ordered if s["level"] == "must"]
    title = person.get("backfillTitle") or person["role"]
    summary = (f"This role is mostly {', '.join(musts[:3])}. "
               f"It owns {len([i for i in active(case) if i.get('mustReassign')])} duties that stop working when the "
               f"previous owner leaves.") if musts else "Role built from the previous owner's work."
    md = [f"# {title}", "", summary, ""]
    for g in groups:
        md += [f"## {g['label']}"] + [f"- {s['name']} ({'must-have' if s['level']=='must' else 'nice-to-have'})"
                                       for s in g["skills"]] + [""]
    return {"title": title, "summary": summary, "groups": groups, "markdown": "\n".join(md)}


# ---------------------------------------------------------------- onboarding

def onboarding(case):
    person = case["person"]
    first = person["first"]
    its = sorted(active(case), key=lambda i: -i["risk"])
    pack = build_pack(case)
    bf = backfill(case)
    sources = sorted({i["source"] for i in its})
    links = [s for s in pack["sections"] if s["kind"] == "links"]
    n = [0]

    def task(text, ref=None):
        n[0] += 1
        return {"id": f"t{n[0]}", "text": text, "ref": ref}

    week1 = [task(f"Read {first}'s handover pack end to end."),
             task(f"Get access to: {', '.join(sources)}.")]
    if links:
        week1.append(task("Open the recorded walkthroughs and links at the bottom of the pack."))
    if pack["people"]:
        week1.append(task(f"Meet the people {first} named: {', '.join(pack['people'])}."))
    shadow = []
    for it in its[:3]:
        a = _answers(case, it["id"])
        hint = f" {first} says: \"{a[0]['answer'][:140].rstrip()}{'…' if len(a[0]['answer'])>140 else ''}\"" if a else ""
        shadow.append(task(f"Shadow, then run, {it['title']}.{hint}", it["id"]))
    take = [task(f"Take over {i['title']}" + (f" (owner: {i['newOwner']})." if i.get("newOwner") else " (still needs an owner)."), i["id"])
            for i in its if i.get("mustReassign")]
    for s in [s for g in bf["groups"] for s in g["skills"] if s["level"] == "must"][:3]:
        take.append(task(f"Close any gap in {s['name']}: {', '.join(s['evidence'][:2])}."))
    write = [task(f"Write the missing runbook for {i['title']}.", i["id"]) for i in its if not i.get("documented")][:4]
    return {"title": f"Your first 90 days, taking over from {first}", "phases": [
        {"key": "week1", "label": "Week 1", "tasks": week1},
        {"key": "w2-4", "label": "Weeks 2 to 4", "tasks": shadow},
        {"key": "d31-60", "label": "Days 31 to 60", "tasks": take},
        {"key": "d61-90", "label": "Days 61 to 90", "tasks": write}]}
