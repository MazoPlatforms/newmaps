#!/usr/bin/env python3
"""Migrate, validate, shard, and build Kattankudy speed-limit data."""
import argparse
import gzip
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

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SPEED_ROOT = DATA / "speed-limits"
SOURCE = SPEED_ROOT / "kattankudy.json"
MAPPING = SPEED_ROOT / "speed-limit-migration-map.json"
SCHEMA = DATA / "speed-limit.schema.json"
GENERATED = ROOT / "generated"
SHARD_LIMIT = 999
SCHEMA_VERSION = 1
ULID = re.compile(r"^[0-7][0-9A-HJKMNP-TV-Z]{25}$")
sys.path.insert(0, str(ROOT / "scripts"))
import places
import roads

try:
    import fcntl
except ImportError:  # pragma: no cover
    fcntl = None


@contextmanager
def allocation_lock():
    if fcntl is None:
        yield
        return
    key = hashlib.sha256(str(SPEED_ROOT.resolve()).encode()).hexdigest()[:16]
    with (Path(tempfile.gettempdir()) / f"mazo-speed-limits-{key}.lock").open("a+") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def json_bytes(value, pretty=False):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode() if pretty else json.dumps(
        value, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode()


def atomic_json(path, value, pretty=True):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    body = json_bytes(value, pretty)
    if path.exists() and path.read_bytes() == body:
        return
    tmp = path.with_name(path.name + f".{os.getpid()}.tmp")
    tmp.write_bytes(body)
    tmp.replace(path)


def record_files(root=SPEED_ROOT):
    return sorted(p for d in root.iterdir() if d.is_dir() and re.fullmatch(r"\d{4,}", d.name)
                  for p in d.glob("*.json") if p.is_file()) if root.exists() else []


def shard_dirs(root=SPEED_ROOT):
    return sorted((p for p in root.iterdir() if p.is_dir() and re.fullmatch(r"\d{4,}", p.name)),
                  key=lambda p: int(p.name)) if root.exists() else []


def next_shard(root=SPEED_ROOT):
    dirs = shard_dirs(root)
    for directory in dirs:
        count = sum(1 for p in directory.glob("*.json") if p.is_file())
        if count < SHARD_LIMIT:
            return directory
    return root / f"{max((int(d.name) for d in dirs), default=0) + 1:04d}"


def allocate_path(root=SPEED_ROOT, used_ids=None):
    used_ids = used_ids or set()
    for _ in range(100):
        identifier = places.new_ulid()
        if identifier in used_ids:
            continue
        directory = next_shard(root)
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{identifier}.json"
        if not path.exists():
            return identifier, path
    raise RuntimeError("Unable to allocate a unique speed-limit ULID after 100 attempts")


def record_hash(value):
    return hashlib.sha256(json_bytes(value)).hexdigest()


def source_payload(source_path=SOURCE):
    raw = Path(source_path).read_bytes()
    payload = json.loads(raw)
    if not isinstance(payload, dict) or not isinstance(payload.get("segments"), list):
        raise ValueError("Speed-limit source must contain a segments array")
    return raw, payload


def load_mapping(mapping_path=MAPPING):
    if not mapping_path.exists():
        return {"schema_version": SCHEMA_VERSION, "records_count": 0, "mapping_parts": [], "records": []}
    value = json.loads(mapping_path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or not isinstance(value.get("mapping_parts"), list):
        raise ValueError(f"{mapping_path}: invalid speed-limit migration map")
    rows = []
    for name in value["mapping_parts"]:
        part = json.loads((mapping_path.parent / name).read_text(encoding="utf-8"))
        if not isinstance(part, dict) or not isinstance(part.get("records"), list):
            raise ValueError(f"{name}: invalid mapping partition")
        rows.extend(part["records"])
    if len(rows) != value.get("records_count"):
        raise ValueError("Speed-limit mapping partition count mismatch")
    value["records"] = rows
    return value


def write_mapping(mapping, mapping_path=MAPPING):
    rows = sorted(mapping.get("records", []), key=lambda r: r["source_id"])
    by_shard = {}
    for row in rows:
        parts = Path(row["path"]).parts
        if len(parts) != 4 or parts[0:2] != ("data", "speed-limits") or not re.fullmatch(r"\d{4,}", parts[2]):
            raise ValueError(f"Invalid speed-limit mapping path: {row['path']}")
        by_shard.setdefault(parts[2], []).append(row)
    names = []
    for shard, shard_rows in sorted(by_shard.items()):
        name = f"speed-limit-migration-map-{shard}.json"
        if len(shard_rows) > SHARD_LIMIT:
            raise ValueError(f"{name} exceeds {SHARD_LIMIT} rows")
        atomic_json(mapping_path.parent / name, {"records": shard_rows}, pretty=False)
        names.append(name)
    for old in mapping_path.parent.glob("speed-limit-migration-map-*.json"):
        if old.name not in names:
            old.unlink()
    result = {k: v for k, v in mapping.items() if k != "records"}
    result["records_count"] = len(rows)
    result["mapping_parts"] = names
    atomic_json(mapping_path, result)
    return result


def road_index(repository_root=ROOT):
    road_root = Path(repository_root) / "data" / "roads"
    road_map = roads.read_mapping(road_root / "road-migration-map.json")
    by_source = {row["source_id"]: row for row in road_map.get("records", [])}
    records, _ = roads.load_records(road_root)
    by_ulid = {record["id"]: record for record in records}
    return by_source, by_ulid


def make_record(original, road_row):
    source_id = original.get("road_id")
    if not isinstance(source_id, str) or not source_id:
        raise ValueError("Each speed-limit source segment requires road_id")
    return {"id": None, "source_id": source_id, "road_ref": road_row["id"], **original}


def migrate(repository_root=ROOT, source_path=None):
    repository_root = Path(repository_root)
    source_path = Path(source_path) if source_path else repository_root / "data" / "speed-limits" / "kattankudy.json"
    with allocation_lock():
        raw, payload = source_payload(source_path)
        source_rows = payload["segments"]
        road_by_source, _ = road_index(repository_root)
        mapping_path = repository_root / "data" / "speed-limits" / "speed-limit-migration-map.json"
        mapping = load_mapping(mapping_path)
        existing = {r["source_id"]: r for r in mapping["records"]}
        used = {r["id"] for r in mapping["records"]}
        row_by_source = {r.get("road_id"): r for r in source_rows}
        if len(row_by_source) != len(source_rows):
            raise ValueError("Duplicate source road_id in speed-limit source")
        for original in source_rows:
            source_id = original["road_id"]
            road_row = road_by_source.get(source_id)
            if not road_row:
                raise ValueError(f"Unresolved road relationship: {source_id}")
            old = existing.get(source_id)
            if old:
                path = repository_root / old["path"]
                record = json.loads(path.read_text(encoding="utf-8"))
                expected = {k: v for k, v in record.items() if k not in {"id", "source_id", "road_ref", "supplementary_maxspeed_evidence"}}
                if old["id"] != record.get("id") or expected != original or record.get("road_ref") != road_row["id"]:
                    raise ValueError(f"Existing migrated record differs from source: {source_id}")
                continue
            identifier = places.new_ulid()
            while identifier in used:
                identifier = places.new_ulid()
            used.add(identifier)
            directory = next_shard(repository_root / "data" / "speed-limits")
            directory.mkdir(parents=True, exist_ok=True)
            path = directory / f"{identifier}.json"
            record = {"id": identifier, "source_id": source_id, "road_ref": road_row["id"], **original}
            atomic_json(path, record)
            relative = path.relative_to(repository_root).as_posix()
            mapping["records"].append({
                "source_id": source_id, "id": identifier, "road_id": source_id,
                "road_ref": road_row["id"], "path": relative, "source_record_sha256": record_hash(original)
            })
        metadata = {k: v for k, v in payload.items() if k != "segments"}
        mapping.update({
            "schema_version": SCHEMA_VERSION, "format": "MazoSpeedLimits/1",
            "source_file": source_path.relative_to(repository_root).as_posix(),
            "source_sha256": hashlib.sha256(raw).hexdigest(),
            "source_count": len(source_rows), "source_metadata": metadata,
        })
        write_mapping(mapping, mapping_path)
    print(json.dumps({"migrated": len(mapping["records"]), "source": len(source_rows),
                      "source_sha256": mapping["source_sha256"], "mapping_parts": mapping["mapping_parts"]}, indent=2))
    return mapping


def load_records(root=SPEED_ROOT):
    records, counts, ids, sources = [], {}, set(), set()
    dirs = shard_dirs(root)
    if dirs and [d.name for d in dirs] != [f"{i:04d}" for i in range(1, len(dirs) + 1)]:
        raise ValueError("Speed-limit shard directories must be sequential from 0001")
    for directory in dirs:
        files = sorted(p for p in directory.glob("*.json") if p.is_file())
        counts[directory.name] = len(files)
        if len(files) > SHARD_LIMIT:
            raise ValueError(f"{directory.name} exceeds {SHARD_LIMIT} JSON records")
        for path in files:
            record = json.loads(path.read_text(encoding="utf-8"))
            identifier = record.get("id")
            if not isinstance(identifier, str) or not ULID.fullmatch(identifier) or path.stem != identifier:
                raise ValueError(f"{path}: invalid ULID or filename mismatch")
            if identifier in ids:
                raise ValueError(f"Duplicate speed-limit ULID: {identifier}")
            source_id = record.get("source_id")
            if not isinstance(source_id, str) or not source_id or source_id in sources:
                raise ValueError(f"{path}: missing or duplicate source_id")
            if record.get("road_id") != source_id:
                raise ValueError(f"{path}: road_id must preserve source_id")
            required = {"road_name", "road_type", "classification", "legal_default_candidate_kmh",
                        "speed_limit_kmh", "verification_status", "source"}
            missing = required - record.keys()
            if missing:
                raise ValueError(f"{path}: missing fields: {', '.join(sorted(missing))}")
            if not isinstance(record.get("road_ref"), str) or not ULID.fullmatch(record["road_ref"]):
                raise ValueError(f"{path}: invalid road_ref")
            if record["road_name"] is not None and not isinstance(record["road_name"], str):
                raise ValueError(f"{path}: road_name must be a string or null")
            for field in ("road_type", "classification", "verification_status", "source"):
                if not isinstance(record[field], str) or not record[field]:
                    raise ValueError(f"{path}: {field} must be a non-empty string")
            if "speed_limit_status" in record and record["speed_limit_status"] not in {
                "unknown", "unrestricted", "conditional", "numeric", "absent"
            }:
                raise ValueError(f"{path}: invalid speed_limit_status")
            for field in ("direction", "vehicle_type", "conditional"):
                if field in record and record[field] is not None and not isinstance(record[field], str):
                    raise ValueError(f"{path}: {field} must be a string or null")
            for field in ("legal_default_candidate_kmh", "speed_limit_kmh"):
                if field not in record:
                    continue
                value = record[field]
                if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float))
                                          or not math.isfinite(value) or value < 0):
                    raise ValueError(f"{path}: {field} must be null or a non-negative number")
            ids.add(identifier)
            sources.add(source_id)
            records.append(record)
    return records, counts


