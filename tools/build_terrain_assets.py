"""Build small, documented 3D terrain extracts from NASA elevation and imagery.

Run from the repository root: python3 tools/build_terrain_assets.py
Only numpy, Pillow and requests are needed. Downloads are cached outside the repo.
"""

from __future__ import annotations

import io
import json
import math
import os
import zipfile
from pathlib import Path

import numpy as np
import requests
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "terrain"
CACHE = Path(os.environ.get("NASA_TERRAIN_CACHE", "/tmp/nasa-terrain"))
OUT.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "NASA-RELIC-Terrain-Builder/1.0"})
GRID = 257
IMAGE = 1024

SITES = {
    "earth": [
        ("kennedy", 28.5, -80.5, 32),
        ("grand-canyon", 36.4, -112.2, 42),
        ("nile", 30.0, 31.0, 70),
    ],
    "mars": [
        ("jezero", 18.488, 77.403, 38),
        ("olympus", 18.0, -135.0, 600),
        ("hellas", -45.0, 70.0, 650),
    ],
    "moon": [
        ("apollo11", 0.67416, 23.47314, 5),
        ("tycho", -43.37, -11.32, 200),
        ("surveyor7", -40.97, -11.44, 40),
    ],
}

MOLA = "https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg128"
SRTM = "https://step.esa.int/auxdata/dem/SRTMGL1"
LOLA = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif"
APOLLO_DTM = "https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/APOLLO11/NAC_DTM_APOLLO11.TIF"


def get(url: str, path: Path) -> bytes:
    if path.exists():
        return path.read_bytes()
    response = SESSION.get(url, timeout=90)
    response.raise_for_status()
    path.write_bytes(response.content)
    return response.content


def bounds(lat: float, lon: float, width_km: float):
    half_lat = width_km / 222.64
    half_lon = width_km / (222.64 * math.cos(math.radians(lat)))
    return (lon - half_lon, lat - half_lat, lon + half_lon, lat + half_lat)


def sample_image(array: np.ndarray, fx: np.ndarray, fy: np.ndarray):
    """Bilinear sample, preserving the source DEM's actual pixel spacing."""
    fx = np.clip(fx, 0, array.shape[1] - 1.000001)
    fy = np.clip(fy, 0, array.shape[0] - 1.000001)
    x0 = np.floor(fx).astype(int)
    y0 = np.floor(fy).astype(int)
    tx = fx - x0
    ty = fy - y0
    a = array[y0, x0].astype(np.float32)
    b = array[y0, x0 + 1].astype(np.float32)
    c = array[y0 + 1, x0].astype(np.float32)
    d = array[y0 + 1, x0 + 1].astype(np.float32)
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


def coordinates(box):
    west, south, east, north = box
    x = np.linspace(west, east, GRID, dtype=np.float64)
    y = np.linspace(north, south, GRID, dtype=np.float64)
    return np.meshgrid(x, y)


_hgt_cache = {}


def srtm_tile(lat: int, lon: int):
    name = f"{'N' if lat >= 0 else 'S'}{abs(lat):02d}{'E' if lon >= 0 else 'W'}{abs(lon):03d}"
    if name not in _hgt_cache:
        data = get(f"{SRTM}/{name}.SRTMGL1.hgt.zip", CACHE / f"{name}.zip")
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            member = next(path for path in archive.namelist() if path.lower().endswith(".hgt"))
            raster = np.frombuffer(archive.read(member), dtype=">i2").reshape(3601, 3601)
        _hgt_cache[name] = raster
    return _hgt_cache[name]


def earth_dem(box):
    lon, lat = coordinates(box)
    result = np.empty(lon.shape, dtype=np.float32)
    for row in range(GRID):
        for col in range(GRID):
            lt, ln = float(lat[row, col]), float(lon[row, col])
            base_lat, base_lon = math.floor(lt), math.floor(ln)
            raster = srtm_tile(base_lat, base_lon)
            result[row, col] = sample_image(
                raster,
                np.array((ln - base_lon) * 3600),
                np.array((base_lat + 1 - lt) * 3600),
            )
    # SRTM void is -32768. These sites have valid source data; reject bad crops.
    if np.nanmin(result) < -1000:
        raise ValueError("SRTM void found in selected patch")
    return result, "NASA SRTMGL1 · 1 arcsec", "https://lpdaac.usgs.gov/products/srtmgl1v003/"


def mola_tile_name(lat: float, lon: float):
    north = min(88, max(-44, math.ceil((lat + 1e-9) / 44) * 44))
    band = f"{abs(north):02d}{'n' if north >= 0 else 's'}"
    sector = math.floor((lon % 360) / 90) * 90
    return f"megt{band}{sector:03d}hb", north, sector


