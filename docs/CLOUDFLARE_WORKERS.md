# Cloudflare Workers deployment

Mazo Maps can be built as Workers Static Assets without changing its existing GitHub Pages deployment. The `deploy/cloudflare-workers` branch has its own production workflow; pushes to this branch run the repository validators, Python and Node regression suites, the Chromium browser smoke test, the static asset build, Wrangler's deployment dry-run, and then the Worker deployment.

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

Workers Static Assets does not return `206 Partial Content` for a static asset Range request. `src/worker.mjs` handles byte ranges for the single PMTiles archive path and returns `206`, `Content-Range`, and `Accept-Ranges`; other static files use the built-in asset handler. The archive is currently about 1.7 MB, so this uses the Static Assets binding and does not require R2.

`_headers` keeps the HTML shell and manifests revalidatable and marks data files with content-hash query strings immutable. Static asset edge caching and Wrangler's detected MIME types are retained.
