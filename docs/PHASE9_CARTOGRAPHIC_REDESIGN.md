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
