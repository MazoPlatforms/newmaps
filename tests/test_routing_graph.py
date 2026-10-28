import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from scripts import build_routing_graph as routing


ROOT = Path(__file__).resolve().parents[1]


class RoutingGraphBuildTests(unittest.TestCase):
    def test_access_and_oneway_tags_are_applied_per_mode(self):
        road = {"highway": "residential", "tags": {"highway": "residential", "oneway": "yes"}}
        modes = routing.access_modes(road)
        forward, reverse = routing.direction_masks(road, modes)
        self.assertTrue(forward & routing.DRIVE)
        self.assertFalse(reverse & routing.DRIVE)
        self.assertTrue(reverse & routing.WALK)
        self.assertFalse(reverse & routing.BIKE)
        bicycle_bidirectional = {"highway": "residential", "tags": {"highway": "residential", "oneway": "yes", "oneway:bicycle": "no"}}
        bike_forward, bike_reverse = routing.direction_masks(bicycle_bidirectional, routing.access_modes(bicycle_bidirectional))
        self.assertTrue(bike_forward & routing.BIKE)
        self.assertTrue(bike_reverse & routing.BIKE)

    def test_private_road_is_excluded_and_designated_walkway_is_permitted(self):
        private = {"highway": "service", "tags": {"highway": "service", "access": "private"}}
        walkway = {"highway": "cycleway", "tags": {"highway": "cycleway", "access": "no", "foot": "yes", "motor_vehicle": "no", "bicycle": "yes"}}
        self.assertEqual(routing.access_modes(private), 0)
        self.assertEqual(routing.access_modes(walkway), routing.WALK | routing.BIKE)

    def test_build_is_deterministic_and_omits_unverified_speed_values(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "routing.json"
            report = Path(directory) / "routing-manifest.json"
            first = routing.build(ROOT / "kattankudy-all-roads.json", output, report)
            digest = hashlib.sha256(output.read_bytes()).hexdigest()
            second = routing.build(ROOT / "kattankudy-all-roads.json", output, report)
            self.assertEqual(digest, hashlib.sha256(output.read_bytes()).hexdigest())
            self.assertEqual(first["graph_sha256"], second["graph_sha256"])
            self.assertEqual(first["road_records"], 2102)
            self.assertGreater(first["routable_ways"], 2000)
            graph = json.loads(output.read_text())
            self.assertGreater(first["connectivity"]["driving"]["largest_component_nodes"], 6000)
            self.assertTrue(all("maxspeed" not in way for way in graph["ways"]))
            self.assertIn("unverified", graph["speed_tag_policy"])


if __name__ == "__main__":
    unittest.main()
