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

## Stable RideNow API v1

Base URL: `https://maps.mazo.workers.dev/api/v1`. These are public, read-only endpoints; no API key is required and no user credentials or personal data are accepted. TLS is required. CORS allows `*` because responses contain public map records only; CORS is a browser policy, not authentication. The sync/admin API is separate and requires a short-lived HMAC-SHA256 signature and one-use nonce. Never embed that HMAC key in RideNow or another client.

The Cloudflare `API_RATE_LIMITER` binding allows 60 requests per client IP per minute. A `429` includes `Retry-After: 60`; clients should use bounded exponential backoff. Responses include `X-Mazo-API-Version: v1` and `X-Mazo-Data-Revision`, use JSON/GeoJSON and `Cache-Control: no-store`, and allow GET/POST/OPTIONS (POST is used only for routing so coordinates do not appear in URL logs). API search uses a precomputed compact case/diacritic-insensitive substring index; the browser app retains its richer fuzzy and Tamil/Sinhala romanization matching.

| Endpoint | Contract |
| --- | --- |
| `GET /manifest` | `{ api_version, revision, manifest }`, including versioned PMTiles, search, place-detail, road and routing artifact metadata. |
| `GET /places/search?q=<text>&limit=10` | Ranked canonical place records with ID, coordinates where available, category, match score and optional distance. `limit` is clamped to 1–25; query is required and at most 160 characters. |
| `GET /geocode?q=<text>&limit=10` | GeoJSON `FeatureCollection` of matching geocoded places; geometry is `[longitude, latitude]`. |
| `POST /route` with JSON `{ start_lon, start_lat, end_lon, end_lat, profile }` | Local route alternatives with geometry, distance, ETA and snap distances. Coordinates are kept out of URL query strings. `profile` is `driving`, `walking`, or `cycling`. Local routing coverage is the Kattankudy-area graph only; outside coverage returns `422` with `snap_too_far`. |

Unknown paths return `404`; invalid parameters return `400`; unavailable synchronized data returns `503`. The client should read `/manifest` first, track `revision`, and refresh its cached search/route data when that value changes. The existing app still uses its own client-side search and routing logic, preserving GitHub Pages and offline behavior.

### Kotlin / Jetpack Compose integration outline

Use OkHttp/Ktor on an IO dispatcher, parse coordinates as longitude then latitude, and keep the API base URL in build configuration. Do not ship an API key. Render the vector map with MapLibre Native for Android and use the manifest's PMTiles URL plus `Range` support through a PMTiles-aware tile source/protocol adapter; the web-only `pmtiles://` MapLibre plugin cannot be reused directly in Android. Keep API requests cancellable from Compose, debounce search input (250–350 ms), respect `429 Retry-After`, and show the documented local-route coverage before falling back to an external routing provider. Never upload precise GPS coordinates unless the user selects a remote-routing feature and consents.

```kotlin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.HttpUrl.Companion.toHttpUrl

@Serializable data class PlaceSearchResponse(
    val api_version: String, val revision: String, val query: String, val results: List<PlaceResult>,
)
@Serializable data class PlaceResult(
    val id: String, val name: String, val address: String? = null,
    val coordinates: List<Double>? = null, val discoveryCategory: String? = null,
    val canonical_id: String? = null, val score: Int = 0,
)
class RateLimited(val retryAfterSeconds: Long) : Exception("Retry after $retryAfterSeconds seconds")
private val json = Json { ignoreUnknownKeys = true }

suspend fun searchPlaces(client: OkHttpClient, query: String): PlaceSearchResponse {
    val url = "https://maps.mazo.workers.dev/api/v1/places/search".toHttpUrl()
        .newBuilder().addQueryParameter("q", query).addQueryParameter("limit", "10").build()
    val request = Request.Builder().url(url).header("Accept", "application/json").get().build()
    return withContext(Dispatchers.IO) {
        client.newCall(request).execute().use { response ->
            if (response.code == 429) throw RateLimited(response.header("Retry-After")?.toLongOrNull() ?: 60)
            check(response.isSuccessful) { "Mazo Maps API returned ${response.code}" }
            json.decodeFromString(requireNotNull(response.body).string())
        }
    }
}
```

## Validation and benchmarks

Run `npm run test:unit`, `npm run test:live-data:e2e`, `npm run test:browser`, `python -m unittest discover -s tests -v`, `npm run build:cloudflare`, and `npx wrangler deploy --dry-run --config wrangler.jsonc`. The E2E script starts Wrangler locally with its SQLite Durable Object and local R2 emulation, signs real sync requests, verifies one-use HMAC nonces, tests changed/deleted files, archive SHA-256 and ranges, conditional polls, hash-addressed cache behavior, rollback without re-uploading retained objects, open-tab reload, vector-POI point clicks, stale service-worker cache bypass and axe accessibility. The existing browser suite covers map startup, search, routing/GPS, touch directions controls, offline behavior and PMTiles delivery.

`node scripts/benchmark_live_data.mjs` compares the existing static 64 KiB chunk path with exact-length R2 range reads using the built archive and deterministic 16 KiB ranges. This is a local byte-amplification benchmark, not an edge-latency or billed-cost measurement. For production latency/cost measurement, run repeated ranges against the deployed Worker and inspect Cloudflare Analytics for Worker invocations/CPU, Durable Object requests, R2 Class B reads, and R2 stored bytes. Do not run a production data sync or deploy as part of local validation.
