# Batticaloa District Places Expansion — Phase 6.1 — Southern batch

Scope: Batticaloa District, Eastern Province, Sri Lanka

## Discovery

- Confirmed CLI invocations: at least 577 across 575 successful unique query strings; exact total unavailable because two capture batches briefly overlapped and repeated-call count was not retained.
- Retained JSON rows: 14,948; four earlier successful exploratory queries had uncaptured response counts. Failed query attempts: 2; successful retries: 2; at-limit queries: 0.
- Capture accounting: Four preliminary successful administrative-area queries returned responses that were not retained, so their result counts are unknown and excluded. Two documented invocations were interrupted before capture and later retried successfully. Two query runners briefly overlapped; retained responses were reconciled by unique query, but the exact number of redundant calls cannot be reconstructed. Confirmed invocation count is therefore a lower bound.
- Raw candidates in retained JSON captures: 14,948; duplicate calls with unavailable capture counts are excluded.
- Unique candidates after normalized name and coordinate grouping: 2,242.
- New public place records in this change: 285.
- Imported names formatted: 76; imported addresses mechanically formatted: 30.
- Unresolved nearby same-name pairs retained for review: 0.
- Duplicate query rows collapsed: 12,706.
- Candidate origin and license information is not exposed by the documented mzc CLI; maintainer review is required before attributing or redistributing the underlying data.
- Place records are not independently verified and retain mzc provenance.

## District and privacy checks

- District membership checked against the Sri Lanka NSDI Batticaloa District polygon: https://gisapps.nsdi.gov.lk/server/rest/services/Srilanka/Boundaries/MapServer/3.
- Raw outside-district, private, uncertain, invalid, and conflicting candidates are represented only as aggregate counts; names, exact coordinates, contact data, and addresses are not listed.
- Existing place aliases are checked for represented places; no road or speed-limit source records are changed.

## Counts

- Excluded confirmed private: 0
- Existing place duplicate: 797
- Invalid missing coordinates: 0
- Invalid missing name: 0
- Mzc source conflict: 0
- New public candidate: 913
- Out of district: 463
- Uncertain public eligibility: 43
- Unresolved existing match: 26

## Candidate data quality signals

- Missing address: 8
- Missing categories: 12
- Missing phone: 813

## Query-area coverage

Counts overlap when a candidate appears in more than one category query. Query area means the search prompt, not a verified town assignment.

- batticaloa: existing place duplicate 77, new public candidate 52
- cheddipalaiyam: existing place duplicate 407, new public candidate 263, unresolved existing match 6
- chenkaladi: existing place duplicate 68, new public candidate 58
- eravur: existing place duplicate 47, new public candidate 71
- illipaiyadichchenai: existing place duplicate 411, new public candidate 218, unresolved existing match 7
- kalkudah: existing place duplicate 52, new public candidate 51, unresolved existing match 1
- kaluwanchikudy: existing place duplicate 64, new public candidate 59, unresolved existing match 1
- karadiyanaru: existing place duplicate 357, new public candidate 140, unresolved existing match 9
- kiran: existing place duplicate 78, new public candidate 72, unresolved existing match 4
- koddaikallar: existing place duplicate 364, new public candidate 305, unresolved existing match 5
- kokkadichcholai: existing place duplicate 375, new public candidate 159, unresolved existing match 8
- kurumunveli: existing place duplicate 353, new public candidate 162, unresolved existing match 8
- mangalagama: existing place duplicate 284, new public candidate 115, unresolved existing match 4
- navatkudah-east: existing place duplicate 356, new public candidate 102, unresolved existing match 7
- nuwaragalathenna: existing place duplicate 469, new public candidate 199, unresolved existing match 13
- paddippalai: existing place duplicate 381, new public candidate 153, unresolved existing match 7
- palameen-madu: existing place duplicate 408, new public candidate 159, unresolved existing match 13
- pasikudah: existing place duplicate 57, new public candidate 39, unresolved existing match 1
- pasikudah-bay: existing place duplicate 69, new public candidate 43, unresolved existing match 2
- periyakallar: existing place duplicate 250, new public candidate 114, unresolved existing match 3
- puliyanthivu-east: existing place duplicate 73, new public candidate 81, unresolved existing match 7
- puliyanthivu-south: existing place duplicate 82, new public candidate 54, unresolved existing match 5
- puliyanthivu-west: existing place duplicate 69, new public candidate 60, unresolved existing match 6
- rideethenna: existing place duplicate 427, new public candidate 131, unresolved existing match 10
- rukamputur: existing place duplicate 406, new public candidate 176, unresolved existing match 6
- trikkandimadu: existing place duplicate 380, new public candidate 111, unresolved existing match 10
- tumpalancholai: existing place duplicate 369, new public candidate 140, unresolved existing match 5
- unnichchai: existing place duplicate 299, new public candidate 62, unresolved existing match 6
- urukamam: existing place duplicate 410, new public candidate 193, unresolved existing match 11
- vahaneri: existing place duplicate 364, new public candidate 163, unresolved existing match 6
- vakarai: existing place duplicate 54, new public candidate 61, unresolved existing match 1
- valaichchenai: existing place duplicate 51, new public candidate 59, unresolved existing match 1
- vellavely: existing place duplicate 358, new public candidate 158, unresolved existing match 12
- vettukkadu: existing place duplicate 336, new public candidate 167, unresolved existing match 10

