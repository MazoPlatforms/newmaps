# Batticaloa District Places Expansion — Phase 6.1 — north batch

Scope: Batticaloa District, Eastern Province, Sri Lanka

## Discovery

- Confirmed CLI invocations: at least 577 across 575 successful unique query strings; exact total unavailable because two capture batches briefly overlapped and repeated-call count was not retained.
- Retained JSON rows: 14,948; four earlier successful exploratory queries had uncaptured response counts. Failed query attempts: 2; successful retries: 2; at-limit queries: 0.
- Capture accounting: Four preliminary successful administrative-area queries returned responses that were not retained, so their result counts are unknown and excluded. Two documented invocations were interrupted before capture and later retried successfully. Two query runners briefly overlapped; retained responses were reconciled by unique query, but the exact number of redundant calls cannot be reconstructed. Confirmed invocation count is therefore a lower bound.
- Raw candidates in retained JSON captures: 14,948; duplicate calls with unavailable capture counts are excluded.
- Unique candidates after normalized name and coordinate grouping: 2,242.
- New public place records in this change: 227.
- Imported names formatted: 64; imported addresses mechanically formatted: 36.
- Unresolved nearby same-name pairs retained for review: 1.
- Duplicate query rows collapsed: 12,706.
- Candidate origin and license information is not exposed by the documented mzc CLI; maintainer review is required before attributing or redistributing the underlying data.
- Canonical place records contain no importer-added provenance or source metadata. Captured listings were not independently verified.

## District and privacy checks

- District membership checked against the Sri Lanka NSDI Batticaloa District polygon: https://gisapps.nsdi.gov.lk/server/rest/services/Srilanka/Boundaries/MapServer/3.
- Raw outside-district, private, uncertain, invalid, and conflicting candidates are represented only as aggregate counts; names, exact coordinates, contact data, and addresses are not listed.
- Existing place aliases are checked for represented places; no road or speed-limit source records are changed.

## Counts

- Excluded confirmed private: 0
- Existing place duplicate: 1482
- Invalid missing coordinates: 0
- Invalid missing name: 0
- Mzc source conflict: 0
- New public candidate: 227
- Out of district: 463
- Uncertain public eligibility: 43
- Unresolved existing match: 27

## Candidate data quality signals

- Missing address: 8
- Missing categories: 12
- Missing phone: 813

## Query-area coverage

Counts overlap when a candidate appears in more than one category query. Query area means the search prompt, not a verified town assignment.

- batticaloa: existing place duplicate 129
- cheddipalaiyam: existing place duplicate 557, new public candidate 113, unresolved existing match 6
- chenkaladi: existing place duplicate 120, new public candidate 6
- eravur: existing place duplicate 111, new public candidate 7
- illipaiyadichchenai: existing place duplicate 522, new public candidate 107, unresolved existing match 7
- kalkudah: existing place duplicate 89, new public candidate 14, unresolved existing match 1
- kaluwanchikudy: existing place duplicate 118, new public candidate 5, unresolved existing match 1
- karadiyanaru: existing place duplicate 474, new public candidate 23, unresolved existing match 9
- kiran: existing place duplicate 139, new public candidate 11, unresolved existing match 4
- koddaikallar: existing place duplicate 520, new public candidate 149, unresolved existing match 5
- kokkadichcholai: existing place duplicate 515, new public candidate 19, unresolved existing match 8
- kurumunveli: existing place duplicate 495, new public candidate 19, unresolved existing match 9
- mangalagama: existing place duplicate 374, new public candidate 25, unresolved existing match 4
- navatkudah-east: existing place duplicate 449, new public candidate 9, unresolved existing match 7
- nuwaragalathenna: existing place duplicate 652, new public candidate 16, unresolved existing match 13
- paddippalai: existing place duplicate 522, new public candidate 12, unresolved existing match 7
- palameen-madu: existing place duplicate 555, new public candidate 12, unresolved existing match 13
- pasikudah: existing place duplicate 82, new public candidate 14, unresolved existing match 1
- pasikudah-bay: existing place duplicate 102, new public candidate 10, unresolved existing match 2
- periyakallar: existing place duplicate 357, new public candidate 7, unresolved existing match 3
- puliyanthivu-east: existing place duplicate 148, new public candidate 6, unresolved existing match 7
- puliyanthivu-south: existing place duplicate 135, new public candidate 1, unresolved existing match 5
- puliyanthivu-west: existing place duplicate 128, new public candidate 1, unresolved existing match 6
- rideethenna: existing place duplicate 549, new public candidate 9, unresolved existing match 10
- rukamputur: existing place duplicate 570, new public candidate 12, unresolved existing match 6
- trikkandimadu: existing place duplicate 484, new public candidate 7, unresolved existing match 10
- tumpalancholai: existing place duplicate 497, new public candidate 12, unresolved existing match 5
- unnichchai: existing place duplicate 353, new public candidate 8, unresolved existing match 6
- urukamam: existing place duplicate 585, new public candidate 18, unresolved existing match 11
- vahaneri: existing place duplicate 490, new public candidate 37, unresolved existing match 6
- vakarai: existing place duplicate 108, new public candidate 7, unresolved existing match 1
- valaichchenai: existing place duplicate 94, new public candidate 16, unresolved existing match 1
- vellavely: existing place duplicate 501, new public candidate 15, unresolved existing match 12
- vettukkadu: existing place duplicate 499, new public candidate 4, unresolved existing match 10

