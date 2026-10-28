# Phases 12–14: Routing, Geographic Search, and Offline Data

## Scope and preserved data

This change does not modify canonical place JSON, ULIDs, aliases, roads, speed limits, or supplementary maxspeed records. Places continue to render from the production PMTiles archive; canonical place data remains authoritative. The existing road and speed review MZP outputs remain in place.

The public road collection has 3,710 canonical records and is not a district-wide navigation graph. A separate bundled road geometry file contains 2,102 Kattankudy-area ways. The routing builder uses those geometries and their access/direction tags only; its measured envelope is a data extent, not an administrative boundary. On the current source it builds 7,990 graph nodes, 9,089 segments, and 14/22/16 weak components for driving/walking/cycling respectively. Largest components contain 6,635/7,518/7,353 nodes. Do not interpret these statistics as proof that every street or connection is present.

## Routing behavior

The build creates a deterministic derived graph with coordinates rounded to seven decimal places. It applies available access and one-way tags, snaps both route endpoints to a routable segment within 80 metres, and rejects disconnected routes. Walking remains bidirectional on ordinary one-way streets unless a foot restriction says otherwise. Cycling follows one-way restrictions unless `oneway:bicycle=no` is present. The route search uses Dijkstra and offers up to three distinct paths when alternatives exist.

Local route distance follows road geometry. Local ETA uses clearly labeled average speeds by road class because the available speed-limit records are unverified and are not used as routing speeds. The source has no turn-restriction relations or lane guidance; locally generated turn prompts are geometry-derived, approximate guidance. GPS rerouting requires repeated off-route samples and a cooldown. Routes outside local graph coverage use distinct public driving, walking, or cycling services when online. The UI tells users that coordinates are sent to those services. There is no straight-line fallback.

Current local route coverage is Kattankudy-area only. No local driving, walking, or cycling route is claimed for the remainder of Batticaloa District. Public remote routing availability and service quality are not guaranteed by this static site.

## Search and geographic quality

Existing full-dataset search remains independent of rendered PMTiles symbols. It retains partial, case-insensitive and fuzzy matching, categories, address fields, aliases, and nearby ranking. This change adds search-only approximate romanization for Tamil and Sinhala names/addresses. It does not translate or rewrite canonical names. Romanization is deliberately approximate and should be treated as an additional matching hint; the original Unicode text remains searchable. No new places or inferred coordinates were added. Existing data validators and quality reports remain the source for missing/suspicious data review.

## Offline package

The map offers an explicit download/remove control. The package contains the versioned place PMTiles archive, compact search index, place details, road MZP, and derived Kattankudy routing graph. Each data resource is checked against its manifest SHA-256 and byte size before it is committed to a versioned CacheStorage area. A failed update removes only its incomplete new cache and preserves an existing valid pack. A successful update replaces an old pack; the same control removes the pack. Browser quota is checked before download.

The service worker caches the local app shell and can serve valid HTTP 206 byte ranges from the complete cached PMTiles archive. The basemap style, glyphs, sprites and geographic tiles still come from OpenFreeMap and are not in the offline package. Offline mode can show a plain background, saved places/search/details and local route data; it is not an offline basemap and is not full offline navigation. Remote routing outside Kattankudy requires a network connection. Local search/details data uses several megabytes of browser storage; users can remove it at any time. Physical device storage limits and eviction policies vary by browser.

MapLibre GL JS 5.7.0 is served locally with its license, so the rendering engine and UI shell do not depend on the unpkg CDN. This avoids one external script dependency and permits the app shell to be cached. It does not make OpenFreeMap's basemap available offline.

## Verification and measurements

The routing graph builder and search index are tested for deterministic builds, access/one-way behavior, endpoint snapping, disconnected networks, alternatives, route progress, fuzzy search, aliases, Tamil/Sinhala romanization, and preserving canonical text. Offline tests cover the package manifest, integrity failures, failed update rollback, version replacement, and safe cache removal. Chromium tests exercise map startup, PMTiles range requests, search, categories, selection, theme, geolocation denial, directions, browser history, keyboard/pan/zoom, accessibility, and offline package/reconnect behavior.

