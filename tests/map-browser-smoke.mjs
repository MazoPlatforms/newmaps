import assert from 'node:assert/strict';
import { createReadStream, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import worker from '../src/worker-core.mjs';
import { buildLiveDataManifest } from '../scripts/cloudflare-live-data-sync.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const screenshotDir = process.env.MAZO_SCREENSHOTS_DIR;
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.mzp': 'application/geo+json',
  '.pmtiles': 'application/vnd.pmtiles', '.svg': 'image/svg+xml', '.png': 'image/png',
};
const searchFixture = JSON.parse(readFileSync(resolve(root, 'generated/search-index.json'), 'utf8'));
const idColumn = searchFixture.fields.indexOf('id');
const nameColumn = searchFixture.fields.indexOf('name');
const coordinatesColumn = searchFixture.fields.indexOf('coordinates');
const searchFixturePlace = searchFixture.records.find((record) => record[nameColumn] === 'Noor Accessories Showroom');
assert.ok(searchFixturePlace, 'synthetic workflow fixture must be present in the generated search index');
const expectedPlaceId = searchFixturePlace[idColumn];
const distRoot = resolve(root, 'dist');
const liveDataRoot = resolve(root, '.build/live-data');
const publishedFixtureManifest = await buildLiveDataManifest(liveDataRoot, {
  revision: 'a'.repeat(40), artifactRevision: 'b'.repeat(40), runNumber: 1,
});
const bootstrapManifest = { ...publishedFixtureManifest, revision: 'bootstrap', run_number: 0 };
const assets = { fetch: async (request) => {
  const url = new URL(request.url);
  const decodedPath = decodeURIComponent(url.pathname);
  if (decodedPath.split(/[\\/]/).includes('..') || decodedPath.includes('\\')) return new Response(null, { status: 403 });
  if (decodedPath === '/generated/live-data-manifest.json') return Response.json(bootstrapManifest);
  const target = resolve(distRoot, `.${decodedPath}`);
  if (target !== distRoot && !target.startsWith(`${distRoot}${sep}`)) return new Response(null, { status: 403 });
  let bytes;
  try { bytes = readFileSync(target); }
  catch {
    const fallback = resolve(liveDataRoot, `.${decodedPath}`);
    try {
      if (fallback.startsWith(`${liveDataRoot}${sep}`)) bytes = readFileSync(fallback);
      else throw new Error('outside live-data fixture');
    } catch {
      const generatedFallback = resolve(root, `.${decodedPath}`);
      try {
        if (generatedFallback.startsWith(`${resolve(root, 'generated')}${sep}`)) bytes = readFileSync(generatedFallback);
        else return new Response(null, { status: 404 });
      } catch { return new Response(null, { status: 404 }); }
    }
  }
  const headers = new Headers({ 'Content-Length': String(bytes.length), 'Content-Type': contentTypes[extname(target)] || 'application/octet-stream' });
  const range = request.headers.get('range');
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.length}` } });
    const start = Number(match[1]); const end = Math.min(match[2] ? Number(match[2]) : bytes.length - 1, bytes.length - 1);
    if (start >= bytes.length || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.length}` } });
    headers.set('Content-Range', `bytes ${start}-${end}/${bytes.length}`); headers.set('Content-Length', String(end - start + 1));
    return new Response(bytes.subarray(start, end + 1), { status: 206, headers });
  }
  return new Response(request.method === 'HEAD' ? null : bytes, { status: 200, headers });
} };
const env = { ASSETS: assets, LIVE_DATA_REGISTRY: { getByName: () => ({ fetch: async () => new Response(null, { status: 404 }) }) },
  DATA_BUCKET: { get: async (key, options) => {
    const [, sha256, pathHex] = key.split('/');
    const path = new TextDecoder().decode(Uint8Array.from(pathHex.match(/../g) || [], (byte) => Number.parseInt(byte, 16)));
    const file = resolve(liveDataRoot, path);
    if (!file.startsWith(`${liveDataRoot}${sep}`)) return null;
    let data;
    try { data = readFileSync(file); } catch { return null; }
    const offset = options?.range?.offset ?? 0;
    const length = options?.range?.length ?? data.byteLength;
    return { size: data.byteLength, body: data.subarray(offset, offset + length),
      customMetadata: { sha256, path } };
  } },
  GITHUB_DATA_FETCH: async (input, options = {}) => {
    const url = new URL(input);
    const path = url.pathname.split('/').slice(2).join('/');
    const file = resolve(liveDataRoot, path);
    if (!file.startsWith(`${liveDataRoot}${sep}`)) return new Response(null, { status: 404 });
    let data;
    try { data = readFileSync(file); } catch { return new Response(null, { status: 404 }); }
    const range = options.headers?.get('Range');
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) return new Response(null, { status: 416 });
      const start = Number(match[1]); const end = Math.min(match[2] ? Number(match[2]) : data.byteLength - 1, data.byteLength - 1);
      if (start >= data.byteLength || end < start) return new Response(null, { status: 416 });
      return new Response(data.subarray(start, end + 1), { status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/${data.byteLength}` } });
    }
    return new Response(data, { headers: { 'Content-Type': 'application/json' } });
  },
};
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (pathname.startsWith('/api/')) {
    try {
      // Preserve the browser-visible loopback host and port in Worker-generated
      // style, TileJSON, sprite, and glyph URLs; otherwise those URLs point at a
      // different localhost origin and the browser cannot reach this harness.
      const workerOrigin = `http://${request.headers.host || 'localhost'}`;
      const result = await worker.fetch(new Request(new URL(request.url, workerOrigin), {
        method: request.method, headers: request.headers,
      }), env);
      response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
      response.end(request.method === 'HEAD' ? undefined : Buffer.from(await result.arrayBuffer()));
    } catch (error) { response.writeHead(500).end(String(error)); }
    return;
  }
  const target = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end();
    return;
  }
  let size;
  try { size = statSync(target).size; } catch { response.writeHead(404).end(); return; }
  const headers = {
    'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store', 'Content-Type': contentTypes[extname(target)] || 'application/octet-stream',
  };
  const range = request.headers.range;
  if (!range && ['.mzp', '.json', '.js', '.mjs', '.css'].includes(extname(target)) && /\bgzip\b/.test(request.headers['accept-encoding'] || '')) {
    const compressed = gzipSync(readFileSync(target));
    headers['Content-Encoding'] = 'gzip';
    headers.Vary = 'Accept-Encoding';
    headers['Content-Length'] = compressed.length;
    response.writeHead(200, headers);
    response.end(compressed);
    return;
  }
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
    const start = Number(match[1]);
    const end = Math.min(match[2] ? Number(match[2]) : size - 1, size - 1);
    if (start >= size || end < start) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    headers['Content-Length'] = end - start + 1;
    response.writeHead(206, headers);
    createReadStream(target, { start, end }).pipe(response);
    return;
  }
  headers['Content-Length'] = size;
  response.writeHead(200, headers);
  createReadStream(target).pipe(response);
});
const wait = (page, predicate, timeout = 120_000, argument = undefined) => page.waitForFunction(predicate, argument, { timeout });

