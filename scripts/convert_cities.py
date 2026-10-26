#!/usr/bin/env python3
"""Convert Overture division GeoJSON/GeoJSONSeq to compact city label JSON."""
import json,sys
from pathlib import Path
def records(path):
    with open(path,encoding='utf-8') as f:
        head=f.read(512);f.seek(0)
        if '"FeatureCollection"' in head:
            yield from json.load(f).get('features',[])
        else:
            for line in f:
                if line.strip():yield json.loads(line)
def main(src,dst):
    cities=[];seen=set()
    for f in records(src):
        p=f.get('properties') or {}
        if p.get('country') not in ('LK','LKA',None):continue
        geom=f.get('geometry') or {}
        if geom.get('type')!='Point':continue
        xy=geom.get('coordinates') or []
        if len(xy)<2:continue
        lon,lat=xy[:2]
        if not (79.3<=lon<=82.1 and 5.8<=lat<=10.1):continue
        names=p.get('names') or {}
        name=names.get('primary') if isinstance(names,dict) else None
        if not name:continue
        subtype=str(p.get('subtype') or '')
        if subtype not in ('locality','localadmin','neighborhood','county','region','country'):continue
        key=(name.casefold(),round(lon,5),round(lat,5))
        if key in seen:continue
        seen.add(key)
        cities.append({'name':name,'coordinates':{'latitude':round(lat,7),'longitude':round(lon,7)},'level':subtype,'source_id':f.get('id') or p.get('id')})
    cities.sort(key=lambda c:(c['level'],c['name'].casefold()))
    if not cities:raise SystemExit('No Sri Lankan divisions extracted; existing file retained')
    out={'schema_version':1,'source':'Overture Maps divisions/division','count':len(cities),'cities':cities}
    target=Path(dst);target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Extracted',len(cities),'real city/division labels')
if __name__=='__main__':main(*sys.argv[1:3])