def source_compare(records, mapping, root=ROOT):
    source_path = Path(root) / "data" / "speed-limits" / "kattankudy.json"
    if not source_path.exists():
        return None
    raw, payload = source_payload(source_path)
    if hashlib.sha256(raw).hexdigest() != mapping.get("source_sha256"):
        raise ValueError("Speed-limit source SHA-256 differs from migration manifest")
    originals = {r["road_id"]: r for r in payload["segments"]}
    by_source = {r["source_id"]: r for r in records}
    if len(originals) != mapping.get("source_count") or not set(originals).issubset(by_source):
        raise ValueError("A baseline source record is missing from migrated speed-limit records")
    for source_id, original in originals.items():
        record = by_source[source_id]
        restored = {k: v for k, v in record.items() if k not in {"id", "source_id", "road_ref", "supplementary_maxspeed_evidence"}}
        if restored != original:
            raise ValueError(f"Field-by-field source mismatch for {source_id}")
    return {"sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw), "records": len(originals)}


def suspicious_duplicates(records):
    groups = {}
    for record in records:
        key = (record.get("road_ref"), record.get("speed_limit_kmh"),
               record.get("legal_default_candidate_kmh"), record.get("direction"),
               record.get("vehicle_type"), record.get("conditional"))
        groups.setdefault(key, []).append(record)
    return [{"road_ref": key[0], "source_ids": sorted(r["source_id"] for r in rows)}
            for key, rows in groups.items() if len(rows) > 1]


def expected_exclusions(records, road_by_ulid, road_exclusions):
    excluded = {r["id"]: r for r in road_exclusions}
    result = []
    for record in records:
        road = road_by_ulid.get(record["road_ref"])
        if not road:
            raise ValueError(f"Unresolved internal road ULID: {record['road_ref']}")
        if road["id"] in excluded:
            result.append({"id": record["id"], "source_id": record["source_id"],
                           "reason": "linked road excluded: " + excluded[road["id"]]["reason"]})
        else:
            issue = roads.geometry_error(road.get("coordinates"))
            if issue:
                result.append({"id": record["id"], "source_id": record["source_id"],
                               "reason": "linked road geometry invalid: " + issue})
    return result


def feature(record, road):
    return {"type": "Feature", "id": record["id"],
            "geometry": {"type": "LineString", "coordinates": road["coordinates"]},
            "properties": {k: v for k, v in record.items() if k != "id"}}


def validate(repository_root=ROOT):
    repository_root = Path(repository_root)
    speed_root = repository_root / "data" / "speed-limits"
    mapping = load_mapping(speed_root / "speed-limit-migration-map.json")
    records, counts = load_records(speed_root)
    if len(records) != mapping.get("records_count") or mapping.get("source_count", 0) > len(records):
        raise ValueError("Source, mapping, and migrated speed-limit counts are inconsistent")
    map_rows = mapping["records"]
    by_map = {r["source_id"]: r for r in map_rows}
    if len(by_map) != len(map_rows) or len({r["id"] for r in map_rows}) != len(map_rows):
        raise ValueError("Duplicate source IDs or ULIDs in speed-limit migration mapping")
    by_source = {r["source_id"]: r for r in records}
    by_id = {r["id"]: r for r in records}
    if set(by_map) != set(by_source):
        raise ValueError("Every speed-limit record must have exactly one mapping entry")
    for row in map_rows:
        record = by_source.get(row["source_id"])
        if not record or record["id"] != row["id"] or record["road_ref"] != row["road_ref"]:
            raise ValueError(f"Speed-limit mapping does not resolve: {row['source_id']}")
        expected_path = (repository_root / row["path"]).resolve()
        if expected_path != (speed_root / Path(row["path"]).relative_to("data/speed-limits")).resolve():
            raise ValueError(f"Invalid speed-limit mapping path: {row['path']}")
        if not expected_path.is_file() or json.loads(expected_path.read_text()) != by_id[row["id"]]:
            raise ValueError(f"Speed-limit mapping path/content mismatch: {row['source_id']}")
        original = {k: v for k, v in record.items() if k not in {"id", "source_id", "road_ref", "supplementary_maxspeed_evidence"}}
        if record_hash(original) != row.get("source_record_sha256"):
            raise ValueError(f"Speed-limit source field checksum mismatch: {row['source_id']}")
    source_status = source_compare(records, mapping, repository_root)
    roads.validate(repository_root)
    road_by_source, road_by_ulid = road_index(repository_root)
    road_mapping = roads.read_mapping(repository_root / "data" / "roads" / "road-migration-map.json")
    if mapping["source_count"] != len(records):
        raise ValueError("Migration source count mismatch")
    unresolved = []
    for record in records:
        road_row = road_by_source.get(record["road_id"])
        if not road_row or road_row["id"] != record["road_ref"]:
            unresolved.append(record["source_id"])
    if unresolved:
        raise ValueError("Unresolved or mismatched road references: " + ", ".join(unresolved[:10]))
    suspicious = suspicious_duplicates(records)
    if mapping.get("source_metadata", {}).get("units") != "km/h":
        raise ValueError("Source speed-limit unit metadata is missing or changed")
    actual_exclusions = expected_exclusions(records, road_by_ulid,
        json.loads((repository_root / "data" / "roads" / "road-exclusions.json").read_text()))
    return {"source_records": mapping["source_count"], "migrated_records": len(records),
            "shards": counts, "valid_geographic_features": len(records) - len(actual_exclusions),
            "exclusions": actual_exclusions, "suspicious_duplicates": suspicious,
            "source_verification": source_status, "road_relationships": len(records),
            "unresolved_road_relationships": len(unresolved), "road_source_records": road_mapping["source_count"]}


def build(repository_root=ROOT, output_dir=None):
    started = time.perf_counter()
    summary = validate(repository_root)
    repository_root = Path(repository_root)
    speed_root = repository_root / "data" / "speed-limits"
    mapping = load_mapping(speed_root / "speed-limit-migration-map.json")
    records, _ = load_records(speed_root)
    _, road_by_ulid = road_index(repository_root)
    road_exclusions = json.loads((repository_root / "data" / "roads" / "road-exclusions.json").read_text())
    exclusions = expected_exclusions(records, road_by_ulid, road_exclusions)
    excluded_ids = {row["id"] for row in exclusions}
    features = [feature(record, road_by_ulid[record["road_ref"]])
                for record in sorted(records, key=lambda r: r["id"]) if record["id"] not in excluded_ids]
    body = json_bytes({"type": "FeatureCollection", "features": features})
    target = Path(output_dir) if output_dir is not None else repository_root / "generated"
    target.mkdir(parents=True, exist_ok=True)
    output = target / "kattankudy-speed-limits.mzp"
    output.write_bytes(body)
    elapsed_ms = round((time.perf_counter() - started) * 1000, 3)
    source_path = repository_root / "data" / "speed-limits" / "kattankudy.json"
    source_raw = source_path.read_bytes() if source_path.exists() else b""
    source_parse_started = time.perf_counter()
    if source_raw:
        json.loads(source_raw)
    source_parse_ms = round((time.perf_counter() - source_parse_started) * 1000, 3)
    mzp_parse_started = time.perf_counter()
    parsed_geojson = json.loads(body)
    mzp_parse_ms = round((time.perf_counter() - mzp_parse_started) * 1000, 3)
    if parsed_geojson.get("type") != "FeatureCollection" or len(parsed_geojson.get("features", [])) != len(features):
        raise ValueError("Generated speed-limit MZP failed its GeoJSON parse/count check")
    record_payload = b"\n".join(json_bytes(record, pretty=True) for record in records)
    road_mzp_path = repository_root / "generated" / "kattankudy-roads.mzp"
    road_mzp_raw = road_mzp_path.read_bytes() if road_mzp_path.exists() else b""
    road_mzp_gzip = len(gzip.compress(road_mzp_raw, mtime=0)) if road_mzp_raw else None
    legacy_total_raw = len(source_raw) + len(road_mzp_raw) if source_raw and road_mzp_raw else None
    legacy_total_gzip = len(gzip.compress(source_raw, mtime=0)) + road_mzp_gzip if source_raw and road_mzp_raw else None
    record_payload = b"\n".join(json_bytes(record, pretty=True) for record in records)
    manifest = {
        "schema_version": SCHEMA_VERSION, "format": "MZP/1", "geojson": output.name,
        "source_file": mapping["source_file"], "source_sha256": mapping["source_sha256"],
        "source_metadata": mapping["source_metadata"], "total_source_records": summary["source_records"],
        "total_migrated_records": summary["migrated_records"],
        "valid_geographic_features": len(features), "excluded_records": exclusions,
        "suspicious_duplicates": summary["suspicious_duplicates"], "shards": summary["shards"],
        "source_to_ulid_mapping": {"manifest": "data/speed-limits/speed-limit-migration-map.json",
                                   "parts": mapping["mapping_parts"]},
        "bytes": len(body), "gzip_bytes": len(gzip.compress(body, mtime=0)),
        "migrated_record_bytes": len(record_payload),
        "migrated_record_gzip_bytes": len(gzip.compress(record_payload, mtime=0)),
        "source_bytes": len(source_raw) if source_raw else None,
        "source_gzip_bytes": len(gzip.compress(source_raw, mtime=0)) if source_raw else None,
        "speed_dataset_fetch_requests_before": 2, "speed_dataset_fetch_requests_after": 1,
        "legacy_speed_loader_total_raw_bytes": legacy_total_raw,
        "legacy_speed_loader_total_gzip_bytes": legacy_total_gzip,
        "legacy_road_mzp_bytes": len(road_mzp_raw) if road_mzp_raw else None,
        "legacy_road_mzp_gzip_bytes": road_mzp_gzip,
        "benchmark_note": "Request counts cover the speed-review loader and its road-geometry dependency; Python JSON parsing is a build-time proxy, not browser timing. Base-map requests are excluded.",
        "browser_rendering_benchmark": "not measured in the GitHub Actions build environment",
        "python_source_json_parse_ms": source_parse_ms,
        "mzp_json_parse_ms": mzp_parse_ms,
        "sha256": hashlib.sha256(body).hexdigest(), "build_time_ms": elapsed_ms,
    }
    audit_path = repository_root / "data/roads/supplementary-road-audit.json"
    if audit_path.exists():
        audit = json.loads(audit_path.read_text(encoding="utf-8"))
        manifest["supplementary_maxspeed_evidence"] = {
            "source_file": audit["source_file"], "source_sha256": audit["source_sha256"],
            "source_records": audit["source_records"], "source_records_with_maxspeed": audit["source_records_with_maxspeed"],
            "matched_roads": audit["matched_roads"], "tagged_matches": audit["tagged_matches"],
            "classification": "unverified_source_tag", "unit": None,
            "road_audit": "data/roads/supplementary-road-audit.json"
        }
    atomic_json(target / "kattankudy-speed-limits-manifest.json", manifest)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return manifest




def add_record(record_path, repository_root=ROOT):
    repository_root = Path(repository_root)
    record_path = Path(record_path)
    incoming = json.loads(record_path.read_text(encoding="utf-8"))
    if not isinstance(incoming, dict) or "id" in incoming or "road_ref" in incoming:
        raise ValueError("New speed-limit record must be a JSON object without internal id or road_ref")
    source_id, road_id = incoming.get("source_id"), incoming.get("road_id")
    if not isinstance(source_id, str) or not source_id:
        raise ValueError("New speed-limit record requires its original source_id")
    if not isinstance(road_id, str) or not road_id:
        raise ValueError("New speed-limit record requires an explicit road_id")
    with allocation_lock():
        mapping_path = repository_root / "data" / "speed-limits" / "speed-limit-migration-map.json"
        mapping = load_mapping(mapping_path)
        if any(row["source_id"] == source_id for row in mapping["records"]):
            raise ValueError(f"Speed-limit source_id already exists: {source_id}")
        road_by_source, _ = road_index(repository_root)
        road_row = road_by_source.get(road_id)
        if not road_row:
            raise ValueError(f"Unresolved road_id: {road_id}")
        records, _ = load_records(repository_root / "data" / "speed-limits")
        used_ids = {record["id"] for record in records}
        identifier, path = allocate_path(repository_root / "data" / "speed-limits", used_ids)
        record = {"id": identifier, "road_ref": road_row["id"], **incoming}
        atomic_json(path, record)
        original = {k: v for k, v in record.items() if k not in {"id", "road_ref", "source_id"}}
        mapping["records"].append({
            "source_id": source_id, "id": identifier, "road_id": road_id,
            "road_ref": road_row["id"], "path": path.relative_to(repository_root).as_posix(),
            "source_record_sha256": record_hash(original)
        })
        write_mapping(mapping, mapping_path)
    print(path.relative_to(repository_root).as_posix())
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("migrate")
    sub.add_parser("validate")
    sub.add_parser("build")
    add = sub.add_parser("add")
    add.add_argument("record", type=Path)
    args = parser.parse_args()
    if args.command == "migrate":
        migrate()
    elif args.command == "validate":
        print(json.dumps(validate(), ensure_ascii=False, indent=2))
    elif args.command == "build":
        build()
    elif args.command == "add":
        add_record(args.record)


if __name__ == "__main__":
    main()
