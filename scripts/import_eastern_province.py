#!/usr/bin/env python3
"""Offline review/import of captured mzc responses within Eastern Province."""
from __future__ import annotations
import argparse, hashlib, json, math, sys
from collections import Counter, defaultdict
from pathlib import Path
from shapely.geometry import Point, shape
ROOT=Path(__file__).resolve().parents[1]
BOUNDARY=ROOT/"data/boundaries/eastern-province-districts.geojson"
COVERAGE=ROOT/"data/boundaries/eastern-province-coverage.json"
sys.path.insert(0,str(ROOT/"scripts"))
import places
from import_mzc_places import (coordinates,distance_m,normalized_text,normalized_address,
    _match_conflicts,_has_shared_identity_evidence,group_candidates,integrity_snapshot)
from place_eligibility import classify_place
from place_names import normalize_place_name
from places_cleanup_phase2 import normalize_address

def load_districts():
    metadata=json.loads(COVERAGE.read_text(encoding="utf-8"))
    if hashlib.sha256(BOUNDARY.read_bytes()).hexdigest()!=metadata["district_geometry_sha256"]:
        raise ValueError("Eastern Province boundary checksum mismatch")
    data=json.loads(BOUNDARY.read_text(encoding="utf-8")); geometries={}
    for feature in data.get("features",[]):
        props=feature.get("properties",{}); name=props.get("district_name")
        if metadata["district_attributes"].get(name)!=props.get("district_code"):
            raise ValueError("District name/code does not match boundary metadata")
        polygon=shape(feature.get("geometry"))
        if polygon.is_empty or not polygon.is_valid or polygon.geom_type not in {"Polygon","MultiPolygon"}:
            raise ValueError("Invalid Eastern Province district geometry")
        geometries[name]=polygon
    if set(geometries)!=set(metadata["district_attributes"]):
        raise ValueError("Expected all three Eastern Province districts")
    return geometries

def load_captures(input_dir):
    manifest=json.loads((input_dir/"query-manifest.json").read_text(encoding="utf-8")); rows=[]
    for query in manifest:
        if query.get("status")!="success": continue
        if query.get("limit")!=500 or query.get("country")!="lk":
            raise ValueError("Captured queries must specify limit 500 and country lk")
        payload=json.loads((input_dir/(query["key"]+".json")).read_text(encoding="utf-8"))
        results=payload.get("results")
        if not isinstance(results,list) or len(results)>500 or len(results)!=query.get("count"):
            raise ValueError("Captured response count or result limit mismatch")
        rows.extend({"query":query,"record":record} for record in results if isinstance(record,dict))
    return manifest,rows

def district_for(point,geometries):
    lat,lon=point; p=Point(lon,lat)
    names=[name for name,g in geometries.items() if g.covers(p)]
    if len(names)!=1: return "out_of_district" if not names else "boundary_uncertain"
    name=names[0]
    # District polygons have documented boundary caveats; hold points within
    # approximately 100 m of a boundary for review.
    if geometries[name].boundary.distance(p)*max(1,111000*math.cos(math.radians(lat)))<100:
        return "boundary_uncertain"
    return name

def kattankudy_retention_count(records):
    metadata=json.loads(COVERAGE.read_text(encoding="utf-8"))["kattankudy_retention_boundary"]
    path=ROOT/metadata["file"]
    if hashlib.sha256(path.read_bytes()).hexdigest()!=metadata["geometry_sha256"]:
        raise ValueError("Kattankudy retention boundary checksum mismatch")
    payload=json.loads(path.read_text(encoding="utf-8"))
    if len(payload.get("features",[]))!=1:
        raise ValueError("Expected one Kattankudy DSD polygon")
    props=payload["features"][0].get("properties",{})
    if props.get("ds_division_code")!=5124 or props.get("ds_division_name")!="Kattankudy":
        raise ValueError("Retention boundary is not Kattankudy DS Division")
    polygon=shape(payload["features"][0]["geometry"])
    geometry_ids=set(); address_ids=set()
    for record in records:
        point=coordinates(record)
        if point and polygon.covers(Point(point[1],point[0])):
            geometry_ids.add(record["id"])
        address=str(record.get("address") or "").casefold()
        if "kattankudy" in address or "kattankudi" in address:
            address_ids.add(record["id"])
    return {"inside_kattankudy_ds_polygon":len(geometry_ids),
        "address_mentions_kattankudy":len(address_ids),"unique_union":len(geometry_ids|address_ids)}

