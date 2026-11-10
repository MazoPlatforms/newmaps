import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createSignedHeaders } from '../src/live-data-auth.mjs';
import { buildLiveDataManifest, syncLiveData } from './cloudflare-live-data-sync.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist');
const fixturePath = join(dist, 'data', 'e2e-live-deletion-fixture.json');
const citiesPath = join(dist, 'data', 'cities.json');
const persistence = await mkdtemp(join(tmpdir(), 'mazo-workers-e2e-'));
const secret = randomBytes(32).toString('hex');
const portProbe = createServer();
await new Promise((resolveListen, reject) => {
  portProbe.once('error', reject);
  portProbe.listen(0, '127.0.0.1', resolveListen);
});
const port = portProbe.address().port;
await new Promise((resolveClose, reject) => portProbe.close((error) => error ? reject(error) : resolveClose()));
const baseUrl = `http://127.0.0.1:${port}/`;
const worker = spawn(process.execPath, [
  join(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port),
  '--persist-to', persistence, '--var', `LIVE_DATA_HMAC_SECRET:${secret}`, '--log-level', 'error',
], { cwd: root, env: { ...process.env, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
const workerLogs = [];
worker.stdout.on('data', (chunk) => workerLogs.push(chunk.toString()));
worker.stderr.on('data', (chunk) => workerLogs.push(chunk.toString()));
const browserErrors = [];
let browser;
let originalCities;
let fixtureCreated = false;

function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

async function waitForWorker() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (worker.exitCode !== null) throw new Error(`Wrangler exited early: ${workerLogs.join('').slice(-5000)}`);
    try {
      const response = await fetch(new URL('api/version', baseUrl));
      if (response.ok) return response;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Wrangler did not become ready: ${workerLogs.join('').slice(-5000)}`);
}

async function synchronize(revision, runNumber) {
  const manifest = await buildLiveDataManifest(dist, { revision, runNumber, updatedAt: new Date().toISOString() });
  const result = await syncLiveData({ root: dist, manifest, baseUrl, secret });
  return { manifest, result };
}

async function readJson(path) {
  const response = await fetch(new URL(path, baseUrl), { headers: { Accept: 'application/json' } });
  assert.equal(response.status, 200, `${path} must return 200`);
  return response.json();
}

try {
  await waitForWorker();
  const startup = await fetch(new URL('api/version', baseUrl));
  assert.equal((await startup.json()).revision, 'bootstrap');

  const initialCities = await readFile(citiesPath);
  originalCities = initialCities;
  await writeFile(fixturePath, JSON.stringify({ e2e: true, version: 1 }));
  fixtureCreated = true;

  const first = await synchronize('a'.repeat(40), 1);
  assert.equal(first.result.changed.length, Object.keys(first.manifest.files).length, 'first sync seeds the complete initial dataset');
  assert.equal(first.result.deleted.length, 0);
  const published1 = await readJson('api/version');
  assert.equal(published1.revision, 'a'.repeat(40));
  const rideSearch = await fetch(new URL('api/v1/places/search?q=Noor%20Accessories%20Showroom&limit=2', baseUrl));
  assert.equal(rideSearch.status, 200, 'versioned RideNow place search is available after initial sync');
  assert.equal(rideSearch.headers.get('access-control-allow-origin'), '*');
  assert.equal(rideSearch.headers.get('x-mazo-api-version'), 'v1');
  assert.equal((await rideSearch.json()).results[0].name, 'Noor Accessories Showroom');
  const rideGeocode = await fetch(new URL('api/v1/geocode?q=Noor%20Accessories%20Showroom', baseUrl));
  assert.equal(rideGeocode.status, 200);
  assert.equal((await rideGeocode.json()).features[0].geometry.type, 'Point');
  const routeGraph = JSON.parse(await readFile(join(dist, 'generated/kattankudy-routing.json'), 'utf8'));
  const firstSegment = routeGraph.segments.find((row) => (row[3] | row[4]) & 1);
  const start = routeGraph.nodes[firstSegment[0]];
  const finish = routeGraph.nodes[firstSegment[1]];
  const rideRoute = await fetch(new URL('api/v1/route', baseUrl), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start_lon: start[0], start_lat: start[1], end_lon: finish[0], end_lat: finish[1], profile: 'driving' }),
  });
  assert.equal(rideRoute.status, 200, 'versioned RideNow routing uses the current published Kattankudy graph');
  assert.equal((await rideRoute.json()).profile, 'driving');
  const productionApiSmoke = JSON.parse(execFileSync(process.execPath,
    [join(root, 'scripts/cloudflare-live-api-smoke.mjs')], {
      cwd: root, encoding: 'utf8', env: { ...process.env, MAZO_WORKERS_URL: baseUrl },
    }));
  assert.equal(productionApiSmoke.status, 'PASS');
  const unauthorized = await fetch(new URL('api/admin/plan', baseUrl), { method: 'POST', body: '{}' });
  assert.equal(unauthorized.status, 401, 'unsigned synchronization requests are rejected');
  const replayBody = new TextEncoder().encode(JSON.stringify({ manifest: first.manifest }));
  const replayPath = '/api/admin/plan';
  const replayHeaders = await createSignedHeaders({ secret, method: 'POST', pathname: replayPath, body: replayBody,
    nonce: '1234567890abcdef1234567890abcdef' });
  replayHeaders['Content-Type'] = 'application/json';
  const replayRequest = new Request(new URL(replayPath, baseUrl), { method: 'POST', headers: replayHeaders, body: replayBody });
  const acceptedReplay = await fetch(replayRequest.clone());
  const rejectedReplay = await fetch(replayRequest.clone());
  assert.equal(acceptedReplay.status, 200);
  assert.equal(rejectedReplay.status, 401, 'the SQLite Durable Object consumes a signed nonce exactly once');
  const privateChunk = await fetch(new URL('generated/places-pmtiles-chunks/00000.bin', baseUrl));
  assert.equal(privateChunk.status, 404, 'internal static chunk files remain private');

  const archivePath = 'generated/places.pmtiles';
  const archiveEntry = first.manifest.files[archivePath];
  const archiveUrl = new URL(`api/data/${archivePath}?v=${archiveEntry.sha256}&bytes=${archiveEntry.bytes}`, baseUrl);
  const archiveResponse = await fetch(archiveUrl);
  assert.equal(archiveResponse.status, 200, 'full PMTiles object is retrievable from local R2');
  const archiveBytes = new Uint8Array(await archiveResponse.arrayBuffer());
  assert.equal(hash(archiveBytes), archiveEntry.sha256, 'full R2 PMTiles bytes match the GitHub build SHA-256');
  for (const [range, expected] of [['bytes=13-411', 'bytes 13-411/'], ['bytes=-517', `bytes ${archiveEntry.bytes - 517}-${archiveEntry.bytes - 1}/`]]) {
    const response = await fetch(archiveUrl, { headers: { Range: range } });
    assert.equal(response.status, 206, `${range} returns 206`);
    assert.ok(response.headers.get('content-range')?.startsWith(expected), `${range} has the correct Content-Range`);
    const payload = new Uint8Array(await response.arrayBuffer());
    assert.ok(payload.byteLength > 0);
    const requestedLength = range === 'bytes=13-411' ? 399 : 517;
    assert.equal(payload.byteLength, requestedLength);
    const start = range === 'bytes=13-411' ? 13 : archiveEntry.bytes - 517;
    assert.deepEqual(payload, archiveBytes.slice(start, start + requestedLength));
  }
  const etagVersion = await fetch(new URL('api/version', baseUrl), { headers: { 'If-None-Match': `"${'a'.repeat(40)}"` } });
  assert.equal(etagVersion.status, 304, 'unchanged version polling is conditional and bodyless');

  const browserBuild = JSON.parse(await readFile(join(dist, 'generated/search-index.json'), 'utf8'));
  const nameColumn = browserBuild.fields.indexOf('name');
  const coordColumn = browserBuild.fields.indexOf('coordinates');
  const idColumn = browserBuild.fields.indexOf('id');
  const browserPlace = browserBuild.records.find((row) => row[nameColumn] === 'Noor Accessories Showroom');
  assert.ok(browserPlace, 'browser E2E fixture exists in the source search index');

  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'allow' });
  const page = await context.newPage();
  await page.addInitScript(() => { globalThis.__MAZO_LIVE_DATA_TEST_POLL_MS = 250; });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText;
    if (failure && failure !== 'net::ERR_ABORTED') browserErrors.push(`${failure}: ${request.url()}`);
  });
  const rangeResponses = [];
  const staleTileResponses = new Set();
  const basemapTileResponses = new Map();
  page.on('response', (response) => {
    if (response.url().includes('/api/v1/basemap/tiles/') && new URL(response.url()).pathname.endsWith('.pbf')) {
      basemapTileResponses.set(response.url(), response.body().then((body) => ({
        status: response.status(), contentType: response.headers()['content-type'],
        contentEncoding: response.headers()['content-encoding'], bodyBytes: body.byteLength,
        prefix: [...body.slice(0, 4)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      })).catch((error) => ({ bodyError: error.message })));
    }
    if (response.status() === 409 && /\/api\/v1\/(?:basemap\/)?tiles\/\d+\/\d+\/\d+\.pbf\?revision=/.test(response.url())) {
      staleTileResponses.add(response.url());
    }
    if (response.url().includes('/api/data/generated/places.pmtiles')) rangeResponses.push({ status: response.status(), contentRange: response.headers()['content-range'] });
  });
  await page.goto(`${baseUrl}?map-test=1&live-data-test=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((revision) => window.__MAZO_LIVE_DATA_VERSION__?.revision === revision, 'a'.repeat(40), { timeout: 120_000 });
  await page.waitForFunction(() => window.__MAZO_MAP_TEST__?.isStyleLoaded()
    && window.__MAZO_MAP_TEST__?.getSource('mazo-pois')?.type === 'vector'
    && document.querySelector('#search-status')?.hidden, null, { timeout: 120_000 });
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 30_000 });
  const cacheRead = await page.evaluate(async () => {
    const stale = await caches.open('mazo-offline-pack-stale-fixture');
    await stale.put(new URL('./api/version', location.href), Response.json({ format: 'MazoLiveData/1', revision: 'stale-cache' }));
    await stale.put(new URL('./api/manifest', location.href), Response.json({ format: 'MazoLiveData/1', revision: 'stale-cache', files: {} }));
    const [versionResponse, manifestResponse] = await Promise.all([
      fetch('./api/version', { cache: 'no-store' }), fetch('./api/manifest', { cache: 'no-store' }),
    ]);
    const [version, manifest] = await Promise.all([versionResponse.json(), manifestResponse.json()]);
    await caches.delete('mazo-offline-pack-stale-fixture');
    return { version, manifest, versionCacheControl: versionResponse.headers.get('cache-control'), manifestCacheControl: manifestResponse.headers.get('cache-control') };
  });
  assert.equal(cacheRead.version.revision, 'a'.repeat(40), 'stale service-worker version entries are bypassed');
  assert.equal(cacheRead.manifest.revision, 'a'.repeat(40), 'stale service-worker manifest entries are bypassed');
  assert.equal(cacheRead.versionCacheControl, 'no-store');
  assert.equal(cacheRead.manifestCacheControl, 'no-store');
  assert.ok(rangeResponses.some(({ status, contentRange }) => status === 206 && /^bytes \d+-\d+\/\d+$/.test(contentRange || '')),
    'live PMTiles source is served with R2 range responses');

  const poiStyle = await page.evaluate(() => {
    const map = window.__MAZO_MAP_TEST__;
    return {
      markers: document.querySelectorAll('.maplibregl-marker').length,
      source: map.getSource('mazo-pois')?.type,
      layers: map.getStyle().layers.filter((layer) => ['mazo-poi-major', 'mazo-poi-district', 'mazo-poi-local'].includes(layer.id)),
    };
  });
  assert.equal(poiStyle.source, 'vector', 'ordinary POIs use the PMTiles vector source');
  assert.equal(poiStyle.markers, 0, 'place POIs are not floating DOM markers');
  assert.equal(poiStyle.layers.length, 3);
  for (const layer of poiStyle.layers) {
    assert.equal(layer.type, 'symbol');
    assert.equal(layer.source, 'mazo-pois');
    assert.equal(layer['source-layer'], 'places');
    assert.equal(layer.layout['icon-anchor'], 'bottom', 'the map-pin tip anchors to its tile point');
    assert.equal(layer.layout['icon-allow-overlap'], false, 'pins participate in collision placement');
    assert.equal(layer.layout['text-allow-overlap'], false, 'labels participate in collision placement');
    assert.deepEqual(layer.layout['symbol-sort-key'], ['get', 'priority'], 'important MVT POIs receive collision priority');
    assert.equal(layer.layout['symbol-z-order'], 'auto');
    assert.ok(Number.isFinite(layer.minzoom), 'each vector symbol tier has an explicit zoom threshold');
  }
  assert.deepEqual(Object.fromEntries(poiStyle.layers.map(({ id, minzoom }) => [id, minzoom])), {
    'mazo-poi-major': 6.2, 'mazo-poi-district': 8.6, 'mazo-poi-local': 12.4,
  }, 'POI tiers appear at their configured zoom levels');
  await page.evaluate((coords) => window.__MAZO_MAP_TEST__.jumpTo({ center: coords, zoom: 17, bearing: 0, pitch: 0 }), browserPlace[coordColumn]);
  await page.waitForFunction((id) => !window.__MAZO_MAP_TEST__.isMoving()
    && window.__MAZO_MAP_TEST__.queryRenderedFeatures(undefined, { layers: ['mazo-poi-major', 'mazo-poi-district', 'mazo-poi-local'] })
      .some((feature) => String(feature.properties.id) === id), browserPlace[idColumn], { timeout: 60_000 });
  const projectedPlace = await page.evaluate((coords) => window.__MAZO_MAP_TEST__.project(coords), browserPlace[coordColumn]);
  await page.mouse.click(projectedPlace.x, projectedPlace.y);
  await page.waitForFunction(() => !document.querySelector('#place-sheet').hidden, null, { timeout: 10_000 });
  assert.match(await page.locator('#place-title').innerText(), /Noor Accessories Showroom/,
    'clicking the projected MVT pin point opens the existing place detail sheet');
  await page.locator('#map-search').fill('Noor Accessories Showroom');
  await page.waitForSelector('#search-results [role="option"]');
  assert.match(await page.locator('#search-results [role="option"] strong').first().innerText(), /Noor Accessories/,
    'R2-backed live search index remains usable');

  const axePath = join(root, 'node_modules/axe-core/axe.min.js');
  await page.addScriptTag({ path: axePath });
  const a11y = await page.evaluate(async () => {
    const report = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
    return report.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map((node) => node.target) }));
  });
  assert.deepEqual(a11y, [], 'live-sync homepage/place-detail state passes axe WCAG checks');

  const cities = JSON.parse(initialCities.toString('utf8'));
  cities.count += 1;
  cities.cities.push({ name: 'Mazo E2E Sync Marker', coordinates: { longitude: 81.731, latitude: 7.681 }, level: 'locality', source_id: 'test-only' });
  await writeFile(citiesPath, `${JSON.stringify(cities, null, 2)}\n`);
  await unlink(fixturePath);
  fixtureCreated = false;
  const second = await synchronize('b'.repeat(40), 2);
  assert.deepEqual(second.result.changed, ['data/cities.json'], 'second sync uploads only the edited data file');
  assert.deepEqual(second.result.deleted, ['data/e2e-live-deletion-fixture.json'], 'second sync publishes deleted-file tombstones');
  await page.waitForFunction((revision) => window.__MAZO_LIVE_DATA_VERSION__?.revision === revision, 'b'.repeat(40), { timeout: 30_000 });
  const manifest2 = await readJson('api/manifest');
  assert.equal(manifest2.revision, 'b'.repeat(40));
  assert.equal(Object.hasOwn(manifest2.files, 'data/e2e-live-deletion-fixture.json'), false);
  const cityVersion2 = manifest2.files['data/cities.json'];
  assert.notEqual(cityVersion2.sha256, first.manifest.files['data/cities.json'].sha256,
    'changed bytes receive a new content address so immutable browser/CDN caches cannot shadow updates');
  const unexpectedBrowserErrors = browserErrors.filter((error) => ![...staleTileResponses].some((url) => error.includes(url)));
  if (unexpectedBrowserErrors.length) {
    const failingTileDetails = await Promise.all([...basemapTileResponses].map(async ([url, result]) => [url, await result]));
    assert.fail(`live update browser errors: ${unexpectedBrowserErrors.join(' | ')}\nBasemap tile responses: ${JSON.stringify(failingTileDetails)}`);
  }

  await writeFile(citiesPath, initialCities);
  const rollback = await synchronize('c'.repeat(40), 3);
  assert.deepEqual(rollback.result.changed, ['data/cities.json']);
  assert.deepEqual(rollback.result.uploaded, [], 'rollback reuses the immutable R2 object already retained from the previous version');
  assert.equal(rollback.result.deleted.length, 0);
  await page.waitForFunction((revision) => window.__MAZO_LIVE_DATA_VERSION__?.revision === revision, 'c'.repeat(40), { timeout: 30_000 });
  const rolledBackManifest = await readJson('api/manifest');
  assert.equal(rolledBackManifest.files['data/cities.json'].sha256, first.manifest.files['data/cities.json'].sha256,
    'rollback republishes the prior GitHub content hash under a newer atomic revision');

  console.log(JSON.stringify({
    status: 'PASS',
    runtime: 'wrangler dev --local with SQLite Durable Object and emulated R2 bindings',
    initial_files: first.result.file_count,
    initial_bytes_uploaded: first.result.uploaded.reduce((sum, path) => sum + first.manifest.files[path].bytes, 0),
    incremental_changed: second.result.changed,
    incremental_deleted: second.result.deleted,
    rollback_revision: rollback.result.revision,
    rollback_uploaded: rollback.result.uploaded,
    pmtiles_sha256: archiveEntry.sha256,
    range_responses: rangeResponses.length,
    conditional_poll: etagVersion.status,
    ridenow_api: { search: rideSearch.status, geocode: rideGeocode.status, route: rideRoute.status },
    unsigned_admin_request: unauthorized.status,
    replayed_admin_request: rejectedReplay.status,
    private_chunk: privateChunk.status,
    browser_a11y_violations: a11y.length,
    browser_errors: unexpectedBrowserErrors.length,
    stale_tile_responses_during_update: staleTileResponses.size,
    poi_vector_source: poiStyle.source,
    browser_revision: 'c'.repeat(40),
  }, null, 2));
  await context.close();
} catch (error) {
  console.error(`Live-data E2E failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  console.error(workerLogs.join('').slice(-6000));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (originalCities) await writeFile(citiesPath, originalCities).catch(() => {});
  if (fixtureCreated) await unlink(fixturePath).catch(() => {});
  worker.kill('SIGTERM');
  await new Promise((resolveExit) => {
    if (worker.exitCode !== null) return resolveExit();
    worker.once('exit', resolveExit);
    setTimeout(resolveExit, 5_000).unref();
  });
  await rm(persistence, { recursive: true, force: true });
}
