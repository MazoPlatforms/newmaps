#!/usr/bin/env python3
"""Mazo Maps place data validator, allocator, migrator and delivery metadata builder."""
import argparse, hashlib, json, math, os, re, secrets, sys, time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
from place_names import normalize_place_name
from place_eligibility import classify_place
PLACES=ROOT/'data'/'places'; GENERATED=ROOT/'generated'; ALIASES=PLACES/'aliases.json'; LIMIT=999
PLACE_MANIFEST=GENERATED/'manifest.json'
ULID=re.compile(r'^[0-7][0-9A-HJKMNP-TV-Z]{25}$')
SOURCE_FILES=sorted(p for p in ROOT.glob('*.json') if p.name not in {'manifest.json','migration-record-map.json','migration-exclusions.json'})

def encode_ulid(ms, randomness):
    value=(ms<<80)|randomness; out=''
    for _ in range(26): out='0123456789ABCDEFGHJKMNPQRSTVWXYZ'[value&31]+out; value>>=5
    return out
def new_ulid(): return encode_ulid(int(time.time()*1000),secrets.randbits(80))
def new_unique_ulid():
    records,_,_=load_places(); used={record['id'] for record in records}|set(load_aliases())
    candidate=new_ulid()
    while candidate in used:candidate=new_ulid()
    return candidate
def shard_files(shard): return sorted(p for p in shard.glob('*.json') if p.is_file())
def next_shard():
    shards=sorted((p for p in PLACES.iterdir() if p.is_dir()),key=lambda p:int(p.name)) if PLACES.exists() else []
    for shard in shards:
        if not shard.name.isdigit() or len(shard.name)!=4: raise ValueError(f'Invalid shard directory: {shard}')
        if len(shard_files(shard))<LIMIT:return shard
    number=max((int(p.name) for p in shards),default=0)+1
    return PLACES/f'{number:04d}'
def validate_record(record, path=None, allow_invalid_coordinates=False):
    if not isinstance(record,dict): raise ValueError(f'{path}: record must be an object')
    if not isinstance(record.get('id'),str) or not ULID.fullmatch(record['id']): raise ValueError(f'{path}: invalid 26-character ULID')
    if path and path.stem!=record['id']: raise ValueError(f'{path}: filename must match id')
    if not isinstance(record.get('name'),str) or not record['name'].strip(): raise ValueError(f'{path}: name is required')
    if 'coordinates' not in record: raise ValueError(f'{path}: coordinates is required; use null when location is unverified')
    c=record.get('coordinates')
    if c is not None:
        if not isinstance(c,dict): raise ValueError(f'{path}: coordinates must be an object or null')
        lat,lon=c.get('latitude'),c.get('longitude')
        if (isinstance(lat,bool) or isinstance(lon,bool) or
            not isinstance(lat,(int,float)) or not isinstance(lon,(int,float)) or
            not math.isfinite(lat) or not math.isfinite(lon) or
            not (-90<=lat<=90 and -180<=lon<=180)):
            raise ValueError(f'{path}: invalid coordinates')
    if 'categories' in record and (not isinstance(record['categories'],list) or not all(isinstance(x,str) and x.strip() for x in record['categories'])): raise ValueError(f'{path}: categories must be an array of non-empty strings')
def load_places():
    records=[]; ids=set(); counts={}; suspicious=[]
    for shard in sorted(PLACES.iterdir(),key=lambda p:p.name) if PLACES.exists() else []:
        if shard.is_file() and shard.name=='aliases.json': continue
        if not shard.is_dir() or not re.fullmatch(r'\d{4,}',shard.name): raise ValueError(f'Invalid shard name: {shard.name}')
        files=shard_files(shard); counts[shard.name]=len(files)
        if len(files)>LIMIT: raise ValueError(f'{shard} contains {len(files)} files; maximum is {LIMIT}')
        for path in files:
            p=json.loads(path.read_text(encoding='utf8')); validate_record(p,path,allow_invalid_coordinates=True)
            eligibility=classify_place(p)
            if not eligibility['eligible_for_public_map'] and isinstance(p.get('coordinates'),dict):
                raise ValueError(f'{path}: ineligible or uncertain place must not publish coordinates in the public map')
            if p['id'] in ids: raise ValueError(f'Duplicate ID: {p["id"]}')
            ids.add(p['id']); records.append(p)
    aliases=load_aliases()
    for retired_id in aliases:
        if retired_id in ids: raise ValueError(f'Retired place ID is also active: {retired_id}')
        target=resolve_place_id(retired_id,aliases)
        if target not in ids: raise ValueError(f'Place alias does not resolve to an active record: {retired_id} -> {target}')
    fingerprints={}
    for p in records:
        if not isinstance(p.get('coordinates'),dict):continue
        key=(p['name'].strip().casefold(),p['coordinates']['latitude'],p['coordinates']['longitude'])
        fingerprints.setdefault(key,[]).append(p['id'])
    for ids in fingerprints.values():
        if len(ids)>1:suspicious.extend([[ids[0],other] for other in ids[1:]])
    return records,counts,suspicious
