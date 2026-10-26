# Places data quality audit — 2026-10-27

**Audit-only snapshot:** `main` at `d53345822df5b49f0f3248409dbb2202990a386e`  
**Scope:** all individual JSON records in `data/places/`  
**Records inspected:** 3,694 across shards `0001`–`0004`  
**Record edits, merges, and deletions:** none

The `Validate speed-limit data` PR workflow generates a downloadable `places-quality-audit-2026-10-27.json` artifact for this audit branch. It contains an entry for every ULID, its current record hash, source filename/index, review score and explanations, proposed formatting-only edits, duplicate-group membership, and per-record discovery links for OSM, Google, Bing, and IDB business listings.

## Findings

| Check | Result | Interpretation |
|---|---:|---|
| Place records / shards | 3,694 / 999, 999, 999, 697 | All records were loaded and audited. |
| Missing coordinates | 2 | `Digital Tutors LK (PVT) Ltd.` and `Women Safe Home`; retain records and request a source location. |
| Invalid numeric/range coordinates | 0 | No invalid coordinate values found. |
| Missing address | 79 | Incomplete record; do not infer an address from the pin. |
| Missing categories | 35 | Review category; no classification inferred. |
| Missing phone / website | 1,060 / 2,985 | Completeness only; absence is not evidence of a fake place. |
| No verification timestamp/source field | 3,694 | The dataset has no per-record freshness/provenance verification date. |
| Exact normalized-name + coordinate duplicate candidates | 867 groups / 2,289 records | 1,422 excess records if every group were confirmed; this is a candidate count, not a deletion instruction. |
| Candidate groups identical except ULID | 695 | Strong internal duplicate evidence; still requires explicit review and approval. |
| Candidate groups with field differences | 172 | Compare every conflicting address, hours, category, and other field before any consolidation. |
| Repeated coordinate groups including different names | 846 | Co-location is not a duplicate signal by itself; shared buildings and facilities remain separate. |
| Kattankudy-named addresses with a postcode other than 30100 | 63 records | Locality review only; some records may refer to adjacent postal towns. Do not auto-replace the postcode. |
| Mechanical name case/spacing candidates | 24 | Candidate text is explicitly non-authoritative; preserve brand and spelling until verified. |

### Suspicious, incomplete, and unverifiable records

No record is labeled fake. The per-record `review_priority_score` is a triage score, **not** a probability that the place is fake or real. It is calculated from concrete data-quality flags such as missing coordinates, duplicate candidates, and missing address/category fields. Missing web presence, phone, or website does not increase the score by itself.

The review-priority score is capped at 100 and uses fixed weights: invalid coordinates 50, missing coordinates 45, duplicate candidate 30, missing migration lineage 20, postcode/locality mismatch needing review 15, missing address 12, missing category 8, school registry follow-up 5, and mechanical name formatting 4. “No phone or website” is a reported completeness field but contributes zero points.

All 3,694 records lack a verification timestamp. Public-source lookup links are included for every record, but OSM and business-directory pages were not individually inspected for the other 3,692+ records. The report labels that evidence as “not checked” instead of claiming a successful cross-check. Independent sources can confirm a listing without proving the map pin or current business status.

Official-source checks completed:

- The Sri Lanka Ministry of Education’s 2024 Eastern Province school list independently matches 19 place records by government school census number (some records are repeated source copies). The report includes the full source link and matched census number per record. **Only positive matches are considered evidence; an absent number is not a negative finding.**
- The Industrial Development Board of Sri Lanka’s BizConnect entry confirms the ADDAX CLOTHING (PVT) LTD business name/contact for two matching source copies. The directory address (“No 10, ... Mosque Avenue”) differs from the records’ “Falah, 04 Mosque Avenue”; it does not confirm the pin, and both address variants are retained for review.
- Sri Lanka Post’s official postcode book states Kattankudi’s postcode is 30100. The 63 flagged records may refer to neighboring localities, so the audit requests locality verification rather than replacing values.
- Search indexing also surfaced the Batticaloa Central Zone school census portal. A source hit for census 14294 is included as supporting discovery evidence; other portal entries were not individually checked.

## Duplicate groups and canonical proposals

The full JSON report lists every candidate group’s ULIDs, migration source file/row indexes, every member’s field values for field-by-field comparison, differing fields, evidence dimensions, confidence in the duplicate-review classification, and one deterministic canonical **proposal**. The canonical candidate is selected by populated-field count and then stable ULID ordering. It is not changed in this PR.

For 695 groups, all fields except the ULID are identical. For the other 172 groups, the report enumerates the conflicting properties; a human must compare and combine all unique information. Nearby points, name similarity alone, repeated coordinates with different names, and distinct branches are not merged. Any later approved consolidation must keep retired ULIDs as aliases and preserve every source-row reference.

## Name, category, and address normalization proposals

No place data was normalized in this PR. The JSON report supplies `before` and `candidate_after` values only for mechanical whitespace/case suggestions. It does not translate names, standardize unknown abbreviations, infer brand capitalization, fill missing streets/house numbers/postcodes, or change categories without an authoritative mapping. For uncertain/multilingual spelling, preserve the current name and ask a local contributor.

Every place record retains its current value and a SHA-256 hash in the report. `migration-record-map.json` maps each permanent ULID to its legacy filename and row index, but the legacy JSON payload files are not present on `main`; consequently, an exact comparison to every original raw source value is not possible from the current repository alone. The audit PR does not claim otherwise.

## Sources and limitations

- [OpenStreetMap search](https://www.openstreetmap.org/search): record-specific discovery links are generated. A bulk OSM feature query was unavailable in this audit environment; absence from OSM is not treated as evidence of nonexistence.
- [Sri Lanka MOE 2024 Eastern Province school list](https://dmb.moe.gov.lk/2024/01/01_PDF/Tbl20240106.pdf)
- [Batticaloa Central Zone school census portal](https://www.bczone.lk/schools/census_list.php)
- [Industrial Development Board BizConnect — ADDAX CLOTHING](https://bizconnect.idb.gov.lk/listing/batticaloa/garment-textiles-and-allied/addax-clothing-pvt-ltd/)
- [Sri Lanka Post official postcode book](https://slpost.gov.lk/wp-content/uploads/2022/11/POST-CODE-BOOK-.pdf)
- [Kattankudy Divisional Secretariat Business Name Registration portal](https://bnrdskky.com/)

The audit cannot determine a business’s current operating status without current owner, official registry, or on-site confirmation. Public-source discovery links are leads, not proof. The next phase requires community review of the candidate report and explicit approval before any record is merged, deleted, or otherwise changed.

## Reproduction

```sh
python scripts/audit_places_quality.py
python scripts/audit_places_quality.py --check
python -m unittest discover -s tests -v
```
