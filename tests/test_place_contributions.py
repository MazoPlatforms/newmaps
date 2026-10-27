import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import places
import place_contributions as contributions
import validate_place_contributions as validator


class PlaceContributionSchemaTests(unittest.TestCase):
    def record(self, **changes):
        return {"id": "01AAAAAAAAAAAAAAAAAAAAAAAA", "name": "Example Community Library",
                "coordinates": {"latitude": 7.68, "longitude": 81.73}, "categories": ["Library"], **changes}

    def test_valid_public_place_and_null_coordinates_match_schema(self):
        self.assertEqual(validator.validate_schema(self.record()), [])
        self.assertEqual(validator.validate_schema(self.record(coordinates=None)), [])

    def test_schema_rejects_missing_fields_bad_ulids_and_coordinate_ranges(self):
        cases = [
            ({"name": "Library", "coordinates": None}, "required field 'id'"),
            (self.record(id="not-a-ulid"), "ULID"),
            (self.record(coordinates={"latitude": 90.01, "longitude": 0}), "outside"),
            (self.record(coordinates={"latitude": 0, "longitude": -180.01}), "outside"),
            (self.record(coordinates={"latitude": True, "longitude": 0}), "finite number"),
            (self.record(coordinates={"latitude": float("inf"), "longitude": 0}), "finite number"),
            (self.record(categories=["  "]), "categories"),
        ]
        for record, message in cases:
            with self.subTest(message=message):
                self.assertTrue(any(message in error for error in validator.validate_schema(record)))

    def test_provenance_rejects_invalid_or_unknown_fields(self):
        valid = {"source_name": "Official directory", "source_url": "https://example.org/place",
                 "checked_at": "2026-01-01T00:00:00Z", "checked_by": "contributor", "notes": "Public listing"}
        self.assertEqual(validator.validate_schema(self.record(provenance=valid)), [])
        self.assertTrue(any("http(s) URL" in error for error in
                            validator.validate_schema(self.record(provenance={"source_url": "javascript:alert(1)"}))))
        self.assertTrue(any("unsupported provenance" in error for error in
                            validator.validate_schema(self.record(provenance={"home_address": "private"}))))
        self.assertTrue(any("with timezone" in error for error in
                            validator.validate_schema(self.record(provenance={"checked_at": "2026-01-01T00:00:00"}))))

    def test_canonical_records_allow_optional_community_provenance_but_reject_import_markers(self):
        self.assertEqual(validator.canonical_import_metadata_errors(self.record(), "record.json"), [])
        self.assertEqual(validator.canonical_import_metadata_errors(
            self.record(provenance={"source_name": "Official directory"}), "record.json"), [])
        self.assertTrue(any("mzc discovery-tool metadata" in error for error in
                            validator.canonical_import_metadata_errors(
                                self.record(provenance={"source_name": "mzc"}), "record.json")))
        self.assertTrue(any("import metadata fields" in error for error in
                            validator.canonical_import_metadata_errors(
                                self.record(import_source="mzc"), "record.json")))

    def test_duplicate_candidates_require_same_normalized_name_and_nearby_location(self):
        original = self.record()
        nearby = self.record(id="01BBBBBBBBBBBBBBBBBBBBBBBB", name="EXAMPLE Community-Library",
                             coordinates={"latitude": 7.68001, "longitude": 81.73})
        colocated_different = self.record(id="01CCCCCCCCCCCCCCCCCCCCCCCC", name="Example Mosque")
        same_far = self.record(id="01DDDDDDDDDDDDDDDDDDDDDDDD", coordinates={"latitude": 8.0,"longitude":81.73})
        self.assertEqual(validator.duplicate_candidates(original, [nearby]), [nearby["id"]])
        self.assertEqual(validator.duplicate_candidates(original, [colocated_different, same_far]), [])
        index = {"examplecommunitylibrary": [nearby], "examplemosque": [colocated_different]}
        self.assertEqual(validator.duplicate_candidates(original, [nearby, colocated_different], name_index=index),
                         [nearby["id"]])

    def test_uncertain_records_are_safe_only_as_minimal_redacted_placeholders(self):
        safe = {"id": "01AAAAAAAAAAAAAAAAAAAAAAAA", "name": validator.WITHHELD_LABEL,
                "coordinates": None, "public_eligibility": "uncertain", "eligibility_review_token": "review-token"}
        with_detail = {**safe, "address": "Do not publish this"}
        self.assertTrue(validator._is_safe_withheld_placeholder(safe))
        self.assertFalse(validator._is_safe_withheld_placeholder(with_detail))

    def test_alias_changes_cannot_delete_reassign_or_invent_retired_ids(self):
        retired = "01AAAAAAAAAAAAAAAAAAAAAAAA"
        canonical = "01BBBBBBBBBBBBBBBBBBBBBBBB"
        other = "01CCCCCCCCCCCCCCCCCCCCCCCC"
        previous = {retired: {"canonical_id": canonical}}
        with patch.object(validator, "_git_json", return_value={"aliases": previous}):
            self.assertEqual(validator.validate_alias_changes("unused", previous, set()), [])
            self.assertTrue(any("removed" in error for error in
                                validator.validate_alias_changes("unused", {}, set())))
            self.assertTrue(any("reassigned" in error for error in
                                validator.validate_alias_changes("unused", {retired: {"canonical_id": other}}, set())))
            self.assertTrue(any("must correspond" in error for error in
                                validator.validate_alias_changes("unused", {retired: previous[retired], other: {"canonical_id": canonical}}, set())))
            self.assertEqual(validator.validate_alias_changes(
                "unused", {**previous, other: {"canonical_id": canonical}}, {other}), [])


