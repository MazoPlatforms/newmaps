import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import enrich_roads
import roads
import speed_limits


class SupplementaryRoadEnrichmentTests(unittest.TestCase):
    def test_strict_match_threshold_and_ambiguous_duplicate_prevention(self):
        supplement = {"roads": [
            {"osm_id": 1, "name": "Main", "highway": "residential", "maxspeed": "30"},
            {"osm_id": 2, "name": "Main", "highway": "residential", "maxspeed": "25"},
            {"osm_id": 3, "name": "Other", "highway": "residential", "maxspeed": "40"},
        ]}
        rows = [
            {"osm_id": 1, "cover_8m": .95, "top": [{"source_id": "road-a", "name": "Main", "type": "residential", "nearest_fraction": .9}, {"nearest_fraction": .2}]},
            {"osm_id": 2, "cover_8m": .95, "top": [{"source_id": "road-a", "name": "Main", "type": "residential", "nearest_fraction": .9}, {"nearest_fraction": .2}]},
            {"osm_id": 3, "cover_8m": .89, "top": [{"source_id": "road-b", "name": "Other", "type": "residential", "nearest_fraction": .9}, {"nearest_fraction": .1}]},
        ]
        matched, review = enrich_roads.candidates(supplement, rows)
        self.assertEqual(matched, {})
        self.assertEqual(review["1"]["reason"], "multiple_osm_features_match_same_road")
        self.assertEqual(review["2"]["reason"], "multiple_osm_features_match_same_road")
        self.assertEqual(review["3"]["reason"], "insufficient_geometry_overlap")

    def test_source_units_are_not_invented_and_raw_tag_is_preserved(self):
        value = enrich_roads.enrichment({"osm_id": 7, "maxspeed": "25", "tags": {"maxspeed": "25"}}, "a" * 64, {})
        self.assertEqual(value["maxspeed"], "25")
        self.assertIsNone(value["maxspeed_unit"])
        self.assertEqual(value["maxspeed_status"], "unverified_source_tag")
        self.assertEqual(value["source_tags"]["maxspeed"], "25")

    def test_merged_data_preserves_ids_and_does_not_promote_tag_to_limit(self):
        audit, rows = enrich_roads.load_partitioned(ROOT / "data/roads/supplementary-road-audit.json", "records")
        self.assertEqual(audit["source_records"], 2102)
        self.assertEqual(audit["source_records_with_maxspeed"], 711)
        roads_before, _ = roads.load_records()
        speeds, _ = speed_limits.load_records()
        self.assertEqual(len(roads_before), 3710)
        self.assertEqual(len(speeds), 3710)
        self.assertTrue(all(record["speed_limit_kmh"] is None for record in speeds))
        tagged = [r for r in roads_before if r.get("supplementary_maxspeed_evidence")]
        self.assertEqual(len(tagged), audit["tagged_matches"])
        for record in tagged:
            evidence = record["supplementary_maxspeed_evidence"]
            self.assertIsNone(evidence["maxspeed_unit"])
            self.assertEqual(evidence["maxspeed_status"], "unverified_source_tag")


    def test_generated_speed_mzp_preserves_unverified_source_evidence(self):
        import tempfile
        target = Path(tempfile.mkdtemp())
        manifest = speed_limits.build(output_dir=target)
        data = json.loads((target / "kattankudy-speed-limits.mzp").read_text())
        tagged = [feature for feature in data["features"] if feature["properties"].get("supplementary_maxspeed_evidence")]
        self.assertEqual(len(tagged), 462)
        self.assertEqual(manifest["supplementary_maxspeed_evidence"]["tagged_matches"], 462)
        sample = tagged[0]["properties"]["supplementary_maxspeed_evidence"]
        self.assertIsNone(sample["maxspeed_unit"])
        self.assertEqual(sample["maxspeed_status"], "unverified_source_tag")
        self.assertIn("maxspeed", sample["source_tags"])

    def test_run_audit_reports_no_automatic_additions(self):
        result = enrich_roads.run(write=False)
        self.assertEqual(result["new_roads_added"], 0)
        self.assertEqual(result["source_records"], 2102)
        self.assertGreater(result["unresolved_or_ambiguous"], 0)


if __name__ == "__main__":
    unittest.main()
