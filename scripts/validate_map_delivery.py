#!/usr/bin/env python3
"""Validate generated PMTiles, MVT identity/coverage and compact search manifest."""
import gzip
import hashlib
import json
from pathlib import Path

from mapbox_vector_tile import decode
from pmtiles.reader import MmapSource, Reader, all_tiles
from pmtiles.tile import tileid_to_zxy

import build_map_delivery as build


def validate():
    if not build.TILE_ARCHIVE.is_file() or not build.SEARCH_INDEX.is_file():
        raise ValueError("PMTiles archive or search index is missing; run scripts/build_map_delivery.py")
    manifest = json.loads(build.MANIFEST.read_text(encoding="utf-8"))
    delivery = manifest.get("delivery", {})
    tile_entry = delivery.get("mvt_pmtiles", {})
    search_entry = delivery.get("search_index", {})
    details_entry = delivery.get("place_details", {})
    archive_data = build.TILE_ARCHIVE.read_bytes()
    search_data = build.SEARCH_INDEX.read_bytes()
    details_data = build.DETAIL_INDEX.read_bytes()
    if hashlib.sha256(archive_data).hexdigest() != tile_entry.get("sha256"):
        raise ValueError("PMTiles checksum does not match generated manifest")
    if hashlib.sha256(search_data).hexdigest() != search_entry.get("sha256"):
        raise ValueError("Search index checksum does not match generated manifest")
    if hashlib.sha256(details_data).hexdigest() != details_entry.get("sha256"):
        raise ValueError("Place details checksum does not match generated manifest")
    collection = json.loads(build.MZP.read_text(encoding="utf-8"))
    expected = {feature["id"]: feature for feature in collection["features"]}
    if len(expected) != len(collection["features"]):
        raise ValueError("MZP has duplicate feature IDs")
    search = json.loads(search_data)
    if search.get("version") != 1 or not isinstance(search.get("fields"), list):
        raise ValueError("Unsupported compact search index format")
    search_rows = [dict(zip(search["fields"], row)) for row in search.get("records", [])]
    search_ids = [row.get("id") for row in search_rows]
    canonical_records, _, _ = build.places.load_places()
    public_records = {record["id"]: record for record in canonical_records
                      if build.places.classify_place(record)["eligible_for_public_map"]}
    if len(search_ids) != len(set(search_ids)) or set(search_ids) != set(public_records):
        raise ValueError("Search index does not exactly cover all eligible canonical places")
    if len(expected) != tile_entry.get("features") or len(search_ids) != search_entry.get("records"):
        raise ValueError("Delivery record counts disagree with the MZP source")
    expected_search_fields = {"id", "name", "coordinates", "categories", "discoveryCategory"}
    if not expected_search_fields.issubset(search["fields"]):
        raise ValueError("Search index omits required place discovery fields")
    for row in search_rows:
        record = public_records[row["id"]]
        coord = record.get("coordinates")
        expected_coords = [coord["longitude"], coord["latitude"]] if isinstance(coord, dict) else None
        props = {key: value for key, value in record.items() if key not in {"id", "coordinates"}}
        if (row.get("name") != props.get("name") or
                row.get("categories") != props.get("categories") or
                row.get("discoveryCategory") != build.discovery_kind(props) or
                row.get("address") != props.get("address") or
                row.get("coordinates") != expected_coords):
            raise ValueError(f"Search index changed canonical display data for {row['id']}")
    details = json.loads(details_data)
    detail_ids = [row[0] for row in details.get("records", [])]
    if len(detail_ids) != len(set(detail_ids)) or set(detail_ids) != set(public_records):
        raise ValueError("Place details index does not exactly cover all eligible canonical places")
    if len(detail_ids) != details_entry.get("records"):
        raise ValueError("Place details index count does not match manifest")

    archive = open(build.TILE_ARCHIVE, "rb")
    try:
        get_bytes = MmapSource(archive)
        reader = Reader(get_bytes)
        header = reader.header()
        metadata = reader.metadata()
        if header["tile_type"].name != "MVT" or header["tile_compression"].name != "GZIP":
            raise ValueError("Archive is not a gzip-compressed MVT PMTiles archive")
        if (header["min_zoom"], header["max_zoom"]) != (build.MIN_ZOOM, build.MAX_ZOOM):
            raise ValueError("PMTiles zoom metadata mismatch")
        if metadata.get("vector_layers", [{}])[0].get("id") != "places":
            raise ValueError("PMTiles vector layer metadata is missing")
        decoded = {}
        seen_by_zoom = {}
        tile_count = 0
        for (zoom, x, y), compressed in all_tiles(get_bytes):
            tile_count += 1
            payload = decode(gzip.decompress(compressed))
            layer = payload.get("places")
            if layer is None:
                raise ValueError(f"Tile {zoom}/{x}/{y} has no places layer")
            for feature in layer.get("features", []):
                place_id = feature.get("properties", {}).get("id")
                if not place_id:
                    raise ValueError(f"Tile {zoom}/{x}/{y} has a feature without a stable ULID property")
                seen = seen_by_zoom.setdefault(zoom, set())
                if place_id in seen:
                    raise ValueError(f"Feature {place_id} is duplicated between tiles at z{zoom}")
                seen.add(place_id)
                expected_priority = build.priority(build.discovery_kind(expected[place_id]["properties"]))
                if not build.visible_from_zoom(expected_priority, zoom):
                    raise ValueError(f"Feature {place_id} appears below its priority zoom band")
                if zoom == build.MAX_ZOOM:
                    if place_id in decoded:
                        raise ValueError(f"Feature {place_id} is duplicated between tiles at z{zoom}")
                    decoded[place_id] = (zoom, x, y, feature)
        if set(decoded) != set(expected):
            missing = len(set(expected) - set(decoded))
            extra = len(set(decoded) - set(expected))
            raise ValueError(f"High-zoom MVT feature coverage mismatch (missing={missing}, extra={extra})")
        for zoom in range(build.MIN_ZOOM, build.MAX_ZOOM + 1):
            wanted = {feature_id for feature_id, feature in expected.items()
                      if build.visible_from_zoom(build.priority(build.discovery_kind(feature["properties"])), zoom)}
            if seen_by_zoom.get(zoom, set()) != wanted:
                raise ValueError(f"Progressive tile coverage does not match category policy at z{zoom}")
        for place_id, (_, x, y, feature) in decoded.items():
            source = expected[place_id]
            lon, lat = source["geometry"]["coordinates"]
            wanted_x, wanted_y = build.tile_xy(lon, lat, build.MAX_ZOOM)
            if (x, y) != (wanted_x, wanted_y):
                raise ValueError(f"Feature {place_id} has an incorrect z{build.MAX_ZOOM} tile coordinate")
            properties = feature["properties"]
            expected_kind = build.discovery_kind(source["properties"])
            if (properties.get("kind") != expected_kind or properties.get("priority") != build.priority(expected_kind) or
                    properties.get("name") != source["properties"].get("name")):
                raise ValueError(f"Feature {place_id} lost category or priority attributes")
            point = feature["geometry"]
            coordinates = point.get("coordinates")
            if point.get("type") != "Point" or not coordinates or len(coordinates) != 2:
                raise ValueError(f"Feature {place_id} does not have point geometry")
            # Quantization error must be bounded to one grid unit in projected tile space.
            normalized_x = (coordinates[0] / build.EXTENT)
            normalized_y = (coordinates[1] / build.EXTENT)
            if not (0 <= normalized_x <= 1 and 0 <= normalized_y <= 1):
                raise ValueError(f"Feature {place_id} coordinate is outside its tile extent")
            lon, lat = source["geometry"]["coordinates"]
            mx, my = build.mercator(lon, lat)
            world = 2 * build.MERCATOR_LIMIT
            west = x / (1 << build.MAX_ZOOM) * world - build.MERCATOR_LIMIT
            north = build.MERCATOR_LIMIT - y / (1 << build.MAX_ZOOM) * world
            expected_x = (mx - west) / world * (1 << build.MAX_ZOOM) * build.EXTENT
            expected_y = build.EXTENT - (north - my) / world * (1 << build.MAX_ZOOM) * build.EXTENT
            if abs(coordinates[0] - expected_x) > 1.01 or abs(coordinates[1] - expected_y) > 1.01:
                raise ValueError(f"Feature {place_id} exceeds the documented one-grid-unit coordinate precision")
        if tile_count != tile_entry.get("tiles"):
            raise ValueError("PMTiles tile count does not match manifest")
    finally:
        archive.close()
    aliases = manifest.get("aliases", {})
    alias_source = json.loads((build.ROOT / "data/places/aliases.json").read_text())["aliases"]
    if aliases != {key: build.places.resolve_place_id(key, alias_source) for key in alias_source}:
        raise ValueError("Delivery manifest does not preserve permanent alias resolution")
    return {
        "valid": True, "features": len(expected), "search_records": len(search_ids),
        "aliases": len(aliases), "tiles": tile_count, "min_zoom": header["min_zoom"],
        "max_zoom": header["max_zoom"], "archive_bytes": len(archive_data),
        "search_index_bytes": len(search_data), "search_index_gzip_bytes": len(gzip.compress(search_data, mtime=0)),
        "details_index_bytes": len(details_data), "details_index_gzip_bytes": len(gzip.compress(details_data, mtime=0)),
    }


if __name__ == "__main__":
    print(json.dumps(validate(), indent=2))
