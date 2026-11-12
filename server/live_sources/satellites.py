"""Python host adapter of God's Eye View's CelesTrak proxy (MIT).

Fixed groups, six-hour disk cache, shared cooldown and stale-on-error. The
public upstream has no browser CORS, and requires no account or API key.
"""
import json
import re
import threading
import time
from pathlib import Path
from urllib.parse import urlencode
import requests

GROUPS = frozenset(('stations', 'starlink', 'active', 'visual', 'gps-ops', 'glo-ops', 'galileo',
                    'geo', 'resource', 'weather', 'planet', 'sar', 'science'))
TTL = 6 * 3600
MAX_AGE = 14 * 86400
MAX_BYTES = 16 * 1024 * 1024

class SatelliteFeeds:
    def __init__(self, directory, fetch=requests.get, now=time.time):
        self.directory = Path(directory)
        self.fetch = fetch
        self.now = now
        self.lock = threading.Lock()
        self.cooldown_until = 0

    def read(self, group):
        if group not in GROUPS:
            raise ValueError('Unknown satellite group')
        with self.lock:
            path = self.directory / (group + '.json')
            cached = None
            try:
                entry = json.loads(path.read_text())
                age = self.now() - float(entry['at'])
                if 0 <= age < MAX_AGE and isinstance(entry['text'], str):
                    cached = entry
                    if age < TTL:
                        return {**entry, 'state': 'HIT'}
            except (OSError, ValueError, TypeError, KeyError):
                pass
            if self.now() >= self.cooldown_until:
                try:
                    response = self.fetch(
                        'https://celestrak.org/NORAD/elements/gp.php?' +
                        urlencode({'GROUP': group, 'FORMAT': 'tle'}),
                        headers={'User-Agent': 'RELIC-satellites/1.0 (+https://github.com/Jul1-art/Hackathon_NASA)'},
                        stream=True, timeout=20, allow_redirects=False)
                    try:
                        if response.status_code != 200:
                            retry = response.headers.get('Retry-After', '')
                            delay = max(60, int(retry)) if retry.isdigit() else 60
                            self.cooldown_until = max(self.cooldown_until, self.now() + delay)
                            raise ValueError('Upstream unavailable')
                        body = bytearray()
                        for chunk in response.iter_content(65536):
                            body.extend(chunk)
                            if len(body) > MAX_BYTES:
                                raise ValueError('Catalogue too large')
                        text = body.decode('utf-8')
                        if not re.search(r'^1 \S{5}.*\n2 ', text, re.M):
                            raise ValueError('No orbital elements')
                    finally:
                        response.close()
                    entry = {'text': text, 'at': self.now()}
                    try:
                        self.directory.mkdir(parents=True, exist_ok=True)
                        temp = path.with_suffix('.tmp')
                        temp.write_text(json.dumps(entry))
                        temp.replace(path)
                    except OSError:
                        pass
                    return {**entry, 'state': 'MISS'}
                except (requests.RequestException, ValueError, OSError):
                    self.cooldown_until = max(self.cooldown_until, self.now() + 60)
            if cached:
                return {**cached, 'state': 'STALE-ERROR'}
            raise RuntimeError('Satellite catalogue unavailable')
