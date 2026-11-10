import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from place_quality import is_map_poi, semantic_type


class PlaceQualityTests(unittest.TestCase):
    def test_settlement_names_are_retained_as_geography_not_poi(self):
        for kind in ("Village Name", "Town Name", "City Name", "Estate Name", "Place Name"):
            with self.subTest(kind=kind):
                record = {"name": "Kattankudy", "categories": ["Landmark", kind]}
                self.assertEqual(semantic_type(record), "settlement")
                self.assertFalse(is_map_poi(record))

    def test_road_kilometer_posts_are_not_poi_symbols(self):
        record = {"name": "31", "categories": ["Transport", "Kilometer post"]}
        self.assertEqual(semantic_type(record), "road_reference")
        self.assertFalse(is_map_poi(record))

    def test_placeholders_and_unidentified_numbers_are_rejected(self):
        for name in ("None", "NULL", "undefined", ".", "--", "55"):
            with self.subTest(name=name):
                self.assertEqual(semantic_type({"name": name, "categories": ["Business center"]}), "invalid_name")

    def test_numeric_business_name_with_independent_identity_is_kept(self):
        record = {"name": "1710", "categories": ["Sri Lankan restaurant"],
                  "address": "Galle Fort", "phone": "0912229223"}
        self.assertEqual(semantic_type(record), "poi")
        self.assertTrue(is_map_poi(record))


if __name__ == "__main__":
    unittest.main()
