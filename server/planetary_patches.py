"""Measured HiRISE/LROC terrain patches and the matching Tycho orthophoto.

The large original PDS products live in the atlas cache, never in the web root.
Only the requested 65×65 height grids or 256×256 image tiles are served.
"""

from __future__ import annotations

import io
import math
import threading
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
import requests
from PIL import Image
from scipy.ndimage import distance_transform_edt


BASE = "https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001"
JEZERO_URL = "https://www.uahirise.org/PDS/DTM/ESP/ORB_045900_045999/ESP_045994_1985_ESP_046060_1985/DTEEC_045994_1985_046060_1985_U01.IMG"
TYCHO_URL = f"{BASE}/DATA/SDP/NAC_DTM/TYCHOPK/NAC_DTM_TYCHOPK_E434S3486.IMG"
TYCHO_IMAGE_URL = f"{BASE}/EXTRAS/BROWSE/NAC_DTM/TYCHOPK/NAC_DTM_TYCHOPK_MOSAIC_2M.TIF"
_download_lock = threading.Lock()


@dataclass(frozen=True)
class Patch:
    name: str
    url: str
    size: int
    offset: int
    shape: tuple[int, int]
    center_lon: float
    center_lat: float
    resolution: float
    sample_offset: float
    line_offset: float
    bounds: tuple[float, float, float, float]  # west, south, east, north

    def pixel_coordinates(self, lon, lat):
        x = self.sample_offset + (lon - self.center_lon) * self.resolution * math.cos(math.radians(self.center_lat))
        y = self.line_offset - lat * self.resolution
        return x, y


JEZERO = Patch(
    "DTEEC_045994_1985_046060_1985_U01.IMG", JEZERO_URL, 380814764,
    26692, (14266, 6673), 77.44, 15, 58684.0491709, 3210.5, 1088495.5,
    (77.3833804, 18.30529355, 77.50109494, 18.5483911),
)
TYCHO = Patch(
    "NAC_DTM_TYCHOPK_E434S3486.IMG", TYCHO_URL, 1512521280,
    48960, (30892, 12240), 348.6, -43.3, 15161.675212075, 5919.5, -642353.5,
    (348.06342893, -44.40436103, 349.17263597, -42.36685531),
)


def _download(path: Path, url: str, expected: int):
    if path.exists() and path.stat().st_size == expected:
        return
    with _download_lock:
        if path.exists() and path.stat().st_size == expected:
            return
        partial = path.with_suffix(path.suffix + ".part")
        with requests.get(url, headers={"User-Agent": "relic-Atlas/2.0"}, stream=True, timeout=120) as response:
            response.raise_for_status()
            with partial.open("wb") as target:
                for chunk in response.iter_content(1024 * 1024):
                    target.write(chunk)
        if partial.stat().st_size != expected:
            raise ValueError(f"Incomplete NASA PDS product: {path.name}")
        partial.replace(path)


@lru_cache(maxsize=2)
def _raster(cache: Path, patch: Patch):
    path = cache / patch.name
    _download(path, patch.url, patch.size)
    return np.memmap(path, dtype="<f4", mode="r", offset=patch.offset, shape=patch.shape)


@lru_cache(maxsize=2)
def _confidence(cache: Path, patch: Patch):
    # Source-pixel distance to a NoDATA boundary, sampled every eight pixels.
    # The resulting transition is continuous even around narrow internal holes.
    raster = _raster(cache, patch)
    sample = raster[::8, ::8]
    valid = np.isfinite(sample) & (sample > -1e7)
    padded = np.pad(valid, 1, constant_values=False)
    return distance_transform_edt(padded).astype(np.float32)


