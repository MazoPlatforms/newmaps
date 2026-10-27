# Batticaloa District Places Expansion — Phase 6.2

## Discovery and capture

- Documented command: `mzc -l 500 -c lk -t 30 '<query>'`.
- 177 unique planned query prompts were attempted; 105 succeeded and 72 returned non-zero status. The capture runner recorded 250 planned-query CLI invocations (including retries); one additional diagnostic invocation also returned HTTP 429; 251 mzc query invocations occurred in total, including that diagnostic.
- Successful responses contained 1,840 candidate rows. None reached the requested 500-result limit. The CLI documents no pagination option.
- 488 unique candidate groups remained after collapsing 1,352 repeated query rows. Coverage counts below overlap across prompts.
- The failed prompts and exact coverage-by-query log are in the machine-readable report. Their first-run stderr was not retained; a diagnostic response later returned HTTP 429, but this does not establish the cause of every earlier failure.
- The search plan targeted sparse locality anchors, alternate spellings, rural/public-service categories and administrative areas surfaced by previous searches.

## Review outcome

- Added 118 public-eligible, in-district records in five geographic latitude batches: south 28, central-south 41, central-mid 17, central-north 9 and north 23.
- Existing-place matches: 274. Ambiguous/conflicting existing matches: 13, retained for review.
- Eligibility uncertain: 11, withheld. Confirmed private exclusions: 0. Out-of-district: 72. Invalid/missing names or coordinates: 0.
- Name normalization changes: 36; address formatting changes: 32. No spelling, address, or coordinate was invented.
- Canonical records use the ordinary first-party Mazo Maps structure and contain no mzc, provider, or equivalent collection-source marker. The operational query log is separate. Listings were not independently verified.

## Canonical record policy

- Removed the tool-specific provenance object from 1,851 canonical place records across Phase 6, Phase 6.1, and Phase 6.2. All ULIDs, aliases, and other place fields were preserved.
- Contributor-supplied evidence-backed `provenance` remains optional and supported by the contribution schema.

## Dataset integrity

- Active places: 4,341 → 4,459; geographic features: 4,305 → 4,423.
- Aliases: 1,086 → 1,086; shard counts after import: {'0001': 999, '0002': 999, '0003': 999, '0004': 999, '0005': 463} (maximum 999).
- Place MZP compressed size: 342,171 → 328,415 bytes (-13,756).
- Roads: 3,710; source checksum unchanged: True. Speed limits: 3,710; checksum unchanged: True. Supplementary maxspeed evidence: 462; checksum unchanged: True.

## Coverage prompt counts (overlapping)

These are raw candidate rows returned by successful prompts, grouped by prompt locality and query family. A result can appear in multiple searches; query labels are not verified town assignments. See the JSON report for all 177 prompts.

- **Illipaiyadichchenai:** agriculture-fisheries 6; community-recreation 40; education-local 11; food-local 65; health-specialty 9; public-services 5; retail-cooperative 11; rural-transport 5; textile-mobile 3; vehicle-services 41
- **Karadiyanaru:** agriculture-fisheries 5; community-recreation 43; education-local 8; food-local 30; health-specialty 11; public-services 10; retail-cooperative 19; rural-transport 8; textile-mobile 16; vehicle-services 40
- **Kiran:** agriculture-fisheries 5; community-recreation 47; education-local 37; food-local 60; health-specialty 12; public-services 10; retail-cooperative 10; rural-transport 2; textile-mobile 4; vehicle-services 35
- **Mangalagama:** agriculture-fisheries 5; community-recreation 29; education-local 21; food-local 26; health-specialty 7; public-services 1; retail-cooperative 12; rural-transport 1; textile-mobile 5; vehicle-services 48
- **Nuwaragalathenna:** agriculture-fisheries 7; community-recreation 45; education-local 16; food-local 31; health-specialty 7; public-services 14; retail-cooperative 13; rural-transport 5; textile-mobile 5; vehicle-services 52
- **Paddippalai:** education-local 13; food-local 24; health-specialty 11; retail-cooperative 9; textile-mobile 9
- **Rideethenna:** agriculture-fisheries 7; community-recreation 43; education-local 34; food-local 30; health-specialty 8; public-services 10; retail-cooperative 10; rural-transport 5; textile-mobile 5; vehicle-services 36
- **Tumpalancholai:** agriculture-fisheries 6; community-recreation 38; education-local 7; food-local 29; health-specialty 7; public-services 4; retail-cooperative 7; rural-transport 2; textile-mobile 4; vehicle-services 19
- **Unnichchai:** agriculture-fisheries 6; community-recreation 42; education-local 37; food-local 26; health-specialty 17; public-services 13; retail-cooperative 11; rural-transport 4; textile-mobile 4; vehicle-services 27
- **Vahaneri:** agriculture-fisheries 7; community-recreation 40; education-local 6; food-local 30; health-specialty 6; public-services 3; retail-cooperative 10; rural-transport 25; textile-mobile 5; vehicle-services 20
- **Vakarai:** agriculture-fisheries 6; community-recreation 44; education-local 7; food-local 58; health-specialty 5; public-services 1; retail-cooperative 11; rural-transport 1; textile-mobile 3; vehicle-services 30

## Remaining gaps

- 72 distinct planned prompts need retry after the CLI request limit clears; stderr from the first capture was not retained, while a later retry and a separate diagnostic both confirmed HTTP 429.
- 11 eligibility-uncertain candidates and 13 conflicting same-name candidates remain withheld for manual review.
- No independent public-source verification was performed. The search matrix was targeted; district-wide coverage is not exhaustive.
- The documented CLI output did not provide separate license metadata; none is asserted.

The machine-readable report lists every query, its status and returned count, exact before/after integrity checks, and ULIDs added per batch. It intentionally omits names, addresses, coordinates and identifiers for withheld candidates.
