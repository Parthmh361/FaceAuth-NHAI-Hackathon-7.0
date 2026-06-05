"""
Local mock of the AWS sync endpoint — zero dependencies (Python stdlib only).
=============================================================================
Lets you DEMO the offline->online sync + purge flow without deploying to AWS.

Run:
    python mock_server.py

Then in the mobile app's SyncService.ts set:
    const AWS_ENDPOINT = 'http://<YOUR_LAPTOP_LAN_IP>:8080/attendance';
(phone and laptop must be on the same Wi-Fi; find the IP via `ipconfig`).

Every batch the app uploads is printed here and appended to received.jsonl,
and the server replies 200 so the app marks records synced and purges them.
"""

import json
import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8080
LOG_FILE = 'received.jsonl'


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        if self.path.rstrip('/') != '/attendance':
            return self._send(404, {'error': 'not found'})

        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length)
        try:
            records = json.loads(raw).get('records', [])
        except json.JSONDecodeError:
            return self._send(400, {'error': 'invalid JSON'})

        stamp = datetime.datetime.now().strftime('%H:%M:%S')
        print(f"\n[{stamp}] Received {len(records)} attendance record(s):")
        for r in records:
            print(f"   - {r.get('employeeId'):<12} "
                  f"score={r.get('similarityScore', 0):.3f} "
                  f"challenge={r.get('challenge')} "
                  f"ts={r.get('timestamp')}")

        with open(LOG_FILE, 'a') as f:
            for r in records:
                f.write(json.dumps(r) + '\n')

        self._send(200, {'synced': len(records), 'skipped': 0})

    def log_message(self, *args):
        pass  # silence default access logging


if __name__ == '__main__':
    print(f"NHAI FaceAuth mock sync server listening on http://0.0.0.0:{PORT}/attendance")
    print("Point SyncService.ts AWS_ENDPOINT here, then trigger Sync in the app.")
    print("Press Ctrl+C to stop.\n")
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
