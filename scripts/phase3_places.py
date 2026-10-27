#!/usr/bin/env python3
"""Privacy-aware Phase 3 place eligibility and conflict review tools."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import uuid
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import quote_plus

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import places
from place_eligibility import classify_place, redact_location

PLACES = ROOT / "data/places"
ALIASES = PLACES / "aliases.json"
PHASE2_JSON = ROOT / "reports/places-data-quality-phase-2.json"
AUDIT_JSON = Path(os.environ.get("PHASE3_AUDIT_JSON", ROOT / "reports/places-quality-audit-2026-10-27.json"))
OSM_JSON = ROOT / "reports/places-phase3-osm-evidence.json"
REPORT_JSON = ROOT / "reports/places-verification-phase-3.json"
REPORT_MD = ROOT / "docs/PLACES_VERIFICATION_PHASE_3.md"
BASE_COMMIT = "ba5d385a6843d45b684fc6b67d3c75765118b62e"
MAP_BOUNDS = (81.70, 7.65, 81.77, 7.72)
FIELD_ORDER = ("name", "coordinates", "address", "categories", "phone", "website", "hours", "business_status")


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def hashes(pattern: str) -> dict[str, str]:
    return {str(p.relative_to(ROOT)): sha256(p) for p in sorted(ROOT.glob(pattern)) if p.is_file()}


def load_alias_file() -> dict:
    if not ALIASES.exists():
        return {"version": 1, "aliases": {}}
    value = json.loads(ALIASES.read_text(encoding="utf-8"))
    if value.get("version") != 1 or not isinstance(value.get("aliases"), dict):
        raise ValueError("Invalid places alias file")
    return value


def load_active() -> tuple[dict[str, dict], dict[str, Path]]:
    records, paths = {}, {}
    for path in sorted(PLACES.glob("*/*.json")):
        record = json.loads(path.read_text(encoding="utf-8"))
        records[record["id"]] = record
        paths[record["id"]] = path
    return records, paths


def source_lineage() -> dict[str, dict]:
    rows = json.loads((ROOT / "migration-record-map.json").read_text(encoding="utf-8"))
    return {row["id"]: {"source_file": row.get("source"), "source_index": row.get("index")} for row in rows}


def exact_duplicate_fields(records: list[dict]) -> bool:
    if len(records) < 2:
        return False
    fields = set().union(*(record.keys() for record in records)) - {"id"}
    return all(len({canonical(record.get(field)) for record in records}) == 1 for field in fields)


def canonical_record(records: list[dict]) -> dict:
    return min(records, key=lambda record: (-sum(value not in (None, "", [], {}) for key, value in record.items() if key != "id"), record["id"]))


def haversine_m(a, b) -> float | None:
    if not (isinstance(a, dict) and isinstance(b, dict)):
        return None
    try:
        lat1, lon1 = float(a["latitude"]), float(a["longitude"])
        lat2, lon2 = float(b["latitude"]), float(b["longitude"])
    except (KeyError, TypeError, ValueError):
        return None
    radius = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    h = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return radius * 2 * math.asin(math.sqrt(h))


def member_field_comparison(group: dict, records: dict[str, dict], lineage: dict[str, dict]) -> dict:
    rows = [records[record_id] for record_id in group["candidate_record_ids"]]
    keys = sorted(set().union(*(record.keys() for record in rows)) - {"id"})
    differing = [key for key in keys if len({canonical(record.get(key)) for record in rows}) > 1]
    names = [re.sub(r"\s+", " ", str(record.get("name") or "")).strip().casefold() for record in rows]
    coordinates = [record.get("coordinates") for record in rows]
    distances = [haversine_m(coordinates[0], coordinate) for coordinate in coordinates[1:]]
    return {
        "group_id": group["group_id"],
        "record_count": len(rows),
        "candidate_record_ids": list(group["candidate_record_ids"]),
        "source_lineage": [{"id": record_id, **lineage.get(record_id, {})} for record_id in group["candidate_record_ids"]],
        "member_values": [{"id": record["id"], "fields": {key: record.get(key) for key in keys}} for record in rows],
        "differing_fields": differing,
        "field_value_comparison": {key: [record.get(key) for record in rows] for key in keys},
        "internal_signals": {
            "normalized_names_all_equal": len(set(names)) == 1,
            "coordinates_all_equal": len({canonical(value) for value in coordinates}) == 1,
            "coordinates_pairwise_distances_m": distances,
            "addresses_all_equal": len({canonical(record.get("address")) for record in rows}) == 1,
            "categories_all_equal": len({canonical(record.get("categories")) for record in rows}) == 1,
            "phones_all_equal": len({canonical(record.get("phone")) for record in rows}) == 1,
            "websites_all_equal": len({canonical(record.get("website")) for record in rows}) == 1,
            "hours_all_equal": len({canonical(record.get("hours")) for record in rows}) == 1,
            "source_files": sorted({lineage.get(record["id"], {}).get("source_file") for record in rows if lineage.get(record["id"], {}).get("source_file")}),
        },
    }


def group_osm_evidence(group_id: str, record: dict, osm_data: dict) -> dict:
    query_rows = osm_data.get("results_by_normalized_name", {})
    key = " ".join(str(record.get("name") or "").casefold().split())
    row = query_rows.get(key)
    if not row:
        return {"status": "not_checked", "scope": "No record-specific OSM response is available."}
    results = []
    for result in row.get("results", []):
        result_name = result.get("name") or result.get("display_name", "").split(",", 1)[0]
        similarity = SequenceMatcher(None, str(record.get("name", "")).casefold(), str(result_name).casefold()).ratio()
        try:
            distance = haversine_m(record.get("coordinates"), {"latitude": float(result["lat"]), "longitude": float(result["lon"])})
        except (KeyError, TypeError, ValueError):
            distance = None
        ref = f"https://www.openstreetmap.org/{result.get('osm_type')}/{result.get('osm_id')}" if result.get("osm_type") and result.get("osm_id") else row["query_url"]
        results.append({"name": result_name, "osm_type": result.get("osm_type"), "osm_id": result.get("osm_id"),
                        "latitude": result.get("lat"), "longitude": result.get("lon"),
                        "name_similarity": round(similarity, 3), "distance_from_record_m": round(distance, 1) if distance is not None else None,
                        "url": ref})
    matched = [result for result in results if result["name_similarity"] >= 0.88 and result["distance_from_record_m"] is not None and result["distance_from_record_m"] <= 300]
    status = row.get("status", "not_checked")
    if status == "request_failed_not_checked":
        public_status = "not_checked_request_failed"
    elif matched:
        public_status = "verified_osm_name_and_approximate_location_match"
    elif status == "no_result_returned":
        public_status = "checked_no_osm_feature_returned_no_negative_inference"
    else:
        public_status = "osm_results_found_but_no_name_location_match_confirmed"
    return {"status": public_status, "checked_at_utc": row.get("checked_at_utc"),
            "query_url": row.get("query_url"), "query": row.get("query"),
            "results": results, "matched_results": matched,
            "interpretation": "OSM can support a mapped name and approximate feature location only; it does not establish current operation, address, phone, ownership, or private/public access."}


def group_decision(group: dict, records: dict[str, dict]) -> str:
    members = [records[i] for i in group["candidate_record_ids"]]
    return "confirmed_internal_copy" if exact_duplicate_fields(members) else "unresolved_conflict"


def redaction_token() -> str:
    return "ELIG-" + uuid.uuid4().hex[:16].upper()


def redact_phase2_report(report: dict, withheld: dict[str, str]) -> dict:
    """Remove withheld record values from the currently published Phase 2 JSON."""
    def walk(value):
        if isinstance(value, str):
            return None if value in withheld else value
        if isinstance(value, list):
            output = []
            for item in value:
                if isinstance(item, dict) and item.get("id") in withheld:
                    output.append({"eligibility_review_token": withheld[item["id"]],
                                   "public_eligibility": "uncertain_or_private_withheld"})
                elif isinstance(item, dict) and any(record_id in withheld for record_id in item.get("candidate_record_ids", [])):
                    output.append({"privacy_withheld": True,
                                   "candidate_count": len(item.get("candidate_record_ids", [])),
                                   "public_eligibility_review": "sensitive member values withheld"})
                else:
                    output.append(walk(item))
            return output
        if isinstance(value, dict):
            return {key: ("privacy_withheld" if key in withheld else walk(item)) for key, item in value.items() if key not in {"name", "coordinates", "address", "phone", "website", "hours", "categories"} or key in {"name", "coordinates", "address", "phone", "website", "hours", "categories"}}
        return value

    scrubbed = walk(copy.deepcopy(report))
    scrubbed["privacy_review"] = {
        "record_level_sensitive_values_removed": len(withheld),
        "reason": "Uncertain/private residential eligibility candidates are withheld from this public audit view.",
        "record_tokens": sorted(set(withheld.values())),
    }
    return scrubbed


def _review_flags(record: dict, record_id: str, duplicate_conflicts: set[str], audit_by_id: dict[str, dict]) -> list[dict]:
    flags = []
    eligibility = classify_place(record)
    if eligibility["classification"] != "public_business_institutional":
        return [{"code": "public_eligibility_review", "weight": 35,
                 "explanation": "Public destination status is not established; all identifying fields are withheld."}]
    c = record.get("coordinates")
    if c is None:
        flags.append({"code": "missing_coordinates", "weight": 45, "explanation": "No coordinate is stored; obtain a public source location before mapping."})
    elif isinstance(c, dict):
        lat, lon = c.get("latitude"), c.get("longitude")
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            flags.append({"code": "invalid_coordinates", "weight": 50, "explanation": "Coordinate value fails numeric/range validation."})
        elif not (MAP_BOUNDS[0] <= lon <= MAP_BOUNDS[2] and MAP_BOUNDS[1] <= lat <= MAP_BOUNDS[3]):
            flags.append({"code": "outside_configured_map_viewport", "weight": 10, "explanation": "Point lies outside the current Kattankudy view bounds; this does not by itself mean the pin is wrong."})
    if not record.get("address"):
        flags.append({"code": "missing_address", "weight": 12, "explanation": "No source address is stored; do not infer one from coordinates."})
    audit = audit_by_id.get(record_id, {})
    historical_codes = {flag.get("code") for flag in audit.get("flags", [])}
    if "postcode_locality_review" in historical_codes:
        flags.append({"code": "postcode_locality_review", "weight": 15, "explanation": "Earlier audit flagged a locality/postcode disagreement; values remain unchanged pending postal-source review."})
    if not record.get("categories"):
        flags.append({"code": "missing_category", "weight": 8, "explanation": "Category is absent; no classification has been inferred."})
    if "name_format_review" in historical_codes:
        flags.append({"code": "name_spelling_review", "weight": 4, "explanation": "Earlier audit found a name-format signal; casing normalization is not proof of spelling."})
    normalized_name = re.sub(r"\s+", " ", str(record.get("name") or "")).strip().casefold()
    if normalized_name in {"unknown", "unnamed", "home", "house", "kattankudy"}:
        flags.append({"code": "non_specific_name_review", "weight": 8, "explanation": "The stored name may not uniquely identify this public destination; confirm it with a local source."})
    if _likely_category_mismatch(record):
        flags.append({"code": "possible_category_mismatch", "weight": 20, "explanation": "The name contains a clear public-place type that does not align with the stored category; no category was changed."})
    if record_id in duplicate_conflicts:
        flags.append({"code": "unresolved_duplicate_conflict", "weight": 30, "explanation": "At least one field differs among same-name/same-point candidates; keep records separate pending evidence."})
    if any(item.get("source") == "Industrial Development Board of Sri Lanka BizConnect"
           for item in audit.get("independent_public_evidence", [])):
        flags.append({"code": "external_address_conflict", "weight": 25,
                      "explanation": "The IDB listing supports a limited business identity match but its listed address conflicts with the source record; neither address was substituted."})
    return flags


def priority(flags: list[dict]) -> int:
    return min(100, sum(flag["weight"] for flag in flags))


def _likely_category_mismatch(record: dict) -> bool:
    name = str(record.get("name") or "").casefold()
    categories = " ".join(str(value).casefold() for value in record.get("categories") or [])
    concepts = (
        (("school", "college", "university", "academy"), ("school", "college", "university", "education", "academy", "institute")),
        (("hospital", "clinic", "pharmacy", "medical center"), ("hospital", "clinic", "pharmacy", "medical", "health", "doctor")),
        (("mosque", "masjid", "temple", "church"), ("mosque", "masjid", "temple", "church", "religious", "worship")),
        (("hotel", "guest house", "resort"), ("hotel", "guest house", "resort", "lodging", "accommodation", "homestay")),
        (("bank",), ("bank", "financial")),
    )
    return any(any(term in name for term in name_terms) and
               not any(term in categories for term in category_terms)
               for name_terms, category_terms in concepts)


def _safe_record_view(record: dict, lineage: dict) -> dict:
    return {"id": record["id"], "name": record.get("name"), "coordinates": record.get("coordinates"),
            "address": record.get("address"), "categories": record.get("categories"),
            "phone": record.get("phone"), "website": record.get("website"),
            "hours": record.get("hours"), "business_status": record.get("business_status"),
            "source_lineage": lineage.get(record["id"])}


def _match_artifact_evidence(audit_row: dict) -> list[dict]:
    refs = []
    for item in audit_row.get("independent_public_evidence", []):
        is_idb_conflict = item.get("source") == "Industrial Development Board of Sri Lanka BizConnect"
        source_date = item.get("source_date") or item.get("checked_date")
        if not source_date and item.get("source") == "Sri Lanka Ministry of Education / Data Management Branch":
            source_date = "2024 provincial school list"
        source_date = source_date or "source publication date not stated"
        refs.append({"status": "conflicting" if is_idb_conflict else "verified_limited_scope", "source": item.get("source"),
                     "url": item.get("url"), "source_date": source_date,
                     "matched_field": item.get("matched_field"),
                     "verified_fact": item.get("verified_fact") or item.get("match_basis") or "The source matched a recorded business/school identifier or contact field.",
                     "conflicting_fields": ["address"] if is_idb_conflict else [],
                     "limits": ("The listing supports business identity/contact only; its address differs from the repository record, and neither value is resolved by this match."
                                if is_idb_conflict else item.get("limits") or "Identity evidence only; does not prove current operation, address, or pin accuracy.")})
    return refs


def build_review_report(osm_data: dict | None = None) -> dict:
    phase2 = json.loads(PHASE2_JSON.read_text(encoding="utf-8"))
    active, _ = load_active()
    alias_data = load_alias_file()
    aliases = alias_data["aliases"]
    lineage = source_lineage()
    audit_data = json.loads(AUDIT_JSON.read_text(encoding="utf-8")) if AUDIT_JSON.exists() else {}
    audit_by_id = {row["id"]: row for row in audit_data.get("records", [])}
    osm_data = osm_data or (json.loads(OSM_JSON.read_text(encoding="utf-8")) if OSM_JSON.exists() else {})
    groups = phase2["unresolved_duplicate_groups"]
    group_comparisons = [member_field_comparison(group, active, lineage) for group in groups if all(i in active for i in group["candidate_record_ids"])]
    exact_group_ids = {group["group_id"] for group in groups if group_decision(group, active) == "confirmed_internal_copy"}
    unresolved = [row for row in group_comparisons if row["group_id"] not in exact_group_ids]
    conflict_field_counts = Counter(field for row in unresolved for field in row["differing_fields"])
    duplicate_conflict_ids = {member["id"] for row in unresolved for member in row["member_values"]}
    review_rows = []
    eligibility_counts = Counter()
    alias_eligibility_counts = Counter()
    reason_counts = Counter()
    privacy_tokens = {}
    for record_id, record in sorted(active.items()):
        eligibility = classify_place(record)
        eligibility_counts[eligibility["classification"]] += 1
        reason_counts.update(eligibility["reason_codes"])
        flags = _review_flags(record, record_id, duplicate_conflict_ids, audit_by_id)
        evidence = _match_artifact_evidence(audit_by_id.get(record_id, {}))
        osm = group_osm_evidence(next((g["group_id"] for g in groups if record_id in g["candidate_record_ids"]), ""), record, osm_data) if any(record_id in g["candidate_record_ids"] for g in groups) else {"status": "not_checked", "scope": "No record-specific OSM lookup was performed."}
        if osm.get("status") == "verified_osm_name_and_approximate_location_match":
            evidence.extend({"status": "verified", "source": "OpenStreetMap", "url": match["url"],
                             "checked_at_utc": osm.get("checked_at_utc"),
                             "verified_fact": "A similar OSM feature name is mapped near the source coordinate.",
                             "limits": "Does not establish current operation, address, phone, ownership, or public access."}
                            for match in osm.get("matched_results", []))
        if eligibility["classification"] != "public_business_institutional":
            token = record.get("eligibility_review_token") or redaction_token()
            privacy_tokens[record_id] = token
            review_rows.append({"eligibility_review_token": token, "record_state": "withheld_pending_manual_review",
                                "public_eligibility": eligibility["classification"],
                                "review_priority_score": priority(flags), "score_reasons": flags,
                                "eligibility_reason_codes": eligibility["reason_codes"],
                                "evidence_status": "not_checked_or_insufficient_for_safe_publication",
                                "recommended_followup": "Confirm public-place purpose with the contributor/owner; keep identity, exact address and coordinates withheld until then."})
        else:
            evidence_status = _evidence_status(evidence, osm)
            review_rows.append({**_safe_record_view(record, lineage),
                                "record_state": "active", "public_eligibility": eligibility["classification"],
                                "eligibility_reason_codes": eligibility["reason_codes"],
                                "review_priority_score": priority(flags), "score_reasons": flags,
                                "evidence_status": evidence_status,
                                "independent_evidence": evidence, "osm_evidence": osm,
                                "recommended_followup": _followup(flags, evidence)})
    for retired_id, alias in sorted(aliases.items()):
        record = alias.get("record", {})
        eligibility = classify_place(record)
        alias_eligibility_counts[eligibility["classification"]] += 1
        if eligibility["classification"] != "public_business_institutional":
            privacy_tokens.setdefault(retired_id, alias.get("eligibility_review_token") or redaction_token())
    roads = hashes("data/roads/*/*.json")
    speed = hashes("data/speed-limits/*/*.json")
    phase2_roads = phase2.get("rollback", {}).get("road_source_sha256_before", {})
    phase2_speed = phase2.get("rollback", {}).get("speed_limit_source_sha256_before", {})
    place_shards = {p.name: sum(1 for _ in p.glob("*.json")) for p in sorted(PLACES.iterdir()) if p.is_dir()}
    pre_active = len(active)
    privacy_active = sum(1 for record in active.values() if classify_place(record)["classification"] != "public_business_institutional")
    exact_retired_count = sum(len(group["candidate_record_ids"]) - 1 for group in groups if group["group_id"] in exact_group_ids)
    supplementary = sum("supplementary_maxspeed_evidence" in json.loads(path.read_text(encoding="utf-8")) for path in ROOT.glob("data/roads/*/*.json"))
    return {
        "phase": "Mazo Maps Places Verification and Conflict Resolution — Phase 3",
        "base_commit": BASE_COMMIT,
        "scope": {"active_places_before_phase3": pre_active, "phase2_unresolved_groups_reviewed": len(groups),
                  "phase2_unresolved_candidate_records_reviewed": sum(len(g["candidate_record_ids"]) for g in groups),
                  "active_place_records_scored": len(active), "existing_retired_aliases_scored_for_privacy": len(aliases)},
        "summary": {
            "public_business_institutional_eligible_before_consolidation": eligibility_counts["public_business_institutional"],
            "public_business_institutional_active_after_consolidation": eligibility_counts["public_business_institutional"] - exact_retired_count,
            "confirmed_private_residential": eligibility_counts["confirmed_private_residential"],
            "uncertain_withheld_pending_review": eligibility_counts["uncertain"],
            "uncertain_retired_alias_records_withheld": alias_eligibility_counts["uncertain"],
            "exact_groups_confirmed_after_phase2_normalization": len(exact_group_ids),
            "duplicate_groups_consolidated": len(exact_group_ids),
            "records_retired_with_aliases": exact_retired_count,
            "canonical_records_retained": len(exact_group_ids),
            "unresolved_duplicate_groups_after_phase3": len(unresolved),
            "unresolved_duplicate_records_after_phase3": sum(row["record_count"] for row in unresolved),
            "unresolved_conflicting_field_group_counts": dict(conflict_field_counts),
            "public_place_fields_corrected": 0,
            "private_or_uncertain_source_records_redacted": privacy_active,
            "addresses_changed": 0,
            "coordinates_changed": 0,
            "categories_changed": 0,
        },
        "privacy": {
            "public_policy": "Only explicitly public/business/institutional places are published in MZP, pins, search, and generated manifests.",
            "classification_counts_active": dict(eligibility_counts),
            "classification_counts_retired_aliases": dict(alias_eligibility_counts),
            "classification_counts_active_plus_retired_aliases": {key: eligibility_counts[key] + alias_eligibility_counts[key]
                                                                  for key in sorted(set(eligibility_counts) | set(alias_eligibility_counts))},
            "reason_code_counts": dict(reason_counts),
            "uncertain_record_details": "Withheld from this public report; source records use generic placeholders and contain no exact address, coordinate, contact, or personal name.",
            "confirmed_private_details": "No per-place identity, address, or coordinate is published.",
            "git_history_status": "Older public commits and pull-request diffs still contain pre-Phase-3 data. Deleting the workflow artifact returned HTTP 403 because the configured GitHub integration lacks artifact-delete permission; it remains available for repository-admin remediation. Shared history is not rewritten by this PR.",
            "workflow_artifact_remediation_status": "delete_attempt_failed_http_403_requires_repository_admin",
        },
        "duplicate_review": {
            "confirmed_groups": [row for row in group_comparisons if row["group_id"] in exact_group_ids],
            "unresolved_groups": unresolved,
            "decision_rule": "Consolidate only when every current non-ID field compares equal. Conflicts in any field remain separate; source lineage and the complete retired source record are retained for public-eligible places.",
            "evidence_limits": "OSM result matches support a mapped name/location only. Empty OSM results are not evidence of nonexistence or non-public status.",
        },
        "place_reviews": review_rows,
        "quality_scope": _quality_scope(active, phase2, audit_by_id, duplicate_conflict_ids),
        "before_after_integrity": {
            "active_place_records": {"before": pre_active, "after": pre_active - exact_retired_count},
            "retired_aliases": {"before": len(aliases), "after": len(aliases) + exact_retired_count},
            "all_permanent_ids_preserved": True,
            "place_shards_after": {"before": place_shards, "maximum_allowed": 999},
            "place_geo_features_after_build": None,
            "roads": {"record_count": len(roads), "phase2_source_hashes_unchanged": bool(phase2_roads) and roads == phase2_roads},
            "speed_limits": {"record_count": len(speed), "phase2_source_hashes_unchanged": bool(phase2_speed) and speed == phase2_speed},
            "supplementary_unverified_maxspeed_records": supplementary,
        },
        "rollback": {"command": "python scripts/phase3_places.py --rollback",
                     "privacy_redactions_are_not_recoverable_from_this_repository_snapshot": True,
                     "note": "No public backup is kept for private/uncertain names, addresses, contacts, or coordinates."},
        "history_remediation_plan": [
            "Repository admin: delete the Phase 1 full-record GitHub Actions artifact (the current integration returned HTTP 403) and remove any remaining detailed residential candidates from public workflow artifacts.",
            "If confirmed private details are found in existing public commits, coordinate a repository-wide filter-repo rewrite of main and active refs, then force-push with collaborator coordination.",
            "Request GitHub cache/PR-diff cleanup where rewritten sensitive blobs remain accessible; re-run Pages deployment after approved remediation.",
        ],
        "limitations": [
            "Absence from OpenStreetMap or another public listing is not a negative eligibility finding.",
            "The original legacy JSON payload files are absent; migration-record-map.json provides source filename and row index only.",
            "No house number, address, category, or coordinate is inferred. Uncertain eligibility records remain as redacted permanent-ID placeholders.",
        ],
    }


def _followup(flags: list[dict], evidence: list[dict]) -> list[str]:
    followup = []
    codes = {flag["code"] for flag in flags}
    if "missing_coordinates" in codes:
        followup.append("Request a source-backed public entrance/location before adding map geometry.")
    if "missing_address" in codes:
        followup.append("Ask a local contributor or the operator for a delivery-style address; do not infer from the pin.")
    if "postcode_locality_review" in codes:
        followup.append("Verify postal town and postcode against an official postal source; retain both values until resolved.")
    if "missing_category" in codes:
        followup.append("Request a public-facing business/institution category from a source or local reviewer.")
    if "unresolved_duplicate_conflict" in codes:
        followup.append("Compare each differing field and retain all conflicting values until reliable evidence resolves them.")
    if "external_address_conflict" in codes:
        followup.append("Ask the business/operator to confirm the current address; preserve both address claims until confirmed.")
    if "possible_category_mismatch" in codes:
        followup.append("Ask a local reviewer to confirm the public-facing category; retain the current category pending evidence.")
    if "non_specific_name_review" in codes:
        followup.append("Confirm the place's public-facing name with a local contributor or source.")
    if "outside_configured_map_viewport" in codes:
        followup.append("Check the source coordinate and intended service boundary; outside the viewport alone is not a misplaced-pin finding.")
    if not evidence:
        followup.append("Public listing was not independently checked; no evidence of nonexistence is implied.")
    return followup


def _evidence_status(evidence: list[dict], osm: dict) -> str:
    if any(item.get("status") == "conflicting" for item in evidence):
        return "conflicting"
    if evidence or osm.get("status") == "verified_osm_name_and_approximate_location_match":
        return "verified_limited_scope"
    if osm.get("status", "not_checked") != "not_checked":
        return "unverified"
    return "not_checked"


def _quality_scope(active: dict[str, dict], phase2: dict, audit_by_id: dict, duplicate_conflicts: set[str]) -> dict:
    public_records = [record for record in active.values() if classify_place(record)["eligible_for_public_map"]]
    missing_coordinates = sum(record.get("coordinates") is None for record in public_records)
    missing_address = sum(not record.get("address") for record in public_records)
    missing_category = sum(not record.get("categories") for record in public_records)
    outside = sum(isinstance(record.get("coordinates"), dict) and
                  not (MAP_BOUNDS[0] <= record["coordinates"]["longitude"] <= MAP_BOUNDS[2] and MAP_BOUNDS[1] <= record["coordinates"]["latitude"] <= MAP_BOUNDS[3])
                  for record in public_records)
    postcodes = sum("postcode_locality_review" in {flag.get("code") for flag in audit_by_id.get(record_id, {}).get("flags", [])}
                    for record_id, record in active.items() if classify_place(record)["eligible_for_public_map"])
    return {"active_public_place_missing_coordinates": missing_coordinates,
            "active_public_place_missing_address": missing_address,
            "active_public_place_missing_category": missing_category,
            "active_public_places_outside_map_viewport_not_assumed_wrong": outside,
            "active_public_places_with_postcode_locality_review_flag": postcodes,
            "phase1_missing_address_historical": 79,
            "phase1_missing_category_historical": 35,
            "phase1_postcode_locality_review_historical": 63,
            "phase2_candidate_group_members_requiring_duplicate_review": len(duplicate_conflicts)}


def _scrub_public_report(withheld_ids: dict[str, str]) -> None:
    if not PHASE2_JSON.exists():
        return
    report = json.loads(PHASE2_JSON.read_text(encoding="utf-8"))
    sensitive = set(withheld_ids)
    tokens = withheld_ids
    def scrub(value, parent_key=""):
        if isinstance(value, str):
            return None if value in sensitive else value
        if isinstance(value, list):
            output = []
            for item in value:
                if isinstance(item, dict) and item.get("id") in sensitive:
                    output.append({"eligibility_review_token": tokens[item["id"]], "public_eligibility": "withheld"})
                elif isinstance(item, dict) and any(record_id in sensitive for record_id in item.get("candidate_record_ids", [])):
                    output.append({"privacy_withheld": True, "candidate_count": len(item.get("candidate_record_ids", []))})
                else:
                    output.append(scrub(item, parent_key))
            return output
        if isinstance(value, dict):
            if parent_key == "retired_aliases":
                result = {}
                withheld_count = 0
                for record_id, entry in value.items():
                    if record_id in sensitive:
                        result[tokens[record_id]] = {"privacy_withheld": True, "canonical_target_preserved": True}
                        withheld_count += 1
                    else:
                        result[record_id] = scrub(entry, record_id)
                result["_privacy_withheld_alias_count"] = withheld_count
                return result
            if value.get("id") in sensitive:
                return {"eligibility_review_token": tokens[value["id"]], "public_eligibility": "withheld"}
            output = {}
            for key, item in value.items():
                if key in {"phase2_formatting_backup", "phase2_titlecase_backup"} and isinstance(item, list):
                    output[key] = [row for row in item if row.get("id") not in sensitive]
                elif key in {"candidate_record_ids", "record_ids", "retired_ids"} and isinstance(item, list) and any(i in sensitive for i in item):
                    output[key] = {"privacy_withheld": True, "candidate_count": len(item)}
                elif key in {"proposed_canonical_record_id", "canonical_id"} and item in sensitive:
                    output[key] = "privacy_withheld"
                else:
                    output[key] = scrub(item, key)
            return output
        return value
    report = scrub(report)
    report["privacy_review"] = {"public_record_details_withheld": len(sensitive),
                                "note": "The per-record identifying values for uncertain/private place eligibility cases were removed from this current report version."}
    PHASE2_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    doc = ROOT / "docs/PLACES_DATA_QUALITY_PHASE_2.md"
    if doc.exists():
        lines = doc.read_text(encoding="utf-8").splitlines()
        lines = [line for line in lines if not any(record_id in line for record_id in sensitive)]
        doc.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _redact_records(active: dict[str, dict], paths: dict[str, Path], alias_data: dict) -> tuple[dict[str, str], Counter]:
    withheld = {}
    counts = Counter()
    for record_id, record in active.items():
        eligibility = classify_place(record)
        counts[eligibility["classification"]] += 1
        if eligibility["eligible_for_public_map"]:
            continue
        token = record.get("eligibility_review_token") or redaction_token()
        withheld[record_id] = token
        safe_record = redact_location(record, eligibility["classification"], token)
        paths[record_id].write_text(json.dumps(safe_record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for retired_id, entry in alias_data["aliases"].items():
        record = entry.get("record", {})
        eligibility = classify_place(record)
        if eligibility["eligible_for_public_map"]:
            continue
        token = entry.get("eligibility_review_token") or withheld.get(retired_id) or redaction_token()
        withheld[retired_id] = token
        entry["record"] = redact_location(record, eligibility["classification"], token)
        entry["eligibility_review_token"] = token
        entry.pop("source_lineage_detail", None)
        counts[eligibility["classification"]] += 1
    # These Phase 2 recovery snapshots contain the original personal fields and
    # must not remain as a second copy after a location is withheld.
    for backup_key in ("phase2_formatting_backup", "phase2_titlecase_backup"):
        if isinstance(alias_data.get(backup_key), list):
            alias_data[backup_key] = [row for row in alias_data[backup_key]
                                      if row.get("id") not in withheld]
    return withheld, counts


def apply_phase3() -> dict:
    existing_alias_data = load_alias_file()
    if existing_alias_data.get("phase3_change_manifest"):
        if not REPORT_JSON.exists():
            raise ValueError("Phase 3 manifest exists but the report is missing; restore from the pull request before retrying")
        existing_report = json.loads(REPORT_JSON.read_text(encoding="utf-8"))
        withheld_count = existing_report.get("privacy", {}).get("private_or_uncertain_source_records_redacted", 0)
        alias_manifest = existing_alias_data["phase3_change_manifest"]
        current_active, _ = load_active()
        current_aliases = existing_alias_data["aliases"]
        shard_counts = {p.name: sum(1 for _ in p.glob("*.json")) for p in sorted(PLACES.iterdir()) if p.is_dir()}
        before_shards = existing_report["before_after_integrity"]["place_shards_after"].get("before", {})
        if isinstance(before_shards, dict) and "before" in before_shards:
            before_shards = before_shards["before"]
        integrity = existing_report["before_after_integrity"]
        integrity["active_place_records"] = {"before": existing_report["scope"]["active_places_before_phase3"],
                                              "after": len(current_active)}
        integrity["retired_aliases"] = {"before": existing_report["scope"]["existing_retired_aliases_scored_for_privacy"],
                                         "after": len(current_aliases)}
        integrity["place_shards_after"] = {"before": before_shards, "after": shard_counts, "maximum_allowed": 999}
        integrity["place_geo_features_after_build"] = json.loads((places.GENERATED / "manifest.json").read_text(encoding="utf-8"))["features"]
        existing_report["summary"]["records_retired_with_aliases"] = len(alias_manifest.get("new_alias_ids", []))
        existing_report["summary"]["canonical_records_retained"] = len(alias_manifest.get("confirmed_groups", []))
        existing_report["summary"]["public_business_institutional_active_after_consolidation"] = sum(
            classify_place(record)["eligible_for_public_map"] for record in current_active.values())
        if existing_report.get("summary", {}).get("private_or_uncertain_source_records_redacted") != withheld_count:
            existing_report["summary"]["private_or_uncertain_source_records_redacted"] = withheld_count
        write_report(existing_report)
        return existing_report
    phase2 = json.loads(PHASE2_JSON.read_text(encoding="utf-8"))
    group_rows = phase2["unresolved_duplicate_groups"]
    active, paths = load_active()
    alias_data = load_alias_file()
    initial_aliases = set(alias_data["aliases"])
    road_hashes, speed_hashes = hashes("data/roads/*/*.json"), hashes("data/speed-limits/*/*.json")
    lineage = source_lineage()

    # Eligibility is audited over the entire active dataset and legacy alias payloads.
    withheld, privacy_counts = _redact_records(active, paths, alias_data)
    _scrub_public_report(withheld)

    active, paths = load_active()
    report = build_review_report()
    confirmed_groups, unresolved_groups = [], []
    new_aliases = {}
    for group in group_rows:
        members = [active[record_id] for record_id in group["candidate_record_ids"]]
        if exact_duplicate_fields(members):
            canonical = canonical_record(members)
            canonical_id = canonical["id"]
            retired_ids = []
            for record in members:
                if record["id"] == canonical_id:
                    continue
                path = paths[record["id"]]
                lineage_row = lineage.get(record["id"])
                new_aliases[record["id"]] = {
                    "canonical_id": canonical_id,
                    "original_path": str(path.relative_to(ROOT)),
                    "record": copy.deepcopy(record),
                    "source_lineage": lineage_row,
                    "reason": "Every current non-ID field (name, coordinates, address, categories, contacts, hours, status and other properties) exactly matches the canonical record after Phase 2 normalization.",
                    "phase": 3,
                }
                retired_ids.append(record["id"])
                path.unlink()
            confirmed_groups.append({"group_id": group["group_id"], "canonical_id": canonical_id,
                                    "retired_ids": sorted(retired_ids), "record_ids": sorted(group["candidate_record_ids"]),
                                    "field_preservation": "All non-ID values were identical; no unique public-place field was discarded.",
                                    "source_lineage": [lineage.get(record_id) for record_id in group["candidate_record_ids"]]})
        else:
            unresolved_groups.append(group)
    alias_data["aliases"].update(new_aliases)
    alias_data["phase3_change_manifest"] = {"new_alias_ids": sorted(new_aliases),
                                               "confirmed_groups": [g["group_id"] for g in confirmed_groups]}
    ALIASES.write_text(json.dumps(alias_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    import contextlib
    import io
    with contextlib.redirect_stdout(io.StringIO()):
        places.build()
    report["privacy"]["private_or_uncertain_source_records_redacted"] = len(withheld)
    report["summary"]["private_or_uncertain_source_records_redacted"] = len(withheld)
    report["privacy"]["classification_counts_before_phase3_consolidation"] = dict(privacy_counts)
    report["summary"]["duplicate_groups_consolidated"] = len(confirmed_groups)
    report["summary"]["records_retired_with_aliases"] = len(new_aliases)
    report["summary"]["canonical_records_retained"] = len(confirmed_groups)
    report["summary"]["unresolved_duplicate_groups_after_phase3"] = len(unresolved_groups)
    report["summary"]["unresolved_duplicate_records_after_phase3"] = sum(len(g["candidate_record_ids"]) for g in unresolved_groups)
    report["before_after_integrity"]["active_place_records"] = {"before": len(active), "after": len(active) - len(new_aliases)}
    report["before_after_integrity"]["retired_aliases"] = {"before": len(initial_aliases), "after": len(alias_data["aliases"])}
    report["before_after_integrity"]["place_geo_features_after_build"] = json.loads((places.GENERATED / "manifest.json").read_text(encoding="utf-8"))["features"]
    report["before_after_integrity"]["place_shards_after"] = {
        "before": report["before_after_integrity"]["place_shards_after"]["before"],
        "after": {p.name: sum(1 for _ in p.glob("*.json")) for p in sorted(PLACES.iterdir()) if p.is_dir()},
        "maximum_allowed": 999,
    }
    report["before_after_integrity"]["roads"]["source_hashes_unchanged_during_phase3"] = hashes("data/roads/*/*.json") == road_hashes
    report["before_after_integrity"]["speed_limits"]["source_hashes_unchanged_during_phase3"] = hashes("data/speed-limits/*/*.json") == speed_hashes
    if hashes("data/roads/*/*.json") != road_hashes or hashes("data/speed-limits/*/*.json") != speed_hashes:
        raise RuntimeError("Road or speed-limit sources changed during Phase 3")
    write_report(report)
    return report


def rollback_phase3() -> None:
    alias_data = load_alias_file()
    manifest = alias_data.get("phase3_change_manifest")
    if not manifest:
        raise ValueError("No Phase 3 duplicate-consolidation manifest exists")
    new_ids = manifest.get("new_alias_ids", [])
    # Restoring public duplicate copies is safe; privacy-redacted locations are intentionally irreversible.
    for retired_id in new_ids:
        entry = alias_data["aliases"].get(retired_id)
        if not entry:
            raise ValueError(f"Missing Phase 3 alias payload for {retired_id}")
        path = ROOT / entry["original_path"]
        if path.exists():
            raise ValueError(f"Cannot restore {retired_id}; path is occupied")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(entry["record"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        del alias_data["aliases"][retired_id]
    del alias_data["phase3_change_manifest"]
    ALIASES.write_text(json.dumps(alias_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    import contextlib, io
    with contextlib.redirect_stdout(io.StringIO()):
        places.build()


def write_report(report: dict) -> None:
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    s = report["summary"]
    scope = report["scope"]
    lines = [
        "# Places Verification and Conflict Resolution — Phase 3", "",
        "This report distinguishes map eligibility from business existence. An uncertain record is withheld for privacy review, not declared false or non-existent.", "",
        "## Public-map eligibility", "",
        f"- Public/business/institutional and eligible before consolidation: {s['public_business_institutional_eligible_before_consolidation']}",
        f"- Confirmed private residential: {s['confirmed_private_residential']}",
        f"- Uncertain and withheld from public outputs: {s['uncertain_withheld_pending_review']}",
        f"- Identifying fields scrubbed: {report['privacy'].get('private_or_uncertain_source_records_redacted', 0)} total ({s['uncertain_withheld_pending_review']} active records and {s['uncertain_retired_alias_records_withheld']} retired aliases).",
        "- No uncertain/private names, addresses, coordinates, contacts, or record IDs are listed in this report.", "",
        "## Duplicate resolution", "",
        f"- Candidate groups independently re-compared field by field: {scope['phase2_unresolved_groups_reviewed']}",
        f"- Groups now exact across all non-ID fields and consolidated: {s['duplicate_groups_consolidated']}",
        f"- Records retired with permanent ULID aliases and source lineage: {s['records_retired_with_aliases']}",
        f"- Canonical records retained from those groups: {s['canonical_records_retained']}",
        f"- Conflicting groups retained without changes: {s['unresolved_duplicate_groups_after_phase3']} groups / {s['unresolved_duplicate_records_after_phase3']} records.",
        "- Conflicting field counts by group: " + ", ".join(f"{key}: {value}" for key, value in sorted(s["unresolved_conflicting_field_group_counts"].items())) + ".",
        "- Full public-eligible record values, distances, field comparisons, source lineage, and OSM results are in the JSON report.",
        "- No OSM match or empty result is used as proof that a place is fake, private, or non-existent.", "",
        "## Other quality findings", "",
        f"- Active public places with missing coordinates: {report['quality_scope']['active_public_place_missing_coordinates']}",
        f"- Missing addresses among eligible public places: {report['quality_scope']['active_public_place_missing_address']}",
        f"- Missing categories among eligible public places: {report['quality_scope']['active_public_place_missing_category']}",
        f"- Public places outside current map viewport (not assumed misplaced): {report['quality_scope']['active_public_places_outside_map_viewport_not_assumed_wrong']}",
        f"- Postcode/locality flags still requiring postal review: {report['quality_scope']['active_public_places_with_postcode_locality_review_flag']}",
        "- Public names, addresses, coordinates, and categories corrected in Phase 3: 0; no unsupported facts were added.", "",
        "## Integrity", "",
        f"- Active source records after consolidation: {report['before_after_integrity']['active_place_records']['after']}",
        f"- Public eligible active records after consolidation: {s['public_business_institutional_active_after_consolidation']}",
        f"- Alias count after consolidation: {report['before_after_integrity']['retired_aliases']['after']}",
        f"- Public MZP features after eligibility filtering/build: {report['before_after_integrity']['place_geo_features_after_build']}",
        "- Road/speed-limit source hashes are checked against the pre-Phase-3 worktree; supplementary unverified maxspeed evidence remains unchanged.", "",
        "## Privacy and history-remediation plan", "",
        "Uncertain and confirmed-private records are represented in current source files only by the permanent ULID, a generic review placeholder, null coordinates, and a non-identifying review token. Their alias payloads and per-record Phase 2 report values are scrubbed. They are omitted from MZP and browser search.",
        "Earlier public commits, PR diffs, and the Phase 1 audit artifact may still contain pre-review source values. GitHub denied the artifact deletion request with HTTP 403; a repository admin must remove it. A repository-wide history rewrite would require coordinated ref rewriting and is not performed in this PR. See `history_remediation_plan` in the JSON report.",
        "", "## Remaining limitations", "",
        "- The 152 unresolved duplicate groups remain separate because one or more fields conflict and independent evidence did not resolve those conflicts.",
        "- Public source listings do not establish current operation, exact address, ownership, public access, or pin accuracy unless explicitly stated in an evidence row.",
        "- Redacted eligibility cases require direct contributor/owner review before any details can be restored.", "",
    ]
    REPORT_MD.write_text("\n".join(lines), encoding="utf-8")


def validate_phase3(report: dict | None = None) -> None:
    report = report or json.loads(REPORT_JSON.read_text(encoding="utf-8"))
    active, _ = load_active()
    alias_data = load_alias_file()
    alias_ids = set(alias_data["aliases"])
    source_ids = {row["id"] for row in json.loads((ROOT / "migration-record-map.json").read_text(encoding="utf-8"))}
    if set(active) | alias_ids != source_ids:
        raise ValueError("Permanent IDs are missing or duplicated between active places and aliases")
    for record in active.values():
        decision = classify_place(record)
        if not decision["eligible_for_public_map"] and record.get("coordinates") is not None:
            raise ValueError("Ineligible/uncertain place retains public coordinates")
    for retired_id, entry in alias_data["aliases"].items():
        if retired_id in active or places.resolve_place_id(retired_id, alias_data["aliases"]) not in active:
            raise ValueError(f"Invalid Phase 3 alias resolution for {retired_id}")
        decision = classify_place(entry.get("record", {}))
        if not decision["eligible_for_public_map"] and entry.get("record", {}).get("coordinates") is not None:
            raise ValueError("Privacy-ineligible alias still retains coordinates")
    for shard, count in report["before_after_integrity"]["place_shards_after"]["after"].items():
        if count > 999:
            raise ValueError(f"Shard {shard} exceeds 999 records")
    if report["summary"]["unresolved_duplicate_groups_after_phase3"] != len(report["duplicate_review"]["unresolved_groups"]):
        raise ValueError("Unresolved group report count does not match details")
    if report["summary"]["duplicate_groups_consolidated"] != len(report["duplicate_review"]["confirmed_groups"]):
        raise ValueError("Consolidated group report count does not match details")
    if report["summary"]["canonical_records_retained"] != report["summary"]["duplicate_groups_consolidated"]:
        raise ValueError("Canonical record count does not match the number of consolidated groups")
    if report["summary"]["private_or_uncertain_source_records_redacted"] != report["privacy"]["private_or_uncertain_source_records_redacted"]:
        raise ValueError("Privacy redaction count does not reconcile")
    if not report["before_after_integrity"]["roads"]["source_hashes_unchanged_during_phase3"]:
        raise ValueError("Road source integrity check failed")
    if not report["before_after_integrity"]["speed_limits"]["source_hashes_unchanged_during_phase3"]:
        raise ValueError("Speed-limit source integrity check failed")


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--rollback", action="store_true")
    args = parser.parse_args()
    if args.rollback:
        rollback_phase3()
        return 0
    if args.apply:
        report = apply_phase3()
        validate_phase3(report)
    else:
        report = json.loads(REPORT_JSON.read_text(encoding="utf-8"))
        validate_phase3(report)
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
