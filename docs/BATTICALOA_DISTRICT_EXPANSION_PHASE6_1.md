# Batticaloa District Places Expansion — Phase 6.1 — central batch

Scope: Batticaloa District, Eastern Province, Sri Lanka

## Discovery

- Confirmed CLI invocations: at least 577 across 575 successful unique query strings; exact total unavailable because two capture batches briefly overlapped and repeated-call count was not retained.
- Retained JSON rows: 14,948; four earlier successful exploratory queries had uncaptured response counts. Failed query attempts: 2; successful retries: 2; at-limit queries: 0.
- Capture accounting: Four preliminary successful administrative-area queries returned responses that were not retained, so their result counts are unknown and excluded. Two documented invocations were interrupted before capture and later retried successfully. Two query runners briefly overlapped; retained responses were reconciled by unique query, but the exact number of redundant calls cannot be reconstructed. Confirmed invocation count is therefore a lower bound.
- Raw candidates in retained JSON captures: 14,948; duplicate calls with unavailable capture counts are excluded.
- Unique candidates after normalized name and coordinate grouping: 2,242.
- New public place records in this change: 147.
- Imported names formatted: 51; imported addresses mechanically formatted: 40.
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
- Existing place duplicate: 1335
- Invalid missing coordinates: 0
- Invalid missing name: 0
- Mzc source conflict: 0
- New public candidate: 374
- Out of district: 463
- Uncertain public eligibility: 43
- Unresolved existing match: 27

## Candidate data quality signals

- Missing address: 8
- Missing categories: 12
- Missing phone: 813

## Query-area coverage

Counts overlap when a candidate appears in more than one category query. Query area means the search prompt, not a verified town assignment.

- batticaloa: existing place duplicate 119, new public candidate 10
- cheddipalaiyam: existing place duplicate 519, new public candidate 151, unresolved existing match 6
- chenkaladi: existing place duplicate 106, new public candidate 20
- eravur: existing place duplicate 75, new public candidate 43
- illipaiyadichchenai: existing place duplicate 493, new public candidate 136, unresolved existing match 7
- kalkudah: existing place duplicate 77, new public candidate 26, unresolved existing match 1
- kaluwanchikudy: existing place duplicate 104, new public candidate 19, unresolved existing match 1
- karadiyanaru: existing place duplicate 447, new public candidate 50, unresolved existing match 9
- kiran: existing place duplicate 123, new public candidate 27, unresolved existing match 4
- koddaikallar: existing place duplicate 494, new public candidate 175, unresolved existing match 5
- kokkadichcholai: existing place duplicate 498, new public candidate 36, unresolved existing match 8
- kurumunveli: existing place duplicate 462, new public candidate 52, unresolved existing match 9
- mangalagama: existing place duplicate 353, new public candidate 46, unresolved existing match 4
- navatkudah-east: existing place duplicate 432, new public candidate 26, unresolved existing match 7
- nuwaragalathenna: existing place duplicate 622, new public candidate 46, unresolved existing match 13
- paddippalai: existing place duplicate 499, new public candidate 35, unresolved existing match 7
- palameen-madu: existing place duplicate 530, new public candidate 37, unresolved existing match 13
- pasikudah: existing place duplicate 74, new public candidate 22, unresolved existing match 1
- pasikudah-bay: existing place duplicate 96, new public candidate 16, unresolved existing match 2
- periyakallar: existing place duplicate 339, new public candidate 25, unresolved existing match 3
- puliyanthivu-east: existing place duplicate 129, new public candidate 25, unresolved existing match 7
- puliyanthivu-south: existing place duplicate 125, new public candidate 11, unresolved existing match 5
- puliyanthivu-west: existing place duplicate 117, new public candidate 12, unresolved existing match 6
- rideethenna: existing place duplicate 534, new public candidate 24, unresolved existing match 10
- rukamputur: existing place duplicate 542, new public candidate 40, unresolved existing match 6
- trikkandimadu: existing place duplicate 468, new public candidate 23, unresolved existing match 10
- tumpalancholai: existing place duplicate 478, new public candidate 31, unresolved existing match 5
- unnichchai: existing place duplicate 341, new public candidate 20, unresolved existing match 6
- urukamam: existing place duplicate 551, new public candidate 52, unresolved existing match 11
- vahaneri: existing place duplicate 463, new public candidate 64, unresolved existing match 6
- vakarai: existing place duplicate 94, new public candidate 21, unresolved existing match 1
- valaichchenai: existing place duplicate 82, new public candidate 28, unresolved existing match 1
- vellavely: existing place duplicate 479, new public candidate 37, unresolved existing match 12
- vettukkadu: existing place duplicate 442, new public candidate 61, unresolved existing match 10

## Category-prompt coverage

- accommodation: existing place duplicate 507, new public candidate 26, unresolved existing match 4
- agriculture-fisheries: existing place duplicate 124, new public candidate 25
- clothing-textiles: existing place duplicate 336, new public candidate 30, unresolved existing match 1
- community-library: existing place duplicate 87, new public candidate 9, unresolved existing match 3
- education: existing place duplicate 381, new public candidate 4, unresolved existing match 55
- electronics-mobile: existing place duplicate 297, new public candidate 88, unresolved existing match 61
- finance: existing place duplicate 985
- food: existing place duplicate 1200, new public candidate 59, unresolved existing match 29
- government: existing place duplicate 670, new public candidate 154, unresolved existing match 14
- hardware-building: existing place duplicate 434, new public candidate 242
- health: existing place duplicate 631, new public candidate 4, unresolved existing match 1
- printing-photo: existing place duplicate 437, new public candidate 68
- recreation: existing place duplicate 462, new public candidate 8, unresolved existing match 2
- religious: existing place duplicate 1438, new public candidate 412, unresolved existing match 22
- retail: existing place duplicate 775, new public candidate 24
- salon-beauty: existing place duplicate 325, new public candidate 66
- sports-fitness: existing place duplicate 312, new public candidate 112, unresolved existing match 3
- tourism-attractions: existing place duplicate 1019, new public candidate 27, unresolved existing match 1
- transport: existing place duplicate 149
- vehicle: existing place duplicate 502, new public candidate 62
- wholesale-commercial: existing place duplicate 236, new public candidate 27

## Generated integrity

- Public geographic features: 4,078.
- Aliases: 1,086; maximum place shard: 999.
- MZP size: 2,454,522 bytes (323,650 gzip bytes).
- MZP SHA-256: `1635f14325eed5ed280bab5ebbe18f30d9e2fc6d9d43a6ba6177eaf8b720d4bf`.
- Unmodified sources: 3,710 roads; 3,710 speed-limit records; 462 supplementary maxspeed tags.

## Before/after checks

- Active place records: 3,967 → 4,114; geographic features: 3,931 → 4,078.
- Place MZP download size: 309,201 → 323,650 gzip bytes (+14,449).
- Previous place ULIDs retained: True; aliases retained: True (1,086).
- Roads: 3,710 → 3,710; source checksum unchanged: True.
- Speed limits: 3,710 → 3,710; source checksum unchanged: True.
- Supplementary maxspeed evidence: 462 → 462; source checksum unchanged: True.

## Limitations

- No pagination mode is documented; all captured queries returned fewer than 500 candidates.
- CLI provider and license metadata were unavailable and are not inferred.
- Place listings, category correctness, and pin placement were not independently verified; mzc output is not treated as external confirmation.
- Query-area counts overlap and are not a claim that every district place has been discovered.