def place_file_hashes():
    return {path.relative_to(ROOT).as_posix():hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted((ROOT/"data/places").glob("[0-9]*/**/*.json"))}

def analyze(input_dir):
    queries,rows=load_captures(input_dir); geometries=load_districts()
    records,shard_counts,_=places.load_places(); aliases=places.load_aliases(); existing=list(records)
    for entry in aliases.values():
        old=entry.get("record")
        if isinstance(old,dict) and coordinates(old) and old.get("name")!="Location withheld pending eligibility review":
            existing.append(old)
    by_name=defaultdict(list)
    for old in existing:
        point=coordinates(old)
        if point and old.get("name"): by_name[normalized_text(old["name"])].append((old,point))
    candidates=group_candidates(rows); counts=Counter(); district_counts=Counter(); category_counts=Counter(); accepted=[]
    for item in candidates:
        record=dict(item["record"]); point=coordinates(record)
        if not record.get("name"): counts["invalid_missing_name"]+=1; continue
        if point is None: counts["invalid_or_missing_coordinates"]+=1; continue
        district=district_for(point,geometries)
        if district not in geometries: counts[district]+=1; continue
        district_counts[district]+=1
        category_counts.update(record.get("categories",[]) if isinstance(record.get("categories"),list) else [])
        eligibility=classify_place(record)
        if eligibility["classification"]=="confirmed_private_residential":
            counts["excluded_confirmed_private"]+=1; continue
        if not eligibility["eligible_for_public_map"]:
            counts["uncertain_public_eligibility"]+=1; continue
        if item["conflicts"]: counts["conflicting_candidate_fields"]+=1; continue
        matches=[(distance_m(point,old_point),old) for old,old_point in by_name.get(normalized_text(record["name"]),[]) if distance_m(point,old_point)<=250]
        if matches:
            dist,old=min(matches,key=lambda pair:pair[0]); conflicts=_match_conflicts(record,old)
            if dist<=5 and not conflicts and _has_shared_identity_evidence(record,old):
                counts["existing_place_duplicates"]+=1
            else: counts["unresolved_existing_matches"]+=1
            continue
        if not isinstance(record.get("categories"),list) or not record["categories"]:
            counts["missing_category_withheld"]+=1; continue
        record["name"]=normalize_place_name(record["name"])
        if isinstance(record.get("address"),str): record["address"]=normalize_address(record["address"])
        source_names=[str(member["record"].get("name") or "").strip() for member in item["members"]]
        source_addresses=[member["record"].get("address") for member in item["members"]
            if isinstance(member["record"].get("address"),str) and member["record"]["address"].strip()]
        record={k:v for k,v in record.items() if k in {"name","coordinates","categories","address","phone","website","business_status","hours"} and v not in (None,"",[])}
        accepted.append({"record":record,"district":district,"query_keys":sorted({m["query"]["key"] for m in item["members"]}),
            "name_normalized":any(value!=record["name"] for value in source_names),
            "address_normalized":any(value!=record.get("address") for value in source_addresses)})
        counts["new_eligible_candidates"]+=1
    groups=defaultdict(list)
    for i,item in enumerate(accepted):
        groups[normalized_text(item["record"]["name"])].append((i,item,coordinates(item["record"])))
    blocked=set(); pair_count=0
    for group in groups.values():
        for pos,(li,left,lp) in enumerate(group):
            for ri,right,rp in group[pos+1:]:
                if distance_m(lp,rp)>250: continue
                a,b=left["record"],right["record"]
                distinct_address=bool(a.get("address") and b.get("address") and normalized_address(a["address"])!=normalized_address(b["address"]))
                distinct_contact=any(a.get(f) and b.get(f) and a[f]!=b[f] for f in ("phone","website"))
                if not (distinct_address or distinct_contact): blocked.update((li,ri)); pair_count+=1
    if blocked:
        counts["unresolved_internal_nearby_candidates"]+=len(blocked)
        accepted=[row for i,row in enumerate(accepted) if i not in blocked]
    return {"queries":queries,"rows":rows,"candidates":candidates,"accepted":accepted,"counts":counts,
        "district_counts":district_counts,"category_counts":category_counts,"nearby_pairs":pair_count,
        "records":records,"ids":{r["id"] for r in records},"aliases":aliases,
        "integrity_before":integrity_snapshot(ROOT,records,aliases),"shard_counts":shard_counts,
        "place_files_before":place_file_hashes(),
        "alias_file_sha256":hashlib.sha256((ROOT/"data/places/aliases.json").read_bytes()).hexdigest(),
        "kattankudy_before":kattankudy_retention_count(records)}

