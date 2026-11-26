import json, subprocess, unittest, logic

def case(pid="priya"):
    out = subprocess.check_output(["node", "-e",
        f"const d=require('../backend/src/demo');console.log(JSON.stringify({{person:d.people.{pid},items:d.items.{pid}(),turns:[]}}))"])
    return json.loads(out)

class T(unittest.TestCase):
    def test_queue_riskiest_first_skips_documented(self):
        q = logic.queue(case()); self.assertEqual(q[0]["title"], "quarter-end-recon.sh")
        self.assertNotIn("Billing sync design", [i["title"] for i in q])

    def test_followup_on_short_answer_then_moves_on(self):
        c = case(); n = logic.next_question(c)
        c["turns"].append({"itemId": n["itemId"], "answer": "It just works.", "followUp": False})
        f = logic.next_question(c); self.assertTrue(f["followUp"]); self.assertEqual(f["itemId"], n["itemId"])
        c["turns"].append({"itemId": n["itemId"], "answer": "x", "followUp": True})
        self.assertNotEqual(logic.next_question(c)["itemId"], n["itemId"])

    def test_removed_items_leave_queue(self):
        c = case(); top = logic.queue(c)[0]["id"]
        for i in c["items"]:
            if i["id"] == top: i["removed"] = True
        self.assertNotIn(top, [i["id"] for i in logic.queue(c)])

    def test_pack_cites_and_ask_not_covered(self):
        c = case(); c["turns"].append({"itemId": "i2", "answer": "Run it with the Q flag, then ask Suresh to check the S3 totals match finance.", "followUp": False})
        p = logic.build_pack(c); p["owner"] = "Suresh Iyer"; p["personFirst"] = "Priya"
        a = logic.ask(p, "How do I run the quarter-end reconciliation script?")
        self.assertTrue(a["covered"]); self.assertIn("Priya said", a["answer"]); self.assertTrue(a["cites"])
        self.assertFalse(logic.ask(p, "What is the office wifi password?")["covered"])
        self.assertIn("Suresh", p["people"])

    def test_backfill_and_onboarding(self):
        c = case(); b = logic.backfill(c)
        musts = [s["name"] for g in b["groups"] for s in g["skills"] if s["level"] == "must"]
        self.assertIn("Kafka", musts); self.assertIn("Finance reconciliation", musts)
        o = logic.onboarding(c); self.assertEqual(len(o["phases"]), 4); self.assertTrue(o["phases"][1]["tasks"])

    def test_manager_persona(self):
        c = case("meera"); self.assertIn("approve", logic.question_for(logic.queue(c)[0]).lower())

if __name__ == "__main__": unittest.main()
