import json, re, tempfile, unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import places

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
    def test_migrated_counts_metadata_and_geojson(self):
        records,shards,suspicious=places.load_places()
        mapping=json.loads((places.ROOT/'migration-record-map.json').read_text())
        self.assertEqual(len(records),3694)
        self.assertEqual(len(mapping),len(records))
        self.assertEqual({row['id'] for row in mapping},{r['id'] for r in records})
        self.assertEqual(shards,{'0001':999,'0002':999,'0003':999,'0004':697})
        self.assertEqual(len(suspicious),1422)
        no_coords=[r for r in records if r['coordinates'] is None]
        self.assertEqual(len(no_coords),2)
        self.assertEqual(sum(r['coordinates'] is not None for r in records)+len(no_coords),len(records))
        self.assertTrue(all(len(places.shard_files(s))<=999 for s in (places.PLACES).iterdir()))
        places.build()
        geo=json.loads((places.GENERATED/'kattankudy.mzp').read_text())
        self.assertEqual(len(geo['features']),3692)
        self.assertTrue(all(f['id'] for f in geo['features']))

    def test_migration_refuses_to_overwrite_active_places(self):
        with self.assertRaisesRegex(ValueError,'refusing to overwrite'):
            places.migrate()

if __name__=='__main__':unittest.main()
