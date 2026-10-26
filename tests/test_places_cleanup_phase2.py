import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import places
import places_cleanup_phase2 as cleanup


class Phase2NormalizationTests(unittest.TestCase):
    def test_lowercase_names_are_capitalized_without_losing_acronyms(self):
        self.assertEqual(cleanup.normalize_name("aayisha meat shop"), "Aayisha Meat Shop")
        self.assertEqual(cleanup.normalize_name("smr transport"), "SMR Transport")
        self.assertEqual(cleanup.normalize_name("baqalathul kanz"), "Baqalathul Kanz")
        self.assertEqual(cleanup.normalize_name("BOC ATM"), "BOC ATM")
        self.assertEqual(cleanup.normalize_name("iPhone repair"), "iPhone repair")
        self.assertEqual(cleanup.normalize_name("காத்தான்குடி"), "காத்தான்குடி")

    def test_address_formatting_is_conservative_and_preserves_localities(self):
        self.assertEqual(cleanup.normalize_address("No8 Ash Shaheed Rd., Kattankudy 30100"),
                         "No. 8 Ash Shaheed Road, Kattankudy 30100")
        self.assertEqual(cleanup.normalize_address("No:33,  Kattankudy 30150"), "No. 33, Kattankudy 30150")
        self.assertEqual(cleanup.normalize_address("Beach Road,, Kallady 30000"), "Beach Road, Kallady 30000")
        self.assertEqual(cleanup.normalize_address("Kattankudy 30150"), "Kattankudy 30150")
        self.assertEqual(cleanup.normalize_address("MPJQ+383, Kattankudy"), "MPJQ+383, Kattankudy")


class Phase2DuplicateTests(unittest.TestCase):
    def record(self, record_id, name="A Place", coordinates=None, **extra):
        return {"id": record_id, "name": name,
                "coordinates": coordinates or {"latitude": 7.68, "longitude": 81.73}, **extra}

    def test_candidate_detection_does_not_merge_co_located_different_names_or_distinct_points(self):
        records = [self.record("01AAAAAAAAAAAAAAAAAAAAAAAA", "Clinic"),
                   self.record("01BBBBBBBBBBBBBBBBBBBBBBBB", "Pharmacy"),
                   self.record("01CCCCCCCCCCCCCCCCCCCCCCCC", "Clinic", {"latitude": 7.69, "longitude": 81.73})]
        self.assertEqual(cleanup.detect_duplicate_groups(records), [])

    def test_candidate_detection_groups_normalized_name_and_same_point(self):
        a = self.record("01AAAAAAAAAAAAAAAAAAAAAAAA", "same place")
        b = self.record("01BBBBBBBBBBBBBBBBBBBBBBBB", "Same Place")
        self.assertEqual(len(cleanup.detect_duplicate_groups([a, b])), 1)

    def test_new_import_cannot_recreate_an_existing_duplicate_candidate(self):
        old_places, old_aliases, old_root = places.PLACES, places.ALIASES, places.ROOT
        try:
            with tempfile.TemporaryDirectory() as tmp:
                places.PLACES = Path(tmp) / "places"
                places.ROOT = Path(tmp)
                places.ALIASES = places.PLACES / "aliases.json"
                shard = places.PLACES / "0001"
                shard.mkdir(parents=True)
                existing = self.record("01AAAAAAAAAAAAAAAAAAAAAAAA", "same business")
                (shard / (existing["id"] + ".json")).write_text(json.dumps(existing))
                with self.assertRaisesRegex(ValueError, "Potential duplicate place already exists"):
                    places.allocate({"name": "Same Business", "coordinates": existing["coordinates"]})
                self.assertEqual(len(list(shard.glob("*.json"))), 1)
                places.allocate({"name": "Nearby Separate Business", "coordinates": existing["coordinates"]})
                self.assertEqual(len(list(shard.glob("*.json"))), 2)
        finally:
            places.PLACES, places.ALIASES, places.ROOT = old_places, old_aliases, old_root

    def test_merge_preserves_all_fields_and_rejects_conflicts(self):
        a = self.record("01AAAAAAAAAAAAAAAAAAAAAAAA", address="No. 2, Main Road", phone="123")
        b = self.record("01BBBBBBBBBBBBBBBBBBBBBBBB", address="No. 2, Main Road", phone="123")
        self.assertEqual(cleanup.merge_confirmed_group([a, b]), a)
        b["address"] = "No. 3, Main Road"
        with self.assertRaisesRegex(ValueError, "Conflicting field"):
            cleanup.merge_confirmed_group([a, b])

    def test_canonical_selection_prefers_more_complete_then_stable_ulid(self):
        group = {"field_value_comparison_by_record": [
            {"id": "01BBBBBBBBBBBBBBBBBBBBBBBB", "fields": {"name": "X", "address": "Y"}},
            {"id": "01AAAAAAAAAAAAAAAAAAAAAAAA", "fields": {"name": "X"}},
        ]}
        self.assertEqual(cleanup.canonical_for_group(group), "01BBBBBBBBBBBBBBBBBBBBBBBB")
        tied = {"field_value_comparison_by_record": [
            {"id": "01BBBBBBBBBBBBBBBBBBBBBBBB", "fields": {"name": "X"}},
            {"id": "01AAAAAAAAAAAAAAAAAAAAAAAA", "fields": {"name": "X"}},
        ]}
        self.assertEqual(cleanup.canonical_for_group(tied), "01AAAAAAAAAAAAAAAAAAAAAAAA")

    def test_retired_alias_resolves_and_detects_cycles(self):
        aliases = {"01AAAAAAAAAAAAAAAAAAAAAAAA": {"canonical_id": "01BBBBBBBBBBBBBBBBBBBBBBBB"}}
        self.assertEqual(cleanup.resolve_alias("01AAAAAAAAAAAAAAAAAAAAAAAA", {"aliases": aliases}), "01BBBBBBBBBBBBBBBBBBBBBBBB")
        cyclic = {"01AAAAAAAAAAAAAAAAAAAAAAAA": {"canonical_id": "01BBBBBBBBBBBBBBBBBBBBBBBB"},
                  "01BBBBBBBBBBBBBBBBBBBBBBBB": {"canonical_id": "01AAAAAAAAAAAAAAAAAAAAAAAA"}}
        with self.assertRaisesRegex(ValueError, "Alias cycle"):
            cleanup.resolve_alias("01AAAAAAAAAAAAAAAAAAAAAAAA", {"aliases": cyclic})