def mola_window(name: str, north: int, sector: int, first: int, last: int):
    path = CACHE / f"{name}-{first}-{last}.bin"
    if path.exists():
        raw = path.read_bytes()
    else:
        start = first * 23040
        end = (last + 1) * 23040 - 1
        response = SESSION.get(f"{MOLA}/{name}.img", headers={"Range": f"bytes={start}-{end}"}, timeout=120)
        response.raise_for_status()
        if response.status_code != 206 or len(response.content) != end - start + 1:
            raise ValueError(f"MOLA range response invalid: {name} {response.status_code}")
        raw = response.content
        path.write_bytes(raw)
    return np.frombuffer(raw, dtype=">i2").reshape(last - first + 1, 11520)


def mars_dem(box):
    lon, lat = coordinates(box)
    result = np.empty(lon.shape, dtype=np.float32)
    groups = {}
    for row in range(GRID):
        for col in range(GRID):
            key = mola_tile_name(float(lat[row, col]), float(lon[row, col]))
            groups.setdefault(key, []).append((row, col))
    for (name, north, sector), cells in groups.items():
        rows = [min(5630, max(0, math.floor((north - float(lat[r, c])) * 128 - .5))) for r, c in cells]
        first, last = max(0, min(rows)), min(5631, max(rows) + 2)
        raster = mola_window(name, north, sector, first, last)
        for row, col in cells:
            fy = (north - float(lat[row, col])) * 128 - .5 - first
            fx = ((float(lon[row, col]) % 360) - sector) * 128 - .5
            result[row, col] = sample_image(raster, np.array(fx), np.array(fy))
    return result, "NASA MGS MOLA MEGDR · 128 pixels/degré", "https://pds-geosciences.wustl.edu/missions/mgs/megdr.html"


def moon_dem(box):
    data = get(LOLA, CACHE / "ldem_16_uint.tif")
    with Image.open(io.BytesIO(data)) as image:
        raster = np.asarray(image, dtype=np.uint16)
    lon, lat = coordinates(box)
    # NASA SVS TIFF is centered on 0°: left edge is 180° W.
    # LOLA sample value is half-metres with +10 km offset.
    fx = ((lon + 180) % 360) * 16 - .5
    fy = (90 - lat) * 16 - .5
    values = sample_image(raster, fx, fy)
    return (values - 20000) / 2, "NASA LRO LOLA · 16 pixels/degré", "https://svs.gsfc.nasa.gov/4720/"


def apollo_dem(box):
    path = CACHE / "NAC_DTM_APOLLO11.TIF"
    if not path.exists():
        get(APOLLO_DTM, path)
    lon, lat = coordinates(box)
    west, east = 23.3722758, 23.5115296
    north, south = 1.2365388, 0.314609
    fx = (lon - west) / (east - west) * 2111 - .5
    fy = (north - lat) / (north - south) * 13978 - .5
    if fx.min() < 0 or fx.max() >= 2110 or fy.min() < 0 or fy.max() >= 13977:
        raise ValueError("Apollo 11 patch exceeds the NAC DTM footprint")
    x0, x1 = math.floor(float(fx.min())) - 1, math.ceil(float(fx.max())) + 2
    y0, y1 = math.floor(float(fy.min())) - 1, math.ceil(float(fy.max())) + 2
    with Image.open(path) as image:
        raster = np.asarray(image.crop((x0, y0, x1, y1)), dtype=np.float32)
    values = sample_image(raster, fx - x0, fy - y0)
    if np.nanmin(values) < -100000:
        raise ValueError("Apollo 11 NAC DTM contains NoDATA in selected patch")
    return values, "NASA LRO LROC NAC DTM · 2 m/pixel", "https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/APOLLO11/"


