import unittest

from place_search import camera_range, normalize_feature


class PlaceSearchTests(unittest.TestCase):
    def test_city_extent_fits_broad_area(self):
        city = {"type": "city", "extent": [2.2, 48.9, 2.4, 48.8]}
        self.assertGreater(camera_range(city, 48.85), 20_000)
        self.assertLess(camera_range(city, 48.85), 100_000)

    def test_landmark_and_invalid_coordinates(self):
        feature = {
            "geometry": {"type": "Point", "coordinates": [7.2155, 43.6575]},
            "properties": {"name": "Aéroport de Nice", "city": "Nice", "country": "France"},
        }
        result = normalize_feature(feature)
        self.assertEqual(result["name"], "Aéroport de Nice")
        self.assertEqual(result["detail"], "Nice, France")
        self.assertEqual(result["range"], 2600)
        feature["geometry"]["coordinates"] = [200, 43.6575]
        self.assertIsNone(normalize_feature(feature))


if __name__ == "__main__":
    unittest.main()
