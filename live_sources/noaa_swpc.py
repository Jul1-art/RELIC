"""Observed solar-wind speed near Earth from NOAA SWPC."""

from __future__ import annotations

from datetime import datetime, timezone
from math import isfinite

import requests


SUMMARY_URL = "https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json"
BACKUP_URL = "https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json"
DOCUMENTATION = "https://www.spaceweather.gov/products/solar-wind"


def _clean(row: dict, endpoint: str) -> dict:
    speed = row.get("proton_speed")
    stamp = row.get("time_tag")
    if not isinstance(speed, (int, float)) or not isfinite(speed) or speed <= 0:
        raise ValueError("NOAA solar-wind speed is missing")
    if not isinstance(stamp, str):
        raise ValueError("NOAA solar-wind timestamp is missing")
    observed = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    observed = observed.replace(tzinfo=timezone.utc) if observed.tzinfo is None else observed.astimezone(timezone.utc)
    if (datetime.now(timezone.utc) - observed).total_seconds() > 3600:
        raise ValueError("NOAA solar-wind measurement is older than one hour")
    return {
        "speedKmS": float(speed),
        "measuredAt": observed.isoformat().replace("+00:00", "Z"),
        "location": "near Earth (upstream/L1)",
        "source": "NOAA SWPC",
        "sourceUrl": DOCUMENTATION,
        "endpoint": endpoint,
        "kind": "measurement",
    }


def fetch() -> dict:
    try:
        response = requests.get(SUMMARY_URL, timeout=4)
        response.raise_for_status()
        rows = response.json()
        if not isinstance(rows, list) or not rows:
            raise ValueError("NOAA summary is empty")
        return _clean(rows[0], SUMMARY_URL)
    except (requests.RequestException, ValueError, TypeError, KeyError):
        response = requests.get(BACKUP_URL, timeout=4)
        response.raise_for_status()
        rows = response.json()
        if not isinstance(rows, list):
            raise ValueError("NOAA backup is invalid")
        current = [row for row in rows if row.get("active") and row.get("proton_speed") is not None]
        if not current:
            raise ValueError("NOAA backup has no active measurements")
        return _clean(max(current, key=lambda row: row.get("time_tag", "")), BACKUP_URL)