def report_for(plan):
    successes=[q for q in plan["queries"] if q.get("status")=="success"]
    failures=[q for q in plan["queries"] if q.get("status")=="failed"]
    classified=Counter(plan["counts"])
    for key in ("excluded_confirmed_private","invalid_or_missing_coordinates","invalid_missing_name",
        "conflicting_candidate_fields","missing_category_withheld","unresolved_existing_matches",
        "unresolved_internal_nearby_candidates"):
        classified.setdefault(key,0)
    return {"report_version":1,"scope":"Batticaloa, Ampara and Trincomalee districts, Eastern Province",
      "boundary_source":"Sri Lanka NSDI Srilanka/Boundaries MapServer; see data/boundaries/eastern-province-coverage.json",
      "boundary_license_note":"NSDI metadata exposed no redistribution license; the polygons are used only for internal eligibility checks.",
      "discovery":{"interface":"documented mzc CLI only","command_template":"mzc -l 500 -c lk -t 30 '<query>'",
        "pagination":"No pagination arguments are documented; responses at 500 require query subdivision.",
        "planned_unique_queries":131,"captured_successful_queries":len(successes),"captured_failed_queries":len(failures),
        "query_prompts_attempted_or_interrupted":4,"planned_prompts_not_attempted":127,
        "mzc_invocations_with_limit_500":14,"successful_invocations_with_limit_500":1,
        "failed_invocations_with_limit_500":12,"interrupted_invocations_with_limit_500":1,
        "preliminary_invocations_with_limit_1":2,"total_documented_place_query_invocations":16,
        "unique_query_prompts_attempted":10,
        "additional_diagnostic_queries":6,"additional_diagnostic_successes":0,"additional_diagnostic_failures":6,
        "additional_diagnostic_failure":"One district and one locality query per district timed out after 30 seconds.",
        "successes":[{"district":q.get("district"),"area":q.get("area"),"category":q.get("category"),"count":q.get("count")} for q in successes],
        "failures":[{"district":q.get("district"),"area":q.get("area"),"category":q.get("category"),"attempts":len(q.get("attempts",[]))} for q in failures],
        "exhaustive_inventory":False,"pagination_exhausted":False},
      "processing":{"raw_candidates":len(plan["rows"]),"unique_name_coordinate_candidates":len(plan["candidates"]),
        "classification_counts":dict(sorted(classified.items())),"newly_imported_places":len(plan["accepted"]),
        "updated_existing_places":0,"district_candidate_counts":dict(sorted(plan["district_counts"].items())),
        "normalized_imported_names":sum(row["name_normalized"] for row in plan["accepted"]),
        "normalized_imported_addresses":sum(row["address_normalized"] for row in plan["accepted"]),
        "category_candidate_counts_overlapping":dict(sorted(plan["category_counts"].items())),
        "unresolved_internal_nearby_pair_count":plan["nearby_pairs"],
        "private_or_uncertain_details_published":False,"canonical_records_have_mzc_metadata":False,
        "roads_and_speed_limits_modified":False},
      "kattankudy_retention":{"before":plan["kattankudy_before"],
        "membership_rule":"Union of coordinates covered by the Kattankudy DS polygon and an address containing Kattankudy/Kattankudi; aggregate counts only."},
      "coverage_gaps":["Batticaloa and Trincomalee district and locality discovery is blocked by mzc read timeouts.",
        "Ampara currently has only one successful broad 46-result capture; category/division searches and pagination could not be completed.",
        "No exhaustive inventory or pagination is documented; complete Eastern Province coverage cannot be claimed."]}

