# Global Places Expansion — Global mzc discovery batch 5

Scope: Sri Lanka and any documented mzc discovery result that passes public-place and duplicate checks

## Discovery

- Confirmed CLI invocations: at least 14 across 11 successful unique query strings; exact total unavailable because two capture batches briefly overlapped and repeated-call count was not retained.
- Retained JSON rows: 1,241; four earlier successful exploratory queries had uncaptured response counts. Captured failed attempts: 3; known failed diagnostic calls: 0; successful retries: 0; unique queries still failed: 1; at-limit queries: 0.
- Capture accounting: Four preliminary successful administrative-area queries returned responses that were not retained, so their result counts are unknown and excluded. Two documented invocations were interrupted before capture and later retried successfully. Two query runners briefly overlapped; retained responses were reconciled by unique query, but the exact number of redundant calls cannot be reconstructed. Confirmed invocation count is therefore a lower bound.
- Raw candidates in retained JSON captures: 1,241; duplicate calls with unavailable capture counts are excluded.
- Unique candidates after normalized name and coordinate grouping: 1,238.
- New public place records in this change: 1,122.
- Cumulative Phase 6.3 imports recorded to date: 1,122.
- Phase 6.2 failed prompts recovered: 0; additional locality/category queries: 0.
- Imported names formatted: 270; imported addresses mechanically formatted: 415.
- Unresolved nearby same-name pairs retained for review: 3.
- Duplicate query rows collapsed: 3.
- Candidate origin and license information is not exposed by the documented mzc CLI; maintainer review is required before attributing or redistributing the underlying data.
- Canonical place records contain no importer-added provenance or source metadata. Captured listings were not independently verified.

## Geographic and privacy checks

- This explicitly global import does not exclude a public candidate by district-boundary membership. Location is retained only as supplied by the documented CLI output.
- Private, uncertain, invalid, and conflicting candidates are represented only as aggregate counts; names, exact coordinates, contact data, and addresses are not listed.
- Existing place aliases are checked for represented places; no road or speed-limit source records are changed.

## Counts

- Excluded confirmed private: 0
- Existing place duplicate: 102
- Invalid missing coordinates: 1
- Invalid missing name: 0
- Mzc source conflict: 0
- New public candidate: 1122
- Uncertain public eligibility: 10
- Unresolved existing match: 3

## Candidate data quality signals

- Missing address: 28
- Missing categories: 7
- Missing phone: 255

## Query-area coverage

Counts overlap when a candidate appears in more than one category query. Query area means the search prompt, not a verified town assignment.

- sri-lanka: existing place duplicate 102, new public candidate 1125, unresolved existing match 3

## Category-prompt coverage

- broad-national: new public candidate 13
- education: existing place duplicate 1, new public candidate 91
- financial: existing place duplicate 1, new public candidate 105
- food: existing place duplicate 37, new public candidate 190
- government: new public candidate 18
- health: existing place duplicate 13, new public candidate 197
- recreation: existing place duplicate 13, new public candidate 94, unresolved existing match 2
- retail: existing place duplicate 14, new public candidate 35
- transport: new public candidate 35
- vehicle-services: existing place duplicate 12, new public candidate 236
- worship: existing place duplicate 11, new public candidate 111, unresolved existing match 1

## Generated integrity

- Public geographic features: 7,351.
- Aliases: 1,086; maximum place shard: 999.
- PMTiles size: 3,290,281 bytes.
- PMTiles SHA-256: `f6d91e8b42ca40bf9e188e002e783ad93df2d438f69d0b81c418259410a9f992`.
- Unmodified sources: 3,710 roads; 3,710 speed-limit records; 462 supplementary maxspeed tags.

## Before/after checks

- Active place records: 6,265 → 7,387; geographic features: 6,229 → 7,351.
- Public geographic features: 6,229 → 7,351.
- Previous place ULIDs retained: True; aliases retained: True (1,086).
- Roads: 3,710 → 3,710; source checksum unchanged: True.
- Speed limits: 3,710 → 3,710; source checksum unchanged: True.
- Supplementary maxspeed evidence: 462 → 462; source checksum unchanged: True.

## Unresolved review cases

- Phase 6.2 cases retained unchanged: 13 conflicting existing matches and 11 eligibility-uncertain candidates.
- Combined current capture analysis: 3 unresolved existing matches and 10 eligibility-uncertain candidates.
- Amma Hotel (01M5Z17G0C4C1Q8YM3ZR7W7HES, 01M5Z17GC75PDB0MRNFK5PN6ZE): retained separately; 12.8 m apart with differing address and category values; no independent evidence resolves whether these are one listing or separate businesses.
- Markaz Mosque, Oddamawadi (01M5Z5PDD8W74TDEST9HG41RY3, 01M5Z5PJM2K9AGEBTQWXNSCGPZ): retained separately; Same address/category and about 10 m apart, but coordinates differ and available records do not independently establish which point should be canonical.
- Other uncertain/conflicting candidate details are omitted from this public report. No unresolved candidate was deleted or merged.

## Limitations

- No pagination mode is documented; all captured queries returned fewer than 500 candidates.
- CLI provider and separate license metadata were not exposed and are not inferred.
- Place listings, category correctness, and pin placement were not independently verified; mzc output is not treated as external confirmation.
- Query-area counts overlap and are not a claim that every district place has been discovered.
