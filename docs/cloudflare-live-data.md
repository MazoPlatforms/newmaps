# Cloudflare live data architecture

## Source of truth and update path

GitHub remains the authoritative copy of `data/`, source roads/places, and the generators. The `Sync Mazo Maps data to Workers` workflow runs for every push to protected `main` (plus a manually requested run on `main`). It validates/rebuilds the same generated datasets used by the existing GitHub Pages flow, hashes the resulting `dist/generated/` and `dist/data/` files, and compares them with the Durable Object's current manifest. It uploads only changed hashes and publishes deletions as manifest omissions. The workflow does not commit generated artifacts and does not deploy the Worker.

R2 stores immutable objects at `objects/<sha256>/<hex-encoded-path>`. A failed run can leave unreferenced objects, but users cannot see them. The SQLite Durable Object serializes publication and uses one storage transaction to replace the active manifest and run number. Publication checks the expected previous revision and rejects stale/replayed runs. Old immutable objects remain available for rollback; apply an R2 lifecycle rule only after choosing a rollback retention period.

Clients request `/api/version` and `/api/manifest` with `no-store`. The map uses hash-addressed `/api/data/...` URLs. Changed/deleted data therefore cannot be confused with an old browser/CDN object; current manifests are uncached, so no purge step is required. Open Worker-hosted tabs poll version every 15 seconds and reload on a new revision. The browser stores a validated manifest snapshot and service-worker offline packs keep locally downloaded resources available without network access. GitHub Pages does not call these APIs and retains its existing static-data path.

PMTiles requests use R2's native range read and return exact 206 responses. Range requests do not read or buffer the full archive. Bootstrap requests use the existing static PMTiles range/chunk delivery until the first successful sync. The internal static chunks remain private. Ordinary data responses use immutable hash URLs; manifests/version remain `no-store`.

## First-time Cloudflare configuration

1. Deploy this Worker configuration from the authorized deployment branch in a separate, explicitly approved deployment. Wrangler provisions the SQLite Durable Object migration and expects an R2 bucket named `mazo-maps-live-data`.
2. Create the bucket if needed: `npx wrangler r2 bucket create mazo-maps-live-data`.
3. Generate one random secret with at least 32 characters. Set it as a Worker secret: `npx wrangler secret put LIVE_DATA_HMAC_SECRET`.
4. Add the same value to GitHub repository Actions secrets as `MAZO_LIVE_DATA_HMAC_SECRET`. Never put it in source, workflow variables, logs, or frontend code. Existing Cloudflare deployment credentials are not used for data synchronization.
5. Confirm the `maps.mazo.workers.dev` host is enabled (or update the workflow URL and Worker-host detection together for a different Workers host). Run the workflow on `main` once after Worker deployment to seed the initial R2 objects and manifest.

The workflow only receives the HMAC secret on the protected-branch job. Its GitHub token is read-only, checkout does not persist credentials, and pull-request/fork events do not run it. Admin endpoints require a recent HMAC signature over method, path, body hash, file path, and content type. Uploads are bounded to 32 MiB; split larger source artifacts before adopting this protocol.

## Failure handling, retries, and rollback

Uploads retry transient failures with bounded backoff and four concurrent transfers. Publish uses compare-and-swap; a 409 triggers one fresh plan and retry. A failed upload never changes the active version. Deletions take effect only at atomic manifest publication. Restore a previous GitHub data commit and rerun the sync workflow to restore its data hashes. Keep old R2 objects until the selected rollback window expires.

The Worker does not call GitHub on client requests. GitHub API rate limits therefore do not affect map traffic. The source sync workflow currently reads the checked-out repository rather than using the GitHub API. Durable Object version reads are strongly consistent and serialized through one named object; this is a single coordination point, so observe its request/CPU usage as audience grows. Every visible tab makes one lightweight version request per 15 seconds while open. Cloudflare plan quotas and account-specific limits vary; review current Workers, Durable Objects, and R2 dashboard usage before broad rollout. On a free plan, a large continuously active audience can exhaust daily Worker/DO request limits even though file downloads use R2.

## Validation and benchmarks

Run `npm run test:unit`, `npm run test:browser`, `python -m unittest discover -s tests -v`, `npm run build:cloudflare`, and `npx wrangler deploy --dry-run --config wrangler.jsonc`. Unit/integration tests cover signatures, update/delete plans, stale runs, atomic publish, bootstrap, R2 range semantics, private chunks, offline manifest recovery, and version polling. The existing browser suite continues to exercise map startup, search, routes, touch directions controls, and PMTiles delivery.

`node scripts/benchmark_live_data.mjs` compares the existing static 64 KiB chunk path with exact-length R2 range reads using the built archive and deterministic 16 KiB ranges. This is a local byte-amplification benchmark, not an edge-latency or billed-cost measurement. For production latency/cost measurement, run repeated ranges against the deployed Worker and inspect Cloudflare Analytics for Worker invocations/CPU, Durable Object requests, R2 Class B reads, and R2 stored bytes. Do not run a production data sync or deploy as part of local validation.