The controlled 3-run benchmark uses a fresh context for each cold run, then a second page in that context for warm cache. Chromium 141 / SwiftShader ran with 60 ms latency, 640 KiB/s download, and 128 KiB/s upload. Medians are startup readiness / search plus details / directions / startup resource transfer / forced-GC heap / PMTiles range network transfer / animation frame p95:

| Profile | Cold | Warm |
|---|---|---|
| Desktop | 8,660 ms / 13,648 ms / 7,527 ms / 346,763 B / 22.8 MB / 16,684 B / 399.9 ms | 7,485 ms / 12,669 ms / 7,745 ms / 300 B / 22.2 MB / 0 B / 366.7 ms |
| Android Chrome emulation | 6,703 ms / 8,171 ms / 1,402 ms / 346,763 B / 21.6 MB / 16,684 B / 133.4 ms | 5,751 ms / 9,283 ms / 1,644 ms / 300 B / 22.7 MB / 0 B / 166.6 ms |

The 300-byte warm startup transfer and zero PMTiles range network transfer reflect browser HTTP-cache hits in this run; PMTiles 206 response bodies still totaled 310–345 KB. `searchAndDetailsMs` and `directionsMs` are measured in the same sequence; public routing was intercepted with a deterministic test response if local routing did not answer. Browser smoke without network shaping recorded 5.24 s startup, 355,566 B transfer, 21.6 MB post-GC heap, and 83.4 ms frame p95 on one pass (retry path: 5.82 s / 570,535 B / 21.9 MB). The Phase 10 controlled comparison reported Android PMTiles cold readiness 5,382 ms, 3,669,232 B across its broader journey, 19.8 MB post-GC heap, and 100 ms frame p95. These results are not directly comparable: this phase reports startup transfer before the search/details/directions actions, and headless software-rendering/measurement boundaries differ. No performance improvement is claimed from them.

The full per-run results, including request counts and cached PMTiles range-response body bytes, are recorded in `reports/phase12-14-browser-benchmark.json`. Network transfer is `transferBytes` / `pmtilesRangeNetworkTransferBytes`; cached response-body sizes are not counted as network bytes.

The very poor frame percentiles and low sample counts in the throttled benchmark show that this host cannot validate smooth real-device rendering. The interaction pass showed app behavior, not a performance improvement. Measurements use headless Chromium with SwiftShader and emulated network latency/throughput; they are not physical Android results. Frame intervals include software rendering and are not representative of a GPU-backed handset. A physical Android device is not available in this Codespace. Any comparison with earlier Phase 10 results must account for the distinct browser contexts, served assets, and test runs; no claim of a mobile frame-rate improvement is made without a like-for-like measurement.

The local routing graph build uses a cached adjacency structure, so repeated route alternatives do not rebuild every segment edge. It still runs route search on the main thread; current local graph size and measured runtime are documented in tests/benchmark output. Larger regional graphs should move routing to a worker or a maintained routing service rather than expanding synchronous work indefinitely.

## Remaining limitations

- Local road routing is limited to the bundled Kattankudy-area geometry; larger Batticaloa coverage is unsupported locally.
- Local ETAs are estimates and do not use verified legal speed limits, live traffic, road closures, or vehicle-specific restrictions.
- Turn restrictions, lane guidance, sidewalk continuity, surface conditions and seasonal accessibility are absent or incomplete.
- Online public routing endpoints have no Mazo Maps availability guarantee.
- Offline basemap tiles and offline routes outside the local graph are unsupported.
- Approximate romanization improves recall but is not a linguistic transliteration standard; it may add false-positive search matches.
- Headless Chromium is not physical Android performance testing.
