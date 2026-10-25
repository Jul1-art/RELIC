"""Guard the local PDS terrain seam against NoDATA spikes."""

import unittest
from pathlib import Path
from unittest.mock import patch as mock_patch

import numpy as np

import planetary_patches as patches


class PlanetaryPatchTests(unittest.TestCase):
    def test_nodata_hole_blends_to_global_surface_without_invalid_heights(self):
        source = np.full((512, 512), 50, dtype=np.float32)
        source[235:270, 235:270] = -3.4028227e38
        measured = patches.Patch(
            "synthetic.img", "", 0, 0, source.shape,
            0, 0, 1000, 255.5, 255.5, (-.25, -.25, .25, .25),
        )
        longitude = np.linspace(-.30, .30, 601, dtype=np.float32)[None, :]
        latitude = np.zeros_like(longitude)
        baseline = np.full_like(longitude, 5)
        patches._confidence.cache_clear()
        with mock_patch.object(patches, "_raster", return_value=source):
            result = patches.blend_patch(Path("/unused"), measured, longitude, latitude, baseline)[0]
        patches._confidence.cache_clear()
        self.assertTrue(np.isfinite(result).all())
        self.assertEqual(result[0], 5)
        self.assertEqual(result[-1], 5)
        self.assertGreater(result[160], 20)
        self.assertAlmostEqual(result[300], 5, delta=.01)
        self.assertLess(float(np.max(np.abs(np.diff(result)))), 5)


if __name__ == "__main__":
    unittest.main()
