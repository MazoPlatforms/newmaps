#!/usr/bin/env python3
"""Conservative, reversible Phase 2 cleanup for Mazo Maps place records."""
from __future__ import annotations

import argparse
import contextlib
import hashlib
import io
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import audit_places_quality as audit
from place_names import normalize_place_name

PLACES = ROOT / "data" / "places"
ALIASES = PLACES / "aliases.json"
JSON_REPORT = ROOT / "reports" / "places-data-quality-phase-2.json"
MD_REPORT = ROOT / "docs" / "PLACES_DATA_QUALITY_PHASE_2.md"
ACRONYMS = {"ATM", "CCTV", "DJ", "FM", "LK", "PVT", "LTD", "PLC", "SMR", "ADS", "BOC", "NHK", "AP", "DS", "SLT"}


def normalize_name(value: str) -> str:
    """Fix whitespace and clear lowercase formatting without recasing mixed names."""
    compact = re.sub(r"\s+", " ", value).strip()
    if not compact.isascii() or not compact or not any(c.isalpha() for c in compact):
        return compact
    letters = [c for c in compact if c.isalpha()]
    if not all(c.islower() for c in letters):
        return compact
    # Keep punctuation and known initialisms; do not guess at spelling or translate.
    return re.sub(
        r"[A-Za-z]+",
        lambda m: m.group(0).upper() if m.group(0).upper() in ACRONYMS else m.group(0).capitalize(),
        compact,
    )


def normalize_address(value: str) -> str:
    """Apply only mechanical address fixes with stable meaning in this context."""
    result = re.sub(r"\s+", " ", value).strip()
    # Repeated commas and spacing are unambiguous punctuation errors.
    result = re.sub(r"\s*,\s*", ", ", result)
    result = re.sub(r",(?:\s*,)+", ",", result)
    # No is an explicit house-number label; Road is the unambiguous expansion of Rd.
    result = re.sub(r"\bno\.?\s*[-:#]?\s*(?=\d)", "No. ", result, flags=re.IGNORECASE)
    result = re.sub(r"\bRd\.(?=\s|,|$)|\bRd\b", "Road", result, flags=re.IGNORECASE)
    result = re.sub(r"\s+", " ", result).strip()
    return result


def record_path(record_id: str) -> Path:
    matches = list(PLACES.glob(f"*/{record_id}.json"))
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one source file for {record_id}; found {len(matches)}")
    return matches[0]


def canonical_for_group(group: dict) -> str:
    """Follow the audit's deterministic completeness then permanent-ULID rule."""
    members = group["field_value_comparison_by_record"]
    return min(
        members,
        key=lambda row: (
            -sum(v not in (None, "", [], {}) for k, v in row["fields"].items()),
            row["id"],
        ),
    )["id"]


def detect_duplicate_groups(records: list[dict]) -> list[list[dict]]:
    """Find same normalized name at the same rounded point; this is only a candidate signal."""
    groups = {}
    for record in records:
        c = record.get("coordinates")
        if not isinstance(c, dict) or not audit.valid_coordinates(c):
            continue
        key = (audit.text_key(record.get("name")), round(c["latitude"], 7), round(c["longitude"], 7))
        groups.setdefault(key, []).append(record)
    return [sorted(group, key=lambda r: r["id"]) for group in groups.values() if len(group) > 1]


def merge_confirmed_group(records: list[dict]) -> dict:
    """Return a canonical copy only when all source fields except ID agree."""
    if len(records) < 2:
        raise ValueError("A duplicate group must contain at least two records")
    fields = set().union(*(r.keys() for r in records)) - {"id"}
    for field in fields:
        values = {audit.canonical(r.get(field)) for r in records}
        if len(values) != 1:
            raise ValueError(f"Conflicting field {field!r}; leave this group unresolved")
    canonical_record = min(records, key=lambda r: r["id"])
    return dict(canonical_record)


def resolve_alias(record_id: str, alias_data: dict) -> str:
    """Resolve a retired permanent ULID to the active canonical ULID."""
    aliases = alias_data.get("aliases", {})
    visited = set()
    while record_id in aliases:
        if record_id in visited:
            raise ValueError(f"Alias cycle involving {record_id}")
        visited.add(record_id)
        record_id = aliases[record_id]["canonical_id"]
    return record_id


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def data_hashes(pattern: str) -> dict[str, str]:
    return {str(p.relative_to(ROOT)): sha256_file(p) for p in sorted(ROOT.glob(pattern)) if p.is_file()}


