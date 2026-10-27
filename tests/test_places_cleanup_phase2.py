import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import places
import places_cleanup_phase2 as cleanup
from place_names import normalize_place_name


class Phase2NormalizationTests(unittest.TestCase):
    def test_lowercase_names_are_capitalized_without_losing_acronyms(self):
        self.assertEqual(cleanup.normalize_name("aayisha meat shop"), "Aayisha Meat Shop")
        self.assertEqual(cleanup.normalize_name("smr transport"), "SMR Transport")
        self.assertEqual(cleanup.normalize_name("baqalathul kanz"), "Baqalathul Kanz")
        self.assertEqual(cleanup.normalize_name("BOC ATM"), "BOC ATM")
        self.assertEqual(cleanup.normalize_name("iPhone repair"), "iPhone repair")
        self.assertEqual(cleanup.normalize_name("காத்தான்குடி"), "காத்தான்குடி")

    def test_comprehensive_title_case_examples_and_stylization(self):
        examples = {
            "Mansoor koli kade": "Mansoor Koli Kade",
            "aayisha meat shop": "Aayisha Meat Shop",
            "smr transport": "SMR Transport",
            "baqalathul kanz": "Baqalathul Kanz",
            "AL AMEEN HOTEL": "Al Ameen Hotel",
            "People's Bank": "People's Bank",
            "iPhone Repair": "iPhone Repair",
            "SMR Transport": "SMR Transport",
            "காத்தான்குடி": "காத்தான்குடி",
            "Bikerboy.lk": "Bikerboy.lk",
        }
        for before, after in examples.items():
            with self.subTest(before=before):
                self.assertEqual(normalize_place_name(before), after)

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
                "coordinates": coordinates or {"latitude": 7.68, "longitude": 81.73},
                "categories": ["Shop"], **extra}

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
                    places.allocate({"name": "Same Business", "categories": ["Shop"], "coordinates": existing["coordinates"]})
                self.assertEqual(len(list(shard.glob("*.json"))), 1)
                places.allocate({"name": "Nearby Separate Business", "categories": ["Shop"], "coordinates": existing["coordinates"]})
                self.assertEqual(len(list(shard.glob("*.json"))), 2)
                places.allocate({"name": "aayisha meat shop", "coordinates": {"latitude": 7.69, "longitude": 81.74}}, True)
                names = [json.loads(path.read_text())["name"] for path in shard.glob("*.json")]
                self.assertIn("Aayisha Meat Shop", names)
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
        self.assertGreater(summary["names_normalized"], 2)
        self.assertEqual(summary["title_case_names_normalized"], len(report["title_case_changes"]))
        self.assertEqual(summary["addresses_normalized"], 954)
        aliases = places.load_aliases()
        self.assertGreaterEqual(len(aliases), 1039)
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

    def test_every_reported_format_change_is_persisted_to_active_or_alias_record(self):
        report = json.loads((ROOT / "reports/places-data-quality-phase-2.json").read_text())
        aliases = places.load_aliases()
        self.assertEqual(cleanup.formatting_drift(), [])
        for change in report["format_changes"]:
            if "id" not in change:
                continue  # Phase 3 replaced withheld detail rows with privacy-safe tokens.
            active = list((ROOT / "data/places").glob(f"*/{change['id']}.json"))
            record = json.loads(active[0].read_text()) if active else aliases[change["id"]]["record"]
            for field, expected in change["after"].items():
                self.assertEqual(record[field], expected, change["id"])

    def test_title_case_report_covers_active_names_without_changing_ids_or_aliases(self):
        report = json.loads((ROOT / "reports/places-data-quality-phase-2.json").read_text())
        aliases = places.load_aliases()
        self.assertGreaterEqual(len(aliases), 1039)
        # Phase 3 removes detailed before/after rows for locations withheld for
        # privacy; the historical aggregate count remains unchanged.
        self.assertLessEqual(len(report["title_case_changes"]), report["summary"]["title_case_names_normalized"])
        for row in report["title_case_changes"]:
            if "id" not in row:
                continue
            active = ROOT / row["filename"]
            record = json.loads(active.read_text()) if active.exists() else aliases[row["id"]]["record"]
            self.assertEqual(record["id"], row["id"])
            self.assertEqual(record["name"], row["after"])
            self.assertEqual(normalize_place_name(record["name"]), record["name"])
        active_ids = {p.stem for p in (ROOT / "data/places").glob("*/*.json")}
        mapped_ids = {row["id"] for row in json.loads((ROOT / "migration-record-map.json").read_text())}
        self.assertTrue(mapped_ids <= active_ids | set(aliases))
        self.assertEqual(active_ids & mapped_ids, mapped_ids - set(aliases))

    def test_rollback_restores_retired_and_normalized_records_in_isolation(self):
        old = (cleanup.ROOT, cleanup.PLACES, cleanup.ALIASES,
               places.ROOT, places.PLACES, places.ALIASES, places.GENERATED)
        try:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                place_root = root / "data/places"
                shard = place_root / "0001"
                shard.mkdir(parents=True)
                canonical_id = "01AAAAAAAAAAAAAAAAAAAAAAAA"
                retired_id = "01BBBBBBBBBBBBBBBBBBBBBBBB"
                titlecase_id = "01CCCCCCCCCCCCCCCCCCCCCCCC"
                coords = {"latitude": 7.68, "longitude": 81.73}
                canonical = {"id": canonical_id, "name": "Canonical Name", "coordinates": coords,
                             "address": "No. 2 Main Road", "categories": ["Shop"]}
                retired = {"id": retired_id, "name": "Canonical Name", "coordinates": coords,
                           "address": "No. 2 Main Road", "categories": ["Shop"]}
                titlecase_only = {"id": titlecase_id, "name": "Title Case Place",
                                  "coordinates": {"latitude": 7.70, "longitude": 81.75},
                                  "categories": ["Shop"]}
                (shard / f"{canonical_id}.json").write_text(json.dumps(canonical))
                (shard / f"{titlecase_id}.json").write_text(json.dumps(titlecase_only))
                aliases = {"version": 1, "aliases": {retired_id: {
                    "canonical_id": canonical_id, "original_path": f"data/places/0001/{retired_id}.json",
                    "record": retired, "source_lineage": {"id": retired_id, "source": "legacy.json", "index": 1},
                }}, "phase2_titlecase_backup": [
                    {"id": titlecase_id, "filename": f"data/places/0001/{titlecase_id}.json",
                     "before": {"name": "title case place"}},
                ], "phase2_formatting_backup": [
                    {"id": canonical_id, "filename": f"data/places/0001/{canonical_id}.json",
                     "before": {"name": "canonical name", "address": "No 2 Main Rd"}},
                    {"id": retired_id, "filename": f"data/places/0001/{retired_id}.json",
                     "before": {"name": "canonical name", "address": "No 2 Main Rd"}},
                ]}
                (place_root / "aliases.json").write_text(json.dumps(aliases))
                cleanup.ROOT, cleanup.PLACES, cleanup.ALIASES = root, place_root, place_root / "aliases.json"
                places.ROOT, places.PLACES, places.ALIASES = root, place_root, place_root / "aliases.json"
                places.GENERATED = root / "generated"
                cleanup.rollback()
                self.assertFalse((place_root / "aliases.json").exists())
                restored = [json.loads(p.read_text()) for p in sorted(shard.glob("*.json"))]
                self.assertEqual({r["id"] for r in restored}, {canonical_id, retired_id, titlecase_id})
                self.assertTrue(all(r["name"] == "canonical name" and r["address"] == "No 2 Main Rd"
                                    for r in restored if r["id"] != titlecase_id))
                restored_title = next(r for r in restored if r["id"] == titlecase_id)
                self.assertEqual(restored_title["name"], "title case place")
                geo = json.loads((places.GENERATED / "batticaloa-district.mzp").read_text())
                self.assertEqual(len(geo["features"]), 3)
        finally:
            (cleanup.ROOT, cleanup.PLACES, cleanup.ALIASES,
             places.ROOT, places.PLACES, places.ALIASES, places.GENERATED) = old

    def test_shards_mzp_and_manifest_stay_consistent(self):
        records, shard_counts, _ = places.load_places()
        mapped_ids = {row["id"] for row in json.loads((ROOT / "migration-record-map.json").read_text())}
        aliases = places.load_aliases()
        mapped_active_ids = {record["id"] for record in records} & mapped_ids
        self.assertTrue(mapped_ids <= mapped_active_ids | set(aliases))
        self.assertEqual(mapped_active_ids, mapped_ids - set(aliases))
        self.assertEqual(sum(shard_counts.values()), len(records))
        self.assertTrue(all(count <= places.LIMIT for count in shard_counts.values()))
        places.build()
        geo = json.loads((places.GENERATED / "batticaloa-district.mzp").read_text())
        manifest = json.loads((places.GENERATED / "manifest.json").read_text())
        self.assertEqual(len(geo["features"]), manifest["features"])
        self.assertEqual(manifest["shards"], shard_counts)
        self.assertEqual(manifest["aliases"], {key: places.resolve_place_id(key) for key in places.load_aliases()})
        by_id = {feature["id"]: feature["properties"]["name"] for feature in geo["features"]}
        for row in json.loads((ROOT / "reports/places-data-quality-phase-2.json").read_text())["title_case_changes"]:
            if "id" not in row:
                continue
            canonical_id = places.resolve_place_id(row["id"])
            self.assertEqual(by_id.get(canonical_id), row["after"])
        first_hash = cleanup.sha256_file(places.GENERATED / "batticaloa-district.mzp")
        places.build()
        self.assertEqual(cleanup.sha256_file(places.GENERATED / "batticaloa-district.mzp"), first_hash)

    def test_map_loader_has_district_wide_coverage_without_kattankudy_clipping(self):
        geo = json.loads((places.GENERATED / "batticaloa-district.mzp").read_text())
        features = geo["features"]
        self.assertTrue(all("withheld pending eligibility review" not in f["properties"]["name"].lower()
                            for f in features))
        app = (ROOT / "assets/js/app.js").read_text()
        self.assertNotIn("if(!inArea(p))continue", app)
        self.assertNotIn("KATTANKUDY=[", app)
        self.assertIn("center:[81.5569,7.8381],zoom:8.6,minZoom:8", app)
        self.assertIn("minzoom:9", app)
        self.assertIn("places.push({...p,name:canonicalPlaceName", app)
        self.assertIn("activeIds.has(canonicalId)", app)
        self.assertNotIn("if(!seen.has(k)", app)
        self.assertIn("createPlaceSearchIndex(places,placeAliases)", app)
        self.assertIn("maxDistanceMeters:nearbyMode?10000:Infinity", app)
        self.assertIn("$('#place-address').textContent=p.address||'Address unavailable'", app)

    def test_roads_and_speed_limit_sources_match_pre_cleanup_hashes(self):
        report = json.loads((ROOT / "reports/places-data-quality-phase-2.json").read_text())
        self.assertEqual(cleanup.data_hashes("data/roads/*/*.json"), report["rollback"]["road_source_sha256_before"])
        self.assertEqual(cleanup.data_hashes("data/speed-limits/*/*.json"), report["rollback"]["speed_limit_source_sha256_before"])
        self.assertEqual(len(cleanup.data_hashes("data/roads/*/*.json")), 3710)
        self.assertEqual(len(cleanup.data_hashes("data/speed-limits/*/*.json")), 3710)


if __name__ == "__main__":
    unittest.main()
