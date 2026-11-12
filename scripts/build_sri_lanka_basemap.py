#!/usr/bin/env python3
"""Build and chunk the Sri Lanka OSM vector basemap for incremental R2 sync."""
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path
from pmtiles.reader import MmapSource, Reader

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "generated"
TMP = ROOT / ".cache" / "sri-lanka-basemap"
TILEMAKER = "ghcr.io/systemed/tilemaker@sha256:9cd8728a37a31c8a5205e091cedd3ff2c2c450c57e1ce3e5b58916185540ebba"
CHUNK_SIZE = 1024 * 1024
ARCHIVE = GENERATED / "sri-lanka-basemap.pmtiles"
CHUNKS = GENERATED / "sri-lanka-basemap-pmtiles-chunks"
DESCRIPTOR = GENERATED / "sri-lanka-basemap-range.json"
SOURCE_MANIFEST = ROOT / "data/basemap/sri-lanka-source.json"


def source_config() -> dict:
    source = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    if source.get("format") != "MazoBasemapSource/1" or not source.get("url"):
        raise ValueError("Human-readable Sri Lanka source manifest is invalid")
    if not isinstance(source.get("bounds"), list) or len(source["bounds"]) != 4:
        raise ValueError("Sri Lanka source manifest must declare geographic coverage")
    return source


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download_source() -> Path:
    source_manifest = source_config()
    TMP.mkdir(parents=True, exist_ok=True)
    source = TMP / "sri-lanka.osm.pbf"
    parts = source_manifest.get("repository_parts")
    if not isinstance(parts, list) or not parts:
        raise ValueError("Complete Sri Lanka OSM source parts are required in data/basemap/source/")
    source.unlink(missing_ok=True)
    with source.open("wb") as output:
        for part in parts:
            part_path = ROOT / "data/basemap/source" / part["file"]
            if not part_path.is_file() or part_path.stat().st_size != part.get("bytes") or sha256(part_path) != part.get("sha256"):
                raise ValueError(f"Sri Lanka OSM source part is missing or corrupt: {part.get('file')}")
            with part_path.open("rb") as input_stream:
                shutil.copyfileobj(input_stream, output)
    actual = sha256(source)
    if actual != source_manifest["sha256"]:
        raise ValueError(f"Geofabrik Sri Lanka extract checksum mismatch: {actual}")
    return source


def write_land_polygon(source: Path) -> None:
    """Use the OSM shoreline, with only a validated land polygon as fallback."""
    target = TMP / "sri-lanka-land.geojson"
    try:
        from build_sri_lanka_land import build_land
        stats = build_land(source, target)
        print(f"Land polygon derived from OSM coastline: {stats}")
    except Exception as error:  # the shoreline upgrade must never block the basemap build
        from shapely.geometry import shape
        fallback = ROOT / "data/basemap/sri-lanka-land.geojson"
        document = json.loads(fallback.read_text())
        area = sum(shape(feature["geometry"]).area for feature in document["features"])
        if not 4.8 <= area <= 6.6:
            raise ValueError("Fallback polygon includes territorial sea or has invalid land coverage") from error
        print(f"WARNING: coastline extraction unavailable ({error}); using validated committed shoreline")
        shutil.copy2(fallback, target)


def build_archive(source: Path) -> None:
    (ROOT / "scripts/basemap").mkdir(parents=True, exist_ok=True)
    pbf_inside = "/data/sri-lanka.osm.pbf"
    config_inside = "/data/config-openmaptiles-srilanka.json"
    process_inside = "/data/process-openmaptiles.lua"
    if source.resolve() != (TMP / "sri-lanka.osm.pbf").resolve():
        shutil.copy2(source, TMP / "sri-lanka.osm.pbf")
    shutil.copy2(ROOT / "scripts/basemap/config-openmaptiles-srilanka.json", TMP / "config-openmaptiles-srilanka.json")
    shutil.copy2(ROOT / "scripts/basemap/process-openmaptiles.lua", TMP / "process-openmaptiles.lua")
    write_land_polygon(source)
    ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "docker", "run", "--rm", "-v", f"{TMP}:/data", TILEMAKER,
        "--input", pbf_inside, "--output", "/data/sri-lanka-basemap.pmtiles",
        "--config", config_inside, "--process", process_inside, "--threads", str(min(os.cpu_count() or 2, 4)),
    ], check=True)
    shutil.move(TMP / "sri-lanka-basemap.pmtiles", ARCHIVE)


def split_archive() -> dict:
    source_manifest = source_config()
    with ARCHIVE.open("rb") as archive_file:
        reader = Reader(MmapSource(archive_file))
        header = reader.header()
        metadata = reader.metadata()
    if header["tile_type"].name != "MVT" or header["tile_compression"].name != "GZIP":
        raise ValueError("Generated Sri Lanka archive must be gzip-compressed MVT PMTiles")
    size = ARCHIVE.stat().st_size
    digest = sha256(ARCHIVE)
    shutil.rmtree(CHUNKS, ignore_errors=True)
    CHUNKS.mkdir(parents=True)
    chunks = []
    with ARCHIVE.open("rb") as source:
        index = 0
        while block := source.read(CHUNK_SIZE):
            name = f"{index:05d}.bin"
            (CHUNKS / name).write_bytes(block)
            chunks.append({"file": name, "bytes": len(block), "sha256": hashlib.sha256(block).hexdigest()})
            index += 1
    descriptor = {
        "format": "MazoPMTilesRange/1", "archive": "generated/sri-lanka-basemap.pmtiles",
        "sha256": digest, "bytes": size, "chunk_size": CHUNK_SIZE, "chunk_count": len(chunks),
        "min_zoom": 0, "max_zoom": 14,
        "tile_count": header["addressed_tiles_count"], "vector_layers": metadata.get("vector_layers", []),
        "bounds": source_manifest["bounds"],
        "source": {"name": "Geofabrik Sri Lanka OSM extract", "url": source_manifest["url"],
                   "sha256": source_manifest["sha256"], "snapshot": source_manifest["snapshot"]},
        "chunks": chunks,
    }
    DESCRIPTOR.write_text(json.dumps(descriptor, indent=2) + "\n", encoding="utf-8")
    ARCHIVE.unlink()
    return descriptor


def main() -> None:
    source = download_source()
    build_archive(source)
    descriptor = split_archive()
    print(json.dumps({"archive_sha256": descriptor["sha256"], "archive_bytes": descriptor["bytes"],
                      "chunks": descriptor["chunk_count"], "chunk_size": descriptor["chunk_size"],
                      "coverage": descriptor["bounds"]}, indent=2))


if __name__ == "__main__":
    main()
