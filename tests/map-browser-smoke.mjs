import assert from 'node:assert/strict';
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const screenshotDir = process.env.PHASE10_SCREENSHOTS_DIR || process.env.PHASE9_SCREENSHOTS_DIR;
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
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
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
  if (!range && ['.mzp', '.json'].includes(extname(target)) && /\bgzip\b/.test(request.headers['accept-encoding'] || '')) {
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
const results = [];
const cartographicViews = [];
try {
  for (const mode of (process.env.PHASE9_MODES?.split(',') || ['mzp', 'pmtiles', 'pmtiles-fallback', 'mzp-retry'])) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
      isMobile: true, hasTouch: true, colorScheme: 'light',
    });
    await context.grantPermissions([], { origin: `http://127.0.0.1:${server.address().port}` });
    const page = await context.newPage();
    const errors = [];
    const ranges = [];
    const speedRequests = [];
    const styleRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error'
        && !(mode === 'pmtiles-fallback' && message.text().includes('503'))
        && !(mode === 'mzp-retry' && message.text().includes('503'))) errors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.url().includes('/generated/places.pmtiles')) ranges.push({ status: response.status(), contentRange: response.headers()['content-range'] || null });
      if (response.status() >= 400 && !(mode === 'pmtiles-fallback' && response.status() === 503 && response.url().includes('/generated/places.pmtiles'))
        && !(mode === 'mzp-retry' && response.status() === 503 && response.url().includes('/generated/manifest.json'))) {
        errors.push(`HTTP ${response.status()} ${response.url()}`);
      }
    });
    page.on('request', (request) => {
      if (request.url().includes('speed-limits')) speedRequests.push(request.url());
      if (request.url().includes('/styles/liberty')) styleRequests.push(request.url());
    });
    if (mode === 'pmtiles-fallback') {
      await page.route('**/generated/places.pmtiles*', (route) => route.fulfill({ status: 503, body: 'intentional fallback test' }));
    }
    if (mode === 'mzp-retry') {
      let firstManifestRequest = true;
      await page.route('**/generated/manifest.json', (route) => {
        if (firstManifestRequest) { firstManifestRequest = false; return route.fulfill({ status: 503, body: 'temporary offline response' }); }
        return route.continue();
      });
    }
    const started = Date.now();
    const deliveryQuery = mode === 'pmtiles' || mode === 'pmtiles-fallback' ? '?delivery=pmtiles' : '';
    await page.goto(`${origin}/${deliveryQuery}${deliveryQuery ? '&' : '?'}map-test=1`, { waitUntil: 'domcontentloaded' });
    if (mode === 'mzp-retry') {
      await wait(page, () => !document.querySelector('#places-retry').hidden);
      await page.locator('#places-retry').click();
    }
    await wait(page, () => window.__MAZO_MAP_TEST__?.isStyleLoaded() && document.querySelector('#map-frame')?.dataset.state === 'ready');
    await wait(page, () => document.querySelectorAll('.categories button').length > 2 && document.querySelector('#search-status').hidden, 90_000);
    const sourceType = await page.evaluate(() => window.__MAZO_MAP_TEST__.getSource('mazo-pois')?.type);
    assert.equal(sourceType, mode === 'pmtiles' ? 'vector' : 'geojson', `${mode} selected the expected POI source`);
    assert.equal(speedRequests.length, 0, 'speed review data is deferred until street zoom');
    if (mode === 'pmtiles') {
      await wait(page, () => window.mazoPmtilesUrl !== null && window.mazoPmtilesUrl !== undefined);
      await wait(page, () => performance.getEntriesByType('resource').some((entry) => entry.name.includes('places.pmtiles')));
      assert.ok(ranges.some((entry) => entry.status === 206 && /^bytes \d+-\d+\/\d+$/.test(entry.contentRange || '')), 'PMTiles must use byte-range requests');
    }
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
    await wait(page, () => /within 10 km|GPS location is unavailable|Location request timed out|Location permission denied/i
      .test(document.querySelector('#search-status').innerText), 18_000);
    const nearbyStatus = await page.locator('#search-status').innerText();
    assert.match(nearbyStatus, /within 10 km|GPS location is unavailable|Location request timed out|Location permission denied/i);
    await wait(page, () => !window.__MAZO_MAP_TEST__.isMoving(), 15_000);
    await context.grantPermissions([], { origin: `http://127.0.0.1:${server.address().port}` });
    await page.evaluate(() => window.__MAZO_MAP_TEST__.jumpTo({ center: [81.5569, 7.8381], zoom: 8.6, bearing: 0, pitch: 0 }));
    if (mode === 'mzp' && screenshotDir) {
      mkdirSync(screenshotDir, { recursive: true });
      const scenes = [
        ['world', [0, 0], 0.55], ['sri-lanka', [80.7, 7.8], 6.3],
        ['eastern-province', [81.5, 7.7], 8], ['batticaloa-district', [81.7, 7.7], 9],
        ['batticaloa-coast', [81.75, 7.7], 10.5], ['kattankudy-surroundings', [81.73, 7.68], 11.5],
        ['kattankudy-street-network', [81.7337, 7.6831], 15], ['victory-ground-deen-road', [81.7389, 7.6766], 16],
      ];
      for (const [name, center, zoom] of scenes) {
        const tilesReady = await page.evaluate(({ center, zoom }) => window.__MAZO_MAP_TEST__.jumpToWhenIdle({ center, zoom, bearing: 0, pitch: 0 }), { center, zoom });
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
        cartographicViews.push({ name, theme: 'light', tilesReady, ...visible });
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
      && window.__MAZO_MAP_TEST__?.getLayer('mazo-poi-selected')
      && window.__MAZO_MAP_TEST__?.getSource('mazo-selected-place')?.type === 'geojson', 60_000);
    assert.equal(styleRequests.length, 1, 'theme switching updates paint without reloading the basemap style');
    const themedLand = await page.evaluate(() => window.__MAZO_MAP_TEST__.getPaintProperty('background', 'background-color'));
    assert.ok(String(themedLand).replace(/\s/g, '').toLowerCase().includes('#202d32') || String(themedLand).replace(/\s/g, '').toLowerCase().includes('32,45,50'), `dark background should use Mazo land palette, received ${JSON.stringify(themedLand)}`);
    const opacities = await page.evaluate(() => ['mazo-poi-major', 'mazo-poi-district', 'mazo-poi-local', 'mazo-poi-selected']
      .map((id) => [id, window.__MAZO_MAP_TEST__.getPaintProperty(id, 'icon-opacity'), window.__MAZO_MAP_TEST__.getPaintProperty(id, 'text-opacity')]));
    for (const [id, iconOpacity, textOpacity] of opacities) {
      assert.equal(iconOpacity, 1, `${id} icon opacity`);
      assert.equal(textOpacity, 1, `${id} label opacity`);
    }
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    assert.equal(theme, 'dark');
    if (mode === 'mzp' && screenshotDir) {
      const darkScenes = [
        ['world', [0, 0], 0.55], ['sri-lanka', [80.7, 7.8], 6.3],
        ['eastern-province', [81.5, 7.7], 8], ['batticaloa-district', [81.7, 7.7], 9],
        ['batticaloa-coast', [81.75, 7.7], 10.5], ['kattankudy-surroundings', [81.73, 7.68], 11.5],
        ['kattankudy-street-network', [81.7337, 7.6831], 15], ['victory-ground-deen-road', [81.7389, 7.6766], 16],
      ];
      for (const [name, center, zoom] of darkScenes) {
        const tilesReady = await page.evaluate(({ center, zoom }) => window.__MAZO_MAP_TEST__.jumpToWhenIdle({ center, zoom, bearing: 0, pitch: 0 }), { center, zoom });
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${screenshotDir}/${name}-dark.png` });
        cartographicViews.push({ name, theme: 'dark', tilesReady, zoom });
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
    await wait(page, (id) => window.__MAZO_MAP_TEST__.queryRenderedFeatures(undefined, { layers: ['mazo-poi-selected'] }).some((feature) => feature.properties.id === id), 30_000, expectedPlaceId);
    const selectedFeatures = await page.evaluate(() => window.__MAZO_MAP_TEST__.queryRenderedFeatures(undefined, { layers: ['mazo-poi-selected'] }).map((feature) => feature.properties.id));
    assert.ok(selectedFeatures.includes(expectedPlaceId), 'search-selected place remains rendered in the selected state');
    const duplicateSelectionFeatures = await page.evaluate(() => window.__MAZO_MAP_TEST__.queryRenderedFeatures(undefined, { layers: ['mazo-poi-major', 'mazo-poi-district', 'mazo-poi-local'] }).map((feature) => feature.properties.id));
    assert.ok(!duplicateSelectionFeatures.includes(expectedPlaceId), 'selected place is suppressed from ordinary POI tiers to avoid duplicate symbols');

    const animation = mode === 'mzp' ? await page.evaluate(() => new Promise((resolveAnimation) => {
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
    })) : null;
    await page.evaluate(() => window.__MAZO_MAP_TEST__.jumpTo({ center: [0, 0], zoom: 0, bearing: 0, pitch: 0 }));
    const worldCamera = await page.evaluate(() => ({ zoom: window.__MAZO_MAP_TEST__.getZoom(), bearing: window.__MAZO_MAP_TEST__.getBearing(), pitch: window.__MAZO_MAP_TEST__.getPitch() }));
    assert.ok(worldCamera.zoom < 1, 'world-level zoom-out must be available');
    assert.equal(worldCamera.bearing, 0);
    assert.equal(worldCamera.pitch, 0);
    await wait(page, (id) => window.__MAZO_MAP_TEST__.queryRenderedFeatures(undefined, { layers: ['mazo-poi-selected'] }).some((feature) => feature.properties.id === id), 30_000, expectedPlaceId);
    const selectedAtWorld = await page.evaluate(() => window.__MAZO_MAP_TEST__.queryRenderedFeatures(undefined, { layers: ['mazo-poi-selected'] }).map((feature) => feature.properties.id));
    assert.ok(selectedAtWorld.includes(expectedPlaceId), 'selected place remains highlighted in the world-scale view');

    await page.route('https://router.project-osrm.org/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'Ok', routes: [{ distance: 1200, duration: 240, geometry: { type: 'LineString', coordinates: [[81.72, 7.68], [81.73, 7.68]] }, legs: [{ steps: [] }] }] }),
    }));
    await page.evaluate(() => Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition(_success, failure) { failure({ code: 1 }); }, watchPosition() { return 1; }, clearWatch() {} },
    }));
    await page.locator('#place-directions').click();
    await wait(page, () => !document.querySelector('#route-panel').hidden && document.querySelector('#route-details').hidden === false);
    assert.match(await page.locator('#route-status').innerText(), /permission denied/i);
    await page.locator('#route-pick-on-map').click();
    const pickupPoint = await page.evaluate(() => window.__MAZO_MAP_TEST__.project(window.__MAZO_MAP_TEST__.getCenter().toArray()));
    await page.mouse.click(pickupPoint.x, pickupPoint.y);
    await wait(page, () => document.querySelector('#route-status').innerText === 'Route ready', 20_000);
    assert.ok((await page.locator('#route-summary').innerText()).includes('1.2 km'));
    const routeFeatureCount = await page.evaluate(() => window.__MAZO_MAP_TEST__.getGeoJSONFeatureCount('mazo-route'));
    assert.equal(routeFeatureCount, 1, 'directions draw the selected route');
    await page.evaluate(() => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = (url, options) => String(url).includes('/route/v1/')
        ? Promise.resolve(new Response('offline', { status: 503 }))
        : originalFetch(url, options);
    });
    await page.locator('[data-route-mode="cycling"]').dispatchEvent('click');
    assert.equal(await page.locator('[data-route-mode="cycling"]').getAttribute('aria-pressed'), 'true');
    await wait(page, () => document.querySelector('#route-status').innerText.includes('Unable to calculate route'), 10_000);
    assert.equal(await page.evaluate(() => window.__MAZO_MAP_TEST__.getGeoJSONFeatureCount('mazo-route')), 0, 'failed route refresh clears stale route geometry');
    await page.locator('#route-close').click();
    const interactiveTransferBytes = await page.evaluate(() => performance.getEntriesByType('resource').reduce((total, entry) => total + (entry.transferSize || 0), 0));

    assert.deepEqual(errors, [], `${mode} browser errors`);

    if (mode === 'mzp' && screenshotDir) {
      await page.evaluate(() => window.__MAZO_MAP_TEST__.jumpTo({ center: [81.73, 7.68], zoom: 14, bearing: 0, pitch: 0 }));
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${screenshotDir}/mobile-dark-kattankudy.jpg`, type: 'jpeg', quality: 82 });
    }
    const cdp = await context.newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    const postGcHeap = await cdp.send('Runtime.getHeapUsage');
    await cdp.detach();
    if (mode === 'mzp') {
      await page.evaluate(() => window.__MAZO_MAP_TEST__.jumpTo({ center: [81.73, 7.68], zoom: 16, bearing: 0, pitch: 0 }));
      await wait(page, (count) => window.__MAZO_MAP_TEST__.getGeoJSONFeatureCount('mazo-speed-review') > 0, 30_000);
      assert.equal(speedRequests.filter((url) => url.includes('speed-limits.mzp')).length, 1);
    }
    const result = {
      mode, startupMs, sourceType, startupTransferBytes, startupHeapBytes,
      postGcHeapBytes: postGcHeap.usedSize,
      interactiveTransferBytes,
      animation,
      initialCamera, interactionOptions, attemptedRotationBearing, beforeWheelZoom, afterWheelZoom,
      theme, opacities, category: 'electronics', searchResult: firstName,
      selectedPlace: selectedName, worldCamera, rangeResponses: ranges, speedRequests, accessibility, errors,
    };
    results.push(result);
    console.log(JSON.stringify(result));
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
const reportPath = resolve(root, 'reports/phase10-browser-smoke.json');
writeFileSync(reportPath, `${JSON.stringify({ browser: `Chromium ${browser.version()}`, viewport: { width: 390, height: 844, mobileEmulation: true }, results, cartographicViews }, null, 2)}\n`);
