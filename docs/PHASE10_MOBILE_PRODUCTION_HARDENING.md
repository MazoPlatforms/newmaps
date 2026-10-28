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

The baseline showed mixed results: PMTiles initialized somewhat faster and used less retained JS heap, while its first journey transferred more bytes and its emulated mobile frame p95 was worse. Actual HTTP 206 responses with valid `Content-Range` headers were observed for PMTiles. This was not a clear overall production advantage, so PMTiles remains experimental. MZP and PMTiles are compared with the same browser script and journeys; Codespaces uses software WebGL and mobile emulation, not a physical Android device. Renderer/GPU process RSS is not equivalent to JavaScript heap and was not measured in the baseline.

### Post-deployment comparison

The same protocol was repeated against the deployed `b1b0e2da` site after Pages finished publishing: three cold and three warm runs per device/delivery pair. Each table cell is the median of its three repetitions. Encoded bytes and request counts cover the complete tested journey (startup, search/filter, details, and camera animation). Post-GC heap is JavaScript heap, not process/GPU RSS.

| Emulated device/cache | Delivery | Ready ms | Journey bytes | Requests | Post-GC heap MB | Frame p95 ms | Verified PMTiles range bytes |
|---|---|---:|---:|---:|---:|---:|---:|
| Desktop cold | MZP | 7,186 | 1,741,165 | 43 | 18.0 | 233 | — |
| Desktop cold | PMTiles | 7,065 | 2,117,172 | 59 | 16.8 | 233 | 198,921 |
| Desktop warm | MZP | 6,430 | 287 | 43 | 18.1 | 183 | — |
| Desktop warm | PMTiles | 6,100 | 91,439 | 47 | 16.9 | 200 | 90,713 |
| Android emulation cold | MZP | 5,848 | 1,741,135 | 43 | 17.9 | 100 | — |
| Android emulation cold | PMTiles | 5,235 | 2,101,523 | 67 | 16.7 | 100 | 216,350 |
| Android emulation warm | MZP | 4,349 | 266 | 43 | 17.9 | 117 | — |
| Android emulation warm | PMTiles | 4,697 | 246,884 | 59 | 16.5 | 100 | 260,239 |

This production run confirms PMTiles use: the application chose a MapLibre vector source, the benchmark observed repeated archive ranges, and GitHub Pages directly returned `206 Partial Content`, `Accept-Ranges: bytes`, and `Content-Range: bytes 0-63/1681465` for a live archive request. PMTiles has lower retained JS heap and faster cold readiness in this sample, but transfers about 360–377 KB more on cold journeys and issues more requests. Its warm transfer remains substantially larger than MZP; frame p95 is mixed. These results do not establish a clear overall production advantage, so MZP remains the default and PMTiles remains opt-in.

Compared with the earlier live baseline, the optimized MZP path reduced desktop cold readiness from 8,400 to 7,186 ms and Android-emulation warm readiness from 5,039 to 4,349 ms, while other readiness/frame cells were mixed or regressed. The MZP journey bytes and request count remain effectively unchanged, so this is not a broad network-transfer reduction. Frame p95 values of 100–233 ms and 8–25 long tasks over 50 ms show that smoothness on the software renderer is still limited; no constant-frame-rate claim is made. The full raw post-deployment runs, including resource timing, network requests, long-task counts and heap samples, are in [`../reports/phase10-delivery-after.json`](../reports/phase10-delivery-after.json).

The [`before`](phase10/screenshots/before/) and [`after`](phase10/screenshots/after/) folders contain matched 390 × 844 Chromium captures for world, Sri Lanka, Eastern Province, Batticaloa District/coast, Kattankudy, neighborhood, and street views, in light and dark themes. The before images were captured from the live baseline; branch after images use the same active remote basemap style. The [`production`](phase10/screenshots/production/) folder additionally contains 16 light/dark captures of those eight camera scenarios loaded directly from the deployed post-merge Pages site. They are Android-sized browser emulation, not physical-device captures.

The post-change report is captured from the deployed target and settings after the protected merge/deployment. Local browser smoke results are recorded separately in [`../reports/phase10-browser-smoke.json`](../reports/phase10-browser-smoke.json) and are not mixed into the deployed comparison.

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
