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

Do not use Google Maps as the authoritative verification source for school names.

## Phase 2 cleanup (2026-10-27)

The source archive is the `archive/pre-ulid-migration` reference. The CI
validator compares every original record to the cleaned data after restoring
reversible formatting fields. The Phase 2 workflow artifact contains
before/after changes and a decision for each of the 867 duplicate-candidate
groups.

- 23 names received reversible ASCII case/spacing formatting. Original values
  remain in `name_original`; language/script and spelling were not transliterated.
- 50 active canonical addresses received whitespace/comma-spacing cleanup only. Existing
  postcodes, street details, plus codes, and locality descriptions were not
  inferred or replaced. Original strings remain in `address_original`.
- No category labels required safe mechanical formatting.
- 695 groups (1,039 extra records) had identical source fields and coordinates
  except for ULID. One stable existing ULID remains canonical for each group;
  every retired record is retained verbatim in `data/places/retired/`, and
  `data/place-aliases.json` permanently resolves retired ULIDs.
- 172 groups have conflicting source fields and remain unchanged as active
  records for human review. Missing online results were not treated as evidence
  that a place is fake.
- Two records have no usable geometry. Their original null coordinate objects
  are retained as `coordinates_original`, and neither is emitted into GeoJSON.

The `places-phase-2-review-reports` artifact on the validation workflow contains
the field-level changes, all duplicate decisions, and complete post-cleanup
audit. `scripts/validate_places_phase2.py` verifies all 3,694 source records
against the archive branch during CI.