## Category-prompt coverage

- accommodation: existing place duplicate 518, new public candidate 15, unresolved existing match 4
- agriculture-fisheries: existing place duplicate 149
- clothing-textiles: existing place duplicate 337, new public candidate 29, unresolved existing match 1
- community-library: existing place duplicate 95, new public candidate 1, unresolved existing match 3
- education: existing place duplicate 382, new public candidate 3, unresolved existing match 55
- electronics-mobile: existing place duplicate 350, new public candidate 35, unresolved existing match 61
- finance: existing place duplicate 985
- food: existing place duplicate 1224, new public candidate 35, unresolved existing match 29
- government: existing place duplicate 772, new public candidate 52, unresolved existing match 14
- hardware-building: existing place duplicate 602, new public candidate 74
- health: existing place duplicate 635, unresolved existing match 1
- printing-photo: existing place duplicate 477, new public candidate 28
- recreation: existing place duplicate 466, new public candidate 4, unresolved existing match 2
- religious: existing place duplicate 1512, new public candidate 338, unresolved existing match 22
- retail: existing place duplicate 799
- salon-beauty: existing place duplicate 359, new public candidate 32
- sports-fitness: existing place duplicate 383, new public candidate 41, unresolved existing match 3
- tourism-attractions: existing place duplicate 1038, new public candidate 8, unresolved existing match 1
- transport: existing place duplicate 149
- vehicle: existing place duplicate 535, new public candidate 29
- wholesale-commercial: existing place duplicate 256, new public candidate 7

## Generated integrity

- Public geographic features: 4,305.
- Aliases: 1,086; maximum place shard: 999.
- MZP size: 2,602,724 bytes (342,171 gzip bytes).
- MZP SHA-256: `c1d0dcb3c1dccae65b2be55259b8ac421e4ec0bf0d13446df1a1d5b45bb9de86`.
- Unmodified sources: 3,710 roads; 3,710 speed-limit records; 462 supplementary maxspeed tags.

## Before/after checks

- Active place records: 4,114 → 4,341; geographic features: 4,078 → 4,305.
- Place MZP download size: 323,650 → 342,171 gzip bytes (+18,521).
- Previous place ULIDs retained: True; aliases retained: True (1,086).
- Roads: 3,710 → 3,710; source checksum unchanged: True.
- Speed limits: 3,710 → 3,710; source checksum unchanged: True.
- Supplementary maxspeed evidence: 462 → 462; source checksum unchanged: True.

## Cumulative before/after summary

- Active places: 3,428 → 4,341 (+913); geographic features: 3,392 → 4,305 (+913).
- Name formatting changes: 263; address formatting changes: 191.
- Permanent aliases: 1,086 → 1,086. Roads: 3,710 → 3,710; speed limits: 3,710 → 3,710; supplementary maxspeed evidence: 462 → 462. All related source checksums are unchanged.
- Place MZP gzip size: 261,511 → 342,171 bytes (+80,660 bytes; +30.9%). The local benchmark measured 0.127 seconds to parse the final 4,305-feature MZP; this is a local Python benchmark, not browser timing.
- Import batches: south 285; central-south 254; central-mid 118; central-north 29; north 227. Each batch retained every prior permanent ID and alias.
- Initial full-sweep classification before imports: 913 new public candidates, 797 existing-place matches, 26 unresolved existing matches, 43 eligibility-uncertain candidates withheld, 463 out-of-district candidates excluded. Latest batch reports 27 unresolved existing matches; all remain unchanged.

## Existing unresolved duplicate review

- The pre-existing nearby “Amma Hotel” pair in Eravur remains unchanged: ULIDs `01M5Z17G0C4C1Q8YM3ZR7W7HES, 01M5Z17GC75PDB0MRNFK5PN6ZE`; separation 12.8 m with different address and category values. Both records were retained; maintainers should compare independent evidence before any decision.
- One newly imported nearby same-name pair (“Markaz Mosque, Oddamavadi”, approximately 10 m apart) was retained with both ULIDs in the machine report. The contribution validator emitted two maintainer-review warnings; no automatic merge or deletion occurred.
## Limitations

- No pagination mode is documented; all captured queries returned fewer than 500 candidates.
- CLI provider and license metadata were unavailable and are not inferred.
- Place listings, category correctness, and pin placement were not independently verified; mzc output is not treated as external confirmation.
- Query-area counts overlap and are not a claim that every district place has been discovered.
