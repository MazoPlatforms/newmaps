import json
import unittest
from pathlib import Path

from scripts import plan_eastern_province as planner

ROOT = Path(__file__).resolve().parents[1]


class EasternProvincePlanTests(unittest.TestCase):
    def test_boundary_source_lists_all_three_districts_and_only_43_query_divisions(self):
        coverage = json.loads((ROOT / "data/boundaries/eastern-province-coverage.json").read_text())
        districts = coverage["district_attributes"]
        self.assertEqual(districts, {"Batticaloa": 51, "Ampara": 52, "Trincomalee": 53})
        self.assertEqual(len(coverage["divisions"]), 43)
        excluded = coverage["excluded_division_rows"]
        self.assertEqual(len(excluded), 2)
        self.assertTrue(all(not row["query_target"] for row in excluded))

    def test_plan_is_deterministic_geographic_category_matrix_with_documented_limit(self):
        coverage = json.loads((ROOT / "data/boundaries/eastern-province-coverage.json").read_text())
        first = planner.build_plan(coverage, previous=set())
        second = planner.build_plan(coverage, previous=set())
        self.assertEqual(first, second)
        self.assertEqual({row["district"] for row in first}, {"Batticaloa", "Ampara", "Trincomalee"})
        self.assertTrue(all(row["limit"] == 500 and row["country"] == "lk" for row in first))
        self.assertTrue(any(row["discovery_level"] == "divisional-secretariat" for row in first))
        self.assertTrue(any(row["discovery_level"] == "district-category" for row in first))
        self.assertGreaterEqual(len(first), 120)
        self.assertEqual(len({planner.normalize_query(row["query"]) for row in first}), len(first))

    def test_successful_historical_query_prompts_are_not_repeated(self):
        coverage = json.loads((ROOT / "data/boundaries/eastern-province-coverage.json").read_text())
        prior = {planner.normalize_query("  PUBLIC PLACES IN Ampara District, Eastern Province, Sri Lanka ")}
        plan = planner.build_plan(coverage, previous=prior)
        self.assertNotIn("public places in ampara district, eastern province, sri lanka",
                         {planner.normalize_query(row["query"]) for row in plan})

    def test_at_limit_district_query_refines_by_division_and_category(self):
        coverage = json.loads((ROOT / "data/boundaries/eastern-province-coverage.json").read_text())
        manifest = [{"district": "Ampara", "area": "Ampara", "category": "all-public",
                     "discovery_level": "district", "query": "public places in Ampara District",
                     "status": "success", "at_limit": True}]
        refined = planner.refine_at_limit(manifest, coverage)
        self.assertEqual(len(refined), 19 * len(planner.FAMILIES))
        self.assertTrue(all(row["limit"] == 500 and row["country"] == "lk" for row in refined))
        self.assertTrue(all(row["discovery_level"] == "divisional-category" for row in refined))


if __name__ == "__main__":
    unittest.main()
