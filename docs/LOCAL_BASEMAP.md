# Self-hosted basemap (no third-party map servers)

At runtime Mazo Maps requests **only its own origin**: vector tiles, glyphs, fonts, place tiles and the routing graph. OpenFreeMap, Google Fonts and the public OSRM routers were removed. OpenStreetMap data is used only as build-time input.

## Layout

| Path | Content |
|---|---|
| `assets/basemap/island.pmtiles` | Whole of Sri Lanka, z0-12 (OpenMapTiles schema) |
| `assets/basemap/detail.pmtiles` | Batticaloa District, z13-14 (roads, buildings; overzoomed beyond) |
| `assets/basemap/manifest.json` | Size, SHA-256, zoom range, bounds, attribution |
| `assets/basemap/fonts/MazoMapsSansRegular/*.pbf` | Glyph ranges 0-65535 built from `MazoMapsSans-Regular.ttf` |
| `assets/fonts/inter/*.woff2` | Self-hosted Inter (OFL) |
| `assets/js/local-basemap.mjs` | Style builder + verified, cached archive loader |

## One-time setup

1. Merge this PR.
2. Actions -> **One-time self-hosted basemap build** -> *Run workflow*. It downloads the Geofabrik extract and Planetiler, builds both archives, glyphs and Inter, and opens a PR with the assets.
3. Merge that PR. Deploy as usual.

Each archive must stay under 24 MiB (Cloudflare static asset limit); the job fails with advice if not. Adjust `island_maxzoom`, `detail_maxzoom` or `detail_bbox` inputs.

## Offline behaviour

Archives are fetched once, verified by SHA-256, stored in Cache Storage (`mazo-basemap-v1`) and read from memory, so the map keeps working with every external server down, and offline after the first load. Routing runs on the saved Kattankudy road graph only; outside it the app reports that no local route exists.

## Not covered

Build-time data refresh scripts (Overture roads, Overpass place fetch) still contact their upstream sources when a maintainer runs them. Cloudflare remains the hosting platform.
