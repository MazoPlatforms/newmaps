#!/usr/bin/env python3
"""Validate contributed place records, aliases, duplicate flags, and MZP output.

This script is intentionally offline. Run it in a read-only pull-request job with
no secrets; it validates the checked-out tree and emits review warnings only.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import places
from place_eligibility import classify_place
from place_names import normalize_place_name

REDACTED_FIELDS = {"id", "name", "coordinates", "public_eligibility", "eligibility_review_token"}
WITHHELD_LABEL = "Location withheld pending eligibility review"
PROVENANCE_FIELDS = {"source_name", "source_url", "checked_at", "checked_by", "notes"}


def validate_schema(record: object, path: str = "<record>", require_id: bool = True) -> list[str]:
    """Validate the repository's place schema without third-party dependencies."""
    errors: list[str] = []
    if not isinstance(record, dict):
        return [f"{path}: place record must be a JSON object"]
    required = ("name", "coordinates") if not require_id else ("id", "name", "coordinates")
    for key in required:
        if key not in record:
            errors.append(f"{path}: required field '{key}' is missing")
    if "id" in record and (not isinstance(record["id"], str) or not places.ULID.fullmatch(record["id"])):
        errors.append(f"{path}: id must be a 26-character Crockford Base32 ULID")
    if "name" in record and (not isinstance(record["name"], str) or not record["name"].strip()):
        errors.append(f"{path}: name must be a non-empty string")
    coordinates = record.get("coordinates")
    if coordinates is not None:
        if not isinstance(coordinates, dict):
            errors.append(f"{path}: coordinates must be an object or null")
        else:
            for key, low, high in (("latitude", -90, 90), ("longitude", -180, 180)):
                value = coordinates.get(key)
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                    errors.append(f"{path}: coordinates.{key} must be a finite number")
                elif not low <= value <= high:
                    errors.append(f"{path}: coordinates.{key} is outside [{low}, {high}]")
    categories = record.get("categories")
    if "categories" in record and (not isinstance(categories, list) or
                                    not all(isinstance(x, str) and x.strip() for x in categories)):
        errors.append(f"{path}: categories must be an array of non-empty strings")
    for key in ("address", "phone", "website", "business_status"):
        if key in record and not isinstance(record[key], str):
            errors.append(f"{path}: {key} must be a string")
    if "hours" in record and not isinstance(record["hours"], list):
        errors.append(f"{path}: hours must be an array")
    provenance = record.get("provenance")
    if "provenance" in record:
        if not isinstance(provenance, dict):
            errors.append(f"{path}: provenance must be an object")
        else:
            extra = set(provenance) - PROVENANCE_FIELDS
            if extra:
                errors.append(f"{path}: unsupported provenance keys: {', '.join(sorted(extra))}")
            for key, value in provenance.items():
                if key == "notes":
                    if not isinstance(value, str): errors.append(f"{path}: provenance.notes must be a string")
                elif not isinstance(value, str) or not value.strip():
                    errors.append(f"{path}: provenance.{key} must be a non-empty string")
            source_url = provenance.get("source_url")
            if source_url and not re.match(r"^https?://\S+$", source_url, re.I):
                errors.append(f"{path}: provenance.source_url must be an http(s) URL")
            checked_at = provenance.get("checked_at")
            if checked_at:
                try:
                    parsed = dt.datetime.fromisoformat(checked_at.replace("Z", "+00:00"))
                    if parsed.tzinfo is None:
                        raise ValueError("timezone is required")
                except ValueError:
                    errors.append(f"{path}: provenance.checked_at must be an ISO-8601 date-time with timezone")
            checked_by = provenance.get("checked_by")
            if checked_by and ("@" in checked_by or re.fullmatch(r"[A-Za-z0-9-]{1,39}", checked_by) is None):
                errors.append(f"{path}: provenance.checked_by must be a public GitHub username, not an email or private contact")
    return errors


def _normal_name(value: str) -> str:
    return re.sub(r"[^\w]", "", normalize_place_name(value).casefold(), flags=re.UNICODE)


def _distance_meters(a: dict, b: dict) -> float:
    radius = 6_371_000
    lat1, lat2 = math.radians(a["latitude"]), math.radians(b["latitude"])
    dlat = lat2 - lat1
    dlon = math.radians(b["longitude"] - a["longitude"])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return radius * 2 * math.asin(min(1, math.sqrt(h)))


def duplicate_candidates(record: dict, existing: list[dict], radius_meters: float = 30) -> list[str]:
    """Return conservative same-name nearby IDs; this is a review signal only."""
    coordinates = record.get("coordinates")
    name = _normal_name(record.get("name", ""))
    if not name or not isinstance(coordinates, dict):
        return []
    matches = []
    for other in existing:
        if other.get("id") == record.get("id") or _normal_name(other.get("name", "")) != name:
            continue
        other_coordinates = other.get("coordinates")
        if isinstance(other_coordinates, dict) and _distance_meters(coordinates, other_coordinates) <= radius_meters:
            matches.append(other["id"])
    return sorted(matches)


