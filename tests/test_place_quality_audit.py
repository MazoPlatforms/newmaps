import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import audit_places_quality as audit


class PlaceQualityAuditTests(unittest.TestCase):
    def test_missing_or_invalid_coordinates_are_not_repaired(self):
        self.assertFalse(audit.valid_coordinates(None))
        self.assertFalse(audit.valid_coordinates({"latitude": 91, "longitude": 81}))
        self.assertFalse(audit.valid_coordinates({"latitude": float("nan"), "longitude": 81}))
        self.assertTrue(audit.valid_coordinates({"latitude": 7.68, "longitude": 81.73}))

    def test_name_formatting_preserves_non_latin_and_does_not_mutate(self):
        original = "uthayam communication"
        self.assertEqual(audit.case_candidate(original), "Uthayam Communication")
        self.assertEqual(original, "uthayam communication")
        self.assertIsNone(audit.case_candidate("காத்தான்குடி"))

    def test_full_report_covers_all_unique_ulids_and_has_review_links(self):
        report = audit.audit()
        rows = report["records"]
        ids = [row["id"] for row in rows]
        self.assertEqual(len(rows), 3694)
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(audit.ULID.fullmatch(value) for value in ids))
        self.assertTrue(all(row["independent_lookup_links"]["openstreetmap_search"].startswith("https://www.openstreetmap.org/search?") for row in rows))
        self.assertTrue(all("review_priority_score" in row and "independent_public_evidence" in row for row in rows))

    def test_duplicate_report_is_conservative_and_retains_every_ulid(self):
        report = audit.audit()
        summary = report["summary"]
        groups = report["duplicate_groups"]
        self.assertEqual(summary["duplicate_candidate_groups"], len(groups))
        expected_excess = sum(len(group["candidate_record_ids"]) - 1 for group in groups)
        self.assertEqual(summary["potential_duplicate_excess_records"], expected_excess)
        self.assertEqual(summary["exactly_identical_groups_except_ulid"],
                         sum(bool(group.get("identical_except_id")) for group in groups))
        self.assertTrue(all("proposed_canonical_record_id" in group and "source_lineage" in group for group in groups))
        self.assertTrue(all(group["proposed_action"].startswith("Human review") for group in groups))

    def test_absence_of_contact_does_not_create_fake_classification(self):
        report = audit.audit()
        self.assertTrue(all("fake" not in " ".join(flag["code"] for flag in row["flags"]).lower() for row in report["records"]))
        no_contact = next(row for row in report["records"] if not row["has_phone"] and not row["has_website"])
        self.assertIn("not evidence that the place is fake", " ".join(x["explanation"] for x in no_contact["flags"]))


if __name__ == "__main__":
    unittest.main()
