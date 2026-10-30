"""Refresh the browser's NASA/JPL Horizons planetary states, one request at a time.

The browser reads this versioned local file: NASA's SSD APIs may not be embedded
cross-origin. UTC geometric, heliocentric J2000 ecliptic vectors are used, without
light-time aberration. The repository's public issue page is the product contact.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
CONTACT = "https://github.com/Jul1-art/RELIC/issues"
TARGETS = {"mercury": ("199", "6 h"), "venus": ("299", "12 h"),
           "earth": ("399", "12 h"), "mars": ("499", "1 d"),
           "jupiter": ("599", "6 h"), "saturn": ("699", "1 d"),
           "uranus": ("799", "1 d"), "neptune": ("899", "1 d"), "moon": ("301", "6 h")}


def request_states(target, *, start=None, stop=None, step=None, times=None):
    params = {"COMMAND": target, "OBJ_DATA": "NO", "MAKE_EPHEM": "YES",
              "EPHEM_TYPE": "VECTORS", "CENTER": "500@10", "OUT_UNITS": "KM-D",
              "TIME_TYPE": "UT", "REF_PLANE": "ECLIPTIC", "REF_SYSTEM": "ICRF",
              "VEC_CORR": "NONE", "CSV_FORMAT": "YES", "VEC_TABLE": "2"}
    if times is not None:
        params["TLIST"] = " ".join(map(str, times))
    else:
        params.update(START_TIME=start, STOP_TIME=stop, STEP_SIZE=step)
    url = API + "?" + urlencode({"format": "json", **{key: "'" + value + "'" for key, value in params.items()}})
    request = Request(url, headers={"User-Agent": f"RELIC-Atlas/3.0 (contact: {CONTACT})"})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=90) as response:
                payload = json.load(response)
            break
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
            time.sleep(max(10, int(error.headers.get("Retry-After", "15"))))
    signature = payload.get("signature", {})
    if signature.get("version") not in ("1.2", "1.3"):
        raise ValueError(f"Review changed Horizons API version: {signature.get('version')}")
    result = payload.get("result", "")
    match = re.search(r"\$\$SOE\s*\n(.*?)\n\$\$EOE", result, re.S)
    if not match:
        raise ValueError(payload.get("error") or result[:300] or "Horizons returned no states")
    rows = []
    for row in csv.reader(io.StringIO(match.group(1))):
        values = [float(row[0]), *[float(value) for value in row[2:8]]]
        if len(values) != 7 or not all(math.isfinite(value) for value in values):
            raise ValueError("Invalid Horizons state")
        # Millimetre positions and micrometre/day velocity rounding are smaller
        # than the interpolation error and keep the static download compact.
        rows.append([values[0], *[round(value, 3) for value in values[1:4]],
                     *[round(value, 6) for value in values[4:]]])
    solution = re.search(r"Target body name:\s*(.+)", result)
    return {"states": rows, "solution": solution.group(1).strip() if solution else target,
            "apiVersion": signature["version"], "requestUrl": url}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", default="2025-01-01")
    parser.add_argument("--stop", default="2033-01-01")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[2] / "assets/ephemeris/planets-horizons.json")
    parser.add_argument("--body", action="append", choices=TARGETS, help="Refresh only the named body (repeatable)")
    parser.add_argument("--extend", action="store_true", help="Preserve the other bodies in the existing catalogue")
    args = parser.parse_args()
    catalogue = {"version": 1, "source": "NASA/JPL Horizons", "sourceUrl": "https://ssd.jpl.nasa.gov/horizons/",
                 "documentation": "https://ssd-api.jpl.nasa.gov/doc/horizons.html",
                 "apiPolicy": "https://ssd-api.jpl.nasa.gov/doc/", "retrievedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                 "frame": "heliocentric J2000 ecliptic / ICRF", "center": "500@10", "timeScale": "UTC",
                 "units": {"position": "km", "velocity": "km/day", "epoch": "JD UTC"},
                 "correction": "geometric / NONE", "interpolation": "cubic Hermite; no extrapolation",
                 "start": args.start + "T00:00:00Z", "stop": args.stop + "T00:00:00Z", "bodies": {}}
    if args.extend:
        existing = json.loads(args.output.read_text(encoding="utf-8"))
        if any(existing[key] != catalogue[key] for key in ("frame", "center", "timeScale", "units", "start", "stop")):
            raise ValueError("Existing ephemeris frame, units or date coverage do not match")
        catalogue["bodies"] = existing["bodies"]
    chosen = args.body or list(TARGETS)
    for body in chosen:
        target, step = TARGETS[body]
        print(f"Requesting {body}: {step}", flush=True)
        data = request_states(target, start=args.start, stop=args.stop, step=step)
        catalogue["bodies"][body] = {"target": target, "step": step, **data}
        print(f"  {len(data['states'])} states; {data['solution']}", flush=True)
        time.sleep(1)  # One API request at a time, reused for years of local rendering.
    for body in chosen:
        entry = catalogue["bodies"][body]
        print(f"Checking independent {body} midpoints", flush=True)
        entry["validationStates"] = midpoint_validation(entry)
        time.sleep(1)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(catalogue, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {args.output.name}: {args.output.stat().st_size:,} bytes", flush=True)


def midpoint_validation(entry):
    """Independent API outputs between stored samples, spread across coverage."""
    rows = entry["states"]
    indexes = sorted(set(int((len(rows) - 2) * fraction / 19) for fraction in range(20)))
    times = [(rows[index][0] + rows[index + 1][0]) / 2 for index in indexes]
    return request_states(entry["target"], times=times)["states"]


if __name__ == "__main__":
    main()
