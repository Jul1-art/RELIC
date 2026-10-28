"""Serve the atlas and NASA heightmap tiles generated on demand.

Downloaded source data stays in ~/.cache/relic. NASA elevation
reaches the browser as small 65×65 float32 tiles.
"""

from __future__ import annotations

import io
import json
import math
import os
import re
import threading
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import lru_cache
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse, urlsplit, urlunsplit

import numpy as np
import requests

from .live_sources import horizons, noaa_swpc
from .live_sources.cache import LiveCache
from .earth_surface import correct_runways
from .place_search import search_places
from .planetary_patches import JEZERO, TYCHO, blend_patch, tycho_image_tile


ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(os.environ.get("NASA_ATLAS_CACHE", Path.home() / ".cache/relic"))
CACHE.mkdir(parents=True, exist_ok=True)
TILES = CACHE / "height-tiles-v2"
TILES.mkdir(exist_ok=True)
PLANET_TILES = CACHE / "height-tiles-planets-v4"
PLANET_TILES.mkdir(exist_ok=True)
TYCHO_IMAGE_TILES = CACHE / "imagery-tycho-v1"
TYCHO_IMAGE_TILES.mkdir(exist_ok=True)
EARTH_TILES = CACHE / "height-tiles-earth-v4"
EARTH_TILES.mkdir(exist_ok=True)
LIVE = LiveCache(CACHE / "live-v1")
SIZE = 65
MOLA128 = "https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg128"
SRTM = "https://step.esa.int/auxdata/dem/SRTMGL1"
LOLA64 = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_64_uint.tif"
MOLA16 = "https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg016/megt90n000eb.img"
APOLLO = "https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/APOLLO11/NAC_DTM_APOLLO11.TIF"
HEADERS = {"User-Agent": "relic-Atlas/2.0"}
SOURCE_LOCKS = {name: threading.Lock() for name in ("moon", "mars", "apollo")}


def download_once(path: Path, url: str, expected: int):
    if path.exists() and path.stat().st_size == expected:
        return
    partial = path.with_suffix(path.suffix + ".part")
    response = requests.get(url, headers=HEADERS, stream=True, timeout=120)
    response.raise_for_status()
    with partial.open("wb") as file:
        for chunk in response.iter_content(1024 * 1024):
            file.write(chunk)
    if partial.stat().st_size != expected:
        raise ValueError(f"NASA file incomplete: {path.name}")
    partial.replace(path)


@lru_cache(maxsize=1)
def mola16():
    with SOURCE_LOCKS["mars"]:
        path = CACHE / "megt90n000eb.img"
        download_once(path, MOLA16, 33177600)
    return np.memmap(path, dtype=">i2", mode="r", shape=(2880, 5760))


@lru_cache(maxsize=1)
def lola64():
    with SOURCE_LOCKS["moon"]:
        path = CACHE / "ldem_64_uint.tif"
        download_once(path, LOLA64, 530934146)
    # NASA SVS TIFF: one uncompressed, little-endian row per strip, offset 8.
    return np.memmap(path, dtype="<u2", mode="r", offset=8, shape=(11520, 23040))


@lru_cache(maxsize=1)
def apollo_dtm():
    with SOURCE_LOCKS["apollo"]:
        path = CACHE / "NAC_DTM_APOLLO11.TIF"
        download_once(path, APOLLO, 118142727)
    # PDS GeoTIFF: one uncompressed 32-bit float row per strip, offset 112495.
    return np.memmap(path, dtype="<f4", mode="r", offset=112495, shape=(13978, 2111))


