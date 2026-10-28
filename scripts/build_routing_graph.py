#!/usr/bin/env python3
"""Build a compact, derived Kattankudy routing graph from the bundled road collection.

This graph is separate from canonical road records. It retains only geometry and
the access/direction attributes needed for routing; unverified maxspeed tags are
intentionally excluded from ETA calculations.
"""
import argparse
import hashlib
import json
import math
from collections import Counter, defaultdict, deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "kattankudy-all-roads.json"
OUTPUT = ROOT / "generated" / "kattankudy-routing.json"
REPORT = ROOT / "generated" / "kattankudy-routing-manifest.json"
DRIVE, WALK, BIKE = 1, 2, 4
MODE_NAMES = {"driving": DRIVE, "walking": WALK, "cycling": BIKE}
DRIVE_HIGHWAYS = {
    "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
    "secondary", "secondary_link", "tertiary", "tertiary_link", "unclassified",
    "residential", "living_street", "service", "track", "road", "roundabout",
}
BIKE_HIGHWAYS = {
    "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
    "tertiary", "tertiary_link", "unclassified", "residential", "living_street",
    "service", "track", "cycleway", "path", "pedestrian",
}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def truthy(value):
    return str(value or "").strip().casefold() in {"yes", "true", "1"}


def access_modes(road):
    tags = road.get("tags") or {}
    highway = str(road.get("highway") or tags.get("highway") or "").casefold()
    access = str(tags.get("access") or "").casefold()
    vehicle = str(tags.get("vehicle") or access).casefold()
    motor = str(tags.get("motor_vehicle") or tags.get("motorcar") or vehicle).casefold()
    foot = str(tags.get("foot") or access).casefold()
    bicycle = str(tags.get("bicycle") or vehicle).casefold()
    modes = 0
    if highway in DRIVE_HIGHWAYS and motor not in {"no", "private"}:
        modes |= DRIVE
    if highway not in {"motorway", "motorway_link"} and foot not in {"no", "private"}:
        modes |= WALK
    if highway in BIKE_HIGHWAYS and bicycle not in {"no", "private"}:
        modes |= BIKE
    return modes


def direction_masks(road, modes):
    tags = road.get("tags") or {}
    oneway = str(tags.get("oneway") or "").strip().casefold()
    if not oneway and str(tags.get("junction") or "").casefold() == "roundabout":
        oneway = "yes"
    forward = modes
    reverse = modes
    if oneway in {"yes", "true", "1"}:
        reverse &= WALK
        if str(tags.get("oneway:bicycle") or "").casefold() in {"no", "false", "0"}:
            reverse |= modes & BIKE
        if str(tags.get("oneway:foot") or "").casefold() in {"no", "false", "0"}:
            reverse |= modes & WALK
    elif oneway == "-1":
        forward &= WALK
        if str(tags.get("oneway:bicycle") or "").casefold() in {"no", "false", "0"}:
            forward |= modes & BIKE
        if str(tags.get("oneway:foot") or "").casefold() in {"no", "false", "0"}:
            forward |= modes & WALK
    else:
        for mode, key in ((DRIVE, "oneway:motor_vehicle"), (BIKE, "oneway:bicycle"), (WALK, "oneway:foot")):
            value = str(tags.get(key) or "").casefold()
            if value in {"yes", "true", "1"}:
                reverse &= ~mode
            elif value == "-1":
                forward &= ~mode
    return forward, reverse


def components(nodes_count, segments, mode):
    graph = [[] for _ in range(nodes_count)]
    for a, b, _, forward, reverse in segments:
        if forward & mode:
            graph[a].append(b)
            graph[b].append(a)
        elif reverse & mode:
            graph[a].append(b)
            graph[b].append(a)
    seen = set()
    sizes = []
    for start in range(nodes_count):
        if start in seen or not graph[start]:
            continue
        queue = [start]
        seen.add(start)
        count = 0
        while queue:
            current = queue.pop()
            count += 1
            for other in graph[current]:
                if other not in seen:
                    seen.add(other)
                    queue.append(other)
        sizes.append(count)
    return {"weak_components": len(sizes), "largest_component_nodes": max(sizes, default=0)}