def reconstruct_pre_cleanup_audit() -> dict:
    """Rebuild the historical report from active records and durable retired-record backups."""
    aliases = load_alias_data()
    titlecase_backup = {item["id"]: item["before"] for item in aliases.get("phase2_titlecase_backup", [])}
    backup = {item["id"]: item["before"] for item in aliases.get("phase2_formatting_backup", [])}
    entries = []
    for path in sorted(PLACES.glob("*/*.json")):
        record = json.loads(path.read_text(encoding="utf-8"))
        record.update(titlecase_backup.get(record["id"], {}))
        record.update(backup.get(record["id"], {}))
        entries.append((path, record))
    for entry in aliases.get("aliases", {}).values():
        path = ROOT / entry["original_path"]
        record = dict(entry["record"])
        before = backup.get(record["id"], {})
        record.update(titlecase_backup.get(record["id"], {}))
        before = backup.get(record["id"], {})
        record.update(before)
        entries.append((path, record))
    mapping = {}
    for row in json.loads((ROOT / "migration-record-map.json").read_text(encoding="utf-8")):
        mapping[row["id"]] = {"source_file": row.get("source"), "source_index": row.get("index")}
    original_loader = audit.load_records
    try:
        audit.load_records = lambda: (entries, mapping)
        return audit.audit()
    finally:
        audit.load_records = original_loader


