import json
import re
import tempfile
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import places
import speed_limits


class SpeedLimitTests(unittest.TestCase):
    def test_migration_preserves_all_records_and_metadata(self):
        result = speed_limits.validate()
        self.assertEqual(result["source_records"], 3710)
        self.assertEqual(result["migrated_records"], 3710)
        self.assertEqual(result["shards"], {"0001": 999, "0002": 999, "0003": 999, "0004": 713})
        self.assertEqual(result["source_verification"]["records"], 3710)
        self.assertEqual(result["road_relationships"], 3710)
        self.assertEqual(result["unresolved_road_relationships"], 0)
        self.assertEqual(result["exclusions"], [])
        self.assertEqual(result["suspicious_duplicates"], [])
        manifest = speed_limits.load_mapping()["source_metadata"]
        self.assertEqual(manifest["units"], "km/h")
        self.assertIn("legal_basis", manifest)
        self.assertIn("gazette_scheduled_sections", manifest)
        records, _ = speed_limits.load_records()
        self.assertTrue(all(record["speed_limit_kmh"] is None for record in records))
        self.assertTrue(all(record["legal_default_candidate_kmh"] == 70 for record in records))
        self.assertTrue(all(record["verification_status"] == "unverified" for record in records))

    def test_ulid_validity_and_uniqueness(self):
        identifiers = [places.new_ulid() for _ in range(1000)]
        self.assertEqual(len(identifiers), len(set(identifiers)))
        self.assertTrue(all(re.fullmatch(r"[0-7][0-9A-HJKMNP-TV-Z]{25}", value) for value in identifiers))

    def test_shard_transition_at_999_and_1000(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = root / "0001"
            first.mkdir()
            for n in range(998):
                (first / f"{n:04d}.json").touch()
            self.assertEqual(speed_limits.next_shard(root), first)
            (first / "0998.json").touch()
            self.assertEqual(speed_limits.next_shard(root), root / "0002")
            second = root / "0002"
            second.mkdir()
            for n in range(999):
                (second / f"{n:04d}.json").touch()
            self.assertEqual(speed_limits.next_shard(root), root / "0003")

    def test_rerunning_migration_keeps_ulids_and_paths(self):
        before = speed_limits.load_mapping()["records"]
        identity = [(row["source_id"], row["id"], row["path"]) for row in before]
        speed_limits.migrate()
        after = speed_limits.load_mapping()["records"]
        self.assertEqual(identity, [(row["source_id"], row["id"], row["path"]) for row in after])

    def test_unit_and_null_numeric_value_preservation(self):
        records, _ = speed_limits.load_records()
        self.assertEqual(speed_limits.load_mapping()["source_metadata"]["units"], "km/h")
        self.assertEqual({record["speed_limit_kmh"] for record in records}, {None})
        self.assertEqual({record["legal_default_candidate_kmh"] for record in records}, {70})

    def test_mzp_has_valid_line_features_and_is_deterministic(self):
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            a = speed_limits.build(output_dir=first)
            b = speed_limits.build(output_dir=second)
            first_path = Path(first) / "kattankudy-speed-limits.mzp"
            second_path = Path(second) / "kattankudy-speed-limits.mzp"
            self.assertEqual(first_path.read_bytes(), second_path.read_bytes())
            geo = json.loads(first_path.read_text(encoding="utf-8"))
            self.assertEqual(geo["type"], "FeatureCollection")
            self.assertEqual(len(geo["features"]), 3710)
            self.assertTrue(all(feature["geometry"]["type"] == "LineString" for feature in geo["features"]))
            self.assertTrue(all(re.fullmatch(r"[0-7][0-9A-HJKMNP-TV-Z]{25}", feature["id"])
                                for feature in geo["features"]))
            self.assertEqual(a["sha256"], b["sha256"])
            self.assertEqual(a["valid_geographic_features"], 3710)

    def test_road_reference_mapping_is_explicit_and_exact(self):
        mapping = speed_limits.load_mapping()
        roads_by_source, _ = speed_limits.road_index()
        rows = {row["source_id"]: row for row in mapping["records"]}
        self.assertEqual(set(rows), set(roads_by_source))
        self.assertTrue(all(rows[source]["road_ref"] == roads_by_source[source]["id"] for source in rows))

    def test_missing_geometry_is_reported_without_dropping_record(self):
        records, _ = speed_limits.load_records()
        _, road_by_id = speed_limits.road_index()
        record = records[0]
        road = road_by_id[record["road_ref"]]
        invalid = dict(road)
        invalid["coordinates"] = []
        self.assertIn("LineString", speed_limits.roads.geometry_error(invalid["coordinates"]))
        excluded = speed_limits.expected_exclusions([record], {record["road_ref"]: invalid}, [])
        self.assertEqual(excluded[0]["id"], record["id"])

    def test_frontend_loads_one_mzp_and_keeps_existing_speed_ui(self):
        source = (ROOT / "assets" / "js" / "app.js").read_text(encoding="utf-8")
        self.assertIn("./generated/kattankudy-speed-limits.mzp", source)
        self.assertIn("Legal default candidate — unverified", source)
        self.assertIn("70 km/h · Legal default candidate", source)
        self.assertNotIn("fetch('./data/speed-limits/kattankudy.json')", source)

    def test_schema_documents_speed_limit_semantics(self):
        schema = json.loads((ROOT / "data" / "speed-limit.schema.json").read_text(encoding="utf-8"))
        self.assertIn("id", schema["required"])
        self.assertEqual(schema["properties"]["speed_limit_kmh"]["type"], ["number", "null"])
        self.assertIn("null", schema["properties"]["legal_default_candidate_kmh"]["type"])


if __name__ == "__main__":
    unittest.main()
