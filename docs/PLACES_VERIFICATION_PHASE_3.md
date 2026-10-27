# Places Verification and Conflict Resolution — Phase 3

This report distinguishes map eligibility from business existence. An uncertain record is withheld for privacy review, not declared false or non-existent.

## Public-map eligibility

- Public/business/institutional and eligible before consolidation: 2621
- Confirmed private residential: 0
- Uncertain and withheld from public outputs: 34
- Identifying fields scrubbed: 41 total (34 active records and 7 retired aliases).
- No uncertain/private names, addresses, coordinates, contacts, or record IDs are listed in this report.

## Duplicate resolution

- Candidate groups independently re-compared field by field: 172
- Groups now exact across all non-ID fields and consolidated: 20
- Records retired with permanent ULID aliases and source lineage: 47
- Canonical records retained from those groups: 20
- Conflicting groups retained without changes: 152 groups / 488 records.
- Conflicting field counts by group: address: 113, categories: 10, hours: 34.
- Full public-eligible record values, distances, field comparisons, source lineage, and OSM results are in the JSON report.
- No OSM match or empty result is used as proof that a place is fake, private, or non-existent.

## Other quality findings

- Active public places with missing coordinates: 2
- Missing addresses among eligible public places: 60
- Missing categories among eligible public places: 11
- Public places outside current map viewport (not assumed misplaced): 443
- Postcode/locality flags still requiring postal review: 35
- Public names, addresses, coordinates, and categories corrected in Phase 3: 0; no unsupported facts were added.

## Integrity

- Active source records after consolidation: 2608
- Public eligible active records after consolidation: 2574
- Alias count after consolidation: 1086
- Public MZP features after eligibility filtering/build: 2572
- Road/speed-limit source hashes are checked against the pre-Phase-3 worktree; supplementary unverified maxspeed evidence remains unchanged.

## Privacy and history-remediation plan

Uncertain and confirmed-private records are represented in current source files only by the permanent ULID, a generic review placeholder, null coordinates, and a non-identifying review token. Their alias payloads and per-record Phase 2 report values are scrubbed. They are omitted from MZP and browser search.
Earlier public commits, PR diffs, and the Phase 1 audit artifact may still contain pre-review source values. GitHub denied the artifact deletion request with HTTP 403; a repository admin must remove it. A repository-wide history rewrite would require coordinated ref rewriting and is not performed in this PR. See `history_remediation_plan` in the JSON report.

## Remaining limitations

- The 152 unresolved duplicate groups remain separate because one or more fields conflict and independent evidence did not resolve those conflicts.
- Public source listings do not establish current operation, exact address, ownership, public access, or pin accuracy unless explicitly stated in an evidence row.
- Redacted eligibility cases require direct contributor/owner review before any details can be restored.