@lru_cache(maxsize=8)
def srtm_tile(lat: int, lon: int):
    name = f"{'N' if lat >= 0 else 'S'}{abs(lat):02d}{'E' if lon >= 0 else 'W'}{abs(lon):03d}"
    path = CACHE / "srtm" / (name + ".zip")
    path.parent.mkdir(exist_ok=True)
    if not path.exists():
        url = f"{SRTM}/{name}.SRTMGL1.hgt.zip"
        response = requests.get(url, headers=HEADERS, timeout=40)
        if response.status_code == 404:
            return None
        response.raise_for_status()
        path.write_bytes(response.content)
    with zipfile.ZipFile(io.BytesIO(path.read_bytes())) as archive:
        member = next((n for n in archive.namelist() if n.lower().endswith(".hgt")), None)
        if member is None:
            return None
        return np.frombuffer(archive.read(member), dtype=">i2").reshape(3601, 3601)


def bilinear(raster, fx, fy):
    fx = np.clip(fx, 0, raster.shape[1] - 1.001)
    fy = np.clip(fy, 0, raster.shape[0] - 1.001)
    x0 = np.floor(fx).astype(np.int32)
    y0 = np.floor(fy).astype(np.int32)
    tx = fx - x0
    ty = fy - y0
    a = raster[y0, x0].astype(np.float32)
    b = raster[y0, x0 + 1].astype(np.float32)
    c = raster[y0 + 1, x0].astype(np.float32)
    d = raster[y0 + 1, x0 + 1].astype(np.float32)
    return ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty).astype(np.float32)


def tile_coordinates(z: int, x: int, y: int):
    columns = 2 ** (z + 1)
    rows = 2 ** z
    longs = (x + np.linspace(0, 1, SIZE)) / columns * 360 - 180
    lats = 90 - (y + np.linspace(0, 1, SIZE)) / rows * 180
    return np.meshgrid(longs, lats)


def earth_height(lon, lat, z):
    values = np.zeros(lon.shape, dtype=np.float32)
    # Broad globe tiles stay light. SRTMGL1 resolves land from 56°S to 60°N.
    if z < 7:
        return values
    valid = (lat >= -56) & (lat <= 60)
    if not valid.any():
        return values
    floor_lat = np.floor(lat).astype(np.int16)
    floor_lon = np.floor(lon).astype(np.int16)
    for lt, ln in sorted(set(zip(floor_lat[valid].flat, floor_lon[valid].flat))):
        mask = valid & (floor_lat == lt) & (floor_lon == ln)
        raster = srtm_tile(int(lt), int(ln))
        if raster is None:
            continue
        samples = bilinear(raster, (lon[mask] - ln) * 3600, (lt + 1 - lat[mask]) * 3600)
        samples[samples < -1000] = 0  # SRTM void sentinel, ocean or gaps.
        values[mask] = samples
    return correct_runways(lon, lat, values, z)


def mola128_height(lon, lat):
    values = np.zeros(lon.shape, dtype=np.float32)
    north_bands = np.clip(np.ceil((lat + 1e-9) / 44) * 44, -44, 88).astype(np.int16)
    sectors = (np.floor((lon % 360) / 90) * 90).astype(np.int16)
    for north, sector in sorted(set(zip(north_bands.flat, sectors.flat))):
        mask = (north_bands == north) & (sectors == sector)
        row_coords = (north - lat[mask]) * 128 - .5
        first = max(0, math.floor(float(row_coords.min())) - 1)
        last = min(5631, math.ceil(float(row_coords.max())) + 2)
        band = f"{abs(int(north)):02d}{'n' if north >= 0 else 's'}"
        name = f"megt{band}{int(sector):03d}hb.img"
        url = f"{MOLA128}/{name}"
        start, end = first * 23040, (last + 1) * 23040 - 1
        response = requests.get(url, headers={**HEADERS, "Range": f"bytes={start}-{end}"}, timeout=45)
        response.raise_for_status()
        if response.status_code != 206 or len(response.content) != end - start + 1:
            raise ValueError(f"Invalid NASA MOLA range response for {name}")
        raster = np.frombuffer(response.content, dtype=">i2").reshape(last - first + 1, 11520)
        fx = ((lon[mask] % 360) - sector) * 128 - .5
        values[mask] = bilinear(raster, fx, row_coords - first)
    return values


