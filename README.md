# Mazo Maps

A static MapLibre GL JS map for Kattankudy. Place records live in `data/places/<shard>/<ULID>.json`; non-place geography remains under `data/`.

## Place records

Every place has an immutable 26-character ULID `id`, a non-empty `name`, and `coordinates` as `{ "latitude": number, "longitude": number }` or `null` when the source has no verified location. Other source properties are retained. The JSON Schema is `data/place.schema.json`.

Use `python scripts/places.py add record.json` to create a place. The allocator generates its ULID and chooses the first shard with capacity. Shards are sequential numeric folders and contain at most 999 JSON files. Never change an existing ID when editing. Submit edits and deletions as reviewed pull requests. Concurrent PRs are checked against the target branch by CI.

Retired place ULIDs resolve through `data/places/aliases.json`; the generated place manifest includes the flattened alias-to-canonical mapping, and the browser exposes `window.resolveMazoPlaceId(id)`. The allocator blocks a new exact name/coordinate duplicate candidate; a verified separate branch can be added with `--allow-duplicate-candidate` and its reason should be documented in the PR. Phase 2 source backups and the per-record review report are in `data/places/aliases.json` and `reports/places-data-quality-phase-2.json`.

## MZP format

`.mzp` is compact, ordinary GeoJSON `FeatureCollection` JSON. Feature IDs are ULIDs, coordinates follow GeoJSON `[longitude, latitude]`, and place fields are properties. Records without coordinates stay in the individual JSON archive and mapping but are listed in the manifest and omitted from map features. Invalid non-null coordinates fail validation. Build locally with `python scripts/places.py build`; output is `generated/kattankudy.mzp` and `generated/manifest.json`. The manifest provides feature count, byte length, shard counts, and SHA-256 for cache invalidation.

## Road records

Road segments live in `data/roads/<shard>/<ULID>.json`, with no more than 999 records per shard. The permanent ULID is `id`; the Overture segment ID is retained as `source_id`. The compact `road-migration-map.json` manifest points to per-shard mapping files and preserves the source-to-ULID path and source-record checksum. Run `python scripts/roads.py add road.json` to allocate a new record, `python scripts/roads.py validate` to check the road tree and source mapping, and `python scripts/roads.py build` to generate `generated/kattankudy-roads.mzp` plus its roads-specific manifest. The map fetches this GeoJSON once and reuses it for road-related map data. Do not merge segments by name or alter their source coordinates. The previous combined source dataset is retained on the `archive/pre-ulid-roads-migration` branch.

## Validation and deployment

`python scripts/places.py validate` and `python scripts/roads.py validate` check IDs, filenames, source IDs, JSON, geometry, duplicate IDs, and shard limits. `python -m unittest discover -s tests -v` runs allocator, migration integrity, roads, and shard tests. GitHub Actions validates pull requests and the Pages workflow builds both MZP files before uploading the site artifact. Set Pages source to GitHub Actions.

Migration artifacts `migration-record-map.json` and `migration-exclusions.json` map every original file/index to its new ID and document records without coordinates. The original 61 category datasets are preserved on the [`archive/pre-ulid-migration`](https://github.com/MazoPlatforms/newmaps/tree/archive/pre-ulid-migration) branch. The live app loads the generated MZP instead of requesting individual place JSON files.

## Rollback

Revert the migration pull request to restore the prior app and data layout, then allow the Pages workflow to deploy the reverted tree. Generated MZP files are build artifacts and do not need commits.


## Speed-limit records

Speed-limit records live in `data/speed-limits/<shard>/<ULID>.json`, with at most 999 records per sequential shard. Their original `road_id` and `source_id` are preserved; `road_ref` resolves only through the explicit Roads migration map. A missing posted speed remains `null`; the 70 km/h field is a legal-default candidate and all imported records remain unverified. The source Gazette notes and caveats are retained in the speed-limit migration manifest.

Run `python scripts/speed_limits.py migrate` for an idempotent source migration, `python scripts/speed_limits.py add <record.json>` to allocate a contributor record, `python scripts/speed_limits.py validate` to check source preservation and road references, and `python scripts/speed_limits.py build` to generate `generated/kattankudy-speed-limits.mzp` and its checksum manifest. The MZP is a GeoJSON FeatureCollection and uses linked road LineStrings only where the explicit road reference resolves. Invalid geometries remain in the individual records and are listed in the manifest. The pre-migration source is preserved on `archive/pre-ulid-speed-limits-migration`.
