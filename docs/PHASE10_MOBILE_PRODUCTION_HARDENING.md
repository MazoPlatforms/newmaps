# Phase 10 — Mobile performance and production hardening

## Scope and preserved behavior

This change keeps MZP as the production default and leaves the opt-in `?delivery=pmtiles` path in place. Canonical records, ULIDs, aliases, roads, speed-limit data, and all generated delivery formats remain unchanged. The road and speed-review datasets are still available; speed-review data now loads on demand when the camera reaches zoom 15.5, just before its layer becomes visible at zoom 16.

## Live basemap audit

The deployed map uses the OpenFreeMap Liberty MapLibre v8 style. A direct read of the active style JSON on 2026-10-28 found two sources: OpenMapTiles vector tiles at `https://tiles.openfreemap.org/planet` and Natural Earth shaded relief raster tiles at `https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png` (raster max zoom 6). The style has 111 layers: transportation 61, place 9, landcover 5, landuse 6, park 2, water 1, waterway 4, building 2, boundary 3, and the remaining airport, POI, background, and label layers.

The buildings are sourced from the vector `building` layer (fill starts at zoom 13; extrusion starts at zoom 14). Landcover includes wood, grass, ice, wetland, and sand; landuse includes residential, sports pitch, track, cemetery, hospital, and school; parks, water polygons, waterways, settlement labels, transport geometry, and administrative boundary layers are present. No contour or mountain-peak source layer is exposed by this style. Thus detailed elevation contours are a source-data limitation, while the landcover, parks, water, buildings, roads, and boundaries are styleable geographic data. No geometry was invented.

The faint, misleading country-sized outline observed around Sri Lanka was caused by maritime features in OpenMapTiles `boundary` source layers (`boundary_2` and related lines), not a coastline polygon. Phase 9's active filter excludes `maritime == 1` on boundary strokes. Water polygons, coastlines, and non-maritime administrative boundaries remain visible. Attribution remains in MapLibre's active attribution control: OpenFreeMap and OpenStreetMap contributors.

## Confirmed fixes

* Theme changes now update the existing MapLibre paint properties and Mazo icon sprites in place. Light and dark share the same Liberty style URL, so calling `setStyle()` for a color-only change unnecessarily fetched/rebuilt the style and sources. The browser regression checks that toggling theme causes no second style request and that paint changes while sources, camera, and interactions remain available.
* Speed-review features are not fetched or parsed at initial map load. On the first camera stop at zoom 15.5 or higher, the client reads the speed manifest, verifies the dataset checksum and feature count, and loads the source once. This moves a roughly 2.3 MB raw / 375 KB gzip dataset off ordinary startup and avoids decoding it for users who never zoom to street level. Road and speed records themselves are not changed.
* The Mazo place source now contains only `id`, `name`, `kind`, and `priority` properties instead of duplicating the full category and address strings in GPU-bound features. Full records remain in the independent search/details data used by selection and search.
* A failed initial place-data request now exposes a retry button. Browser back/forward restores or closes selected-place details. Failed route recalculation clears the previous route geometry. The previously present “Choose on map” direction path is now wired to a map tap and displays a useful location-permission fallback.
* Automated accessibility checks found and fixed the search combobox role, an invalid label on a decorative hours dot, dark-mode Directions button contrast, and keyboard focus for the scrollable details region.

## Delivery comparison

Production MZP remains the default. Phase 10 repeats the existing controlled Playwright benchmark against the deployed site with Chromium/SwiftShader, cold fresh browser contexts, warm reloads, 60 ms emulated RTT, 5 Mbit/s down, and 1 Mbit/s up. Three runs are used per mode/device/cache. See [`../reports/phase10-delivery-before.json`](../reports/phase10-delivery-before.json) and [`../reports/phase10-delivery-after.json`](../reports/phase10-delivery-after.json) for raw runs and medians.

The previously recorded live baseline was:

