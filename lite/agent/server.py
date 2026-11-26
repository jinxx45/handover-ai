"""Tiny stdlib HTTP server around logic.py. Run: python3 server.py  (port 8000)"""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import logic

ROUTES = {
    "/next": lambda b: logic.next_question(b["case"]),
    "/pack": lambda b: logic.build_pack(b["case"]),
    "/ask": lambda b: logic.ask(b["pack"], b["question"]),
    "/backfill": lambda b: logic.backfill(b["case"]),
    "/onboarding": lambda b: logic.onboarding(b["case"]),
}


class H(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self._send(200, {"ok": True, "mode": "offline-rules"}) if self.path == "/health" else self._send(404, {})

    def do_POST(self):
        fn = ROUTES.get(self.path)
        if not fn:
            return self._send(404, {"error": "unknown route"})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            self._send(200, fn(body))
        except Exception as e:  # noqa: BLE001
            self._send(500, {"error": str(e)})

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(os.environ.get("AGENT_PORT", "8000"))
    print(f"agent listening on :{port}")
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
