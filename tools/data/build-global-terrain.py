"""Package NASA's measured global DEMs for static hosting (no terrain server).

Sources stay in LOCALAPPDATA/RELIC/data-cache, never in Documents/Drive.
Output is little-endian uint16, gzip compressed deterministically. Moon units
are half metres with +10 km offset; Mars units are metres with +32768 offset.
No detail is invented beyond the native 16 pixels/degree source sampling.
"""
from pathlib import Path
import gzip
import hashlib
import io
import json
import os
import urllib.request
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "terrain" / "global"
CACHE = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".cache")) / "RELIC" / "data-cache"
SOURCES = {
    "moon": "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif",
    "mars": "https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg016/megr90n000eb.img",
}
OUT.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)
manifest = {}
for body, url in SOURCES.items():
    path = CACHE / url.rsplit("/", 1)[-1]
    if not path.exists():
        with urllib.request.urlopen(url, timeout=120) as response:
            path.write_bytes(response.read())
    raw = path.read_bytes()
    if body == "moon":
        array = np.asarray(Image.open(io.BytesIO(raw)), dtype=np.uint16)
        scale, offset, radius, west = .5, -10000, 1737400, -180
        credit, source = "NASA/GSFC · LRO LOLA · 16 pixels/degree", "https://svs.gsfc.nasa.gov/4720/"
    else:
        array = np.frombuffer(raw, dtype=">i2").reshape(2880, 5760).astype(np.int32)
        array = (array + 32768).astype(np.uint16)
        scale, offset, radius, west = 1, -32768, 3396000, 0
        credit, source = "NASA/MGS · MOLA radial shape · 16 pixels/degree", "https://pds-geosciences.wustl.edu/missions/mgs/megdr.html"
    assert array.shape == (2880, 5760)
    # Area-average adjacent source samples. This is explicitly a reduced 8ppd
    # distribution copy, not a claim that source precision has increased.
    array = np.rint(array.astype(np.float32).reshape(1440, 2, 2880, 2).mean(axis=(1,3))).astype(np.uint16)
    target = OUT / f"{body}-8ppd.u16.gz"
    target.write_bytes(gzip.compress(array.astype("<u2").tobytes(), compresslevel=9, mtime=0))
    manifest[body] = dict(file=target.name, width=2880, height=1440, west=west, scale=scale, offset=offset,
        referenceRadiusMeters=radius, spacingDegrees=1/8, credit=credit.replace('16 pixels/degree','reduced to 8 pixels/degree'), sourceUrl=source,
        nativeEquatorialSpacingMeters=round(2*np.pi*radius/2880),
        inputUrl=url, inputSha256=hashlib.sha256(raw).hexdigest(), outputSha256=hashlib.sha256(target.read_bytes()).hexdigest(),
        format="gzip-compressed little-endian uint16, north-to-south pixel centres; longitude wraps")
    print(body, target.stat().st_size, "bytes")
(OUT / "provenance.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

