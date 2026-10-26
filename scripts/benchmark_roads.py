#!/usr/bin/env python3
"""Compare the archived combined-road payload with the generated roads MZP."""
import argparse
import gzip
import hashlib
import json
import statistics
import time
from pathlib import Path

import roads

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "roads" / "kattankudy.json"
MAPPING = ROOT / "data" / "roads" / "road-migration-map.json"
BASELINE = ROOT / "data" / "roads" / "road-benchmark-baseline.json"


def median_seconds(operation, repeats=9):
    values = []
    for _ in range(repeats):
        start = time.perf_counter()
        operation()
        values.append(time.perf_counter() - start)
    return round(statistics.median(values), 6)


def measure_source():
    raw = SOURCE.read_bytes()
    payload = json.loads(raw)
    mapping = json.loads(MAPPING.read_text(encoding="utf-8"))
    ids = {row["source_id"]: row["id"] for row in mapping["records"]}

    def parse():
        json.loads(raw)

    def convert():
        features = []
        for road in payload["roads"]:
            migrated = {"id": ids[road["id"]], "source_id": road["id"]}
            migrated.update({k: v for k, v in road.items() if k != "id"})
            features.append(roads.feature(migrated))
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":"))

    return {
        "sha256": hashlib.sha256(raw).hexdigest(),
        "records": len(payload["roads"]),
        "raw_bytes": len(raw),
        "gzip_bytes": len(gzip.compress(raw)),
        "requests_for_road_data": 1,
        "parse_seconds_median": median_seconds(parse),
        "geojson_conversion_seconds_median": median_seconds(convert, repeats=5),
    }


def measure_mzp():
    raw = (ROOT / "generated" / "kattankudy-roads.mzp").read_bytes()

    def parse():
        json.loads(raw)

    data = json.loads(raw)
    return {
        "features": len(data["features"]),
        "raw_bytes": len(raw),
        "gzip_bytes": len(gzip.compress(raw)),
        "requests_for_road_data": 2,  # roads manifest plus one MZP file
        "parse_seconds_median": median_seconds(parse),
        "geojson_conversion_seconds": 0,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--record-baseline", action="store_true", help="Measure and save the still-present combined source")
    args = parser.parse_args()
    if args.record_baseline:
        if not SOURCE.exists():
            raise SystemExit("Combined roads source is absent; cannot record its benchmark baseline")
        value = measure_source()
        BASELINE.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    else:
        if SOURCE.exists():
            value = measure_source()
        elif BASELINE.exists():
            value = json.loads(BASELINE.read_text(encoding="utf-8"))
        else:
            raise SystemExit("No combined source or saved baseline is available")
    result = {"combined_source": value, "roads_mzp": measure_mzp(),
              "rendering_seconds": "not measured; browser WebGL is environment-dependent"}
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