def changed_place_files(base_ref: str, head_ref: str) -> list[tuple[str, str]]:
    changes: dict[str, str] = {}
    commands = (
        ["git", "diff", "--merge-base", "--no-renames", "--name-status", base_ref, head_ref, "--", "data/places"],
        ["git", "diff", "--no-renames", "--name-status", "HEAD", "--", "data/places"],
    )
    for command in commands:
        result = subprocess.run(command, cwd=ROOT, check=True, capture_output=True, text=True)
        for line in result.stdout.splitlines():
            status, path = line.split("\t", 1)
            # Preserve an Added status from the branch when that new file has
            # also been edited locally since its commit.
            if changes.get(path) != "A":
                changes[path] = status
    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard", "--", "data/places"],
        cwd=ROOT, check=True, capture_output=True, text=True,
    )
    for path in untracked.stdout.splitlines():
        changes[path] = "A"
    return [(status, path) for path, status in sorted(changes.items())]


def _git_json(ref: str, path: str) -> dict:
    result = subprocess.run(["git", "show", f"{ref}:{path}"], cwd=ROOT, check=True, capture_output=True)
    return json.loads(result.stdout)


def validate_alias_changes(base_ref: str, aliases: dict, removed_ids: set[str]) -> list[str]:
    """Keep retired IDs durable and only add aliases for records retired in this change."""
    alias_path = "data/places/aliases.json"
    try:
        previous = _git_json(base_ref, alias_path).get("aliases", {})
    except subprocess.CalledProcessError:
        previous = {}
    errors = []
    for retired_id, old_entry in previous.items():
        new_entry = aliases.get(retired_id)
        if new_entry is None:
            errors.append(f"Retired place alias {retired_id} was removed; aliases are permanent")
        elif new_entry.get("canonical_id") != old_entry.get("canonical_id"):
            errors.append(f"Retired place alias {retired_id} was reassigned to a different canonical ULID")
    for retired_id in set(aliases) - set(previous):
        if retired_id not in removed_ids:
            errors.append(f"New alias {retired_id} must correspond to a source place retired in this change")
    return errors


def validate_tree() -> tuple[list[dict], dict, list[list[str]]]:
    records, shard_counts, exact_pairs = places.load_places()
    errors = []
    for path in sorted((ROOT / "data/places").glob("*/*.json")):
        if path.name == "aliases.json":
            continue
        record = json.loads(path.read_text(encoding="utf-8"))
        errors.extend(validate_schema(record, str(path.relative_to(ROOT))))
        if not classify_place(record)["eligible_for_public_map"] and not _is_safe_withheld_placeholder(record):
            errors.append(f"{path.relative_to(ROOT)}: non-public or uncertain records must use the privacy-safe placeholder")
    aliases = places.load_aliases()
    for retired_id, entry in aliases.items():
        if "record" in entry:
            errors.extend(validate_schema(entry["record"], f"alias {retired_id}"))
            if not classify_place(entry["record"])["eligible_for_public_map"] and not _is_safe_withheld_placeholder(entry["record"]):
                errors.append(f"alias {retired_id}: non-public or uncertain payload must use the privacy-safe placeholder")
    if errors:
        raise ValueError("\n".join(errors))
    if any(count > places.LIMIT for count in shard_counts.values()):
        raise ValueError("A place shard exceeds the 999 JSON record limit")
    return records, shard_counts, exact_pairs


def _is_safe_withheld_placeholder(record: dict) -> bool:
    return (set(record) <= REDACTED_FIELDS and record.get("name") == WITHHELD_LABEL
            and record.get("coordinates") is None
            and record.get("public_eligibility") in {"uncertain", "confirmed_private_residential"}
            and bool(record.get("eligibility_review_token")))