def load_aliases():
    if not ALIASES.exists(): return {}
    data=json.loads(ALIASES.read_text(encoding='utf8'))
    if data.get('version')!=1 or not isinstance(data.get('aliases'),dict): raise ValueError('Invalid place aliases.json')
    for retired_id,entry in data['aliases'].items():
        if not isinstance(retired_id,str) or not ULID.fullmatch(retired_id): raise ValueError(f'Invalid retired place ULID: {retired_id!r}')
        if not isinstance(entry,dict) or not isinstance(entry.get('canonical_id'),str) or not ULID.fullmatch(entry['canonical_id']):
            raise ValueError(f'Invalid canonical target for retired place ULID: {retired_id}')
        if entry['canonical_id']==retired_id: raise ValueError(f'Place alias points to itself: {retired_id}')
        if 'record' in entry and (not isinstance(entry['record'],dict) or entry['record'].get('id')!=retired_id):
            raise ValueError(f'Alias record ID does not match retired ULID: {retired_id}')
    return data['aliases']
def resolve_place_id(record_id, aliases=None):
    aliases=load_aliases() if aliases is None else aliases
    seen=set()
    while record_id in aliases:
        if record_id in seen: raise ValueError(f'Place alias cycle: {record_id}')
        seen.add(record_id);record_id=aliases[record_id]['canonical_id']
    return record_id
def feature(p):
    if not classify_place(p)['eligible_for_public_map']:
        raise ValueError(f'{p["id"]}: refusing to publish an ineligible or unreviewed place')
    return {'type':'Feature','id':p['id'],'geometry':{'type':'Point','coordinates':[p['coordinates']['longitude'],p['coordinates']['latitude']]},'properties':{k:v for k,v in p.items() if k not in {'id','coordinates'}}}
def public_features(records=None):
    records = load_places()[0] if records is None else records
    return [feature(p) for p in sorted(records,key=lambda p:p['id'])
            if isinstance(p.get('coordinates'),dict) and classify_place(p)['eligible_for_public_map']]
def source_digest(records):
    content=json.dumps(records,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf8')
    return hashlib.sha256(content).hexdigest()
def build():
    records,counts,suspicious=load_places(); GENERATED.mkdir(exist_ok=True)
    excluded=[p['id'] for p in records if p.get('coordinates') is None and classify_place(p)['eligible_for_public_map']]
    withheld=sum(not classify_place(p)['eligible_for_public_map'] for p in records)
    features=public_features(records)
    # Places are delivered exclusively through MVT/PMTiles. Remove only the
    # obsolete place archive; road and speed-limit MZP files remain intact.
    (GENERATED/'batticaloa-district.mzp').unlink(missing_ok=True)
    previous={}
    if PLACE_MANIFEST.exists():
        try: previous=json.loads(PLACE_MANIFEST.read_text(encoding='utf8'))
        except (OSError,ValueError): previous={}
    aliases=load_aliases()
    resolved_aliases={retired:resolve_place_id(retired,aliases) for retired in aliases}
    source_sha256=source_digest(records)
    report={'format':'PMTiles/1','features':len(features),'excluded_without_coordinates':excluded,'withheld_pending_public_eligibility_review':withheld,'shards':counts,'aliases':resolved_aliases,'source_sha256':source_sha256}
    delivery=previous.get('delivery')
    if (isinstance(delivery,dict) and previous.get('production_default')=='pmtiles'
            and previous.get('source_sha256')==source_sha256):
        valid=True
        for key in ('mvt_pmtiles','search_index','place_details'):
            entry=delivery.get(key,{})
            target=GENERATED/str(entry.get('file',''))
            if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest()!=entry.get('sha256'):
                valid=False
                break
        if valid and delivery.get('mvt_pmtiles',{}).get('features')==len(features):
            report.update(format='PMTiles/1',production_default='pmtiles',delivery=delivery)
    (GENERATED/'manifest.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({key:value for key,value in report.items() if key!='aliases'} |
                     {'alias_count':len(aliases),'suspicious_duplicate_pairs':len(suspicious)},indent=2))
