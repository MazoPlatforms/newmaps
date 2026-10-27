# Batticaloa District Places Expansion — Phase 6.3 — northern Batticaloa batch

Scope: Batticaloa District, Eastern Province, Sri Lanka

## Discovery

- Confirmed CLI invocations: at least 343 across 198 successful unique query strings; exact total unavailable because two capture batches briefly overlapped and repeated-call count was not retained.
- Retained JSON rows: 4,537; four earlier successful exploratory queries had uncaptured response counts. Failed query attempts: 145; successful retries: 72; at-limit queries: 0.
- Capture accounting: Four preliminary successful administrative-area queries returned responses that were not retained, so their result counts are unknown and excluded. Two documented invocations were interrupted before capture and later retried successfully. Two query runners briefly overlapped; retained responses were reconciled by unique query, but the exact number of redundant calls cannot be reconstructed. Confirmed invocation count is therefore a lower bound.
- Raw candidates in retained JSON captures: 4,537; duplicate calls with unavailable capture counts are excluded.
- Unique candidates after normalized name and coordinate grouping: 872.
- New public place records in this change: 16.
- Cumulative Phase 6.3 imports recorded to date: 75.
- Phase 6.2 failed prompts recovered: 72; additional locality/category queries: 21.
- Imported names formatted: 6; imported addresses mechanically formatted: 0.
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
- Existing place duplicate: 665
- Invalid missing coordinates: 0
- Invalid missing name: 0
- Mzc source conflict: 0
- New public candidate: 16
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
- cheddipalaiyam: existing place duplicate 157, unresolved existing match 2
- chenkalady: existing place duplicate 128, new public candidate 1, unresolved existing match 2
- eravoor: existing place duplicate 160, unresolved existing match 1
- eravur-pattu-chenkalady: existing place duplicate 5, new public candidate 1
- eravur-town: existing place duplicate 11
- illipaiyadichchenai: existing place duplicate 181, unresolved existing match 2
- kaluwanchikudi: existing place duplicate 129, new public candidate 3, unresolved existing match 1
- kannankudah: existing place duplicate 94, new public candidate 1, unresolved existing match 3
- karadiyanaru: existing place duplicate 175, unresolved existing match 1
- kiraan: existing place duplicate 118, unresolved existing match 1
- kiran: existing place duplicate 199, unresolved existing match 10
- kokkadichcholai: existing place duplicate 156, unresolved existing match 1
- kokkadicholai: existing place duplicate 116, unresolved existing match 1
- koralai-pattu: existing place duplicate 17, new public candidate 1, unresolved existing match 1
- kurukkalmadam: existing place duplicate 34, unresolved existing match 1
- mahiladithivu: existing place duplicate 67, unresolved existing match 3
- mandur: existing place duplicate 59, new public candidate 3, unresolved existing match 1
- mangalagama: existing place duplicate 127, unresolved existing match 2
- mankerni: existing place duplicate 41, unresolved existing match 1
- manmunai-north: existing place duplicate 10, unresolved existing match 1
- manmunai-pattu-araiyampathy: existing place duplicate 30, unresolved existing match 2
- manmunai-west-vavunathivu: existing place duplicate 3
- nuwaragalathenna: existing place duplicate 175, unresolved existing match 4
- oddamawadi: existing place duplicate 97, new public candidate 2, unresolved existing match 1
- paddippalai: existing place duplicate 139, unresolved existing match 2
- pankudaveli: existing place duplicate 49, new public candidate 1, unresolved existing match 1
- porativu-pattu: existing place duplicate 15
- rideethenna: existing place duplicate 162, unresolved existing match 4
- thuraineelavanai: existing place duplicate 61, unresolved existing match 1
- tumpalancholai: existing place duplicate 114, unresolved existing match 1
- unnichchai: existing place duplicate 163, unresolved existing match 3
- vaakarai: existing place duplicate 165, new public candidate 4, unresolved existing match 2
- vahaneri: existing place duplicate 138, unresolved existing match 2
- vakarai: existing place duplicate 151, unresolved existing match 1
- valaichenai: existing place duplicate 125, new public candidate 1, unresolved existing match 2
- vellaveli: existing place duplicate 139, unresolved existing match 1
- vellavely: existing place duplicate 211, unresolved existing match 2

## Category-prompt coverage

