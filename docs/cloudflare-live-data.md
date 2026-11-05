# Cloudflare live data architecture

## Source of truth and update path

GitHub remains the authoritative copy of `data/`, source roads/places, and the generators. The `Sync Mazo Maps data to Workers` workflow runs for every push to protected `main` (plus a manually requested run on `main`). It validates/rebuilds the same generated datasets used by the existing GitHub Pages flow, hashes the resulting `dist/generated/` and `dist/data/` files, and compares them with the Durable Object's current manifest and R2 objects. It uploads only missing content-addressed objects and publishes deletions as manifest omissions. The workflow does not commit generated artifacts and does not deploy the Worker.

R2 stores immutable objects at `objects/<sha256>/<hex-encoded-path>`. A failed run can leave unreferenced objects, but users cannot see them. The SQLite Durable Object serializes publication and uses one storage transaction to replace the active manifest and run number. Publication checks the expected previous revision and rejects stale/replayed runs. Old immutable objects remain available for rollback; apply an R2 lifecycle rule only after choosing a rollback retention period.

The registered `LiveDataRegistry` class extends Cloudflare's `DurableObject` runtime base. Its small HTTP/core logic is kept in `src/live-data-registry.mjs`; the Worker entry is `src/worker.mjs`, while `src/worker-core.mjs` is the Node-testable request router.

Clients request `/api/version` and `/api/manifest` with `no-store`; version polling sends an ETag and unchanged versions return `304` without a JSON body. The service worker always sends those API requests to the network and does not satisfy them from its app or offline caches. Data URLs include the content SHA-256, so changed bytes use a new URL and cannot be shadowed by an immutable cached response. A new version causes open tabs to reload within one visible-tab poll interval (15 seconds); hidden tabs pause polling. Offline packs remain versioned snapshots and stay usable offline until the user downloads a newer pack. GitHub Pages does not call these APIs and retains its existing static-data path.

PMTiles requests use R2's native range read and return exact 206 responses. Range requests do not read or buffer the full archive. Bootstrap requests use the existing static PMTiles range/chunk delivery until the first successful sync. The internal static chunks remain private. Ordinary data responses use immutable hash URLs; manifests/version remain `no-store`.

POI geometry is built directly into the PMTiles `places` MVT layer from GitHub's canonical eligible place records. MapLibre reads that vector source and renders the ordinary POIs as collision-aware symbol layers with zoom/category filters and `icon-anchor: bottom`; clicks query those vector layers and open the existing place sheet. Only the selected-place emphasis is mirrored to a one-feature GeoJSON symbol source; place POIs are not HTML markers. The GPS location and route endpoints remain UI markers.

## First-time Cloudflare configuration

1. Deploy this Worker configuration from the authorized deployment branch in a separate, explicitly approved deployment. Wrangler provisions the SQLite Durable Object migration and expects an R2 bucket named `mazo-maps-live-data`.
2. Create the bucket if needed: `npx wrangler r2 bucket create mazo-maps-live-data`.
3. Generate one random secret with at least 32 characters. Set it as a Worker secret: `npx wrangler secret put LIVE_DATA_HMAC_SECRET`.
4. Add the same value to GitHub repository Actions secrets as `MAZO_LIVE_DATA_HMAC_SECRET`. Never put it in source, workflow variables, logs, or frontend code. Existing Cloudflare deployment credentials are not used for data synchronization.
5. Confirm the `maps.mazo.workers.dev` host is enabled (or update the workflow URL and Worker-host detection together for a different Workers host). Run the workflow on `main` once after Worker deployment to seed the initial R2 objects and manifest.

The workflow only receives the HMAC secret on the protected-branch job. Its GitHub token is read-only, checkout does not persist credentials, and pull-request/fork events do not run it. Admin endpoints require a recent HMAC signature over method, path, body hash, file path, and content type. Uploads are bounded to 32 MiB; split larger source artifacts before adopting this protocol.

## Failure handling, retries, and rollback

Uploads retry transient failures with bounded backoff and four concurrent transfers. Publish uses compare-and-swap; a 409 triggers one fresh plan and retry. A failed upload never changes the active version. Deletions take effect at atomic manifest publication: the current manifest no longer advertises that path, while its content-addressed R2 object remains retained for rollback. Restoring an earlier dataset should use a new GitHub revert commit/run number; the old object hash can be referenced again without transferring the bytes. Keep old R2 objects until the selected rollback window expires. Because offline packs are user-managed snapshots, a user who has explicitly downloaded an older pack can keep using that older copy offline until they replace/remove it.

The Worker does not call GitHub on client requests. GitHub API rate limits therefore do not affect map traffic. The source sync workflow currently reads the checked-out repository rather than using the GitHub API. Durable Object version reads are strongly consistent and serialized through one named object; this is a single coordination point, so observe its request/CPU usage as audience grows. Every visible tab makes one lightweight version request per 15 seconds while open. Cloudflare plan quotas and account-specific limits vary; review current Workers, Durable Objects, and R2 dashboard usage before broad rollout. On a free plan, a large continuously active audience can exhaust daily Worker/DO request limits even though file downloads use R2.

## Validation and benchmarks

Run `npm run test:unit`, `npm run test:live-data:e2e`, `npm run test:browser`, `python -m unittest discover -s tests -v`, `npm run build:cloudflare`, and `npx wrangler deploy --dry-run --config wrangler.jsonc`. The E2E script starts Wrangler locally with its SQLite Durable Object and local R2 emulation, signs real sync requests, verifies one-use HMAC nonces, tests changed/deleted files, archive SHA-256 and ranges, conditional polls, hash-addressed cache behavior, rollback without re-uploading retained objects, open-tab reload, vector-POI point clicks, stale service-worker cache bypass and axe accessibility. The existing browser suite covers map startup, search, routing/GPS, touch directions controls, offline behavior and PMTiles delivery.

`node scripts/benchmark_live_data.mjs` compares the existing static 64 KiB chunk path with exact-length R2 range reads using the built archive and deterministic 16 KiB ranges. This is a local byte-amplification benchmark, not an edge-latency or billed-cost measurement. For production latency/cost measurement, run repeated ranges against the deployed Worker and inspect Cloudflare Analytics for Worker invocations/CPU, Durable Object requests, R2 Class B reads, and R2 stored bytes. Do not run a production data sync or deploy as part of local validation.
