import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import places
import phase3_places as phase3


class Phase3DuplicateReviewTests(unittest.TestCase):
    def record(self, ulid, **fields):
        return {"id": ulid, "name": "Public Library", "coordinates": {"latitude": 7.68, "longitude": 81.73},
                "categories": ["Library"], **fields}

    def test_exact_copy_rule_refuses_any_field_conflict(self):
        a = self.record("01AAAAAAAAAAAAAAAAAAAAAAAA", address="Main Road", phone="123")
        b = self.record("01BBBBBBBBBBBBBBBBBBBBBBBB", address="Main Road", phone="123")
        self.assertTrue(phase3.exact_duplicate_fields([a, b]))
        b["address"] = "Second Road"
        self.assertFalse(phase3.exact_duplicate_fields([a, b]))
        b["address"] = "Main Road"
        b["categories"] = ["Community centre"]
        self.assertFalse(phase3.exact_duplicate_fields([a, b]))

    def test_canonical_selection_is_deterministic_and_never_changes_ulid(self):
        sparse = self.record("01AAAAAAAAAAAAAAAAAAAAAAAA")
        complete = self.record("01BBBBBBBBBBBBBBBBBBBBBBBB", address="Main Road", phone="123")
        selected = phase3.canonical_record([sparse, complete])
        self.assertEqual(selected["id"], complete["id"])
        self.assertEqual(selected["address"], "Main Road")
        same = self.record("01CCCCCCCCCCCCCCCCCCCCCCCC", address="Main Road", phone="123")
        self.assertEqual(phase3.canonical_record([complete, same])["id"], complete["id"])

    def test_conflicting_field_report_retains_each_side_without_deciding(self):
        group = {"group_id": "candidate-group-test", "candidate_record_ids": [
            "01AAAAAAAAAAAAAAAAAAAAAAAA", "01BBBBBBBBBBBBBBBBBBBBBBBB"]}
        rows = {group["candidate_record_ids"][0]: self.record(group["candidate_record_ids"][0], address="Main Road"),
                group["candidate_record_ids"][1]: self.record(group["candidate_record_ids"][1], address="Second Road")}
        compared = phase3.member_field_comparison(group, rows, {})
        self.assertIn("address", compared["differing_fields"])
        self.assertEqual(compared["field_value_comparison"]["address"], ["Main Road", "Second Road"])

    def test_retired_ulid_alias_chain_resolves_to_active_canonical(self):
        active = "01CCCCCCCCCCCCCCCCCCCCCCCC"
        aliases = {"01AAAAAAAAAAAAAAAAAAAAAAAA": {"canonical_id": "01BBBBBBBBBBBBBBBBBBBBBBBB"},
                   "01BBBBBBBBBBBBBBBBBBBBBBBB": {"canonical_id": active}}
        self.assertEqual(places.resolve_place_id("01AAAAAAAAAAAAAAAAAAAAAAAA", aliases), active)


class Phase3GeneratedIntegrityTests(unittest.TestCase):
    def test_phase3_cleanup_and_mzp_rebuild_are_idempotent(self):
        before_places = phase3.hashes("data/places/*/*.json")
        before_aliases = phase3.sha256(phase3.ALIASES)
        before_mzp = phase3.sha256(places.GENERATED / "kattankudy.mzp")
        before_manifest = phase3.sha256(places.GENERATED / "manifest.json")
        phase3.apply_phase3()
        places.build()
        self.assertEqual(phase3.hashes("data/places/*/*.json"), before_places)
        self.assertEqual(phase3.sha256(phase3.ALIASES), before_aliases)
        self.assertEqual(phase3.sha256(places.GENERATED / "kattankudy.mzp"), before_mzp)
        self.assertEqual(phase3.sha256(places.GENERATED / "manifest.json"), before_manifest)

    def test_duplicate_rollback_restores_alias_copy_without_restoring_private_fields(self):
        old = (phase3.ROOT, phase3.PLACES, phase3.ALIASES,
               places.ROOT, places.PLACES, places.ALIASES, places.GENERATED)
        try:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                place_root = root / "data/places"
                shard = place_root / "0001"
                shard.mkdir(parents=True)
                canonical_id = "01AAAAAAAAAAAAAAAAAAAAAAAA"
                retired_id = "01BBBBBBBBBBBBBBBBBBBBBBBB"
                coords = {"latitude": 7.68, "longitude": 81.73}
                canonical = {"id": canonical_id, "name": "Public Library", "coordinates": coords,
                             "categories": ["Library"]}
                retired = {**canonical, "id": retired_id}
                (shard / f"{canonical_id}.json").write_text(json.dumps(canonical))
                aliases = {"version": 1, "aliases": {retired_id: {
                    "canonical_id": canonical_id, "original_path": f"data/places/0001/{retired_id}.json",
                    "record": retired}}, "phase3_change_manifest": {"new_alias_ids": [retired_id]}}
                (place_root / "aliases.json").write_text(json.dumps(aliases))
                phase3.ROOT, phase3.PLACES, phase3.ALIASES = root, place_root, place_root / "aliases.json"
                places.ROOT, places.PLACES, places.ALIASES, places.GENERATED = root, place_root, place_root / "aliases.json", root / "generated"
                phase3.rollback_phase3()
                self.assertTrue((shard / f"{retired_id}.json").exists())
                updated = json.loads((place_root / "aliases.json").read_text())
                self.assertNotIn(retired_id, updated["aliases"])
                self.assertNotIn("phase3_change_manifest", updated)
                self.assertEqual(json.loads((places.GENERATED / "manifest.json").read_text())["features"], 2)
        finally:
            (phase3.ROOT, phase3.PLACES, phase3.ALIASES,
             places.ROOT, places.PLACES, places.ALIASES, places.GENERATED) = old

    def test_phase3_report_is_privacy_safe_and_reconciles_aliases_and_mzp(self):
        report_path = ROOT / "reports/places-verification-phase-3.json"
        if not report_path.exists():
            self.skipTest("Phase 3 report is generated by the data application step")
        report = json.loads(report_path.read_text(encoding="utf-8"))
        manifest = json.loads((ROOT / "generated/manifest.json").read_text(encoding="utf-8"))
        collection = json.loads((ROOT / "generated/kattankudy.mzp").read_text(encoding="utf-8"))
        self.assertEqual(len(collection["features"]), manifest["features"])
        self.assertEqual(manifest["features"], report["before_after_integrity"]["place_geo_features_after_build"])
        self.assertEqual(len(manifest["aliases"]), report["before_after_integrity"]["retired_aliases"]["after"])
        public_ids = {feature["id"] for feature in collection["features"]}
        self.assertTrue(all(row.get("record_state") != "withheld_pending_manual_review" or "id" not in row
                            for row in report["place_reviews"]))
        for shard, count in report["before_after_integrity"]["place_shards_after"]["after"].items():
            self.assertLessEqual(count, 999, shard)
        self.assertEqual(report["before_after_integrity"]["roads"]["record_count"], 3710)
        self.assertEqual(report["before_after_integrity"]["speed_limits"]["record_count"], 3710)
        self.assertEqual(report["before_after_integrity"]["supplementary_unverified_maxspeed_records"], 462)
        self.assertEqual(len(public_ids), manifest["features"])
        withheld_rows = [row for row in report["place_reviews"]
                         if row.get("record_state") == "withheld_pending_manual_review"]
        self.assertEqual(len(withheld_rows), 34)
        self.assertTrue(all(not ({"id", "name", "coordinates", "address", "phone"} & set(row))
                            for row in withheld_rows))


if __name__ == "__main__":
    unittest.main()
