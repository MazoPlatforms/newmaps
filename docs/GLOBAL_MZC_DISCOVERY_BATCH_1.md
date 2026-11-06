# Global Places Expansion — mzc discovery batch 1

Scope: Sri Lanka and any documented mzc discovery result that passes public-place and duplicate checks

## Discovery

- Confirmed CLI invocations: at least 7 across 7 successful unique query strings; exact total unavailable because two capture batches briefly overlapped and repeated-call count was not retained.
- Retained JSON rows: 408; four earlier successful exploratory queries had uncaptured response counts. Captured failed attempts: 0; known failed diagnostic calls: 0; successful retries: 0; unique queries still failed: 0; at-limit queries: 0.
- Capture accounting: Four preliminary successful administrative-area queries returned responses that were not retained, so their result counts are unknown and excluded. Two documented invocations were interrupted before capture and later retried successfully. Two query runners briefly overlapped; retained responses were reconciled by unique query, but the exact number of redundant calls cannot be reconstructed. Confirmed invocation count is therefore a lower bound.
- Raw candidates in retained JSON captures: 408; duplicate calls with unavailable capture counts are excluded.
- Unique candidates after normalized name and coordinate grouping: 405.
- New public place records in this change: 353.
- Cumulative Phase 6.3 imports recorded to date: 353.
- Phase 6.2 failed prompts recovered: 0; additional locality/category queries: 0.
- Imported names formatted: 76; imported addresses mechanically formatted: 124.
- Unresolved nearby same-name pairs retained for review: 0.
- Duplicate query rows collapsed: 3.
- Candidate origin and license information is not exposed by the documented mzc CLI; maintainer review is required before attributing or redistributing the underlying data.
- Canonical place records contain no importer-added provenance or source metadata. Captured listings were not independently verified.

## Geographic and privacy checks

- This explicitly global import does not exclude a public candidate by district-boundary membership. Location is retained only as supplied by the documented CLI output.
- Private, uncertain, invalid, and conflicting candidates are represented only as aggregate counts; names, exact coordinates, contact data, and addresses are not listed.
- Existing place aliases are checked for represented places; no road or speed-limit source records are changed.

## Counts

- Excluded confirmed private: 0
- Existing place duplicate: 28
- Invalid missing coordinates: 0
- Invalid missing name: 0
- Mzc source conflict: 0
- New public candidate: 353
- Uncertain public eligibility: 23
- Unresolved existing match: 1

## Candidate data quality signals

- Missing address: 11
- Missing categories: 3
- Missing phone: 79

## Query-area coverage

Counts overlap when a candidate appears in more than one category query. Query area means the search prompt, not a verified town assignment.

- ampara-food: existing place duplicate 4, new public candidate 61
- ampara-public: existing place duplicate 1, new public candidate 15
- ampara-retail: new public candidate 8
- eastern-province-broad: existing place duplicate 22, new public candidate 41, unresolved existing match 1
- trincomalee-food: existing place duplicate 2, new public candidate 199
- trincomalee-public: new public candidate 21
- trincomalee-retail: new public candidate 10

## Category-prompt coverage

- unknown: existing place duplicate 29, new public candidate 355, unresolved existing match 1

## Generated integrity

- Public geographic features: 4,851.
- Aliases: 1,086; maximum place shard: 999.
- PMTiles size: 1,873,888 bytes.
- PMTiles SHA-256: `1c884d02811306a2498b9a4d39b38f9c66dca34849a5d96e42afe453b100d4c1`.
- Unmodified sources: 3,710 roads; 3,710 speed-limit records; 462 supplementary maxspeed tags.

## Before/after checks

- Active place records: 4,534 → 4,887; geographic features: 4,498 → 4,851.
- Public geographic features: 4,498 → 4,851.
- Previous place ULIDs retained: True; aliases retained: True (1,086).
- Roads: 3,710 → 3,710; source checksum unchanged: True.
- Speed limits: 3,710 → 3,710; source checksum unchanged: True.
- Supplementary maxspeed evidence: 462 → 462; source checksum unchanged: True.

## Unresolved review cases

- Phase 6.2 cases retained unchanged: 13 conflicting existing matches and 11 eligibility-uncertain candidates.
- Combined current capture analysis: 1 unresolved existing matches and 23 eligibility-uncertain candidates.
- Amma Hotel (01M5Z17G0C4C1Q8YM3ZR7W7HES, 01M5Z17GC75PDB0MRNFK5PN6ZE): retained separately; 12.8 m apart with differing address and category values; no independent evidence resolves whether these are one listing or separate businesses.
- Markaz Mosque, Oddamawadi (01M5Z5PDD8W74TDEST9HG41RY3, 01M5Z5PJM2K9AGEBTQWXNSCGPZ): retained separately; Same address/category and about 10 m apart, but coordinates differ and available records do not independently establish which point should be canonical.
- Other uncertain/conflicting candidate details are omitted from this public report. No unresolved candidate was deleted or merged.

## Limitations

- No pagination mode is documented; all captured queries returned fewer than 500 candidates.
- CLI provider and separate license metadata were not exposed and are not inferred.
- Place listings, category correctness, and pin placement were not independently verified; mzc output is not treated as external confirmation.
- Query-area counts overlap and are not a claim that every district place has been discovered.
