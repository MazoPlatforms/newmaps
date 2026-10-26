#!/usr/bin/env python3
"""Generate the review artifact for all original duplicate candidates and edits."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import audit_places_quality as audit
import places
import validate_places_phase2


def original_record(record):
    original = {k: v for k, v in record.items()
                if k not in {"id", "aliases", "source_records"} and not k.endswith("_original")}
    for field in ("name", "address", "categories", "coordinates"):
        if field + "_original" in record:
            original[field] = record[field + "_original"]
    return original


def generate():
    current_audit = audit.audit()
    current = {r["id"]: r for r in places.load_places()[0]}
    mapping = {r["id"]: r for r in json.loads((ROOT / "migration-record-map.json").read_text(encoding="utf-8"))}
    aliases = json.loads((ROOT / "data/place-aliases.json").read_text(encoding="utf-8"))["aliases"]
    retired_by_canonical = {}
    for retired_id, canonical_id in aliases.items():
        retired_by_canonical.setdefault(canonical_id, []).append(retired_id)

    decisions = []
    for canonical_id, retired_ids in sorted(retired_by_canonical.items()):
        ids = sorted([canonical_id, *retired_ids])
        originals = []
        for place_id in ids:
            if place_id == canonical_id:
                record = original_record(current[place_id])
            else:
                path = places.PLACES / "retired" / f"{place_id}.json"
                record = json.loads(path.read_text(encoding="utf-8"))
                record.pop("id", None)
            originals.append({"id": place_id, **record})
        signatures = [json.dumps({k: v for k, v in r.items() if k != "id"}, ensure_ascii=False, sort_keys=True, separators=(",", ":")) for r in originals]
        if len(set(signatures)) != 1:
            raise ValueError(f"Merged group no longer compares exactly: {ids}")
        group_id = "DUP-" + hashlib.sha256("|".join(ids).encode()).hexdigest()[:12].upper()
        decisions.append({"group_id": group_id, "decision": "merge_exact_source_duplicate",
                          "canonical_id": canonical_id, "retired_ids": [i for i in ids if i != canonical_id],
                          "reason": "Original source fields and coordinates are identical except for ULID; retired source JSON is archived verbatim.",
                          "source_lineage": [{"id": i, "source": mapping[i]["source"], "index": mapping[i]["index"]} for i in ids],
                          "before_records": originals, "canonical_after": current[canonical_id]})

    for group in current_audit["duplicate_groups"]:
        ids = group["candidate_record_ids"]
        decisions.append({"group_id": group["group_id"], "decision": "retain_all_for_review",
                          "reason": "Conflicting source fields and/or uncertain identity; no safe consolidation decision.",
                          "record_ids": ids, "conflicting_fields": group["conflicting_fields"],
                          "field_value_comparison_by_record": group["field_value_comparison_by_record"],
                          "records_unchanged": [current[i] for i in ids]})

    changes = []
    for place_id, record in sorted(current.items()):
        for field in ("name", "address", "categories", "coordinates"):
            original_field = field + "_original"
            if original_field in record:
                changes.append({"id": place_id, "field": field, "before": record[original_field],
                                "after": record.get(field), "method": "reversible formatting; original value stored in the record"})
    integrity = validate_places_phase2.validate()
    if len(decisions) != 867 or len(changes) != 75:
        raise ValueError(f"Unexpected Phase 2 report counts: groups={len(decisions)}, field_changes={len(changes)}")
    return {"summary": {"original_source_records": len(mapping), "active_records": len(current),
                         "retired_aliases": len(aliases), "duplicate_groups_reviewed": len(decisions),
                         "confirmed_exact_groups_merged": len(retired_by_canonical),
                         "conflicting_groups_retained": len(current_audit["duplicate_groups"]),
                         "name_changes": sum(c["field"] == "name" for c in changes),
                         "address_changes": sum(c["field"] == "address" for c in changes),
                         "category_changes": sum(c["field"] == "categories" for c in changes),
                         "original_source_records_verified": integrity["source_records_verified"],
                         "source_archive_commit": integrity["source_archive_commit"],
                         "valid_geojson_features": sum(audit.valid_coordinates(r.get("coordinates")) for r in current.values()),
                         "unresolved_missing_geometry": sum(r.get("coordinates") is None for r in current.values())},
            "source_preservation": integrity, "field_changes": changes,
            "duplicate_group_decisions": sorted(decisions, key=lambda d: d["group_id"]),
            "post_cleanup_audit_summary": current_audit["summary"]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "reports/places-phase2-before-after.json")
    args = parser.parse_args()
    report = generate()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))


if __name__ == "__main__":
    main()
