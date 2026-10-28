#!/usr/bin/env python3
"""Build a compact search index and an experimental MVT/PMTiles places archive.

Canonical place JSON remains authoritative. This consumes the existing MZP build
output, so public-eligibility rules and aliases continue to come from places.py.
"""
import argparse
import hashlib
import gzip
import json
import math
import re
import sys
import warnings
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import places  # noqa: E402

try:
    import mapbox_vector_tile
    from pmtiles.tile import Compression, TileType, zxy_to_tileid
    from pmtiles.writer import write as write_pmtiles
    from shapely.geometry import Point
except ImportError as error:  # pragma: no cover - exercised by CLI error path
    raise SystemExit(
        "Map delivery dependencies are missing; install requirements-map-tiles.txt"
    ) from error

GENERATED = ROOT / "generated"
MZP = GENERATED / places.PLACE_MZP_NAME
MANIFEST = GENERATED / "manifest.json"
TILE_ARCHIVE = GENERATED / "places.pmtiles"
SEARCH_INDEX = GENERATED / "search-index.json"
DETAIL_INDEX = GENERATED / "place-details.json"
EXTENT = 4096
MIN_ZOOM = 4
MAX_ZOOM = 16
MERCATOR_LIMIT = 20037508.342789244
SEARCH_FIELDS = (
    "id", "name", "coordinates", "categories", "discoveryCategory", "address",
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def discovery_kind(properties):
    categories = " ".join(properties.get("categories", []) or []).casefold()
    rules = (
        ("atm", r"atm|cash machine"),
        ("bank", r"\bbank\b|credit union|financial institution|financial service|money transfer"),
        ("fuel", r"fuel|gas station|petrol"),
        ("auto", r"mechanic|automotive|car repair|vehicle repair|vehicle service|auto parts|motorcycle parts|car rental|car wash|vehicle dealer"),
        ("electronics", r"electronics|mobile phone|cell phone|phone store|computer|electrical|software company|telecom|telephone exchange"),
        ("government", r"government|municipal|public office|post office|council"),
        ("hardware", r"hardware|tool shop|building material"),
        ("landmark", r"landmark|historical|monument|museum|heritage|lighthouse|library|memorial"),
        ("salon", r"salon|saloon|barber|beauty"),
        ("sports", r"sport|stadium|playground"),
        ("transport", r"transport|bus station|bus stop|taxi|railway station|train station|airport|port|travel agency|airline ticket|tour operator"),
        ("market", r"grocery|market|supermarket|shopping mall|shopping centre|shopping center"),
        ("services", r"repair|service center|service centre|public service|photograph|studio|tailor|electrician|plumber|agency|consultant|agricultural|farm"),
        ("gym", r"gym|fitness"),
        ("jewelry", r"jewel|goldsmith"),
        ("school", r"school|education|college|university|tuition|learning|kindergarten|preschool"),
        ("stationery", r"stationery|print shop|bookstore|bookshop"),
        ("cafe", r"cafe|coffee|ice cream|tea shop"),
        ("food", r"bakery|restaurant|food|catering|cake shop|chicken shop|butcher|fishmonger|seafood|sweets|dessert|hawker center|bar\b"),
        ("hotel", r"hotel|lodg|guest house|resort|homestay|hostel|holiday apartment|hall|banquet"),
        ("worship", r"mosque|worship|masjid|temple|church|shrine|religious institution"),
        ("health", r"hospital|clinic|pharmacy|medical|health"),
        ("park", r"park|nature|tourism|tourist attraction|beach|recreation|garden|waterfall|community center|community centre"),
    )
    for kind, pattern in rules:
        if re.search(pattern, categories):
            return kind
    return "shop"


def priority(kind):
    if kind == "landmark":
        return 1
    if kind in {"health", "school", "government", "transport", "worship", "bank", "atm", "fuel", "hotel", "park", "sports"}:
        return 2
    return 3


def mercator(lon, lat):
    latitude = max(-85.05112878, min(85.05112878, lat))
    x = lon * MERCATOR_LIMIT / 180
    y = math.log(math.tan((90 + latitude) * math.pi / 360)) * MERCATOR_LIMIT / math.pi
    return x, y


def tile_xy(lon, lat, zoom):
    scale = 1 << zoom
    x = min(scale - 1, max(0, int((lon + 180.0) / 360.0 * scale)))
    sine = math.sin(math.radians(max(-85.05112878, min(85.05112878, lat))))
    y = min(scale - 1, max(0, int((0.5 - math.log((1 + sine) / (1 - sine)) / (4 * math.pi)) * scale)))
    return x, y


def visible_from_zoom(feature_priority, zoom):
    return (zoom >= MIN_ZOOM and
            (zoom <= 6 and feature_priority == 1 or
             7 <= zoom <= 9 and feature_priority <= 2 or
             zoom >= 10))


def read_features():
    collection = json.loads(MZP.read_text(encoding="utf-8"))
    if collection.get("type") != "FeatureCollection":
        raise ValueError("MZP source must be a GeoJSON FeatureCollection")
    return collection["features"]


def build_search_index(features):
    categories = Counter()
    fields = list(SEARCH_FIELDS)
    rows = []
    active_records, _, _ = places.load_places()
    public_records = [record for record in active_records if places.classify_place(record)["eligible_for_public_map"]]
    detail_fields = sorted({key for record in public_records for key in record if key not in {"id", "coordinates"}})
    details = []
    for record in public_records:
        props = {key: value for key, value in record.items() if key not in {"id", "coordinates"}}
        coords = record.get("coordinates")
        coordinate = [coords["longitude"], coords["latitude"]] if isinstance(coords, dict) else None
        kind = discovery_kind(props)
        categories[kind] += 1
        row = []
        for name in fields:
            if name == "id":
                value = record["id"]
            elif name == "coordinates":
                value = coordinate
            elif name == "discoveryCategory":
                value = kind
            else:
                value = props.get(name)
            row.append(value)
        rows.append(row)
        details.append([record["id"], *[props.get(field) for field in detail_fields]])
    payload = {"version": 1, "fields": fields, "records": rows}
    data = (json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    SEARCH_INDEX.write_bytes(data)
    detail_data = (json.dumps({"version": 1, "fields": detail_fields, "records": details}, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    DETAIL_INDEX.write_bytes(detail_data)
    return data, detail_data, categories, len(public_records)


def build_tiles(features):
    tiles = defaultdict(list)
    canonical_ids = set()
    for feature in features:
        feature_id = feature["id"]
        if feature_id in canonical_ids:
            raise ValueError(f"Duplicate MZP feature ID: {feature_id}")
        canonical_ids.add(feature_id)
        lon, lat = feature["geometry"]["coordinates"]
        props = feature["properties"]
        kind = discovery_kind(props)
        importance = priority(kind)
        point = Point(*mercator(lon, lat))
        compact = {"id": feature_id, "name": props["name"], "kind": kind, "priority": importance}
        for zoom in range(MIN_ZOOM, MAX_ZOOM + 1):
            if not visible_from_zoom(importance, zoom):
                continue
            x, y = tile_xy(lon, lat, zoom)
            # The full ULID is kept as a property and promoted by MapLibre. MVT's
            # optional uint64 feature-id field cannot represent a 128-bit ULID.
            tiles[(zoom, x, y)].append({"geometry": point, "properties": compact})

    min_lon = min(f["geometry"]["coordinates"][0] for f in features)
    min_lat = min(f["geometry"]["coordinates"][1] for f in features)
    max_lon = max(f["geometry"]["coordinates"][0] for f in features)
    max_lat = max(f["geometry"]["coordinates"][1] for f in features)
    metadata = {
        "name": "Mazo Maps Places",
        "format": "pbf",
        "version": "1",
        "description": "Public place symbols; canonical details are served by the separate search index.",
        "vector_layers": [{
            "id": "places", "description": "Progressively visible public places",
            "minzoom": MIN_ZOOM, "maxzoom": MAX_ZOOM,
            "fields": {"id": "String", "name": "String", "kind": "String", "priority": "Number"},
        }],
    }
    header = {
        "tile_type": TileType.MVT,
        "tile_compression": Compression.GZIP,
        "min_zoom": MIN_ZOOM,
        "max_zoom": MAX_ZOOM,
        "min_lon_e7": round(min_lon * 10_000_000),
        "min_lat_e7": round(min_lat * 10_000_000),
        "max_lon_e7": round(max_lon * 10_000_000),
        "max_lat_e7": round(max_lat * 10_000_000),
        "center_zoom": 8,
        "center_lon_e7": round((min_lon + max_lon) * 5_000_000),
        "center_lat_e7": round((min_lat + max_lat) * 5_000_000),
    }
    with write_pmtiles(TILE_ARCHIVE) as writer:
        for (zoom, x, y), tile_features in sorted(tiles.items(), key=lambda item: zxy_to_tileid(*item[0])):
            west = x / (1 << zoom) * 2 * MERCATOR_LIMIT - MERCATOR_LIMIT
            east = (x + 1) / (1 << zoom) * 2 * MERCATOR_LIMIT - MERCATOR_LIMIT
            north = MERCATOR_LIMIT - y / (1 << zoom) * 2 * MERCATOR_LIMIT
            south = MERCATOR_LIMIT - (y + 1) / (1 << zoom) * 2 * MERCATOR_LIMIT
            # mapbox-vector-tile 2.2.0 currently calls Shapely's deprecated
            # ops.transform helper internally. Keep that dependency warning
            # from flooding builds while preserving all other warnings.
            with warnings.catch_warnings():
                warnings.filterwarnings(
                    "ignore",
                    message=r"The 'shapely\.ops\.transform\(\)' function is deprecated\.",
                    category=DeprecationWarning,
                    module=r"mapbox_vector_tile\.encoder",
                )
                encoded = mapbox_vector_tile.encode(
                    [{"name": "places", "features": tile_features}],
                    default_options={"quantize_bounds": (west, south, east, north), "extents": EXTENT},
                )
            writer.write_tile(zxy_to_tileid(zoom, x, y), gzip.compress(encoded, compresslevel=9, mtime=0))
        writer.finalize(header, metadata)
    return len(tiles), canonical_ids, header, metadata


def build():
    if not MZP.exists() or not MANIFEST.exists():
        raise ValueError("Build MZP first with: python scripts/places.py build")
    features = read_features()
    search_data, detail_data, categories, eligible_records = build_search_index(features)
    tile_count, ids, header, metadata = build_tiles(features)
    archive_data = TILE_ARCHIVE.read_bytes()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest["delivery"] = {
        "mvt_pmtiles": {
            "file": TILE_ARCHIVE.name, "sha256": digest(archive_data), "bytes": len(archive_data),
            "features": len(ids), "tiles": tile_count, "min_zoom": header["min_zoom"],
            "max_zoom": header["max_zoom"], "tile_type": "MVT", "compression": "gzip",
            "metadata_sha256": digest(json.dumps(metadata, sort_keys=True, separators=(",", ":")).encode()),
        },
        "search_index": {
            "file": SEARCH_INDEX.name, "sha256": digest(search_data), "bytes": len(search_data),
            "gzip_bytes": len(gzip.compress(search_data, compresslevel=9, mtime=0)), "records": eligible_records,
            "fields": list(SEARCH_FIELDS), "categories": dict(sorted(categories.items())),
        },
        "place_details": {
            "file": DETAIL_INDEX.name, "sha256": digest(detail_data), "bytes": len(detail_data),
            "gzip_bytes": len(gzip.compress(detail_data, compresslevel=9, mtime=0)), "records": eligible_records,
        },
        "production_default": "mzp",
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "features": len(features), "pmtiles_bytes": len(archive_data), "pmtiles_sha256": digest(archive_data),
        "tile_count": tile_count, "search_index_bytes": len(search_data),
        "search_index_gzip_bytes": len(gzip.compress(search_data, compresslevel=9, mtime=0)), "category_counts": dict(sorted(categories.items())),
        "detail_index_bytes": len(detail_data), "detail_index_gzip_bytes": len(gzip.compress(detail_data, compresslevel=9, mtime=0)),
        "search_records": eligible_records,
    }, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Validate archives and manifest without rewriting artifacts")
    args = parser.parse_args()
    try:
        if not args.check:
            build()
        from validate_map_delivery import validate
        result = validate()
        print(json.dumps(result, indent=2))
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
