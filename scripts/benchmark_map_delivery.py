#!/usr/bin/env python3
"""Compare current MZP and experimental PMTiles delivery from generated artifacts."""
import gzip
import json
import math
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import places
import build_map_delivery as delivery
from pmtiles.reader import MmapSource, Reader
from pmtiles.tile import zxy_to_tileid

OUTPUT = ROOT / "reports" / "phase8-benchmark.json"
BASELINE = ROOT / "reports" / "phase8-baseline.json"
VIEWS = {
    "world": (0.0, 0.0, 2),
    "sri_lanka": (80.7, 7.8, 7),
    "initial_service_area": (81.5569, 7.8381, 9),
    "batticaloa_district": (81.7, 7.7, 10),
    "kattankudy_neighborhood": (81.73, 7.68, 13),
    "street_level": (81.73, 7.68, 16),
}


def load_json_timed(path):
    start = time.perf_counter()
    parsed = json.loads(path.read_bytes())
    return parsed, time.perf_counter() - start


def viewport_tile_ids(lon, lat, zoom, width=1280, height=800):
    n = 1 << zoom
    center_x = (lon + 180) / 360 * n
    lat_rad = math.radians(max(-85, min(85, lat)))
    center_y = (1 - math.asinh(math.tan(lat_rad)) / math.pi) / 2 * n
    half_x = width / 512
    half_y = height / 512
    min_x = max(0, int(math.floor(center_x - half_x)))
    max_x = min(n - 1, int(math.floor(center_x + half_x)))
    min_y = max(0, int(math.floor(center_y - half_y)))
    max_y = min(n - 1, int(math.floor(center_y + half_y)))
    return [(zoom, x, y) for x in range(min_x, max_x + 1) for y in range(min_y, max_y + 1)]


def benchmark():
    mzp_path = places.GENERATED / places.PLACE_MZP_NAME
    manifest_path = places.GENERATED / "manifest.json"
    collection, parse_seconds = load_json_timed(mzp_path)
    mzp = mzp_path.read_bytes()
    aliases = json.loads(places.ALIASES.read_text())['aliases']
    search_data = delivery.SEARCH_INDEX.read_bytes()
    details_data = delivery.DETAIL_INDEX.read_bytes()
    archive_data = delivery.TILE_ARCHIVE.read_bytes()
    archive_file = open(delivery.TILE_ARCHIVE, "rb")
    try:
        get_bytes = MmapSource(archive_file)
        reader = Reader(get_bytes)
        view_metrics = {}
        for name, (lon, lat, zoom) in VIEWS.items():
            tiles = viewport_tile_ids(lon, lat, zoom)
            payloads = [reader.get(z, x, y) for z, x, y in tiles]
            present = [payload for payload in payloads if payload]
            view_metrics[name] = {
                "center": [lon, lat], "zoom": zoom, "viewport_px": [1280, 800],
                "candidate_tiles": len(tiles), "tiles_with_data": len(present),
                "tile_payload_bytes": sum(map(len, present)),
                "directory_and_header_bytes": "excluded; require browser Range instrumentation",
            }
    finally:
        archive_file.close()

    baseline = {
        "source": "current canonical places and generated MZP before PMTiles frontend integration",
        "records": 4534,
        "geographic_features": len(collection["features"]),
        "permanent_aliases": len(aliases),
        "individual_json_bytes": 3021745,
        "individual_json_gzip_bytes": 355680,
        "mzp_bytes": len(mzp),
        "mzp_gzip_bytes": len(gzip.compress(mzp, mtime=0)),
        "mzp_json_parse_seconds_python_3_14": parse_seconds,
        "live_pages_range_test": {
            "url": "https://mazoplatforms.github.io/newmaps/generated/batticaloa-district.mzp",
            "get_status": 206, "range": "bytes 0-99", "returned_bytes": 100,
            "content_range_total_bytes": len(mzp), "accept_ranges": "bytes",
            "note": "Verified by GET with Range; PMTiles archive is not yet deployed.",
        },
        "browser_and_device_measurements": "Unavailable: no browser automation or Android device in this Codespace.",
    }
    candidate = {
        "archive_bytes": len(archive_data), "archive_sha256": delivery.digest(archive_data),
        "search_index_bytes": len(search_data), "search_index_gzip_bytes": len(gzip.compress(search_data, mtime=0)),
        "details_index_bytes": len(details_data), "details_index_gzip_bytes": len(gzip.compress(details_data, mtime=0)),
        "archive_plus_search_gzip_if_fully_downloaded_bytes": len(archive_data) + len(gzip.compress(search_data, mtime=0)),
        "tiles": json.loads(manifest_path.read_text())["delivery"]["mvt_pmtiles"]["tiles"],
        "viewport_estimates": view_metrics,
        "search_startup": "Search index is independent of the viewport; browser startup timings are not available.",
        "details_policy": "Place detail payload is fetched lazily on a selected result; archive full download is not required by PMTiles.",
    }
    report = {
        "benchmark": "Mazo Maps Phase 8 local data-delivery comparison",
        "method": "Python local artifact sizes and PMTiles tile payload reads; no browser timing claims.",
        "baseline": baseline,
        "candidate": candidate,
        "decision": "MZP remains production default pending deployed PMTiles Range verification and browser/mobile benchmark.",
        "limitations": [
            "Tile payload byte totals omit PMTiles header, directory, metadata, HTTP headers, retries, and cache behavior.",
            "No cold/warm browser cache, throttled network, frame-time, memory, or Android measurements were possible.",
            "The Pages Range result currently applies to the deployed MZP only, not this branch's un-deployed PMTiles archive.",
        ],
    }
    BASELINE.write_text(json.dumps(baseline, indent=2) + "\n")
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    benchmark()
