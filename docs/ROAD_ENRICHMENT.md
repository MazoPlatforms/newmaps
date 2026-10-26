# Supplementary road and speed tag audit

## Source

`kattankudy-all-roads.json` is retained unchanged as a temporary supplementary source. It contains 2,102 unique OSM road features and 711 non-null `maxspeed` tags. Its SHA-256 is `64f19c7fd1259f07935b47f5b1fd5984f19c5ec02a740f58c122e74aab57b872`.

The raw source uses string values such as `20`, `25`, `30`, `40`, `50`, `60`, and `70`; it does not declare a unit. Matching evidence therefore records `maxspeed_unit: null` and `maxspeed_status: unverified_source_tag`. It does not populate `speed_limit_kmh`, vehicle-specific values, conditions, or verified posted limits.

## Matching

The retained `data/roads/supplementary-match-analysis.json` manifest and its partition files contain per-feature sampled-line comparisons with nearest existing road candidates. The supplementary source remains unchanged. `scripts/enrich_roads.py` accepts a match only when the sampled source line has at least 90% coverage within 8 m, the nearest-road share exceeds the runner-up by at least 0.25, the road class agrees exactly, names agree when both are present, and no second OSM feature claims the same existing road source ID. Existing road ULIDs and all baseline source fields are preserved.

The audit matched 1,665 OSM features to existing road ULIDs; 462 of these have a non-null `maxspeed` tag. The remaining 437 OSM features are unresolved or ambiguous and are recorded with reasons in `data/roads/supplementary-road-audit.json`. No unmatched feature could be confirmed as a distinct missing road from the available geometry, class, name, and uniqueness evidence, so no road record or ULID was added. The 437 unresolved and ambiguous candidates need topology review; nearby coordinates alone are insufficient evidence.

The supplementary evidence is added to the existing Roads and linked Speed Limits features in their separate MZP outputs. All 3,710 existing road and speed-limit records, their ULIDs, and road references remain intact. No existing numeric `speed_limit_kmh` was overwritten; all 3,710 remain null.

## Legal review

The official Sri Lankan Government Gazette Extraordinary No. 1763/26 (22 June 2012) describes 50 km/h for listed built-up sections and 70 km/h for other non-built-up road sections for general motor vehicles, with category-specific rules and signs at relevant sections. The Gazette’s schedule and the exact road section must be matched before assigning any legal default. The supplementary OSM tags alone do not establish the legal unit, the road’s built-up status, the relevant section, vehicle category, or the posted sign. Therefore this enrichment adds no legal defaults. Values such as `25` remain raw and unverified; they are not treated as official school-zone restrictions.

Official source: https://documents.gov.lk/api/content-file-proxy?file=%2Fextra-gazette-content%2F1763-26_E_1784556771.pdf
