#!/usr/bin/env python3
"""Read-only, reproducible quality audit for Mazo Maps individual place records.

The audit never modifies place records. Scores measure confidence in the review
priority classification, not whether a place is real or fake.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
import unicodedata
from collections import defaultdict, Counter
from pathlib import Path
from urllib.parse import quote_plus

ROOT = Path(__file__).resolve().parents[1]
PLACES = ROOT / "data" / "places"
MAPPING = ROOT / "migration-record-map.json"
OUT = ROOT / "reports" / "places-quality-audit-2026-10-27.json"
ULID = re.compile(r"^[0-7][0-9A-HJKMNP-TV-Z]{25}$")
OFFICIAL_MOE = "https://dmb.moe.gov.lk/2024/01/01_PDF/Tbl20240106.pdf"
OFFICIAL_POST = "https://slpost.gov.lk/wp-content/uploads/2022/11/POST-CODE-BOOK-.pdf"
OFFICIAL_ZONE_CENSUS = "https://www.bczone.lk/schools/census_list.php"
IDB_ADDAX = "https://bizconnect.idb.gov.lk/listing/batticaloa/garment-textiles-and-allied/addax-clothing-pvt-ltd/"

# Census IDs found in the 2024 official Eastern Province list. These are only
# positive identity checks; absent IDs are not treated as evidence of falsity.
MOE_CENSUS_IDS = {
    "14130", "14131", "14137", "14138", "14140", "14141", "14142",
    "14143", "14144", "14146",
}
PUBLIC_SOURCE_URLS = {
    "official_school_list": OFFICIAL_MOE,
    "official_postcode_book": OFFICIAL_POST,
    "batticaloa_central_school_census": OFFICIAL_ZONE_CENSUS,
}


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def text_key(value):
    value = unicodedata.normalize("NFKD", str(value or "").casefold())
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return "".join(ch for ch in value if ch.isalnum())


def normalize_space(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def record_sha(record):
    return hashlib.sha256(canonical(record).encode("utf-8")).hexdigest()


def distance_m(a, b):
    lat1, lon1 = math.radians(a["latitude"]), math.radians(a["longitude"])
    lat2, lon2 = math.radians(b["latitude"]), math.radians(b["longitude"])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    q = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371000 * 2 * math.atan2(math.sqrt(q), math.sqrt(1 - q))


def valid_coordinates(c):
    if not isinstance(c, dict):
        return False
    lat, lon = c.get("latitude"), c.get("longitude")
    return (
        isinstance(lat, (int, float)) and not isinstance(lat, bool)
        and isinstance(lon, (int, float)) and not isinstance(lon, bool)
        and math.isfinite(lat) and math.isfinite(lon)
        and -90 <= lat <= 90 and -180 <= lon <= 180
    )


def source_links(place):
    name = place.get("name", "")
    address = place.get("address", "")
    query = normalize_space(f'"{name}" {address} Kattankudy Sri Lanka')
    c = place.get("coordinates")
    if valid_coordinates(c):
        osm_query = f'{name} {c["latitude"]:.6f},{c["longitude"]:.6f}'
    else:
        osm_query = f"{name} Kattankudy Sri Lanka"
    return {
        "openstreetmap_search": "https://www.openstreetmap.org/search?query=" + quote_plus(osm_query),
        "web_search": "https://www.google.com/search?q=" + quote_plus(query),
        "bing_search": "https://www.bing.com/search?q=" + quote_plus(query),
        "sri_lanka_business_directory_discovery": "https://www.google.com/search?q=" + quote_plus(f'site:bizconnect.idb.gov.lk/listing "{name}" Kattankudy'),
        "note": "Discovery links only; search results were not inspected for this individual record.",
    }


def case_candidate(value):
    """Suggest only mechanical casing/spacing changes; preserve all words."""
    if not isinstance(value, str) or not value:
        return None
    compact = normalize_space(value)
    if any(ord(ch) > 127 for ch in compact):
        return compact if compact != value else None
    letters = [c for c in compact if c.isalpha()]
    if not letters:
        return compact if compact != value else None
    if all(c.isupper() for c in letters):
        # Keep known abbreviations while only changing ordinary words. Unknown
        # brands still require a person to confirm this candidate.
        acronyms = {"SMR", "NHK", "ADS", "CCTV", "DJ", "FM", "AP", "LK", "PVT", "LTD", "PLC", "ATM", "DS", "SLT"}
        tokens = re.findall(r"[A-Za-z]+|[^A-Za-z]+", compact)
        candidate = "".join(t if t.upper() in acronyms else t.title() if t.isalpha() else t for t in tokens)
        return candidate if candidate != value else None
    if all(c.islower() for c in letters):
        candidate = compact.title()
        return candidate if candidate != value else None
    return compact if compact != value else None


def load_records():
    records, mapping = [], {}
    for row in json.loads(MAPPING.read_text(encoding="utf-8")):
        mapping[row["id"]] = {"source_file": row.get("source"), "source_index": row.get("index")}
    for path in sorted(p for p in PLACES.glob("*/*.json") if p.parent.name.isdigit()):
        record = json.loads(path.read_text(encoding="utf-8"))
        records.append((path, record))
    return records, mapping


def audit():
    entries, mapping = load_records()
    by_id = {r.get("id"): r for _, r in entries}
    exact_name_coord = defaultdict(list)
    census_groups = defaultdict(list)
    coords = defaultdict(list)
    for path, p in entries:
        c = p.get("coordinates")
        if valid_coordinates(c):
            coords[(round(c["latitude"], 7), round(c["longitude"], 7))].append(p)
            exact_name_coord[(text_key(p.get("name")), round(c["latitude"], 7), round(c["longitude"], 7))].append(p)
        if p.get("school_census_no"):
            census_groups[str(p["school_census_no"])].append(p)

    duplicate_groups = []
    duplicate_members = defaultdict(list)
    for group in exact_name_coord.values():
        if len(group) < 2:
            continue
        group = sorted(group, key=lambda p: p["id"])
        # A deterministic proposal only; score favors completeness, then stable ULID order.
        canonical_record = sorted(
            group,
            key=lambda p: (-sum(v not in (None, "", [], {}) for k, v in p.items() if k != "id"), p["id"]),
        )[0]
        fields = sorted(set().union(*(p.keys() for p in group)) - {"id"})
        differing_fields = [
            field for field in fields
            if len({canonical(p.get(field)) for p in group}) > 1
        ]
        exact_except_id = not differing_fields
        same_phone = len({re.sub(r"\D", "", str(p.get("phone", ""))) for p in group}) == 1
        same_address = len({text_key(p.get("address")) for p in group}) == 1
        same_categories = len({canonical(sorted(text_key(x) for x in p.get("categories", []))) for p in group}) == 1
        confidence = 98 if exact_except_id else (94 if same_phone and same_address and same_categories else 78)
        gid = "DUP-" + hashlib.sha256("|".join(p["id"] for p in group).encode()).hexdigest()[:12].upper()
        group_entry = {
            "group_id": gid,
            "candidate_type": "exact_normalized_name_and_coordinates",
            "review_priority_confidence": confidence,
            "confidence_meaning": "Confidence this is a duplicate-review candidate, not that the place is fake.",
            "candidate_record_ids": [p["id"] for p in group],
            "proposed_canonical_record_id": canonical_record["id"],
            "canonical_selection_reason": "Most populated fields; stable ULID tie-break. Proposal only; no record is retired.",
            "source_lineage": [
                {"id": p["id"], **mapping.get(p["id"], {})} for p in group
            ],
            "identical_except_id": exact_except_id,
            "conflicting_fields": differing_fields,
            "field_value_comparison_by_record": [
                {"id": p["id"], **mapping.get(p["id"], {}),
                 "fields": {field: p.get(field) for field in fields}}
                for p in group
            ],
            "evidence": {
                "normalized_name_match": True,
                "coordinates_match_rounded_7dp": True,
                "same_phone": same_phone,
                "same_address": same_address,
                "same_categories": same_categories,
                "external_confirmation": "not individually checked; lookup links are in per-record entries",
            },
            "proposed_action": "Human review. If confirmed, consolidate unique metadata and preserve every retired ULID as an alias/reference.",
        }
        duplicate_groups.append(group_entry)
        for p in group:
            duplicate_members[p["id"]].append(gid)

    rows, summary_flags = [], Counter()
    for path, p in entries:
        flags, score_parts = [], []
        c = p.get("coordinates")
        if c is None:
            flags.append({"code": "missing_coordinates", "severity": "high", "confidence": 100,
                          "explanation": "Coordinates are absent; keep the record and request a reliable location source."})
            score_parts.append(45)
        elif not valid_coordinates(c):
            flags.append({"code": "invalid_coordinates", "severity": "high", "confidence": 100,
                          "explanation": "Coordinates fail numeric/range validation; do not infer replacement coordinates."})
            score_parts.append(50)
        if p.get("id") not in mapping:
            flags.append({"code": "missing_migration_lineage", "severity": "medium", "confidence": 100,
                          "explanation": "No source file/index mapping was found for this ULID."})
            score_parts.append(20)
        if not p.get("address"):
            flags.append({"code": "missing_address", "severity": "medium", "confidence": 100,
                          "explanation": "Address is absent; no address should be inferred from coordinates."})
            score_parts.append(12)
        if not p.get("categories"):
            flags.append({"code": "missing_category", "severity": "low", "confidence": 100,
                          "explanation": "Category is absent; preserve the record and request contributor review."})
            score_parts.append(8)
        if not p.get("phone") and not p.get("website"):
            flags.append({"code": "no_contact_field", "severity": "low", "confidence": 100,
                          "explanation": "No phone or website is stored. This is a completeness flag, not evidence that the place is fake."})
            score_parts.append(0)
        if p.get("id") in duplicate_members:
            flags.append({"code": "duplicate_candidate", "severity": "high", "confidence": 98,
                          "explanation": "Same normalized name and point as another record; review unique source metadata before any consolidation.",
                          "groups": duplicate_members[p["id"]]})
            score_parts.append(30)
        name_candidate = case_candidate(p.get("name"))
        address_candidate = case_candidate(p.get("address")) if p.get("address") else None
        if name_candidate:
            flags.append({"code": "name_format_review", "severity": "low", "confidence": 55,
                          "explanation": "Mechanical case/spacing candidate only; brand spelling and transliteration need source confirmation."})
            score_parts.append(4)
        postcode_matches = re.findall(r"(?<!\d)\d{5}(?!\d)", str(p.get("address", "")))
        wrong_kattankudy_postcode = "Kattankud" in str(p.get("address", "")) and any(x != "30100" for x in postcode_matches)
        if wrong_kattankudy_postcode:
            flags.append({"code": "postcode_locality_review", "severity": "medium", "confidence": 75,
                          "explanation": "Address mentions Kattankudy but contains a postcode other than Kattankudi 30100; it may refer to a nearby postal locality. Verify before correction.",
                          "source_url": OFFICIAL_POST})
            score_parts.append(15)
        census = str(p.get("school_census_no", ""))
        school_evidence = "not_applicable"
        independent_evidence = []
        external_links = source_links(p)
        if census:
            if census in MOE_CENSUS_IDS:
                school_evidence = "census_number_matches_2024_official_eastern_province_list"
                external_links["official_school_source"] = OFFICIAL_MOE
                independent_evidence.append({"source": "Sri Lanka Ministry of Education / Data Management Branch", "url": OFFICIAL_MOE,
                                             "matched_field": "school census number", "matched_value": census,
                                             "limits": "Confirms the government-school identity/name entry, not the current entrance coordinates or operational status."})
            else:
                school_evidence = "census_number_present_but_not_matched_in_the_checked_2024_provincial_rows"
                external_links["official_school_source"] = OFFICIAL_MOE
                external_links["zone_census_lookup"] = OFFICIAL_ZONE_CENSUS
                flags.append({"code": "school_registry_followup", "severity": "low", "confidence": 45,
                              "explanation": "A school census number exists, but it was not confirmed in the checked provincial-list rows; it may be national/current/legacy. Verify before editing; not evidence of nonexistence."})
                score_parts.append(5)
        if text_key(p.get("name")) == text_key("ADDAX Clothing (Pvt) Ltd."):
            independent_evidence.append({"source": "Industrial Development Board of Sri Lanka BizConnect", "url": IDB_ADDAX,
                                         "matched_field": "registered listing name and contact phone", "matched_value": p.get("name"),
                                         "limits": "Listing address is No. 10, Mosque Avenue; source record says Falah, 04 Mosque Avenue. Does not independently confirm map pin coordinates."})
            external_links["official_idb_business_listing"] = IDB_ADDAX
        # Score is a triage priority score derived only from detected data-quality signals.
        review_score = min(100, sum(score_parts))
        for flag in flags:
            summary_flags[flag["code"]] += 1
        proposed = {}
        if name_candidate:
            proposed["name"] = {"before": p.get("name"), "candidate_after": name_candidate,
                                "status": "human_review_only", "reason": "formatting candidate; no source-backed spelling change"}
        if address_candidate:
            proposed["address"] = {"before": p.get("address"), "candidate_after": address_candidate,
                                    "status": "human_review_only", "reason": "case/spacing only; no street or house details added"}
        category_candidates = []
        for category in p.get("categories", []):
            candidate = case_candidate(category)
            if candidate:
                category_candidates.append({"before": category, "candidate_after": candidate,
                                            "status": "human_review_only", "reason": "formatting only; category meaning is not remapped"})
        if category_candidates:
            proposed["categories"] = category_candidates
        if wrong_kattankudy_postcode:
            proposed["postcode"] = {"before": postcode_matches, "candidate_after": None,
                                    "status": "needs_locality_confirmation", "reason": "30100 is Kattankudi in Sri Lanka Post; this record may be in a neighboring locality, so do not replace without confirmation"}
        rows.append({
            "id": p.get("id"), "filename": str(path.relative_to(ROOT)), "record_sha256": record_sha(p),
            "source_lineage": mapping.get(p.get("id")), "name": p.get("name"), "coordinates": c,
            "address": p.get("address"), "categories": p.get("categories", []),
            "has_phone": bool(p.get("phone")), "has_website": bool(p.get("website")),
            "business_status": p.get("business_status"),
            "verification_metadata_present": any(k in p for k in ("last_verified", "verified_at", "verification_source")),
            "school_census_no": p.get("school_census_no"), "official_registry_match_status": school_evidence,
            "independent_public_evidence": independent_evidence,
            "review_priority_score": review_score,
            "score_explanation": "0-100 review priority derived from explicit data-quality flags only; not probability of being fake. No online presence alone adds no points.",
            "flags": flags,
            "proposed_corrections": proposed,
            "duplicate_group_ids": duplicate_members.get(p.get("id"), []),
            "independent_lookup_links": external_links,
        })

    unique_coords = sum(1 for g in coords.values() if len(g) > 1)
    identical_groups = sum(1 for g in duplicate_groups if g["identical_except_id"])
    summary = {
        "audit_date": "2026-10-27", "audit_scope": "all active individual place JSON records in the current checkout",
        "main_commit": subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip(), "records_audited": len(rows),
        "files_shards": {p.name: sum(1 for f, _ in entries if f.parent.name == p.name) for p in sorted(PLACES.iterdir()) if p.is_dir() and p.name.isdigit()},
        "records_with_missing_coordinates": sum(r.get("coordinates") is None for r in rows),
        "records_with_invalid_coordinates": sum("invalid_coordinates" in {x["code"] for x in r["flags"]} for r in rows),
        "records_without_address": sum(not r.get("address") for r in rows),
        "records_without_categories": sum(not r.get("categories") for r in rows),
        "records_without_phone": sum(not r["has_phone"] for r in rows),
        "records_without_website": sum(not r["has_website"] for r in rows),
        "records_without_verification_timestamp": sum(not r["verification_metadata_present"] for r in rows),
        "duplicate_candidate_groups": len(duplicate_groups),
        "duplicate_candidate_records": sum(len(g["candidate_record_ids"]) for g in duplicate_groups),
        "potential_duplicate_excess_records": sum(len(g["candidate_record_ids"]) - 1 for g in duplicate_groups),
        "exactly_identical_groups_except_ulid": identical_groups,
        "duplicate_groups_with_field_conflicts": len(duplicate_groups) - identical_groups,
        "repeated_coordinate_groups_including_distinct_names": unique_coords,
        "school_records_with_census_numbers": sum(bool(r.get("school_census_no")) for r in rows),
        "school_records_matching_checked_official_census_rows": sum(r["official_registry_match_status"] == "census_number_matches_2024_official_eastern_province_list" for r in rows),
        "records_with_independent_public_listing_match": sum(bool(r["independent_public_evidence"]) for r in rows),
        "flag_counts": dict(sorted(summary_flags.items())),
        "external_source_checks": {
            "official_moe_2024_eastern_province_list": {"url": OFFICIAL_MOE, "checked_ids": sorted(MOE_CENSUS_IDS), "scope": "positive census-number matches only; absence is not treated as a negative finding"},
            "sri_lanka_post_postcode_book": {"url": OFFICIAL_POST, "verified_fact": "Kattankudi postcode 30100"},
            "batticaloa_central_census_portal": {"url": OFFICIAL_ZONE_CENSUS, "verified_fact": "search indexed census 14294 Hairath Vidyalaya; other individual pages were not checked"},
            "openstreetmap": {"lookup_url_pattern": "https://www.openstreetmap.org/search?query=...", "status": "per-record lookup links generated; bulk OSM features could not be queried in this audit environment"},
            "business_directory_crosscheck": {"status": "IDB BizConnect confirms ADDAX CLOTHING (PVT) LTD listing and contact details for two same-content source records; other businesses were not individually checked", "url": IDB_ADDAX},
        },
        "important_limits": [
            "Score is review priority, not probability of falsity or real-world existence.",
            "Public online lookup links are leads, not evidence; most businesses were not individually checked.",
            "No record is labeled fake solely for missing a web listing, phone, website, address, or coordinates.",
            "This audit is read-only; the separate Phase 2 cleanup report documents any data edits.",
            "Duplicate groups are candidate groups only; identical content except ULID is strong evidence but still requires approval before merge.",
            "The pre-migration source snapshot is preserved in the archive/pre-ulid-migration Git reference; exact pre-migration records can be checked there.",
        ],
        "flag_counts_by_code": dict(sorted(summary_flags.items())),
    }
    return {"summary": summary, "duplicate_groups": sorted(duplicate_groups, key=lambda g: (-g["review_priority_confidence"], g["group_id"])), "records": sorted(rows, key=lambda r: r["id"])}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=OUT)
    parser.add_argument("--check", action="store_true", help="validate the generated report without writing it")
    args = parser.parse_args()
    report = audit()
    if report["summary"]["records_audited"] != len({r["id"] for r in report["records"]}):
        raise SystemExit("duplicate ULIDs in place audit")
    if args.check:
        print(json.dumps(report["summary"], indent=2))
        return
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    try:
        output_label = str(args.output.resolve().relative_to(ROOT))
    except ValueError:
        output_label = str(args.output.resolve())
    print(json.dumps({"output": output_label, **report["summary"]}, indent=2))


if __name__ == "__main__":
    main()
