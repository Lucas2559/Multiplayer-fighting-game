"""Serve the book on http://localhost:8000, telling browsers never to keep stale copies.

Usage: python3 tools/serve.py   (run from book/)
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

ThreadingHTTPServer(("127.0.0.1", 8000), NoCache).serve_forever()
