#!/usr/bin/env python3
"""Conservatively link supplementary OSM road evidence without changing source IDs."""
import argparse
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

import roads
import speed_limits

ROOT = Path(__file__).resolve().parents[1]
SUPPLEMENT = ROOT / "kattankudy-all-roads.json"
ROAD_EVIDENCE = ROOT / "data/roads/supplementary-road-audit.json"
SOURCE_FILE = "kattankudy-all-roads.json"


def canonical(value):
    return " ".join(value.casefold().split()) if isinstance(value, str) else ""


def load_partitioned(path, collection_key):
    value = json.loads(Path(path).read_text())
    if isinstance(value.get(collection_key), list):
        return value, value[collection_key]
    parts = value.get("mapping_parts")
    if not isinstance(parts, list):
        raise ValueError(f"Invalid partition manifest: {path}")
    rows = []
    for name in parts:
        part = json.loads((Path(path).parent / name).read_text())
        rows.extend(part.get(collection_key, []))
    if len(rows) != value.get("records_count"):
        raise ValueError(f"Partition count mismatch: {path}")
    return value, rows


def write_partitioned(path, manifest, rows, collection_key, prefix, chunk_size=100):
    names = []
    for index in range(0, len(rows), chunk_size):
        name = f"{prefix}-{index // chunk_size + 1:04d}.json"
        roads.atomic_json(path.parent / name, {collection_key: rows[index:index + chunk_size]}, pretty=False)
        names.append(name)
    for old in path.parent.glob(prefix + "-*.json"):
        if old.name not in names:
            old.unlink()
    output = dict(manifest)
    output["records_count"] = len(rows)
    output["mapping_parts"] = names
    roads.atomic_json(path, output, pretty=True)
    return output


def candidates(supplement, match_rows):
    """Build strict one-to-one road matches from the audited sampled-line comparison."""
    by_osm = {str(row["osm_id"]): row for row in supplement["roads"]}
    if len(by_osm) != len(supplement["roads"]):
        raise ValueError("Supplementary OSM IDs must be unique")
    eligible = []
    reviews = {}
    for comparison in match_rows:
        osm_id = str(comparison["osm_id"])
        source = by_osm.get(osm_id)
        if source is None:
            raise ValueError(f"Match evidence references unknown OSM ID {osm_id}")
        top = comparison.get("top") or []
        best = top[0] if top else None
        next_share = top[1].get("nearest_fraction", 0) if len(top) > 1 else 0
        margin = (best.get("nearest_fraction", 0) - next_share) if best else 0
        reason = None
        if comparison.get("cover_8m", 0) < 0.90:
            reason = "insufficient_geometry_overlap"
        elif not best or margin < 0.25:
            reason = "ambiguous_nearest_road"
        elif source.get("highway") != best.get("type"):
            reason = "road_class_mismatch"
        elif canonical(source.get("name")) and canonical(best.get("name")) and canonical(source.get("name")) != canonical(best.get("name")):
            reason = "road_name_mismatch"
        if reason:
            reviews[osm_id] = {"status": "unresolved", "reason": reason}
            continue
        eligible.append((osm_id, source, comparison, best, margin))

    # Do not silently choose between source features that claim the same existing segment.
    by_internal_source = defaultdict(list)
    for item in eligible:
        by_internal_source[item[3]["source_id"]].append(item)
    accepted = []
    for internal_source, group in by_internal_source.items():
        if len(group) != 1:
            for osm_id, *_ in group:
                reviews[osm_id] = {"status": "ambiguous", "reason": "multiple_osm_features_match_same_road", "candidate_source_id": internal_source}
        else:
            accepted.append(group[0])
    links = {}
    for osm_id, source, comparison, best, margin in accepted:
        links[osm_id] = {
            "status": "matched", "road_source_id": best["source_id"],
            "geometry_coverage_8m": comparison["cover_8m"],
            "nearest_road_share": best["nearest_fraction"], "runner_up_margin": margin,
        }
    return links, reviews


