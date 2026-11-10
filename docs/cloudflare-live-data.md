# Cloudflare live data architecture

## Source of truth and update path

GitHub remains the authoritative copy of `data/`, source roads/places, and the generators. Data-only pushes to protected `main` automatically run the `Sync Mazo Maps data to Workers` workflow. If a commit changes both data and Worker/application code, the push sync waits; after the successful Worker deployment, a `workflow_run` sync validates the commit and publishes its data. The workflow also supports a manual run on `main`. It rebuilds generated map datasets, hashes the resulting `dist/generated/` and `dist/data/` files, and compares them with the Durable Object's current manifest and R2 objects. It uploads only missing content-addressed objects and publishes deletions as manifest omissions. It does not commit generated artifacts or deploy the Worker. Unrelated code-only commits do not advance the live-data version.

R2 stores immutable objects at `objects/<sha256>/<hex-encoded-path>`. A failed run can leave unreferenced objects, but users cannot see them. The SQLite Durable Object serializes publication and uses one storage transaction to replace the active manifest and run number. Publication checks the expected previous revision and rejects stale/replayed runs. Old immutable objects remain available for rollback; apply an R2 lifecycle rule only after choosing a rollback retention period.

The registered `LiveDataRegistry` class extends Cloudflare's `DurableObject` runtime base. Its small HTTP/core logic is kept in `src/live-data-registry.mjs`; the Worker entry is `src/worker.mjs`, while `src/worker-core.mjs` is the Node-testable request router.

Clients request `/api/version` and `/api/manifest` with `no-store`; version polling sends an ETag and unchanged versions return `304` without a JSON body. The service worker always sends those API requests to the network and does not satisfy them from its app or offline caches. Data URLs include the content SHA-256, so changed bytes use a new URL and cannot be shadowed by an immutable cached response. A new version causes open tabs to reload within one visible-tab poll interval (15 seconds); hidden tabs pause polling. Offline packs remain versioned snapshots and stay usable offline until the user downloads a newer pack.

PMTiles requests use R2's native range read and return exact 206 responses. Range requests do not read or buffer the full archive. Bootstrap requests use the existing static PMTiles range/chunk delivery until the first successful sync. The internal static chunks remain private. Ordinary data responses use immutable hash URLs; manifests/version remain `no-store`.

POI geometry is built directly into the PMTiles `places` MVT layer from GitHub's canonical eligible place records. MapLibre reads that vector source and renders the ordinary POIs as collision-aware symbol layers with zoom/category filters and `icon-anchor: bottom`; clicks query those vector layers and open the existing place sheet. Only the selected-place emphasis is mirrored to a one-feature GeoJSON symbol source; place POIs are not HTML markers. The GPS location and route endpoints remain UI markers.

## Cloudflare configuration

Production uses the `maps` Worker at `https://maps.mazo.workers.dev/`, the `mazo-maps-live-data` R2 bucket, and the SQLite Durable Object migration `live-data-v1`. Wrangler deployment on `main` validates bindings and migration state; the follow-up sync workflow seeds or updates the active data manifest. To recreate this setup in a new Cloudflare account, provision the same bucket and migration through `wrangler.jsonc` and add the repository Actions secrets documented in [Cloudflare Workers deployment](CLOUDFLARE_WORKERS.md). Store `LIVE_DATA_HMAC_SECRET` only as a Worker secret and the same random 32+ character value as GitHub's `MAZO_LIVE_DATA_HMAC_SECRET`. Never put either secret in source, workflow variables, logs, or frontend code. Deployment credentials are not used by client requests.

The workflow only receives the HMAC secret on the protected-branch job. Its GitHub token is read-only, checkout does not persist credentials, and pull-request/fork events do not run it. Admin endpoints require a recent HMAC signature over method, path, body hash, file path, and content type. Uploads are bounded to 32 MiB; split larger source artifacts before adopting this protocol.

## Failure handling, retries, and rollback

Uploads retry transient failures with bounded backoff and four concurrent transfers. Publish uses compare-and-swap; a 409 triggers one fresh plan and retry. A failed upload never changes the active version. Deletions take effect at atomic manifest publication: the current manifest no longer advertises that path, while its content-addressed R2 object remains retained for rollback. Restoring an earlier dataset should use a new GitHub revert commit/run number; the old object hash can be referenced again without transferring the bytes. Keep old R2 objects until the selected rollback window expires. Because offline packs are user-managed snapshots, a user who has explicitly downloaded an older pack can keep using that older copy offline until they replace/remove it.