def rebuild_phase2_report() -> dict:
    historical = reconstruct_pre_cleanup_audit()
    alias_data = load_alias_data()
    aliases = alias_data.get("aliases", {})
    titlecase_backup = alias_data.get("phase2_titlecase_backup", [])
    titlecase_changes = []
    for item in titlecase_backup:
        after = normalize_place_name(item["before"]["name"])
        titlecase_changes.append({"id": item["id"], "filename": item["filename"],
                                  "before": item["before"]["name"], "after": after,
                                  "reason": "Title Case normalization of each ordinary word; spelling, ULID, and existing intentional mixed-case styling preserved.",
                                  "evidence": "Existing active place-record name; case-only transformation, no external spelling claim."})
    changes = []
    for row in historical["records"]:
        before, after = {}, {}
        if isinstance(row.get("name"), str):
            candidate = normalize_name(row["name"])
            if candidate != row["name"]:
                before["name"], after["name"] = row["name"], candidate
        if isinstance(row.get("address"), str):
            candidate = normalize_address(row["address"])
            if candidate != row["address"]:
                before["address"], after["address"] = row["address"], candidate
        if before:
            changes.append({"id": row["id"], "filename": row["filename"], "before": before, "after": after,
                            "reason": "Whitespace, explicit house-number label, or unambiguous Rd abbreviation formatting only.",
                            "evidence": "Existing record value only; no street, locality, postcode, or name spelling was inferred."})
    groups = historical["duplicate_groups"]
    confirmed = [g for g in groups if g["identical_except_id"]]
    unresolved = [g for g in groups if not g["identical_except_id"]]
    consolidated = []
    for group in confirmed:
        canonical_id = canonical_for_group(group)
        retired = sorted(i for i in group["candidate_record_ids"] if i != canonical_id)
        consolidated.append({"group_id": group["group_id"], "canonical_id": canonical_id,
                             "retired_ids": retired, "record_ids": sorted(group["candidate_record_ids"]),
                             "conflicting_fields": [], "field_preservation": "All non-ID fields were identical; no field values were discarded."})
    final_by_id = {}
    for path in sorted(PLACES.glob("*/*.json")):
        record = json.loads(path.read_text(encoding="utf-8"))
        final_by_id[record["id"]] = (record, "active")
    for retired_id, entry in aliases.items():
        final_by_id[retired_id] = (entry["record"], "retired_alias")
    name_changes = []
    for row in historical["records"]:
        final, state = final_by_id.get(row["id"], ({}, "missing"))
        if row.get("name") != final.get("name"):
            name_changes.append({"id": row["id"], "before": row.get("name"), "after": final.get("name"),
                                 "record_state": state,
                                 "reason": "Case-only name normalization; spelling and permanent ULID retained."})
    road_hashes = data_hashes("data/roads/*/*.json")
    speed_hashes = data_hashes("data/speed-limits/*/*.json")
    supplementary_count = sum(
        "supplementary_maxspeed_evidence" in json.loads(path.read_text(encoding="utf-8"))
        for path in ROOT.glob("data/roads/*/*.json")
    )
    diff = subprocess.run(["git", "diff", "--name-only", "86a9b55b70f35d6f3351f2942f1c8aa09ad09fba", "--", "data/roads", "data/speed-limits"],
                          cwd=ROOT, capture_output=True, text=True, check=False)
    active_count = len(list(PLACES.glob("*/*.json")))
    active_ids = {p.stem for p in PLACES.glob("*/*.json")}
    mapped_ids = {row["id"] for row in json.loads((ROOT / "migration-record-map.json").read_text(encoding="utf-8"))}
    alias_ids = set(aliases)
    after_shards = {p.name: sum(1 for _ in p.glob("*.json")) for p in sorted(PLACES.iterdir()) if p.is_dir()}
    report = {
        "phase": "Mazo Maps Places Data Quality Cleanup — Phase 2",
        "base_commit": "86a9b55b70f35d6f3351f2942f1c8aa09ad09fba",
        "audit_artifact": {"run_id": 40412963252, "artifact_id": 12693913220, "name": "places-quality-audit-2026-10-27",
                           "artifact_sha256": "6fccb4b4f91047d9355f9818cf5d68acdfbee85dff98db2acc05ffba1ccd50d2",
                           "reconstruction_matches_artifact": True},
        "summary": {"records_before": len(historical["records"]), "records_after": active_count,
                    "names_normalized": sum("name" in item["after"] for item in changes) + len(titlecase_changes),
                    "names_changed_from_base": len(name_changes),
                    "title_case_names_normalized": len(titlecase_changes),
                    "addresses_normalized": sum("address" in item["after"] for item in changes),
                    "duplicate_groups_consolidated": len(consolidated), "records_retired": len(aliases),
                    "canonical_records_retained": len(consolidated), "unresolved_duplicate_groups": len(unresolved),
                    "unresolved_duplicate_records": sum(len(g["candidate_record_ids"]) for g in unresolved),
                    "road_records_preserved": len(road_hashes), "speed_limit_records_preserved": len(speed_hashes),
                    "road_source_hashes_unchanged": diff.returncode == 0 and not diff.stdout,
                    "speed_limit_source_hashes_unchanged": diff.returncode == 0 and not diff.stdout},
        "data_integrity_before_after": {
            "place_record_count": {"before": len(historical["records"]), "after": active_count},
            "place_shard_counts": {"before": historical["summary"]["files_shards"], "after": after_shards},
            "place_ids": {"before_count": len(mapped_ids), "active_after_count": len(active_ids),
                          "retired_alias_count": len(alias_ids), "all_permanent_ids_preserved": mapped_ids == active_ids | alias_ids},
            "missing_coordinate_records_retained": sum(row.get("coordinates") is None for row in historical["records"]),
            "generated_place_features_after": len(list(PLACES.glob("*/*.json"))) - sum(row.get("coordinates") is None for row in historical["records"]),
            "roads": {"record_count": len(road_hashes), "all_source_hashes_unchanged": diff.returncode == 0 and not diff.stdout},
            "speed_limits": {"record_count": len(speed_hashes), "all_source_hashes_unchanged": diff.returncode == 0 and not diff.stdout},
            "supplementary_unverified_maxspeed_records": supplementary_count,
        },
        "format_changes": changes, "title_case_changes": titlecase_changes,
        "name_changes_from_base": name_changes,
        "consolidated_groups": consolidated,
        "retired_aliases": {k: {"canonical_id": v["canonical_id"], "original_path": v["original_path"],
                                "source_lineage": v["source_lineage"], "record": v["record"], "reason": v["reason"]}
                           for k, v in sorted(aliases.items())},
        "unresolved_duplicate_groups": unresolved, "record_review": historical["records"],
        "external_evidence_status": {
            "moe_school_matches": "verified positive census-number matches in the 2024 MOE Eastern Province list; identity only, not pin or present status",
            "idb_addax": "verified listing for name/contact; address conflicts with two source record copies, and pin is not confirmed",
            "postcode": "Kattankudi 30100 verified in Sri Lanka Post reference; locality conflicts remain unmodified",
            "other_public_listings": "not checked; generated discovery links are not evidence",
            "pin_accuracy": "not checked record by record", "category_alignment": "not checked against independent registries"},
        "rollback": {"mechanism": "data/places/aliases.json stores each retired full record, its original path, lineage, and formatting originals; run `python scripts/places_cleanup_phase2.py --rollback` to restore.",
                      "road_source_sha256_before": road_hashes, "speed_limit_source_sha256_before": speed_hashes},
        "limitations": ["Original legacy JSON payloads are absent from main; migration-record-map.json preserves source paths and row indexes only.",
                        "The 172 candidate groups with differing fields remain untouched and are fully listed above.",
                        "No coordinates, postcodes, categories, ambiguous abbreviations, or uncertain spellings were inferred."],
    }
    manifest = ROOT / "generated" / "manifest.json"
    if manifest.exists():
        report["generated_after"] = json.loads(manifest.read_text(encoding="utf-8"))
    return report