def enrichment(source, source_sha, match):
    return {
        "source": SOURCE_FILE,
        "source_sha256": source_sha,
        "osm_id": str(source["osm_id"]),
        "maxspeed": source.get("maxspeed"),
        "maxspeed_unit": None,
        "maxspeed_status": "unverified_source_tag" if source.get("maxspeed") is not None else "no_source_tag",
        "source_tags": source.get("tags") or {},
        "highway": source.get("highway"),
        "name": source.get("name"),
        "match_method": "sampled_line_overlap_8m_and_class_name_with_unique_margin",
        "match_evidence": match,
    }


def run(repository_root=ROOT, source_path=None, match_path=None, write=True):
    root = Path(repository_root)
    source_path = Path(source_path or root / SOURCE_FILE)
    match_path = Path(match_path or root / "data/roads/supplementary-match-analysis.json")
    raw = source_path.read_bytes()
    supplement = json.loads(raw)
    if not isinstance(supplement.get("roads"), list) or supplement.get("osm_road_count") != len(supplement["roads"]):
        raise ValueError("Supplementary roads source count mismatch")
    source_ids = [str(row.get("osm_id")) for row in supplement["roads"]]
    if len(source_ids) != len(set(source_ids)):
        raise ValueError("Duplicate supplementary OSM IDs")
    tagged = sum(row.get("maxspeed") is not None for row in supplement["roads"])
    if supplement.get("roads_with_speed_tags") != tagged:
        raise ValueError("Supplementary maxspeed tag count mismatch")
    match_payload, match_rows = load_partitioned(match_path, "records")
    matches, reviews = candidates(supplement, match_rows)
    records, shard_counts = roads.load_records(root / "data/roads")
    by_source = {row["source_id"]: row for row in records}
    if len(by_source) != len(records):
        raise ValueError("Existing road source IDs are not unique")
    by_osm = {str(row["osm_id"]): row for row in supplement["roads"]}
    source_sha = hashlib.sha256(raw).hexdigest()
    road_evidence = {}
    speed_evidence = {}
    for osm_id, match in matches.items():
        source = by_osm[osm_id]
        if source.get("maxspeed") is None:
            continue
        road = by_source.get(match["road_source_id"])
        if road is None:
            raise ValueError(f"Audited road match does not resolve: {match['road_source_id']}")
        data = enrichment(source, source_sha, match)
        road_evidence[road["id"]] = data
        speed_evidence[road["id"]] = data
    # Existing source records and internal IDs remain intact; only additive evidence fields change.
    if write:
        for road in records:
            evidence = road_evidence.get(road["id"])
            if evidence:
                path = next((p for p in roads.road_files(root / "data/roads") if p.stem == road["id"]))
                value = json.loads(path.read_text())
                value["supplementary_maxspeed_evidence"] = evidence
                roads.atomic_json(path, value)
        speed_records, _ = speed_limits.load_records(root / "data/speed-limits")
        speed_by_ref = {record["road_ref"]: record for record in speed_records}
        if len(speed_by_ref) != len(speed_records):
            raise ValueError("Speed-limit road references are not one-to-one")
        speed_paths = {p.stem: p for p in speed_limits.record_files(root / "data/speed-limits")}
        for road_ulid, evidence in speed_evidence.items():
            speed_record = speed_by_ref.get(road_ulid)
            if not speed_record:
                raise ValueError(f"No speed-limit record for matched road ULID {road_ulid}")
            if speed_record.get("speed_limit_kmh") is not None:
                raise ValueError(f"Refusing to overwrite confirmed speed limit for {speed_record['source_id']}")
            speed_record["supplementary_maxspeed_evidence"] = evidence
            speed_limits.atomic_json(speed_paths[speed_record["id"]], speed_record)
        audit_rows = []
        for source in supplement["roads"]:
            osm_id = str(source["osm_id"])
            status = matches.get(osm_id) or reviews.get(osm_id) or {"status": "unresolved", "reason": "no_match_evidence"}
            audit_rows.append({"osm_id": osm_id, "name": source.get("name"), "highway": source.get("highway"),
                               "maxspeed": source.get("maxspeed"), "maxspeed_unit": None,
                               **({"road_ulid": by_source[status["road_source_id"]]["id"]} if status.get("status") == "matched" else {}), **status})
        audit = {"schema_version": 1, "format": "MazoSupplementaryRoadAudit/1", "source_file": SOURCE_FILE, "source_sha256": source_sha,
                 "source_records": len(supplement["roads"]), "source_records_with_maxspeed": tagged,
                 "matched_roads": len(matches), "tagged_matches": len(speed_evidence),
                 "new_roads_added": 0,
                 "new_roads_reason": "No unmatched feature could be confirmed as a distinct missing road from the available geometry, class, name, and uniqueness evidence; candidates remain in this review report for topology review.",
                 "matching_thresholds": {"geometry_coverage_8m_min": 0.90, "nearest_share_margin_min": 0.25,
                                          "road_class": "exact", "names": "equal when both present", "duplicate_targets": "review"},
                 "shards": shard_counts}
        write_partitioned(root / "data/roads/supplementary-road-audit.json", audit,
                          sorted(audit_rows, key=lambda r: int(r["osm_id"])), "records", "supplementary-road-audit", 100)
    audit_path = root / "data/roads/supplementary-road-audit.json"
    if audit_path.exists():
        audit = json.loads(audit_path.read_text())
        if audit.get("source_sha256") != source_sha or audit.get("source_records") != len(supplement["roads"]):
            raise ValueError("Supplementary road audit source checksum/count mismatch")
        if audit.get("matched_roads") != len(matches) or audit.get("tagged_matches") != len(speed_evidence):
            raise ValueError("Supplementary road audit match counts are stale")
        _, audit_rows = load_partitioned(audit_path, "records")
        audited = {str(row["osm_id"]): row for row in audit_rows}
        if len(audited) != len(supplement["roads"]):
            raise ValueError("Supplementary road audit must contain every source record")
        for osm_id, match in matches.items():
            row = audited.get(osm_id)
            if not row or row.get("road_ulid") != by_source[match["road_source_id"]]["id"]:
                raise ValueError(f"Supplementary source-to-ULID mapping mismatch: OSM {osm_id}")
        # All baseline numeric limit values remain untouched and evidence stays explicitly unverified.
        for record in speed_limits.load_records(root / "data/speed-limits")[0]:
            evidence = record.get("supplementary_maxspeed_evidence")
            if evidence and (evidence.get("maxspeed_status") != "unverified_source_tag" or evidence.get("maxspeed_unit") is not None):
                raise ValueError(f"Invalid supplementary speed provenance on {record['source_id']}")
    elif not write:
        raise ValueError("Supplementary road audit is missing")
    audit_path = root / "data/roads/supplementary-road-audit.json"
    if audit_path.exists():
        audit = json.loads(audit_path.read_text())
        if audit.get("source_sha256") != source_sha or audit.get("source_records") != len(supplement["roads"]):
            raise ValueError("Supplementary road audit source checksum/count mismatch")
        if audit.get("matched_roads") != len(matches) or audit.get("tagged_matches") != len(speed_evidence):
            raise ValueError("Supplementary road audit match counts are stale")
        _, audit_rows = load_partitioned(audit_path, "records")
        audited = {str(row["osm_id"]): row for row in audit_rows}
        if len(audited) != len(supplement["roads"]):
            raise ValueError("Supplementary road audit must contain every source record")
        for osm_id, match in matches.items():
            row = audited.get(osm_id)
            if not row or row.get("road_ulid") != by_source[match["road_source_id"]]["id"]:
                raise ValueError(f"Supplementary source-to-ULID mapping mismatch: OSM {osm_id}")
        for record in speed_limits.load_records(root / "data/speed-limits")[0]:
            evidence = record.get("supplementary_maxspeed_evidence")
            if evidence and (evidence.get("maxspeed_status") != "unverified_source_tag" or evidence.get("maxspeed_unit") is not None):
                raise ValueError(f"Invalid supplementary speed provenance on {record['source_id']}")
    elif not write:
        raise ValueError("Supplementary road audit is missing")
    return {"source_records": len(supplement["roads"]), "source_tagged": tagged,
            "matched_roads": len(matches), "tagged_matches": len(speed_evidence),
            "unresolved_or_ambiguous": len(supplement["roads"]) - len(matches),
            "new_roads_added": 0, "road_shards": shard_counts}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--matches", type=Path)
    parser.add_argument("--check", action="store_true", help="Validate match audit without writing")
    args = parser.parse_args()
    print(json.dumps(run(source_path=args.source, match_path=args.matches, write=not args.check), indent=2))


if __name__ == "__main__":
    main()
