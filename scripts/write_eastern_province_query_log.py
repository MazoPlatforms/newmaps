#!/usr/bin/env python3
"""Write aggregate query execution state without retaining place payloads."""
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts import plan_eastern_province as planner

def build_log(plan,manifest):
    by_query={planner.normalize_query(row["query"]):row for row in manifest}
    grocery=next(row for row in plan if row["district"]=="Batticaloa" and row["category"]=="grocery-retail" and row["discovery_level"]=="district-category")
    rows=[]
    for item in plan:
        capture=by_query.get(planner.normalize_query(item["query"]))
        if capture:
            status=capture.get("status","unknown")
            entry={**item,"status":status,"attempts":capture.get("attempts",[]),
                   "count":capture.get("count"),"at_limit":capture.get("at_limit",False)}
        elif planner.normalize_query(item["query"])==planner.normalize_query(grocery["query"]):
            entry={**item,"status":"interrupted","attempts":[{"error":"capture process interrupted after CLI call began"}],
                   "count":None,"at_limit":False}
        else:
            entry={**item,"status":"not_attempted","attempts":[],"count":None,"at_limit":False}
        entry["query_sha256"]=hashlib.sha256(item["query"].encode()).hexdigest()
        rows.append(entry)
    additional=[
        {"query":"Batticaloa District","limit":1,"country":"lk","timeout":30,"status":"failed","reason":"read operation timed out","preliminary_interface_probe":True},
        {"query":"Kattankudy Sri Lanka","limit":1,"country":"lk","timeout":60,"status":"failed","reason":"read operation timed out","preliminary_interface_probe":True},
        {"query":"public places in Batticaloa District, Eastern Province, Sri Lanka","limit":500,"country":"lk","timeout":30,"status":"failed","reason":"read operation timed out","diagnostic_retry":True},
        {"query":"public places in Ampara District, Eastern Province, Sri Lanka","limit":500,"country":"lk","timeout":30,"status":"failed","reason":"read operation timed out","diagnostic_retry":True},
        {"query":"public places in Trincomalee District, Eastern Province, Sri Lanka","limit":500,"country":"lk","timeout":30,"status":"failed","reason":"read operation timed out","diagnostic_retry":True},
        {"query":"public places and businesses in Kattankudy Batticaloa Sri Lanka","limit":500,"country":"lk","timeout":30,"status":"failed","reason":"read operation timed out","diagnostic_retry":True},
        {"query":"public places and businesses in Kalmunai Ampara Sri Lanka","limit":500,"country":"lk","timeout":30,"status":"failed","reason":"read operation timed out","diagnostic_retry":True},
        {"query":"public places and businesses in Kinniya Trincomalee Sri Lanka","limit":500,"country":"lk","timeout":30,"status":"failed","reason":"read operation timed out","diagnostic_retry":True},
    ]
    attempted=[row["query"] for row in rows if row["status"] in {"success","failed","interrupted"}]
    attempted.extend(row["query"] for row in additional)
    return {"report_version":1,"planned_matrix_prompts":len(rows),"unique_planned_queries":len({x["query_sha256"] for x in rows}),
            "captured_manifest_prompts":len(manifest),"matrix":rows,"additional_invocations":additional,
            "unique_attempted_prompt_strings":len({planner.normalize_query(value) for value in attempted}),
            "successful_place_payload_count":sum(x.get("status")=="success" for x in rows),
            "raw_candidate_count":sum(x.get("count") or 0 for x in rows),
            "pagination_option_documented":False,
            "note":"No raw candidate rows are included. Two preliminary one-result probes predate the 500-limit matrix and both failed without returning data."}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest",type=Path,required=True)
    parser.add_argument("--output",type=Path,default=Path("reports/eastern-province-query-log.json"))
    args=parser.parse_args()
    plan=planner.build_plan()
    manifest=json.loads(args.manifest.read_text(encoding="utf-8"))
    value=build_log(plan,manifest)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(value,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"planned":value["planned_matrix_prompts"],"success":value["successful_place_payload_count"],
        "raw_candidates":value["raw_candidate_count"],"additional_invocations":len(value["additional_invocations"])},indent=2))
    return 0
if __name__=="__main__": raise SystemExit(main())
