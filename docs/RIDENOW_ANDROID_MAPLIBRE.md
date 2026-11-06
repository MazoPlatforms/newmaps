# RideNow Android map integration

This document defines the Mazo Maps API boundary for both RideNow Rider and Driver apps. It does not change the separate RideNow repository. Use Kotlin/Jetpack Compose and MapLibre Native; the style and XYZ PBF endpoints below do not require the web-only PMTiles protocol plug-in, an API key, a Mapbox token, or a third-party basemap.

## Current production data and coverage

`GET https://maps.mazo.workers.dev/api/v1/manifest` currently describes a PMTiles archive with one vector layer, `places` (4,498 public place features at zooms 4–16). It does **not** contain roads, buildings, water, land use, or road-name layers. The style therefore draws place symbols over a neutral background; it is not a complete cartographic basemap. It does not claim nationwide basemap coverage. The public-place coordinate extent is derived from the archive header; a known negative-longitude source outlier is retained as source data and must be corrected through the GitHub data review process.

The locally routable road graph is limited to Kattankudy. It uses the repository's available road geometry, returns up to three alternatives, route LineString coordinates, distance in metres, estimated duration in seconds, and endpoint snap distances. Durations use average speeds by road class, not verified posted speeds. Endpoints outside the graph's 80 m snap tolerance return HTTP 422 `snap_too_far`; disconnected points return `no_connected_route`. Do not display a route outside local coverage as if it were locally verified.

The web app has a versioned offline pack. The Android sample below reports offline/error state and can use MapLibre's local resource cache, but does not implement explicit downloadable offline-region management. Treat offline map availability as opportunistic until an `OfflineManager` region lifecycle, storage sizing, and refresh UI are added and verified on devices.

## Native MapLibre resources

- Light style: `GET /api/v1/style.json`
- Dark style: `GET /api/v1/style/dark.json` (or light style with `?theme=dark`)
- TileJSON: `GET /api/v1/tiles.json`
- XYZ tiles: `GET /api/v1/tiles/{z}/{x}/{y}.pbf`
- Glyph PBF: `GET /api/v1/fonts/Mazo%20Maps%20Sans%20Regular/{range}.pbf?revision=<revision>`
- Sprite JSON/PNG: `/api/v1/sprite.json`, `/api/v1/sprite.png`, `/api/v1/sprite@2x.json`, `/api/v1/sprite@2x.png`

TileJSON declares `scheme: xyz`, zooms 4–16, MVT layer `places`, source bounds, attribution, and a revision-pinned tile URL. MVT responses use `application/vnd.mapbox-vector-tile`, gzip content encoding, ETag, public CORS, and immutable caching because the tile URL includes the data revision. A valid coordinate with no tile returns 204; malformed XYZ coordinates return 400; a revision that is no longer active returns 409. Style/TileJSON resources are revalidated, while glyphs and sprite images are immutable. High-volume PBF traffic uses a separate per-IP limiter (1,200 requests/minute); search and route APIs retain the 60/minute limiter. Edge/cache delivery can reduce R2 reads; the app should still bound retries and honor 429 `Retry-After`.

The Worker reads the PMTiles header, compressed root/leaf directory, and only the requested compressed MVT payload with R2 range reads. It does not download or buffer the archive to produce a tile. Directory data is cached per isolate and archive SHA; public tile responses are cacheable by immutable versioned URLs. The archive is currently POI-only, so this efficient delivery does not add absent basemap layers.

## API contracts and client policy

Base URL: `https://maps.mazo.workers.dev/api/v1`. Public map data is read-only, so Rider and Driver clients need no secret. TLS is required. CORS is `*`; it does not authenticate clients. Never ship `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, or `MAZO_LIVE_DATA_HMAC_SECRET` in an APK.

- `GET /manifest`: active data revision and immutable dataset resources.
- `GET /places/search?q=...&limit=...`: compact ranked places; limit 1–25 and query maximum 120 characters.
- `GET /geocode?q=...&limit=...`: GeoJSON FeatureCollection, `[longitude, latitude]` order.
- `POST /route`: JSON `{ "start_lon": 81.72, "start_lat": 7.70, "end_lon": 81.75, "end_lat": 7.66, "profile": "driving" }`; supported profiles are `driving`, `walking`, `cycling`.
- `GET /version`: poll every 15 seconds while the map screen is visible. Send `If-None-Match`; 304 means no change. On a new revision reload the style/TileJSON and invalidate app-level API data, but preserve an explicitly saved offline region until the user refreshes it.

Use OkHttp calls from cancellable coroutines, debounce search around 300 ms, cancel the preceding call as the query changes, and treat HTTP 400/409/422/429/503 distinctly. Respect `Retry-After`; do not retry invalid coordinates or unsupported coverage. GPS remains on-device until a user action sends route endpoints; tell the user when that happens.

## Rider and Driver behavior

Both apps share the same public style, tile, search, geocode, and routing contracts. Rider can search a destination, show its selected-place symbol, request a route from the current location, and display distance/estimated time plus an explicit local-coverage error. Driver can select a pickup/drop-off and request the same profile-specific route; its assignment/trip state remains RideNow-owned and should not be written to Mazo Maps. Keep network calls and GPS permission state scoped to the visible map screen. Search/routing results are data snapshots tagged with `X-Mazo-Data-Revision`.

## Minimal Compose example

`android-example/` is a small standalone Gradle application with a MapLibre Native MapView hosted by Compose, style switching, debounced/cancellable search, selection markers, optional GPS, route geometry, and visible loading/offline/error feedback. It deliberately has no RideNow application dependency. Android SDK/Gradle compilation is not part of this repository's current CI; run it with Android SDK 35 installed before copying code into either RideNow app.

## Basemap follow-up

Before presenting Mazo as a full basemap, add a separately reproducible pipeline that pins an authoritative open dataset and its snapshot date, records its exact license/attribution, creates land/water/land-use/building/transportation MVT layers, validates a representative tile matrix, and uploads through the existing content-addressed synchronization protocol. No such licensed complete basemap archive or source pipeline exists in this repository today. Do not point Android back to the old GitHub Pages style URLs; the referenced base/transportation/buildings archive URLs currently return 404. Do not treat `kattankudy-all-roads.json` as redistributable basemap input: its file metadata says “Property of Mazo,” and its road tags alone are not a complete open basemap.
