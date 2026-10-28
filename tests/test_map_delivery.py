import hashlib
import gzip
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_map_delivery as delivery
import validate_map_delivery
import places
from place_eligibility import classify_place


class MapDeliveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.features = delivery.read_features()

    def test_zoom_bands_progressively_reveal_places_without_removing_search_records(self):
        priorities = [delivery.priority(delivery.discovery_kind(f["properties"])) for f in self.features]
        self.assertTrue(all(delivery.visible_from_zoom(p, 16) for p in priorities))
        self.assertTrue(all(not delivery.visible_from_zoom(p, 3) for p in priorities))
        self.assertTrue(all(delivery.visible_from_zoom(1, z) for z in range(4, 17)))
        self.assertFalse(delivery.visible_from_zoom(3, 6))
        self.assertTrue(delivery.visible_from_zoom(2, 7))

    def test_every_feature_and_alias_is_present_in_generated_search_and_tiles(self):
        result = validate_map_delivery.validate()
        self.assertEqual(result["features"], len(self.features))
        records, _, _ = places.load_places()
        expected_search = sum(classify_place(record)["eligible_for_public_map"] for record in records)
        self.assertEqual(result["search_records"], expected_search)
        self.assertGreaterEqual(result["search_records"], len(self.features))
        aliases = json.loads((ROOT / "data/places/aliases.json").read_text())["aliases"]
        self.assertEqual(result["aliases"], len(aliases))
        self.assertEqual(result["min_zoom"], delivery.MIN_ZOOM)
        self.assertEqual(result["max_zoom"], delivery.MAX_ZOOM)

    def test_tile_coordinates_are_bounded_and_zoom_specific(self):
        for lon, lat in [(-180, -85), (180, 85), (81.73, 7.68), (0, 0)]:
            for zoom in (0, 4, 10, 16):
                x, y = delivery.tile_xy(lon, lat, zoom)
                self.assertTrue(0 <= x < (1 << zoom))
                self.assertTrue(0 <= y < (1 << zoom))

    def test_missing_or_corrupted_pmtiles_archive_is_rejected_and_recoverable(self):
        original = delivery.TILE_ARCHIVE.read_bytes()
        try:
            delivery.TILE_ARCHIVE.unlink()
            with self.assertRaisesRegex(ValueError, "archive or search index is missing"):
                validate_map_delivery.validate()
            delivery.TILE_ARCHIVE.write_bytes(original[:-16] + b"corrupted archive")
            with self.assertRaisesRegex(ValueError, "checksum"):
                validate_map_delivery.validate()
        finally:
            delivery.TILE_ARCHIVE.write_bytes(original)
        self.assertTrue(validate_map_delivery.validate()["valid"])

    def test_repeated_builds_produce_identical_archives_and_indexes(self):
        before = [delivery.digest(path.read_bytes()) for path in
                  (delivery.TILE_ARCHIVE, delivery.SEARCH_INDEX, delivery.DETAIL_INDEX)]
        delivery.build()
        after = [delivery.digest(path.read_bytes()) for path in
                 (delivery.TILE_ARCHIVE, delivery.SEARCH_INDEX, delivery.DETAIL_INDEX)]
        self.assertEqual(before, after)

    def test_pmtiles_directory_and_metadata_gzip_settings_are_explicit(self):
        payload = b"deterministic PMTiles directory payload"
        expected = gzip.compress(payload, compresslevel=9, mtime=0)
        self.assertEqual(delivery.pmtiles_tile.gzip.compress(payload), expected)
        self.assertEqual(delivery.pmtiles_writer.gzip.compress(payload), expected)

    def test_pmtiles_is_the_only_place_delivery_and_road_speed_mzp_are_retained(self):
        manifest = json.loads(delivery.MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(manifest["format"], "PMTiles/1")
        self.assertEqual(manifest["production_default"], "pmtiles")
        self.assertNotIn("geojson", manifest)
        self.assertNotIn("sha256", manifest)
        self.assertFalse((delivery.GENERATED / "batticaloa-district.mzp").exists())
        self.assertTrue((delivery.GENERATED / "kattankudy-roads.mzp").is_file())
        self.assertTrue((delivery.GENERATED / "kattankudy-speed-limits.mzp").is_file())
        self.assertEqual(len(delivery.read_features()), manifest["features"])


if __name__ == "__main__":
    unittest.main()
