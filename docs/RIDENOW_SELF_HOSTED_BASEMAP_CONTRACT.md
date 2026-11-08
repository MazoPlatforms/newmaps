# RideNow: self-hosted basemap integration contract (proposed)

Status: design / implementation checklist; **not deployed**. Scope: Mazo Maps only; no RideNow authentication, dispatch, pricing or payment changes.

## Target

RideNow's MapLibre Native Android client should load a complete basemap from `https://maps.mazo.workers.dev/` with **no runtime dependency on third-party tile/style/glyph/sprite servers**. The Cloudflare Worker is the stable API gateway; Cloudflare R2 stores approved, immutable, versioned data. A successful HTTP 200 for a style is insufficient: every nested source, sprite and glyph URL must also resolve, and the rendered map must be validated on a physical Android device.

## Current reality and blockers

- Current `/api/v1/style.json` and `/api/v1/style/dark.json` use the Mazo places-only vector layer. They are **not** full road/building/water basemaps.
- The web UI in `assets/js/app.js` loads `https://tiles.openfreemap.org/styles/liberty` for its background. This is a third-party runtime dependency.
- The existing Android sample and RideNow integration can load the Mazo native style, but that cannot reproduce the web screenshot until a complete, licensed basemap dataset is actually imported and published.
- Never mirror arbitrary third-party tiles or bulk-download a provider's service merely because URLs are publicly reachable. Review provider terms, upstream dataset licenses, attribution, rate limits, storage rights, redistribution rights, and update obligations first. If those permissions cannot be established, obtain the underlying redistributable dataset directly from its authorized source and generate our own tiles.

## Proposed stable public API

Keep existing `/api/v1/places/search`, `/api/v1/geocode`, `/api/v1/route`, `/api/v1/version` and POI endpoints backward compatible.

Add **only after resources exist**:

- `GET /api/v1/basemap/manifest` — immutable revision, coverage bounds, min/max zoom, dataset provenance, license/attribution, hashes and resource sizes.
- `GET /api/v1/basemap/style/light.json`
- `GET /api/v1/basemap/style/dark.json`
- `GET /api/v1/basemap/tiles/{z}/{x}/{y}.pbf?rev={sha}`
- `GET /api/v1/basemap/fonts/{fontstack}/{range}.pbf?rev={sha}`
- `GET /api/v1/basemap/sprite.json?rev={sha}` and `sprite.png`, including `@2x` variants.

Style JSON must contain **only same-origin HTTPS URLs** for source tiles, glyphs and sprites. Do not rewrite arbitrary user-supplied upstream URLs through an open proxy. Publish a dedicated `source-layer` for each layer family (transportation, water, landcover, landuse, buildings, boundaries, labels) with documented schema and zoom ranges. Overlay the existing `places` source on top.

Cache semantics: revision-pinned immutable resources get `Cache-Control: public, max-age=31536000, immutable`, correct content type, ETag and safe CORS; mutable manifest/style use short TTL and revalidation. Empty valid tiles may return 204; missing/invalid resources must return an explicit status, never a silent blank map. Support a rollback to a previous immutable revision.

## Dataset ingestion (offline CI/job, NOT Worker request-time scraping)

1. Select a legally redistributable source snapshot with documented provenance, timestamp, coverage and attribution. Record any ODbL/other share-alike obligations and obtain legal review when required.
2. Generate vector tiles from the approved dataset; validate topology, geometry, layer names, zooms, bounds, UTF-8 names, and gzip/MVT encoding.
3. Generate or license compatible glyphs and sprites; host them in R2. Avoid requiring network calls to any other hostname.
4. Produce a manifest with SHA-256 hashes and byte counts; upload versioned artifacts to R2 using a controlled deployment job.
5. Verify a representative tile matrix (coastal, dense city, rural, no-data), style URL closure, cache headers, attribution and Android rendering; only then atomically activate the revision.
6. Retain prior revision for rollback. Rebuild from source snapshots rather than endlessly accumulating third-party HTTP cache entries.

## RideNow Android contract

- Android MapLibre loads the Mazo basemap light/dark style URLs after the new API is deployed and validated. Existing Mazo search, geocode and routing remain unchanged.
- Do not embed full basemap tiles in the APK. Android's resource cache and optional user-selected offline regions are separate from server-side R2 storage.
- Display explicit loading/error states and log style/source/tile failures; a blank dark background is not success.
- Limit GPS updates and request rates; honor HTTP 429 and Retry-After. Local route coverage limitations must remain visible.
- Reduce APK size with ABI splits/App Bundle as a separate RideNow build task; measure the generated per-ABI APKs before claiming savings.

## Acceptance criteria (must all pass before marking complete)

- Both styles load in Android and the browser with roads, buildings, water and names in a documented coverage region.
- All transitive style resources are served by `maps.mazo.workers.dev` and remain available with third-party tile hosts blocked.
- A representative Android physical-device test demonstrates pan, zoom, GPS, search, pickup/drop pin and route preview.
- Every published resource has source/license/attribution records, SHA-256 version, and rollback support.
- No change to RideNow authentication, ride booking, dispatch or payments.
- Existing Mazo POI, search and route contract tests continue passing.

**Do not describe this as implemented until the ingest pipeline, R2 resources, Worker endpoints, integration tests and Android device checks actually pass.**
