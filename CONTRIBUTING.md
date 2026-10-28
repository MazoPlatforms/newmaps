# Contributing to Mazo Maps

Mazo Maps accepts contributions through GitHub's normal **fork → edit JSON → pull request** process. There is no submission website, account system, or separate API.

## Choose how to contribute

- **Correct an existing place in GitHub's web interface:** open its JSON file under `data/places/<shard>/`, use **Edit**, commit the change to a branch in your fork, and open a pull request. Never change its `id` or move its file to another shard.
- **Add a new place:** use a Codespace on your fork so the repository can allocate a permanent ULID and an available shard. Do not hand-pick an ID or upload a file into a full shard.
- **Report a possible duplicate or request removal:** open a pull request with the matching template. Report IDs and evidence; do not delete records or merge records yourself.

## Fork and open a Codespace

1. Open [MazoPlatforms/newmaps](https://github.com/MazoPlatforms/newmaps) and select **Fork**.
2. In your fork, select **Code → Codespaces → Create codespace on main** (or create a branch first and select it).
3. In the Codespace terminal, check the working tree and create a contribution branch:

   ```sh
   git status --short --branch
   git switch -c places/add-public-place
   ```

4. For a new place, copy `examples/contributions/new-place.template.json` to a temporary file in the repository, replace every placeholder with source-backed information, then run the scaffold command:

   ```sh
   cp examples/contributions/new-place.template.json new-place.json
   # Edit new-place.json and replace all placeholder text first.
   python scripts/place_contributions.py scaffold new-place.json
   ```

   The command assigns a new ULID and writes the file to the first shard with space. If the record has no verified location, leave `coordinates` as `null`; do not estimate a pin. The allocator rejects records without a clear public-place category or context and blocks an exact duplicate candidate unless you pass `--allow-duplicate-candidate` after checking that it is a separate branch or venue.

5. Validate the complete place tree and build the public data locally:

   ```sh
   python scripts/places.py validate
   python scripts/places.py build
   python scripts/validate_place_contributions.py --base-ref origin/main --head-ref HEAD
   python -m unittest discover -s tests -v
   ```

   Review the output. Duplicate candidates and privacy-safe withheld placeholders produce maintainer-review warnings. A clearly private residence, an uncertain record containing identifying details, invalid coordinates, broken aliases, or a deleted ID without a durable alias fails validation.

6. Commit the source JSON and any requested evidence/documentation. Do not commit generated files under `generated/`:

   ```sh
   git add data/places
   git commit -m "data: add public place"
   git push -u origin places/add-public-place
   ```

7. Open a pull request from your fork's branch to `MazoPlatforms/newmaps:main`. Choose the relevant template under **Preview → choose a template**, complete its checklist, and link public evidence. GitHub Actions validates the PR and the `main` Pages workflow rebuilds place PMTiles, search, and details data after an approved merge.

## Editing through GitHub's web interface

For a correction, browse to `data/places/<shard>/<ULID>.json`, choose **Edit**, keep the same ULID and filename, and commit to a branch in your fork. The PR checks validate schema, ranges, eligibility, aliases, shard sizes, and generated output. For a new place, use the Codespace allocator above; it selects the shard and avoids collisions.

## Place JSON and permanent IDs

The schema is [`data/place.schema.json`](data/place.schema.json). A source record is stored at:

```text
data/places/<four-digit shard>/<26-character ULID>.json
```

The `id` is a permanent Crockford Base32 ULID matching `^[0-7][0-9A-HJKMNP-TV-Z]{25}$`. The filename must equal the ID. Never change or reuse an ID. `python scripts/places.py ulid` prints a fresh candidate; the scaffold utility checks collisions and writes the final record.

Each shard holds no more than **999 JSON files**. The allocator uses the first numeric shard with capacity, then creates the next numeric shard. Never place records in `data/places/aliases.json`; it is the alias registry.

Required fields are:

- `id`: permanent ULID.
- `name`: public place's name as supported by evidence. Keep original spelling, meaningful Tamil/Sinhala/English text, established brand case and acronyms. Do not translate, transliterate, or invent spelling. Use readable word capitalization where the source supports it.
- `coordinates`: `null` if no location is verified, otherwise `{ "latitude": number, "longitude": number }` in decimal degrees. Latitude is -90…90 and longitude -180…180. Coordinates are WGS84; GeoJSON output reverses the order to `[longitude, latitude]`.

Common optional fields include `categories` (non-empty strings), `address`, `phone`, `website`, `hours`, and `business_status`. Keep addresses source-backed, readable, and locally meaningful; do not guess a house number, street, district, postcode, or locality. Do not use a residential address as a public business address unless it is genuinely the public-facing location of that business.

Optional `provenance` may record `source_name`, `source_url`, `checked_at` (ISO-8601 date-time), `checked_by` (GitHub handle), and concise `notes`. Link the source that supports the changed fields; a generated search link is not verification. Existing school references use `school_census_no` and `name_source`. Historical import lineage is also maintained in migration mappings and retired alias entries. Do not add private contributor contact details or private residential evidence to a public PR.

## Public-place and privacy rules

Mazo Maps is a map of public-facing businesses, institutions, and publicly relevant facilities. Do not submit private homes, personal locations, or private family addresses. Do not infer that a place is private just because its name contains a person's name or “Home”; home-based businesses, care homes, and public institutions can be eligible when the category and evidence support them.

The automated eligibility gate is conservative. Clearly private residential records fail validation. Uncertain records must use the repository's minimal redacted placeholder and remain outside PMTiles/search until a maintainer resolves eligibility. If your evidence itself contains a private address or coordinate, do not paste it into a public issue, PR, test fixture, or artifact; provide only the record ULID and ask a maintainer for a private review channel.

## Aliases, duplicates, and removals

Retired ULIDs remain in `data/places/aliases.json` and resolve to an active canonical ULID. Contributors should not edit aliases manually. The validator rejects invalid IDs, alias cycles, missing targets, and active/retired ID collisions. A duplicate candidate is a review signal, never an instruction to merge. Co-located branches, neighboring businesses, and similar names must remain separate unless reliable evidence confirms identity and all non-ID fields are compatible.

Do not delete a source record to request removal. Use the removal template and preserve the ID. Maintainers can keep a privacy-safe redacted placeholder, or create a durable alias only for a confirmed duplicate with a valid canonical target. Uncertain or unsupported removals remain unchanged until reviewed.

## Maintainer review and merge

Maintainers should review the source diff and linked evidence, confirm the place is public, check address/coordinate changes against evidence, review duplicate warnings without automatic consolidation, and ensure removed IDs remain active or resolve through aliases. Check Actions results for `Validate Mazo Places` and `Validate speed-limit data`; review the generated PMTiles, search-index, details-index, and manifest checks and the complete diff before merging. After merge, `Deploy Mazo Maps to GitHub Pages` runs the production validators/builders and publishes a fresh places PMTiles archive, manifest, search index, and place-details index.

Repository settings cannot be changed by a PR. A repository administrator should protect `main` with pull requests, require the validation checks, require CODEOWNERS review for place data/schema/workflow changes, dismiss stale approvals after new commits, and restrict bypasses. `.github/CODEOWNERS` routes these files to the verified repository admin reviewer.
