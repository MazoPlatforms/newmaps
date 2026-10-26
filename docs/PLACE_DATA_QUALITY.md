# Mazo Maps: place names and Sri Lankan address standards

## Verified school names
For **government schools only**, use the school name in an official Sri Lankan Ministry of Education school list and record the census number. Use `BT/BC/` for schools in the Batticaloa Central education zone and `BT/BT/` only where the school's education zone is Batticaloa. These prefixes are identifiers for the map, not replacements for the official name.

Sources (not Google Maps):
- Ministry of Education school list: https://moe.gov.lk/wp-content/uploads/2025/07/School_List.pdf
- Ministry of Education, 2024 Eastern Province provincial schools: https://dmb.moe.gov.lk/2024/01/01_PDF/Tbl20240106.pdf
- Ministry of Education, 2024 school classification: https://moe.gov.lk/wp-content/uploads/2025/09/01i-2024-En.pdf

Examples:
- `Methai mosque school` → `BT/BC/Meththaippalli Vidyalaya` (school census 14140)
- `BT/Kattankudy Central College` → `BT/BC/Kattankudy Madya Maha Vidyalaya` (14145)
- `Al-Ameen Maha Vidiyalaya,Kattankudy.` → `BT/BC/Kattankudy Al-Ameen Maha Vidyalayam` (14143)

Private institutions and training centers should retain their genuine brand/institutional names unless independently verified; do not automatically add a government-school prefix.

## Postal-style addresses
Sri Lanka Post's addressing guidance: https://slpost.gov.lk/services/sending-and-receiving-mail/

Preferred information order:
1. Building number, if actually known, prefixed `No.`.
2. Official street, road, lane or `Mawatha` name.
3. Locality, including a known Kattankudy division when useful.
4. Postal town and verified five-digit postcode, e.g. `Kattankudy 30100`.

Example: `No. 18, Meththaippalli Road, Kattankudy 04, Kattankudy 30100`.

Do not invent house numbers, street names, school census numbers, postcodes for other towns, or a delivery address from coordinates or a Plus Code. When the street is unknown, preserve the available location reference; it is **not** equivalent to a verified postal delivery address.

## Data quality notes
- JSON `results[]` entries retain original geometry and place contact details during spelling/address normalization.
- `name_original`, `school_census_no` and `name_source` allow review of verified school-name changes.
- Some school addresses were clarified from official school lists. Other addresses only received formatting; **formatting is not proof of geospatial or postal verification**.
- Unverified names, especially private schools and ambiguous legacy labels, remain untouched rather than being guessed.
- The client has a presentation-only address formatter for other older POI datasets. Source records should be corrected after community verification.

## Retired ULIDs and Phase 2 cleanup
When identical place records are consolidated, the chosen permanent ULID remains active and every retired ULID is retained in `data/places/aliases.json` with its canonical target, original record payload, source lineage and original shard path. `python scripts/places.py validate` checks that aliases resolve to active records; `python scripts/places.py build` publishes the flattened aliases in the generated manifest. Use `window.resolveMazoPlaceId(id)` for browser references that may contain a retired ULID.

The Phase 2 cleanup is reversible with `python scripts/places_cleanup_phase2.py --rollback`. Its machine-readable report records exact before/after fields and all unresolved conflicts. Only non-ID-identical groups are consolidated automatically; records with conflicting values remain available for review.

Do not use Google Maps as the authoritative verification source for school names.
