# Phase 10 — Place delivery decision and production migration

## Decision

PMTiles is now the sole production delivery format for place map features. Canonical per-place JSON remains authoritative. The dedicated compact search index, complete place-details index, and permanent alias table remain separate generated assets. Roads and speed-limit review data continue using their existing MZP files; this migration concerns the place map dataset only.

PMTiles was selected because the controlled browser results were comparable for readiness and rendering, forced-GC heap was lower in each desktop/mobile cold/warm pair, GitHub Pages supports the archive's required byte ranges, and viewport-addressed delivery scales better as the district dataset grows. The selection is not based on total transfer being lower: PMTiles increased total bytes and request counts for the complete journeys. That tradeoff is retained explicitly below.

## Comparison method

The reproducible source results are in [`reports/phase10-delivery-comparison.json`](../reports/phase10-delivery-comparison.json). The comparison ran against the same live GitHub Pages commit using Chromium 141, three repetitions per delivery/cache/device case, 60 ms emulated RTT, 5 Mbit/s down and 1 Mbit/s up. Desktop used 1280×800; Android Chrome emulation used 390×844 with touch. Cold means a fresh browser context; warm means a repeat journey in the same context. The CDN may still have had warm edge cache. The PMTiles branch used an actual vector source and recorded HTTP 206 responses with `Content-Range`; it did not silently fall back.

Each case included map readiness, search and category filtering, opening place details, the same deterministic mocked directions response, world/Sri Lanka/Batticaloa/Kattankudy views, pan and animated zoom, cached search while offline, and a reconnect fetch. The route endpoint was mocked identically to avoid network service variance. Transfer bytes are Chromium's encoded response-byte measurements across the full journey, not repository size. PMTiles byte-range bytes are reported separately. Frame p95 and heap are measured after the camera/rendering journey; heap was collected after explicit Chromium garbage collection.

## Results

Medians across three runs; bytes are decimal MB. PMTiles range data is a subset of its total transfer.

| Device profile | Cache | Delivery | Ready (ms) | Journey transfer (MB) | Requests | Post-GC JS heap (MB) | Animation frame p95 (ms) | PMTiles range bytes |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Desktop | Cold | MZP | 7,371 | 4.384 | 95 | 23.21 | 249.9 | — |
| Desktop | Cold | PMTiles | 6,897 | 5.038 | 142 | 21.80 | 233.4 | 464,974 |
| Desktop | Warm | MZP | 7,562 | 5.245 | 95 | 24.12 | 250.0 | — |
| Desktop | Warm | PMTiles | 7,929 | 5.896 | 151 | 21.83 | 233.3 | 467,175 |
| Android emulation | Cold | MZP | 5,389 | 3.097 | 83 | 20.72 | 100.0 | — |
| Android emulation | Cold | PMTiles | 5,382 | 3.669 | 134 | 19.76 | 100.0 | 496,990 |
| Android emulation | Warm | MZP | 5,585 | 3.096 | 81 | 21.11 | 100.0 | — |
| Android emulation | Warm | PMTiles | 5,650 | 3.674 | 129 | 20.09 | 100.0 | 444,132 |

PMTiles reduced post-GC JS heap by about 6–10% in these samples and was faster on desktop cold readiness, effectively tied on Android cold, and slower on warm readiness by 65–367 ms. Frame p95 was comparable (desktop varied by 16–17 ms; Android emulation was 100 ms for both). Total tested journey bytes rose about 12–19%, with roughly 47–60% more requests. The desktop animation frame p95 values are poor for a smooth 60 Hz experience; this benchmark does not establish that either delivery mode fixes the broader rendering bottleneck. These noisy, software-rendered Codespaces figures are not a physical mobile-device guarantee.

## Production architecture

- `scripts/places.py build` writes public-place counts, shard counts, withheld/missing-coordinate IDs and aliases to `generated/manifest.json`; it no longer generates place GeoJSON/MZP.
- `scripts/build_map_delivery.py` creates the MVT PMTiles archive plus search and detail indexes directly from eligible canonical JSON records.
- The manifest declares `format: PMTiles/1` and `production_default: pmtiles`; it has no place-MZP filename, checksum or byte fields.
- The frontend always loads PMTiles. There is no delivery query flag and no GeoJSON/MZP fallback. Archive failure is visible and retryable; search can remain available from its independent index.
- The validator rejects a stale `generated/batticaloa-district.mzp` file, a non-PMTiles manifest, or legacy place-delivery fields.
- Place details, search coverage, aliases, category filters, selection, directions, and nearby discovery remain separate from rendered tile visibility.
- The obsolete place MZP archive and dual-format benchmark utilities/tests were removed. The road and speed-limit MZP outputs were retained and verified.

## Integrity and build repeatability

The rebuilt manifest reports 4,498 place map features, 4,500 searchable eligible places, 1,086 aliases, and 1,223 PMTiles tiles at zoom 4–16. All source shard limits remain at or below 999. Local repeated builds produced the same PMTiles SHA-256 (`61db5cc278f3d60a6ae98d777a5d06439239a420d611765b5be90b2aa2af7e6c`) and size (1,681,457 bytes). Tile gzip uses level 9 and `mtime=0`; the MVT, PMTiles, and Shapely package versions are pinned, and GitHub Actions pins Python 3.15.1.

Post-merge live verification found an 8-byte local/CI archive difference in the compressed root directory (the decompressed directory and every tile payload matched). The PMTiles library had relied on Python's default gzip compression level for directories and metadata. PR #36 pins those library calls to gzip level 9 and `mtime=0`, with a regression test. Its Pages deployment for commit `7959c4f42de1269f848fc317af7b654fbe0d96df` served a 1,681,457-byte archive whose SHA-256 exactly matched a fresh local build (`61db5cc278f3d60a6ae98d777a5d06439239a420d611765b5be90b2aa2af7e6c`) and the deployed manifest checksum. A live byte-range request returned HTTP 206 with `Content-Range: bytes 0-63/1681457`. This confirms byte identity for the tested local and Actions environments; it does not guarantee identical gzip output across arbitrary zlib implementations.

The canonical place JSON, ULIDs, aliases, place eligibility state, roads, speed limits, and supplementary maxspeed source data were not edited by this change.

## Reliability and limitations

- Live GitHub Pages PMTiles archive requests returned HTTP 206 and valid `Content-Range` headers. Browser tests also exercised header/directory/tile range requests and an archive failure followed by explicit retry; no MZP fallback was requested.
- Offline testing covered search after the search index had been loaded, followed by reconnect and a successful manifest request. Cold offline startup is not supported or claimed: application assets, glyphs, basemap tiles, and other resources are network-hosted.
- Directions were tested using an identical mocked route response. The external routing service was not benchmarked.
- Android was emulated in Chromium; no physical Android device was available in the Codespace.
- A local production-browser E2E run is not a substitute for production deployment verification. The merged Pages deployment must be checked for its manifest, archive range behavior, and live map behavior.

## Historical comparison document

[`PHASE8_VECTOR_TILES_BENCHMARK.md`](PHASE8_VECTOR_TILES_BENCHMARK.md) records the initial PMTiles experiment and is retained as historical context; its initial MZP-default recommendation is superseded by this measured Phase 10 decision.
