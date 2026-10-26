#!/usr/bin/env python3
"""Apply conservative, reversible Phase 2 place cleanup from the full audit.

Only records identical in every source field except ULID are consolidated.
Typographic edits retain the exact source value in *_original fields. Conflicting
duplicate candidates are reported and left active without modification.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import audit_places_quality as audit_module
import validate_places_phase2

PLACES = ROOT / "data/places"
MAP_PATH = ROOT / "migration-record-map.json"
REPORT_PATH = ROOT / "reports/places-phase2-before-after.json"
ALIAS_PATH = ROOT / "data/place-aliases.json"
RETIRED = PLACES / "retired"
ACRONYMS = {
    "SMR", "BT", "BC", "ATM", "LED", "CCTV", "IT", "ICT", "PC", "USB",
    "GPS", "NGO", "TV", "AC", "DC", "MCC", "RDA", "SLT", "HNB", "BOC",
    "NSB", "NDB", "DFCC", "CEB", "LPG", "KFC", "BTS", "ADS", "NHK", "DJ",
    "FM", "AP", "LK", "PVT", "LTD", "PLC", "DS", "SMS",
}
NULL_COORDINATE_SOURCE_ROWS = {("education.json", 149), ("services.json", 171)}


def dump(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def canonical(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def format_words(value: str) -> str:
    """Apply reversible title casing to ASCII all-caps/lowercase text only."""
    text = re.sub(r"\s+", " ", value).strip()
    if not text or any(ord(ch) > 127 for ch in text):
        return text
    letters = [ch for ch in text if ch.isalpha()]
    if not letters or not (all(ch.isupper() for ch in letters) or all(ch.islower() for ch in letters)):
        return text
    parts = re.findall(r"[A-Za-z]+|[^A-Za-z]+", text)
    return "".join(part if not part.isalpha() or part.upper() in ACRONYMS else part.title() for part in parts)


def format_address(value: str) -> str:
    """Normalize whitespace and punctuation only; do not add or reinterpret details."""
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"\s*,\s*", ", ", value)
    value = re.sub(r",\s*,+", ", ", value)
    return value.strip(" ,")


def field_changes(record: dict, place_id: str) -> list[dict]:
    changes = []
    name = record.get("name")
    if isinstance(name, str):
        after = format_words(name)
        if after != name:
            record.setdefault("name_original", name)
            record["name"] = after
            changes.append({"id": place_id, "field": "name", "before": name, "after": after,
                            "method": "reversible ASCII case/whitespace formatting; source retained in name_original"})
    address = record.get("address")
    if isinstance(address, str):
        after = format_address(address)
        if after != address:
            record.setdefault("address_original", address)
            record["address"] = after
            changes.append({"id": place_id, "field": "address", "before": address, "after": after,
                            "method": "reversible whitespace/comma spacing only; no postal details added"})
    categories = record.get("categories")
    if isinstance(categories, list):
        after = [format_words(x) if isinstance(x, str) else x for x in categories]
        if after != categories:
            record.setdefault("categories_original", categories)
            record["categories"] = after
            changes.append({"id": place_id, "field": "categories", "before": categories, "after": after,
                            "method": "reversible ASCII case/whitespace formatting; source retained in categories_original"})
    return changes


def main() -> int:
    report_before = audit_module.audit()
    groups = report_before["duplicate_groups"]
    place_by_id = {}
    path_by_id = {}
    for path in sorted(PLACES.glob("[0-9][0-9][0-9][0-9]/*.json")):
        record = json.loads(path.read_text(encoding="utf-8"))
        place_by_id[record["id"]] = record
        path_by_id[record["id"]] = path
    mapping = json.loads(MAP_PATH.read_text(encoding="utf-8"))
    lineage = {row["id"]: {"id": row["id"], "source": row.get("source"), "index": row.get("index"), "original_id": row["id"]}
               for row in mapping}
    if len(place_by_id) != 3694 or len(groups) != 867:
        raise SystemExit(f"Unexpected audit baseline: {len(place_by_id)} records, {len(groups)} duplicate groups")
    if any("alias_of" in row for row in mapping) or ALIAS_PATH.exists() or RETIRED.exists():
        raise SystemExit("Phase 2 cleanup already applied or alias/archive state exists; refusing to overwrite")

    # Recheck all fields independently before authorizing any consolidation.
    alias_to_canonical = {}
    merge_rows = []
    unchanged_conflicts = []
    archives = []
    for group in groups:
        ids = group["candidate_record_ids"]
        records = [place_by_id[place_id] for place_id in ids]
        identical = all(canonical({k: v for k, v in record.items() if k != "id"}) ==
                        canonical({k: v for k, v in records[0].items() if k != "id"}) for record in records[1:])
        if group["identical_except_id"] and not identical:
            raise SystemExit(f"Audit/report disagreement for candidate group {group['group_id']}")
        if not identical:
            unchanged_conflicts.append({"group_id": group["group_id"], "decision": "retain_all",
                                        "reason": "source records differ in one or more fields; identity/branch cannot be established safely",
                                        "record_ids": ids, "conflicting_fields": group["conflicting_fields"],
                                        "field_value_comparison_by_record": group["field_value_comparison_by_record"]})
            continue
        # All members are exact field copies, so stable smallest ULID is canonical.
        canonical_id = min(ids)
        for retired_id in ids:
            if retired_id == canonical_id:
                continue
            alias_to_canonical[retired_id] = canonical_id
            archives.append({"id": retired_id, "canonical_id": canonical_id,
                             "archive_path": f"data/places/retired/{retired_id}.json",
                             "source": lineage[retired_id]})
        merge_rows.append({"group_id": group["group_id"], "decision": "merge_exact_source_duplicate",
                           "canonical_id": canonical_id, "retired_ids": sorted(i for i in ids if i != canonical_id),
                           "reason": "all stored source fields and coordinates compare exactly except permanent ULID; every retired record is archived"})

    # Retire exact duplicates into immutable, complete JSON backups and annotate
    # the canonical record with old IDs and full original source lineage.
    retired_records = []
    for retired_id, canonical_id in sorted(alias_to_canonical.items()):
        record = place_by_id[retired_id]
        retired_records.append({"id": retired_id, "canonical_id": canonical_id,
                                "source": lineage[retired_id], "archive_path": f"data/places/retired/{retired_id}.json"})
        dump(RETIRED / f"{retired_id}.json", record)
        path_by_id[retired_id].unlink()
    aliases_by_canonical = {}
    for alias, canonical_id in alias_to_canonical.items():
        aliases_by_canonical.setdefault(canonical_id, []).append(alias)
    for canonical_id, aliases in aliases_by_canonical.items():
        record = place_by_id[canonical_id]
        record["aliases"] = sorted(aliases)
        record["source_records"] = [lineage[canonical_id]] + [lineage[a] for a in sorted(aliases)]

    changes = []
    for place_id, record in sorted(place_by_id.items()):
        if place_id in alias_to_canonical:
            continue
        # Do not normalize a duplicate's retired copy; its exact source remains in the archive.
        changes.extend(field_changes(record, place_id))
        source_line = lineage[place_id]
        if (source_line["source"], source_line["index"]) in NULL_COORDINATE_SOURCE_ROWS:
            original_coordinates = {"latitude": None, "longitude": None}
            if record.get("coordinates") is not None:
                raise SystemExit(f"Unexpected migrated coordinates for {place_id}; refusing to overwrite")
            record["coordinates_original"] = original_coordinates
            changes.append({"id": place_id, "field": "coordinates_original", "before": None,
                            "after": original_coordinates,
                            "method": "preserved explicit null latitude/longitude from archived source; remains excluded from GeoJSON"})
        if place_id in path_by_id and path_by_id[place_id].exists():
            dump(path_by_id[place_id], record)

    for row in mapping:
        if row["id"] in alias_to_canonical:
            row["alias_of"] = alias_to_canonical[row["id"]]
    dump(ALIAS_PATH, {"schema_version": 1, "aliases": dict(sorted(alias_to_canonical.items()))})

    active_ids = {json.loads(path.read_text(encoding="utf-8"))["id"]
                  for path in PLACES.glob("[0-9][0-9][0-9][0-9]/*.json")}
    if active_ids & set(alias_to_canonical):
        raise SystemExit("Safety check failed: retired alias IDs remain in active shards")
    if len(active_ids) != len(place_by_id) - len(alias_to_canonical):
        raise SystemExit("Safety check failed: unexpected active place record count")
    report_after = audit_module.audit()
    summary = {
        "phase": "2", "baseline_records": len(place_by_id),
        "active_records_after": len(place_by_id) - len(alias_to_canonical),
        "source_record_count_preserved": len(mapping), "duplicate_candidate_groups_reviewed": len(groups),
        "confirmed_exact_duplicate_groups_merged": len(merge_rows), "records_retired_as_duplicates": len(alias_to_canonical),
        "conflicting_candidate_groups_retained": len(unchanged_conflicts),
        "name_fields_normalized": sum(c["field"] == "name" for c in changes),
        "address_fields_formatted": sum(c["field"] == "address" for c in changes),
        "category_arrays_normalized": sum(c["field"] == "categories" for c in changes),
        "individual_field_changes": len(changes),
        "geometryless_records_retained": sum(r.get("coordinates") is None for r in place_by_id.values()),
        "before_shards": {"0001": 999, "0002": 999, "0003": 999, "0004": 697},
        "after_shards": {d.name: len(list(d.glob('*.json'))) for d in sorted(PLACES.iterdir()) if d.is_dir() and d.name.isdigit()},
        "geojson_features_after": sum(audit_module.valid_coordinates(r.get("coordinates")) for r in place_by_id.values()),
        "field_formatting_policy": "ASCII casing and whitespace/comma spacing only; changed source values are retained in *_original fields",
        "verification_limit": "No business identity, live status, brand styling, street expansion, postcode, or geospatial relocation is inferred from search absence or coordinates.",
    }
    source_verification = validate_places_phase2.validate()
    dump(REPORT_PATH, {"summary": summary, "source_preservation": {
                           "source_archive_commit": source_verification["source_archive_commit"],
                           "source_files_checked": source_verification["source_files"],
                           "source_records_checked": source_verification["source_records_verified"],
                           "mismatches": source_verification["mismatches"],
                           "method": "Reconstructed each original JSON object from the active record or retired backup, reversed only *_original formatting fields, removed generated ULID/alias metadata, then compared canonical JSON to the source checksum ledger."},
                       "field_changes": changes,
                       "duplicate_group_decisions": sorted(merge_rows + unchanged_conflicts, key=lambda x: x["group_id"]),
                       "retired_records": retired_records,
                       "post_cleanup_audit_summary": report_after["summary"]})
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
