#!/usr/bin/env python3
"""Create the verified full-country PBF input for the OSRM Container image."""
import argparse
import hashlib
import shutil
from pathlib import Path

from build_sri_lanka_basemap import download_source

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "generated/sri-lanka-routing.osm.pbf"


def build(output=OUTPUT):
    source = download_source()
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, output)
    digest = hashlib.sha256()
    with output.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return {"source": str(source), "output": str(output), "bytes": output.stat().st_size,
            "sha256": digest.hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate source files without writing an output")
    args = parser.parse_args()
    if args.check:
        source = download_source()
        print(f"Verified complete Sri Lanka routing source: {source.stat().st_size} bytes")
        return
    import json
    print(json.dumps(build(), indent=2))


if __name__ == "__main__":
    main()
