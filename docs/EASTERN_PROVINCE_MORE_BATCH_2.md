# Batticaloa District Places Expansion — Eastern Province further coverage batch 2

Scope: Batticaloa District, Eastern Province, Sri Lanka

## Discovery

- Confirmed CLI invocations: at least 20 across 20 successful unique query strings; exact total unavailable because two capture batches briefly overlapped and repeated-call count was not retained.
- Retained JSON rows: 1,629; four earlier successful exploratory queries had uncaptured response counts. Captured failed attempts: 0; known failed diagnostic calls: 0; successful retries: 0; unique queries still failed: 0; at-limit queries: 0.
- Capture accounting: Four preliminary successful administrative-area queries returned responses that were not retained, so their result counts are unknown and excluded. Two documented invocations were interrupted before capture and later retried successfully. Two query runners briefly overlapped; retained responses were reconciled by unique query, but the exact number of redundant calls cannot be reconstructed. Confirmed invocation count is therefore a lower bound.
- Raw candidates in retained JSON captures: 1,629; duplicate calls with unavailable capture counts are excluded.
- Unique candidates after normalized name and coordinate grouping: 1,440.
- New public place records in this change: 100.
- Cumulative Phase 6.3 imports recorded to date: 100.
- Phase 6.2 failed prompts recovered: 0; additional locality/category queries: 0.
- Imported names formatted: 36; imported addresses mechanically formatted: 32.
- Unresolved nearby same-name pairs retained for review: 0.
- Duplicate query rows collapsed: 189.
- Candidate origin and license information is not exposed by the documented mzc CLI; maintainer review is required before attributing or redistributing the underlying data.
- Canonical place records contain no importer-added provenance or source metadata. Captured listings were not independently verified.

## District and privacy checks

- District membership checked against the Sri Lanka NSDI Batticaloa District polygon: https://gisapps.nsdi.gov.lk/server/rest/services/Srilanka/Boundaries/MapServer/3.
- Raw outside-district, private, uncertain, invalid, and conflicting candidates are represented only as aggregate counts; names, exact coordinates, contact data, and addresses are not listed.
- Existing place aliases are checked for represented places; no road or speed-limit source records are changed.

## Counts

- Excluded confirmed private: 0
- Existing place duplicate: 386
- Invalid missing coordinates: 0
- Invalid missing name: 0
- Mzc source conflict: 0
- New public candidate: 100
- Out of district: 939
- Uncertain public eligibility: 1
- Unresolved existing match: 14

## Candidate data quality signals

- Missing address: 3
- Missing categories: 3
- Missing phone: 173

## Query-area coverage

Counts overlap when a candidate appears in more than one category query. Query area means the search prompt, not a verified town assignment.

- ampara-district: existing place duplicate 86, new public candidate 13, unresolved existing match 2
- batticaloa-district: existing place duplicate 376, new public candidate 95, unresolved existing match 14
- trincomalee-district: existing place duplicate 6, new public candidate 3

## Category-prompt coverage

- all-public-places: existing place duplicate 5, new public candidate 1
- education: existing place duplicate 33, new public candidate 4, unresolved existing match 4
- food: existing place duplicate 110, new public candidate 5, unresolved existing match 8
- health: existing place duplicate 59, new public candidate 16
- public-services: existing place duplicate 37, new public candidate 2, unresolved existing match 4
- retail: existing place duplicate 186, new public candidate 82
- tourism: existing place duplicate 38, new public candidate 1

## Generated integrity

- Public geographic features: 6,457.
- Aliases: 1,086; maximum place shard: 999.
- PMTiles size: 2,688,565 bytes.
- PMTiles SHA-256: `67429c8723d3e3f64e51406fad358714cdb85aa50aa2ee830f296d23014b260d`.
- Unmodified sources: 3,710 roads; 3,710 speed-limit records; 462 supplementary maxspeed tags.

## Before/after checks

- Active place records: 6,393 → 6,493; geographic features: 6,357 → 6,457.
- Public geographic features: 6,357 → 6,457.
- Previous place ULIDs retained: True; aliases retained: True (1,086).
- Roads: 3,710 → 3,710; source checksum unchanged: True.
- Speed limits: 3,710 → 3,710; source checksum unchanged: True.
- Supplementary maxspeed evidence: 462 → 462; source checksum unchanged: True.

## Unresolved review cases

- Phase 6.2 cases retained unchanged: 13 conflicting existing matches and 11 eligibility-uncertain candidates.
- Combined current capture analysis: 14 unresolved existing matches and 1 eligibility-uncertain candidates.
- Amma Hotel (01M5Z17G0C4C1Q8YM3ZR7W7HES, 01M5Z17GC75PDB0MRNFK5PN6ZE): retained separately; 12.8 m apart with differing address and category values; no independent evidence resolves whether these are one listing or separate businesses.
- Markaz Mosque, Oddamawadi (01M5Z5PDD8W74TDEST9HG41RY3, 01M5Z5PJM2K9AGEBTQWXNSCGPZ): retained separately; Same address/category and about 10 m apart, but coordinates differ and available records do not independently establish which point should be canonical.
- Other uncertain/conflicting candidate details are omitted from this public report. No unresolved candidate was deleted or merged.

## Limitations

- No pagination mode is documented; all captured queries returned fewer than 500 candidates.
- CLI provider and separate license metadata were not exposed and are not inferred.
- Place listings, category correctness, and pin placement were not independently verified; mzc output is not treated as external confirmation.
- Query-area counts overlap and are not a claim that every district place has been discovered.
