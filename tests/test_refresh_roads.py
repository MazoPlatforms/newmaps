import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import refresh_roads
import roads


class SafeRoadRefreshTests(unittest.TestCase):
    def test_refresh_is_additive_and_idempotent(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            initial = root / "initial.json"
            initial.write_text(json.dumps({"count": 2, "roads": [
                {"id": "existing-a:0", "name": "Old Name", "type": "residential",
                 "coordinates": [[81.7000, 7.7000], [81.7003, 7.7000]]},
                {"id": "existing-missing:0", "name": "Retained Road", "type": "service",
                 "coordinates": [[81.7100, 7.7100], [81.7103, 7.7100]]},
            ]}), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                roads.migrate(initial, root)
            records, _ = roads.load_records(root / "data/roads")
            before_by_source = {row["source_id"]: row for row in records}
            preserved_evidence = {"maxspeed": "30", "maxspeed_unit": None,
                                  "maxspeed_status": "unverified_source_tag", "source": "PR #5"}
            preserved_path = next((root / "data/roads").glob("*/" + before_by_source["existing-a:0"]["id"] + ".json"))
            existing_record = json.loads(preserved_path.read_text(encoding="utf-8"))
            existing_record["supplementary_maxspeed_evidence"] = preserved_evidence
            preserved_path.write_text(json.dumps(existing_record), encoding="utf-8")

            source_path = root / "incoming.json"
            incoming = {"count": 3, "roads": [
                {"id": "existing-a:0", "name": "Updated Name", "type": "residential",
                 "coordinates": [[81.7000, 7.7000], [81.7004, 7.7000]]},
                {"id": "near-existing:0", "name": "Possible duplicate", "type": "residential",
                 "coordinates": [[81.700001, 7.7000], [81.700301, 7.7000]]},
                {"id": "far-new:0", "name": "New Road", "type": "residential",
                 "coordinates": [[81.7300, 7.7000], [81.7303, 7.7000]]},
            ]}
            source_path.write_text(json.dumps(incoming), encoding="utf-8")
            metadata_path = root / "release.json"
            metadata_path.write_text(json.dumps({"release": "2026-10-21.0", "sha256": "a" * 64,
                                                 "source_url": "s3://official"}), encoding="utf-8")

            report = refresh_roads.refresh(source_path, metadata_path, root)
            after_records, shard_counts = roads.load_records(root / "data/roads")
            after_by_source = {row["source_id"]: row for row in after_records}
            self.assertEqual(len(after_records), 3)
            self.assertEqual(after_by_source["existing-a:0"]["id"], before_by_source["existing-a:0"]["id"])
            self.assertEqual(after_by_source["existing-a:0"]["coordinates"], before_by_source["existing-a:0"]["coordinates"])
            self.assertEqual(after_by_source["existing-a:0"]["name"], "Old Name")
            self.assertEqual(after_by_source["existing-a:0"]["supplementary_maxspeed_evidence"], preserved_evidence)
            self.assertEqual(after_by_source["existing-missing:0"], before_by_source["existing-missing:0"])
            self.assertEqual(report["existing_records_overwritten"], 0)
            self.assertEqual(report["existing_records_deleted"], 0)
            self.assertEqual(report["existing_records_with_source_changes"][0]["source_id"], "existing-a:0")
            self.assertEqual(report["new_records_added"][0]["source_id"], "far-new:0")
            self.assertEqual(report["new_candidates_needing_review"][0]["source_id"], "near-existing:0")
            self.assertEqual(report["existing_roads_absent_from_release_preserved"], ["existing-missing:0"])
            self.assertEqual(shard_counts, {"0001": 3})
            roads.validate(root)

            second_report = refresh_roads.refresh(source_path, metadata_path, root)
            self.assertEqual(second_report, report)
            after_second, _ = roads.load_records(root / "data/roads")
            self.assertEqual({r["source_id"]: r["id"] for r in after_second},
                             {r["source_id"]: r["id"] for r in after_records})

    def test_invalid_new_geometry_is_reported_and_not_added(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "incoming.json"
            source.write_text(json.dumps({"count": 1, "roads": [
                {"id": "bad:0", "name": None, "type": "road", "coordinates": [[81.7, 7.7]]}
            ]}), encoding="utf-8")
            metadata = root / "release.json"
            metadata.write_text(json.dumps({"release": "2026-10-21.0", "sha256": "b" * 64}), encoding="utf-8")
            report = refresh_roads.refresh(source, metadata, root)
            self.assertEqual(report["invalid_candidates_not_added"][0]["source_id"], "bad:0")
            self.assertEqual(roads.load_records(root / "data/roads")[0], [])
            self.assertEqual(report["existing_records_overwritten"], 0)


if __name__ == "__main__":
    unittest.main()