def mars_height(lon, lat, z):
    if z >= 9:
        values = mola128_height(lon, lat)
    else:
        raster = mola16()
        values = bilinear(raster, (lon % 360) * 16 - .5, (90 - lat) * 16 - .5)
    if z >= 10:
        values = blend_patch(CACHE, JEZERO, lon, lat, values)
    return values


def moon_height(lon, lat, z):
    raster = lola64()
    values = (bilinear(raster, ((lon + 180) % 360) * 64 - .5, (90 - lat) * 64 - .5) - 20000) / 2
    # A locally measured 2 m/pixel NASA LROC NAC DTM replaces LOLA only inside
    # its actual footprint. Everywhere else the global LOLA surface remains.
    if z >= 10:
        inside = (lon >= 23.3722758) & (lon <= 23.5115296) & (lat >= .314609) & (lat <= 1.2365388)
        if inside.any():
            x = (lon[inside] - 23.3722758) / (23.5115296 - 23.3722758) * 2111 - .5
            y = (1.2365388 - lat[inside]) / (1.2365388 - .314609) * 13978 - .5
            samples = bilinear(apollo_dtm(), x, y)
            valid = samples > -100000
            subsection = values[inside]
            subsection[valid] = samples[valid]
            values[inside] = subsection
    if z >= 10:
        values = blend_patch(CACHE, TYCHO, lon, lat, values)
    return values.astype(np.float32)


