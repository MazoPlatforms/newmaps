# Phase 8: Vector tile delivery experiment

## Status and migration choice

The branch adds reproducible MVT/PMTiles and compact-search builds while keeping MZP as the production default and fallback. The PMTiles renderer is opt-in with `?delivery=pmtiles`. This is deliberate: the branch cannot verify the new archive over the deployed GitHub Pages URL or measure actual browser/device performance until it is deployed. Do not switch the default or remove MZP before those checks.

The canonical `data/places` JSON, permanent IDs, aliases, roads, speed limits, supplementary maxspeed evidence and existing MZP serialization are unchanged.

## Build

```sh
python -m pip install 'shapely>=2,<3' -r requirements-map-tiles.txt
python scripts/places.py build
python scripts/build_map_delivery.py
python scripts/validate_map_delivery.py
python scripts/benchmark_map_delivery.py
```

Pinned build dependencies are `mapbox-vector-tile==2.2.0` and `pmtiles==3.8.1`. The maintained PMTiles browser protocol is vendored from `pmtiles@4.5.0` under BSD-3-Clause at `assets/vendor/pmtiles-4.5.0.js`, with its license alongside. No data-format conversion dependency is added to the browser.

## Archive and symbol rules

The generated `places.pmtiles` archive contains a `places` MVT vector layer, gzip-compressed tile payloads, PMTiles v3 directories, geographic bounds derived from the actual MZP features and zoom levels 4–16. MVT coordinates are projected to Web Mercator before tile quantization. At z16 the grid step is about 0.15 m at the equator; source longitude/latitude remains unchanged in canonical records and the search/details payloads.

Each MVT feature carries the full permanent ULID in its `id` property. MapLibre promotes that ULID with `promoteId`; the optional MVT uint64 ID is omitted because it cannot hold a 128-bit ULID. Map symbols carry only the ID, display name, category key and deterministic priority. Complete details are separate and fetched only after a place is selected.

Progressive tiles use category-derived tiers: landmarks at z4–6, landmarks and public institutions at z7–9, and every eligible geographic place at z10–16. This affects symbol visibility only. The independent search index covers all 4,500 eligible active records, including the two public records without coordinates; the map archive has 4,498 geographic features. Search remains available independently of viewport tiles. MapLibre collision placement and the existing selected-place layer remain active.

## Verification and benchmark interpretation

`reports/phase8-baseline.json` stores the measured pre-experiment source counts, MZP size and current live Pages Range result. `reports/phase8-benchmark.json` records PMTiles sizes and local viewport tile payload reads for a 1280 × 800 viewport at world, Sri Lanka, Batticaloa, Kattankudy and street zoom levels. Tile byte totals exclude archive directories, metadata, HTTP headers, retries and cache behavior; they are not browser transfer measurements.

The live site currently returns `206 Partial Content` with `Accept-Ranges: bytes` for the deployed MZP. That does not verify PMTiles Range support because this branch's archive is not yet deployed. No browser automation or Android device was available in the Codespace, so there are no claimed render-readiness, interaction frame-time, browser memory, throttled-network or device results. A seven-trial Node CPU benchmark compares JSON parse, index setup and repeated query work; it is not a browser or rendering benchmark. The archive is valid locally, and the protocol integration performs a header/metadata check before using it, then falls back to MZP on source failure.

PMTiles alone is not smaller as a whole-file transfer than gzip MZP for this dataset. It may reduce map transfer when the requested viewport touches only a small subset of tiles. The search index is fetched only when a user searches or requests nearby discovery, not during the PMTiles map's initial load. The current evidence is insufficient to declare the new frontend faster overall or promote it to the default.

Seven-trial Node v24.21.0 CPU benchmark (median / p95):

| Operation | MZP GeoJSON | Compact search index |
|---|---:|---:|
| Gzip payload | 332,479 B | 230,218 B |
| JSON parse | 17.87 / 39.47 ms | 3.52 / 5.21 ms |
| Decode and initialize search index | 37.50 / 56.51 ms | 34.20 / 39.53 ms |
| 100 searches | 3,711.67 / 5,184.46 ms | 3,429.34 / 3,551.02 ms |

This compares Node CPU work only. It does not show browser startup or map rendering performance. In particular, the PMTiles map path can initially load without the search index, but a browser search fetches and decodes all 4,500 eligible search records.

## Offline and update feasibility

PMTiles supports range-based reads and browser-side caching, but this implementation does not provide offline maps. The basemap, web app, search index and place details are not all guaranteed to be cached for offline use. A future offline mode would need a version/checksum keyed archive cache, quota-aware storage, atomic switch after integrity verification, plus basemap and app-asset caching. Current Pages deployment publishes generated files with the site; manifest checksums version the archive URL, while Pages cache headers remain outside this repository's control.

## Production validation still required

After a reviewed deployment, verify the manifest points to the archive, request actual PMTiles header/directory/tile byte ranges from Pages, confirm `Content-Range`, inspect browser Network requests, test world through street zoom, category filters, search selection and detail sheet, then repeat with Android Chrome and throttled cold/warm cache. Only then compare against MZP and decide whether PMTiles should become the default. Until that evidence exists, MZP remains enabled and authoritative for production rendering.
