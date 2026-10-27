#!/usr/bin/env python3
"""Contributor helpers that create records in the repository's normal place tree."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import places
from validate_place_contributions import validate_schema


def scaffold(record: dict, allow_duplicate_candidate: bool = False) -> Path:
    """Allocate a permanent ULID and write a new record in the next shard."""
    if not isinstance(record, dict):
        raise ValueError("A place template must be a JSON object")
    if "id" in record:
        raise ValueError("Do not provide an ID in a new-place template; the allocator assigns it")
    errors = validate_schema(record, "new-place template", require_id=False)
    if errors:
        raise ValueError("\n".join(errors))
    if not record.get("categories"):
        raise ValueError("Add at least one specific public-place category before scaffolding")
    return places.allocate(record, allow_duplicate_candidate=allow_duplicate_candidate)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("ulid", help="print a fresh permanent ULID")
    sub.add_parser("shard", help="print the next place shard with capacity")
    make = sub.add_parser("scaffold", help="create a new public place record from JSON")
    make.add_argument("template", type=Path, help="JSON file containing name, categories, and known fields")
    make.add_argument("--allow-duplicate-candidate", action="store_true",
                      help="allow a suspected separate branch after documenting it in the PR")
    args = parser.parse_args()
    try:
        if args.command == "ulid":
            print(places.new_unique_ulid())
        elif args.command == "shard":
            print(places.next_shard().relative_to(ROOT))
        else:
            record = json.loads(args.template.read_text(encoding="utf-8"))
            scaffold(record, args.allow_duplicate_candidate)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
