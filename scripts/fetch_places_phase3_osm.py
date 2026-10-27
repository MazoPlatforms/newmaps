#!/usr/bin/env python3
"""Rate-limited, bounded OSM lookup for public-eligible duplicate groups.

Nominatim usage is limited to one request per second. Private/uncertain records
are never sent to the public geocoder. Empty results are not negative evidence.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from place_eligibility import classify_place

PHASE2 = ROOT / "reports" / "places-data-quality-phase-2.json"
OUTPUT = ROOT / "reports" / "places-phase3-osm-evidence.json"
API = "https://nominatim.openstreetmap.org/search"
DOCS = "https://nominatim.org/release-docs/latest/api/Search/"
VIEWBOX = "81.70,7.72,81.77,7.65"  # west,north,east,south


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def load_active() -> dict[str, dict]:
    records = {}
    for path in sorted((ROOT / "data/places").glob("*/*.json")):
        record = json.loads(path.read_text(encoding="utf-8"))
        records[record["id"]] = record
    return records


def query_rows(records: dict[str, dict], groups: list[dict]) -> dict[str, dict]:
    rows: dict[str, dict] = {}
    for group in groups:
        member_records = [records[i] for i in group["candidate_record_ids"]]
        if not all(classify_place(record)["eligible_for_public_map"] for record in member_records):
            continue
        names = sorted({str(record.get("name", "")).strip() for record in member_records if record.get("name")})
        if not names:
            continue
        query_name = names[0]
        key = " ".join(query_name.casefold().split())
        row = rows.setdefault(key, {"query_name": query_name, "name_variants": names, "group_ids": []})
        row["group_ids"].append(group["group_id"])
    return rows


def fetch_nominatim(query: str, timeout: int = 25) -> tuple[int, list]:
    params = urllib.parse.urlencode({
        "format": "jsonv2", "addressdetails": 1, "limit": 10,
        "viewbox": VIEWBOX, "bounded": 1, "q": query,
    })
    request = urllib.request.Request(
        f"{API}?{params}",
        headers={"User-Agent": "MazoMapsPhase3/1.0 (https://github.com/MazoPlatforms/newmaps; place eligibility review)"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.status, json.loads(response.read())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, help="maximum number of distinct public-place names to query")
    args = parser.parse_args()
    phase2 = json.loads(PHASE2.read_text(encoding="utf-8"))
    rows = query_rows(load_active(), phase2["unresolved_duplicate_groups"])
    existing = {}
    if OUTPUT.exists():
        existing = json.loads(OUTPUT.read_text(encoding="utf-8")).get("results_by_normalized_name", {})
    pending = [(key, row) for key, row in sorted(rows.items()) if key not in existing]
    if args.limit is not None:
        pending = pending[:max(0, args.limit)]
    result_map = dict(existing)
    last_request = 0.0
    failures = []
    for index, (key, row) in enumerate(pending, 1):
        delay = 1.05 - (time.monotonic() - last_request)
        if delay > 0:
            time.sleep(delay)
        query = f"{row['query_name']} Kattankudy Sri Lanka"
        params = urllib.parse.urlencode({"format": "jsonv2", "addressdetails": 1, "limit": 10,
                                         "viewbox": VIEWBOX, "bounded": 1, "q": query})
        url = f"{API}?{params}"
        checked = utc_now()
        try:
            status, results = fetch_nominatim(query)
            row_result = {**row, "query": query, "query_url": url, "checked_at_utc": checked,
                          "http_status": status,
                          "status": "results_found" if results else "no_result_returned",
                          "results": results}
        except Exception as exc:  # Preserve the failed status; never imply no match.
            message = f"{type(exc).__name__}: {str(exc)[:160]}"
            failures.append({"query_key": key, "status": "request_failed_not_checked", "error": message})
            row_result = {**row, "query": query, "query_url": url, "checked_at_utc": checked,
                          "status": "request_failed_not_checked", "error": message, "results": []}
        result_map[key] = row_result
        last_request = time.monotonic()
        payload = {"source": "OpenStreetMap Nominatim search API", "documentation_url": DOCS,
                   "query_policy": "At most one request per second; bounded to the Mazo Maps area. Empty results do not indicate that a place is private, invalid, or nonexistent.",
                   "fetched_at_utc": utc_now(), "unique_public_name_queries": len(rows),
                   "results_by_normalized_name": result_map, "request_failures": failures}
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if index % 20 == 0:
            print(f"Completed {index}/{len(pending)} pending public-name lookups.")
    if not pending and not OUTPUT.exists():
        OUTPUT.write_text(json.dumps({"source": "OpenStreetMap Nominatim search API",
                                      "documentation_url": DOCS, "fetched_at_utc": utc_now(),
                                      "unique_public_name_queries": len(rows),
                                      "results_by_normalized_name": result_map, "request_failures": failures},
                                     ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    counts = {}
    for item in result_map.values():
        counts[item.get("status", "unknown")] = counts.get(item.get("status", "unknown"), 0) + 1
    print(json.dumps({"distinct_public_name_queries": len(rows), "pending_queried": len(pending),
                      "status_counts": counts, "output": str(OUTPUT.relative_to(ROOT))}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
