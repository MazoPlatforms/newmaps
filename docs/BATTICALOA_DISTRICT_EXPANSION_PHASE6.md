# Batticaloa District Places Expansion — Phase 6

Scope: Batticaloa District, Eastern Province, Sri Lanka

## Discovery

- CLI invocations: 168 total (166 unique query strings); 1 failed attempt, 1 successful retry; 0 queries at the 500-result cap.
- Raw candidates in retained JSON captures: 5,579; successful rows across all invocations including unretained repeat results: 5,662.
- Unique candidates after normalized name and coordinate grouping: 1,292.
- New public place records in this change: 820.
- Imported names formatted: 222; imported addresses mechanically formatted: 276.
- Unresolved nearby same-name pairs retained for review: 1.
- Duplicate query rows collapsed: 4,287.
- Candidate origin and license information is not exposed by the documented mzc CLI; maintainer review is required before attributing or redistributing the underlying data.
- Place records are not independently verified and retain mzc provenance.

## District and privacy checks

- District membership checked against the Sri Lanka NSDI Batticaloa District polygon: https://gisapps.nsdi.gov.lk/server/rest/services/Srilanka/Boundaries/MapServer/3.
- Raw outside-district, private, uncertain, invalid, and conflicting candidates are represented only as aggregate counts; names, exact coordinates, contact data, and addresses are not listed.
- Existing place aliases are checked for represented places; no road or speed-limit source records are changed.

## Counts

- Excluded confirmed private: 0
- Existing place duplicate: 211
- Invalid missing coordinates: 0
- Invalid missing name: 0
- Mzc source conflict: 0
- New public candidate: 820
- Out of district: 221
- Uncertain public eligibility: 16
- Unresolved existing match: 24

## Candidate data quality signals

- Missing address: 7
- Missing categories: 4
- Missing phone: 331

## Query-area coverage

Counts overlap when a candidate appears in more than one category query. Query area means the search prompt, not a verified town assignment.

- araiyampathy: existing place duplicate 116, new public candidate 250, unresolved existing match 16
- batticaloa: existing place duplicate 89, new public candidate 248, unresolved existing match 5
- chenkalady: existing place duplicate 82, new public candidate 229, unresolved existing match 6
- district: existing place duplicate 34, new public candidate 149, unresolved existing match 2
- eravur: existing place duplicate 74, new public candidate 257, unresolved existing match 15
- kalkudah: existing place duplicate 53, new public candidate 194, unresolved existing match 8
- kallady: existing place duplicate 100, new public candidate 182, unresolved existing match 14
- kaluwanchikudy: existing place duplicate 73, new public candidate 169, unresolved existing match 9
- kattankudy: existing place duplicate 161, new public candidate 134, unresolved existing match 16
- kiran: existing place duplicate 93, new public candidate 274, unresolved existing match 16
- manmunai: existing place duplicate 97, new public candidate 254, unresolved existing match 12
- mylambaveli: existing place duplicate 110, new public candidate 303, unresolved existing match 12
- oddamavadi: existing place duplicate 50, new public candidate 145, unresolved existing match 1
- pasikudah: existing place duplicate 45, new public candidate 223, unresolved existing match 9
- vakarai: existing place duplicate 104, new public candidate 286, unresolved existing match 12
- valaichchenai: existing place duplicate 69, new public candidate 218, unresolved existing match 10

## Category-prompt coverage

- accommodation: existing place duplicate 110, new public candidate 155
- education: existing place duplicate 99, new public candidate 712, unresolved existing match 137
- finance: existing place duplicate 87, new public candidate 428
- food: existing place duplicate 372, new public candidate 331, unresolved existing match 21
- food-exploratory: existing place duplicate 34, new public candidate 149, unresolved existing match 2
- government: existing place duplicate 5, new public candidate 106
- health: existing place duplicate 88, new public candidate 359
- recreation: existing place duplicate 86, new public candidate 256
- religious: existing place duplicate 83, new public candidate 138, unresolved existing match 3
- retail: existing place duplicate 192, new public candidate 678
- transport: existing place duplicate 51, new public candidate 45
- vehicle: existing place duplicate 143, new public candidate 158

## Generated integrity

- Public geographic features: 3,392.
- Aliases: 1,086; maximum place shard: 999.
- MZP size: 1,935,675 bytes (261,511 gzip bytes).
- MZP SHA-256: `77cca7eb4c3183f0357b49c9b860bde02aec2fcaf7c7c1f7e0dac6922abbe55b`.
- Unmodified sources: 3,710 roads; 3,710 speed-limit records; 462 supplementary maxspeed tags.

## Before/after checks

- Active place records: 2,608 → 3,428; geographic features: 2,572 → 3,392.
- Place MZP download size: 189,339 → 261,511 gzip bytes (+72,172).
- Previous place ULIDs retained: True; aliases retained: True (1,086).
- Roads: 3,710 → 3,710; source checksum unchanged: True.
- Speed limits: 3,710 → 3,710; source checksum unchanged: True.
- Supplementary maxspeed evidence: 462 → 462; source checksum unchanged: True.

## Limitations

- No pagination mode is documented; all captured queries returned fewer than 500 candidates.
- CLI provider and license metadata were unavailable and are not inferred.
- Place listings, category correctness, and pin placement were not independently verified; mzc output is not treated as external confirmation.
- Query-area counts overlap and are not a claim that every district place has been discovered.
