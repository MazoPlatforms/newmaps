#!/usr/bin/env python3
"""Migrate, validate, allocate and build Kattankudy road data."""
import argparse
import hashlib
import json
import math
import os
import re
import sys
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path

from places import ULID, new_ulid

ROOT = Path(__file__).resolve().parents[1]
ROAD_ROOT = ROOT / "data" / "roads"
SOURCE = ROAD_ROOT / "kattankudy.json"
MAPPING = ROAD_ROOT / "road-migration-map.json"
EXCLUSIONS = ROAD_ROOT / "road-exclusions.json"
GENERATED = ROOT / "generated"
SHARD_LIMIT = 999
SCHEMA_VERSION = 1

try:
    import fcntl
except ImportError:  # pragma: no cover - GitHub Actions and Android/Linux use fcntl
    fcntl = None


@contextmanager
def allocation_lock(road_root):
    """Serialize local allocation/migration writers; CI also validates merged shard capacity."""
    if fcntl is None:
        yield
        return
    key = hashlib.sha256(str(Path(road_root).resolve()).encode()).hexdigest()[:16]
    lock_path = Path(tempfile.gettempdir()) / f"mazo-roads-{key}.lock"
    with lock_path.open("a+") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def json_bytes(value, *, pretty=False):
    if pretty:
        return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def atomic_json(path, value, *, pretty=True):
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json_bytes(value, pretty=pretty)
    if path.exists() and path.read_bytes() == payload:
        return
    temp = path.with_name(path.name + f".{os.getpid()}.tmp")
    temp.write_bytes(payload)
    temp.replace(path)


def road_files(road_root=ROAD_ROOT):
    if not road_root.exists():
        return []
    return sorted(
        p for shard in road_root.iterdir() if shard.is_dir()
        and re.fullmatch(r"\d{4,}", shard.name)
        for p in shard.glob("*.json") if p.is_file()
    )


def shard_dirs(road_root=ROAD_ROOT):
    if not road_root.exists():
        return []
    return sorted(
        (p for p in road_root.iterdir() if p.is_dir()),
        key=lambda p: (int(p.name) if p.name.isdigit() else 10**12, p.name),
    )


def shard_file_count(shard):
    return sum(1 for p in shard.glob("*.json") if p.is_file())


def next_shard(road_root=ROAD_ROOT):
    shards = shard_dirs(road_root)
    for shard in shards:
        if not re.fullmatch(r"\d{4,}", shard.name):
            raise ValueError(f"Invalid road shard directory: {shard}")
        if shard_file_count(shard) < SHARD_LIMIT:
            return shard
    number = max((int(p.name) for p in shards if p.name.isdigit()), default=0) + 1
    return road_root / f"{number:04d}"


def allocate_path(road_root, repository_root, used_ids):
    for _ in range(100):
        identifier = new_ulid()
        if identifier not in used_ids:
            shard = next_shard(road_root)
            shard.mkdir(parents=True, exist_ok=True)
            path = shard / f"{identifier}.json"
            if not path.exists():
                return identifier, path, path.relative_to(repository_root).as_posix()
    raise RuntimeError("Unable to allocate a unique road ULID after 100 attempts")


def geometry_error(coordinates):
    if not isinstance(coordinates, list) or len(coordinates) < 2:
        return "LineString must contain at least two positions"
    for index, position in enumerate(coordinates):
        if not isinstance(position, list) or len(position) != 2:
            return f"position {index} must be [longitude, latitude]"
        lon, lat = position
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in position):
            return f"position {index} contains a non-finite or non-numeric coordinate"
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            return f"position {index} is outside longitude/latitude bounds"
    return None


