#!/usr/bin/env python3
import json, os, threading, urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from analyze import run_and_store

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
PORT = int(os.environ.get("PORT", "8080"))
XAI = os.environ.get("XAI_API_KEY", "")
LEADS = ROOT / "leads.jsonl"
SCORES = ROOT / "scores.jsonl"

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, obj):
        raw = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b"{}"
        if self.path == "/session":
            if not XAI:
                return self._json(500, {"error": "missing_key"})
            req = urllib.request.Request(
                "https://api.x.ai/v1/realtime/client_secrets",
                data=json.dumps({"expires_after": {"seconds": 300}}).encode(),
                method="POST",
                headers={
                    "Authorization": f"Bearer {XAI}",
                    "Content-Type": "application/json",
                    "User-Agent": "casacreadores-voice",
                },
            )
            try:
                with urllib.request.urlopen(req, timeout=20) as r:
                    data = json.loads(r.read())
                return self._json(200, {"value": data.get("value"), "expires_at": data.get("expires_at")})
            except Exception as e:
                print("session_error", type(e).__name__)
                return self._json(502, {"error": "token_failed"})
        if self.path == "/lead":
            try:
                payload = json.loads(body.decode() or "{}")
            except json.JSONDecodeError:
                return self._json(400, {"error": "bad_json"})
            payload["_ts"] = __import__("time").time()
            with LEADS.open("a") as f:
                f.write(json.dumps(payload, ensure_ascii=False) + "\n")
            kind = payload.get("tipo") or payload.get("kind") or "?"
            name = payload.get("nombre") or payload.get("name") or "?"
            print(f"lead {kind} {name}")
            if str(kind).lower() in {"creador", "creator"} and (payload.get("handle") or "").strip():
                threading.Thread(target=run_and_store, args=(payload, SCORES), daemon=True).start()
            return self._json(200, {"ok": True})
        self.send_error(404)

    def log_message(self, fmt, *args):
        print(fmt % args)

if __name__ == "__main__":
    scrape = bool(os.environ.get("SCRAPECREATORS_API_KEY") or os.environ.get("SCRAPE_CREATORS_API_KEY"))
    print(f"casacreadores listening on {PORT} xai={'yes' if XAI else 'NO'} scrape={'yes' if scrape else 'NO'}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
