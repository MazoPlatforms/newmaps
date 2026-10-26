#!/usr/bin/env python3
"""Compare every active/retired place with the immutable legacy source archive."""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import places


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def validate(source_ref="archive/pre-ulid-migration"):
    mapping = json.loads((ROOT / "migration-record-map.json").read_text(encoding="utf-8"))
    alias_map = json.loads((ROOT / "data/place-aliases.json").read_text(encoding="utf-8"))["aliases"]
    active_rows, _, _ = places.load_places()
    active = {record["id"]: record for record in active_rows}
    if len(active) + len(alias_map) != len(mapping):
        raise ValueError("Active plus retired count differs from original source mapping")
    if set(active) & set(alias_map):
        raise ValueError("Retired alias remains active")

    source_cache = {}
    checked = 0
    for row in mapping:
        place_id = row["id"]
        if place_id in alias_map:
            if alias_map[place_id] not in active:
                raise ValueError(f"Alias target missing: {place_id}")
            path = places.PLACES / "retired" / f"{place_id}.json"
            record = json.loads(path.read_text(encoding="utf-8"))
        else:
            record = active.get(place_id)
            if record is None:
                raise ValueError(f"Unresolved source record {place_id}")

        original = {key: value for key, value in record.items()
                    if key not in {"id", "aliases", "source_records"} and not key.endswith("_original")}
        for field in ("name", "address", "categories", "coordinates"):
            original_field = f"{field}_original"
            if original_field in record:
                original[field] = record[original_field]

        if row["source"] not in source_cache:
            payload = subprocess.check_output(["git", "show", f"{source_ref}:{row['source']}"], cwd=ROOT)
            parsed = json.loads(payload)
            source_cache[row["source"]] = parsed.get("results", parsed if isinstance(parsed, list) else [])
        source_records = source_cache[row["source"]]
        if not isinstance(source_records, list) or not 0 <= row["index"] < len(source_records):
            raise ValueError(f"Invalid archived source row {row['source']}[{row['index']}]")
        expected = {key: value for key, value in source_records[row["index"]].items() if key != "id"}
        if canonical(original) != canonical(expected):
            differing = sorted(key for key in set(original) | set(expected) if original.get(key) != expected.get(key))
            raise ValueError(f"Source record mismatch for {place_id}: {differing}")
        checked += 1

    archive_sha = subprocess.check_output(["git", "rev-parse", source_ref], cwd=ROOT, text=True).strip()
    return {"source_records_verified": checked, "active_records": len(active),
            "retired_aliases": len(alias_map), "source_files": len(source_cache),
            "source_archive_commit": archive_sha, "mismatches": 0}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-ref", default="archive/pre-ulid-migration")
    args = parser.parse_args()
    try:
        print(json.dumps(validate(args.source_ref), indent=2))
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