def allocate(record, allow_duplicate_candidate=False):
    if 'id' in record: raise ValueError('New places must not supply an existing id')
    record={**record,'name':normalize_place_name(record.get('name','')),'id':new_ulid()};validate_record(record)
    eligibility=classify_place(record)
    if not eligibility['eligible_for_public_map']:
        raise ValueError('Place does not have sufficient public-map eligibility evidence; keep it out of public data pending review')
    existing_records,_,_=load_places()
    used_ids={p['id'] for p in existing_records}|set(load_aliases())
    while record['id'] in used_ids: record['id']=new_ulid()
    if not allow_duplicate_candidate and isinstance(record.get('coordinates'),dict):
        incoming=(re.sub(r'[^\w]','',record['name'].casefold()),record['coordinates'].get('latitude'),record['coordinates'].get('longitude'))
        for existing in existing_records:
            c=existing.get('coordinates')
            if not isinstance(c,dict): continue
            key=(re.sub(r'[^\w]','',existing['name'].casefold()),c.get('latitude'),c.get('longitude'))
            if key==incoming: raise ValueError(f'Potential duplicate place already exists: {existing["id"]}; review or pass --allow-duplicate-candidate for a verified separate branch/place')
    shard=next_shard();shard.mkdir(parents=True,exist_ok=True);target=shard/(record['id']+'.json')
    with target.open('x',encoding='utf8') as f:json.dump(record,f,ensure_ascii=False,indent=2);f.write('\n')
    print(target.relative_to(ROOT))
    return target
def migrate():
    if PLACES.exists(): raise ValueError(f'{PLACES.relative_to(ROOT)} already exists; refusing to overwrite place records')
    if not SOURCE_FILES: raise ValueError('No legacy root-level place datasets found; refusing to create an empty migration')
    map_path=ROOT/'migration-record-map.json'
    old_mapping=json.loads(map_path.read_text()) if map_path.exists() else []
    stable_ids={(row['source'],row['index']):row['id'] for row in old_mapping}
    PLACES.mkdir(parents=True);mapping=[];records=[];excluded=[]
    shard=next_shard();shard.mkdir(parents=True,exist_ok=True);used=len(shard_files(shard))
    for source in SOURCE_FILES:
        payload=json.loads(source.read_text(encoding='utf8')); items=payload.get('results',payload if isinstance(payload,list) else [])
        if not isinstance(items,list): raise ValueError(f'{source}: expected results array')
        for index,old in enumerate(items):
            if not isinstance(old,dict): raise ValueError(f'{source}[{index}]: expected object')
            record=dict(old);record['id']=stable_ids.get((source.name,index),new_ulid())
            c=record.get('coordinates')
            if not isinstance(c,dict) or not isinstance(c.get('latitude'),(int,float)) or not isinstance(c.get('longitude'),(int,float)) or not (-90<=c['latitude']<=90 and -180<=c['longitude']<=180):
                record['coordinates']=None;excluded.append({'source':source.name,'index':index,'name':record.get('name'),'reason':'missing or invalid coordinates'})
            validate_record(record,allow_invalid_coordinates=True)
            if used>=LIMIT: shard=next_shard();shard.mkdir(parents=True,exist_ok=True);used=len(shard_files(shard))
            target=shard/(record['id']+'.json')
            with target.open('x',encoding='utf8') as f:json.dump(record,f,ensure_ascii=False,indent=2);f.write('\n')
            used+=1;records.append(record);mapping.append({'source':source.name,'index':index,'id':record['id']})
    (ROOT/'migration-record-map.json').write_text(json.dumps(mapping,separators=(',',':'))+'\n')
    (ROOT/'migration-exclusions.json').write_text(json.dumps(excluded,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'source_files':len(SOURCE_FILES),'source_records':len(records),'migrated':len(records),'without_coordinates':len(excluded),'mapping':'migration-record-map.json','exclusions':'migration-exclusions.json'},indent=2))
def main():
    parser=argparse.ArgumentParser(); sub=parser.add_subparsers(dest='cmd',required=True)
    sub.add_parser('ulid'); sub.add_parser('validate'); sub.add_parser('build'); sub.add_parser('migrate')
    a=sub.add_parser('add');a.add_argument('json_file',type=Path);a.add_argument('--allow-duplicate-candidate',action='store_true')
    args=parser.parse_args()
    try:
        if args.cmd=='ulid':print(new_unique_ulid())
        elif args.cmd=='add':allocate(json.loads(args.json_file.read_text(encoding='utf8')),args.allow_duplicate_candidate)
        elif args.cmd=='migrate':migrate()
        elif args.cmd=='validate':
            r,c,d=load_places();print(json.dumps({'records':len(r),'shards':c,'suspicious_duplicate_pairs':len(d)},indent=2))
        else:build()
    except Exception as e:print(f'ERROR: {e}',file=sys.stderr);return 1
    return 0
if __name__=='__main__':sys.exit(main())