def web_mercator(lat):
    lat = np.clip(lat, -85.05112878, 85.05112878)
    return (1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2


def imagery_source(body, site):
    if body == "earth":
        return "mercator", 12, (
            "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/"
            "Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual/default/"
            "1999-12-01/GoogleMapsCompatible_Level12/{z}/{y}/{x}.jpeg"
        ), "NASA GIBS · Landsat WELD 1999 · 30 m", "https://gibs.earthdata.nasa.gov/"
    if body == "mars" and site == "jezero":
        return "geographic", 11, (
            "https://trek.nasa.gov/tiles/Mars/EQ/"
            "JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd/"
            "1.0.0/default/default028mm/{z}/{y}/{x}.png"
        ), "NASA Mars Trek · HiRISE Jezero", "https://trek.nasa.gov/"
    if body == "mars":
        return "geographic", 7, (
            "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/"
            "1.0.0/default/default028mm/{z}/{y}/{x}.jpg"
        ), "NASA Mars Trek · Viking MDIM21", "https://trek.nasa.gov/"
    if site == "apollo11":
        return "geographic", 13, (
            "https://trek.nasa.gov/tiles/Moon/EQ/apollo11_26cm_mosaic_byte_geo_1_2_highContrast/"
            "1.0.0/default/default028mm/{z}/{y}/{x}.png"
        ), "NASA Moon Trek · LROC NAC Apollo 11", "https://trek.nasa.gov/"
    return "geographic", 8, (
        "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/"
        "1.0.0/default/default028mm/{z}/{y}/{x}.jpg"
    ), "NASA Moon Trek · LROC WAC", "https://trek.nasa.gov/"


def build_texture(body, site, box, path):
    scheme, z, template, label, source = imagery_source(body, site)
    detailed = (body == "mars" and site == "jezero") or (body == "moon" and site == "apollo11")
    west, south, east, north = box
    columns, rows = (2 ** z, 2 ** z) if scheme == "mercator" else (2 ** (z + 1), 2 ** z)
    west_u, east_u = (west + 180) / 360, (east + 180) / 360
    north_v, south_v = (web_mercator(north), web_mercator(south)) if scheme == "mercator" else ((90 - north) / 180, (90 - south) / 180)
    left, right = math.floor(west_u * columns), math.floor(east_u * columns)
    top, bottom = math.floor(north_v * rows), math.floor(south_v * rows)
    atlas = Image.new("RGBA" if detailed else "RGB", ((right - left + 1) * 256, (bottom - top + 1) * 256), (28, 35, 44, 0) if detailed else (28, 35, 44))
    missing = 0
    for y in range(top, bottom + 1):
        for x in range(left, right + 1):
            url = template.format(z=z, x=x, y=y)
            suffix = "png" if url.endswith(".png") else "jpg"
            cached = CACHE / f"{body}-{site}-{z}-{x}-{y}.{suffix}"
            try:
                data = get(url, cached)
                with Image.open(io.BytesIO(data)) as tile:
                    atlas.paste(tile.convert("RGBA" if detailed else "RGB"), ((x - left) * 256, (y - top) * 256))
            except (requests.RequestException, OSError) as error:
                print(f"Tile absent: {url}: {error}")
                missing += 1
    if missing:
        raise ValueError(f"{missing} NASA imagery tiles absent for {body}/{site}")
    # Geographic tiles crop linearly. Mercator tile rows need inverse interpolation by latitude.
    px0 = (west_u * columns - left) * 256
    px1 = (east_u * columns - left) * 256
    if scheme == "geographic":
        py0 = (north_v * rows - top) * 256
        py1 = (south_v * rows - top) * 256
        texture = atlas.crop((px0, py0, px1, py1)).resize((IMAGE, IMAGE), Image.Resampling.LANCZOS)
    else:
        # Preserve geographic alignment between the Landsat texture and the SRTM mesh.
        xs = np.linspace(px0, px1, IMAGE)
        latitudes = np.linspace(north, south, IMAGE)
        ys = (web_mercator(latitudes) * rows - top) * 256
        pixels = np.asarray(atlas)
        texture_array = np.empty((IMAGE, IMAGE, 3), dtype=np.uint8)
        for row, yy in enumerate(ys):
            src_row = np.clip(int(round(yy)), 0, pixels.shape[0] - 1)
            texture_array[row] = pixels[src_row, np.clip(np.round(xs).astype(int), 0, pixels.shape[1] - 1)]
        texture = Image.fromarray(texture_array)
    if detailed:
        fallback_site = "olympus" if body == "mars" else "tycho"
        fallback_path = CACHE / f"{body}-{site}-global.webp"
        build_texture(body, fallback_site, box, fallback_path)
        with Image.open(fallback_path) as fallback:
            texture = Image.composite(texture.convert("RGB"), fallback.convert("RGB"), texture.getchannel("A"))
        label += " + mosaïque globale dans les lacunes"
    texture.save(path, "WEBP", quality=88, method=5)
    return label, source


def main():
    catalog = {"grid": GRID, "sites": {}}
    for body, sites in SITES.items():
        for site, lat, lon, width in sites:
            key = f"{body}-{site}"
            box = bounds(lat, lon, width)
            print(f"Building {key}…", flush=True)
            dem = apollo_dem if key == "moon-apollo11" else {"earth": earth_dem, "mars": mars_dem, "moon": moon_dem}[body]
            elevation, elevation_label, elevation_url = dem(box)
            min_m = math.floor(float(np.nanmin(elevation)))
            max_m = math.ceil(float(np.nanmax(elevation)))
            span = max(1, max_m - min_m)
            encoded = np.round(np.clip((elevation - min_m) / span, 0, 1) * 65535).astype("<u2")
            encoded.tofile(OUT / f"{key}.bin")
            image_label, image_url = build_texture(body, site, box, OUT / f"{key}.webp")
            catalog["sites"][key] = {
                "body": body, "site": site, "lat": lat, "lon": lon,
                "widthKm": width, "meshMeters": round(width * 1000 / (GRID - 1), 1),
                "bounds": list(box), "minMeters": min_m,
                "maxMeters": max_m, "elevation": elevation_label,
                "elevationUrl": elevation_url, "imagery": image_label,
                "imageryUrl": image_url,
            }
            print(f"  {min_m}–{max_m} m; texture {image_label}", flush=True)
    (OUT / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
