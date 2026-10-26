#!/usr/bin/env python3
"""Fetch the latest available Overture road segments with documented DuckDB/S3 access.

The official Overture Python CLI resolves releases through STAC. If that endpoint
is unavailable, this downloader uses Overture's published release calendar and
the official DuckDB GeoParquet path documented at docs.overturemaps.org.
"""
import argparse
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen

CALENDAR_URL = "https://docs.overturemaps.org/release-calendar.json"
S3_ROOT = "s3://overturemaps-us-west-2/release"
MAX_RELEASE_AGE_DAYS = 60


def load_calendar(url=CALENDAR_URL):
    request = Request(url, headers={"User-Agent": "MazoMaps-road-refresh/1.0"})
    with urlopen(request, timeout=30) as response:
        value = json.load(response)
    if not isinstance(value, dict) or not isinstance(value.get("releases"), list):
        raise ValueError("Overture release calendar has an unexpected structure")
    return value


def release_candidates(calendar, today=None):
    """Return recent, already-dated releases newest first; bucket reads verify availability."""
    today = today or datetime.now(timezone.utc).date()
    cutoff = today - timedelta(days=MAX_RELEASE_AGE_DAYS)
    candidates = []
    seen = set()
    for row in calendar.get("releases", []):
        if not isinstance(row, dict):
            continue
        version, release_date = row.get("dataVersion"), row.get("date")
        if not isinstance(version, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:\.[0-9]+)?", version):
            continue
        try:
            published = date.fromisoformat(release_date)
        except (TypeError, ValueError):
            continue
        if cutoff <= published <= today and version not in seen:
            seen.add(version)
            candidates.append((published, version))
    return [version for _, version in sorted(candidates, reverse=True)]


def query_release(release, bbox):
    """Query the official public GeoParquet release using Overture's DuckDB method."""
    import duckdb

    west, south, east, north = bbox
    connection = duckdb.connect()
    try:
        connection.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
        connection.execute("SET s3_region='us-west-2'")
        path = f"{S3_ROOT}/{release}/theme=transportation/type=segment/*"
        sql = f"""
            SELECT CAST(id AS VARCHAR), names.primary, class, subtype,
                   ST_AsGeoJSON(geometry)
            FROM read_parquet('{path}', filename=true, hive_partitioning=true)
            WHERE subtype IN ('road', 'street')
              AND bbox.xmin < {east!r} AND bbox.xmax > {west!r}
              AND bbox.ymin < {north!r} AND bbox.ymax > {south!r}
        """
        rows = connection.execute(sql).fetchall()
    finally:
        connection.close()

    features = []
    for identifier, name, road_class, subtype, geometry_json in rows:
        if not identifier or not geometry_json:
            raise ValueError("Overture returned a road segment without an ID or geometry")
        features.append({
            "type": "Feature",
            "id": identifier,
            "geometry": json.loads(geometry_json),
            "properties": {
                "id": identifier,
                "name": name,
                "class": road_class,
                "subtype": subtype,
            },
        })
    return features


def download_latest(output, metadata_output, bbox, calendar=None, extractor=None, today=None):
    calendar = calendar or load_calendar()
    extractor = extractor or query_release
    candidates = release_candidates(calendar, today=today)
    if not candidates:
        raise ValueError("No recent published Overture release is listed in the official calendar")

    failures = []
    selected = None
    features = None
    for release in candidates:
        try:
            result = extractor(release, bbox)
            if not result:
                raise ValueError("the published release returned no road segments for this area")
            selected, features = release, result
            break
        except Exception as exc:
            failures.append(f"{release}: {exc}")
    if selected is None:
        raise RuntimeError("Unable to query any recent Overture release: " + "; ".join(failures))

    payload = {"type": "FeatureCollection", "features": features}
    raw = (json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    output = Path(output)
    metadata_output = Path(metadata_output)
    output.parent.mkdir(parents=True, exist_ok=True)
    metadata_output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(raw)
    metadata = {
        "release": selected,
        "source": "Overture Maps transportation/segment GeoParquet",
        "source_url": f"{S3_ROOT}/{selected}/theme=transportation/type=segment/",
        "release_calendar_url": CALENDAR_URL,
        "bbox": list(bbox),
        "feature_count": len(features),
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }
    metadata_output.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2))
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bbox", nargs=4, type=float, default=[81.70, 7.65, 81.77, 7.72],
                        metavar=("WEST", "SOUTH", "EAST", "NORTH"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--metadata-output", type=Path, required=True)
    args = parser.parse_args()
    download_latest(args.output, args.metadata_output, args.bbox)


if __name__ == "__main__":
    main()