class Phase2RepositoryIntegrityTests(unittest.TestCase):
    def test_cleanup_is_idempotent_and_aliases_keep_source_lineage(self):
        report = json.loads((ROOT / "reports/places-data-quality-phase-2.json").read_text())
        summary = report["summary"]
        self.assertEqual(summary["duplicate_groups_consolidated"], 695)
        self.assertEqual(summary["records_retired"], 1039)
        self.assertEqual(summary["canonical_records_retained"], 695)
        self.assertEqual(summary["unresolved_duplicate_groups"], 172)
        self.assertEqual(summary["names_normalized"], 2)
        self.assertEqual(summary["addresses_normalized"], 954)
        aliases = places.load_aliases()
        self.assertEqual(len(aliases), 1039)
        entry = next(iter(aliases.values()))
        self.assertIsNotNone(entry["source_lineage"])
        self.assertTrue(entry["record"]["id"])
        self.assertTrue(cleanup.apply_cleanup()["already_applied"])

    def test_conflicting_groups_remain_in_review_report(self):
        report = json.loads((ROOT / "reports/places-data-quality-phase-2.json").read_text())
        groups = report["unresolved_duplicate_groups"]
        self.assertEqual(len(groups), 172)
        self.assertTrue(all(group["conflicting_fields"] for group in groups))
        self.assertTrue(all(len(group["candidate_record_ids"]) >= 2 for group in groups))

    def test_shards_mzp_and_manifest_stay_consistent(self):
        records, shard_counts, _ = places.load_places()
        self.assertEqual(len(records), 2655)
        self.assertEqual(sum(shard_counts.values()), len(records))
        self.assertTrue(all(count <= places.LIMIT for count in shard_counts.values()))
        places.build()
        geo = json.loads((places.GENERATED / "kattankudy.mzp").read_text())
        manifest = json.loads((places.GENERATED / "manifest.json").read_text())
        self.assertEqual(len(geo["features"]), manifest["features"])
        self.assertEqual(manifest["shards"], shard_counts)
        self.assertEqual(manifest["aliases"], {key: places.resolve_place_id(key) for key in places.load_aliases()})
        first_hash = cleanup.sha256_file(places.GENERATED / "kattankudy.mzp")
        places.build()
        self.assertEqual(cleanup.sha256_file(places.GENERATED / "kattankudy.mzp"), first_hash)

    def test_roads_and_speed_limit_sources_match_pre_cleanup_hashes(self):
        report = json.loads((ROOT / "reports/places-data-quality-phase-2.json").read_text())
        self.assertEqual(cleanup.data_hashes("data/roads/*/*.json"), report["rollback"]["road_source_sha256_before"])
        self.assertEqual(cleanup.data_hashes("data/speed-limits/*/*.json"), report["rollback"]["speed_limit_source_sha256_before"])
        self.assertEqual(len(cleanup.data_hashes("data/roads/*/*.json")), 3710)
        self.assertEqual(len(cleanup.data_hashes("data/speed-limits/*/*.json")), 3710)


if __name__ == "__main__":
    unittest.main()
