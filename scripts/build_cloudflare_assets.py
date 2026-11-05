#!/usr/bin/env python3
"""Build a minimal, production-ready Cloudflare Workers Static Assets tree."""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
GENERATED = ROOT / "generated"


def copy_file(source: Path, destination: Path) -> None:
    if not source.is_file():
        raise FileNotFoundError(f"Required production asset is missing: {source.relative_to(ROOT)}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def generated_entry(manifest: dict, section: str, field: str = "file") -> str:
    entry = manifest.get("delivery", {}).get(section)
    name = entry.get(field) if isinstance(entry, dict) else None
    if not isinstance(name, str) or PurePosixPath(name).name != name:
        raise ValueError(f"Invalid generated file in delivery manifest: {section}.{field}")
    return name


def referenced_manifest_file(manifest: dict, field: str) -> str:
    name = manifest.get(field)
    if not isinstance(name, str) or PurePosixPath(name).name != name:
        raise ValueError(f"Invalid generated file in manifest: {field}")
    return name


def build() -> dict:
    if not (ROOT / "index.html").is_file():
        raise FileNotFoundError("Run this script from a complete Mazo Maps checkout")
    shutil.rmtree(DIST, ignore_errors=True)
    DIST.mkdir(parents=True)

    for relative in ("index.html", "service-worker.js", "_headers"):
        copy_file(ROOT / relative, DIST / relative)
    shutil.copytree(ROOT / "assets", DIST / "assets")
    copy_file(ROOT / "data/cities.json", DIST / "data/cities.json")

    place_manifest = json.loads((GENERATED / "manifest.json").read_text(encoding="utf-8"))
    if place_manifest.get("format") != "PMTiles/1" or place_manifest.get("production_default") != "pmtiles":
        raise ValueError("Place manifest must declare PMTiles as its production format")
    files = [
        "manifest.json",
        generated_entry(place_manifest, "mvt_pmtiles"),
        generated_entry(place_manifest, "search_index"),
        generated_entry(place_manifest, "place_details"),
    ]

    for manifest_name, data_field in (
        ("kattankudy-roads-manifest.json", "geojson"),
        ("kattankudy-speed-limits-manifest.json", "geojson"),
        ("kattankudy-routing-manifest.json", "graph_file"),
    ):
        manifest = json.loads((GENERATED / manifest_name).read_text(encoding="utf-8"))
        files.extend((manifest_name, referenced_manifest_file(manifest, data_field)))

    for name in sorted(set(files)):
        copy_file(GENERATED / name, DIST / "generated" / name)

    return {
        "output": str(DIST.relative_to(ROOT)),
        "files": sum(1 for path in DIST.rglob("*") if path.is_file()),
        "bytes": sum(path.stat().st_size for path in DIST.rglob("*") if path.is_file()),
        "generated": sorted(set(files)),
    }


if __name__ == "__main__":
    try:
        print(json.dumps(build(), indent=2))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
