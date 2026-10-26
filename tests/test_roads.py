import contextlib
import io
import json
import re
import tempfile
import threading
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import roads


class RoadTests(unittest.TestCase):
    def test_ulid_validity_and_uniqueness(self):
        values = [roads.new_ulid() for _ in range(500)]
        self.assertEqual(len(values), len(set(values)))
        self.assertTrue(all(re.fullmatch(r"[0-7][0-9A-HJKMNP-TV-Z]{25}", value) for value in values))

    def test_migrated_records_source_ids_fields_and_shards(self):
        summary = roads.validate()
        mapping = roads.read_mapping()
        self.assertEqual(summary["records"], 3710)
        self.assertEqual(summary["source_count"], 3710)
        self.assertEqual(summary["shards"], {"0001": 999, "0002": 999, "0003": 999, "0004": 713})
        self.assertEqual(len(mapping["records"]), 3710)
        self.assertEqual(len({row["source_id"] for row in mapping["records"]}), 3710)
        self.assertEqual(len({row["id"] for row in mapping["records"]}), 3710)
        self.assertEqual(summary["exclusions"], [])

    def test_exact_source_fields_and_coordinate_precision(self):
        records, _ = roads.load_records()
        by_source = {record["source_id"]: record for record in records}
        mapping = roads.read_mapping()
        for row in mapping["records"]:
            record = by_source[row["source_id"]]
            reconstructed = {"id": record["source_id"], **{k: v for k, v in record.items() if k not in {"id", "source_id", "supplementary_maxspeed_evidence"}}}
            self.assertEqual(roads.record_hash(reconstructed), row["source_record_sha256"])
            self.assertEqual(record["source_id"], row["source_id"])

    def test_migration_rerun_preserves_ids_and_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.json"
            roads_data = {"count": 2, "roads": [
                {"id": "source-a:0", "name": None, "type": "residential", "coordinates": [[81.1, 7.1], [81.2, 7.2]]},
                {"id": "source-b:0", "name": "Test Road", "type": "tertiary", "coordinates": [[81.3, 7.3], [81.4, 7.4]]},
            ]}
            source.write_text(json.dumps(roads_data), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                first = roads.migrate(source, root)
            before = {p.relative_to(root).as_posix(): p.read_bytes() for p in (root / "data/roads").rglob("*.json")}
            with contextlib.redirect_stdout(io.StringIO()):
                second = roads.migrate(source, root)
            after = {p.relative_to(root).as_posix(): p.read_bytes() for p in (root / "data/roads").rglob("*.json")}
            self.assertEqual(first["migrated_records"], 2)
            self.assertEqual(second["written_or_updated"], 0)
            self.assertEqual(before, after)

    def test_refresh_preserves_supplementary_maxspeed_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.json"
            source.write_text(json.dumps({"count": 1, "roads": [
                {"id": "source-a:0", "name": "Old name", "type": "residential",
                 "coordinates": [[81.1, 7.1], [81.2, 7.2]]},
            ]}), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                roads.migrate(source, root)
            record_path = next((root / "data/roads").glob("*/01*.json"))
            before = json.loads(record_path.read_text(encoding="utf-8"))
            evidence = {"maxspeed": "30", "maxspeed_unit": None,
                        "maxspeed_status": "unverified_source_tag", "source": "PR #5"}
            before["supplementary_maxspeed_evidence"] = evidence
            record_path.write_text(json.dumps(before), encoding="utf-8")
            source.write_text(json.dumps({"count": 1, "roads": [
                {"id": "source-a:0", "name": "Updated name", "type": "residential",
                 "coordinates": [[81.1, 7.1], [81.2, 7.2]]},
            ]}), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                roads.migrate(source, root)
            after = json.loads(record_path.read_text(encoding="utf-8"))
            self.assertEqual(after["id"], before["id"])
            self.assertEqual(after["source_id"], before["source_id"])
            self.assertEqual(after["coordinates"], before["coordinates"])
            self.assertEqual(after["name"], "Updated name")
            self.assertEqual(after["supplementary_maxspeed_evidence"], evidence)

    def test_shard_capacity_and_overflow(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "data" / "roads"
            first = root / "0001"
            first.mkdir(parents=True)
            for i in range(998):
                (first / f"{i:026d}.json").touch()
            self.assertEqual(roads.next_shard(root).name, "0001")
            (first / "999.json").touch()
            self.assertEqual(roads.next_shard(root).name, "0002")
            second = root / "0002"
            second.mkdir()
            for i in range(999):
                (second / f"{i:026d}.json").touch()
            self.assertEqual(roads.next_shard(root).name, "0003")
            self.assertTrue(all(roads.shard_file_count(shard) <= 999 for shard in roads.shard_dirs(root)))

    def test_add_allocates_ulid_and_serializes_concurrent_contributors(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            jobs = []
            for index in range(8):
                record = {"source_id": f"new-source-{index}:0", "name": None, "type": "residential",
                          "coordinates": [[81.1, 7.1], [81.2, 7.2]]}
                path = root / f"submission-{index}.json"
                path.write_text(json.dumps(record), encoding="utf-8")
                jobs.append(path)
            failures = []
            def add(path):
                try:
                    with contextlib.redirect_stdout(io.StringIO()):
                        roads.add(path, root)
                except Exception as exc:
                    failures.append(exc)
            threads = [threading.Thread(target=add, args=(path,)) for path in jobs]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
            self.assertEqual(failures, [])
            records, counts = roads.load_records(root / "data/roads")
            self.assertEqual(len(records), 8)
            self.assertEqual(counts, {"0001": 8})
            self.assertEqual(len({record["id"] for record in records}), 8)
            self.assertEqual(len({record["source_id"] for record in records}), 8)
            self.assertEqual(roads.validate(root)["records"], 8)

    def test_geojson_linestring_features_match_records(self):
        with contextlib.redirect_stdout(io.StringIO()):
            roads.build()
        geojson = json.loads((roads.GENERATED / "kattankudy-roads.mzp").read_text(encoding="utf-8"))
        self.assertEqual(geojson["type"], "FeatureCollection")
        self.assertEqual(len(geojson["features"]), 3710)
        roads_by_id = {r["id"]: r for r in roads.load_records()[0]}
        for feature in geojson["features"]:
            record = roads_by_id[feature["id"]]
            self.assertEqual(feature["geometry"]["type"], "LineString")
            self.assertEqual(feature["geometry"]["coordinates"], record["coordinates"])
            self.assertEqual(feature["properties"]["source_id"], record["source_id"])

    def test_mzp_and_manifest_are_deterministic_and_pages_ready(self):
        with contextlib.redirect_stdout(io.StringIO()):
            manifest = roads.build()
        mzp = (roads.GENERATED / "kattankudy-roads.mzp").read_bytes()
        with contextlib.redirect_stdout(io.StringIO()):
            roads.build()
        self.assertEqual(mzp, (roads.GENERATED / "kattankudy-roads.mzp").read_bytes())
        self.assertEqual(manifest["total_source_roads"], 3710)
        self.assertEqual(manifest["total_migrated_records"], 3710)
        self.assertEqual(manifest["valid_geographic_features"], 3710)
        self.assertEqual(manifest["excluded_records"], [])
        self.assertTrue((roads.GENERATED / manifest["geojson"]).is_file())
        self.assertTrue((roads.GENERATED / "kattankudy-roads-manifest.json").is_file())

    def test_invalid_geometry_is_preserved_and_reported(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.json"
            source.write_text(json.dumps({"count": 1, "roads": [
                {"id": "bad:0", "name": None, "type": "path", "coordinates": [[81.1, 7.1]]}
            ]}), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                roads.migrate(source, root)
                result = roads.validate(root)
                manifest = roads.build(root, root / "generated")
            record = roads.load_records(root / "data/roads")[0][0]
            self.assertEqual(record["coordinates"], [[81.1, 7.1]])
            self.assertEqual(len(result["exclusions"]), 1)
            self.assertEqual(manifest["valid_geographic_features"], 0)
            self.assertEqual(len(manifest["excluded_records"]), 1)

    def test_missing_exclusion_documentation_fails_validation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.json"
            source.write_text(json.dumps({"count": 1, "roads": [
                {"id": "bad:0", "name": None, "type": "path", "coordinates": []}
            ]}), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                roads.migrate(source, root)
            (root / "data/roads/road-exclusions.json").write_text("[]", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "exclusions report"):
                roads.validate(root)

    def test_map_uses_road_mzp_and_keeps_places_source(self):
        app = (roads.ROOT / "assets/js/app.js").read_text(encoding="utf-8")
        self.assertIn("generated/kattankudy-roads-manifest.json", app)
        self.assertNotIn("./data/roads/kattankudy.json", app)
        self.assertIn("manifest.geojson+'?v='+manifest.sha256", app)
        self.assertIn("generated/manifest.json?v=places-titlecase-phase2-2", app)


if __name__ == "__main__":
    unittest.main()