await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  for (const mode of ['pmtiles', 'pmtiles-retry']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
      isMobile: true, hasTouch: true, colorScheme: 'light',
      // Let Playwright deterministically intercept the single injected failure;
      // offline service-worker behavior is covered in its own context below.
      serviceWorkers: mode === 'pmtiles-retry' ? 'block' : 'allow',
    });
    await context.grantPermissions([], { origin: `http://127.0.0.1:${server.address().port}` });
    const page = await context.newPage();
    const errors = [];
    const ranges = [];
    const speedRequests = [];
    const styleRequests = [];
    const thirdPartyMapRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('requestfailed', (request) => {
      const failure = request.failure()?.errorText || 'unknown';
      // MapLibre cancels obsolete tile requests during camera moves and theme
      // updates; only actual network failures belong in the browser error list.
      if (failure !== 'net::ERR_ABORTED') errors.push(`REQUEST FAILED ${request.url()}: ${failure}`);
    });
    page.on('console', (message) => {
      if (message.type() === 'error'
        && !(mode === 'pmtiles-retry' && message.text().includes('503'))) errors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.url().includes('/generated/places.pmtiles')) ranges.push({ status: response.status(), contentRange: response.headers()['content-range'] || null });
      if (response.status() >= 400 && !(mode === 'pmtiles-retry' && response.status() === 503 && response.url().includes('/generated/places.pmtiles'))) {
        errors.push(`HTTP ${response.status()} ${response.url()}`);
      }
    });
    page.on('request', (request) => {
      if (request.url().includes('speed-limits')) speedRequests.push(request.url());
      if (request.url().includes('/api/v1/style')) styleRequests.push(request.url());
      if (/tiles\.openfreemap\.org|fonts\.(googleapis|gstatic)\.com|router\.project-osrm\.org|routing\.openstreetmap\.de/i.test(request.url())) thirdPartyMapRequests.push(request.url());
    });
    if (mode === 'pmtiles-retry') {
      let firstArchiveRequest = true;
      await page.route('**/generated/places.pmtiles*', (route) => {
        if (firstArchiveRequest) { firstArchiveRequest = false; return route.fulfill({ status: 503, body: 'temporary archive error' }); }
        return route.continue();
      });
    }
    const started = Date.now();
    await page.goto(`${origin}/?map-test=1`, { waitUntil: 'domcontentloaded' });
    if (mode === 'pmtiles-retry') {
      await wait(page, () => !document.querySelector('#places-retry').hidden);
      assert.equal(await page.evaluate(() => window.__MAZO_MAP_TEST__.getSource('mazo-pois')), null,
        'failed PMTiles must not silently fall back to GeoJSON/MZP');
      await page.locator('#places-retry').click();
    }
    try {
      await wait(page, () => window.__MAZO_MAP_TEST__?.isStyleLoaded() && document.querySelector('#map-frame')?.dataset.state === 'ready');
    } catch (error) {
      console.error(`Map startup failed (${mode}); browser evidence: ${JSON.stringify(errors)}`);
      throw error;
    }
    await wait(page, () => document.querySelectorAll('.categories button').length > 2 && document.querySelector('#search-status').hidden, 90_000);
    await wait(page, () => window.__MAZO_MAP_TEST__.queryRenderedFeatures(undefined, { layers: ['places-dot'] }).length > 0, 30_000);
    const bootstrapPoiSource = await page.evaluate(() => ({
      type: window.__MAZO_MAP_TEST__.getSource('mazo')?.type,
      layer: window.__MAZO_MAP_TEST__.getLayer('places-dot')?.id,
    }));
    assert.equal(bootstrapPoiSource.type, 'vector', 'place PBF source is part of the initial map style');
    assert.equal(bootstrapPoiSource.layer, 'places-dot', 'preloaded place features render before the PMTiles marker source initializes');
    assert.equal(await page.evaluate(() => new URL(location.href).searchParams.has('delivery')), false, 'production does not require a format flag');
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some((entry) => entry.name.includes('batticaloa-district.mzp'))), false,
      'production never requests a place MZP archive');
    assert.equal(speedRequests.length, 0, 'speed review data is deferred until street zoom');
    await wait(page, () => window.mazoPmtilesUrl !== null && window.mazoPmtilesUrl !== undefined);
    await wait(page, () => performance.getEntriesByType('resource').some((entry) => entry.name.includes('places.pmtiles')));
    assert.ok(ranges.some((entry) => entry.status === 206 && /^bytes \d+-\d+\/\d+$/.test(entry.contentRange || '')), 'PMTiles must use byte-range requests');
    const startupMs = Date.now() - started;
    const startupTransferBytes = await page.evaluate(() => performance.getEntriesByType('resource').reduce((total, entry) => total + (entry.transferSize || 0), 0));
    const startupHeapBytes = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
    const initialCamera = await page.evaluate(() => ({ zoom: window.__MAZO_MAP_TEST__.getZoom(), bearing: window.__MAZO_MAP_TEST__.getBearing(), pitch: window.__MAZO_MAP_TEST__.getPitch() }));
    assert.equal(initialCamera.bearing, 0);
    assert.equal(initialCamera.pitch, 0);
    const interactionOptions = await page.evaluate(() => ({
      dragRotate: window.__MAZO_MAP_TEST__.isDragRotateEnabled(),
      touchZoomRotate: window.__MAZO_MAP_TEST__.isTouchZoomRotateEnabled(),
      minimumZoom: window.__MAZO_MAP_TEST__.getMinZoom(),
    }));
    assert.equal(interactionOptions.dragRotate, false);
    assert.equal(interactionOptions.touchZoomRotate, true);
    assert.equal(interactionOptions.minimumZoom, 0);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    assert.match(await page.locator('#network-status').innerText(), /offline/i);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    assert.equal(await page.locator('#network-status').isHidden(), true);
    const fixtureCoordinates = searchFixturePlace[coordinatesColumn];
    await context.grantPermissions(['geolocation'], { origin: `http://127.0.0.1:${server.address().port}` });
    await context.setGeolocation({ latitude: fixtureCoordinates[1], longitude: fixtureCoordinates[0] });
    await page.locator('#map-locate').click();
    await wait(page, () => document.querySelector('.user-location-dot'), 18_000);
    const nearbyStatus = await page.locator('#search-status').innerText();
    const nearbyResults = await page.locator('#search-results [role="option"]').count();
    assert.ok(/within 10 km/i.test(nearbyStatus) || nearbyResults > 0,
      'permitted geolocation should activate nearby place discovery');
    await wait(page, () => !window.__MAZO_MAP_TEST__.isMoving(), 15_000);
    await context.grantPermissions([], { origin: `http://127.0.0.1:${server.address().port}` });
    await page.evaluate(() => window.__MAZO_MAP_TEST__.jumpTo({ center: [81.5569, 7.8381], zoom: 8.6, bearing: 0, pitch: 0 }));
    if (mode === 'pmtiles' && screenshotDir) {
      mkdirSync(screenshotDir, { recursive: true });
      const scenes = [
        ['world', [0, 0], 0.55], ['sri-lanka', [80.7, 7.8], 6.3],
        ['eastern-province', [81.5, 7.7], 8], ['batticaloa-district', [81.7, 7.7], 9],
        ['batticaloa-coast', [81.75, 7.7], 10.5], ['kattankudy-surroundings', [81.73, 7.68], 11.5],
        ['kattankudy-street-network', [81.7337, 7.6831], 15], ['victory-ground-deen-road', [81.7389, 7.6766], 16],
      ];
      for (const [name, center, zoom] of scenes) {
        await page.evaluate(({ center, zoom }) => window.__MAZO_MAP_TEST__.jumpToWhenIdle({ center, zoom, bearing: 0, pitch: 0 }), { center, zoom });
        await page.waitForTimeout(250);
        const visible = await page.evaluate(() => {
          const map = window.__MAZO_MAP_TEST__;
          const style = map.getStyle();
          const layersFor = (sourceLayer, type = null) => style.layers.filter((layer) => (!type || layer.type === type) && layer['source-layer'] === sourceLayer).map((layer) => layer.id);
          const count = (layers) => layers.reduce((sum, id) => sum + map.queryRenderedFeatures(undefined, { layers: [id] }).length, 0);
          const placeLayers = layersFor('place', 'symbol');
          const boundaryLayers = style.layers.filter((layer) => layer.type === 'line' && layer['source-layer'] === 'boundary').map((layer) => layer.id);
          return {
            zoom: map.getZoom(),
            mazoPoiFeatures: map.queryRenderedFeatures(undefined, { layers: ['mazo-poi-major', 'mazo-poi-district', 'mazo-poi-local'] }).length,
            geographicPlaceLabels: count(placeLayers),
            roadFeatures: count(layersFor('transportation', 'line')),
            buildingFeatures: count(layersFor('building')),
            landcoverFeatures: count(layersFor('landcover', 'fill')),
            landuseFeatures: count(layersFor('landuse', 'fill')),
            waterFeatures: count(layersFor('water', 'fill')),
            boundaryFeatures: map.queryRenderedFeatures(undefined, { layers: boundaryLayers }).filter((feature) => feature.properties.maritime === 1).length,
          };
        });
        if (name === 'kattankudy-street-network' || name === 'victory-ground-deen-road') {
          assert.ok(visible.roadFeatures > 0, `${name} should expose road geometry at street zoom`);
          assert.ok(visible.buildingFeatures > 0, `${name} should expose building footprints at street zoom`);
        }
        await page.screenshot({ path: `${screenshotDir}/${name}-light.png` });
      }
      await page.evaluate(() => window.__MAZO_MAP_TEST__.jumpToWhenIdle({ center: [81.5569, 7.8381], zoom: 8.6, bearing: 0, pitch: 0 }));
    }
    await page.locator('#map canvas').focus();
    await page.keyboard.press('Shift+ArrowRight');
    await page.mouse.move(160, 190);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(230, 230, { steps: 3 });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(100);
    const attemptedRotationBearing = await page.evaluate(() => window.__MAZO_MAP_TEST__.getBearing());
    assert.equal(attemptedRotationBearing, 0, 'keyboard and mouse rotation attempts leave the map north-up');
    const beforeWheelZoom = await page.evaluate(() => window.__MAZO_MAP_TEST__.getZoom());
    // Nearby discovery keeps a results panel open over the left side of the map;
    // use the unobscured right-side canvas for the wheel-zoom assertion.
    await page.mouse.move(350, 450);
    await page.mouse.wheel(0, -240);
    await wait(page, (zoom) => window.__MAZO_MAP_TEST__.getZoom() > zoom + 0.1, 10_000, beforeWheelZoom);
    const afterWheelZoom = await page.evaluate(() => window.__MAZO_MAP_TEST__.getZoom());

    await page.locator('#theme-toggle').click();
    await wait(page, () => document.documentElement.dataset.theme === 'dark'
      && window.__MAZO_MAP_TEST__?.isStyleLoaded()
      && (() => { const color = String(window.__MAZO_MAP_TEST__?.getPaintProperty('background', 'background-color')).replace(/\s/g, '').toLowerCase(); return color.includes('#102b3a') || color.includes('16,43,58'); })()
      && window.__MAZO_MAP_TEST__?.getLayer('mazo-poi-selected')
      && window.__MAZO_MAP_TEST__?.getSource('mazo-selected-place')?.type === 'geojson', 60_000);
    assert.equal(styleRequests.length, 1, 'theme switching changes basemap paint without reloading the style');
    assert.deepEqual(thirdPartyMapRequests, [], 'map cartography, glyphs, sprites, tiles, and routing avoid third-party runtime requests');
    const themedColors = await page.evaluate(() => ({
      ocean: window.__MAZO_MAP_TEST__.getPaintProperty('background', 'background-color'),
      land: window.__MAZO_MAP_TEST__.getPaintProperty('mazo-country-land', 'fill-color'),
    }));
    assert.ok(String(themedColors.ocean).replace(/\s/g, '').toLowerCase().includes('#102b3a') || String(themedColors.ocean).includes('16,43,58'), `dark ocean should use Mazo water palette, received ${JSON.stringify(themedColors.ocean)}`);
    assert.ok(String(themedColors.land).replace(/\s/g, '').toLowerCase().includes('#202d32') || String(themedColors.land).includes('32,45,50'), `dark country fill should use Mazo land palette, received ${JSON.stringify(themedColors.land)}`);
    const opacities = await page.evaluate(() => ['mazo-poi-major', 'mazo-poi-district', 'mazo-poi-local', 'mazo-poi-selected']
      .map((id) => [id, window.__MAZO_MAP_TEST__.getPaintProperty(id, 'icon-opacity'), window.__MAZO_MAP_TEST__.getPaintProperty(id, 'text-opacity')]));
    for (const [id, iconOpacity, textOpacity] of opacities) {
      assert.equal(iconOpacity, 1, `${id} icon opacity`);
      assert.equal(textOpacity, 1, `${id} label opacity`);
    }
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    assert.equal(theme, 'dark');
    if (mode === 'pmtiles' && screenshotDir) {
      const darkScenes = [
        ['world', [0, 0], 0.55], ['sri-lanka', [80.7, 7.8], 6.3],
        ['eastern-province', [81.5, 7.7], 8], ['batticaloa-district', [81.7, 7.7], 9],
        ['batticaloa-coast', [81.75, 7.7], 10.5], ['kattankudy-surroundings', [81.73, 7.68], 11.5],
        ['kattankudy-street-network', [81.7337, 7.6831], 15], ['victory-ground-deen-road', [81.7389, 7.6766], 16],
      ];
      for (const [name, center, zoom] of darkScenes) {
        await page.evaluate(({ center, zoom }) => window.__MAZO_MAP_TEST__.jumpToWhenIdle({ center, zoom, bearing: 0, pitch: 0 }), { center, zoom });
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${screenshotDir}/${name}-dark.png` });
      }
      await page.evaluate(() => window.__MAZO_MAP_TEST__.jumpToWhenIdle({ center: [81.5569, 7.8381], zoom: 8.6, bearing: 0, pitch: 0 }));
    }

    const categoryButton = page.locator('.categories button').filter({ hasText: /Electronics/ }).first();
    await categoryButton.click();
    assert.equal(await categoryButton.getAttribute('aria-pressed'), 'true');
    const search = page.locator('#map-search');
    await search.fill('Noor Accessories Showroom');
    await wait(page, () => document.querySelector('#search-results [role="option"]'));
    const firstName = await page.locator('#search-results [role="option"] strong').first().innerText();
    assert.match(firstName, /Noor Accessories/);
    await page.locator('#search-results [role="option"]').first().click();
    await wait(page, () => !document.querySelector('#place-sheet').hidden);
    const selectedName = await page.locator('#place-title').innerText();
    assert.match(selectedName, /Noor Accessories/);
    await page.goBack();
    await wait(page, () => document.querySelector('#place-sheet').hidden, 10_000);
    await page.goForward();
    await wait(page, () => !document.querySelector('#place-sheet').hidden, 10_000);
    assert.match(await page.locator('#place-title').innerText(), /Noor Accessories/);
    const axeSource = readFileSync(resolve(root, 'node_modules/axe-core/axe.min.js'), 'utf8');
    await page.addScriptTag({ content: axeSource });
    const accessibility = await page.evaluate(async () => {
      const report = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
      return report.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.map(node => ({ target: node.target, html: node.html, summary: node.failureSummary })) }));
    });
    assert.deepEqual(accessibility, [], 'home and selected-place view should pass automated WCAG checks');
    await search.fill('Noor Accessories Showroom');
    await wait(page, () => document.querySelector('#search-results [role="option"]'));
    await page.locator('#search-results [role="option"]').first().click();
    await wait(page, () => !document.querySelector('#place-sheet').hidden, 10_000);
    await wait(page, () => window.__MAZO_MAP_TEST__?.getZoom() >= 15);
    await wait(page, (requests) => requests.some((url) => url.includes('speed-limits.mzp')), 30_000, speedRequests);
    assert.equal(speedRequests.filter((url) => url.includes('speed-limits.mzp')).length, 1, 'speed review dataset loads once on street zoom');
    try {
      await wait(page, (id) => !window.__MAZO_MAP_TEST__.isMoving() && window.__MAZO_MAP_TEST__.queryRenderedFeatures(undefined, { layers: ['mazo-poi-selected'] }).some((feature) => String(feature.properties.id) === String(id)), 30_000, expectedPlaceId);
    } catch (error) {
      const state = await page.evaluate(({ id, errors: browserErrors }) => {
        const map = window.__MAZO_MAP_TEST__;
        return {
          id, zoom: map.getZoom(), center: map.getCenter().toArray(), moving: map.isMoving(),
          selected: map.getSourceData('mazo-selected-place'),
          layer: map.getLayer('mazo-poi-selected'),
          visible: map.getLayoutProperty('mazo-poi-selected', 'visibility'),
          iconAvailable: map.hasImage('mazo-electronics'),
          styleLoaded: map.isStyleLoaded(), tilesLoaded: map.areTilesLoaded(),
          renderedAll: map.queryRenderedFeatures().slice(0, 6).map((feature) => ({ source: feature.source, layer: feature.layer.id, properties: feature.properties })),
          rendered: map.queryRenderedFeatures(undefined, { layers: ['mazo-poi-selected'] }).map((feature) => feature.properties),
          browserErrors,
        };
      }, { id: expectedPlaceId, errors });
      console.error(`Selected-place render evidence: ${JSON.stringify(state)}`);
      throw error;
    }
    const selectedFeatures = await page.evaluate(() => window.__MAZO_MAP_TEST__.queryRenderedFeatures(undefined, { layers: ['mazo-poi-selected'] }).map((feature) => feature.properties.id));
    assert.ok(selectedFeatures.includes(expectedPlaceId), 'search-selected place remains rendered in the selected state');
    const duplicateSelectionFeatures = await page.evaluate(() => window.__MAZO_MAP_TEST__.queryRenderedFeatures(undefined, { layers: ['mazo-poi-major', 'mazo-poi-district', 'mazo-poi-local'] }).map((feature) => feature.properties.id));
    assert.ok(!duplicateSelectionFeatures.includes(expectedPlaceId), 'selected place is suppressed from ordinary POI tiers to avoid duplicate symbols');

    const animation = await page.evaluate(() => new Promise((resolveAnimation) => {
      const intervals = [];
      const longTasks = [];
      let previous = performance.now();
      const startedAt = previous;
      let observer = null;
      try {
        observer = new PerformanceObserver((list) => longTasks.push(...list.getEntries().map((entry) => entry.duration)));
        observer.observe({ type: 'longtask' });
      } catch {}
      window.__MAZO_MAP_TEST__.easeTo({ center: [81.69, 7.72], zoom: 10.5, bearing: 0, pitch: 0, duration: 1_500 });
      const sample = (now) => {
        intervals.push(now - previous);
        previous = now;
        if (now - startedAt < 1_600) requestAnimationFrame(sample);
        else {
          observer?.disconnect();
          intervals.sort((a, b) => a - b);
          const percentile = (value) => intervals[Math.min(intervals.length - 1, Math.floor((intervals.length - 1) * value))] || 0;
          resolveAnimation({ samples: intervals.length, p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99), maxMs: intervals.at(-1) || 0, longTasksOver50Ms: longTasks.filter((duration) => duration > 50).length });
        }
      };
      requestAnimationFrame(sample);
    }));
    await page.evaluate(() => window.__MAZO_MAP_TEST__.jumpTo({ center: [0, 0], zoom: 0, bearing: 0, pitch: 0 }));
    const worldCamera = await page.evaluate(() => ({ zoom: window.__MAZO_MAP_TEST__.getZoom(), bearing: window.__MAZO_MAP_TEST__.getBearing(), pitch: window.__MAZO_MAP_TEST__.getPitch() }));
    assert.ok(worldCamera.zoom < 1, 'world-level zoom-out must be available');
    assert.equal(worldCamera.bearing, 0);
    assert.equal(worldCamera.pitch, 0);
    await wait(page, (id) => window.__MAZO_MAP_TEST__.queryRenderedFeatures(undefined, { layers: ['mazo-poi-selected'] }).some((feature) => feature.properties.id === id), 30_000, expectedPlaceId);
    const selectedAtWorld = await page.evaluate(() => window.__MAZO_MAP_TEST__.queryRenderedFeatures(undefined, { layers: ['mazo-poi-selected'] }).map((feature) => feature.properties.id));
    assert.ok(selectedAtWorld.includes(expectedPlaceId), 'selected place remains highlighted in the world-scale view');

    await page.evaluate(() => Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition(_success, failure) { failure({ code: 1 }); }, watchPosition() { return 1; }, clearWatch() {} },
    }));
    await page.locator('#place-directions').click();
    await wait(page, () => !document.querySelector('#route-panel').hidden && document.querySelector('#route-details').hidden === false);
    assert.match(await page.locator('#route-status').innerText(), /permission denied/i);
    await page.locator('#route-pick-on-map').click();
    // Pick a verified routing graph node that is distinct from the destination;
    // the live app intentionally does not fall back to an external router.
    await page.evaluate(() => window.__MAZO_MAP_TEST__.jumpTo({ center: [81.737, 7.686], zoom: 16, bearing: 0, pitch: 0 }));
    await wait(page, () => !window.__MAZO_MAP_TEST__.isMoving(), 5_000);
    const pickupPoint = await page.evaluate(() => window.__MAZO_MAP_TEST__.project(window.__MAZO_MAP_TEST__.getCenter().toArray()));
    await page.mouse.click(pickupPoint.x, pickupPoint.y);
    await wait(page, () => /Local route ready/.test(document.querySelector('#route-status').innerText), 20_000);
    assert.match(await page.locator('#route-summary').innerText(), /km/);
    assert.match(await page.locator('#route-status').innerText(), /snapped/i);
    const routeFeatureCount = await page.evaluate(() => window.__MAZO_MAP_TEST__.getGeoJSONFeatureCount('mazo-route'));
    assert.equal(routeFeatureCount, 1, 'directions draw the selected route');
    assert.deepEqual(thirdPartyMapRequests, [], 'routing stays on Mazo services and local road data');
    await page.locator('[data-route-mode="cycling"]').dispatchEvent('click');
    assert.equal(await page.locator('[data-route-mode="cycling"]').getAttribute('aria-pressed'), 'true');
    // Map movement collapses the mobile sheet; reopen it before choosing a new pickup.
    await page.locator('#route-panel').click({ position: { x: 200, y: 15 } });
    await page.locator('#route-pick-on-map').waitFor({ state: 'visible' });
    await page.locator('#route-pick-on-map').click();
    await page.evaluate(() => window.__MAZO_MAP_TEST__.jumpTo({ center: [81.5, 7.7], zoom: 12, bearing: 0, pitch: 0 }));
    await wait(page, () => !window.__MAZO_MAP_TEST__.isMoving(), 5_000);
    const outsidePickup = await page.evaluate(() => window.__MAZO_MAP_TEST__.project(window.__MAZO_MAP_TEST__.getCenter().toArray()));
    await page.mouse.click(outsidePickup.x, outsidePickup.y);
    await wait(page, () => document.querySelector('#route-status').innerText.includes('No route is available'), 10_000);
    assert.equal(await page.evaluate(() => window.__MAZO_MAP_TEST__.getGeoJSONFeatureCount('mazo-route')), 0, 'failed route refresh clears stale route geometry');
    if (mode === 'pmtiles') {
      const closeButton = page.locator('#route-close');
      const bounds = await closeButton.boundingBox();
      assert.ok(bounds, 'mobile directions close button should be visible');
      await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    } else {
      await page.locator('#route-close').click();
    }
    await wait(page, () => document.querySelector('#route-panel').hidden, 5_000);
    const interactiveTransferBytes = await page.evaluate(() => performance.getEntriesByType('resource').reduce((total, entry) => total + (entry.transferSize || 0), 0));

    assert.deepEqual(errors, [], `${mode} browser errors`);

    if (mode === 'pmtiles' && screenshotDir) {
      await page.evaluate(() => window.__MAZO_MAP_TEST__.jumpTo({ center: [81.73, 7.68], zoom: 14, bearing: 0, pitch: 0 }));
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${screenshotDir}/mobile-dark-kattankudy.jpg`, type: 'jpeg', quality: 82 });
    }
    const cdp = await context.newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    const postGcHeap = await cdp.send('Runtime.getHeapUsage');
    await cdp.detach();
    await page.evaluate(() => window.__MAZO_MAP_TEST__.jumpTo({ center: [81.73, 7.68], zoom: 16, bearing: 0, pitch: 0 }));
    await wait(page, (count) => window.__MAZO_MAP_TEST__.getGeoJSONFeatureCount('mazo-speed-review') > 0, 30_000);
    assert.equal(speedRequests.filter((url) => url.includes('speed-limits.mzp')).length, 1);
    const result = {
      mode, startupMs, sourceType: bootstrapPoiSource.type, startupTransferBytes, startupHeapBytes,
      postGcHeapBytes: postGcHeap.usedSize,
      interactiveTransferBytes,
      animation,
      initialCamera, interactionOptions, attemptedRotationBearing, beforeWheelZoom, afterWheelZoom,
      theme, opacities, category: 'electronics', searchResult: firstName,
      selectedPlace: selectedName, worldCamera, rangeResponses: ranges, speedRequests, accessibility, errors,
    };
    console.log(JSON.stringify(result));
    await context.close();
  }

  const offlineContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'allow' });
  const offlinePage = await offlineContext.newPage();
  const cachedArchiveRanges = [];
  offlinePage.on('response', (response) => { if (response.url().includes('/generated/places.pmtiles')) cachedArchiveRanges.push({ status: response.status(), range: response.headers()['content-range'] || '' }); });
  await offlinePage.goto(`${origin}/?map-test=1`, { waitUntil: 'domcontentloaded' });
  await wait(offlinePage, () => window.__MAZO_MAP_TEST__?.isStyleLoaded(), 60_000);
  await offlinePage.locator('#offline-download').click();
  try {
    await wait(offlinePage, () => /(?:Offline place search, details, local roads and limited Kattankudy routing are downloaded|Offline data operation failed:)/i.test(document.querySelector('#offline-status').innerText), 90_000);
    const offlinePackStatus = await offlinePage.locator('#offline-status').innerText();
    assert.match(offlinePackStatus, /Offline place search, details, local roads and limited Kattankudy routing are downloaded/i,
      `offline pack download failed: ${offlinePackStatus}`);
  } catch (error) {
    console.error(`Offline browser pack status: ${await offlinePage.locator('#offline-status').innerText()}`);
    throw error;
  }
  await offlinePage.evaluate(async () => { await navigator.serviceWorker.ready; });
  if (!await offlinePage.evaluate(() => Boolean(navigator.serviceWorker.controller))) await offlinePage.reload({ waitUntil: 'domcontentloaded' });
  cachedArchiveRanges.length = 0;
  await offlinePage.context().setOffline(true);
  await offlinePage.reload({ waitUntil: 'domcontentloaded' });
  await wait(offlinePage, () => document.querySelector('#map-search') && document.querySelector('#offline-status'), 30_000);
  await offlinePage.locator('#map-search').fill('Noor Accessories Showroom');
  await wait(offlinePage, () => document.querySelector('#search-results [role="option"]'), 30_000);
  assert.match(await offlinePage.locator('#search-results [role="option"] strong').first().innerText(), /Noor Accessories/);
  assert.ok(cachedArchiveRanges.some((response) => response.status === 206 && /^bytes \d+-\d+\/\d+$/.test(response.range)), 'cached PMTiles requests are served as valid byte ranges');
  assert.match(await offlinePage.locator('#offline-status').innerText(), /basemap.*internet|basemap.*online/i);
  await offlineContext.close();
} finally {
  await browser.close();
  server.close();
}
