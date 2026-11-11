"""Film restoration service for Vercel.

This provides an HTTP endpoint for film restoration, allowing the main
server to call it via Vercel service bindings instead of importing directly.
"""

from __future__ import annotations

import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    from restore_film import restore_films
except ImportError:
    restore_films = None


class FilmHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress logs

    def do_POST(self):
        if self.path == "/restore":
            if restore_films is None:
                self.send_response(503)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Film restoration not available"}).encode())
                return

            try:
                # Get project root from query or body
                content_length = int(self.headers.get("Content-Length", 0))
                if content_length:
                    body = self.rfile.read(content_length)
                    data = json.loads(body)
                    project_root = data.get("root")
                else:
                    project_root = os.environ.get("VERCEL_PATH", "/")

                if not project_root:
                    self.send_response(400)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Missing project root"}).encode())
                    return

                root_path = Path(project_root)
                if not (root_path / "intro/assets/prologue/encoding-v9-hd50.json").is_file():
                    restored = restore_films(root_path)
                else:
                    restored = []

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"restored": restored}).encode())
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        self.send_response(404)
        self.end_headers()


def main():
    port = int(os.environ.get("PORT", "8001"))
    ThreadingHTTPServer(("0.0.0.0", port), FilmHandler).serve_forever()


if __name__ == "__main__":
    main()