def record_hash(source_record):
    canonical = json.dumps(source_record, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def load_records(road_root=ROAD_ROOT):
    records = []
    ids, source_ids = set(), set()
    counts = {}
    for shard in shard_dirs(road_root):
        if not re.fullmatch(r"\d{4,}", shard.name):
            raise ValueError(f"Invalid road shard directory: {shard}")
        files = sorted(p for p in shard.glob("*.json") if p.is_file())
        counts[shard.name] = len(files)
        if len(files) > SHARD_LIMIT:
            raise ValueError(f"{shard} contains {len(files)} JSON files; limit is {SHARD_LIMIT}")
        for path in files:
            record = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(record, dict):
                raise ValueError(f"{path}: road must be a JSON object")
            identifier, source_id = record.get("id"), record.get("source_id")
            if not isinstance(identifier, str) or not ULID.fullmatch(identifier):
                raise ValueError(f"{path}: invalid 26-character ULID")
            if path.stem != identifier:
                raise ValueError(f"{path}: filename must match the ULID")
            if identifier in ids:
                raise ValueError(f"Duplicate road ULID: {identifier}")
            if not isinstance(source_id, str) or not source_id:
                raise ValueError(f"{path}: source_id is required")
            if source_id in source_ids:
                raise ValueError(f"Duplicate road source_id: {source_id}")
            if not (record.get("name") is None or isinstance(record.get("name"), str)):
                raise ValueError(f"{path}: name must be a string or null")
            if not isinstance(record.get("type"), str) or not record["type"].strip():
                raise ValueError(f"{path}: type must be a non-empty string")
            ids.add(identifier)
            source_ids.add(source_id)
            records.append(record)
    return records, counts


def read_mapping(mapping_path=MAPPING):
    if not mapping_path.exists():
        return {"schema_version": SCHEMA_VERSION, "records": []}
    mapping = json.loads(mapping_path.read_text(encoding="utf-8"))
    if not isinstance(mapping, dict):
        raise ValueError(f"{mapping_path}: invalid road migration mapping")
    if isinstance(mapping.get("records"), list):  # Backward-compatible single-file map.
        return mapping
    parts = mapping.get("mapping_parts")
    if not isinstance(parts, list) or not isinstance(mapping.get("records_count"), int):
        raise ValueError(f"{mapping_path}: invalid road migration mapping")
    records = []
    for relative in parts:
        part_path = mapping_path.parent / relative
        payload = json.loads(part_path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict) or not isinstance(payload.get("records"), list):
            raise ValueError(f"{part_path}: invalid road migration map partition")
        records.extend(payload["records"])
    if len(records) != mapping["records_count"]:
        raise ValueError(f"{mapping_path}: mapping partition count mismatch")
    mapping["records"] = records
    return mapping


def write_mapping(mapping, mapping_path):
    """Write a compact manifest and bounded-size shard partitions deterministically."""
    rows = sorted(mapping.get("records", []), key=lambda row: row["source_id"])
    by_shard = {}
    for row in rows:
        parts = Path(row["path"]).parts
        if len(parts) < 3 or not re.fullmatch(r"\d{4,}", parts[2]):
            raise ValueError(f"Invalid shard path in road migration mapping: {row['path']}")
        by_shard.setdefault(parts[2], []).append(row)
    parts = []
    for shard, shard_rows in sorted(by_shard.items()):
        name = f"road-migration-map-{shard}.json"
        atomic_json(mapping_path.parent / name, {"records": shard_rows}, pretty=False)
        parts.append(name)
    for old in mapping_path.parent.glob("road-migration-map-*.json"):
        if old.name not in parts:
            old.unlink()
    manifest = {key: value for key, value in mapping.items() if key != "records"}
    manifest["records_count"] = len(rows)
    manifest["mapping_parts"] = parts
    atomic_json(mapping_path, manifest, pretty=True)


def _migrate_locked(source_path=SOURCE, repository_root=ROOT):
    source_path = Path(source_path)
    if not source_path.is_file():
        raise ValueError(f"Road source file not found: {source_path}")
    road_root = repository_root / "data" / "roads"
    mapping_path = road_root / "road-migration-map.json"
    exclusions_path = road_root / "road-exclusions.json"
    raw = source_path.read_bytes()
    payload = json.loads(raw)
    if not isinstance(payload, dict) or not isinstance(payload.get("roads"), list):
        raise ValueError("Road source must contain a roads array")
    source_roads = payload["roads"]
    if payload.get("count") != len(source_roads):
        raise ValueError("Source count does not match roads array")

    source_ids = [r.get("id") if isinstance(r, dict) else None for r in source_roads]
    if any(not isinstance(source_id, str) or not source_id for source_id in source_ids):
        raise ValueError("Every source road must have a non-empty original id")
    if len(source_ids) != len(set(source_ids)):
        raise ValueError("Duplicate original road source IDs found; refusing migration")

    previous = read_mapping(mapping_path)
    previous_rows = previous["records"]
    by_source = {}
    used_ids = set()
    for row in previous_rows:
        sid, identifier = row.get("source_id"), row.get("id")
        if not sid or not isinstance(identifier, str) or not ULID.fullmatch(identifier):
            raise ValueError("Existing road mapping contains an invalid source ID or ULID")
        if sid in by_source or identifier in used_ids:
            raise ValueError("Existing road mapping contains duplicate source IDs or ULIDs")
        by_source[sid] = row
        used_ids.add(identifier)

    existing, _ = load_records(road_root)
    by_existing_source = {r["source_id"]: r for r in existing}
    if len(by_existing_source) != len(existing):
        raise ValueError("Existing road records contain duplicate source IDs")
    for record in existing:
        used_ids.add(record["id"])

    mapping_rows = dict(by_source)
    written = 0
    for source_record in source_roads:
        source_id = source_record["id"]
        old_row = by_source.get(source_id)
        old_record = by_existing_source.get(source_id)
        if old_row:
            identifier = old_row["id"]
            relative = old_row.get("path")
            target = repository_root / relative if relative else None
        elif old_record:
            identifier = old_record["id"]
            target = next((p for p in road_files(road_root) if p.name == identifier + ".json"), None)
            relative = target.relative_to(repository_root).as_posix() if target else None
        else:
            identifier = None
            target = None
            relative = None

        if target is not None and target.exists():
            existing_record = json.loads(target.read_text(encoding="utf-8"))
            if existing_record.get("id") != identifier or existing_record.get("source_id") != source_id:
                raise ValueError(f"Refusing to overwrite unrelated road record at {target}")
        if target is None or (not target.exists() and shard_file_count(target.parent) >= SHARD_LIMIT):
            if identifier is None:
                identifier, target, relative = allocate_path(road_root, repository_root, used_ids)
                used_ids.add(identifier)
            else:
                shard = next_shard(road_root)
                shard.mkdir(parents=True, exist_ok=True)
                target = shard / f"{identifier}.json"
                relative = target.relative_to(repository_root).as_posix()

        migrated = {"id": identifier, "source_id": source_id}
        migrated.update({k: v for k, v in source_record.items() if k != "id"})
        # Overture refreshes update source-derived fields, but PR #5's independent
        # maxspeed evidence must survive when the same source road is re-migrated.
        if target.exists():
            previous_record = json.loads(target.read_text(encoding="utf-8"))
            supplementary = previous_record.get("supplementary_maxspeed_evidence")
            if supplementary is not None:
                migrated["supplementary_maxspeed_evidence"] = supplementary
        if not target.exists() or json.loads(target.read_text(encoding="utf-8")) != migrated:
            atomic_json(target, migrated)
            written += 1

        original_hash = record_hash(source_record)
        mapping_rows[source_id] = {
            "source_id": source_id,
            "id": identifier,
            "path": relative,
            "source_record_sha256": original_hash,
        }

    records, shard_counts = load_records(road_root)
    exclusions = [
        {"id": r["id"], "source_id": r["source_id"], "reason": geometry_error(r.get("coordinates"))}
        for r in records if geometry_error(r.get("coordinates"))
    ]
    metadata = {k: v for k, v in payload.items() if k not in {"roads", "count"}}
    mapping = {
        "schema_version": SCHEMA_VERSION,
        "source_file": source_path.name,
        "source_sha256": hashlib.sha256(raw).hexdigest(),
        "source_count": len(source_roads),
        "source_metadata": metadata,
        "records": sorted(mapping_rows.values(), key=lambda row: row["source_id"]),
    }
    write_mapping(mapping, mapping_path)
    atomic_json(exclusions_path, exclusions)
    result = {"source_roads": len(source_roads), "migrated_records": len(records), "written_or_updated": written,
              "shards": shard_counts, "exclusions": len(exclusions), "mapping": mapping_path.relative_to(repository_root).as_posix()}
    print(json.dumps(result, indent=2))
    return result


def migrate(source_path=SOURCE, repository_root=ROOT):
    road_root = Path(repository_root) / "data" / "roads"
    with allocation_lock(road_root):
        return _migrate_locked(source_path, repository_root)


def validate(repository_root=ROOT):
    road_root = repository_root / "data" / "roads"
    mapping_path = road_root / "road-migration-map.json"
    exclusions_path = road_root / "road-exclusions.json"
    mapping = read_mapping(mapping_path)
    records, counts = load_records(road_root)
    path_by_id = {path.stem: path for path in road_files(road_root)}
    rows = mapping["records"]
    if len(rows) != len(records):
        raise ValueError(f"Mapping has {len(rows)} rows but road tree has {len(records)} records")
    by_id = {r["id"]: r for r in records}
    by_source = {r["source_id"]: r for r in records}
    mapped_ids, mapped_sources = set(), set()
    for row in rows:
        identifier, source_id = row["id"], row["source_id"]
        if identifier in mapped_ids or source_id in mapped_sources:
            raise ValueError("Duplicate ID or source ID in road migration mapping")
        mapped_ids.add(identifier)
        mapped_sources.add(source_id)
        record = by_id.get(identifier)
        if not record or record["source_id"] != source_id:
            raise ValueError(f"Mapping does not resolve to a matching record: {source_id}")
        expected_path = repository_root / row["path"]
        actual = path_by_id.get(identifier)
        if actual is None or actual != expected_path:
            raise ValueError(f"Mapping path mismatch for {source_id}")
        reconstructed = {"id": source_id, **{k: v for k, v in record.items() if k not in {"id", "source_id", "supplementary_maxspeed_evidence"}}}
        if record_hash(reconstructed) != row.get("source_record_sha256"):
            raise ValueError(f"Source field checksum mismatch for {source_id}")

    expected_exclusions = [
        {"id": r["id"], "source_id": r["source_id"], "reason": geometry_error(r.get("coordinates"))}
        for r in records if geometry_error(r.get("coordinates"))
    ]
    actual_exclusions = json.loads(exclusions_path.read_text(encoding="utf-8")) if exclusions_path.exists() else []
    if actual_exclusions != expected_exclusions:
        raise ValueError("Road exclusions report is missing, stale, or contains undocumented records")

    if SOURCE.exists() and repository_root == ROOT:
        source = json.loads(SOURCE.read_text(encoding="utf-8"))
        if len(source.get("roads", [])) != mapping.get("source_count"):
            raise ValueError("Source count differs from the migration mapping")
        for original in source["roads"]:
            road = by_source.get(original["id"])
            if not road:
                raise ValueError(f"Source road missing after migration: {original['id']}")
            reconstructed = {"id": road["source_id"], **{k: v for k, v in road.items() if k not in {"id", "source_id", "supplementary_maxspeed_evidence"}}}
            if reconstructed != original:
                raise ValueError(f"Field-by-field source mismatch for {original['id']}")
    names = [p.name for p in shard_dirs(road_root)]
    if names != [f"{i:04d}" for i in range(1, len(names) + 1)]:
        raise ValueError("Road shard directories must be sequential starting at 0001")
    return {"records": len(records), "source_count": mapping.get("source_count"), "shards": counts,
            "valid_features": len(records) - len(actual_exclusions), "exclusions": actual_exclusions}


def feature(record):
    return {
        "type": "Feature",
        "id": record["id"],
        "geometry": {"type": "LineString", "coordinates": record["coordinates"]},
        "properties": {k: v for k, v in record.items() if k not in {"id", "coordinates"}},
    }


def build(repository_root=ROOT, output_dir=None):
    summary = validate(repository_root)
    road_root = repository_root / "data" / "roads"
    mapping = read_mapping(road_root / "road-migration-map.json")
    records, counts = load_records(road_root)
    exclusions = json.loads((road_root / "road-exclusions.json").read_text(encoding="utf-8"))
    excluded_ids = {row["id"] for row in exclusions}
    features = [feature(r) for r in sorted(records, key=lambda item: item["id"]) if r["id"] not in excluded_ids]
    body = json_bytes({"type": "FeatureCollection", "features": features})
    target_dir = Path(output_dir) if output_dir is not None else repository_root / "generated"
    target_dir.mkdir(parents=True, exist_ok=True)
    output = target_dir / "kattankudy-roads.mzp"
    output.write_bytes(body)
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "format": "MZP/1",
        "geojson": "kattankudy-roads.mzp",
        "source_file": mapping.get("source_file"),
        "source_sha256": mapping.get("source_sha256"),
        "total_source_roads": mapping.get("source_count"),
        "total_migrated_records": len(records),
        "valid_geographic_features": len(features),
        "excluded_records": exclusions,
        "shards": counts,
        "bytes": len(body),
        "sha256": hashlib.sha256(body).hexdigest(),
    }
    audit_path = road_root / "supplementary-road-audit.json"
    if audit_path.exists():
        audit = json.loads(audit_path.read_text(encoding="utf-8"))
        manifest["supplementary_roads"] = {"source_file": audit["source_file"], "source_sha256": audit["source_sha256"],
            "source_records": audit["source_records"], "source_records_with_maxspeed": audit["source_records_with_maxspeed"],
            "matched_roads": audit["matched_roads"], "tagged_matches": audit["tagged_matches"],
            "new_roads_added": audit["new_roads_added"], "audit": "data/roads/supplementary-road-audit.json"}
    (target_dir / "kattankudy-roads-manifest.json").write_bytes(json_bytes(manifest, pretty=True))
    print(json.dumps({"features": len(features), "excluded": len(exclusions), "bytes": len(body), "sha256": manifest["sha256"], "shards": counts}, indent=2))
    return manifest


