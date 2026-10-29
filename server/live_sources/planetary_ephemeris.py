"""Nonblocking, cached Horizons refresh for the same-origin browser endpoint."""
from __future__ import annotations

import threading
import time
from datetime import datetime, timezone

from . import horizons


class PlanetaryEphemeris:
    def __init__(self, cache):
        self.cache = cache
        self.lock = threading.Lock()
        self.bodies = {}
        self.refreshing = False
        self.attempted_at = -float("inf")
        self.generated_at = None

    def _refresh(self):
        try:
            for body in horizons.TARGETS:
                value = self.cache.get(f"horizons-window-{body}", 600, lambda body=body: horizons.fetch_window(body))
                if "states" in value:
                    with self.lock:
                        self.bodies[body] = value
            with self.lock:
                self.generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        finally:
            with self.lock:
                self.refreshing = False

    def snapshot(self):
        # The endpoint returns immediately, including on an initial slow NASA
        # request. The browser continues with bundled states, then polls again.
        with self.lock:
            if not self.refreshing and time.monotonic() - self.attempted_at >= 600:
                self.refreshing = True
                self.attempted_at = time.monotonic()
                threading.Thread(target=self._refresh, daemon=True, name="relic-ephemeris").start()
            return {"timeScale": "UTC", "center": "500@10", "correction": "geometric / NONE",
                    "frame": "heliocentric J2000 ecliptic / ICRF", "units": {"position": "km", "velocity": "km/day", "epoch": "JD UTC"},
                    "generatedAt": self.generated_at, "refreshing": self.refreshing,
                    "source": "NASA/JPL Horizons", "sourceUrl": horizons.DOCUMENTATION,
                    "bodies": dict(self.bodies), "cacheSeconds": 600}