def apply_import(plan,report):
    used=set(plan["ids"])|set(plan["aliases"]); imported=[]
    for item in plan["accepted"]:
        record=dict(item["record"]); rid=places.new_unique_ulid()
        while rid in used: rid=places.new_unique_ulid()
        used.add(rid); record["id"]=rid; places.validate_record(record)
        if not classify_place(record)["eligible_for_public_map"]: raise ValueError("Eligibility gate changed; refusing import")
        shard=places.next_shard(); shard.mkdir(parents=True,exist_ok=True)
        with (shard/(rid+".json")).open("x",encoding="utf-8") as f: json.dump(record,f,ensure_ascii=False,indent=2); f.write("\n")
        imported.append({"id":rid,"district":item["district"],"query_keys":item["query_keys"]})
    places.build()
    import build_map_delivery
    build_map_delivery.build()
    records,shard_counts,_=places.load_places(); aliases=places.load_aliases(); after=integrity_snapshot(ROOT,records,aliases); after["shard_counts"]=shard_counts; before=dict(plan["integrity_before"]); before["shard_counts"]=plan["shard_counts"]
    for k in ("alias_count","road_records","road_sources_sha256","speed_limit_records","speed_limit_sources_sha256","supplementary_maxspeed_records","supplementary_source_sha256"):
        if after.get(k)!=before.get(k): raise ValueError("Unexpected change to protected dataset: "+k)
    if not plan["ids"].issubset({r["id"] for r in records}): raise ValueError("Existing place ULID was lost")
    current_files=place_file_hashes()
    if any(current_files.get(path)!=digest for path,digest in plan["place_files_before"].items()):
        raise ValueError("An existing canonical place file was modified or removed")
    alias_sha=hashlib.sha256((ROOT/"data/places/aliases.json").read_bytes()).hexdigest()
    if alias_sha!=plan["alias_file_sha256"]: raise ValueError("Permanent aliases changed during import")
    manifest=json.loads(places.PLACE_MANIFEST.read_text(encoding="utf-8"))
    report["processing"]["imports"]=imported
    report["before_after_integrity"]={"before":before,"after":after,"all_existing_place_ids_retained":True,
       "aliases_retained":True,"existing_place_json_modified":0,
       "alias_file_sha256_before":plan["alias_file_sha256"],"alias_file_sha256_after":alias_sha,
       "shards_within_999_limit":max(after["shard_counts"].values(),default=0)<=places.LIMIT}
    report["kattankudy_retention"]["after"]=kattankudy_retention_count(records)
    report["kattankudy_retention"]["all_kattankudy_records_retained"]=(
        report["kattankudy_retention"]["before"]==report["kattankudy_retention"]["after"])
    report["generated_delivery"]={"active_place_records":len(records),
       "geographic_features":manifest["delivery"]["mvt_pmtiles"]["features"],
       "aliases":len(aliases),"shards":after["shard_counts"],
       "pmtiles_bytes":manifest["delivery"]["mvt_pmtiles"]["bytes"],
       "pmtiles_sha256":manifest["delivery"]["mvt_pmtiles"]["sha256"]}
    return report

def main():
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument("--input-dir",type=Path,required=True)
    parser.add_argument("--report-json",type=Path,default=ROOT/"reports/eastern-province-expansion.json")
    parser.add_argument("--report-md",type=Path,default=ROOT/"docs/EASTERN_PROVINCE_EXPANSION.md")
    parser.add_argument("--apply",action="store_true"); args=parser.parse_args()
    plan=analyze(args.input_dir); report=report_for(plan)
    if args.apply: report=apply_import(plan,report)
    args.report_json.parent.mkdir(parents=True,exist_ok=True)
    args.report_json.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    args.report_md.parent.mkdir(parents=True,exist_ok=True)
    args.report_md.write_text(render_report(report)+"\n",encoding="utf-8")
    print(json.dumps({"raw_candidates":len(plan["rows"]),"unique_candidates":len(plan["candidates"]),
        "eligible_new_places":len(plan["accepted"]),"classification_counts":dict(plan["counts"]),"applied":args.apply},indent=2))
    return 0

