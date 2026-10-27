import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import places
from place_eligibility import classify_place, redact_location


class PublicPlaceEligibilityTests(unittest.TestCase):
    def test_business_context_keeps_personal_brand_and_home_based_business_public(self):
        for record in (
            {"name": "Ali's Bakery", "categories": ["Bakery"]},
            {"name": "Sunrise Home", "categories": ["Care home"]},
            {"name": "Nila Homestay", "categories": ["Homestay"]},
            {"name": "Kavi Studio", "categories": ["Photography studio"]},
        ):
            with self.subTest(category=record["categories"]):
                self.assertTrue(classify_place(record)["eligible_for_public_map"])

    def test_context_free_personal_or_residential_record_is_uncertain_not_deleted(self):
        for record in (
            {"name": "M. Perera", "categories": []},
            {"name": "A Person's Home", "categories": []},
            {"name": "Family Residence", "categories": ["Villa"]},
            {"name": "A Person", "categories": ["Housing society"]},
        ):
            with self.subTest(name=record["name"]):
                self.assertEqual(classify_place(record)["classification"], "uncertain")

    def test_confirmed_private_requires_explicit_private_category_and_personal_home_context(self):
        self.assertEqual(classify_place({"name": "A Person's Home", "categories": ["Private residence"]})["classification"],
                         "confirmed_private_residential")
        self.assertEqual(classify_place({"name": "A Person's Home", "categories": ["Residential building"]})["classification"],
                         "uncertain")

    def test_official_school_reference_establishes_public_institution_and_residential_address_is_only_a_review_signal(self):
        self.assertEqual(classify_place({"name": "Central School", "categories": [],
                                         "school_census_no": "14294"})["classification"],
                         "public_business_institutional")
        self.assertEqual(classify_place({"name": "Unnamed site", "categories": [],
                                         "address": "Private Residence Area"})["classification"],
                         "uncertain")

    def test_redaction_contains_no_source_location_or_personal_fields(self):
        source = {"id": "01AAAAAAAAAAAAAAAAAAAAAAAA", "name": "Personal House",
                  "coordinates": {"latitude": 7.68, "longitude": 81.73},
                  "address": "No. 1 Private Road", "phone": "123", "categories": ["Private home"]}
        safe = redact_location(source, "confirmed_private_residential", "ELIG-TEST")
        encoded = json.dumps(safe)
        self.assertEqual(set(safe), {"id", "name", "coordinates", "public_eligibility", "eligibility_review_token"})
        for secret in ("Personal House", "7.68", "81.73", "Private Road", "123"):
            self.assertNotIn(secret, encoded)

    def test_ineligible_source_feature_is_rejected_as_a_second_privacy_gate(self):
        with self.assertRaisesRegex(ValueError, "refusing to publish"):
            places.feature({"id": "01AAAAAAAAAAAAAAAAAAAAAAAA", "name": "A Person's Home",
                            "coordinates": {"latitude": 7.68, "longitude": 81.73}, "categories": []})

    def test_new_import_rejects_uncertain_place_and_keeps_public_facility(self):
        old = (places.PLACES, places.ALIASES, places.ROOT)
        try:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                places.PLACES, places.ROOT = root / "data/places", root
                places.ALIASES = places.PLACES / "aliases.json"
                places.PLACES.mkdir(parents=True)
                with self.assertRaisesRegex(ValueError, "public-map eligibility"):
                    places.allocate({"name": "A Person's House", "categories": [],
                                     "coordinates": {"latitude": 7.68, "longitude": 81.73}})
                places.allocate({"name": "Community Library", "categories": ["Library"],
                                 "coordinates": {"latitude": 7.68, "longitude": 81.73}})
                self.assertEqual(len(list(places.PLACES.glob("*/*.json"))), 1)
        finally:
            places.PLACES, places.ALIASES, places.ROOT = old

    def test_repository_withheld_records_and_alias_payloads_contain_no_location_details(self):
        expected_keys = {"id", "name", "coordinates", "public_eligibility", "eligibility_review_token"}
        withheld_ids = set()
        for path in (ROOT / "data/places").glob("*/*.json"):
            record = json.loads(path.read_text(encoding="utf-8"))
            if not classify_place(record)["eligible_for_public_map"]:
                withheld_ids.add(record["id"])
                self.assertEqual(set(record), expected_keys)
                self.assertIsNone(record["coordinates"])
        alias_file = json.loads((ROOT / "data/places/aliases.json").read_text(encoding="utf-8"))
        aliases = alias_file["aliases"]
        for retired_id, entry in aliases.items():
            record = entry.get("record", {})
            if not classify_place(record)["eligible_for_public_map"]:
                withheld_ids.add(retired_id)
                self.assertEqual(set(record), expected_keys)
                self.assertIsNone(record["coordinates"])
                self.assertTrue(places.resolve_place_id(retired_id, aliases))
        manifest = json.loads((ROOT / "generated/manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(len(withheld_ids), manifest["withheld_pending_public_eligibility_review"] + 7)
        self.assertTrue(withheld_ids.isdisjoint(manifest["aliases"].keys()) is False)
        for backup_key in ("phase2_formatting_backup", "phase2_titlecase_backup"):
            self.assertTrue(withheld_ids.isdisjoint({row.get("id") for row in alias_file.get(backup_key, [])}))
        report = json.loads((ROOT / "reports/places-data-quality-phase-2.json").read_text(encoding="utf-8"))
        def strings(value):
            if isinstance(value, str):
                yield value
            elif isinstance(value, list):
                for item in value:
                    yield from strings(item)
            elif isinstance(value, dict):
                yield from strings(value.keys())
                for item in value.values():
                    yield from strings(item)
        report_strings = set(strings(report))
        self.assertTrue(withheld_ids.isdisjoint(report_strings))
        collection = json.loads((ROOT / "generated/kattankudy.mzp").read_text(encoding="utf-8"))
        self.assertTrue(all("Location withheld" not in feature["properties"].get("name", "")
                            for feature in collection["features"]))
        self.assertTrue(all(record_id not in manifest["excluded_without_coordinates"] for record_id in withheld_ids))


if __name__ == "__main__":
    unittest.main()