def height_tile(body: str, z: int, x: int, y: int):
    if body not in ("earth", "mars", "moon") or z < 0 or z > 17:
        raise ValueError("Invalid NASA terrain request")
    if x < 0 or x >= 2 ** (z + 1) or y < 0 or y >= 2 ** z:
        raise ValueError("Invalid tile coordinates")
    path = (EARTH_TILES if body == "earth" else PLANET_TILES / body) / str(z) / str(x) / f"{y}.bin"
    if path.exists() and path.stat().st_size == SIZE * SIZE * 4:
        return path.read_bytes()
    lon, lat = tile_coordinates(z, x, y)
    values = {"earth": earth_height, "mars": mars_height, "moon": moon_height}[body](lon, lat, z)
    raw = np.asarray(values, dtype="<f4").tobytes()
    if len(raw) != SIZE * SIZE * 4 or not np.isfinite(values).all():
        raise ValueError("NASA terrain tile contains invalid elevations")
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(f".{threading.get_ident()}.partial")
    temp.write_bytes(raw)
    temp.replace(path)
    return raw


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".m4s": "video/iso.segment",
        ".webmanifest": "application/manifest+json",
    }

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("directory", str(ROOT))
        self._byte_range = None
        super().__init__(*args, **kwargs)

    @staticmethod
    def _private_component(component):
        name = component.lower()
        return (
            name.startswith(".")
            or name in {"cert", "certs", "certificate", "certificates", "private", "secrets", "localconfig", "local-config", "local_config"}
            or re.search(r"(?:^|[._-])local[._-]?(?:config|settings)(?:[._-]|$)", name) is not None
            or re.search(r"[._-]local(?:[._-]|$)", name) is not None
            or name.endswith((".pem", ".key", ".p12", ".pfx", ".crt", ".cer", ".env"))
            or (name.endswith(".json") and re.search(r"config|settings|credentials?|secrets?|tokens?|api[-_]?keys?|service[-_]?account", name) is not None)
        )

    def _validated_request_path(self):
        """Validate before any filesystem normalization can hide traversal."""
        try:
            path = unquote(urlsplit(self.path).path, errors="strict")
        except (ValueError, UnicodeError):
            return None
        if not path.startswith("/") or "\\" in path or any(ord(char) < 32 or ord(char) == 127 for char in path):
            return None
        # Reject double encoding as well: a second decoder must not reveal a
        # hidden path or traversal that this check cannot see.
        if unquote(path) != path:
            return None
        if any(self._private_component(part) for part in path.split("/") if part):
            return None
        return path

    def log_request(self, code="-", size="-"):
        # Browser credentials or search parameters must never enter access logs.
        route = self.path.partition("?")[0]
        self.log_message('"%s %s %s" %s %s', self.command, route, self.request_version, str(code), str(size))

    def log_error(self, format, *args):
        # Some API validation messages echo user input. The access log already
        # records the status, so avoid logging those messages or raw request lines.
        self.log_message("HTTP request error")

    def do_HEAD(self):
        if self._validated_request_path() is None:
            return self.send_error(403, "Private or invalid path")
        if urlsplit(self.path).path == "/api/cesium-token":
            return self.send_error(410, "Configure your own browser token in API settings")
        return super().do_HEAD()

    def list_directory(self, path):
        self.send_error(403, "Directory listing is disabled")
        return None

    def send_head(self):
        """Serve confined static files, with single byte ranges for media."""
        self._byte_range = None
        route = self._validated_request_path()
        if route is None:
            self.send_error(403, "Private or invalid path")
            return None
        root = Path(self.directory).resolve()
        try:
            path = (root / route.lstrip("/")).resolve()
            relative = path.relative_to(root)
            if any(self._private_component(part) for part in relative.parts):
                raise ValueError("Private path")
        except (OSError, ValueError):
            self.send_error(403, "Private or invalid path")
            return None
        if path.is_dir():
            indexes = [path / name for name in ("index.html", "index.htm")]
            path = next((index for index in indexes if index.is_file()), None)
            if path is None:
                return self.list_directory(str(root / route.lstrip("/")))
            # Resolve index symlinks too, including links into hidden folders.
            try:
                resolved_index = path.resolve()
                if any(self._private_component(part) for part in resolved_index.relative_to(root).parts):
                    raise ValueError("Private index")
                path = resolved_index
            except (OSError, ValueError):
                self.send_error(403, "Private or invalid path")
                return None
            if not route.endswith("/"):
                parsed = urlsplit(self.path)
                location = urlunsplit(("", "", quote(route + "/"), parsed.query, ""))
                self.send_response(301)
                self.send_header("Location", location)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return None
        try:
            file = path.open("rb")
        except (OSError, ValueError):
            self.send_error(404, "File not found")
            return None
        try:
            stat = os.fstat(file.fileno())
            size = stat.st_size
            modified = self.date_time_string(stat.st_mtime)
            etag = f'"{stat.st_mtime_ns:x}-{size:x}"'
            start, end = 0, size - 1
            # Range applies to GET only. HEAD returns the full representation's
            # headers and no body, even when a client supplies a Range header.
            range_header = self.headers.get("Range") if self.command == "GET" else None
            if self.headers.get("If-Range") not in (None, etag, modified):
                range_header = None
            if range_header:
                match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header.strip())
                valid = match is not None and any(match.groups()) and max(map(len, match.groups())) <= 20 and size > 0
                if valid:
                    first, last = match.groups()
                    if first:
                        start = int(first)
                        end = min(int(last), size - 1) if last else size - 1
                        valid = start < size and end >= start
                    else:
                        suffix = int(last)
                        start = max(0, size - suffix)
                        valid = suffix > 0
                if not valid:
                    file.close()
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.send_header("Accept-Ranges", "bytes")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return None
                self._byte_range = (start, end)
                file.seek(start)
            self.send_response(206 if self._byte_range is not None else 200)
            self.send_header("Content-Type", self.guess_type(str(path)))
            self.send_header("Content-Length", str(end - start + 1))
            self.send_header("Last-Modified", modified)
            self.send_header("ETag", etag)
            self.send_header("Accept-Ranges", "bytes")
            if self._byte_range is not None:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()
            return file
        except BaseException:
            file.close()
            raise

    def copyfile(self, source, outputfile):
        if self._byte_range is None:
            return super().copyfile(source, outputfile)
        start, end = self._byte_range
        remaining = end - start + 1
        while remaining:
            chunk = source.read(min(64 * 1024, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)

    def do_GET(self):
        if self._validated_request_path() is None:
            return self.send_error(403, "Private or invalid path")
        parsed_url = urlparse(self.path)
        route = parsed_url.path
        if route == "/api/places":
            query = parse_qs(parsed_url.query)
            try:
                text = query.get("q", [""])[0]
                lang = query.get("lang", ["fr"])[0]
                lat = float(query["lat"][0]) if "lat" in query else None
                lon = float(query["lon"][0]) if "lon" in query else None
                places = search_places(text, lang, lat, lon)
            except (ValueError, IndexError) as error:
                return self.send_error(400, str(error))
            except (requests.RequestException, OSError) as error:
                print(f"Photon place search unavailable: {type(error).__name__}")
                return self.send_error(503, "Place search temporarily unavailable")
            raw = json.dumps({"places": places, "source": "Photon / OpenStreetMap"}, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "private, max-age=60")
            self.end_headers()
            self.wfile.write(raw)
            return
        if route == "/api/cesium-token":
            return self.send_error(410, "Configure your own browser token in API settings")
        if route == "/api/live/atlas":
            with ThreadPoolExecutor(max_workers=2) as executor:
                wind_task = executor.submit(LIVE.get, "noaa-wind", 120, noaa_swpc.fetch)
                tasks = {
                    body: executor.submit(LIVE.get, f"horizons-{body}", 600, lambda body=body: horizons.fetch(body))
                    for body in horizons.TARGETS
                }
                positions = {body: task.result() for body, task in tasks.items()}
                wind = wind_task.result()
            payload = {
                "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "positions": positions,
                "solarWind": wind,
                "cacheSeconds": {"positions": 600, "solarWind": 120},
            }
            raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(raw)
            return
        image_match = re.fullmatch(r"/api/imagery/moon/tycho/(\d{1,2})/(\d+)/(\d+)\.png", route)
        if image_match:
            z, x, y = map(int, image_match.groups())
            if z < 7 or z > 15 or x < 0 or x >= 2 ** (z + 1) or y < 0 or y >= 2 ** z:
                return self.send_error(400, "Invalid lunar imagery tile")
            path = TYCHO_IMAGE_TILES / str(z) / str(x) / f"{y}.png"
            try:
                if path.exists():
                    raw = path.read_bytes()
                else:
                    raw = tycho_image_tile(CACHE, z, x, y)
                    path.parent.mkdir(parents=True, exist_ok=True)
                    temp = path.with_suffix(f".{threading.get_ident()}.partial")
                    temp.write_bytes(raw)
                    temp.replace(path)
            except (ValueError, requests.RequestException, OSError) as error:
                return self.send_error(503, f"NASA LROC imagery unavailable: {error}")
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "public, max-age=604800")
            self.end_headers()
            self.wfile.write(raw)
            return
        match = re.fullmatch(r"/api/height/(earth|mars|moon)/(\d{1,2})/(\d+)/(\d+)\.bin", route)
        if not match:
            return super().do_GET()
        try:
            body, z, x, y = match.groups()
            raw = height_tile(body, int(z), int(x), int(y))
        except ValueError as error:
            return self.send_error(400, str(error))
        except (requests.RequestException, OSError, zipfile.BadZipFile) as error:
            return self.send_error(503, f"NASA source temporarily unavailable: {error}")
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "public, max-age=604800")
        self.end_headers()
        self.wfile.write(raw)


def main():
    from tools.restore_film import restore_films
    if not (ROOT / "intro/assets/prologue/encoding-v9-hd50.json").is_file():
        restore_films(ROOT)
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("NASA_ATLAS_PORT", "8000"))), Handler).serve_forever()


if __name__ == "__main__":
    main()
