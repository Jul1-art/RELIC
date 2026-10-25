"""Small contract checks against the real public sources used by the atlas."""

import math
import os
import tempfile
import unittest
from pathlib import Path

import requests

from live_sources import horizons, noaa_swpc
from live_sources.cache import LiveCache


class LiveSourceTests(unittest.TestCase):
    @unittest.skipUnless(os.environ.get("NASA_ATLAS_CONTACT"), "Set NASA_ATLAS_CONTACT for JPL fair-use policy")
    def test_horizons_earth_vector(self):
        value = horizons.fetch("earth")
        self.assertEqual(value["body"], "earth")
        self.assertGreater(value["distanceFromSunKm"], 100_000_000)
        self.assertGreater(value["speedKmS"], 0)
        self.assertTrue(all(math.isfinite(value["positionKm"][axis]) for axis in "xyz"))
        self.assertTrue(value["validAt"].endswith("Z"))

    def test_noaa_near_earth_wind(self):
        value = noaa_swpc.fetch()
        self.assertGreater(value["speedKmS"], 0)
        self.assertTrue(value["measuredAt"].endswith("Z"))
        self.assertEqual(value["kind"], "measurement")

    def test_nasa_trek_mars_and_moon_tiles(self):
        urls = (
            "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/0/0/0.jpg",
            "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/0/0/0.jpg",
        )
        for url in urls:
            with self.subTest(url=url):
                response = requests.get(url, timeout=8)
                response.raise_for_status()
                self.assertTrue(response.headers.get("Content-Type", "").startswith("image/jpeg"))
                self.assertTrue(response.content.startswith(b"\xff\xd8\xff"))

    def test_cache_returns_last_known_value_after_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = LiveCache(Path(directory))
            self.assertEqual(cache.get("sample", 0, lambda: {"speedKmS": 300})["state"], "current")

            def unavailable():
                raise ConnectionError("upstream unavailable")

            stale = cache.get("sample", 60, unavailable)
            self.assertEqual(stale["state"], "stale")
            self.assertEqual(stale["speedKmS"], 300)
            reloaded = LiveCache(Path(directory)).get("sample", 60, unavailable)
            self.assertEqual(reloaded["state"], "stale")
            self.assertEqual(reloaded["speedKmS"], 300)


if __name__ == "__main__":
    unittest.main()
