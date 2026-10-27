# Batticaloa District Places Expansion — Phase 6.3 — complete Batticaloa District discovery and import

Scope: Batticaloa District, Eastern Province, Sri Lanka

## Discovery

- Confirmed CLI invocations: at least 345 across 198 successful unique query strings; exact total unavailable because two capture batches briefly overlapped and repeated-call count was not retained.
- Retained JSON rows: 4,537; four earlier successful exploratory queries had uncaptured response counts. Captured failed attempts: 145; known failed diagnostic calls: 1; successful retries: 72; unique queries still failed: 0; at-limit queries: 0.
- Capture accounting: Four preliminary successful administrative-area queries returned responses that were not retained, so their result counts are unknown and excluded. Two documented invocations were interrupted before capture and later retried successfully. Two query runners briefly overlapped; retained responses were reconciled by unique query, but the exact number of redundant calls cannot be reconstructed. Confirmed invocation count is therefore a lower bound.
- Raw candidates in retained JSON captures: 4,537; duplicate calls with unavailable capture counts are excluded.
- Unique candidates after normalized name and coordinate grouping: 872.
- New public place records in this change: 75.
- Cumulative Phase 6.3 imports recorded to date: 75.
- Phase 6.2 failed prompts recovered: 72; additional locality/category queries: 21.
- Imported names formatted: 20; imported addresses mechanically formatted: 21.
- Unresolved nearby same-name pairs retained for review: 0.
- Duplicate query rows collapsed: 3,665.
- Candidate origin and license information is not exposed by the documented mzc CLI; maintainer review is required before attributing or redistributing the underlying data.
- Canonical place records contain no importer-added provenance or source metadata. Captured listings were not independently verified.

## District and privacy checks

- District membership checked against the Sri Lanka NSDI Batticaloa District polygon: https://gisapps.nsdi.gov.lk/server/rest/services/Srilanka/Boundaries/MapServer/3.
- Raw outside-district, private, uncertain, invalid, and conflicting candidates are represented only as aggregate counts; names, exact coordinates, contact data, and addresses are not listed.
- Existing place aliases are checked for represented places; no road or speed-limit source records are changed.

## Counts

- Excluded confirmed private: 0
- Existing place duplicate: 606
- Invalid missing coordinates: 0
- Invalid missing name: 0
- Mzc source conflict: 0
- New public candidate: 75
- Out of district: 160
- Uncertain public eligibility: 16
- Unresolved existing match: 15

## Candidate data quality signals

- Missing address: 5
- Missing categories: 3
- Missing phone: 271

## Query-area coverage

Counts overlap when a candidate appears in more than one category query. Query area means the search prompt, not a verified town assignment.

- batticaloa-city: existing place duplicate 139, unresolved existing match 1
- cheddipalaiyam: existing place duplicate 153, new public candidate 4, unresolved existing match 2
- chenkalady: existing place duplicate 125, new public candidate 4, unresolved existing match 2
- eravoor: existing place duplicate 155, new public candidate 5, unresolved existing match 1
- eravur-pattu-chenkalady: existing place duplicate 5, new public candidate 1
- eravur-town: existing place duplicate 10, new public candidate 1
- illipaiyadichchenai: existing place duplicate 181, unresolved existing match 2
- kaluwanchikudi: existing place duplicate 125, new public candidate 7, unresolved existing match 1
- kannankudah: existing place duplicate 90, new public candidate 5, unresolved existing match 3
- karadiyanaru: existing place duplicate 175, unresolved existing match 1
- kiraan: existing place duplicate 118, unresolved existing match 1
- kiran: existing place duplicate 199, unresolved existing match 10
- kokkadichcholai: existing place duplicate 151, new public candidate 5, unresolved existing match 1
- kokkadicholai: existing place duplicate 116, unresolved existing match 1
- koralai-pattu: existing place duplicate 17, new public candidate 1, unresolved existing match 1
- kurukkalmadam: existing place duplicate 33, new public candidate 1, unresolved existing match 1
- mahiladithivu: existing place duplicate 65, new public candidate 2, unresolved existing match 3
- mandur: existing place duplicate 50, new public candidate 12, unresolved existing match 1
- mangalagama: existing place duplicate 127, unresolved existing match 2
- mankerni: existing place duplicate 40, new public candidate 1, unresolved existing match 1
- manmunai-north: existing place duplicate 10, unresolved existing match 1
- manmunai-pattu-araiyampathy: existing place duplicate 22, new public candidate 8, unresolved existing match 2
- manmunai-west-vavunathivu: new public candidate 3
- nuwaragalathenna: existing place duplicate 175, unresolved existing match 4
- oddamawadi: existing place duplicate 97, new public candidate 2, unresolved existing match 1
- paddippalai: existing place duplicate 138, new public candidate 1, unresolved existing match 2
- pankudaveli: existing place duplicate 47, new public candidate 3, unresolved existing match 1
- porativu-pattu: existing place duplicate 14, new public candidate 1
- rideethenna: existing place duplicate 162, unresolved existing match 4
- thuraineelavanai: existing place duplicate 55, new public candidate 6, unresolved existing match 1
- tumpalancholai: existing place duplicate 114, unresolved existing match 1
- unnichchai: existing place duplicate 163, unresolved existing match 3
- vaakarai: existing place duplicate 164, new public candidate 5, unresolved existing match 2
- vahaneri: existing place duplicate 138, unresolved existing match 2
- vakarai: existing place duplicate 151, unresolved existing match 1
- valaichenai: existing place duplicate 124, new public candidate 2, unresolved existing match 2
- vellaveli: existing place duplicate 138, new public candidate 1, unresolved existing match 1
- vellavely: existing place duplicate 199, new public candidate 12, unresolved existing match 2

