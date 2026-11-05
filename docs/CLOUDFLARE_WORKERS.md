# Cloudflare Workers deployment

Mazo Maps can be built as Workers Static Assets without changing its existing GitHub Pages deployment. The `deploy/cloudflare-workers` branch has its own production workflow; pushes to this branch run the repository validators, Python and Node regression suites, the Chromium browser smoke test, the static asset build, Wrangler's deployment dry-run, the Worker deployment, and production URL smoke checks.

## Required GitHub Actions secrets

Add these repository secrets in **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID that owns the Worker. |
| `CLOUDFLARE_API_TOKEN` | An account-scoped API token used by Wrangler in CI. Never commit the token or put it in a workflow file. |

For the first deployment, the token must be allowed to create the `maps` Worker (Workers Admin at the selected account scope). After the Worker exists, the token can be narrowed to Workers Editor for that Worker. No zone permissions are needed unless a custom domain or zone route is later configured.

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

`_headers` keeps the HTML shell and manifests revalidatable and marks data files and internal chunks with content-hash/ETag query strings immutable. Static asset edge caching and Wrangler's detected MIME types are retained. The deployment workflow's final smoke check verifies the homepage, SPA fallback, place manifest, and PMTiles byte ranges against the deployed URL.
