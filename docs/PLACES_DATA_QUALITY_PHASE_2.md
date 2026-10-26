# Phase 2 Places data quality cleanup report

The score ranks investigation priority only; it is not a probability that a place is fake.

## Changes

- Names normalized: 2
- Addresses normalized: 954
- Exact duplicate groups consolidated: 695
- Records retired with permanent ULID aliases: 1039
- Canonical records retained: 695
- Unresolved duplicate groups: 172
- Active Places: 3694 → 2655

Exact before/after values, affected ULIDs, all conflict fields, evidence states, and retired-record backups are in `../reports/places-data-quality-phase-2.json`.

## Review scope and limits

All 867 audit groups were re-evaluated against current field values. Only groups with every non-ID field exactly equal were consolidated. The 172 groups with field differences remain unresolved; co-location alone was not used to merge records.

Records without independently checked public listings are marked unverified/not checked. Search links are leads only. Missing online presence does not label a record invalid. The two ADDAX records have an IDB name/contact match but conflicting address evidence; the source address and pin were preserved.

Kattankudy postcode 30100 is retained as a reference. Conflicting locality/postcode records were not changed. Invalid or missing coordinates, category mismatches, and pin placement require review from a source that was not available for each record.

## Highest review-priority records

| Score | ULID | Name | Flags |
|---:|---|---|---|
| 57 | `01M5W5PQNSPYAXPC3HBHP8NHTW` | Digital Tutors LK (PVT) Ltd. | missing_coordinates, missing_address |
| 57 | `01M5W5PR7ZVASR5S7YVE9KJBJC` | Women Safe Home | missing_coordinates, missing_address |
| 50 | `01M5W5PQGH75GZ83SY6XS6WTYC` | Kattankudy | missing_address, missing_category, no_contact_field, duplicate_candidate |
| 50 | `01M5W5PQJ00AH3CGCTE9XN7S2M` | Kattankudy | missing_address, missing_category, no_contact_field, duplicate_candidate |
| 50 | `01M5W5PQJ1KJE7Y2HGR0HB1N6A` | Kattankudy | missing_address, missing_category, no_contact_field, duplicate_candidate |
| 50 | `01M5W5PQNYDXP61PVM8DQB4FM1` | Kattankudy | missing_address, missing_category, no_contact_field, duplicate_candidate |
| 45 | `01M5W5PQFM6A48MEPVBZRNND4D` | Rr Mobile Kattankudy | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQG2WY8B3E5315QH8Y6M` | Faleel store | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQG7E124DJ61VQXZDYHJ` | Abans Kattankudy | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQH2EGQ5NRKCAFZ87487` | Amana Bank | SBC | Kattankudy beach Road | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQHAR7QTNYRMF363RE6B` | Batti Motor Riders Rent Car | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQHCF1H1AXMST339FCPV` | VIP Lanka Hub Pvt Ltd | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQHDAJG1K5T5J66T3N3X` | Suzuki every rent a car | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQHNRJENPAN001G30CPY` | Heavenly Bakes By Aysha | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQHZTAD2YF7J5B641EK8` | Amana Bank | SBC | Kattankudy beach Road | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQJFRET1N2547AA161KC` | Real Juice Cool Bar | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQJM0DFXZ6CA9TNQ7XB6` | Fast Food Mafia | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQK05QN19VYDVZKGG7A3` | Faleel store | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQMBJ8WKWYN1591MZCW8` | Abans Kattankudy | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQMMY6Q2TFRM4G2EZAYK` | Harnee beauty care & cosmetics | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQMVGX5XXMMW34K13ZVD` | Heavenly Bakes By Aysha | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQP5BDNM1H0V3K9QVYTJ` | Abans Kattankudy | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQPQGV28QEXVMR2J8QGF` | Faleel store | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQQPVGX7TWP847K297RN` | Rooh.lk | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQRERGNW66P49S6RS503` | Faleel store | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQRVMX98XD9ZGWACV2TN` | Amana Bank | SBC | Kattankudy beach Road | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQW11EEPVEREAMPMRQ4K` | Faleel store | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQWA2AHBXJ4GW4TPDYX4` | Rr Mobile Kattankudy | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQWMPP40XWDA6P5K5FP3` | Faleel store | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQY1F3HRCBS69M3RFSCY` | Real Juice Cool Bar | duplicate_candidate, postcode_locality_review |

## Rollback

`data/places/aliases.json` contains complete retired records and original formatting values. Restore with `python scripts/places_cleanup_phase2.py --rollback`.
