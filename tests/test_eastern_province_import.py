import json
import tempfile
import unittest
from pathlib import Path

from shapely.geometry import Point

from scripts import import_eastern_province as importer
from scripts import plan_eastern_province as planner
from scripts.write_eastern_province_query_log import build_log


ROOT = Path(__file__).resolve().parents[1]


class EasternProvinceImportTests(unittest.TestCase):
    def test_district_polygons_are_checksum_verified_and_all_three_load(self):
        districts = importer.load_districts()
        self.assertEqual(set(districts), {"Batticaloa", "Ampara", "Trincomalee"})
        for name, polygon in districts.items():
            point = polygon.representative_point()
            self.assertEqual(importer.district_for((point.y, point.x), districts), name)

    def test_points_outside_districts_and_boundary_uncertainty_are_withheld(self):
        districts = importer.load_districts()
        self.assertEqual(importer.district_for((0.0, 0.0), districts), "out_of_district")
        batticaloa = districts["Batticaloa"]
        point = batticaloa.boundary.interpolate(0.5, normalized=True)
        self.assertEqual(importer.district_for((point.y, point.x), districts), "boundary_uncertain")

    def test_captured_queries_require_max_limit_and_country_filter(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            (path / "query-manifest.json").write_text(json.dumps([{
                "key": "bad", "status": "success", "query": "synthetic",
                "limit": 499, "country": "lk", "count": 0,
            }]))
            with self.assertRaisesRegex(ValueError, "limit 500"):
                importer.load_captures(path)

    def test_canonical_projection_does_not_create_importer_metadata(self):
        raw = {
            "name": "synthetic public library",
            "coordinates": {"latitude": 7.7, "longitude": 81.7},
            "categories": ["library"],
            "address": "  Main road ",
            "source_name": "must not flow into canonical records",
            "provenance": {"source_name": "must not flow into canonical records"},
        }
        projected = {k: v for k, v in raw.items() if k in {
            "name", "coordinates", "categories", "address", "phone",
            "website", "business_status", "hours"
        } and v not in (None, "", [])}
        self.assertNotIn("source_name", projected)
        self.assertNotIn("provenance", projected)

    def test_phase_plan_covers_all_districts_with_exactly_500_limit(self):
        coverage = json.loads((ROOT / "data/boundaries/eastern-province-coverage.json").read_text())
        plan = planner.build_plan(coverage, previous=set())
        self.assertEqual({q["district"] for q in plan}, {"Batticaloa", "Ampara", "Trincomalee"})
        self.assertTrue(all(q["limit"] == 500 and q["country"] == "lk" for q in plan))

    def test_kattankudy_retention_baseline_is_reproducible(self):
        import places
        records, _, _ = places.load_places()
        self.assertEqual(importer.kattankudy_retention_count(records), {
            "inside_kattankudy_ds_polygon": 1703,
            "address_mentions_kattankudy": 1871,
            "unique_union": 1908,
        })

    def test_query_log_records_unattempted_prompts_and_diagnostics_separately(self):
        coverage = json.loads((ROOT / "data/boundaries/eastern-province-coverage.json").read_text())
        plan = planner.build_plan(coverage, previous=set())
        manifest = [{"query": plan[0]["query"], "key": "test", "status": "failed",
                      "attempts": [{"error": "timeout"}], "limit": 500, "country": "lk"}]
        log = build_log(plan, manifest)
        self.assertEqual(log["planned_matrix_prompts"], len(plan))
        self.assertEqual(log["additional_invocations"][0]["limit"], 1)
        self.assertEqual(sum(row["status"] == "not_attempted" for row in log["matrix"]), len(plan) - 2)
        self.assertTrue(all(row["limit"] == 500 for row in log["matrix"]))

    def test_applied_records_preserve_all_baseline_files_aliases_and_road_datasets(self):
        report = json.loads((ROOT / "reports/eastern-province-expansion.json").read_text())
        processing = report["processing"]
        self.assertEqual(processing["newly_imported_places"], 35)
        self.assertEqual(processing["updated_existing_places"], 0)
        self.assertTrue(report["before_after_integrity"]["all_existing_place_ids_retained"])
        self.assertTrue(report["before_after_integrity"]["aliases_retained"])
        self.assertEqual(report["before_after_integrity"]["alias_file_sha256_before"],
                         report["before_after_integrity"]["alias_file_sha256_after"])
        self.assertTrue(report["kattankudy_retention"]["all_kattankudy_records_retained"])
        before, after = report["before_after_integrity"]["before"], report["before_after_integrity"]["after"]
        self.assertEqual(before["road_sources_sha256"], after["road_sources_sha256"])
        self.assertEqual(before["speed_limit_sources_sha256"], after["speed_limit_sources_sha256"])
        self.assertEqual(before["supplementary_source_sha256"], after["supplementary_source_sha256"])
        import places
        active = {row["id"]: row for row in places.load_places()[0]}
        for item in processing["imports"]:
            record = active[item["id"]]
            for forbidden in ("provenance", "source", "source_name", "import_source",
                              "discovery_query", "provider"):
                self.assertNotIn(forbidden, record)

    def test_replaying_an_imported_response_does_not_allocate_a_second_place(self):
        import places
        report = json.loads((ROOT / "reports/eastern-province-expansion.json").read_text())
        imported_id = report["processing"]["imports"][0]["id"]
        existing = next(row for row in places.load_places()[0] if row["id"] == imported_id)
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            query = {"key": "replay", "query": "synthetic replay", "district": "Ampara",
                     "area": "Ampara", "category": "all-public", "limit": 500,
                     "country": "lk", "status": "success", "count": 1}
            (directory / "query-manifest.json").write_text(json.dumps([query]))
            (directory / "replay.json").write_text(json.dumps({"count": 1, "results": [existing]}))
            plan = importer.analyze(directory)
        self.assertEqual(len(plan["accepted"]), 0)
        self.assertEqual(plan["counts"]["existing_place_duplicates"], 1)


if __name__ == "__main__":
    unittest.main()
