# Batticaloa District Places Expansion — Eastern Province further coverage batch 1

Scope: Batticaloa District, Eastern Province, Sri Lanka

## Discovery

- Confirmed CLI invocations: at least 12 across 12 successful unique query strings; exact total unavailable because two capture batches briefly overlapped and repeated-call count was not retained.
- Retained JSON rows: 209; four earlier successful exploratory queries had uncaptured response counts. Captured failed attempts: 0; known failed diagnostic calls: 0; successful retries: 0; unique queries still failed: 0; at-limit queries: 0.
- Capture accounting: Four preliminary successful administrative-area queries returned responses that were not retained, so their result counts are unknown and excluded. Two documented invocations were interrupted before capture and later retried successfully. Two query runners briefly overlapped; retained responses were reconciled by unique query, but the exact number of redundant calls cannot be reconstructed. Confirmed invocation count is therefore a lower bound.
- Raw candidates in retained JSON captures: 209; duplicate calls with unavailable capture counts are excluded.
- Unique candidates after normalized name and coordinate grouping: 103.
- New public place records in this change: 11.
- Cumulative Phase 6.3 imports recorded to date: 11.
- Phase 6.2 failed prompts recovered: 0; additional locality/category queries: 0.
- Imported names formatted: 2; imported addresses mechanically formatted: 3.
- Unresolved nearby same-name pairs retained for review: 0.
- Duplicate query rows collapsed: 106.
- Candidate origin and license information is not exposed by the documented mzc CLI; maintainer review is required before attributing or redistributing the underlying data.
- Canonical place records contain no importer-added provenance or source metadata. Captured listings were not independently verified.

## District and privacy checks

- District membership checked against the Sri Lanka NSDI Batticaloa District polygon: https://gisapps.nsdi.gov.lk/server/rest/services/Srilanka/Boundaries/MapServer/3.
- Raw outside-district, private, uncertain, invalid, and conflicting candidates are represented only as aggregate counts; names, exact coordinates, contact data, and addresses are not listed.
- Existing place aliases are checked for represented places; no road or speed-limit source records are changed.

## Counts

- Excluded confirmed private: 0
- Existing place duplicate: 84
- Invalid missing coordinates: 0
- Invalid missing name: 0
- Mzc source conflict: 0
- New public candidate: 11
- Out of district: 1
- Uncertain public eligibility: 5
- Unresolved existing match: 2

## Candidate data quality signals

- Missing phone: 27

## Query-area coverage

Counts overlap when a candidate appears in more than one category query. Query area means the search prompt, not a verified town assignment.

- araiyampathy: existing place duplicate 10, new public candidate 1
- batticaloa: existing place duplicate 36, new public candidate 1, unresolved existing match 1
- chenkalady: existing place duplicate 22, new public candidate 3
- eravur: existing place duplicate 20, new public candidate 5
- kaluwanchikudy: existing place duplicate 7, new public candidate 1
- kattankudy: existing place duplicate 29, new public candidate 2, unresolved existing match 2
- kiran: existing place duplicate 21, unresolved existing match 1
- kokkadichcholai: existing place duplicate 19, unresolved existing match 1
- oddamavadi: existing place duplicate 4, new public candidate 1
- vakarai: existing place duplicate 1
- valaichchenai: existing place duplicate 1, new public candidate 1
- vellavely: existing place duplicate 7

## Category-prompt coverage

- all-public-places: existing place duplicate 112, new public candidate 12, unresolved existing match 2
- mixed-public-services: existing place duplicate 65, new public candidate 3, unresolved existing match 3

## Generated integrity

- Public geographic features: 6,357.
- Aliases: 1,086; maximum place shard: 999.
- PMTiles size: 2,657,441 bytes.
- PMTiles SHA-256: `ce7836849df470b56dc3f6284765824f77f34cb2fcb0b91ffb9cd0a10fa9fbcb`.
- Unmodified sources: 3,710 roads; 3,710 speed-limit records; 462 supplementary maxspeed tags.

## Before/after checks

- Active place records: 6,382 → 6,393; geographic features: 6,346 → 6,357.
- Public geographic features: 6,346 → 6,357.
- Previous place ULIDs retained: True; aliases retained: True (1,086).
- Roads: 3,710 → 3,710; source checksum unchanged: True.
- Speed limits: 3,710 → 3,710; source checksum unchanged: True.
- Supplementary maxspeed evidence: 462 → 462; source checksum unchanged: True.

## Unresolved review cases

- Phase 6.2 cases retained unchanged: 13 conflicting existing matches and 11 eligibility-uncertain candidates.
- Combined current capture analysis: 2 unresolved existing matches and 5 eligibility-uncertain candidates.
- Amma Hotel (01M5Z17G0C4C1Q8YM3ZR7W7HES, 01M5Z17GC75PDB0MRNFK5PN6ZE): retained separately; 12.8 m apart with differing address and category values; no independent evidence resolves whether these are one listing or separate businesses.
- Markaz Mosque, Oddamawadi (01M5Z5PDD8W74TDEST9HG41RY3, 01M5Z5PJM2K9AGEBTQWXNSCGPZ): retained separately; Same address/category and about 10 m apart, but coordinates differ and available records do not independently establish which point should be canonical.
- Other uncertain/conflicting candidate details are omitted from this public report. No unresolved candidate was deleted or merged.

## Limitations

- No pagination mode is documented; all captured queries returned fewer than 500 candidates.
- CLI provider and separate license metadata were not exposed and are not inferred.
- Place listings, category correctness, and pin placement were not independently verified; mzc output is not treated as external confirmation.
- Query-area counts overlap and are not a claim that every district place has been discovered.
