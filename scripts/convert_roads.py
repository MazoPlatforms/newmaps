#!/usr/bin/env python3
"""Convert Overture transportation segments to compact Mazo road JSON.
The configured Kattankudy rectangle is an approximate extraction area, not an
official administrative boundary. Geometries are clipped to that rectangle.
"""
import argparse, json
from pathlib import Path
from shapely.geometry import shape, box, mapping

FIELDS=("id","name","type","coordinates")
def features(path):
    with open(path,encoding="utf-8") as f:
        first=f.read(1);f.seek(0)
        if first=="{":
            # Overture CLI GeoJSON may be FeatureCollection or newline-delimited.
            try:
                obj=json.load(f)
                if obj.get("type")=="FeatureCollection":
                    yield from obj["features"]
                elif obj.get("type")=="Feature":
                    yield obj
                return
            except json.JSONDecodeError:
                f.seek(0)
        for line in f:
            if line.strip():
                yield json.loads(line)

def lines(geom):
    if geom.is_empty:return
    if geom.geom_type=="LineString":
        if len(geom.coords)>=2:yield [[round(x,7),round(y,7)] for x,y,*_ in geom.coords]
    elif hasattr(geom,"geoms"):
        for part in geom.geoms:yield from lines(part)

def convert(source,target,bounds):
    clip=box(*bounds); roads=[]; seen=set()
    for f in features(source):
        p=f.get("properties") or {}
        if p.get("subtype") not in ("road", "street"):continue
        g=shape(f["geometry"])
        if not g.intersects(clip):continue
        names=p.get("names") or {}
        name=names.get("primary") if isinstance(names,dict) else None
        for i,coords in enumerate(lines(g.intersection(clip))):
            rid=str(f.get("id") or p.get("id") or "unknown")+":"+str(i)
            if rid in seen:continue
            seen.add(rid)
            roads.append({"id":rid,"name":name,"type":p.get("class") or "road","coordinates":coords})
    roads.sort(key=lambda x:x["id"])
    if not roads:raise SystemExit("No roads found: refusing to replace existing dataset")
    out={"schema_version":1,"area":"Kattankudy (approximate bounding box)","source":"Overture Maps transportation/segment","bbox":list(bounds),"count":len(roads),"roads":roads}
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(out,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    print(f"Wrote {len(roads)} roads to {target}")

if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("source",type=Path);ap.add_argument("target",type=Path)
    ap.add_argument("--bbox",nargs=4,type=float,default=[81.70,7.65,81.77,7.72],metavar=("WEST","SOUTH","EAST","NORTH"))
    a=ap.parse_args();convert(a.source,a.target,a.bbox)