def build(source_path=SOURCE, output_path=OUTPUT, report_path=REPORT):
    source_path = Path(source_path)
    raw = source_path.read_bytes()
    payload = json.loads(raw)
    roads = payload.get("roads")
    if not isinstance(roads, list) or payload.get("osm_road_count") != len(roads):
        raise ValueError("Routing source road count is invalid")
    if payload.get("failed_tiles"):
        raise ValueError("Routing source contains incomplete tile retrievals")

    selected = []
    skipped = Counter()
    for road in roads:
        coordinates = road.get("coordinates")
        if not isinstance(coordinates, list) or len(coordinates) < 2 or road.get("missing_node_count", 0):
            skipped["incomplete_geometry"] += 1
            continue
        normalized = []
        for coordinate in coordinates:
            if not isinstance(coordinate, list) or len(coordinate) < 2:
                normalized = []
                break
            lon, lat = coordinate[:2]
            if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)) or not math.isfinite(lon) or not math.isfinite(lat) or abs(lon) > 180 or abs(lat) > 90:
                normalized = []
                break
            point = [round(float(lon), 7), round(float(lat), 7)]
            if not normalized or point != normalized[-1]:
                normalized.append(point)
        if len(normalized) < 2:
            skipped["invalid_geometry"] += 1
            continue
        modes = access_modes(road)
        if not modes:
            skipped["no_public_routing_mode"] += 1
            continue
        forward, reverse = direction_masks(road, modes)
        selected.append((road, normalized, forward, reverse))

    selected.sort(key=lambda row: str(row[0].get("osm_id", "")))
    node_keys = sorted({(point[0], point[1]) for _, coordinates, _, _ in selected for point in coordinates})
    node_ids = {coordinate: index for index, coordinate in enumerate(node_keys)}
    ways = []
    segments = []
    maxspeed_tag_count = 0
    for road, coordinates, forward, reverse in selected:
        tags = road.get("tags") or {}
        highway = str(road.get("highway") or tags.get("highway") or "unknown")
        name = str(road.get("name") or tags.get("name") or "").strip()
        way_index = len(ways)
        ways.append({
            "id": str(road.get("osm_id", "")),
            "name": name,
            "highway": highway,
            "modes": forward | reverse,
            "oneway": str(tags.get("oneway") or ("yes" if tags.get("junction") == "roundabout" else "no")),
        })
        if road.get("maxspeed") or tags.get("maxspeed"):
            maxspeed_tag_count += 1
        for a, b in zip(coordinates, coordinates[1:]):
            start, end = node_ids[tuple(a)], node_ids[tuple(b)]
            if start != end and (forward or reverse):
                segments.append([start, end, way_index, forward, reverse])

    nodes = [[lon, lat] for lon, lat in node_keys]
    bounds = [
        min(point[0] for point in nodes), min(point[1] for point in nodes),
        max(point[0] for point in nodes), max(point[1] for point in nodes),
    ]
    source_hash = sha256(raw)
    connectivity = {name: components(len(nodes), segments, mode) for name, mode in MODE_NAMES.items()}
    graph = {
        "version": 1,
        "source_sha256": source_hash,
        "scope": "Kattankudy-area road collection; geometry envelope, not an administrative boundary",
        "bounds": bounds,
        "nodes": nodes,
        "ways": ways,
        "segments": segments,
        "connectivity": connectivity,
        "speed_tag_policy": "Raw maxspeed tags are unverified and excluded from route duration or legal guidance.",
    }
    encoded = (json.dumps(graph, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    output_path = Path(output_path)
    report_path = Path(report_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(encoded)
    report = {
        "version": 1,
        "source_sha256": source_hash,
        "graph_sha256": sha256(encoded),
        "graph_file": output_path.name,
        "graph_bytes": len(encoded),
        "road_records": len(roads),
        "routable_ways": len(ways),
        "nodes": len(nodes),
        "directed_segments": sum(bool(f) + bool(r) for _, _, _, f, r in segments),
        "segments": len(segments),
        "raw_speed_tag_ways_excluded_from_eta": maxspeed_tag_count,
        "skipped": dict(sorted(skipped.items())),
        "bounds": bounds,
        "connectivity": connectivity,
        "limitations": [
            "Local routing only covers the measured road geometry in the bundled Kattankudy-area collection.",
            "Turn-restriction relations and lane guidance are not present in the source.",
            "Raw maxspeed values are unverified; local ETA uses clearly labeled average-speed assumptions.",
            "Walking/cycling access follows available way tags and ordinary highway conventions; conditions may be incomplete.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify a clean deterministic rebuild")
    args = parser.parse_args()
    before = OUTPUT.read_bytes() if args.check and OUTPUT.exists() else None
    report = build()
    if args.check and (before is None or before != OUTPUT.read_bytes()):
        raise SystemExit("Routing graph is missing or stale; run scripts/build_routing_graph.py")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