| Emulated device/cache | MZP ready median | MZP journey bytes | MZP post-GC JS heap | MZP frame p95 | PMTiles ready median | PMTiles journey bytes | PMTiles post-GC JS heap | PMTiles frame p95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Desktop cold | 8,400 ms | 1,738,188 | 18.5 MB | 183 ms | 7,125 ms | 2,046,763 | 16.7 MB | 200 ms |
| Desktop warm | 5,882 ms | 264 | 18.8 MB | 200 ms | 5,669 ms | 174,757 | 16.7 MB | 200 ms |
| Android emulation cold | 5,543 ms | 1,738,278 | 18.3 MB | 83 ms | 5,326 ms | 2,077,058 | 16.8 MB | 133 ms |
| Android emulation warm | 5,039 ms | 281 | 18.8 MB | 83 ms | 4,271 ms | 282,761 | 16.6 MB | 100 ms |

The baseline showed mixed results: PMTiles initialized somewhat faster and used less retained JS heap, while its first journey transferred more bytes and its emulated mobile frame p95 was worse. Actual HTTP 206 responses with valid `Content-Range` headers were observed for PMTiles. This is not a clear overall production advantage, so PMTiles remains experimental. MZP and PMTiles are compared with the same browser script and journeys; Codespaces uses software WebGL and mobile emulation, not a physical Android device. Renderer/GPU process RSS is not equivalent to JavaScript heap and was not measured in the baseline.

The [`before`](phase10/screenshots/before/) and [`after`](phase10/screenshots/after/) folders contain matched 390 × 844 Chromium captures for world, Sri Lanka, Eastern Province, Batticaloa District/coast, Kattankudy, neighborhood, and street views, in light and dark themes. The before images were captured from the live baseline; after images were captured from the Phase 10 branch against the same active remote basemap style.

The post-change report will be captured from the same deployed target and settings after the protected merge/deployment. Local browser results are recorded separately from deployed comparisons.

## Reproducible compression

The earlier 203-byte PMTiles artifact difference was traced to workflow Python floating on `3.x` (the cited CI build ran CPython 3.15.1 while the Codespace ran 3.14.2). The map-delivery build and validation/deployment workflows now pin CPython 3.15.1; all gzip calls in the delivery builder explicitly use level 9 and `mtime=0`. Local reproducibility is checked by building twice and comparing archive checksums. This pins the language and compression level; the linked zlib and runner image may still vary across operating-system images, so the pinned GitHub workflow remains the authoritative build.

## Generated delivery artifacts

All nine generated files remain required by current consumers and fallbacks:

| File | Consumer / purpose |
|---|---|
| `batticaloa-district.mzp` | Default full place GeoJSON and symbol source |
| `manifest.json` | Place count, aliases, MZP hash, and optional delivery metadata |
| `search-index.json` | Complete independent MZP/PMTiles search coverage |
| `place-details.json` | Full details for selected PMTiles records |
| `places.pmtiles` | Optional spatial vector-tile delivery |
| `kattankudy-roads.mzp` | Road display source |
| `kattankudy-roads-manifest.json` | Road geometry integrity/count metadata |
| `kattankudy-speed-limits.mzp` | Deferred speed-review map data |
| `kattankudy-speed-limits-manifest.json` | Speed-review checksum and feature-count validation |

The manifest and builders cover the generated artifacts; HTTP cache remains short-lived and content is checksum-versioned. No generated artifact was deleted because each currently has an active consumer, validator, or fallback role.

## Verification and limits

Browser coverage exercises both delivery modes and the PMTiles fallback, search/category selection, details, history navigation, north-up controls, theme changes without style reload, on-demand speed data, a denied geolocation state, map-selected route pickup, failed route refresh, accessibility, and PMTiles range responses. Eight map scenes at world, Sri Lanka, province, district, coast, Kattankudy, neighborhood, and street scales are captured in both themes. Screenshots are diagnostic, not pixel-equivalence claims.

Automated Chromium uses Android-sized viewport/touch emulation only. No attached Android device or `adb` is available in the Codespace; no physical-device claim is made. OpenFreeMap request readiness and performance depend on external tile delivery. The style has no contour layer, and place/building completeness is limited by available source geometry and zoom coverage. Detailed offline operation is not claimed: the basemap still requires network tile/style/font access.
