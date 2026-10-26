#!/usr/bin/env python3
"""Apply only conservative, additive Overture road refresh changes.

Existing records are immutable in refresh runs. Source changes are written to a
review report, source omissions never delete records, and new IDs are added only
when no existing road geometry lies within the conservative review radius.
"""
import argparse
import hashlib
import json
import math
import tempfile
from pathlib import Path

from shapely.geometry import LineString
from shapely.strtree import STRtree

import roads

REPORT_NAME = "overture-refresh-report.json"
REVIEW_RADIUS_METERS = 8.0


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def metric_line(coordinates, latitude_scale):
    x_scale = 111_320.0 * math.cos(math.radians(latitude_scale))
    y_scale = 110_574.0
    return LineString([(point[0] * x_scale, point[1] * y_scale) for point in coordinates])


def _metric_records(records, latitude_scale):
    valid = []
    geometries = []
    for record in records:
        try:
            geometry = metric_line(record["coordinates"], latitude_scale)
            if not geometry.is_empty and geometry.is_valid:
                valid.append(record)
                geometries.append(geometry)
        except (KeyError, TypeError, ValueError, IndexError):
            continue
    return valid, geometries


def _nearby(candidate, existing_records, existing_geometries, tree, latitude_scale):
    if tree is None:
        return []
    geometry = metric_line(candidate["coordinates"], latitude_scale)
    indexes = tree.query(geometry.buffer(REVIEW_RADIUS_METERS))
    matches = []
    for index in indexes:
        existing_geometry = existing_geometries[int(index)]
        distance = geometry.distance(existing_geometry)
        if distance <= REVIEW_RADIUS_METERS:
            existing = existing_records[int(index)]
            matches.append({"source_id": existing["source_id"], "ulid": existing["id"],
                            "distance_meters": round(distance, 2)})
    return sorted(matches, key=lambda row: (row["distance_meters"], row["source_id"]))[:5]


def refresh(source_path, metadata_path, repository_root=roads.ROOT):
    root = Path(repository_root)
    source_path, metadata_path = Path(source_path), Path(metadata_path)
    raw = source_path.read_bytes()
    payload = json.loads(raw)
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    source_roads = payload.get("roads")
    if not isinstance(source_roads, list) or payload.get("count") != len(source_roads):
        raise ValueError("Converted Overture source count does not match its roads array")
    source_ids = [row.get("id") if isinstance(row, dict) else None for row in source_roads]
    if any(not isinstance(value, str) or not value for value in source_ids):
        raise ValueError("Every Overture road must have a source ID")
    if len(source_ids) != len(set(source_ids)):
        raise ValueError("Duplicate Overture source IDs; refusing automatic refresh")

    existing, shards = roads.load_records(root / "data/roads")
    by_source = {record["source_id"]: record for record in existing}
    if len(by_source) != len(existing):
        raise ValueError("Existing road source IDs are not unique")
    incoming_by_source = {row["id"]: row for row in source_roads}
    point_count = sum(len(row.get("coordinates", [])) for row in source_roads)
    if not point_count:
        raise ValueError("Overture source contains no coordinates")
    sampled_latitudes = [point[1] for row in source_roads
                         for point in row.get("coordinates", [])[::max(1, len(row.get("coordinates", [])) // 8 or 1)]]
    latitude_scale = sum(sampled_latitudes) / max(1, len(sampled_latitudes))
    # The local bounding box is small; its mean latitude is sufficient for metre-scale screening.
    latitude_scale = max(-89.0, min(89.0, latitude_scale))
    valid_records, geometries = _metric_records(existing, latitude_scale)
    tree = STRtree(geometries) if geometries else None

    unchanged = 0
    changed_existing = []
    ambiguous_candidates = []
    added = []
    invalid_candidates = []
    prior_path = root / "data/roads" / REPORT_NAME
    prior = json.loads(prior_path.read_text(encoding="utf-8")) if prior_path.is_file() else {}
    same_snapshot = prior.get("release") == metadata.get("release") and prior.get("source_sha256") == hashlib.sha256(raw).hexdigest()
    previous_added = {row["source_id"]: row for row in prior.get("new_records_added", [])} if same_snapshot else {}

    for row in source_roads:
        source_id = row["id"]
        old = by_source.get(source_id)
        if old:
            prior_add = previous_added.get(source_id)
            if prior_add:
                added.append(prior_add)
            fields = {key: (old.get(key), row.get(key)) for key in ("name", "type", "coordinates")
                      if canonical(old.get(key)) != canonical(row.get(key))}
            if fields:
                changed_existing.append({"source_id": source_id, "ulid": old["id"], "changed_fields": sorted(fields),
                                         "existing_values": {key: values[0] for key, values in fields.items()},
                                         "overture_values": {key: values[1] for key, values in fields.items()}})
            elif not prior_add:
                unchanged += 1
            continue

        if roads.geometry_error(row.get("coordinates")):
            invalid_candidates.append({"source_id": source_id, "reason": roads.geometry_error(row.get("coordinates"))})
            continue
        near = _nearby(row, valid_records, geometries, tree, latitude_scale)
        if near:
            ambiguous_candidates.append({"source_id": source_id, "name": row.get("name"), "type": row.get("type"),
                                         "coordinates": row["coordinates"], "reason": "existing_geometry_within_8m_review_radius",
                                         "nearby_roads": near})
            continue

        record = {"source_id": source_id, "name": row.get("name"), "type": row.get("type"),
                  "coordinates": row["coordinates"],
                  "overture_refresh_provenance": {"release": metadata.get("release"),
                                                   "source_sha256": metadata.get("sha256")}}
        with tempfile.TemporaryDirectory() as temp:
            candidate_path = Path(temp) / "road.json"
            candidate_path.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
            created = roads.add(candidate_path, root)
        created_record = json.loads(created.read_text(encoding="utf-8"))
        by_source[source_id] = created_record
        valid_records.append(created_record)
        new_geometry = metric_line(created_record["coordinates"], latitude_scale)
        geometries.append(new_geometry)
        tree = STRtree(geometries)
        added.append({"source_id": source_id, "ulid": created_record["id"],
                      "path": created.relative_to(root).as_posix()})

    absent_ids = sorted(set(by_source) - set(incoming_by_source))
    report = {
        "schema_version": 1,
        "format": "MazoOvertureRoadRefresh/1",
        "policy": "additive_only_existing_records_are_never_overwritten_or_deleted",
        "release": metadata.get("release"),
        "source": metadata.get("source"),
        "source_url": metadata.get("source_url"),
        "source_sha256": hashlib.sha256(raw).hexdigest(),
        "download_sha256": metadata.get("sha256"),
        "source_records": len(source_roads),
        "existing_records": prior.get("existing_records", len(existing) - len(previous_added)) if same_snapshot else len(existing),
        "unchanged_existing_records": unchanged,
        "existing_records_with_source_changes": changed_existing,
        "new_records_added": added,
        "new_candidates_needing_review": ambiguous_candidates,
        "invalid_candidates_not_added": invalid_candidates,
        "existing_roads_absent_from_release_preserved": absent_ids,
        "existing_records_overwritten": 0,
        "existing_records_deleted": 0,
        "shards_after_refresh": roads.load_records(root / "data/roads")[1],
        "previous_shards": prior.get("previous_shards", shards) if same_snapshot else shards,
        "review_radius_meters": REVIEW_RADIUS_METERS,
    }
    roads.atomic_json(prior_path, report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(refresh(args.source, args.metadata), indent=2))


if __name__ == "__main__":
    main()
