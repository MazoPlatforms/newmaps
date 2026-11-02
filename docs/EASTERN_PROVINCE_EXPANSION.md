# Eastern Province Places Expansion

## Discovery and coverage

- Scope: Batticaloa, Ampara and Trincomalee districts.
- Planned matrix prompts: 131; successful prompts: 1; failed prompts: 2; unattempted planned prompts: 127.
- Recorded mzc place-query invocations: 16; limit 500: 14; preliminary limit 1: 2. The two preliminary probes returned errors and contributed no place records.
- Unique attempted prompt strings: 10 (repeated diagnostic prompts are counted once here).
- Of the limit-500 calls: 1 succeeded, 12 failed, and 1 was interrupted while capture was stopped.
- The documented help has no pagination or cursor option. This matrix is not an exhaustive inventory; no zero-missing-place claim is made.
- One Ampara district prompt returned 46 rows. District and locality probes in Batticaloa, Ampara and Trincomalee timed out; additional Ampara division/category coverage remains uncollected.
- Raw responses remain in the temporary Codespace capture directory. Aggregate query accounting is separate; canonical records contain no mzc/import-source fields.

## Candidate processing

- Raw rows: 46; unique normalized-name/coordinate candidates: 46.
- Classification counts: {"boundary_uncertain": 2, "conflicting_candidate_fields": 0, "excluded_confirmed_private": 0, "existing_place_duplicates": 2, "invalid_missing_name": 0, "invalid_or_missing_coordinates": 0, "missing_category_withheld": 0, "new_eligible_candidates": 35, "out_of_district": 1, "uncertain_public_eligibility": 6, "unresolved_existing_matches": 0, "unresolved_internal_nearby_candidates": 0}.
- Eligible additions: 35; existing place updates: 0.
- Imported names normalized: 5; imported addresses normalized: 5.
- Unique candidates located inside district polygons: {"Ampara": 41, "Batticaloa": 2}.
- Category counts overlap when a candidate has multiple categories: {"Airport": 1, "Archaeological site": 1, "Buddhist temple": 5, "Bus ticket agency": 1, "City government office": 1, "City or town hall": 1, "City park": 1, "Conference center": 1, "Educational institution": 1, "Event venue": 1, "Garden": 1, "Government hospital": 1, "Gym": 1, "Historical landmark": 3, "Hotel": 4, "Library": 1, "Market": 1, "National park": 2, "Non-governmental organization": 1, "Park": 2, "Playground": 1, "Police department": 1, "Public bathroom": 1, "Public beach": 1, "Public services": 1, "Restaurant": 1, "Road cycling": 1, "Swimming pool": 2, "Taxi service": 1, "Tourist attraction": 9, "Villa": 1, "Wildlife and safari park": 1}.
- Unresolved nearby same-name pairs: 0.

## Kattankudy and integrity

- Kattankudy-associated baseline: 1908 records by the documented union rule (1703 within the DS polygon; 1871 address strings mention Kattankudy).
- Existing source files, IDs and aliases are checked during apply; the flow appends records and does not reassign IDs.
- Roads, speed limits and supplementary maxspeed data are checked by count and SHA-256 and are not modified.
- NSDI district boundaries have documented accuracy caveats. A 100 m border buffer is withheld. Layer metadata exposed no redistribution license statement; the boundary files are internal QA assets.

## Blockers and limitations

- mzc read-operation timeouts blocked district and locality discovery. Coverage outside the one successful Ampara response remains incomplete.
- mzc output was not independently verified.
- This work does not establish an exhaustive Eastern Province inventory or expanded routing coverage.

## Generated delivery

- Active places: 4569; geographic features: 4533; aliases: 1086.
- PMTiles: 1,711,569 bytes; SHA-256 94d5f469930149d9ad505df315921d5399a65591fe60284758ff89fb7b530b1d.
- Shards: {"0001": 999, "0002": 999, "0003": 999, "0004": 999, "0005": 573}.

## Local verification

- Python tests: 132 passed; Node unit tests: 39 passed.
- Playwright Chromium Chromium 141.0.7390.37: pass; 20 district/geographic views loaded; 0 automated WCAG violations.
- New Ampara record search and details: passed; local PMTiles Range responses: HTTP 206 verified.
- First run: startup 5082 ms, startup transfer 355,603 B, post-GC heap 25,868,608 B, animation p50/p95 66.7/283.4 ms.
- Retry run: startup 6870 ms, startup transfer 572,856 B, post-GC heap 22,186,776 B, animation p50/p95 33.4/50.1 ms.
- These are single headless mobile-emulation runs, not a repeated-device benchmark. Physical Android was unavailable. Live Pages search and Range validation require a deployment and are not implied by this local test.
