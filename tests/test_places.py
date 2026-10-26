import json, re, tempfile, unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import places
import validate_places_phase2

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
        aliases=json.loads((places.ROOT/'data/place-aliases.json').read_text())['aliases']
        active_ids={r['id'] for r in records}
        self.assertEqual(len(records),2655)
        self.assertEqual(len(mapping),3694)
        self.assertEqual(len(aliases),1039)
        self.assertEqual({row['id'] for row in mapping},active_ids|set(aliases))
        self.assertEqual(shards,{'0001':946,'0002':678,'0003':672,'0004':359})
        self.assertEqual(len(suspicious),383)
        no_coords=[r for r in records if r['coordinates'] is None]
        self.assertEqual(len(no_coords),2)
        self.assertEqual(sum(r['coordinates'] is not None for r in records)+len(no_coords),len(records))
        self.assertTrue(all(len(places.shard_files(s))<=999 for s in places.PLACES.iterdir() if s.is_dir() and s.name.isdigit()))
        places.build()
        geo=json.loads((places.GENERATED/'kattankudy.mzp').read_text())
        self.assertEqual(len(geo['features']),2653)
        self.assertTrue(all(f['id'] for f in geo['features']))
        self.assertEqual(places.GENERATED.joinpath('manifest.json').exists(),True)
        manifest=json.loads(places.GENERATED.joinpath('manifest.json').read_text())
        self.assertEqual(manifest['source_records'],3694)
        self.assertEqual(manifest['retired_aliases'],1039)
        self.assertEqual(manifest['source_to_ulid_mapping'],'migration-record-map.json')
        self.assertTrue(manifest['alias_map_sha256'])

    def test_retired_aliases_resolve_to_archived_original_records(self):
        aliases=json.loads((places.ROOT/'data/place-aliases.json').read_text())['aliases']
        mapping={r['id']:r for r in json.loads((places.ROOT/'migration-record-map.json').read_text())}
        by_id={r['id']:r for r in places.load_places()[0]}
        for alias_id,canonical_id in aliases.items():
            retired=json.loads((places.PLACES/'retired'/f'{alias_id}.json').read_text())
            self.assertEqual(retired['id'],alias_id)
            self.assertIn(alias_id,mapping)
            canonical=by_id[canonical_id]
            self.assertIn(alias_id,canonical['aliases'])
            clean={k:v for k,v in canonical.items() if k not in ('id','aliases','source_records') and not k.endswith('_original')}
            source={k:v for k,v in retired.items() if k!='id'}
            for original_field in ('name','address','categories','coordinates'):
                if original_field+'_original' in canonical:
                    clean[original_field]=canonical[original_field+'_original']
            self.assertEqual(clean,source)

    def test_all_source_records_match_immutable_archive(self):
        result=validate_places_phase2.validate()
        self.assertEqual(result['source_records_verified'],3694)
        self.assertEqual(result['mismatches'],0)

    def test_migration_refuses_to_overwrite_active_places(self):
        with self.assertRaisesRegex(ValueError,'refusing to overwrite'):
            places.migrate()

if __name__=='__main__':unittest.main()
