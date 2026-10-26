# Mazo Maps

A static MapLibre GL JS map for Kattankudy. Place records live in `places/<shard>/<ULID>.json`; non-place geography remains under `data/`.

## Place records

Every place has an immutable 26-character ULID `id`, a non-empty `name`, and `coordinates` as `{ "latitude": number, "longitude": number }` or `null` when the source has no verified location. Other source properties are retained. The JSON Schema is `data/place.schema.json`.

Use `python scripts/places.py add record.json` to create a place. The allocator generates its ULID and chooses the first shard with capacity. Shards are sequential numeric folders and contain at most 999 JSON files. Never change an existing ID when editing. Submit edits and deletions as reviewed pull requests. Concurrent PRs are checked against the target branch by CI.

## MZP format

`.mzp` is compact, ordinary GeoJSON `FeatureCollection` JSON. Feature IDs are ULIDs, coordinates follow GeoJSON `[longitude, latitude]`, and place fields are properties. Records without coordinates stay in the individual JSON archive and mapping but are listed in the manifest and omitted from map features. Invalid non-null coordinates fail validation. Build locally with `python scripts/places.py build`; output is `generated/kattankudy.mzp` and `generated/manifest.json`. The manifest provides feature count, byte length, shard counts, and SHA-256 for cache invalidation.

## Validation and deployment

`python scripts/places.py validate` checks IDs, filenames, JSON, coordinates, duplicate IDs, and shard limits. `python -m unittest discover -s tests -v` runs migration and shard tests. GitHub Actions validates pull requests and the Pages workflow builds the MZP before uploading the site artifact. Set Pages source to GitHub Actions.

Migration artifacts `migration-record-map.json` and `migration-exclusions.json` map every original file/index to its new ID and document records without coordinates. Original category files remain in git history for rollback and audit; the live app loads the generated MZP instead of requesting all category files.

## Rollback

Revert the migration pull request to restore the prior app and data layout, then allow the Pages workflow to deploy the reverted tree. Generated MZP files are build artifacts and do not need commits.