def validate_changes(base_ref: str, head_ref: str) -> dict:
    records, shard_counts, exact_pairs = validate_tree()
    aliases = places.load_aliases()
    active_by_id = {record["id"]: record for record in records}
    changed = changed_place_files(base_ref, head_ref)
    touched_ids: set[str] = set()
    removed_ids: list[str] = []
    warnings: list[tuple[str, str]] = []
    errors: list[str] = []

    for status, path in changed:
        if path == "data/places/aliases.json":
            continue
        match = re.fullmatch(r"data/places/(\d{4,})/([0-7][0-9A-HJKMNP-TV-Z]{25})\.json", path)
        if not match:
            errors.append(f"Unexpected place data path: {path}")
            continue
        record_id = match.group(2)
        if status == "D":
            removed_ids.append(record_id)
            if record_id not in aliases:
                errors.append(f"Deleted place {record_id} has no durable alias; preserve its ID or submit a review request")
            continue
        if status not in {"A", "M"}:
            errors.append(f"Unsupported place change status {status} for {path}")
            continue
        record = json.loads((ROOT / path).read_text(encoding="utf-8"))
        errors.extend(validate_schema(record, path))
        if record.get("id") != record_id:
            errors.append(f"{path}: filename and permanent ULID differ")
            continue
        if status == "M":
            try:
                old_record = _git_json(base_ref, path)
            except subprocess.CalledProcessError:
                old_record = None
            if old_record and old_record.get("id") != record.get("id"):
                errors.append(f"{path}: an existing place ULID may not be reassigned")
        touched_ids.add(record_id)
        eligibility = classify_place(record)
        if eligibility["classification"] == "confirmed_private_residential":
            errors.append(f"{path}: clearly private residential places cannot be added or edited in public source data")
        elif not eligibility["eligible_for_public_map"]:
            if not _is_safe_withheld_placeholder(record):
                errors.append(f"{path}: uncertain places must contain only the privacy-safe placeholder; send identifying evidence privately to maintainers")
            else:
                warnings.append((path, f"Withheld place {record_id} remains out of the map pending maintainer review."))

    for record_id in removed_ids:
        if record_id in aliases:
            target = places.resolve_place_id(record_id, aliases)
            if target not in active_by_id:
                errors.append(f"Deleted place {record_id} alias does not resolve to an active canonical place")
    errors.extend(validate_alias_changes(base_ref, aliases, set(removed_ids)))

    records_by_id = {record["id"]: record for record in records}
    paths_by_id = {path.stem: str(path.relative_to(ROOT))
                   for path in sorted((ROOT / "data/places").glob("*/*.json"))
                   if path.name != "aliases.json"}
    duplicate_pairs = {tuple(sorted(pair)) for pair in exact_pairs}
    for record_id in sorted(touched_ids):
        record = records_by_id.get(record_id)
        if not record:
            continue
        for other_id in duplicate_candidates(record, records):
            pair = tuple(sorted((record_id, other_id)))
            duplicate_pairs.add(pair)
            warnings.append((paths_by_id.get(record_id, f"data/places/{record_id}.json"),
                             f"Possible nearby same-name place candidate involving IDs {pair[0]} and {pair[1]}; maintainer review required, no automatic merge."))

    if errors:
        raise ValueError("\n".join(errors))

    # Build and check the exact public output. Existing withheld records remain in
    # source storage with null coordinates and can never enter this feature list.
    places.build()
    collection = json.loads((places.GENERATED / "kattankudy.mzp").read_text(encoding="utf-8"))
    mzp_bytes = (places.GENERATED / "kattankudy.mzp").read_bytes()
    manifest = json.loads((places.GENERATED / "manifest.json").read_text(encoding="utf-8"))
    expected_ids = {r["id"] for r in records if r.get("coordinates") is not None
                    and classify_place(r)["eligible_for_public_map"]}
    actual_ids = {f.get("id") for f in collection.get("features", [])}
    if collection.get("type") != "FeatureCollection" or actual_ids != expected_ids or len(actual_ids) != len(collection.get("features", [])):
        raise ValueError("Generated MZP features do not match eligible, geocoded source records")
    if (manifest.get("features") != len(actual_ids) or manifest.get("sha256") != hashlib.sha256(mzp_bytes).hexdigest()
            or manifest.get("bytes") != len(mzp_bytes) or manifest.get("aliases") != {
        key: places.resolve_place_id(key, aliases) for key in aliases
    }):
        raise ValueError("Generated place manifest does not match the source records and aliases")
    withheld_count = sum(not classify_place(r)["eligible_for_public_map"] for r in records)
    if manifest.get("withheld_pending_public_eligibility_review") != withheld_count:
        raise ValueError("Generated manifest eligibility count does not match source records")

    for path, message in warnings:
        print(f"::warning file={path},title=Place review required::{message}")
    return {
        "changed_place_files": len([1 for _, p in changed if p != "data/places/aliases.json"]),
        "touched_place_ids": len(touched_ids),
        "removed_ids_with_aliases": len(removed_ids),
        "shards": shard_counts,
        "active_records": len(records),
        "alias_count": len(aliases),
        "duplicate_candidate_pairs_reviewed": len(duplicate_pairs),
        "review_warnings": len(warnings),
        "withheld_records": withheld_count,
        "generated_mzp_features": len(actual_ids),
        "manifest_consistent": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-ref", required=True, help="base commit SHA from the pull request event")
    parser.add_argument("--head-ref", required=True, help="contributor head commit SHA from the pull request event")
    args = parser.parse_args()
    try:
        print(json.dumps(validate_changes(args.base_ref, args.head_ref), indent=2))
    except (OSError, json.JSONDecodeError, subprocess.CalledProcessError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