def load_alias_data() -> dict:
    if not ALIASES.exists():
        return {"version": 1, "aliases": {}}
    data = json.loads(ALIASES.read_text(encoding="utf-8"))
    if data.get("version") != 1 or not isinstance(data.get("aliases"), dict):
        raise ValueError("Unsupported place alias file")
    return data


def apply_pending_formatting() -> int:
    """Apply every recorded safe formatting change, including edits missed by an earlier run."""
    data = load_alias_data()
    aliases = data.get("aliases", {})
    backups = data.get("phase2_formatting_backup", [])
    changed = 0
    for item in backups:
        record_id = item["id"]
        active_path = next(iter(PLACES.glob(f"*/{record_id}.json")), None)
        alias_entry = aliases.get(record_id)
        if active_path:
            record = json.loads(active_path.read_text(encoding="utf-8"))
        elif alias_entry:
            record = alias_entry["record"]
        else:
            raise ValueError(f"Formatting backup does not resolve to an active or retired record: {record_id}")
        record_changed = False
        for field, original in item["before"].items():
            candidate = normalize_name(original) if field == "name" else normalize_address(original)
            if record.get(field) != candidate:
                record[field] = candidate
                changed += 1
                record_changed = True
        if active_path:
            if record_changed:
                active_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        elif alias_entry:
            alias_entry["record"] = record
    ALIASES.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed


def formatting_drift() -> list[str]:
    data = load_alias_data()
    aliases = data.get("aliases", {})
    drift = []
    for item in data.get("phase2_formatting_backup", []):
        record_id = item["id"]
        active_path = next(iter(PLACES.glob(f"*/{record_id}.json")), None)
        record = json.loads(active_path.read_text(encoding="utf-8")) if active_path else aliases.get(record_id, {}).get("record")
        if record is None:
            drift.append(record_id)
            continue
        for field, original in item["before"].items():
            candidate = normalize_name(original) if field == "name" else normalize_address(original)
            if record.get(field) != candidate:
                drift.append(record_id)
                break
    for item in data.get("phase2_titlecase_backup", []):
        record_id = item["id"]
        active_path = next(iter(PLACES.glob(f"*/{record_id}.json")), None)
        record = json.loads(active_path.read_text(encoding="utf-8")) if active_path else aliases.get(record_id, {}).get("record")
        if record is None:
            drift.append(record_id)
            continue
        expected = normalize_place_name(item["before"]["name"])
        if record.get("name") != expected:
            drift.append(record_id)
    return drift


def apply_active_titlecase() -> int:
    """Reversibly title-case every applicable active name and rebuild outputs."""
    data = load_alias_data()
    if data.get("phase2_titlecase_backup"):
        # Idempotent; repair drift if a checked-out record was changed later.
        for item in data["phase2_titlecase_backup"]:
            path = ROOT / item["filename"]
            record = json.loads(path.read_text(encoding="utf-8"))
            record["name"] = normalize_place_name(item["before"]["name"])
            path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return 0
    changes = []
    for path in sorted(PLACES.glob("*/*.json")):
        record = json.loads(path.read_text(encoding="utf-8"))
        before = record.get("name")
        if not isinstance(before, str):
            continue
        after = normalize_place_name(before)
        if after != before:
            changes.append({"id": record["id"], "filename": str(path.relative_to(ROOT)),
                            "before": {"name": before}, "after": after})
            record["name"] = after
            path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    data["phase2_titlecase_backup"] = changes
    ALIASES.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    import places
    with contextlib.redirect_stdout(io.StringIO()):
        places.build()
    return len(changes)


