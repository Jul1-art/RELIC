import unittest

import numpy as np

from server.earth_surface import NICE_RUNWAYS, RUNWAYS, correct_runways


class EarthSurfaceTests(unittest.TestCase):
    def test_nice_runway_profiles_are_smooth(self):
        for _, (lon0, lat0), (lon1, lat1), start_height, end_height in NICE_RUNWAYS:
            fraction = np.linspace(0, 1, 101)
            lon = lon0 + (lon1 - lon0) * fraction
            lat = lat0 + (lat1 - lat0) * fraction
            radar_noise = 7 + 4 * np.sin(fraction * 35)
            corrected = correct_runways(lon, lat, radar_noise)
            expected = start_height + fraction * (end_height - start_height)
            np.testing.assert_allclose(corrected, expected, atol=1e-5)

    def test_outside_airport_is_unchanged(self):
        lon = np.array([7.215, 2.3376])
        lat = np.array([43.68, 48.8606])
        heights = np.array([42., 53.], dtype=np.float32)
        np.testing.assert_array_equal(correct_runways(lon, lat, heights), heights)

    def test_paved_runway_dataset_is_applied(self):
        lon0, lat0, lon1, lat1, h0, h1, _width, _ = next(item for item in RUNWAYS if item[7] == "KJFK")
        fraction = np.linspace(0, 1, 51)
        lon = lon0 + (lon1 - lon0) * fraction
        lat = lat0 + (lat1 - lat0) * fraction
        corrected = correct_runways(lon, lat, np.full_like(lon, 30.))
        # JFK has intersecting runways whose published elevations differ slightly.
        np.testing.assert_allclose(corrected, h0 + fraction * (h1 - h0), atol=.25)


if __name__ == "__main__":
    unittest.main()