- administrative-facilities--0de18960: existing place duplicate 3
- administrative-facilities--294d92b7: existing place duplicate 5, new public candidate 1
- administrative-facilities--2ff0104c: existing place duplicate 30, unresolved existing match 2
- administrative-facilities--39bc745f: existing place duplicate 17, new public candidate 1, unresolved existing match 1
- administrative-facilities--6b6190fe: existing place duplicate 10, unresolved existing match 1
- administrative-facilities--830be810: existing place duplicate 15
- administrative-facilities--d8fd167a: existing place duplicate 11
- agriculture-fisheries--0ee8016e: existing place duplicate 7
- agriculture-fisheries--14d97c8b: existing place duplicate 7
- agriculture-fisheries--155d9232: existing place duplicate 6
- agriculture-fisheries--24d470bb: existing place duplicate 6
- agriculture-fisheries--35ca8c2b: existing place duplicate 7
- agriculture-fisheries--54559c9e: existing place duplicate 6
- agriculture-fisheries--5eba8668: existing place duplicate 5
- agriculture-fisheries--7215b819: existing place duplicate 6
- agriculture-fisheries--7cfe04a8: existing place duplicate 6
- agriculture-fisheries--b8ab07b4: existing place duplicate 7
- agriculture-fisheries--d936875b: existing place duplicate 8
- agriculture-fisheries--e2f35382: existing place duplicate 5
- agriculture-fisheries--ee628fa2: existing place duplicate 5
- agriculture-fisheries--fc97ff62: existing place duplicate 6
- community-recreation--4022662d: existing place duplicate 32
- community-recreation--546d2e13: existing place duplicate 37
- community-recreation--57637582: existing place duplicate 35
- community-recreation--6449f5ed: existing place duplicate 32
- community-recreation--8b60c1f8: existing place duplicate 35
- community-recreation--929f968d: existing place duplicate 37
- community-recreation--ade590a0: existing place duplicate 40
- community-recreation--b14a37b9: existing place duplicate 38
- community-recreation--c6d6dbb0: existing place duplicate 23
- community-recreation--d12ee18c: existing place duplicate 39
- community-recreation--dd81777f: existing place duplicate 44
- community-recreation--ecc3526d: existing place duplicate 36
- community-recreation--f8eda498: existing place duplicate 46
- community-recreation--fd5d170a: existing place duplicate 40
- education-local--11eb3ecb: existing place duplicate 8
- education-local--227353d2: existing place duplicate 10, unresolved existing match 1
- education-local--50854e25: existing place duplicate 27, unresolved existing match 9
- education-local--6303d4c3: existing place duplicate 8
- education-local--6718a1a5: existing place duplicate 18, unresolved existing match 1
- education-local--68e5da2d: existing place duplicate 12, unresolved existing match 1
- education-local--7497e268: existing place duplicate 13, unresolved existing match 3
- education-local--7c387fd7: existing place duplicate 28, unresolved existing match 2
- education-local--81969d84: existing place duplicate 6
- education-local--870fcdf0: existing place duplicate 31, unresolved existing match 1
- education-local--a03bc675: existing place duplicate 7
- education-local--ae7773b6: existing place duplicate 10, unresolved existing match 1
- education-local--b2b5efc8: existing place duplicate 26, unresolved existing match 2
- education-local--ccbdb115: existing place duplicate 7
- food-local--04372b03: existing place duplicate 30, unresolved existing match 1
- food-local--14f31b17: existing place duplicate 43, unresolved existing match 1
- food-local--1c7002ec: existing place duplicate 29, unresolved existing match 1
- food-local--291f64ff: existing place duplicate 62, new public candidate 4, unresolved existing match 2
- food-local--2e3466f3: existing place duplicate 25, unresolved existing match 1
- food-local--307749cc: existing place duplicate 42, unresolved existing match 1
- food-local--341b0998: existing place duplicate 29, unresolved existing match 1
- food-local--404032c8: existing place duplicate 30, unresolved existing match 1
- food-local--4764994e: existing place duplicate 29, unresolved existing match 1
- food-local--5242caf8: existing place duplicate 45, unresolved existing match 1
- food-local--67d99605: existing place duplicate 25, unresolved existing match 1
- food-local--6cd4f72f: existing place duplicate 72, unresolved existing match 1
- food-local--97f40686: existing place duplicate 56, new public candidate 1, unresolved existing match 2
- food-local--b297187a: existing place duplicate 28, unresolved existing match 1
- food-local--b8a51d0d: existing place duplicate 23, unresolved existing match 1
- food-local--cc73c801: existing place duplicate 53, unresolved existing match 1
- food-local--d08119f1: existing place duplicate 59, unresolved existing match 2
- food-local--d1ff8069: existing place duplicate 24, unresolved existing match 1
- food-local--d228617e: existing place duplicate 57, unresolved existing match 1
- food-local--d28ad4f3: existing place duplicate 51, unresolved existing match 1
- food-local--d8534b7f: existing place duplicate 44, unresolved existing match 1
- food-local--eaa92088: existing place duplicate 48, unresolved existing match 1
- food-local--f1a0829d: existing place duplicate 33, unresolved existing match 1
- food-local--f339c4bf: existing place duplicate 58, unresolved existing match 1
- food-retail--04935353: existing place duplicate 31, unresolved existing match 1
- food-retail--18510cf3: existing place duplicate 34, unresolved existing match 1
- food-retail--854e8bbd: existing place duplicate 62, new public candidate 1, unresolved existing match 1
- food-retail--8e97e94f: existing place duplicate 27, unresolved existing match 1
- food-retail--92969930: existing place duplicate 51, new public candidate 3, unresolved existing match 1
- food-retail--984d33bd: existing place duplicate 32, unresolved existing match 1
- food-retail--dba1eca5: existing place duplicate 52, unresolved existing match 1
- health-public--0d6d7804: existing place duplicate 28
- health-public--17ef772c: existing place duplicate 24
- health-public--189b3d5d: existing place duplicate 20
- health-public--1b9ff878: existing place duplicate 37
- health-public--2a726d9b: existing place duplicate 34
- health-public--4f962443: existing place duplicate 29
- health-public--6e23a403: existing place duplicate 28
- health-public--75aa5f53: existing place duplicate 28, new public candidate 1
- health-public--80098537: existing place duplicate 33
- health-public--b311c5e8: existing place duplicate 22
- health-specialty--05d0ef91: existing place duplicate 9
- health-specialty--129a96ad: existing place duplicate 6
- health-specialty--24d5365a: existing place duplicate 11
- health-specialty--2c72782e: existing place duplicate 9
- health-specialty--54a38981: existing place duplicate 17
- health-specialty--56f9ed2a: existing place duplicate 5
- health-specialty--6635c803: existing place duplicate 7
- health-specialty--72304c02: existing place duplicate 12
- health-specialty--8767b8d9: existing place duplicate 8
- health-specialty--aaeadcaa: existing place duplicate 7
- health-specialty--b69684ec: existing place duplicate 10
- health-specialty--b74eec6c: existing place duplicate 11
- health-specialty--da4eddb6: existing place duplicate 7
- health-specialty--f685b04f: existing place duplicate 8
- public-facilities--0b051f89: existing place duplicate 27, unresolved existing match 2
- public-facilities--0cce0a5f: existing place duplicate 10
- public-facilities--1222f136: existing place duplicate 8
- public-facilities--16905553: existing place duplicate 7
- public-facilities--a801c92e: existing place duplicate 7
- public-facilities--cda4854c: existing place duplicate 22, unresolved existing match 2
- public-facilities--dfaae306: existing place duplicate 6
- public-services--01b76716: existing place duplicate 1
- public-services--043de54e: existing place duplicate 8
- public-services--10bd888b: existing place duplicate 1
- public-services--25f37c02: existing place duplicate 2
- public-services--346a0ffc: existing place duplicate 5
- public-services--3e565492: existing place duplicate 10
- public-services--4b9b9ea2: existing place duplicate 10
- public-services--70c6903d: existing place duplicate 1
- public-services--a4a07663: existing place duplicate 4
- public-services--aa413c0b: existing place duplicate 10
- public-services--b0e96ef5: existing place duplicate 11
- public-services--cb97ba86: existing place duplicate 8
- public-services--ddb8b6cb: existing place duplicate 5
- public-services--fa23f93c: existing place duplicate 11
- retail-cooperative--0dcbff36: existing place duplicate 11
- retail-cooperative--106a599a: existing place duplicate 13
- retail-cooperative--2be7d3ea: existing place duplicate 11
- retail-cooperative--302393bc: existing place duplicate 18
- retail-cooperative--4c41c097: existing place duplicate 16
- retail-cooperative--517c9757: existing place duplicate 10
- retail-cooperative--6049aad5: existing place duplicate 13
- retail-cooperative--6f180bcb: existing place duplicate 10
- retail-cooperative--74885849: existing place duplicate 9
- retail-cooperative--7e45230f: existing place duplicate 10
- retail-cooperative--7e82b5ad: existing place duplicate 7
- retail-cooperative--e298bfe8: existing place duplicate 9
- retail-cooperative--edde49e3: existing place duplicate 11
- retail-cooperative--f0a681aa: existing place duplicate 8
- retail-local--06f7e6d5: existing place duplicate 44, new public candidate 1
- retail-local--0751da1b: existing place duplicate 36, new public candidate 1
- retail-local--0a631fc9: existing place duplicate 57
- retail-local--45081b24: existing place duplicate 46
- retail-local--56595742: existing place duplicate 69
- retail-local--6374f52f: existing place duplicate 59
- retail-local--835cf91e: existing place duplicate 65, new public candidate 3
- retail-local--87ee3de3: existing place duplicate 44
- retail-local--ed966d6c: existing place duplicate 27
- retail-local--ffb25b86: existing place duplicate 67
- rural-commerce--64caec13: existing place duplicate 10
- rural-commerce--6653bd5d: existing place duplicate 1
- rural-commerce--aab53cee: existing place duplicate 2
- rural-commerce--c7629443: existing place duplicate 1
- rural-commerce--c858f697: existing place duplicate 6
- rural-commerce--daa7faeb: existing place duplicate 7, new public candidate 1
- rural-commerce--ed3b6770: existing place duplicate 2
- rural-transport--00f6d7b4: existing place duplicate 6
- rural-transport--104495c3: existing place duplicate 1
- rural-transport--19358036: existing place duplicate 2
- rural-transport--3516c032: existing place duplicate 4
- rural-transport--3b2a7dd2: existing place duplicate 8
- rural-transport--3b408952: existing place duplicate 5
- rural-transport--430fb7d8: existing place duplicate 21, unresolved existing match 1
- rural-transport--63c220b8: existing place duplicate 1
- rural-transport--864147bd: existing place duplicate 5
- rural-transport--9380f5db: existing place duplicate 2
- rural-transport--9dcceaa5: existing place duplicate 5
- rural-transport--a23ccc52: existing place duplicate 4
- rural-transport--acd54bb6: existing place duplicate 5
- rural-transport--ea40cc74: existing place duplicate 3
- textile-mobile--01c5d303: existing place duplicate 5
- textile-mobile--2b4237ad: existing place duplicate 3
- textile-mobile--3579db54: existing place duplicate 2
- textile-mobile--3d9493e1: existing place duplicate 3
- textile-mobile--40cb164f: existing place duplicate 5
- textile-mobile--75c456f1: existing place duplicate 8
- textile-mobile--7dd5bec0: existing place duplicate 5
- textile-mobile--83296f68: existing place duplicate 15
- textile-mobile--a11d20d8: existing place duplicate 4
- textile-mobile--bba3f6e4: existing place duplicate 4
- textile-mobile--c6616cd1: existing place duplicate 4
- textile-mobile--d8fd188e: existing place duplicate 4
- textile-mobile--ddf6fe6f: existing place duplicate 3
- textile-mobile--dfa76498: existing place duplicate 8
- vehicle-services--1017c1d7: existing place duplicate 18
- vehicle-services--159ce353: existing place duplicate 34
- vehicle-services--2ff69b2a: existing place duplicate 42
- vehicle-services--4022525a: existing place duplicate 27, unresolved existing match 1
- vehicle-services--4e385d2d: existing place duplicate 44
- vehicle-services--4fe8a91d: existing place duplicate 33
- vehicle-services--51b94f70: existing place duplicate 38
- vehicle-services--52bc347d: existing place duplicate 49
- vehicle-services--a013ddd6: existing place duplicate 27
- vehicle-services--a8092ec7: existing place duplicate 25
- vehicle-services--b69bc9dd: existing place duplicate 33
- vehicle-services--bc57800a: existing place duplicate 18
- vehicle-services--cd5c2255: existing place duplicate 23
- vehicle-services--d7e6d0aa: existing place duplicate 34

## Generated integrity

- Public geographic features: 4,498.
- Aliases: 1,086; maximum place shard: 999.
- MZP size: 2,168,230 bytes (334,173 gzip bytes).
- MZP SHA-256: `128e0049e42a194eb003f1832b2d7530ffae96baa6c80803e96cd7ccd7af04a5`.
- Unmodified sources: 3,710 roads; 3,710 speed-limit records; 462 supplementary maxspeed tags.

## Before/after checks

- Active place records: 4,518 → 4,534; geographic features: 4,482 → 4,498.
- Place MZP download size: 332,909 → 334,173 gzip bytes (+1,264).
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

## Limitations

- No pagination mode is documented; all captured queries returned fewer than 500 candidates.
- CLI provider and separate license metadata were not exposed and are not inferred.
- Place listings, category correctness, and pin placement were not independently verified; mzc output is not treated as external confirmation.
- Query-area counts overlap and are not a claim that every district place has been discovered.
