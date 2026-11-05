# Cloudflare Workers deployment

Mazo Maps runs as a Cloudflare Worker with Static Assets and `/api/*`, while preserving the existing GitHub Pages deployment. Production code changes on `main` run the repository validators, Python and Node regression suites, Chromium browser smoke tests, a static asset build, Wrangler validation, deployment, and production smoke checks. Data-only changes use the separate R2 sync workflow without redeploying the Worker.

## Required GitHub Actions secrets

Add these repository secrets in **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID that owns the Worker. |
| `CLOUDFLARE_API_TOKEN` | Account-scoped token with Workers Scripts Write, R2 Storage Read (bucket existence check), and R2 Storage Write (idempotent bucket creation). Never commit or print it. |
| `MAZO_LIVE_DATA_HMAC_SECRET` | Random 32+ character secret shared by the protected deploy and sync jobs. Never expose it to pull-request jobs or clients. |

The workflow idempotently creates R2 bucket `mazo-maps-live-data` and deploys the SQLite Durable Object migration `live-data-v1` / `LiveDataRegistry`. Keep the Worker name/class and completed migration tags stable. No zone permissions are needed unless a custom domain or zone route is later configured. Review token use and scope it only to the account and product capabilities required for Worker deployment and R2 provisioning.

The current account `workers.dev` subdomain is `mazo`, so the configured Worker name `maps` will be served at `https://maps.mazo.workers.dev/`. No custom domain or account subdomain change is required.

## Build and local checks

Install the locked JavaScript dependencies and the Python dependencies in `requirements-map-tiles.txt`, then run:

```sh
python scripts/places.py validate
python scripts/places.py build
python scripts/build_map_delivery.py
python scripts/build_routing_graph.py
python scripts/roads.py validate
python scripts/roads.py build
python scripts/speed_limits.py validate
python scripts/speed_limits.py build
npm run build:cloudflare
npx wrangler deploy --dry-run --config wrangler.jsonc
```

The build stages only app assets, city labels, and generated files referenced by the delivery manifests in `dist/`. Canonical place, road, and speed-limit source records are not published as separate files. The Pages workflow continues to build and deploy from the repository root as before.

Workers Static Assets does not return `206 Partial Content` for a static asset Range request. `scripts/build_cloudflare_assets.py` splits the PMTiles archive into internal 64 KiB static chunks. `src/worker.mjs` reads the archive headers with `HEAD`, fetches only the chunks intersecting a requested byte range, and returns the original cache validators with `206`, `Content-Range`, and `Accept-Ranges`. Chunk URLs are versioned from the archive ETag and hidden from direct requests by `run_worker_first`. The full archive remains in `dist/generated/places.pmtiles` for downloads and offline packs; the service worker continues to synthesize cached byte ranges from that full archive.

Before choosing chunking, the PMTiles browser fixture's 39 range requests were replayed against local whole-archive and chunk-file readers. Whole-archive reads fetched 65.6 MB across the sample. A 64 KiB chunk size read 3.08 MB across 47 chunk reads (about 21× less data); 16, 32, and 128 KiB chunks read 1.31, 1.90, and 5.64 MB respectively. The 64 KiB option uses 26 chunk assets for the current 1.68 MB archive and needs at most 28 internal asset reads for a full archive Range (one metadata file, one `HEAD`, and 26 chunks). The build enforces a 47-chunk ceiling so this remains at or below 49 internal reads. Local file timings are microbenchmarks, not Cloudflare edge latency measurements. No R2 bucket or additional infrastructure is needed at the current size.

`_headers` keeps the HTML shell and manifests revalidatable and marks data files and internal chunks with content-hash/ETag query strings immutable. Static asset edge caching and Wrangler's detected MIME types are retained. Deployment applies `LIVE_DATA_HMAC_SECRET` to the Worker through Wrangler stdin, verifies homepage, SPA fallback, static manifest and PMTiles byte ranges, then a follow-up workflow seeds R2 and atomically activates the version manifest. The `API_RATE_LIMITER` binding caps RideNow's public read APIs at 60 requests per IP per minute. API contracts, CORS and Kotlin/Compose guidance are in [cloudflare-live-data.md](cloudflare-live-data.md).
