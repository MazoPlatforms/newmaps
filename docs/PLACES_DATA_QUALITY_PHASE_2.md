# Phase 2 Places data quality cleanup report

The score ranks investigation priority only; it is not a probability that a place is fake.

## Historical Phase 2 changes

- Names normalized: 559
- Addresses normalized: 954
- Comprehensive Title Case changes: 557
- Exact duplicate groups consolidated: 695
- Records retired with permanent ULID aliases: 1,039
- Canonical records retained: 695
- Duplicate groups left unresolved: 172
- Active place records after Phase 2: 2,655

These are the historical Phase 2 totals. Phase 3 adds 47 aliases from 20 further exact-copy groups and withholds uncertain eligibility cases. Phase 3 reports contain the current counts.

## Review scope and limits

Phase 2 re-evaluated all 867 audit groups. Only groups with every non-ID field exactly equal were consolidated. The 172 groups with field differences remained unresolved. Co-location alone was not used to merge records.

Records without independently checked public listings were marked unverified/not checked. Search links were leads only. Missing online presence did not label a record invalid. Conflicting ADDAX address evidence was preserved. Kattankudy postcode 30100 remained a reference; locality/postcode conflicts were not changed.

## Privacy update

Per-record name, address, coordinate, and review-priority tables from the original Phase 2 document have been removed from this public report. The machine-readable Phase 2 report retains details only for records that Phase 3 considers eligible for public mapping; uncertain/private records are represented by non-identifying placeholders. Earlier Git commits and pull-request diffs may still contain pre-review content; see the Phase 3 history-remediation plan.

## Rollback

Phase 2 retired records and reversible formatting snapshots are stored in `data/places/aliases.json` for public-eligible records. Privacy-withheld fields are intentionally not backed up in current public files. Phase 3 documents the duplicate rollback command and privacy limitations.
