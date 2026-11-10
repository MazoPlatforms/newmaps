# Sri Lanka basemap source

`sri-lanka-source.json` is the human-readable, reviewed index for the whole-country OpenStreetMap snapshot used by the basemap build. The complete 138 MiB PBF is stored in nine 16 MiB binary parts under `source/`, each with its own SHA-256; the manifest also validates the whole-file SHA-256. To refresh coverage, replace the parts and update the dated Geofabrik URL, snapshot identifier, and per-part/full-file checksums together in that file. The build rejects missing or altered parts, so an unverified source cannot silently publish.

The reproducible pipeline in `scripts/build_sri_lanka_basemap.py` renders the extract into OpenMapTiles-schema MVT and splits its PMTiles archive into independently hashed 1 MiB range chunks. The live-data synchronizer compares each chunk by content hash, uploads only changed chunks, removes deleted files from the active manifest atomically through the Durable Object, and keeps previous revisions available for rollback. Hand-authored Mazo places, roads, boundaries, and speed-limit records remain in their existing readable JSON/GeoJSON source files under `data/`.

## Updating individual map records

Mazo-authored places, roads, and speed limits remain one JSON record per file in the existing numbered `data/places/`, `data/roads/`, and `data/speed-limits/` shards; boundaries and the country outline are readable GeoJSON. Add or edit the canonical source record there, or remove it through the repository's existing retirement/deletion rules, then let CI rebuild the search index and POI tiles. Do not hand-edit generated PMTiles or its numbered chunks. For provider-owned Sri Lanka basemap features (roads, buildings, water, labels, and land use), use OpenStreetMap as the editable source: refresh the complete dated Geofabrik extract, split it into the listed size-limited parts, update the human-readable source manifest and checksums, and rebuild. A full replacement snapshot naturally carries removals as well as additions and edits; the content-addressed sync publishes only changed chunks and atomically drops obsolete keys from the active manifest. Each source part is under GitHub's 100 MiB file limit, while delivery chunks are 1 MiB and individually checksummed.

PMTiles chunks are generated delivery artifacts; do not edit them directly. OSM feature corrections belong in OpenStreetMap and arrive through a reviewed snapshot refresh. The PBF parts are binary source storage and not intended for manual editing; human-readable Mazo places, roads, boundaries, speed limits, source metadata, and the `sri-lanka-land.geojson` country outline are committed separately. The generated MVT chunks and their manifest are synchronized to the configured R2 bucket.

Coverage is the Geofabrik Sri Lanka extract extent only: 79.164160°E–82.646120°E, 5.621275°N–10.071530°N. The build contains a country outline plus place, boundary, POI, housenumber, waterway, transportation, building, water, aeroway, park, landuse, landcover, and mountain peak layers, at zooms 0–14. The builder intentionally does not claim coverage beyond this extent or Natural Earth global background overlays.

## Attribution and licenses

- Map data: © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright).
- Vector layer schema/process: OpenMapTiles contributors, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); see the upstream attribution header in `scripts/basemap/process-openmaptiles.lua`.
- Liberty cartographic style: OpenFreeMap style assets are vendored in `assets/styles/`; see [`OPENFREEMAP-LICENSE.md`](../../assets/styles/OPENFREEMAP-LICENSE.md) for the upstream MIT / CC BY 4.0 notices.
- Glyphs: Mazo Maps Sans generated from the repository font under its bundled SIL Open Font License notices.
