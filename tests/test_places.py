import json, re, tempfile, unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import places
from place_quality import is_map_poi
from place_eligibility import classify_place

class PlaceTests(unittest.TestCase):
    def test_ulid_valid_and_unique(self):
        values=[places.new_ulid() for _ in range(1000)]
        self.assertEqual(len(values),len(set(values)))
        self.assertTrue(all(re.fullmatch(r'[0-7][0-9A-HJKMNP-TV-Z]{25}',v) for v in values))
    def test_shard_transitions(self):
        old=places.PLACES
        try:
            with tempfile.TemporaryDirectory() as tmp:
                places.PLACES=Path(tmp)
                for shard,count in [('0001',998)]:
                    d=places.PLACES/shard;d.mkdir()
                    for i in range(count):(d/f'{i:026d}.json').touch()
                self.assertEqual(places.next_shard().name,'0001')
                (places.PLACES/'0001'/'x.json').touch()
                self.assertEqual(places.next_shard().name,'0002')
                d=places.PLACES/'0002';d.mkdir()
                for i in range(999):(d/f'{i:026d}.json').touch()
                self.assertEqual(places.next_shard().name,'0003')
                self.assertEqual(sum(len(places.shard_files(s)) for s in places.PLACES.iterdir()),1998)
                self.assertTrue(all(len(places.shard_files(s))<=999 for s in places.PLACES.iterdir()))
        finally: places.PLACES=old
    def test_stable_canonical_place_data_and_manifest(self):
        records,shards,suspicious=places.load_places()
        aliases=places.load_aliases()
        self.assertEqual(sum(shards.values()),len(records))
        self.assertGreaterEqual(len(aliases),1039)
        self.assertGreaterEqual(len(suspicious),0)
        no_coords=[r for r in records if r['coordinates'] is None]
        withheld=sum(not classify_place(record)['eligible_for_public_map'] for record in records)
        self.assertEqual(len(no_coords),withheld)
        self.assertEqual(sum(r['coordinates'] is not None for r in records)+len(no_coords),len(records))
        self.assertTrue(all(len(places.shard_files(s))<=999 for s in (places.PLACES).iterdir()))
        places.build()
        geo={'type':'FeatureCollection','features':[f for f in places.public_features() if is_map_poi(f['properties'])]}
        manifest=json.loads((places.GENERATED/'manifest.json').read_text())
        self.assertEqual(len(geo['features']),manifest['features'])
        expected_features=sum(isinstance(r.get('coordinates'),dict) and classify_place(r)['eligible_for_public_map'] and is_map_poi(r) for r in records)
        self.assertEqual(manifest['features'],expected_features)
        self.assertGreater(manifest['features'],2550)
        self.assertTrue(all(f['id'] for f in geo['features']))
        self.assertEqual(manifest['aliases'],{key:places.resolve_place_id(key,aliases) for key in aliases})
        self.assertEqual(len(manifest['aliases']),len(aliases))

    def test_deleted_invalid_place_tombstone_does_not_resolve_to_a_different_place(self):
        retired='01ARZ3NDEKTSV4RRFFQ69G5FAW'
        self.assertIsNone(places.resolve_place_id(retired,{
            retired:{'deleted':True,'reason':'invalid_place_data_removed'}
        }))

    def test_null_coordinates_are_valid_but_invalid_non_null_ranges_always_fail(self):
        base={"id":"01AAAAAAAAAAAAAAAAAAAAAAAA","name":"Community Library","coordinates":None,
              "categories":["Library"]}
        places.validate_record(base)
        for coordinates in (
            {"latitude":91,"longitude":0},
            {"latitude":0,"longitude":181},
            {"latitude":True,"longitude":0},
            {"latitude":float("nan"),"longitude":0},
        ):
            with self.subTest(coordinates=coordinates):
                with self.assertRaisesRegex(ValueError,"invalid coordinates"):
                    places.validate_record({**base,"coordinates":coordinates},allow_invalid_coordinates=True)

if __name__=='__main__':unittest.main()