def render_report(report):
    d=report["discovery"]; p=report["processing"]
    lines=["# Eastern Province Places Expansion","",
      "## Discovery and coverage","",
      "- Scope: Batticaloa, Ampara and Trincomalee districts.",
      f"- Planned matrix prompts: {d['planned_unique_queries']}; successful prompts: {d['captured_successful_queries']}; failed prompts: {d['captured_failed_queries']}; unattempted planned prompts: {d['planned_prompts_not_attempted']}.",
      f"- Recorded mzc place-query invocations: {d['total_documented_place_query_invocations']}; limit 500: {d['mzc_invocations_with_limit_500']}; preliminary limit 1: {d['preliminary_invocations_with_limit_1']}. The two preliminary probes returned errors and contributed no place records.",
      f"- Unique attempted prompt strings: {d['unique_query_prompts_attempted']} (repeated diagnostic prompts are counted once here).",
      f"- Of the limit-500 calls: {d['successful_invocations_with_limit_500']} succeeded, {d['failed_invocations_with_limit_500']} failed, and {d['interrupted_invocations_with_limit_500']} was interrupted while capture was stopped.",
      "- The documented help has no pagination or cursor option. This matrix is not an exhaustive inventory; no zero-missing-place claim is made.",
      "- One Ampara district prompt returned 46 rows. District and locality probes in Batticaloa, Ampara and Trincomalee timed out; additional Ampara division/category coverage remains uncollected.",
      "- Raw responses remain in the temporary Codespace capture directory. Aggregate query accounting is separate; canonical records contain no mzc/import-source fields.","",
      "## Candidate processing","",
      f"- Raw rows: {p['raw_candidates']}; unique normalized-name/coordinate candidates: {p['unique_name_coordinate_candidates']}.",
      f"- Classification counts: {json.dumps(p['classification_counts'],sort_keys=True)}.",
      f"- Eligible additions: {p['newly_imported_places']}; existing place updates: {p['updated_existing_places']}.",
      f"- Imported names normalized: {p.get('normalized_imported_names',0)}; imported addresses normalized: {p.get('normalized_imported_addresses',0)}.",
      f"- Unique candidates located inside district polygons: {json.dumps(p['district_candidate_counts'],sort_keys=True)}.",
      f"- Category counts overlap when a candidate has multiple categories: {json.dumps(p['category_candidate_counts_overlapping'],ensure_ascii=False,sort_keys=True)}.",
      f"- Unresolved nearby same-name pairs: {p['unresolved_internal_nearby_pair_count']}.","",
      "## Kattankudy and integrity","",
      f"- Kattankudy-associated baseline: {report['kattankudy_retention']['before']['unique_union']} records by the documented union rule ({report['kattankudy_retention']['before']['inside_kattankudy_ds_polygon']} within the DS polygon; {report['kattankudy_retention']['before']['address_mentions_kattankudy']} address strings mention Kattankudy).",
      "- Existing source files, IDs and aliases are checked during apply; the flow appends records and does not reassign IDs.",
      "- Roads, speed limits and supplementary maxspeed data are checked by count and SHA-256 and are not modified.",
      "- NSDI district boundaries have documented accuracy caveats. A 100 m border buffer is withheld. Layer metadata exposed no redistribution license statement; the boundary files are internal QA assets.","",
      "## Blockers and limitations","",
      "- mzc read-operation timeouts blocked district and locality discovery. Coverage outside the one successful Ampara response remains incomplete.",
      "- mzc output was not independently verified.",
      "- This work does not establish an exhaustive Eastern Province inventory or expanded routing coverage."]
    if "generated_delivery" in report:
        g=report["generated_delivery"]
        lines += ["","## Generated delivery","",
          f"- Active places: {g['active_place_records']}; geographic features: {g['geographic_features']}; aliases: {g['aliases']}.",
          f"- PMTiles: {g['pmtiles_bytes']:,} bytes; SHA-256 {g['pmtiles_sha256']}.",
          f"- Shards: {json.dumps(g['shards'],sort_keys=True)}."]
    if "verification" in report:
        v=report["verification"]
        lines += ["","## Local verification","",
          f"- Python tests: {v['python_tests']} passed; Node unit tests: {v['node_tests']} passed.",
          f"- Playwright Chromium {v['browser_version']}: pass; {v['light_dark_view_count']} district/geographic views loaded; {v['accessibility_violations']} automated WCAG violations.",
          f"- New Ampara record search and details: {v['ampara_import_search_and_details']}; local PMTiles Range responses: HTTP 206 verified.",
          f"- First run: startup {v['browser_runs'][0]['startup_ms']} ms, startup transfer {v['browser_runs'][0]['startup_transfer_bytes']:,} B, post-GC heap {v['browser_runs'][0]['post_gc_heap_bytes']:,} B, animation p50/p95 {v['browser_runs'][0]['frame_p50_ms']}/{v['browser_runs'][0]['frame_p95_ms']} ms.",
          f"- Retry run: startup {v['browser_runs'][1]['startup_ms']} ms, startup transfer {v['browser_runs'][1]['startup_transfer_bytes']:,} B, post-GC heap {v['browser_runs'][1]['post_gc_heap_bytes']:,} B, animation p50/p95 {v['browser_runs'][1]['frame_p50_ms']}/{v['browser_runs'][1]['frame_p95_ms']} ms.",
          "- These are single headless mobile-emulation runs, not a repeated-device benchmark. Physical Android was unavailable. Live Pages search and Range validation require a deployment and are not implied by this local test."]
    return "\n".join(lines)
if __name__=="__main__": raise SystemExit(main())
