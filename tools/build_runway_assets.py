"""Build a compact public-domain paved-runway table from OurAirports CSV."""

from __future__ import annotations

import csv
import io
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import requests


URL = "https://davidmegginson.github.io/ourairports-data/runways.csv"
OUTPUT = Path(__file__).resolve().parents[1] / "assets" / "runways-paved.json"
PAVED = ("ASP", "CON", "PEM", "BIT", "PAVED", "TAR", "MAC")


def usable(row):
    if row["closed"] != "0" or not row["surface"].upper().startswith(PAVED):
        return None
    if row["airport_ident"] == "LFMN":  # Official French AIP overrides these records.
        return None
    try:
        lon0, lat0 = float(row["le_longitude_deg"]), float(row["le_latitude_deg"])
        lon1, lat1 = float(row["he_longitude_deg"]), float(row["he_latitude_deg"])
        h0, h1 = float(row["le_elevation_ft"]) * .3048, float(row["he_elevation_ft"]) * .3048
        width = float(row["width_ft"]) * .3048
    except (TypeError, ValueError):
        return None
    if not all(map(math.isfinite, (lon0, lat0, lon1, lat1, h0, h1, width))):
        return None
    if not (-56 <= lat0 <= 60 and -56 <= lat1 <= 60 and -180 <= lon0 <= 180 and -180 <= lon1 <= 180):
        return None
    if not (8 <= width <= 120 and -500 <= h0 <= 5500 and -500 <= h1 <= 5500):
        return None
    length = math.hypot((lon1 - lon0) * 111_320 * math.cos(math.radians((lat0 + lat1) / 2)), (lat1 - lat0) * 111_320)
    if not 450 <= length <= 7000 or abs(h1 - h0) > .08 * length:
        return None
    return [round(lon0, 7), round(lat0, 7), round(lon1, 7), round(lat1, 7),
            round(h0, 2), round(h1, 2), round(width, 1), row["airport_ident"]]


def main():
    response = requests.get(URL, timeout=40)
    response.raise_for_status()
    rows = csv.DictReader(io.StringIO(response.text))
    runways = [item for row in rows if (item := usable(row)) is not None]
    runways.sort(key=lambda item: (item[7], item[1], item[0]))
    payload = {"source": URL, "generatedAt": datetime.now(timezone.utc).date().isoformat(), "runways": runways}
    OUTPUT.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"Wrote {len(runways)} paved runways to {OUTPUT}")


if __name__ == "__main__":
    main()
