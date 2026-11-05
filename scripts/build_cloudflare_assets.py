#!/usr/bin/env python3
"""Build a minimal, production-ready Cloudflare Workers Static Assets tree."""
from __future__ import annotations

import json
import hashlib
import mimetypes
import shutil
import unicodedata
import sys
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
GENERATED = ROOT / "generated"
WRANGLER_CONFIG = ROOT / "wrangler.jsonc"


def copy_file(source: Path, destination: Path) -> None:
    if not source.is_file():
        raise FileNotFoundError(f"Required production asset is missing: {source.relative_to(ROOT)}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def cloudflare_index_html(source: str) -> str:
    """Make the SPA shell's static asset links valid on nested Workers routes.

    Apply root URLs only to the Workers output, where the site is mounted at
    `/`; preserve the source shell's relative URLs for local static previews.
    """
    return (source.replace("<head>", '<head>\n    <base href="/">', 1)
            .replace('href="./assets/', 'href="/assets/')
            .replace("href='./assets/", "href='/assets/")
            .replace('src="./assets/', 'src="/assets/')
            .replace("src='./assets/", "src='/assets/")
            .replace('href="./"', 'href="/"')
            .replace("href='./'", "href='/'"))


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


def split_pmtiles_archive(source: Path, destination: Path, chunk_size: int) -> int:
    destination.mkdir(parents=True, exist_ok=True)
    count = 0
    with source.open("rb") as archive:
        while chunk := archive.read(chunk_size):
            (destination / f"{count:05d}.bin").write_bytes(chunk)
            count += 1
    return count


def build_api_search_index(source: Path, destination: Path) -> None:
    payload = json.loads(source.read_text(encoding="utf-8"))
    indexes = {field: position for position, field in enumerate(payload.get("fields", []))}
    required = {"id", "name", "coordinates", "categories", "discoveryCategory", "address"}
    if not required.issubset(indexes):
        raise ValueError("Place search index is missing fields required by the RideNow API")
    fields = ["id", "name", "address", "coordinates", "discoveryCategory", "searchText"]
    rows = []
    for row in payload.get("records", []):
        name = row[indexes["name"]] or ""
        address = row[indexes["address"]] or ""
        categories = row[indexes["categories"]] or []
        searchable = " ".join([str(name), str(address), *(str(value) for value in categories)])
        searchable = unicodedata.normalize("NFKD", searchable).casefold()
        searchable = " ".join("".join(char if char.isalnum() or unicodedata.category(char).startswith("M") else " "
                                      for char in searchable).split())
        rows.append([row[indexes["id"]], name, address, row[indexes["coordinates"]],
                     row[indexes["discoveryCategory"]], searchable])
    destination.write_text(json.dumps({"version": 1, "fields": fields, "records": rows},
                                      ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def build_bootstrap_live_manifest() -> dict:
    managed = []
    for root in (DIST / "generated", DIST / "data"):
        if not root.exists():
            continue
        for path in sorted(root.rglob("*")):
            if not path.is_file():
                continue
            relative = path.relative_to(DIST).as_posix()
            if relative == "generated/live-data-manifest.json" or relative.startswith("generated/places-pmtiles-chunks/"):
                continue
            raw = path.read_bytes()
            content_type = mimetypes.guess_type(relative)[0] or "application/octet-stream"
            if relative.endswith(".pmtiles"):
                content_type = "application/vnd.pmtiles"
            elif relative.endswith(".mzp"):
                content_type = "application/geo+json"
            managed.append((relative, {
                "sha256": hashlib.sha256(raw).hexdigest(),
                "bytes": len(raw),
                "content_type": content_type,
            }))
    if not managed:
        raise ValueError("No generated or data files were found for the live-data bootstrap manifest")
    return {
        "format": "MazoLiveData/1",
        "revision": "bootstrap",
        "run_number": 0,
        "updated_at": None,
        "files": dict(managed),
    }


def build() -> dict:
    if not (ROOT / "index.html").is_file():
        raise FileNotFoundError("Run this script from a complete Mazo Maps checkout")
    shutil.rmtree(DIST, ignore_errors=True)
    DIST.mkdir(parents=True)

    for relative in ("service-worker.js", "_headers"):
        copy_file(ROOT / relative, DIST / relative)
    (DIST / "index.html").write_text(
        cloudflare_index_html((ROOT / "index.html").read_text(encoding="utf-8")),
        encoding="utf-8",
    )
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

    wrangler_config = json.loads(WRANGLER_CONFIG.read_text(encoding="utf-8"))
    chunk_size = int(wrangler_config.get("vars", {}).get("PMTILES_CHUNK_SIZE", 0))
    if chunk_size <= 0:
        raise ValueError("Wrangler PMTILES_CHUNK_SIZE must be a positive integer")
    pmtiles_file = generated_entry(place_manifest, "mvt_pmtiles")
    pmtiles_source = GENERATED / pmtiles_file
    pmtiles_entry = place_manifest["delivery"]["mvt_pmtiles"]
    pmtiles_bytes = pmtiles_source.stat().st_size
    if pmtiles_bytes != pmtiles_entry.get("bytes"):
        raise ValueError("PMTiles archive size does not match its delivery manifest")
    chunk_count = (pmtiles_bytes + chunk_size - 1) // chunk_size
    if chunk_count > 47:
        raise ValueError(
            "PMTiles must use at most 47 range chunks so metadata, HEAD, and a full archive Range "
            "stays within the Workers Free per-request subrequest budget"
        )
    digest = hashlib.sha256(pmtiles_source.read_bytes()).hexdigest()
    if digest != pmtiles_entry.get("sha256"):
        raise ValueError("PMTiles archive checksum does not match its delivery manifest")

    for manifest_name, data_field in (
        ("kattankudy-roads-manifest.json", "geojson"),
        ("kattankudy-speed-limits-manifest.json", "geojson"),
        ("kattankudy-routing-manifest.json", "graph_file"),
    ):
        manifest = json.loads((GENERATED / manifest_name).read_text(encoding="utf-8"))
        files.extend((manifest_name, referenced_manifest_file(manifest, data_field)))

    for name in sorted(set(files)):
        copy_file(GENERATED / name, DIST / "generated" / name)

    build_api_search_index(DIST / "generated" / "search-index.json", DIST / "generated" / "api-search-index.json")
    files.append("api-search-index.json")

    written_chunks = split_pmtiles_archive(
        pmtiles_source,
        DIST / "generated" / "places-pmtiles-chunks",
        chunk_size,
    )
    if written_chunks != chunk_count:
        raise ValueError("Generated PMTiles chunk count does not match the archive size")
    range_manifest = {
        "format": "MazoPMTilesRange/1",
        "file": pmtiles_file,
        "sha256": digest,
        "bytes": pmtiles_bytes,
        "chunk_size": chunk_size,
        "chunk_count": written_chunks,
    }
    (DIST / "generated" / "places-pmtiles-range.json").write_text(
        json.dumps(range_manifest, indent=2) + "\n",
        encoding="utf-8",
    )
    bootstrap_manifest = build_bootstrap_live_manifest()
    (DIST / "generated" / "live-data-manifest.json").write_text(
        json.dumps(bootstrap_manifest, indent=2) + "\n",
        encoding="utf-8",
    )

    return {
        "output": str(DIST.relative_to(ROOT)),
        "files": sum(1 for path in DIST.rglob("*") if path.is_file()),
        "bytes": sum(path.stat().st_size for path in DIST.rglob("*") if path.is_file()),
        "generated": sorted({*files, "places-pmtiles-range.json", "live-data-manifest.json"}),
        "live_data_files": len(bootstrap_manifest["files"]),
        "pmtiles_range_chunks": written_chunks,
        "pmtiles_chunk_size": chunk_size,
    }


if __name__ == "__main__":
    try:
        print(json.dumps(build(), indent=2))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