The Worker does not call GitHub on client requests. GitHub API rate limits therefore do not affect map traffic. The source sync workflow currently reads the checked-out repository rather than using the GitHub API. Durable Object version reads are strongly consistent and serialized through one named object; this is a single coordination point, so observe its request/CPU usage as audience grows. Every visible tab makes one lightweight version request per 15 seconds while open. Cloudflare plan quotas and account-specific limits vary; review current Workers, Durable Objects, and R2 dashboard usage before broad rollout. On a free plan, a large continuously active audience can exhaust daily Worker/DO request limits even though file downloads use R2.

## Stable RideNow API v1

Base URL: `https://maps.mazo.workers.dev/api/v1`. These are public, read-only endpoints; no API key is required and no user credentials or personal data are accepted. TLS is required. CORS allows `*` because responses contain public map records only; CORS is a browser policy, not authentication. The sync/admin API is separate and requires a short-lived HMAC-SHA256 signature and one-use nonce. Never embed that HMAC key in RideNow or another client.

The Cloudflare `API_RATE_LIMITER` binding allows 60 search/geocode/route/manifest requests per client IP per minute. A separate `VECTOR_TILE_RATE_LIMITER` allows 1,200 PBF tile requests per IP per minute. A `429` includes `Retry-After: 60`; clients should use bounded exponential backoff. JSON/GeoJSON responses include `X-Mazo-API-Version: v1` and `X-Mazo-Data-Revision`. API search uses a precomputed compact case/diacritic-insensitive substring index; the browser app retains its richer fuzzy and Tamil/Sinhala romanization matching.

| Endpoint | Contract |
| --- | --- |
| `GET /manifest` | `{ api_version, revision, manifest, map_manifest, resources }`. The map manifest contains PMTiles zoom/feature metadata; each resource provides its immutable `/api/data/...` URL, SHA-256 and byte count. |
| `GET /places/search?q=<text>&limit=10` | Ranked canonical place records with ID, coordinates where available, category and match score. `limit` is clamped to 1–25; query is required and at most 120 characters. |
| `GET /geocode?q=<text>&limit=10` | GeoJSON `FeatureCollection` of matching geocoded places; geometry is `[longitude, latitude]`. |
| `POST /route` with JSON `{ start_lon, start_lat, end_lon, end_lat, profile }` | Local route alternatives with geometry, distance, ETA and snap distances. Coordinates are kept out of URL query strings. `profile` is `driving`, `walking`, or `cycling`. Local routing coverage is the Kattankudy-area graph only; outside coverage returns `422` with `snap_too_far`. |

### Native vector map API

`GET /style.json` and `/style/dark.json` provide MapLibre Native-compatible version-8 style JSON. `/tiles.json` is TileJSON 3.0 with XYZ scheme, `places` vector-layer metadata, zoom range and bounds. `/tiles/{z}/{x}/{y}.pbf` returns the gzip-compressed MVT payload selected from the versioned R2 PMTiles archive using only header/directory/tile range reads. The endpoint sends PBF MIME type, `Content-Encoding: gzip`, ETag, immutable caching for revision-pinned URLs, and public CORS. A valid tile with no features returns `204`; invalid coordinates return `400`; an old explicit revision returns `409`. Glyph range assets are built from the bundled OFL font, published alongside generated data, and served under `/fonts/{fontstack}/{range}.pbf`; sprite JSON/PNG assets are served from `/sprite` resources. Place icons remain collision-aware native symbol layers; no HTML markers are required for POIs.

Unknown paths return `404`; invalid parameters return `400`; unavailable synchronized data returns `503`. Clients should read `/manifest` first, track `revision`, and refresh cached search/route data when that value changes. The web app also retains client-side search and routing data for responsive interaction and offline behavior.

## Validation and benchmarks

Run `npm run test:unit`, `npm run test:live-data:e2e`, `npm run test:browser`, `python -m unittest discover -s tests -v`, `npm run build:cloudflare`, and `npx wrangler deploy --dry-run --config wrangler.jsonc`. The E2E script starts Wrangler locally with its SQLite Durable Object and local R2 emulation, signs real sync requests, verifies one-use HMAC nonces, tests changed/deleted files, archive SHA-256 and ranges, conditional polls, hash-addressed cache behavior, rollback without re-uploading retained objects, open-tab reload, vector-POI point clicks, stale service-worker cache bypass and axe accessibility. The existing browser suite covers map startup, search, routing/GPS, touch directions controls, offline behavior and PMTiles delivery.

For production latency/cost measurement, run repeated ranges against the deployed Worker and inspect Cloudflare Analytics for Worker invocations/CPU, Durable Object requests, R2 Class B reads, and R2 stored bytes. Do not run a production data sync or deploy as part of local validation.
