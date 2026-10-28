> **Historical snapshot:** This report describes the Phase 9 deployment before the Phase 10 sole-format migration. Current production place delivery is PMTiles only; the current measured decision is documented in [Phase 10 PMTiles production decision](PHASE10_PMTILES_PRODUCTION_DECISION.md).

# Phase 9 — Cartographic redesign and intelligent POI rendering

## Scope and result

Phase 9 changes how the existing MapLibre map is styled and how its place symbols are placed. Canonical place records, ULIDs, aliases, roads, speed limits, supplementary maxspeed evidence, the MZP pipeline, and the experimental PMTiles pipeline remain data-compatible. The default delivery remains MZP. PMTiles is still opt-in with `?delivery=pmtiles`.

## Research method

I used Playwright with Chromium 141 to open both public reference sites and Mazo Maps. Google Maps was available at seven Sri Lankan coordinate/zoom pairs. Its web UI used a light basemap in this session; I did not find a usable dark-mode switch in the public interface, so dark-on-dark comparison was not possible. The reference URLs, desktop viewport, and matching Mazo Maps screenshots are listed in the benchmark report. Reference screenshots of Google Maps and the clone are not redistributed in this repository.

The independent site, [gmap.liupurnomo.com](https://gmap.liupurnomo.com/), identifies itself as “Google Maps Clone.” In the observed session it showed Google Maps-style search/category controls and “Map data ©2026 Google,” with an initial map centered on Jakarta. It is useful as an interaction example, but it did not provide an independent cartographic data/style source.

Observed in Google Maps: roads and neighborhood structure remain legible at street scale; major roads have a stronger hierarchy; POIs are compact, category-colored badges whose labels are selectively placed; dense local detail appears as the user zooms in; the selected place receives a clear emphasis. Counts were not taken from Google's canvas because its public rendered interface does not expose a reliable feature count. Those observations are qualitative, not inferred counts.

## Existing map and root causes

- The live map uses MapLibre GL JS 5.7.0 and requests remote vector styles from OpenFreeMap: Liberty for light and Dark for dark. The app suppresses provider POI symbols and renders Mazo place features in MapLibre symbol layers.
- The basemap is vector, not a flat raster map. The style uses the OpenMapTiles vector source at `https://tiles.openfreemap.org/planet`; Liberty also uses the Natural Earth shaded relief raster source at low zoom. Visible source layers include `transportation`, `building`, `landuse`, `landcover`, `water`, `waterway`, `place`, `transportation_name`, and `boundary`.
- The old dark style supplied almost-black land, buildings, and roads, with dim city labels. The live code referenced the OpenFreeMap dark style directly; the repository's old local style JSON files were not controlling the live map.
- Mazo's three POI tiers interpolated icon and text opacity from 0 to 0.9 to 1. This caused partially transparent symbols at intermediate zooms. The three tiers also admitted too many icons in the central urban view.
- Mazo POIs already used GPU-backed MapLibre symbol layers from a GeoJSON source. They were not thousands of DOM markers. The change keeps that source/layer model and avoids source replacement during camera movement.

The provider's current style layer metadata limits building footprints to street-scale zooms (Liberty building fill starts at zoom 13 and its extrusion at 14; the Dark style building fill starts at 12). Phase 9 recolors the features present in the provider data; it does not create missing building geometry or road paths. The low-zoom Natural Earth raster in Liberty is also left intact.

## Basemap source and licensing

The app continues using OpenFreeMap's hosted MapLibre styles and automatic MapLibre attribution. OpenFreeMap documents its styles and service at [openfreemap.org](https://openfreemap.org/) and its use with MapLibre at [Quick start](https://openfreemap.org/quick_start/). OpenFreeMap describes its map data as OpenStreetMap/OpenMapTiles-based; the style and tile service are external dependencies and may change independently. The app retains the provider attribution displayed by MapLibre. No basemap tiles, sprites, or provider source code are copied into this change.

## Mazo palette and road/building styling

The new original palette is defined in `assets/js/cartographic-style.mjs` and applied to the live provider style after each style load.

| Element | Light | Dark |
| --- | --- | --- |
| Land | `#f4f2eb` | `#1b2a31` |
| Water | `#b9dce7` | `#102a38` |
| Vegetation | `#d5e5d4` | `#244337` |
| Built-up land | `#e7e6df` | `#25343a` |
| Buildings | `#e5ddce` | `#52656c` |
| Building outline | `#c7bcaa` | `#73868a` |
| Primary roads | `#e4b66e` | `#d9ae70` |
| Secondary roads | `#d8c5a4` | `#9dafad` |
| Local roads | `#fffefa` | `#70858a` |
| Geographic labels | `#354751` | `#e0e9e9` |

Road casings and inner lines use separate colors and continuous zoom-dependent widths. Motorways, trunk/primary roads, secondary/tertiary roads, local streets, and pedestrian paths receive distinct treatment where the provider exposes those classes. Geographic, water, and road labels get theme-specific text/halo colors and fully opaque text. Buildings use a visible fill and outline; 3D building extrusions, when provided by the style, receive the same theme color at restrained opacity.

## POI icons, density, and opacity

Mazo place symbols use small, circular category badges drawn into MapLibre-compatible canvas images, with a white pictogram and contrasting outline. This replaces the former tall pin silhouette without adding per-place DOM elements or an external icon library. Category colors use a restrained, more distinguishable palette. Selected places use the same pictogram at a larger size and keep their label above ordinary collision priorities.

The rendering tiers are deterministic:

- Landmarks can appear from zoom 6.2.
- Major public facilities and services can appear from zoom 8.6.
- Ordinary local businesses appear from zoom 12.4, with larger collision padding at neighborhood and street scales to keep the visible set stable and readable.
- Choosing a category permits matching ordinary places from zoom 9.4.

MapLibre symbol collision and `icon-padding`/`text-padding` govern how many candidates fit in the viewport. Lower numeric priority values are placed first. Search, the complete category counts, and the full place index are independent of map-label visibility. The active category still filters map symbols and search results as before.

All normal POI icon/text paint opacity values are `1`; their visibility is controlled by tier thresholds and symbol collision. The selected place now uses a separate one-feature GeoJSON overlay. This keeps the selected place visible even when its ordinary MVT tile tier is absent at a low zoom, and prevents a duplicate normal/selected symbol while selected. The overlay is updated only when selection changes, not during camera movement.

## Seven matched Mazo screenshots

The captures use Chromium 141, a 1280×800 CSS viewport, dark preference, the same center/zoom pairs, and the live OpenFreeMap style. They are Mazo before/after captures; the public Google Maps session was light-themed and had additional UI panels, so its map viewport could not be pixel-aligned exactly.

- [Before cartographic redesign — seven scenarios](phase9/screenshots/before-seven-scenarios.jpg)
- [After cartographic redesign — seven scenarios](phase9/screenshots/after-seven-scenarios.jpg)
- [Mobile-sized light map capture](phase9/screenshots/mobile-light-kattankudy.jpg)
- [Mobile-sized dark map capture with selected place sheet](phase9/screenshots/mobile-dark-kattankudy.jpg)

The exact centers and zoom levels are in `reports/phase9-browser-benchmark.json`.

## Browser measurements

The browser benchmark report contains reproducible setup details and measured Mazo symbol counts at each scenario. Final counts were 2 (Sri Lanka), 4 (Eastern Province), 21 (Batticaloa District), 17 (coast), 35 (Kattankudy surroundings), 50 (street network), and 81 (Victory Ground / Deen Road), compared with earlier baseline counts 4, 19, 37, 83, 69, 110, and 144. Counts are MapLibre's rendered Mazo symbol features at the captured frame; they are not Google counts, and do not separately prove that every label text made it through collision placement.

| Startup/profile sample | Before | After |
| --- | ---: | ---: |
| Browser map readiness | 5,758 ms | 6,324 ms |
| Chromium JS heap after seven camera views and feature queries | 157 MB | 588 MB |
| Resource entries | 34 | 35 |
| Browser transfer bytes for seven views | 4,649,389 | 4,657,307 |

The latest single capture measured 566 ms slower map readiness and a substantially higher post-view JavaScript heap than the earlier baseline. Heap was sampled after seven camera moves, rendered-feature queries, and screenshots without forced garbage collection; it is not process RSS and may include retained MapLibre/query allocations. This is recorded as a possible memory regression, not an improvement, and needs confirmation with a controlled heap profile and on hardware. Transfer changed by about 0.2%. All measurements are from headless Linux/SwiftShader, not Android process memory or a mobile network. No bandwidth throttling, cold/warm CDN comparison, or physical Android phone was available. Frame-time samples from a scripted camera ease are recorded by the browser smoke test; they measure this software-rendered browser only and are not a 60 FPS guarantee.

The latest mobile-sized delivery smoke test (390×844 CSS pixels) results are in `reports/phase9-browser-smoke.json`. It exercises MZP, PMTiles, and an intentional archive-unavailable fallback. PMTiles is checked for actual `206 Partial Content` responses with `Content-Range`; after search and place detail selection, the transfer also includes the independent full-search/detail data. These are local single runs with no throttling; the previous run showed a smaller initial viewport payload for PMTiles, but not a smaller full discovery session.

The separate Node CPU benchmark (`scripts/benchmark_search.mjs`, seven trials, Node 24.21.0) measured MZP JSON parse median 16.85 ms / p95 22.32 ms and index initialization median 34.60 ms / p95 69.84 ms. The compact search-index path measured parse 4.77 / 5.78 ms and initialization 38.41 / 41.73 ms. One hundred queries measured 4,102.66 / 4,886.14 ms for MZP-derived search versus 3,417.28 / 4,989.71 ms for the compact index. These CPU-only figures suggest faster compact-index parsing and median queries, with slightly slower initialization; they are not browser rendering timings. The measured gzip payloads were 332,479 bytes for MZP and 230,218 bytes for the compact index.

The latest mobile-emulated MZP camera-ease sample collected 26 `requestAnimationFrame` intervals: p50 66.6 ms, p95 83.3 ms, maximum 83.4 ms, and 16 long tasks over 50 ms. Those are poor results in this headless SwiftShader environment, and do not demonstrate smooth frame-by-frame motion. Earlier baseline capture intervals were too sparse (3–4 samples) for a valid before/after comparison. These measurements are included as a warning, not a device-frame-rate estimate. Android hardware testing and profiling remain necessary before claiming a responsiveness improvement.

The local production-style smoke test compares default MZP and the opt-in PMTiles path using the same built files. PMTiles requests are checked for actual `206 Partial Content` responses and `Content-Range`; an intentional 503 path checks the MZP fallback. GitHub Pages range behavior for the deployed Phase 8 archive was also directly verified with a ranged GET before testing the local new browser path; this PR does not deploy a new archive or change the hosting model.

## MZP and PMTiles comparison

The initial map still defaults to MZP. Browser checks exercise both source types and verify search, category selection, selected-place details, world zoom, and north-up camera behavior. The PMTiles experiment uses the existing generated archive and a separate complete search index. The browser test found and fixed an undeclared PMTiles protocol variable that had forced the experimental path back to MZP despite successful range requests. It also verifies that the selected-place overlay remains visible at world zoom even when its ordinary MVT feature is absent. MZP fallback remains covered by a forced-unavailable archive test.

This phase does not change tile generation, canonical storage, or data delivery formats. It does not switch the production default to PMTiles. Archive transfer, viewport tile transfer, and search-index/detail payloads are reported separately by the browser smoke run where available; one run on a local range server is not enough to claim that PMTiles is universally faster.

## Tests and limitations

- Node unit tests cover palette application to supported style layers, road hierarchy, label opacity, category filtering, display priority, zoom tiers, and north-up configuration.
- The Playwright Chromium smoke test covers mobile-sized layout, MZP/PMTiles/fallback selection, actual range responses, light/dark style switching, opaque POI paint, category filtering, fuzzy-search selection, place details, selected overlay rendering at world zoom, zero bearing/pitch, and world-level zoom-out.
- Repository Python data validators/builds and Node tests are run in the Phase 9 PR validation workflows; no canonical place, road, speed, alias, or eligibility source records are modified.
- Browser emulation is not physical Android testing. Map appearance and timing depend on the external OpenFreeMap service, its tile update cadence, glyph availability, and network conditions.
- MapLibre exposes symbol candidates through rendered feature queries, but not a stable per-label collision count API. Screenshot review is used for visual label density; numeric POI counts are explicitly symbol-feature counts.
- The external independent site is a clone and Google-data wrapper, not an independent reference provider. Google's dark styling could not be compared in this public web session.

## Follow-up browser and basemap audit (2026-10-27)

### Active OpenFreeMap style and the boundary defect

The current light style and the new dark palette both use the OpenFreeMap Liberty v8 style at `https://tiles.openfreemap.org/styles/liberty`. Its `openmaptiles` vector source points to the Planet TileJSON. The source schema exposes `boundary`, `landcover`, `landuse`, `park`, `building`, `transportation`, `transportation_name`, `water`, `waterway`, `place`, `poi`, and related label layers. The style also uses the existing `ne2_shaded` Natural Earth raster source, which the old Dark style declared but never rendered as a raster layer.

The gray country outlines came from OpenMapTiles `boundary` **line** features where `admin_level` is 2 and `maritime` is 1. In the previous Dark style, `boundary_country_z0-4` filtered for admin level 2 and absence of `claimed_by`, and `boundary_country_z5-` filtered only for admin level 2. Neither filter excluded maritime lines. Liberty's `boundary_2` and `boundary_3` filters already exclude `maritime == 1`; the client now applies the same `maritime != 1` exclusion defensively to any boundary line layer that lacks it. The independent `water` polygons and `waterway` lines are not modified. Browser feature queries returned zero rendered maritime boundary lines in every captured scene.

A second root cause was the cartographic helper assigning the **water** palette to the style's global `background` layer. At zooms where the tile has no landcover or landuse polygon beneath a road or building, the otherwise unclassified land therefore looked like water. The helper now colors that background with the land palette; the actual vector `water` source layer paints the ocean and inland waters. No geographic geometry is created or removed.

### Geographic detail and visibility scale

The Liberty vector style has substantially richer source geometry than the former Dark style: parks and outlines, residential/school/hospital/cemetery/pitch land use, wood/grass/ice/wetland/sand landcover, water and waterways, and building footprints. The code recolors those existing layers, clears the decorative wood pattern where it obscured the class color, and extends the existing Natural Earth relief layer's client-side display range through zoom 9 while fading it out. It does not create a forest, building, road, or terrain feature that is absent from the provider tiles.

Road line layers keep the provider geometry and use these client minimum-zoom bands: motorways 4.5, trunk/primary 5.5, secondary/tertiary 7.5, minor/service/track/street 10.5, and paths/pedestrian ways 13.5. Major road names begin at 8.5; route shields begin at 9.5 to reduce repeated shield labels in provincial views. Widths interpolate continuously with zoom. The existing business-POI suppression was also too broad: a regular expression over layer IDs hid settlement and airport labels. It now hides only symbol layers sourced from `poi` or `poi_label`, leaving `place`, aerodrome, water, and other geographic labels in the provider style. Mazo POIs remain in GPU-backed symbol layers, use collision placement and stable priorities, stay fully opaque, and remain independently searchable.

The follow-up palette uses land/water values `#ebe8df` / `#a9d3e2` in light mode and `#202d32` / `#102b3a` in dark mode. Existing provider road/building geometry is colored using separate road hierarchy, building fill/outline, park, grass, wetland, sand, and built-area palette entries. Low-zoom natural relief and geography remain visible, local road layers wait until city/neighborhood zoom, and building footprints become visible at street zoom where the source contains them.

### Matched browser captures

The Playwright Chromium capture suite uses a 390×844 mobile-emulated viewport and waits for MapLibre's `idle` event after each camera jump. It captures world, Sri Lanka, Eastern Province, Batticaloa District, coast, Kattankudy surroundings, Kattankudy street network, and Victory Ground / Deen Road in both themes. Coordinates for the final two scenes come from existing public-place points in the repository, so the capture stays over mapped land. The machine-readable capture records per-scene Mazo symbols, settlement labels, roads, buildings, landcover, landuse, water, boundary features, and whether tiles reached idle.

- [Follow-up light-mode zoom captures](phase9/screenshots/followup-zoom-suite-light.jpg)
- [Follow-up dark-mode zoom captures](phase9/screenshots/followup-zoom-suite-dark.jpg)
- [Browser smoke and per-scene feature counts](../reports/phase9-browser-smoke.json)
- [Three-run production baseline profile](../reports/phase9-delivery-baseline.json)
- [Three-run follow-up candidate profile](../reports/phase9-delivery-candidate-local.json)

The current screen captures show the land background and vector water separating correctly, Natural Earth relief at country/regional scale, green vegetation and park areas, settlement labels, a quieter low-zoom road network, and visible source buildings with a local road hierarchy at Victory Ground street zoom. The existing Phase 9 desktop comparison sheet remains the before reference. POI numbers in the report are MapLibre rendered features, not Google Maps feature counts; Google does not expose a stable count from its canvas. The comparison is visual and uses the same approximate coordinate/zoom cases, not pixel equality.

### Delivery and measured performance

The working tree contained nine current generated outputs after rebuilding: `manifest.json`, `batticaloa-district.mzp`, `places.pmtiles`, `search-index.json`, `place-details.json`, the road MZP and road manifest, and the speed-limit MZP and speed-limit manifest. A stale ignored local `kattankudy.mzp` was not referenced by app code or build scripts and already returned 404 from Pages; it was removed from the local generated directory. No tracked generated file, canonical source record, ULID, alias, road, speed-limit, or supplementary maxspeed record was removed. The MZP place source remains production default and its generated GeoJSON remains the fallback; PMTiles is still opt-in. Both manifests/search/detail indexes and road/speed files remain required by the app or by the documented fallback path.

The delivery profile runs three alternating MZP/PMTiles repetitions on desktop and 390×844 mobile emulation, using fresh contexts for cold browser caches and same-context reloads for warm cache, 60 ms RTT / 5 Mbit/s down / 1 Mbit/s up, and the same search, category, detail, and camera journey. It records forced-GC JavaScript heap, encoded transferred bytes, readiness, camera frame intervals, long tasks, and actual PMTiles response ranges. The follow-up local static server gzip-compresses generated MZP/JSON files and serves PMTiles ranges to match GitHub Pages behavior; OpenFreeMap styles/tiles/glyphs are requested live. These are browser measurements from Codespaces headless Chromium with SwiftShader, not hardware-GPU or Android-device timings.

| Profile and mode | Cold map ready / full-journey bytes | Warm map ready / full-journey bytes | Forced-GC JS heap (cold) | Camera frame p95 (cold) |
| --- | ---: | ---: | ---: | ---: |
| Desktop MZP, production baseline | 7,041 ms / 1.67 MB | 5,639 ms / 283 B | 18.6 MB | 200 ms |
| Desktop PMTiles, production baseline | 5,788 ms / 2.06 MB | 5,047 ms / 147.5 KB | 16.7 MB | 216.7 ms |
| Mobile emulation MZP, production baseline | 5,542 ms / 1.67 MB | 4,632 ms / 278 B | 18.4 MB | 83.4 ms |
| Mobile emulation PMTiles, production baseline | 4,949 ms / 2.04 MB | 4,344 ms / 261 KB | 18.2 MB | 100.1 ms |
| Desktop MZP, follow-up local candidate | 7,261 ms / 1.79 MB | 5,785 ms / 33.1 KB | 18.6 MB | 216.5 ms |
| Desktop PMTiles, follow-up local candidate | 6,671 ms / 2.20 MB | 6,122 ms / 196.7 KB | 16.8 MB | 166.8 ms |
| Mobile emulation MZP, follow-up local candidate | 5,485 ms / 1.79 MB | 4,771 ms / 33.1 KB | 18.4 MB | 100 ms |
| Mobile emulation PMTiles, follow-up local candidate | 5,382 ms / 2.18 MB | 4,681 ms / 297.1 KB | 16.6 MB | 100.1 ms |

Each row is a median of three runs. The follow-up candidate was served from a local static server that mirrors GitHub Pages' 600-second generated-file cache and gzip behavior; its OpenFreeMap requests still went to the same external service. This differs from the production baseline's Pages origin, so small cross-build timing/byte differences include origin/CDN variation. In the candidate runs, PMTiles reduced place-geometry range bytes during the initial map load, but total cold journey transfer was about 0.41 MB higher on desktop and 0.39 MB higher on mobile emulation than MZP. Warm total transfer was about 0.16 MB higher on desktop and 0.26 MB higher on mobile emulation. Cold map readiness was 0.59 seconds faster on desktop and 0.10 seconds faster on mobile emulation; warm readiness was slower by 0.34 and 0.09 seconds respectively. The candidate's forced-GC JS heap was about 1.8 MB lower with PMTiles. Desktop cold camera p95 favored PMTiles, while mobile-emulated cold p95 was effectively tied. This mixed tradeoff does not establish a clear overall win for PMTiles for this dataset; MZP remains the production default and PMTiles remains a verified opt-in experiment.

The earlier 588 MB sample was not a post-GC retained-heap measurement. The controlled reports distinguish the before-GC heap from the heap after CDP `HeapProfiler.collectGarbage`; they do not measure total Chromium process/GPU RSS. A physical Android device is not attached to this Codespace (`adb` is unavailable), so no real-device result is claimed.
