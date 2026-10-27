# Batticaloa District Places Expansion — Phase 6.1 — Central-south batch

Scope: Batticaloa District, Eastern Province, Sri Lanka

## Discovery

- Confirmed CLI invocations: at least 577 across 575 successful unique query strings; exact total unavailable because two capture batches briefly overlapped and repeated-call count was not retained.
- Retained JSON rows: 14,948; four earlier successful exploratory queries had uncaptured response counts. Failed query attempts: 2; successful retries: 2; at-limit queries: 0.
- Capture accounting: Four preliminary successful administrative-area queries returned responses that were not retained, so their result counts are unknown and excluded. Two documented invocations were interrupted before capture and later retried successfully. Two query runners briefly overlapped; retained responses were reconciled by unique query, but the exact number of redundant calls cannot be reconstructed. Confirmed invocation count is therefore a lower bound.
- Raw candidates in retained JSON captures: 14,948; duplicate calls with unavailable capture counts are excluded.
- Unique candidates after normalized name and coordinate grouping: 2,242.
- New public place records in this change: 254.
- Imported names formatted: 72; imported addresses mechanically formatted: 85.
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
- Existing place duplicate: 1081
- Invalid missing coordinates: 0
- Invalid missing name: 0
- Mzc source conflict: 0
- New public candidate: 628
- Out of district: 463
- Uncertain public eligibility: 43
- Unresolved existing match: 27

## Candidate data quality signals

- Missing address: 8
- Missing categories: 12
- Missing phone: 813

## Query-area coverage

Counts overlap when a candidate appears in more than one category query. Query area means the search prompt, not a verified town assignment.

- batticaloa: existing place duplicate 78, new public candidate 51
- cheddipalaiyam: existing place duplicate 448, new public candidate 222, unresolved existing match 6
- chenkaladi: existing place duplicate 75, new public candidate 51
- eravur: existing place duplicate 52, new public candidate 66
- illipaiyadichchenai: existing place duplicate 431, new public candidate 198, unresolved existing match 7
- kalkudah: existing place duplicate 55, new public candidate 48, unresolved existing match 1
- kaluwanchikudy: existing place duplicate 83, new public candidate 40, unresolved existing match 1
- karadiyanaru: existing place duplicate 388, new public candidate 109, unresolved existing match 9
- kiran: existing place duplicate 86, new public candidate 64, unresolved existing match 4
- koddaikallar: existing place duplicate 445, new public candidate 224, unresolved existing match 5
- kokkadichcholai: existing place duplicate 420, new public candidate 114, unresolved existing match 8
- kurumunveli: existing place duplicate 411, new public candidate 103, unresolved existing match 9
- mangalagama: existing place duplicate 310, new public candidate 89, unresolved existing match 4
- navatkudah-east: existing place duplicate 375, new public candidate 83, unresolved existing match 7
- nuwaragalathenna: existing place duplicate 537, new public candidate 131, unresolved existing match 13
- paddippalai: existing place duplicate 432, new public candidate 102, unresolved existing match 7
- palameen-madu: existing place duplicate 447, new public candidate 120, unresolved existing match 13
- pasikudah: existing place duplicate 57, new public candidate 39, unresolved existing match 1
- pasikudah-bay: existing place duplicate 73, new public candidate 39, unresolved existing match 2
- periyakallar: existing place duplicate 294, new public candidate 70, unresolved existing match 3
- puliyanthivu-east: existing place duplicate 85, new public candidate 69, unresolved existing match 7
- puliyanthivu-south: existing place duplicate 85, new public candidate 51, unresolved existing match 5
- puliyanthivu-west: existing place duplicate 72, new public candidate 57, unresolved existing match 6
- rideethenna: existing place duplicate 449, new public candidate 109, unresolved existing match 10
- rukamputur: existing place duplicate 462, new public candidate 120, unresolved existing match 6
- trikkandimadu: existing place duplicate 410, new public candidate 81, unresolved existing match 10
- tumpalancholai: existing place duplicate 395, new public candidate 114, unresolved existing match 5
- unnichchai: existing place duplicate 306, new public candidate 55, unresolved existing match 6
- urukamam: existing place duplicate 470, new public candidate 133, unresolved existing match 11
- vahaneri: existing place duplicate 390, new public candidate 137, unresolved existing match 6
- vakarai: existing place duplicate 60, new public candidate 55, unresolved existing match 1
- valaichchenai: existing place duplicate 54, new public candidate 56, unresolved existing match 1
- vellavely: existing place duplicate 403, new public candidate 113, unresolved existing match 12
- vettukkadu: existing place duplicate 346, new public candidate 157, unresolved existing match 10

## Category-prompt coverage

- accommodation: existing place duplicate 476, new public candidate 57, unresolved existing match 4
- agriculture-fisheries: existing place duplicate 72, new public candidate 77
- clothing-textiles: existing place duplicate 140, new public candidate 226, unresolved existing match 1
- community-library: existing place duplicate 15, new public candidate 81, unresolved existing match 3
- education: existing place duplicate 367, new public candidate 18, unresolved existing match 55
- electronics-mobile: existing place duplicate 217, new public candidate 168, unresolved existing match 61
- finance: existing place duplicate 976, new public candidate 9
- food: existing place duplicate 1141, new public candidate 118, unresolved existing match 29
- government: existing place duplicate 495, new public candidate 329, unresolved existing match 14
- hardware-building: existing place duplicate 209, new public candidate 467
- health: existing place duplicate 619, new public candidate 16, unresolved existing match 1
- printing-photo: existing place duplicate 302, new public candidate 203
- recreation: existing place duplicate 452, new public candidate 18, unresolved existing match 2
- religious: existing place duplicate 1058, new public candidate 792, unresolved existing match 22
- retail: existing place duplicate 775, new public candidate 24
- salon-beauty: existing place duplicate 283, new public candidate 108
- sports-fitness: existing place duplicate 94, new public candidate 330, unresolved existing match 3
- tourism-attractions: existing place duplicate 951, new public candidate 95, unresolved existing match 1
- transport: existing place duplicate 149
- vehicle: existing place duplicate 488, new public candidate 76
- wholesale-commercial: existing place duplicate 205, new public candidate 58

## Generated integrity

- Public geographic features: 3,931.
- Aliases: 1,086; maximum place shard: 999.
- MZP size: 2,340,256 bytes (309,201 gzip bytes).
- MZP SHA-256: `6884f0529e82e3aff97f9fb2dd27ea797295436a9d83b1c7328fd70d8f7b0171`.
- Unmodified sources: 3,710 roads; 3,710 speed-limit records; 462 supplementary maxspeed tags.

## Before/after checks

- Active place records: 3,713 → 3,967; geographic features: 3,677 → 3,931.
- Place MZP download size: 284,620 → 309,201 gzip bytes (+24,581).
- Previous place ULIDs retained: True; aliases retained: True (1,086).
- Roads: 3,710 → 3,710; source checksum unchanged: True.
- Speed limits: 3,710 → 3,710; source checksum unchanged: True.
- Supplementary maxspeed evidence: 462 → 462; source checksum unchanged: True.

## Limitations

- No pagination mode is documented; all captured queries returned fewer than 500 candidates.
- CLI provider and license metadata were unavailable and are not inferred.
- Place listings, category correctness, and pin placement were not independently verified; mzc output is not treated as external confirmation.
- Query-area counts overlap and are not a claim that every district place has been discovered.
