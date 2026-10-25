"""Small, cached Photon place search for the atlas search box."""

from __future__ import annotations

import math
import threading
import time
from collections import OrderedDict

import requests


PHOTON_URL = "https://photon.komoot.io/api/"
CACHE: OrderedDict[tuple, tuple[float, list[dict]]] = OrderedDict()
LOCK = threading.Lock()
LAST_REQUEST = 0.0


def camera_range(properties: dict, lat: float) -> int:
    """Choose a useful oblique camera distance from a Photon's footprint/type."""
    extent = properties.get("extent")
    if isinstance(extent, list) and len(extent) == 4:
        try:
            west, north, east, south = map(float, extent)
            if -180 <= west <= east <= 180 and -90 <= south <= north <= 90:
                width = max(
                    (north - south) * 111_000,
                    (east - west) * 111_000 * max(0.02, math.cos(math.radians(lat))),
                )
                if width > 0:
                    return round(max(1800, min(4_000_000, width * 2.2)))
        except (TypeError, ValueError):
            pass
    kind = str(properties.get("osm_value") or properties.get("type") or "").lower()
    return {
        "country": 1_500_000,
        "state": 300_000,
        "city": 35_000,
        "town": 22_000,
        "village": 9_000,
        "district": 9_000,
        "suburb": 8_000,
        "street": 5_000,
        "aerodrome": 6_000,
        "airport": 6_000,
        "park": 6_000,
    }.get(kind, 2_600)


def normalize_feature(feature: dict) -> dict | None:
    geometry = feature.get("geometry") or {}
    coordinates = geometry.get("coordinates")
    if geometry.get("type") != "Point" or not isinstance(coordinates, list) or len(coordinates) < 2:
        return None
    try:
        lon, lat = float(coordinates[0]), float(coordinates[1])
    except (TypeError, ValueError):
        return None
    if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    properties = feature.get("properties") or {}
    name = str(properties.get("name") or properties.get("street") or "").strip()
    if not name:
        return None
    detail = ", ".join(
        part for part in dict.fromkeys(
            str(properties.get(key) or "").strip()
            for key in ("housenumber", "street", "district", "city", "state", "country")
        ) if part and part != name
    )
    return {
        "id": f"{properties.get('osm_type', '')}:{properties.get('osm_id', '')}:{lat:.5f}:{lon:.5f}",
        "name": name[:120],
        "detail": detail[:180],
        "lat": lat,
        "lon": lon,
        "range": camera_range(properties, lat),
    }


def search_places(query: str, lang: str = "fr", lat: float | None = None, lon: float | None = None) -> list[dict]:
    """Return at most six places; serialize and cache demo-server requests."""
    global LAST_REQUEST
    query = query.strip()
    if not 2 <= len(query) <= 120:
        raise ValueError("Search must contain 2 to 120 characters")
    lang = "en" if lang == "en" else "fr"
    bias = None
    if lat is not None and lon is not None and math.isfinite(lat) and math.isfinite(lon):
        if -90 <= lat <= 90 and -180 <= lon <= 180:
            bias = (round(lat, 1), round(lon, 1))
    key = (query.casefold(), lang, bias)
    with LOCK:
        now = time.monotonic()
        cached = CACHE.get(key)
        if cached and cached[0] > now:
            CACHE.move_to_end(key)
            return cached[1]
        if cached:
            del CACHE[key]
        time.sleep(max(0, 0.75 - (now - LAST_REQUEST)))
        params = {"q": query, "limit": 6, "lang": lang}
        if bias:
            params.update({"lat": bias[0], "lon": bias[1]})
        LAST_REQUEST = time.monotonic()
        response = requests.get(
            PHOTON_URL,
            params=params,
            timeout=7,
            headers={"User-Agent": "relic-Atlas/2.0 (interactive place search)"},
        )
        response.raise_for_status()
        features = response.json().get("features")
        if not isinstance(features, list):
            raise ValueError("Invalid Photon response")
        places = [item for feature in features if (item := normalize_feature(feature))]
        CACHE[key] = (time.monotonic() + (900 if places else 60), places[:6])
        while len(CACHE) > 128:
            CACHE.popitem(last=False)
        return places[:6]
