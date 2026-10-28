# Phase 8 — Initial vector-tile experiment (historical)

This document records the original PMTiles prototype, before it had been tested through the deployed site and complete browser journeys. Its original recommendation to retain MZP as the place production default is superseded by the controlled Phase 10 comparison and production decision in [`PHASE10_PMTILES_PRODUCTION_DECISION.md`](PHASE10_PMTILES_PRODUCTION_DECISION.md).

The Phase 8 implementation established the MVT/PMTiles generator, a compact search index, place detail data, and MapLibre protocol integration. PMTiles was initially opt-in because GitHub Pages range behavior and real browser performance had not yet been verified. Phase 10 verified range requests and compared both paths using identical desktop and Android-emulation journeys, then removed the place MZP fallback and delivery artifacts. The canonical per-place JSON remains authoritative. Road and speed-limit MZP artifacts are separate datasets and remain supported.

Historical size measurements and experiment notes are preserved in `reports/phase8-baseline.json` and `reports/phase8-benchmark.json`. The obsolete two-format benchmark scripts have been removed; current reproducible measurements are in `reports/phase10-delivery-comparison.json`.
