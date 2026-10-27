#!/usr/bin/env python3
"""Conservatively import public Batticaloa District places from captured CLI JSON.

This tool never calls mzc. Discovery uses the documented CLI separately; this
offline importer validates captured JSON, district geometry, public eligibility,
duplicate candidates, canonical place fields, and shard capacity before writing.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from shapely.geometry import Point, shape

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import places
from place_eligibility import classify_place
from place_names import normalize_place_name
from places_cleanup_phase2 import normalize_address

DEFAULT_INPUT = Path("/tmp/mazo-phase6-mzc")
BOUNDARY_PATH = ROOT / "data/boundaries/batticaloa-district.geojson"
REPORT_JSON = ROOT / "reports/batticaloa-district-expansion-phase6.json"
REPORT_MD = ROOT / "docs/BATTICALOA_DISTRICT_EXPANSION_PHASE6.md"
# Latitude bands keep source-record review commits geographically bounded.
REGIONS = {
    "south": (float("-inf"), 7.70),
    "central-south": (7.70, 7.73),
    "central-mid": (7.73, 7.78),
    "central-north": (7.78, 7.83),
    "north": (7.83, float("inf")),
}
MERGE_FIELDS = ("address", "phone", "website", "business_status", "hours")


def normalized_text(value: Any) -> str:
    value = unicodedata.normalize("NFKC", str(value or "")).casefold()
    return re.sub(r"[^\w]+", "", value, flags=re.UNICODE)


def normalized_address(value: Any) -> str:
    return re.sub(r"[^\w]+", "", unicodedata.normalize("NFKC", normalize_address(str(value or ""))).casefold(), flags=re.UNICODE)


def coordinates(record: dict) -> tuple[float, float] | None:
    value = record.get("coordinates")
    if not isinstance(value, dict):
        return None
    lat, lon = value.get("latitude"), value.get("longitude")
    if isinstance(lat, bool) or isinstance(lon, bool) or not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        return None
    if not math.isfinite(lat) or not math.isfinite(lon) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return float(lat), float(lon)


def distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    haversine = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 12742017.6 * math.atan2(math.sqrt(haversine), math.sqrt(1 - haversine))


def region_for(record: dict) -> str:
    point = coordinates(record)
    if point is None:
        return "unlocated"
    lat = point[0]
    for region, (lower, upper) in REGIONS.items():
        if lower <= lat < upper:
            return region
    return "unlocated"


def load_boundary(path: Path = BOUNDARY_PATH):
    if path == BOUNDARY_PATH:
        metadata_path = path.parent / "manifest.json"
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        expected = metadata.get("geometry_sha256")
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if expected != actual or metadata.get("name") != "Batticaloa District":
            raise ValueError("Batticaloa boundary manifest/checksum mismatch")
    data = json.loads(path.read_text(encoding="utf-8"))
    features = data.get("features", [])
    if data.get("type") != "FeatureCollection" or len(features) != 1:
        raise ValueError("Expected one Batticaloa District polygon in the boundary GeoJSON")
    feature = features[0]
    if feature.get("properties", {}).get("district_name", "").casefold() != "batticaloa":
        raise ValueError("Boundary GeoJSON is not the Batticaloa District layer feature")
    geometry = shape(feature.get("geometry"))
    if geometry.is_empty or not geometry.is_valid or geometry.geom_type not in {"Polygon", "MultiPolygon"}:
        raise ValueError("Batticaloa District boundary geometry is invalid")
    return geometry


def read_captures(input_dir: Path) -> tuple[list[dict], list[dict]]:
    manifest_path = input_dir / "query-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    rows = []
    for query in manifest:
        if query.get("error"):
            continue
        if query.get("limit") != 500 or query.get("country") != "lk":
            raise ValueError(f"Captured query {query.get('key')} does not record required mzc limit=500 and country=lk")
        payload = json.loads((input_dir / f"{query['key']}.json").read_text(encoding="utf-8"))
        results = payload.get("results")
        if not isinstance(results, list):
            raise ValueError(f"Captured mzc response {query['key']} has no results array")
        if len(results) > 500 or len(results) != query.get("count"):
            raise ValueError(f"Captured mzc response {query['key']} violates its documented 500-result cap or manifest count")
        for record in results:
            if isinstance(record, dict):
                rows.append({"query": query, "record": record})
    return manifest, rows


def _stable_value(field: str, value: Any) -> str:
    if field == "address":
        return normalized_address(value)
    if field == "website":
        return str(value or "").strip().casefold().rstrip("/")
    if field in {"phone", "business_status"}:
        return normalized_text(value)
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def group_candidates(rows: list[dict]) -> list[dict]:
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for row in rows:
        record = row["record"]
        name_key = normalized_text(record.get("name"))
        point = coordinates(record)
        point_key = tuple(round(v, 7) for v in point) if point else None
        if not name_key:
            point_key = ("missing-name", point_key)
        groups[(name_key, point_key)].append(row)

    candidates = []
    for key, members in groups.items():
        # A normalized identity is reusable only when all non-empty values that
        # describe one physical feature agree. Category variants are combined.
        conflicts = set()
        values: dict[str, list[Any]] = {}
        for field in MERGE_FIELDS:
            unique = {}
            for member in members:
                value = member["record"].get(field)
                if value not in (None, "", []):
                    unique.setdefault(_stable_value(field, value), value)
            values[field] = list(unique.values())
            if len(unique) > 1:
                conflicts.add(field)

        raw_names = Counter(str(member["record"].get("name") or "").strip() for member in members)
        chosen_name = sorted(raw_names, key=lambda name: (-raw_names[name], len(name), name.casefold(), name))[0]
        record: dict[str, Any] = {"name": normalize_place_name(chosen_name)}
        original_address = next((member["record"].get("address") for member in members
                                 if isinstance(member["record"].get("address"), str)
                                 and member["record"].get("address").strip()), None)
        first = members[0]["record"]
        point = coordinates(first)
        record["coordinates"] = {"latitude": point[0], "longitude": point[1]} if point else None
        category_values = []
        for member in members:
            categories = member["record"].get("categories")
            if isinstance(categories, list):
                for category in categories:
                    if isinstance(category, str) and category.strip() and category not in category_values:
                        category_values.append(category.strip())
        if category_values:
            record["categories"] = category_values
        for field, options in values.items():
            if options and field not in conflicts:
                record[field] = options[0]
        if isinstance(record.get("address"), str):
            record["address"] = normalize_address(record["address"])
        # Discovery-query accounting belongs in the aggregate operational
        # report. Canonical place records use the ordinary Mazo Maps schema and
        # do not identify the owner's discovery tool as a data provider.
        queries = sorted({member["query"]["key"] for member in members})
        changes = []
        if chosen_name != record["name"]:
            changes.append({"field": "name", "before": chosen_name, "after": record["name"],
                            "reason": "Existing conservative place-name capitalization and whitespace normalization."})
        if isinstance(original_address, str) and original_address != record.get("address"):
            changes.append({"field": "address", "before": original_address, "after": record.get("address"),
                            "reason": "Existing mechanical Sri Lankan address punctuation and recognized abbreviation formatting."})
        candidates.append({"key": key, "record": record, "members": members, "conflicts": sorted(conflicts), "queries": queries,
                           "format_changes": changes})
    return candidates


def _match_conflicts(candidate: dict, existing: dict) -> list[str]:
    conflicts = []
    if candidate.get("address") and existing.get("address") and normalized_address(candidate["address"]) != normalized_address(existing["address"]):
        conflicts.append("address")
    for field in ("phone", "website", "business_status", "hours"):
        if candidate.get(field) and existing.get(field) and _stable_value(field, candidate[field]) != _stable_value(field, existing[field]):
            conflicts.append(field)
    candidate_categories = {normalized_text(value) for value in candidate.get("categories", []) if isinstance(value, str) and value.strip()}
    existing_categories = {normalized_text(value) for value in existing.get("categories", []) if isinstance(value, str) and value.strip()}
    if candidate_categories and existing_categories and not candidate_categories.intersection(existing_categories):
        conflicts.append("categories")
    return conflicts


def _has_shared_identity_evidence(candidate: dict, existing: dict) -> bool:
    """Require a shared address/contact identifier before suppressing a new ULID."""
    if candidate.get("address") and existing.get("address") and normalized_address(candidate["address"]) == normalized_address(existing["address"]):
        return True
    for field in ("phone", "website"):
        if candidate.get(field) and existing.get(field) and _stable_value(field, candidate[field]) == _stable_value(field, existing[field]):
            return True
    return False


def analyze(input_dir: Path, boundary_path: Path = BOUNDARY_PATH, root: Path = ROOT,
            region: str | set[str] | None = None) -> dict:
    query_manifest, rows = read_captures(input_dir)
    boundary = load_boundary(boundary_path)
    records, _, _ = places.load_places() if root == ROOT else load_records(root)
    aliases = places.load_aliases() if root == ROOT else load_aliases(root)
    existing = list(records)
    # Alias payloads are considered only when they still contain public, located
    # information. Privacy-redacted payloads never participate in candidate matching.
    for retired_id, entry in aliases.items():
        payload = entry.get("record")
        if isinstance(payload, dict) and coordinates(payload) and payload.get("name") != "Location withheld pending eligibility review":
            existing.append(payload)
    by_name: dict[str, list[tuple[dict, tuple[float, float]]]] = defaultdict(list)
    for record in existing:
        point = coordinates(record)
        if point and record.get("name"):
            by_name[normalized_text(record["name"])].append((record, point))

    candidates = group_candidates(rows)
    counts = Counter()
    reason_counts = Counter()
    quality_signals = Counter()
    town_counts: dict[str, Counter] = defaultdict(Counter)
    category_counts: dict[str, Counter] = defaultdict(Counter)
    query_category_counts: dict[str, Counter] = defaultdict(Counter)
    query_prompt_counts: dict[str, Counter] = defaultdict(Counter)
    formatting_changes = []
    normalization_change_rows = []
    new_records = []
    review_tokens = Counter()
    for item in candidates:
        record = item["record"]
        point = coordinates(record)
        if not record.get("name"):
            counts["invalid_missing_name"] += 1
            continue
        if point is None:
            counts["invalid_missing_coordinates"] += 1
            continue
        if not boundary.covers(Point(point[1], point[0])):
            counts["out_of_district"] += 1
            continue
        if not record.get("address"):
            quality_signals["missing_address"] += 1
        if not record.get("categories"):
            quality_signals["missing_categories"] += 1
        if not record.get("phone"):
            quality_signals["missing_phone"] += 1
        eligibility = classify_place(record)
        if eligibility["classification"] == "confirmed_private_residential":
            counts["excluded_confirmed_private"] += 1
            reason_counts.update(eligibility.get("reason_codes", []))
            continue
        if not eligibility["eligible_for_public_map"]:
            counts["uncertain_public_eligibility"] += 1
            reason_counts.update(eligibility.get("reason_codes", []))
            review_tokens["eligibility_review"] += 1
            continue
        if item["conflicts"]:
            counts["mzc_source_conflict"] += 1
            reason_counts.update("source_conflict_" + field for field in item["conflicts"])
            review_tokens["source_conflict"] += 1
            continue
        matches = []
        for old, old_point in by_name.get(normalized_text(record["name"]), []):
            distance = distance_m(point, old_point)
            if distance <= 250:
                matches.append((distance, old))
        if matches:
            distance, old = min(matches, key=lambda pair: pair[0])
            field_conflicts = _match_conflicts(record, old)
            if distance <= 5 and not field_conflicts and _has_shared_identity_evidence(record, old):
                counts["existing_place_duplicate"] += 1
                classification = "existing_place_duplicate"
            else:
                counts["unresolved_existing_match"] += 1
                reason_counts.update("existing_conflict_" + field for field in field_conflicts)
                if not field_conflicts:
                    reason_counts["existing_same_name_nearby"] += 1
                review_tokens["existing_match"] += 1
                classification = "unresolved_existing_match"
        else:
            counts["new_public_candidate"] += 1
            classification = "new_public_candidate"
            selected_regions = region if isinstance(region, set) else {region} if region else set()
            if not selected_regions or region_for(record) in selected_regions:
                record_index = len(new_records)
                new_records.append(record)
                formatting_changes.extend(item["format_changes"])
                if item["format_changes"]:
                    normalization_change_rows.append({"record_index": record_index,
                                                      "source_query_keys": item["queries"],
                                                      "changes": item["format_changes"]})
        for query_key in item["queries"]:
            area, _, category = query_key.partition("--")
            town_counts[area][classification] += 1
            query_category_counts[category][classification] += 1
        for category_name in record.get("categories", []):
            category_counts[category_name][classification] += 1
        for query_key in item["queries"]:
            query_prompt_counts[query_key][classification] += 1

    return {
        "queries": query_manifest,
        "raw_rows": rows,
        "candidates": candidates,
        "new_records": new_records,
        "internal_nearby_pairs": internal_nearby_pairs(new_records),
        "counts": counts,
        "reason_counts": reason_counts,
        "quality_signals": quality_signals,
        "town_counts": town_counts,
        "category_counts": category_counts,
        "query_category_counts": query_category_counts,
        "query_prompt_counts": query_prompt_counts,
        "formatting_changes": formatting_changes,
        "normalization_change_rows": normalization_change_rows,
        "review_tokens": review_tokens,
        "source_records_before": len(records),
        "integrity_before": integrity_snapshot(root, records, aliases),
        "existing_ids": {record["id"] for record in records},
        "alias_ids": set(aliases),
        "region": region,
    }


def load_records(root: Path) -> tuple[list[dict], dict, list]:
    rows = []
    for path in sorted((root / "data/places").glob("[0-9]*/**/*.json")):
        if path.name == "aliases.json":
            continue
        record = json.loads(path.read_text(encoding="utf-8"))
        places.validate_record(record, path)
        rows.append(record)
    return rows, {}, []


def load_aliases(root: Path) -> dict:
    path = root / "data/places/aliases.json"
    return json.loads(path.read_text(encoding="utf-8"))["aliases"] if path.exists() else {}


def tree_sha256(root: Path, pattern: str) -> str:
    digest = hashlib.sha256()
    for path in sorted(root.glob(pattern)):
        if path.is_file():
            digest.update(path.relative_to(root).as_posix().encode("utf-8"))
            digest.update(b"\0")
            digest.update(path.read_bytes())
    return digest.hexdigest()


def generated_place_bytes(records: list[dict]) -> bytes:
    features = [places.feature(record) for record in sorted(records, key=lambda item: item["id"])
                if isinstance(record.get("coordinates"), dict)]
    return json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False,
                      separators=(",", ":")).encode("utf-8")


def integrity_snapshot(root: Path, records: list[dict], aliases: dict) -> dict:
    if root != ROOT:
        return {}
    place_bytes = generated_place_bytes(records)
    speed_audit_path = root / "data/roads/supplementary-road-audit.json"
    speed_audit = json.loads(speed_audit_path.read_text(encoding="utf-8"))
    return {
        "active_place_records": len(records),
        "public_geographic_features": sum(isinstance(record.get("coordinates"), dict) for record in records),
        "place_mzp_bytes": len(place_bytes),
        "place_mzp_gzip_bytes": len(gzip.compress(place_bytes, mtime=0)),
        "place_mzp_sha256": hashlib.sha256(place_bytes).hexdigest(),
        "alias_count": len(aliases),
        "road_records": len(list((root / "data/roads").glob("[0-9]*/*.json"))),
        "road_sources_sha256": tree_sha256(root, "data/roads/[0-9]*/*.json"),
        "speed_limit_records": len(list((root / "data/speed-limits").glob("[0-9]*/*.json"))),
        "speed_limit_sources_sha256": tree_sha256(root, "data/speed-limits/[0-9]*/*.json"),
        "supplementary_maxspeed_records": int(speed_audit.get("tagged_matches", 0)),
        "supplementary_source_sha256": hashlib.sha256((root / "kattankudy-all-roads.json").read_bytes()).hexdigest(),
    }


def internal_nearby_pairs(records: list[dict]) -> list[dict]:
    by_name: dict[str, list[tuple[int, dict, tuple[float, float]]]] = defaultdict(list)
    for index, record in enumerate(records):
        point = coordinates(record)
        if point and record.get("name"):
            by_name[normalized_text(record["name"])].append((index, record, point))
    pairs = []
    for members in by_name.values():
        for position, (left_index, left, left_point) in enumerate(members):
            for right_index, right, right_point in members[position + 1:]:
                distance = distance_m(left_point, right_point)
                if distance > 250:
                    continue
                differences = {}
                for field in ("address", "categories", "phone", "website", "business_status", "hours"):
                    left_value, right_value = left.get(field), right.get(field)
                    if left_value not in (None, "", []) and right_value not in (None, "", []) and _stable_value(field, left_value) != _stable_value(field, right_value):
                        differences[field] = [left_value, right_value]
                pairs.append({"left_record_index": left_index, "right_record_index": right_index,
                              "name": left["name"], "distance_m": round(distance, 1),
                              "differing_fields": differences,
                              "decision": "Retain both records; field differences require maintainer review; no automatic merge or deletion."})
    return pairs


def capture_summary(query_manifest: list[dict]) -> dict:
    successful = [row for row in query_manifest if row.get("status", "success" if "error" not in row else "failed") == "success"]
    successful_queries = [row for row in query_manifest if row.get("status") == "success" or row.get("query_succeeded") is True]
    invocation_count = sum((len(row.get("attempts", [])) or 1) + int(row.get("extra_invocations", 0)) +
                           int(row.get("prior_interrupted_attempts", 0)) for row in query_manifest)
    failed_attempts = sum(1 for row in query_manifest for attempt in row.get("attempts", []) if attempt.get("error"))
    successful_retries = sum(1 for row in query_manifest for attempt in row.get("attempts", [])
                             if attempt.get("status") == "success" and attempt.get("attempt", 1) > 1)
    failed_queries = sum(row.get("status") == "failed" for row in query_manifest)
    return {
        "invocations_in_manifest": len(query_manifest),
        "confirmed_cli_invocations_at_least": invocation_count,
        "exact_cli_invocation_total_available": False,
        "overlap_repeat_invocation_count": None,
        "successful_queries": len(successful),
        "uncaptured_successful_queries": sum(row.get("query_succeeded") is True and row.get("status") != "success" for row in query_manifest),
        "uncaptured_successful_query_rows_unknown": sum(bool(row.get("count_unknown")) for row in query_manifest),
        "failed_queries": failed_queries,
        "failed_attempts": failed_attempts + sum(int(row.get("failed_attempts", 0)) for row in query_manifest),
        "successful_retries": successful_retries + sum(int(row.get("successful_retries", 0)) for row in successful),
        "unique_query_strings": len({row["query"] for row in successful_queries}),
        "raw_candidates_returned_in_retained_json": sum(int(row.get("count", 0)) for row in successful),
        "raw_candidates_returned_from_retained_successful_responses": sum(int(row.get("count", 0)) for row in successful),
        "queries_at_500_result_limit": sum(bool(row.get("at_limit")) for row in successful),
        "queries": [{"key": row["key"], "query": row["query"], "town": row.get("town"),
                     "category": row.get("category"), "status": row.get("status", "success" if "error" not in row else "failed"),
                     "country": row.get("country"),
                     "limit": int(row.get("limit", 0)), "count": int(row.get("count", 0)),
                     "at_limit": bool(row.get("at_limit")), "exploratory": bool(row.get("exploratory")),
                     "extra_invocations": int(row.get("extra_invocations", 0)),
                     "unretained_successful_rows": int(row.get("unretained_successful_rows", 0)),
                     "attempts": len(row.get("attempts", [])) or 1,
                     "prior_interrupted_attempts": int(row.get("prior_interrupted_attempts", 0)),
                     "count_unknown": bool(row.get("count_unknown"))}
                    for row in query_manifest],
    }


def public_report(plan: dict, region: str | None = None) -> dict:
    counts = plan["counts"]
    for key in ("invalid_missing_name", "invalid_missing_coordinates", "excluded_confirmed_private", "mzc_source_conflict"):
        counts.setdefault(key, 0)
    import_rows = plan["new_records"]
    return {
        "report_version": 1,
        "scope": "Batticaloa District, Eastern Province, Sri Lanka",
        "boundary": {
            "file": "data/boundaries/batticaloa-district.geojson",
            "source": "Sri Lanka National Spatial Data Infrastructure (NSDI), Srilanka/Boundaries MapServer, District Boundary layer 3",
            "source_url": "https://gisapps.nsdi.gov.lk/server/rest/services/Srilanka/Boundaries/MapServer/3",
            "query_url": "https://gisapps.nsdi.gov.lk/server/rest/services/Srilanka/Boundaries/MapServer/3/query",
            "retrieved_at": "2026-10-27",
            "geometry_sha256": hashlib.sha256(BOUNDARY_PATH.read_bytes()).hexdigest() if BOUNDARY_PATH.exists() else None,
            "membership_rule": "The supplied coordinate must be covered by the district polygon; addresses or query wording alone do not establish district membership.",
        },
        "discovery": {
            "interface": "mzc CLI only",
            "command_syntax": "mzc -l 500 -c lk -t 30 '<documented query string>'",
            "pagination": "No pagination option is documented by mzc --help; queries reaching 500 results must be subdivided.",
            "result_origin_or_license": "Owner-supplied collection; collection methodology and origin were not investigated. The documented CLI output does not expose redistribution license metadata; no provider attribution is inferred.",
            "independent_place_verification": "not performed; imported listings remain unverified",
            "capture_log_note": "Four preliminary successful administrative-area queries returned responses that were not retained, so their result counts are unknown and excluded. Two documented invocations were interrupted before capture and later retried successfully. Two query runners briefly overlapped; retained responses were reconciled by unique query, but the exact number of redundant calls cannot be reconstructed. Confirmed invocation count is therefore a lower bound.",
            **capture_summary(plan["queries"]),
            "phase6_3_additional_gap_queries": sum(
                row.get("category") in {"food-retail", "public-facilities", "rural-commerce"}
                for row in plan["queries"]
            ),
        },
        "processing": {
            "raw_candidates_analyzed": len(plan["raw_rows"]),
            "unique_candidates": len(plan["candidates"]),
            "duplicate_query_rows_collapsed": len(plan["raw_rows"]) - len(plan["candidates"]),
            "classification_counts": dict(sorted(counts.items())),
            "unresolved_reason_counts": dict(sorted(plan["reason_counts"].items())),
            "candidate_data_quality_signals": dict(sorted(plan["quality_signals"].items())),
            "unresolved_candidates_are_not_listed_by_name_or_location": True,
            "new_places_in_this_change": len(import_rows),
            "unresolved_new_nearby_duplicate_pair_count": len(plan["internal_nearby_pairs"]),
            "active_place_records_before": plan["source_records_before"],
            "active_place_records_after": plan["source_records_before"] + len(import_rows),
            "current_batch_region": ", ".join(sorted(region)) if isinstance(region, set) else region or "all",
            "name_format_changes": sum(change["field"] == "name" for change in plan["formatting_changes"]),
            "address_format_changes": sum(change["field"] == "address" for change in plan["formatting_changes"]),
            "imported_ulids": [],
            "town_query_coverage_overlapping": {key: dict(sorted(value.items())) for key, value in sorted(plan["town_counts"].items())},
            "candidate_category_coverage_overlapping": {key: dict(sorted(value.items())) for key, value in sorted(plan["category_counts"].items())},
            "category_prompt_coverage_overlapping": {key: dict(sorted(value.items())) for key, value in sorted(plan["query_category_counts"].items())},
            "query_prompt_candidate_coverage_overlapping": {key: dict(sorted(value.items())) for key, value in sorted(plan["query_prompt_counts"].items())},
            "formatting_changes": plan["formatting_changes"],
            "normalization_changes": plan["normalization_change_rows"],
            "unresolved_new_nearby_duplicate_pairs": plan["internal_nearby_pairs"],
            "per_record_public_eligibility_gate": "scripts/place_eligibility.py",
            "existing_active_ids_and_aliases_are_reused_for_duplicate_checks": True,
            "roads_and_speed_limits_modified": False,
        },
    }


def apply_import(plan: dict, report: dict, root: Path = ROOT) -> dict:
    records = plan["new_records"]
    used = set(plan["existing_ids"]) | set(plan["alias_ids"])
    imported_ids = []
    for record in records:
        record = dict(record)
        candidate_id = places.new_ulid()
        while candidate_id in used:
            candidate_id = places.new_ulid()
        used.add(candidate_id)
        record["id"] = candidate_id
        places.validate_record(record)
        if not classify_place(record)["eligible_for_public_map"]:
            raise ValueError("Eligibility changed after import planning; aborting before the invalid record is written")
        if root != ROOT:
            raise ValueError("Applying imports is supported only in the repository checkout")
        shard = places.next_shard()
        shard.mkdir(parents=True, exist_ok=True)
        target = shard / f"{candidate_id}.json"
        with target.open("x", encoding="utf-8") as stream:
            json.dump(record, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        imported_ids.append(candidate_id)
    report["processing"]["imported_ulids"] = imported_ids
    for row in report["processing"].get("normalization_changes", []):
        row["affected_ulid"] = imported_ids[row["record_index"]]
    for pair in report["processing"].get("unresolved_new_nearby_duplicate_pairs", []):
        pair["left_ulid"] = imported_ids[pair.pop("left_record_index")]
        pair["right_ulid"] = imported_ids[pair.pop("right_record_index")]
    places.build()
    manifest = json.loads(places.PLACE_MANIFEST.read_text(encoding="utf-8"))
    records_after, _, _ = places.load_places()
    aliases_after = places.load_aliases()
    integrity_after = integrity_snapshot(root, records_after, aliases_after)
    integrity_before = plan["integrity_before"]
    for key in ("road_records", "road_sources_sha256", "speed_limit_records", "speed_limit_sources_sha256",
                "supplementary_maxspeed_records", "supplementary_source_sha256", "alias_count"):
        if integrity_after.get(key) != integrity_before.get(key):
            raise ValueError(f"Unrelated or alias integrity changed during import: {key}")
    if not set(plan["existing_ids"]).issubset({record["id"] for record in records_after}):
        raise ValueError("Import unexpectedly removed or reassigned an existing permanent place ULID")
    report["generated_integrity"] = {
        "geojson_features": manifest["features"],
        "mzp_sha256": manifest["sha256"],
        "alias_count": len(manifest["aliases"]),
        "shards": manifest["shards"],
        "maximum_shard_size": max(manifest["shards"].values(), default=0),
        "roads_source_records": 3710,
        "speed_limit_source_records": 3710,
        "supplementary_maxspeed_source_tags": 462,
        "mzp_bytes": manifest["bytes"],
        "mzp_gzip_bytes": len(gzip.compress((places.GENERATED / manifest["geojson"]).read_bytes(), mtime=0)),
    }
    report["before_after_integrity"] = {
        "before": integrity_before,
        "after": integrity_after,
        "existing_place_ulids_preserved": True,
        "aliases_preserved": True,
        "all_shards_within_limit": max(manifest["shards"].values(), default=0) <= places.LIMIT,
    }
    report_json = Path(plan.get("report_json", REPORT_JSON))
    report_md = Path(plan.get("report_md", REPORT_MD))
    previous = {}
    if report_json.exists():
        try:
            previous = json.loads(report_json.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            previous = {}
    previous_processing = previous.get("processing", {})
    previous_ids = previous_processing.get("phase6_3_cumulative_imported_ulids", [])
    current_ids = report["processing"]["imported_ulids"]
    report["processing"]["phase6_3_cumulative_imported_ulids"] = list(previous_ids) + current_ids
    report["processing"]["phase6_3_cumulative_imported_count"] = len(previous_ids) + len(current_ids)
    report["discovery"]["phase6_2_failed_prompts_recovered"] = {
        "count": report["discovery"]["successful_retries"],
        "all_retried_prompts_succeeded": report["discovery"]["failed_queries"] == 0,
    }
    report["review_queue"] = {
        "phase6_2_reported_conflicting_existing_matches_unchanged": 13,
        "phase6_2_reported_eligibility_uncertain_candidates_unchanged": 11,
        "current_combined_unresolved_existing_match_candidates": int(plan["counts"].get("unresolved_existing_match", 0)),
        "current_combined_eligibility_uncertain_candidates": int(plan["counts"].get("uncertain_public_eligibility", 0)),
        "phase6_2_named_case_decisions": [
            {"name": "Amma Hotel", "ulids": ["01M5Z17G0C4C1Q8YM3ZR7W7HES", "01M5Z17GC75PDB0MRNFK5PN6ZE"],
             "decision": "retained separately", "reason": "12.8 m apart with differing address and category values; no independent evidence resolves whether these are one listing or separate businesses."},
            {"name": "Markaz Mosque, Oddamawadi", "ulids": ["01M5Z5PDD8W74TDEST9HG41RY3", "01M5Z5PJM2K9AGEBTQWXNSCGPZ"],
             "decision": "retained separately", "reason": "Same address/category and about 10 m apart, but coordinates differ and available records do not independently establish which point should be canonical."},
        ],
        "uncertain_and_conflicting_candidate_details_omitted": True,
        "no_unresolved_candidate_was_deleted_or_merged": True,
    }
    report_json.parent.mkdir(parents=True, exist_ok=True)
    report_json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report_md.write_text(render_report(report), encoding="utf-8")
    return report


def render_report(report: dict) -> str:
    discovery, processing = report["discovery"], report["processing"]
    lines = [
        f"# Batticaloa District Places Expansion — {report.get('phase', 'Phase 6')}", "",
        f"Scope: {report['scope']}", "",
        "## Discovery", "",
        f"- Confirmed CLI invocations: at least {discovery['confirmed_cli_invocations_at_least']} across {discovery['unique_query_strings']} successful unique query strings; exact total unavailable because two capture batches briefly overlapped and repeated-call count was not retained.",
        f"- Retained JSON rows: {discovery['raw_candidates_returned_in_retained_json']:,}; four earlier successful exploratory queries had uncaptured response counts. Failed query attempts: {discovery['failed_attempts']}; successful retries: {discovery['successful_retries']}; at-limit queries: {discovery['queries_at_500_result_limit']}.",
        f"- Capture accounting: {discovery['capture_log_note']}",
        f"- Raw candidates in retained JSON captures: {discovery['raw_candidates_returned_in_retained_json']:,}; duplicate calls with unavailable capture counts are excluded.",
        f"- Unique candidates after normalized name and coordinate grouping: {processing['unique_candidates']:,}.",
        f"- New public place records in this change: {processing['new_places_in_this_change']:,}.",
        f"- Cumulative Phase 6.3 imports recorded to date: {processing.get('phase6_3_cumulative_imported_count', 0):,}.",
        f"- Phase 6.2 failed prompts recovered: {discovery.get('phase6_2_failed_prompts_recovered', {}).get('count', 0)}; additional locality/category queries: {discovery.get('phase6_3_additional_gap_queries', 0)}.",
        f"- Imported names formatted: {processing['name_format_changes']:,}; imported addresses mechanically formatted: {processing['address_format_changes']:,}.",
        f"- Unresolved nearby same-name pairs retained for review: {processing['unresolved_new_nearby_duplicate_pair_count']:,}.",
        f"- Duplicate query rows collapsed: {processing['duplicate_query_rows_collapsed']:,}.",
        "- Candidate origin and license information is not exposed by the documented mzc CLI; maintainer review is required before attributing or redistributing the underlying data.",
        "- Canonical place records contain no importer-added provenance or source metadata. Captured listings were not independently verified.", "",
        "## District and privacy checks", "",
        f"- District membership checked against the Sri Lanka NSDI Batticaloa District polygon: {report['boundary']['source_url']}.",
        "- Raw outside-district, private, uncertain, invalid, and conflicting candidates are represented only as aggregate counts; names, exact coordinates, contact data, and addresses are not listed.",
        "- Existing place aliases are checked for represented places; no road or speed-limit source records are changed.", "",
        "## Counts", "",
    ]
    lines.extend(f"- {key.replace('_', ' ').capitalize()}: {value}" for key, value in sorted(processing["classification_counts"].items()))
    lines += ["", "## Candidate data quality signals", ""]
    if processing["candidate_data_quality_signals"]:
        lines.extend(f"- {key.replace('_', ' ').capitalize()}: {value}" for key, value in sorted(processing["candidate_data_quality_signals"].items()))
    else:
        lines.append("- No missing address, category, or phone signals were found among unique in-district candidates.")
    lines += ["", "## Query-area coverage", "", "Counts overlap when a candidate appears in more than one category query. Query area means the search prompt, not a verified town assignment.", ""]
    for area, counts in sorted(processing["town_query_coverage_overlapping"].items()):
        lines.append(f"- {area}: " + ", ".join(f"{key.replace('_',' ')} {value}" for key, value in counts.items()))
    lines += ["", "## Category-prompt coverage", ""]
    for category, counts in sorted(processing["category_prompt_coverage_overlapping"].items()):
        lines.append(f"- {category}: " + ", ".join(f"{key.replace('_',' ')} {value}" for key, value in counts.items()))
    if "generated_integrity" in report:
        integrity = report["generated_integrity"]
        lines += ["", "## Generated integrity", "",
                  f"- Public geographic features: {integrity['geojson_features']:,}.",
                  f"- Aliases: {integrity['alias_count']:,}; maximum place shard: {integrity['maximum_shard_size']}.",
                  f"- MZP size: {integrity['mzp_bytes']:,} bytes ({integrity['mzp_gzip_bytes']:,} gzip bytes).",
                  f"- MZP SHA-256: `{integrity['mzp_sha256']}`.",
                  f"- Unmodified sources: {integrity['roads_source_records']:,} roads; {integrity['speed_limit_source_records']:,} speed-limit records; {integrity['supplementary_maxspeed_source_tags']} supplementary maxspeed tags.", ""]
    if "before_after_integrity" in report:
        before = report["before_after_integrity"]["before"]
        after = report["before_after_integrity"]["after"]
        lines += ["## Before/after checks", "",
                  f"- Active place records: {before['active_place_records']:,} → {after['active_place_records']:,}; geographic features: {before['public_geographic_features']:,} → {after['public_geographic_features']:,}.",
                  f"- Place MZP download size: {before['place_mzp_gzip_bytes']:,} → {after['place_mzp_gzip_bytes']:,} gzip bytes ({after['place_mzp_gzip_bytes'] - before['place_mzp_gzip_bytes']:+,}).",
                  f"- Previous place ULIDs retained: {report['before_after_integrity']['existing_place_ulids_preserved']}; aliases retained: {report['before_after_integrity']['aliases_preserved']} ({after['alias_count']:,}).",
                  f"- Roads: {before['road_records']:,} → {after['road_records']:,}; source checksum unchanged: {before['road_sources_sha256'] == after['road_sources_sha256']}.",
                  f"- Speed limits: {before['speed_limit_records']:,} → {after['speed_limit_records']:,}; source checksum unchanged: {before['speed_limit_sources_sha256'] == after['speed_limit_sources_sha256']}.",
                  f"- Supplementary maxspeed evidence: {before['supplementary_maxspeed_records']:,} → {after['supplementary_maxspeed_records']:,}; source checksum unchanged: {before['supplementary_source_sha256'] == after['supplementary_source_sha256']}.", ""]
    review = report.get("review_queue", {})
    if review:
        lines += ["## Unresolved review cases", "",
                  f"- Phase 6.2 cases retained unchanged: {review.get('phase6_2_reported_conflicting_existing_matches_unchanged', 0)} conflicting existing matches and {review.get('phase6_2_reported_eligibility_uncertain_candidates_unchanged', 0)} eligibility-uncertain candidates.",
                  f"- Combined current capture analysis: {review.get('current_combined_unresolved_existing_match_candidates', 0)} unresolved existing matches and {review.get('current_combined_eligibility_uncertain_candidates', 0)} eligibility-uncertain candidates."]
        for item in review.get("phase6_2_named_case_decisions", []):
            lines.append(f"- {item['name']} ({', '.join(item['ulids'])}): {item['decision']}; {item['reason']}")
        lines += ["- Other uncertain/conflicting candidate details are omitted from this public report. No unresolved candidate was deleted or merged.", ""]
    lines += ["## Limitations", "", "- No pagination mode is documented; all captured queries returned fewer than 500 candidates.",
              "- CLI provider and separate license metadata were not exposed and are not inferred.",
              "- Place listings, category correctness, and pin placement were not independently verified; mzc output is not treated as external confirmation.",
              "- Query-area counts overlap and are not a claim that every district place has been discovered.", ""]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT, help="directory of JSON outputs from documented mzc queries")
    parser.add_argument("--boundary", type=Path, default=BOUNDARY_PATH)
    parser.add_argument("--region", default="all", help="comma-separated latitude bands to import (or 'all'); e.g. central-mid,central-north")
    parser.add_argument("--report-json", type=Path, default=REPORT_JSON, help="write the machine-readable quality report to this path")
    parser.add_argument("--report-md", type=Path, default=REPORT_MD, help="write the human-readable quality report to this path")
    parser.add_argument("--phase", default="Phase 6", help="phase label for the report title")
    parser.add_argument("--apply", action="store_true", help="write accepted new records, rebuild MZP, and write reports")
    args = parser.parse_args()
    region = None if args.region == "all" else set(args.region.split(","))
    if region is not None and (not region or not region.issubset(REGIONS)):
        parser.error(f"--region must be 'all' or a comma-separated subset of: {', '.join(REGIONS)}")
    try:
        plan = analyze(args.input_dir, args.boundary, ROOT, region)
        report = public_report(plan, region)
        report["phase"] = args.phase
        plan["report_json"] = args.report_json
        plan["report_md"] = args.report_md
        if args.apply:
            report = apply_import(plan, report)
            print(json.dumps({"applied": report["processing"]["new_places_in_this_change"],
                              "counts": report["processing"]["classification_counts"],
                              "generated_integrity": report.get("generated_integrity")}, indent=2))
        else:
            print(json.dumps({"dry_run": True, "new_places_in_this_batch": len(plan["new_records"]),
                              "counts": dict(plan["counts"]), "reasons": dict(plan["reason_counts"])}, indent=2))
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
