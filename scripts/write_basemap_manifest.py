#!/usr/bin/env python3
"""Describe the locally built basemap PMTiles archives in assets/basemap/manifest.json.

Each archive is verified (PMTiles v3 header, size limit) and recorded with its SHA-256,
zoom range and bounds so the browser can verify and cache it.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from datetime import datetime, timezone
from pathlib import Path

# Cloudflare Workers Static Assets reject files above 25 MiB.
MAX_BYTES = 24 * 1024 * 1024
ATTRIBUTION = "© OpenStreetMap contributors · © OpenMapTiles"


def describe(archive_id: str, path: Path) -> dict:
    raw = path.read_bytes()
    if raw[:7] != b"PMTiles" or raw[7] != 3:
        raise SystemExit(f"{path} is not a PMTiles v3 archive")
    if len(raw) > MAX_BYTES:
        raise SystemExit(
            f"{path.name} is {len(raw) / 1048576:.1f} MiB; the limit is 24 MiB. "
            "Re-run the workflow with a lower maxzoom or a smaller detail bounding box."
        )
    min_lon, min_lat, max_lon, max_lat = (struct.unpack_from("<i", raw, offset)[0] / 1e7 for offset in (102, 106, 110, 114))
    return {
        "id": archive_id,
        "file": path.name,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "min_zoom": raw[100],
        "max_zoom": raw[101],
        "bounds": [round(min_lon, 5), round(min_lat, 5), round(max_lon, 5), round(max_lat, 5)],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", action="append", required=True, metavar="ID=PATH")
    parser.add_argument("--output", required=True)
    parser.add_argument("--osm-url", required=True)
    parser.add_argument("--osm-sha256", required=True)
    args = parser.parse_args()

    archives = []
    for item in args.archive:
        archive_id, _, location = item.partition("=")
        archives.append(describe(archive_id, Path(location)))
    manifest = {
        "format": "MazoBasemap/1",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "attribution": ATTRIBUTION,
        "schema": "OpenMapTiles",
        "osm_extract": {"url": args.osm_url, "sha256": args.osm_sha256},
        "archives": archives,
    }
    Path(args.output).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    try:
        main()
    except OSError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
