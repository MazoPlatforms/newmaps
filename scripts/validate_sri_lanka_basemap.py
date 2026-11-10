#!/usr/bin/env python3
"""Validate source parts, chunk hashes, PMTiles metadata, and every MVT tile."""
import gzip
import hashlib
import json
import tempfile
from pathlib import Path

from mapbox_vector_tile import decode
from pmtiles.reader import MmapSource, Reader, all_tiles

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "generated"
SOURCE = json.loads((ROOT / "data/basemap/sri-lanka-source.json").read_text(encoding="utf-8"))
DESCRIPTOR = json.loads((GENERATED / "sri-lanka-basemap-range.json").read_text(encoding="utf-8"))
CHUNKS = GENERATED / "sri-lanka-basemap-pmtiles-chunks"
REQUIRED_LAYERS = {"country_land", "transportation", "building", "water", "landcover", "landuse"}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def validate() -> dict:
    if SOURCE.get("format") != "MazoBasemapSource/1" or DESCRIPTOR.get("format") != "MazoPMTilesRange/1":
        raise ValueError("Unsupported Sri Lanka basemap source or output manifest")
    source_parts = SOURCE.get("repository_parts") or []
    if not source_parts:
        raise ValueError("Repository source PBF parts are missing")
    source_bytes = 0
    source_hash = hashlib.sha256()
    for part in source_parts:
        raw = (ROOT / "data/basemap/source" / part["file"]).read_bytes()
        if len(raw) != part["bytes"] or sha256(raw) != part["sha256"]:
            raise ValueError(f"Source PBF part checksum mismatch: {part['file']}")
        source_hash.update(raw)
        source_bytes += len(raw)
    if source_bytes <= 100_000_000 or source_hash.hexdigest() != SOURCE["sha256"]:
        raise ValueError("Whole Sri Lanka source extract size or SHA-256 mismatch")

    if DESCRIPTOR.get("chunk_count") != len(DESCRIPTOR.get("chunks", [])):
        raise ValueError("Basemap chunk count does not match its descriptor")
    if DESCRIPTOR.get("chunk_size") != 1024 * 1024:
        raise ValueError("Basemap PMTiles chunk size must stay fixed at 1 MiB")
    archive_hash = hashlib.sha256()
    archive_bytes = 0
    with tempfile.TemporaryDirectory(prefix="mazo-basemap-validate-") as temporary:
        archive_path = Path(temporary) / "sri-lanka.pmtiles"
        with archive_path.open("wb") as archive:
            for index, chunk in enumerate(DESCRIPTOR["chunks"]):
                expected_name = f"{index:05d}.bin"
                if chunk["file"] != expected_name:
                    raise ValueError(f"Basemap chunks are not contiguous at {expected_name}")
                raw = (CHUNKS / expected_name).read_bytes()
                if len(raw) != chunk["bytes"] or sha256(raw) != chunk["sha256"]:
                    raise ValueError(f"Basemap chunk checksum mismatch: {expected_name}")
                archive.write(raw)
                archive_hash.update(raw)
                archive_bytes += len(raw)
        if archive_bytes != DESCRIPTOR["bytes"] or archive_hash.hexdigest() != DESCRIPTOR["sha256"]:
            raise ValueError("Reassembled PMTiles archive length or full SHA-256 mismatch")

        with archive_path.open("rb") as source:
            tile_source = MmapSource(source)
            reader = Reader(tile_source)
            header = reader.header()
            metadata = reader.metadata()
            if header["version"] != 3 or header["tile_type"].name != "MVT" or header["tile_compression"].name != "GZIP":
                raise ValueError("Basemap archive is not gzip-compressed PMTiles v3 MVT")
            if (header["min_zoom"], header["max_zoom"]) != (0, 14):
                raise ValueError("Basemap archive does not declare zoom range 0–14")
            bounds = [header["min_lon_e7"] / 1e7, header["min_lat_e7"] / 1e7,
                      header["max_lon_e7"] / 1e7, header["max_lat_e7"] / 1e7]
            if any(abs(actual - expected) > 1e-6 for actual, expected in zip(bounds, SOURCE["bounds"])):
                raise ValueError("Basemap archive bounds disagree with the human-readable source manifest")
            metadata_layers = {layer["id"] for layer in metadata.get("vector_layers", [])}
            if not REQUIRED_LAYERS.issubset(metadata_layers):
                raise ValueError(f"PMTiles metadata is missing required map layers: {sorted(REQUIRED_LAYERS - metadata_layers)}")
            decoded_layers = set()
            tile_count = 0
            country_at_world_zoom = False
            for (zoom, x, y), compressed in all_tiles(tile_source):
                tile = decode(gzip.decompress(compressed))
                decoded_layers.update(tile)
                tile_count += 1
                if (zoom, x, y) == (0, 0, 0):
                    country_at_world_zoom = bool(tile.get("country_land", {}).get("features"))
            if tile_count != header["addressed_tiles_count"] or tile_count != DESCRIPTOR.get("tile_count"):
                raise ValueError("PMTiles addressed tile count disagrees with its descriptor")
            if not REQUIRED_LAYERS.issubset(decoded_layers):
                raise ValueError(f"No decoded MVT payloads found for required layers: {sorted(REQUIRED_LAYERS - decoded_layers)}")
            if not country_at_world_zoom:
                raise ValueError("Whole-country land polygon is missing from the world zoom tile")
    return {"source_bytes": source_bytes, "source_parts": len(source_parts), "source_sha256": source_hash.hexdigest(),
            "archive_bytes": archive_bytes, "archive_chunks": DESCRIPTOR["chunk_count"],
            "archive_sha256": archive_hash.hexdigest(), "tiles_decoded": tile_count,
            "vector_layers": sorted(metadata_layers), "decoded_layers": sorted(decoded_layers), "bounds": bounds}


if __name__ == "__main__":
    print(json.dumps(validate(), indent=2))
