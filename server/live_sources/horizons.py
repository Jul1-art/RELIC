"""Heliocentric state vectors from the NASA/JPL Horizons API."""

from __future__ import annotations

import math
import os
import re
import threading
from datetime import datetime, timezone

import requests


GET_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
POST_URL = "https://ssd.jpl.nasa.gov/api/horizons_file.api"
DOCUMENTATION = "https://ssd-api.jpl.nasa.gov/doc/horizons.html"
TARGETS = {
    "mercury": "199", "venus": "299", "earth": "399", "mars": "499",
    "jupiter": "599", "saturn": "699", "uranus": "799", "neptune": "899",
}
REQUEST_LOCK = threading.Lock()
NUMBER = r"[+-]?\d+(?:\.\d+)?(?:E[+-]?\d+)?"


def _parse(payload: dict, body: str, at: datetime, endpoint: str) -> dict:
    result = payload.get("result")
    if not isinstance(result, str):
        raise ValueError("Horizons did not return a result")
    match = re.search(r"\$\$SOE\s*\n(.*?)\n\$\$EOE", result, re.S)
    if not match:
        raise ValueError("Horizons returned no ephemeris rows")
    row = match.group(1).splitlines()
    if len(row) < 3:
        raise ValueError("Horizons vector row is incomplete")
    values = {}
    for name in ("X", "Y", "Z", "VX", "VY", "VZ"):
        found = re.search(rf"\b{name}\s*=\s*({NUMBER})", match.group(1))
        if not found:
            raise ValueError(f"Horizons vector {name} is missing")
        values[name] = float(found.group(1))
        if not math.isfinite(values[name]):
            raise ValueError(f"Horizons vector {name} is invalid")
    position = {axis.lower(): values[axis] for axis in ("X", "Y", "Z")}
    velocity = {axis.lower(): values["V" + axis] for axis in ("X", "Y", "Z")}
    return {
        "body": body,
        "positionKm": position,
        "velocityKmS": velocity,
        "distanceFromSunKm": math.sqrt(sum(value * value for value in position.values())),
        "speedKmS": math.sqrt(sum(value * value for value in velocity.values())),
        "validAt": at.isoformat().replace("+00:00", "Z"),
        "source": "NASA/JPL Horizons",
        "sourceUrl": DOCUMENTATION,
        "endpoint": endpoint,
        "kind": "calculated ephemeris",
    }


def fetch(body: str, at: datetime | None = None) -> dict:
    if body not in TARGETS:
        raise ValueError("Unknown planet")
    contact = os.environ.get("NASA_ATLAS_CONTACT", "").strip()
    if not re.fullmatch(r"(?:[^@\s]+@[^@\s]+\.[^@\s]+|https://\S+)", contact):
        raise ValueError("NASA_ATLAS_CONTACT must contain a valid email or public HTTPS contact URL")
    headers = {"User-Agent": f"RELICNASAAtlas/2.0 (contact: {contact})"}
    at = (at or datetime.now(timezone.utc)).astimezone(timezone.utc).replace(second=0, microsecond=0)
    instant = at.strftime("%Y-%m-%d %H:%M")
    params = {
        "format": "json", "COMMAND": f"'{TARGETS[body]}'", "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES", "EPHEM_TYPE": "VECTORS", "CENTER": "'500@10'",
        "OUT_UNITS": "'KM-S'", "TIME_TYPE": "UT", "TLIST": f"'{instant}'",
    }
    # JPL's fair-use policy requires automated clients to send only one API
    # request at a time. Keep the GET and its fallback POST under one lock.
    with REQUEST_LOCK:
        try:
            response = requests.get(GET_URL, params=params, headers=headers, timeout=4)
            response.raise_for_status()
            return _parse(response.json(), body, at, GET_URL)
        except (requests.RequestException, ValueError, KeyError):
            batch = "!$$SOF\n" + "\n".join(
                f"{key}={value}" for key, value in params.items() if key != "format"
            ) + "\n"
            response = requests.post(
                POST_URL, files={"input": ("horizons.txt", batch), "format": (None, "json")},
                headers=headers, timeout=4,
            )
            response.raise_for_status()
            return _parse(response.json(), body, at, POST_URL)