## Category-prompt coverage

- administrative-facilities: new public candidate 15, existing place duplicate 78, unresolved existing match 4
- agriculture-fisheries: existing place duplicate 85, new public candidate 2
- community-recreation: existing place duplicate 504, new public candidate 10
- education-local: existing place duplicate 206, unresolved existing match 21, new public candidate 5
- food-local: existing place duplicate 988, unresolved existing match 27, new public candidate 12
- food-retail: existing place duplicate 271, new public candidate 22, unresolved existing match 7
- health-public: existing place duplicate 282, new public candidate 2
- health-specialty: existing place duplicate 127
- public-facilities: existing place duplicate 81, new public candidate 6, unresolved existing match 4
- public-services: existing place duplicate 86, new public candidate 1
- retail-cooperative: existing place duplicate 156
- retail-local: existing place duplicate 507, new public candidate 12
- rural-commerce: existing place duplicate 28, new public candidate 2
- rural-transport: existing place duplicate 72, unresolved existing match 1
- textile-mobile: existing place duplicate 73
- vehicle-services: existing place duplicate 441, new public candidate 4, unresolved existing match 1

## Generated integrity

- Public geographic features: 4,498.
- Aliases: 1,086; maximum place shard: 999.
- MZP size: 2,168,230 bytes (334,173 gzip bytes).
- MZP SHA-256: `128e0049e42a194eb003f1832b2d7530ffae96baa6c80803e96cd7ccd7af04a5`.
- Unmodified sources: 3,710 roads; 3,710 speed-limit records; 462 supplementary maxspeed tags.

## Before/after checks

- Active place records: 4,459 → 4,534; geographic features: 4,423 → 4,498.
- Place MZP download size: 328,415 → 334,173 gzip bytes (+5,758).
- Previous place ULIDs retained: True; aliases retained: True (1,086).
- Roads: 3,710 → 3,710; source checksum unchanged: True.
- Speed limits: 3,710 → 3,710; source checksum unchanged: True.
- Supplementary maxspeed evidence: 462 → 462; source checksum unchanged: True.

## Unresolved review cases

- Phase 6.2 cases retained unchanged: 13 conflicting existing matches and 11 eligibility-uncertain candidates.
- Combined current capture analysis: 15 unresolved existing matches and 16 eligibility-uncertain candidates.
- Amma Hotel (01M5Z17G0C4C1Q8YM3ZR7W7HES, 01M5Z17GC75PDB0MRNFK5PN6ZE): retained separately; 12.8 m apart with differing address and category values; no independent evidence resolves whether these are one listing or separate businesses.
- Markaz Mosque, Oddamawadi (01M5Z5PDD8W74TDEST9HG41RY3, 01M5Z5PJM2K9AGEBTQWXNSCGPZ): retained separately; Same address/category and about 10 m apart, but coordinates differ and available records do not independently establish which point should be canonical.
- Other uncertain/conflicting candidate details are omitted from this public report. No unresolved candidate was deleted or merged.

## Geographic batch merge history

- south: 27 places; 9 name and 6 address formatting changes; PR [#24](https://github.com/MazoPlatforms/newmaps/pull/24) merged as `6892b4833744e9a3cee989d8ac5193c7f757ebfc`.
- central-south: 20 places; 2 name and 7 address formatting changes; PR [#25](https://github.com/MazoPlatforms/newmaps/pull/25) merged as `b72f5b475b8054eeafbadac7cdaf65363016e063`.
- central: 12 places; 3 name and 8 address formatting changes; PR [#26](https://github.com/MazoPlatforms/newmaps/pull/26) merged as `bfe9669b12aecca5b1d28a73b8d83b2ba84ffc40`.
- north + central-north: 16 places; 6 name and 0 address formatting changes; PR [#27](https://github.com/MazoPlatforms/newmaps/pull/27) merged as `353471b094e27ec388dee54211e97303ba65336a`.

## Final verification

- Python tests: 109 passed in the final full local suite; PR validations also passed on the merged datasets.
- Node search tests: 10 passed.
- Place road speed validators: passed.
- Contribution validator: passed on each geographic PR.
- Place road speed builds: passed.
- Browser device test: not performed in this environment.

## Limitations

- No pagination mode is documented; all captured queries returned fewer than 500 candidates.
- CLI provider and separate license metadata were not exposed and are not inferred.
- Place listings, category correctness, and pin placement were not independently verified; mzc output is not treated as external confirmation.
- Query-area counts overlap and are not a claim that every district place has been discovered.

