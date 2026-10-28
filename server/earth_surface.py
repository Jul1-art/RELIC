"""Small surveyed surface corrections where radar elevation contains hard-surface noise."""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np


# Service de l'Information Aéronautique, AIP France AD 1.3, LFMN.
# Threshold positions and elevations: 04L/22R 9.9/10 ft, 04R/22L 9.5/11 ft.
# Both runways are 45 m wide. Heights below are metres above the same sea-level
# datum used by SRTM; outside paved surfaces the measured SRTM is retained.
# https://www.sia.aviation-civile.gouv.fr/documents/download/f/d/15031542/
NICE_RUNWAYS = (
    ("04L/22R", (7.2040417, 43.6518056), (7.2270611, 43.6685444), 9.9 * .3048, 10 * .3048),
    ("04R/22L", (7.2024944, 43.6467389), (7.2284444, 43.6656083), 9.5 * .3048, 11 * .3048),
)
EDGE_BLEND_METRES = 75.0
RUNWAY_DATA = Path(__file__).resolve().parents[1] / "assets" / "runways-paved.json"


def _runways_and_index():
    payload = json.loads(RUNWAY_DATA.read_text())
    runways = [tuple(item) for item in payload["runways"]]
    runways.extend((lon0, lat0, lon1, lat1, h0, h1, 45.0, f"LFMN {name}")
                   for name, (lon0, lat0), (lon1, lat1), h0, h1 in NICE_RUNWAYS)
    index = {}
    for number, (lon0, lat0, lon1, lat1, _h0, _h1, width, _name) in enumerate(runways):
        margin_lat = (width / 2 + EDGE_BLEND_METRES) / 111_320
        margin_lon = margin_lat / max(.1, math.cos(math.radians((lat0 + lat1) / 2)))
        for lat_cell in range(math.floor(min(lat0, lat1) - margin_lat), math.floor(max(lat0, lat1) + margin_lat) + 1):
            for lon_cell in range(math.floor(min(lon0, lon1) - margin_lon), math.floor(max(lon0, lon1) + margin_lon) + 1):
                index.setdefault((lat_cell, lon_cell), []).append(number)
    return runways, index


RUNWAYS, RUNWAY_INDEX = _runways_and_index()


def correct_runways(lon, lat, heights, level=12):
    """Level surveyed paved strips; fade into NASA elevations beyond each edge."""
    if level < 10:
        return heights
    candidates = set()
    for lat_cell in range(math.floor(float(np.min(lat))), math.floor(float(np.max(lat))) + 1):
        for lon_cell in range(math.floor(float(np.min(lon))), math.floor(float(np.max(lon))) + 1):
            candidates.update(RUNWAY_INDEX.get((lat_cell, lon_cell), ()))
    if not candidates:
        return heights
    corrected = heights.copy()
    min_lon, max_lon = float(np.min(lon)), float(np.max(lon))
    min_lat, max_lat = float(np.min(lat)), float(np.max(lat))
    for number in candidates:
        lon0, lat0, lon1, lat1, start_height, end_height, width, _name = RUNWAYS[number]
        metres_per_lon = 111_320 * np.cos(np.radians((lat0 + lat1) / 2))
        margin_lat = (width / 2 + EDGE_BLEND_METRES) / 111_320
        margin_lon = (width / 2 + EDGE_BLEND_METRES) / metres_per_lon
        if max_lon < min(lon0, lon1) - margin_lon or min_lon > max(lon0, lon1) + margin_lon or max_lat < min(lat0, lat1) - margin_lat or min_lat > max(lat0, lat1) + margin_lat:
            continue
        x = (lon - lon0) * metres_per_lon
        y = (lat - lat0) * 111_320
        dx = (lon1 - lon0) * metres_per_lon
        dy = (lat1 - lat0) * 111_320
        projection = np.clip((x * dx + y * dy) / (dx * dx + dy * dy), 0, 1)
        distance = np.hypot(x - projection * dx, y - projection * dy)
        transition = np.clip((distance - width / 2) / EDGE_BLEND_METRES, 0, 1)
        weight = 1 - transition * transition * (3 - 2 * transition)
        runway_height = start_height + projection * (end_height - start_height)
        corrected += weight * (runway_height - corrected)
    return corrected.astype(np.float32)