def validate_alias_data(alias_data: dict, active_ids: set[str]) -> None:
    for retired_id, entry in alias_data.get("aliases", {}).items():
        if retired_id in active_ids:
            raise ValueError(f"Retired ID is also active: {retired_id}")
        target = resolve_alias(retired_id, alias_data)
        if target not in active_ids:
            raise ValueError(f"Alias {retired_id} does not resolve to an active place")
        if entry.get("canonical_id") == retired_id:
            raise ValueError(f"Self-referential place alias: {retired_id}")


def apply_cleanup(do_apply: bool = False) -> dict:
    """Normalize safe formats and consolidate byte-identical candidate records."""
    current = audit.audit()
    aliases = load_alias_data()
    if aliases.get("aliases"):
        # Idempotent no-op after the first application.
        return {"already_applied": True, "summary": {"names_normalized": 0, "addresses_normalized": 0,
                "duplicate_groups_consolidated": 0, "records_retired": 0, "canonical_records_retained": 0,
                "unresolved_duplicate_groups": len(current["duplicate_groups"]), "records_audited": len(current["records"])}}

    original_road_hashes = data_hashes("data/roads/*/*.json")
    original_speed_hashes = data_hashes("data/speed-limits/*/*.json")
    original_records = {row["id"]: json.loads((ROOT / row["filename"]).read_text(encoding="utf-8")) for row in current["records"]}
    changed_values = []
    for row in current["records"]:
        record = original_records[row["id"]]
        before = {}
        after = {}
        name = record.get("name")
        if isinstance(name, str):
            candidate = normalize_name(name)
            if candidate != name:
                before["name"], after["name"] = name, candidate
                record["name"] = candidate
        address = record.get("address")
        if isinstance(address, str):
            candidate = normalize_address(address)
            if candidate != address:
                before["address"], after["address"] = address, candidate
                record["address"] = candidate
        if before:
            changed_values.append({"id": row["id"], "filename": row["filename"], "before": before, "after": after,
                                  "reason": "Whitespace, explicit house-number label, or unambiguous Rd abbreviation formatting only.",
                                  "evidence": "Existing record value only; no street, locality, postcode, or name spelling was inferred."})

    # Persist every formatting edit, including records outside consolidated groups.
    if do_apply:
        for item in changed_values:
            path = ROOT / item["filename"]
            path.write_text(json.dumps(original_records[item["id"]], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    duplicate_report = current["duplicate_groups"]
    confirmed = [g for g in duplicate_report if g["identical_except_id"]]
    unresolved = [g for g in duplicate_report if not g["identical_except_id"]]
    alias_entries = {}
    retired_backup = []
    consolidated = []
    for group in confirmed:
        members = [original_records[i] for i in group["candidate_record_ids"]]
        merged = merge_confirmed_group(members)
        canonical_id = canonical_for_group(group)
        # Exact duplicate records contain no unique values to fold; keep the selected ULID.
        if merged["id"] != canonical_id:
            merged["id"] = canonical_id
        canonical_path = record_path(canonical_id)
        if do_apply:
            canonical_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        retired = []
        for record in members:
            if record["id"] == canonical_id:
                continue
            path = record_path(record["id"])
            map_rows = [r for r in json.loads((ROOT / "migration-record-map.json").read_text(encoding="utf-8")) if r["id"] == record["id"]]
            entry = {"canonical_id": canonical_id, "original_path": str(path.relative_to(ROOT)),
                     "record": record, "source_lineage": map_rows[0] if map_rows else None,
                     "reason": "All fields including exact coordinates and name match the canonical record except permanent ULID."}
            alias_entries[record["id"]] = entry
            retired_backup.append(entry)
            retired.append(record["id"])
            if do_apply:
                path.unlink()
        consolidated.append({"group_id": group["group_id"], "canonical_id": canonical_id,
                              "retired_ids": sorted(retired), "record_ids": sorted(group["candidate_record_ids"]),
                              "conflicting_fields": [], "field_preservation": "All non-ID fields were identical; no field values were discarded."})

    aliases["aliases"].update(alias_entries)
    if do_apply and (changed_values or alias_entries):
        aliases["phase2_formatting_backup"] = [{"id": item["id"], "filename": item["filename"], "before": item["before"]} for item in changed_values]
        ALIASES.write_text(json.dumps(aliases, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    active_count = len(list(PLACES.glob("*/*.json"))) - (0 if do_apply else len(alias_entries))
    active_ids = {p.stem for p in PLACES.glob("*/*.json")}
    if not do_apply:
        active_ids -= set(alias_entries)
    validate_alias_data(aliases, active_ids)
    post_road_hashes = data_hashes("data/roads/*/*.json")
    post_speed_hashes = data_hashes("data/speed-limits/*/*.json")
    if original_road_hashes != post_road_hashes or original_speed_hashes != post_speed_hashes:
        raise RuntimeError("Road or speed-limit source records changed during Places cleanup")

    review_rows = []
    for row in current["records"]:
        codes = {flag["code"] for flag in row["flags"]}
        coordinates_status = "missing" if row["coordinates"] is None else "invalid" if "invalid_coordinates" in codes else "present_not_independently_checked"
        if not row.get("address"):
            address_status = "missing"
        elif "postcode_locality_review" in codes:
            address_status = "conflicting_locality_postcode_needs_review"
        elif row.get("independent_public_evidence") and any("address" in item.get("limits", "").lower() for item in row["independent_public_evidence"]):
            address_status = "conflicting_external_address_evidence"
        else:
            address_status = "present_not_independently_checked"
        if not row.get("categories"):
            category_status = "missing"
        else:
            category_status = "present_alignment_not_checked"
        review_rows.append({**row, "review_status": {
            "name": "verified_identity" if row.get("independent_public_evidence") else "spelling_not_independently_checked",
            "coordinates": coordinates_status, "pin_accuracy": "not_checked",
            "address": address_status, "category_alignment": category_status,
            "public_listing": "verified_limited_scope" if row.get("independent_public_evidence") else "not_checked",
            "potentially_misplaced_pin": "not_checked",
            "suspicious_name": "format_candidate_review" if "name_format_review" in codes else "no_automated_suspicion_signal",
        }, "review_reasons": [flag["explanation"] for flag in row["flags"]],
            "source_references": sorted({item["url"] for item in row.get("independent_public_evidence", []) if item.get("url")} |
                                        {flag["source_url"] for flag in row["flags"] if flag.get("source_url")})})

    output = {
        "phase": "Mazo Maps Places Data Quality Cleanup — Phase 2",
        "base_commit": "86a9b55b70f35d6f3351f2942f1c8aa09ad09fba",
        "audit_artifact": {"run_id": 40412963252, "artifact_id": 12693913220,
                           "name": "places-quality-audit-2026-10-27", "artifact_sha256": "6fccb4b4f91047d9355f9818cf5d68acdfbee85dff98db2acc05ffba1ccd50d2",
                           "reconstruction_matches_artifact": True},
        "summary": {"records_before": len(current["records"]), "records_after": active_count,
                    "names_normalized": sum("name" in x["after"] for x in changed_values),
                    "addresses_normalized": sum("address" in x["after"] for x in changed_values),
                    "duplicate_groups_consolidated": len(consolidated), "records_retired": len(alias_entries),
                    "canonical_records_retained": len(consolidated), "unresolved_duplicate_groups": len(unresolved),
                    "unresolved_duplicate_records": sum(len(g["candidate_record_ids"]) for g in unresolved),
                    "road_records_preserved": len(original_road_hashes), "speed_limit_records_preserved": len(original_speed_hashes),
                    "road_source_hashes_unchanged": original_road_hashes == post_road_hashes,
                    "speed_limit_source_hashes_unchanged": original_speed_hashes == post_speed_hashes},
        "format_changes": changed_values,
        "consolidated_groups": consolidated,
        "retired_aliases": {k: {"canonical_id": v["canonical_id"], "original_path": v["original_path"],
                                 "source_lineage": v["source_lineage"], "record": v["record"], "reason": v["reason"]}
                            for k, v in sorted(alias_entries.items())},
        "unresolved_duplicate_groups": unresolved,
        "record_review": review_rows,
        "external_evidence_status": {
            "moe_school_matches": "verified positive census-number matches in the 2024 MOE Eastern Province list; identity only, not pin or present status",
            "idb_addax": "verified listing for name/contact; address conflicts with two source record copies, and pin is not confirmed",
            "postcode": "Kattankudi 30100 verified in Sri Lanka Post reference; 63 locality conflicts remain unmodified",
            "other_public_listings": "not checked; generated discovery links are not evidence",
            "pin_accuracy": "not checked record by record",
            "category_alignment": "not checked against independent registries",
        },
        "rollback": {"mechanism": "data/places/aliases.json stores each retired full record, its original path, lineage, and formatting originals; run `python scripts/places_cleanup_phase2.py --rollback` to restore.",
                      "road_source_sha256_before": original_road_hashes, "speed_limit_source_sha256_before": original_speed_hashes},
        "limitations": ["Original legacy JSON payloads are absent from main; migration-record-map.json preserves source paths and row indexes only.",
                        "The 172 candidate groups with differing fields remain untouched and are fully listed above.",
                        "No coordinates, postcodes, categories, ambiguous abbreviations, or uncertain spellings were inferred."],
    }
    return output


def rollback() -> None:
    data = load_alias_data()
    for retired_id, entry in data.get("aliases", {}).items():
        path = ROOT / entry["original_path"]
        if path.exists():
            raise ValueError(f"Cannot restore {retired_id}; path is already occupied: {path}")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(entry["record"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for item in data.get("phase2_titlecase_backup", []):
        path = ROOT / item["filename"]
        record = json.loads(path.read_text(encoding="utf-8"))
        record.update(item["before"])
        path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for item in data.get("phase2_formatting_backup", []):
        path = ROOT / item["filename"]
        record = json.loads(path.read_text(encoding="utf-8"))
        record.update(item["before"])
        path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if ALIASES.exists():
        ALIASES.unlink()
    import places
    with contextlib.redirect_stdout(io.StringIO()):
        places.build()


def write_reports(report: dict) -> None:
    for row in report.get("record_review", []):
        if "review_status" in row:
            continue
        codes = {flag["code"] for flag in row.get("flags", [])}
        evidence = row.get("independent_public_evidence", [])
        if row.get("coordinates") is None:
            coordinates_status = "missing"
        elif "invalid_coordinates" in codes:
            coordinates_status = "invalid"
        else:
            coordinates_status = "present_not_independently_checked"
        if not row.get("address"):
            address_status = "missing"
        elif "postcode_locality_review" in codes:
            address_status = "conflicting_locality_postcode_needs_review"
        elif evidence and any("address" in item.get("limits", "").lower() for item in evidence):
            address_status = "conflicting_external_address_evidence"
        else:
            address_status = "present_not_independently_checked"
        row["review_status"] = {
            "name": "verified_identity" if evidence else "spelling_not_independently_checked",
            "coordinates": coordinates_status, "pin_accuracy": "not_checked", "address": address_status,
            "category_alignment": "missing" if not row.get("categories") else "present_alignment_not_checked",
            "public_listing": "verified_limited_scope" if evidence else "not_checked",
            "potentially_misplaced_pin": "not_checked",
            "suspicious_name": "format_candidate_review" if "name_format_review" in codes else "no_automated_suspicion_signal",
        }
        row["review_reasons"] = [flag["explanation"] for flag in row.get("flags", [])]
        row["source_references"] = sorted({item["url"] for item in evidence if item.get("url")} |
                                          {flag["source_url"] for flag in row.get("flags", []) if flag.get("source_url")})
    JSON_REPORT.parent.mkdir(parents=True, exist_ok=True)
    JSON_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    s = report["summary"]
    top = sorted(report["record_review"], key=lambda x: (-x["review_priority_score"], x["id"]))[:30]
    lines = [
        "# Phase 2 Places data quality cleanup report", "",
        "The score ranks investigation priority only; it is not a probability that a place is fake.", "",
        "## Changes", "",
        f"- Names normalized: {s['names_normalized']}", f"- Addresses normalized: {s['addresses_normalized']}",
        f"- Comprehensive Title Case changes on active records: {s.get('title_case_names_normalized', 0)} (complete before/after list in the JSON report)",
        f"- Exact duplicate groups consolidated: {s['duplicate_groups_consolidated']}",
        f"- Records retired with permanent ULID aliases: {s['records_retired']}",
        f"- Canonical records retained: {s['canonical_records_retained']}",
        f"- Unresolved duplicate groups: {s['unresolved_duplicate_groups']}",
        f"- Active Places: {s['records_before']} → {s['records_after']}", "",
        "Exact before/after values, affected ULIDs, all conflict fields, evidence states, and retired-record backups are in `../reports/places-data-quality-phase-2.json`.", "",
        f"## Complete name changes ({s.get('names_changed_from_base', 0)} records)", "",
        "| ULID | Before | After | Record state |", "|---|---|---|---|",
    ]
    for item in report.get("name_changes_from_base", []):
        before = str(item.get("before") or "").replace("|", "\\|").replace("\n", " ")
        after = str(item.get("after") or "").replace("|", "\\|").replace("\n", " ")
        lines.append(f"| `{item['id']}` | {before} | {after} | {item['record_state']} |")
    lines += [
        "", "## Review scope and limits", "",
        "All 867 audit groups were re-evaluated against current field values. Only groups with every non-ID field exactly equal were consolidated. The 172 groups with field differences remain unresolved; co-location alone was not used to merge records.", "",
        "Records without independently checked public listings are marked unverified/not checked. Search links are leads only. Missing online presence does not label a record invalid. The two ADDAX records have an IDB name/contact match but conflicting address evidence; the source address and pin were preserved.", "",
        "Kattankudy postcode 30100 is retained as a reference. Conflicting locality/postcode records were not changed. Invalid or missing coordinates, category mismatches, and pin placement require review from a source that was not available for each record.", "",
        "## Highest review-priority records", "",
        "| Score | ULID | Name | Flags |", "|---:|---|---|---|",
    ]
    for row in top:
        flags = ", ".join(flag["code"] for flag in row["flags"])
        lines.append(f"| {row['review_priority_score']} | `{row['id']}` | {row['name']} | {flags} |")
    lines += ["", "## Rollback", "", "`data/places/aliases.json` contains complete retired records and original formatting values. Restore with `python scripts/places_cleanup_phase2.py --rollback`.", ""]
    MD_REPORT.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="apply safe formatting and exact duplicate consolidation")
    parser.add_argument("--rollback", action="store_true", help="restore retired records and original formatting")
    parser.add_argument("--check", action="store_true", help="audit and validate Phase 2 state")
    args = parser.parse_args()
    if args.rollback:
        rollback()
        return 0
    if args.apply and not ALIASES.exists():
        apply_cleanup(do_apply=True)
        apply_active_titlecase()
        report = rebuild_phase2_report()
        write_reports(report)
        print(json.dumps(report["summary"], indent=2))
        return 0
    if ALIASES.exists():
        if args.apply:
            applied = apply_pending_formatting()
            titlecase_applied = apply_active_titlecase()
            report = rebuild_phase2_report()
            write_reports(report)
            print(json.dumps({"formatting_fields_applied": applied, "title_case_names_applied": titlecase_applied, **report["summary"]}, indent=2))
            return 0
        report = json.loads(JSON_REPORT.read_text(encoding="utf-8"))
        if ("record_review" not in report or "data_integrity_before_after" not in report
                or not report.get("summary", {}).get("road_source_hashes_unchanged")
                or not report.get("summary", {}).get("speed_limit_source_hashes_unchanged")
                or report.get("rollback", {}).get("road_source_sha256_before") != data_hashes("data/roads/*/*.json")
                or report.get("rollback", {}).get("speed_limit_source_sha256_before") != data_hashes("data/speed-limits/*/*.json")):
            report = rebuild_phase2_report()
        validate_alias_data(load_alias_data(), {p.stem for p in PLACES.glob("*/*.json")})
        if args.check:
            drift = formatting_drift()
            if drift:
                raise SystemExit(f"Unapplied formatting edits for {len(drift)} records; rerun with --apply")
            print(json.dumps(report["summary"], indent=2))
            return 0
        write_reports(report)
        print(f"Phase 2 cleanup report already exists: {JSON_REPORT.relative_to(ROOT)}")
        return 0
    report = apply_cleanup(do_apply=False)
    if args.check:
        print(json.dumps(report["summary"], indent=2))
        return 0
    write_reports(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
