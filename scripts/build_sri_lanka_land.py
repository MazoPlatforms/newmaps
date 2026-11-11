#!/usr/bin/env python3
"""Derive the island's real shoreline polygon from OSM natural=coastline ways.

The committed data/basemap/sri-lanka-land.geojson is the OSM *administrative*
boundary, which includes ~12 nautical miles of territorial sea. Used as the
`country_land` fill it paints open water around the island as land (the swollen
North-West, the squared-off Palk Strait, missing lagoons/peninsulas).
The coastline in the OSM extract gives the true land/sea edge instead.
"""
import json
from pathlib import Path

PROPERTIES = {"osm_id": "536807", "name": "Sri Lanka", "boundary": "administrative", "admin_level": "2"}
# Sri Lanka is ~65,610 km2 (~5.4 deg2 at 7.8N). Anything far outside means bad coastline closure.
MIN_AREA_DEG2, MAX_AREA_DEG2 = 4.8, 6.6


def _ring(coords) -> list:
    return [[round(x, 6), round(y, 6)] for x, y in coords]


def build_land(pbf: Path, output: Path, tolerance: float = 0.00008) -> dict:
    import osmium
    from shapely.geometry import MultiPolygon, Polygon
    from shapely.geometry.polygon import orient
    from shapely.ops import polygonize, unary_union
    from shapely.geometry import LineString

    class Coast(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.lines = []

        def way(self, way):
            if way.tags.get("natural") != "coastline":
                return
            points = [(node.lon, node.lat) for node in way.nodes if node.location.valid()]
            if len(points) > 1:
                self.lines.append(LineString(points))

    handler = Coast()
    handler.apply_file(str(pbf), locations=True)
    if not handler.lines:
        raise RuntimeError("extract has no natural=coastline ways")
    faces = [face.buffer(0) for face in polygonize(unary_union(handler.lines))]
    land = unary_union([face for face in faces if face.area > 1e-9])
    if not MIN_AREA_DEG2 <= land.area <= MAX_AREA_DEG2:
        raise RuntimeError(f"coastline land area {land.area:.3f} deg2 is outside the expected Sri Lanka range")
    land = land.simplify(tolerance, preserve_topology=True)
    parts = list(land.geoms) if isinstance(land, MultiPolygon) else [land]
    polygons = []
    for part in parts:
        if not isinstance(part, Polygon) or part.is_empty:
            continue
        part = orient(part, 1.0)
        polygons.append([_ring(part.exterior.coords)] + [_ring(hole.coords) for hole in part.interiors])
    document = {"type": "FeatureCollection", "name": "multipolygons", "features": [{
        "type": "Feature", "properties": PROPERTIES,
        "geometry": {"type": "MultiPolygon", "coordinates": polygons}}]}
    output.write_text(json.dumps(document, separators=(",", ":")), encoding="utf-8")
    return {"polygons": len(polygons), "area_deg2": round(land.area, 3),
            "vertices": sum(len(ring) for poly in polygons for ring in poly)}
