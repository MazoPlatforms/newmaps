import json
import struct
import unittest
from pathlib import Path
from shapely.geometry import Point, shape

class ShorelineTests(unittest.TestCase):
    def test_committed_fallback_is_land_not_territorial_sea(self):
        document = json.loads((Path(__file__).resolve().parents[1] / 'data/basemap/sri-lanka-land.geojson').read_text())
        geometries = [shape(f['geometry']) for f in document['features']]
        self.assertTrue(all(g.is_valid for g in geometries))
        self.assertGreater(sum(g.area for g in geometries), 4.8)
        self.assertLess(sum(g.area for g in geometries), 6.6)
        for longitude, latitude in [(79.8612, 6.9271), (80.6337, 7.2906),
                                    (81.2152, 8.5874), (81.6934, 7.717)]:
            self.assertTrue(any(g.contains(Point(longitude, latitude)) for g in geometries))
        self.assertFalse(any(g.contains(Point(80.0, 5.0)) for g in geometries))

    def test_fallback_images_are_bounded_and_identical_size(self):
        root = Path(__file__).resolve().parents[1]
        for theme in ('light', 'dark'):
            image = (root / f'assets/data/sri-lanka-land-{theme}.png').read_bytes()
            self.assertEqual(image[:8], b'\x89PNG\r\n\x1a\n')
            self.assertEqual(struct.unpack('>II', image[16:24]), (1536, 1920))
            self.assertLess(len(image), 200_000)
