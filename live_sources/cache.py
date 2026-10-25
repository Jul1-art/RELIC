"""Small TTL cache with durable last-known values for upstream outages."""

from __future__ import annotations

import json
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path


class LiveCache:
    def __init__(self, directory: Path):
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)
        self.entries = {}
        self.locks = {}
        self.guard = threading.Lock()

    def _lock(self, key: str):
        with self.guard:
            return self.locks.setdefault(key, threading.Lock())

    def _path(self, key: str) -> Path:
        return self.directory / (re.sub(r"[^a-z0-9_-]", "_", key) + ".json")

    def get(self, key: str, ttl_seconds: int, loader) -> dict:
        with self._lock(key):
            entry = self.entries.get(key)
            if entry and time.monotonic() < entry[0]:
                return {**entry[1], "state": entry[2]}
            try:
                value = loader()
                value = {**value, "fetchedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}
                self.entries[key] = (time.monotonic() + ttl_seconds, value, "current")
                path = self._path(key)
                temp = path.with_suffix(".partial")
                temp.write_text(json.dumps(value), encoding="utf-8")
                temp.replace(path)
                return {**value, "state": "current"}
            except Exception:
                if entry:
                    value = entry[1]
                else:
                    try:
                        value = json.loads(self._path(key).read_text(encoding="utf-8"))
                    except (OSError, ValueError):
                        value = None
                if value:
                    self.entries[key] = (time.monotonic() + min(ttl_seconds, 60), value, "stale")
                    return {**value, "state": "stale", "message": "Source unavailable; last known value"}
                return {"state": "unavailable", "message": "Source temporarily unavailable"}