def _add_locked(record_path, repository_root=ROOT):
    road_root = repository_root / "data" / "roads"
    record = json.loads(Path(record_path).read_text(encoding="utf-8"))
    if not isinstance(record, dict):
        raise ValueError("New road must be a JSON object")
    if "id" in record:
        raise ValueError("New road must not provide an internal id")
    if not isinstance(record.get("source_id"), str) or not record["source_id"]:
        raise ValueError("New road requires source_id")
    if geometry_error(record.get("coordinates")):
        raise ValueError("New road must have a valid LineString geometry")
    existing, _ = load_records(road_root)
    if any(r["source_id"] == record["source_id"] for r in existing):
        raise ValueError(f"Road source_id already exists: {record['source_id']}")
    used_ids = {r["id"] for r in existing}
    identifier, path, relative = allocate_path(road_root, repository_root, used_ids)
    record = {"id": identifier, **record}
    atomic_json(path, record)
    mapping_path = road_root / "road-migration-map.json"
    mapping = read_mapping(mapping_path)
    source_original = {"id": record["source_id"], **{k: v for k, v in record.items() if k not in {"id", "source_id"}}}
    mapping["records"].append({"source_id": record["source_id"], "id": identifier, "path": relative,
                               "source_record_sha256": record_hash(source_original)})
    mapping["records"].sort(key=lambda row: row["source_id"])
    write_mapping(mapping, mapping_path)
    print(relative)
    return path


def add(record_path, repository_root=ROOT):
    road_root = Path(repository_root) / "data" / "roads"
    with allocation_lock(road_root):
        return _add_locked(record_path, repository_root)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    m = sub.add_parser("migrate", help="Migrate a combined Overture road JSON file")
    m.add_argument("source", nargs="?", type=Path, default=SOURCE)
    sub.add_parser("validate", help="Validate road records, mapping and exclusions")
    sub.add_parser("build", help="Generate the roads GeoJSON MZP and manifest")
    a = sub.add_parser("add", help="Allocate a new road JSON record")
    a.add_argument("record", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "migrate":
            migrate(args.source)
        elif args.command == "validate":
            print(json.dumps(validate(), indent=2))
        elif args.command == "build":
            build()
        elif args.command == "add":
            add(args.record)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