## Category-prompt coverage

- accommodation: existing place duplicate 456, new public candidate 77, unresolved existing match 4
- agriculture-fisheries: existing place duplicate 45, new public candidate 104
- clothing-textiles: existing place duplicate 135, new public candidate 231, unresolved existing match 1
- community-library: existing place duplicate 2, new public candidate 94, unresolved existing match 3
- education: existing place duplicate 365, new public candidate 20, unresolved existing match 55
- electronics-mobile: existing place duplicate 195, new public candidate 190, unresolved existing match 61
- finance: existing place duplicate 972, new public candidate 13
- food: existing place duplicate 1116, new public candidate 143, unresolved existing match 29
- government: existing place duplicate 333, new public candidate 491, unresolved existing match 14
- hardware-building: existing place duplicate 172, new public candidate 504
- health: existing place duplicate 613, new public candidate 23
- printing-photo: existing place duplicate 276, new public candidate 229
- recreation: existing place duplicate 452, new public candidate 18, unresolved existing match 2
- religious: existing place duplicate 709, new public candidate 1141, unresolved existing match 22
- retail: existing place duplicate 774, new public candidate 25
- salon-beauty: existing place duplicate 282, new public candidate 109
- sports-fitness: existing place duplicate 29, new public candidate 395, unresolved existing match 3
- tourism-attractions: existing place duplicate 896, new public candidate 150, unresolved existing match 1
- transport: existing place duplicate 149
- vehicle: existing place duplicate 438, new public candidate 126
- wholesale-commercial: existing place duplicate 196, new public candidate 67

## Generated integrity

- Public geographic features: 3,677.
- Aliases: 1,086; maximum place shard: 999.
- MZP size: 2,125,543 bytes (284,620 gzip bytes).
- MZP SHA-256: `8d1ef235903f62205077c87b629042f6a8bf72b8769ec88499764c15c04f7b0f`.
- Unmodified sources: 3,710 roads; 3,710 speed-limit records; 462 supplementary maxspeed tags.

## Before/after checks

- Active place records: 3,428 → 3,713; geographic features: 3,392 → 3,677.
- Place MZP download size: 261,511 → 284,620 gzip bytes (+23,109).
- Previous place ULIDs retained: True; aliases retained: True (1,086).
- Roads: 3,710 → 3,710; source checksum unchanged: True.
- Speed limits: 3,710 → 3,710; source checksum unchanged: True.
- Supplementary maxspeed evidence: 462 → 462; source checksum unchanged: True.

## Limitations

- No pagination mode is documented; all captured queries returned fewer than 500 candidates.
- CLI provider and license metadata were unavailable and are not inferred.
- Place listings, category correctness, and pin placement were not independently verified; mzc output is not treated as external confirmation.
- Query-area counts overlap and are not a claim that every district place has been discovered.