class PlaceContributionWorkflowTests(unittest.TestCase):
    def test_scaffold_allocates_ulid_and_next_available_shard(self):
        old = places.ROOT, places.PLACES, places.ALIASES
        try:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                place_root = root / "data/places"
                first = place_root / "0001"
                first.mkdir(parents=True)
                for i in range(999):
                    record_id = places.new_ulid()
                    (first / f"{record_id}.json").write_text(json.dumps({
                        "id": record_id, "name": f"Test Library {i}", "coordinates": None,
                        "categories": ["Library"],
                    }), encoding="utf-8")
                places.ROOT, places.PLACES, places.ALIASES = root, place_root, place_root / "aliases.json"
                record = {"name": "Example Community Library", "coordinates": None,
                          "categories": ["Library"],
                          "provenance": {"source_name": "Test directory", "source_url": "https://example.org/library"}}
                path = contributions.scaffold(record)
                self.assertEqual(path.parent.name, "0002")
                saved = json.loads(path.read_text(encoding="utf-8"))
                self.assertTrue(re.fullmatch(r"[0-7][0-9A-HJKMNP-TV-Z]{25}", saved["id"]))
                self.assertEqual(path.stem, saved["id"])
                self.assertIsNone(saved["coordinates"])
        finally:
            places.ROOT, places.PLACES, places.ALIASES = old

    def test_scaffold_rejects_uncertain_and_private_records_without_writing(self):
        old = places.ROOT, places.PLACES, places.ALIASES
        try:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                place_root = root / "data/places"
                place_root.mkdir(parents=True)
                places.ROOT, places.PLACES, places.ALIASES = root, place_root, place_root / "aliases.json"
                with self.assertRaisesRegex(ValueError, "public-map eligibility"):
                    contributions.scaffold({"name": "A Person's House", "coordinates": None,
                                            "categories": ["Private residence"]})
                with self.assertRaisesRegex(ValueError, "public-map eligibility"):
                    contributions.scaffold({"name": "A Person", "coordinates": None, "categories": ["Unclassified"]})
                self.assertEqual(list(place_root.glob("*/*.json")), [])
        finally:
            places.ROOT, places.PLACES, places.ALIASES = old

    def test_fork_pull_request_workflows_are_read_only_and_do_not_persist_checkout_credentials(self):
        places_workflow = (ROOT / ".github/workflows/validate-places.yml").read_text()
        speed_workflow = (ROOT / ".github/workflows/validate-speed-limits.yml").read_text()
        for workflow in (places_workflow, speed_workflow):
            self.assertIn("permissions:\n  contents: read", workflow)
            self.assertIn("persist-credentials: false", workflow)
            self.assertNotIn("pull_request_target", workflow)
            self.assertNotIn("secrets.", workflow)
            self.assertNotIn("GH_TOKEN", workflow)
        self.assertIn("validate_place_contributions.py", places_workflow)
        self.assertGreaterEqual(speed_workflow.count("github.event.pull_request.head.repo.full_name == github.repository"), 3)

    def test_existing_pages_workflow_rebuilds_public_place_data_on_main_push(self):
        workflow = (ROOT / ".github/workflows/pages.yml").read_text()
        app = (ROOT / "assets/js/app.js").read_text()
        self.assertIn("branches: [main]", workflow)
        self.assertIn("python scripts/places.py build", workflow)
        self.assertIn("validate_place_contributions.py", workflow)
        self.assertIn("actions/upload-pages-artifact@v3", workflow)
        self.assertIn("generated/manifest.json", app)


if __name__ == "__main__":
    unittest.main()