def _bilinear_valid(raster, x, y):
    x = np.clip(x, 0, raster.shape[1] - 1.001)
    y = np.clip(y, 0, raster.shape[0] - 1.001)
    x0, y0 = np.floor(x).astype(np.int32), np.floor(y).astype(np.int32)
    tx, ty = x - x0, y - y0
    total = np.zeros(x.shape, np.float32)
    weight = np.zeros(x.shape, np.float32)
    for dy, wy in ((0, 1 - ty), (1, ty)):
        for dx, wx in ((0, 1 - tx), (1, tx)):
            value = raster[y0 + dy, x0 + dx].astype(np.float32)
            part = (wx * wy).astype(np.float32)
            good = np.isfinite(value) & (value > -1e7)
            total += np.where(good, value, 0) * part
            weight += good * part
    return np.divide(total, weight, out=np.zeros_like(total), where=weight > 0), weight


def blend_patch(cache: Path, patch: Patch, lon, lat, global_heights):
    west, south, east, north = patch.bounds
    longitude = lon % 360 if patch is TYCHO else lon
    inside = (longitude >= west) & (longitude <= east) & (lat >= south) & (lat <= north)
    if not inside.any():
        return global_heights
    x, y = patch.pixel_coordinates(longitude[inside], lat[inside])
    valid_area = (x >= 0) & (x < patch.shape[1] - 1) & (y >= 0) & (y < patch.shape[0] - 1)
    if not valid_area.any():
        return global_heights
    raster = _raster(cache, patch)
    samples, valid_weight = _bilinear_valid(raster, x[valid_area], y[valid_area])
    confidence = _confidence(cache, patch)
    distance, _ = _bilinear_valid(confidence, x[valid_area] / 8 + 1, y[valid_area] / 8 + 1)
    alpha = np.clip(distance / 32 * valid_weight, 0, 1)  # 256 source pixels
    # The PDS labels use the same planetary reference radius as the globe.
    output = global_heights.copy()
    inside_values = output[inside]
    inside_values[valid_area] = inside_values[valid_area] * (1 - alpha) + samples * alpha
    output[inside] = inside_values
    return output


@lru_cache(maxsize=1)
def _tycho_image(cache: Path):
    path = cache / "NAC_DTM_TYCHOPK_MOSAIC_2M.TIF"
    _download(path, TYCHO_IMAGE_URL, 378366061)
    # Uncompressed, one 8-bit strip per row; offsets are verified from GeoTIFF.
    return np.memmap(path, dtype="u1", mode="r", offset=247981, shape=TYCHO.shape)


def tycho_image_tile(cache: Path, z: int, tile_x: int, tile_y: int) -> bytes:
    size = 256
    columns, rows = 2 ** (z + 1), 2 ** z
    lon = ((tile_x + (np.arange(size) + .5) / size) / columns * 360 - 180) % 360
    lat = 90 - (tile_y + (np.arange(size) + .5) / size) / rows * 180
    xx, yy = TYCHO.pixel_coordinates(lon[None, :], lat[:, None])
    xx, yy = np.broadcast_arrays(xx, yy)
    valid = (xx >= 0) & (xx < TYCHO.shape[1] - 1) & (yy >= 0) & (yy < TYCHO.shape[0] - 1)
    values = np.zeros((size, size), dtype=np.uint8)
    if valid.any():
        image = _tycho_image(cache)
        x, y = xx[valid], yy[valid]
        x0, y0 = np.floor(x).astype(np.int32), np.floor(y).astype(np.int32)
        tx, ty = x - x0, y - y0
        values[valid] = np.clip(
            image[y0, x0] * (1 - tx) * (1 - ty)
            + image[y0, x0 + 1] * tx * (1 - ty)
            + image[y0 + 1, x0] * (1 - tx) * ty
            + image[y0 + 1, x0 + 1] * tx * ty,
            0, 255,
        ).astype(np.uint8)
    rgba = np.stack((values, values, values, np.where(valid & (values > 0), 255, 0).astype(np.uint8)), axis=-1)
    output = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(output, format="PNG", compress_level=1)
    return output.getvalue()
