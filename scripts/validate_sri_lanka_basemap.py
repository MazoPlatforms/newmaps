#!/usr/bin/env python3
"""Validate source parts, chunk hashes, PMTiles metadata, and every MVT tile."""
import gzip
import hashlib
import json
import math
import re
import tempfile
from pathlib import Path

from mapbox_vector_tile import decode
from pmtiles.reader import MmapSource, Reader, all_tiles
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "generated"
SOURCE = json.loads((ROOT / "data/basemap/sri-lanka-source.json").read_text(encoding="utf-8"))
DESCRIPTOR = json.loads((GENERATED / "sri-lanka-basemap-range.json").read_text(encoding="utf-8"))
CHUNKS = GENERATED / "sri-lanka-basemap-pmtiles-chunks"
REQUIRED_LAYERS = {"country_land", "transportation", "building", "water", "landcover", "landuse"}
INVALID_MAP_NAMES = {"none", "null", "undefined", "unknown", "n/a", "unnamed"}
NUMERIC_MAP_NAME = re.compile(r"^[\d\s.,:/#()\-]+$", re.UNICODE)
COUNTRY_INTERIOR_CHECKS = {
    "Colombo": (79.8612, 6.9271), "Jaffna": (80.0255, 9.6615),
    "Mannar": (79.91, 8.98), "Anuradhapura": (80.4037, 8.3114),
    "Kandy": (80.6337, 7.2906), "Trincomalee": (81.2335, 8.5874),
    "Batticaloa": (81.6934, 7.717), "Hambantota": (81.12, 6.1241),
    "Galle": (80.2209, 6.0535),
}


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
    land_collection = json.loads((ROOT / "data/basemap/sri-lanka-land.geojson").read_text(encoding="utf-8"))
    if len(land_collection.get("features", [])) != 1:
        raise ValueError("Sri Lanka boundary source must contain exactly one country feature")
    land_geometry = shape(land_collection["features"][0]["geometry"])
    if (not land_geometry.is_valid or land_geometry.geom_type not in {"Polygon", "MultiPolygon"}
            or land_geometry.area < 5 or land_geometry.area > 12):
        raise ValueError("Sri Lanka land boundary is invalid or outside expected geographic area")
    for place_name, point in COUNTRY_INTERIOR_CHECKS.items():
        if not land_geometry.contains(shape({"type": "Point", "coordinates": point})):
            raise ValueError(f"Country boundary is missing the interior check point: {place_name}")

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
                for layer_name, layer in tile.items():
                    for feature in layer.get("features", []):
                        for key, value in feature.get("properties", {}).items():
                            if key == "name" or key.startswith("name:"):
                                if isinstance(value, str) and (value.strip().casefold() in INVALID_MAP_NAMES
                                        or NUMERIC_MAP_NAME.fullmatch(value.strip())):
                                    raise ValueError(f"Invalid numeric or placeholder map label in {layer_name} at {zoom}/{x}/{y}: {value!r}")
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
            checked_country_tiles = set()
            for zoom in range(4, 15):
                scale = 1 << zoom
                for place_name, (longitude, latitude) in COUNTRY_INTERIOR_CHECKS.items():
                    x = min(scale - 1, max(0, int((longitude + 180) / 360 * scale)))
                    y = min(scale - 1, max(0, int((1 - math.asinh(math.tan(math.radians(latitude))) / math.pi) / 2 * scale)))
                    tile_key = (zoom, x, y)
                    if tile_key in checked_country_tiles:
                        continue
                    compressed = reader.get(*tile_key)
                    if compressed is None:
                        raise ValueError(f"Sri Lanka interior vector tile is missing at {zoom}/{x}/{y} near {place_name}")
                    country_layer = decode(gzip.decompress(compressed)).get("country_land", {})
                    if not country_layer.get("features"):
                        raise ValueError(f"Sri Lanka land geometry is missing at {zoom}/{x}/{y} near {place_name}")
                    checked_country_tiles.add(tile_key)
    return {"source_bytes": source_bytes, "source_parts": len(source_parts), "source_sha256": source_hash.hexdigest(),
            "archive_bytes": archive_bytes, "archive_chunks": DESCRIPTOR["chunk_count"],
            "archive_sha256": archive_hash.hexdigest(), "tiles_decoded": tile_count,
            "vector_layers": sorted(metadata_layers), "decoded_layers": sorted(decoded_layers),
            "country_interior_tiles_checked": len(checked_country_tiles), "bounds": bounds}


if __name__ == "__main__":
    print(json.dumps(validate(), indent=2))
