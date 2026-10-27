import assert from 'node:assert/strict';
import { createReadStream, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.mzp': 'application/geo+json',
  '.pmtiles': 'application/vnd.pmtiles', '.svg': 'image/svg+xml', '.png': 'image/png',
};
const searchFixture = JSON.parse(readFileSync(resolve(root, 'generated/search-index.json'), 'utf8'));
const idColumn = searchFixture.fields.indexOf('id');
const nameColumn = searchFixture.fields.indexOf('name');
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
try {
  for (const mode of (process.env.PHASE9_MODES?.split(',') || ['mzp', 'pmtiles', 'pmtiles-fallback'])) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
      isMobile: true, hasTouch: true, colorScheme: 'light',
    });
    const page = await context.newPage();
    const errors = [];
    const ranges = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !(mode === 'pmtiles-fallback' && message.text().includes('503'))) errors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.url().includes('/generated/places.pmtiles')) ranges.push({ status: response.status(), contentRange: response.headers()['content-range'] || null });
      if (response.status() >= 400 && !(mode === 'pmtiles-fallback' && response.status() === 503 && response.url().includes('/generated/places.pmtiles'))) {
        errors.push(`HTTP ${response.status()} ${response.url()}`);
      }
    });
    if (mode === 'pmtiles-fallback') {
      await page.route('**/generated/places.pmtiles*', (route) => route.fulfill({ status: 503, body: 'intentional fallback test' }));
    }
    const started = Date.now();
    const query = mode === 'mzp' ? '' : '?delivery=pmtiles';
    await page.goto(`${origin}/${query}${query ? '&' : '?'}map-test=1`, { waitUntil: 'domcontentloaded' });
    await wait(page, () => window.__MAZO_MAP_TEST__?.isStyleLoaded() && document.querySelector('#map-frame')?.dataset.state === 'ready');
    await wait(page, () => document.querySelectorAll('.categories button').length > 2 && document.querySelector('#search-status').hidden, 90_000);
    const sourceType = await page.evaluate(() => window.__MAZO_MAP_TEST__.getSource('mazo-pois')?.type);
    assert.equal(sourceType, mode === 'pmtiles' ? 'vector' : 'geojson', `${mode} selected the expected POI source`);
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
    if (mode === 'mzp' && process.env.PHASE9_SCREENSHOTS_DIR) {
      await page.evaluate(() => window.__MAZO_MAP_TEST__.jumpTo({ center: [81.73, 7.68], zoom: 14, bearing: 0, pitch: 0 }));
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${process.env.PHASE9_SCREENSHOTS_DIR}/mobile-light-kattankudy.jpg`, type: 'jpeg', quality: 82 });
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
    await page.mouse.move(200, 240);
    await page.mouse.wheel(0, -240);
    await wait(page, (zoom) => window.__MAZO_MAP_TEST__.getZoom() > zoom + 0.1, 10_000, beforeWheelZoom);
    const afterWheelZoom = await page.evaluate(() => window.__MAZO_MAP_TEST__.getZoom());

    await page.locator('#theme-toggle').click();
    await wait(page, () => document.documentElement.dataset.theme === 'dark'
      && window.__MAZO_MAP_TEST__?.isStyleLoaded()
      && window.__MAZO_MAP_TEST__?.getLayer('mazo-poi-selected')
      && window.__MAZO_MAP_TEST__?.getSource('mazo-selected-place')?.type === 'geojson'
      && ['#102a38', 'rgb(16,42,56)', 'rgba(16,42,56,1)'].includes(String(window.__MAZO_MAP_TEST__?.getPaintProperty('background', 'background-color')).replace(/\s/g, '').toLowerCase()), 60_000);
    const opacities = await page.evaluate(() => ['mazo-poi-major', 'mazo-poi-district', 'mazo-poi-local', 'mazo-poi-selected']
      .map((id) => [id, window.__MAZO_MAP_TEST__.getPaintProperty(id, 'icon-opacity'), window.__MAZO_MAP_TEST__.getPaintProperty(id, 'text-opacity')]));
    for (const [id, iconOpacity, textOpacity] of opacities) {
      assert.equal(iconOpacity, 1, `${id} icon opacity`);
      assert.equal(textOpacity, 1, `${id} label opacity`);
    }
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    assert.equal(theme, 'dark');

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
    const interactiveTransferBytes = await page.evaluate(() => performance.getEntriesByType('resource').reduce((total, entry) => total + (entry.transferSize || 0), 0));

    await wait(page, () => window.__MAZO_MAP_TEST__?.getZoom() >= 15);
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
    assert.deepEqual(errors, [], `${mode} browser errors`);

    if (mode === 'mzp' && process.env.PHASE9_SCREENSHOTS_DIR) {
      await page.evaluate(() => window.__MAZO_MAP_TEST__.jumpTo({ center: [81.73, 7.68], zoom: 14, bearing: 0, pitch: 0 }));
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${process.env.PHASE9_SCREENSHOTS_DIR}/mobile-dark-kattankudy.jpg`, type: 'jpeg', quality: 82 });
    }
    const result = {
      mode, startupMs, sourceType, startupTransferBytes, startupHeapBytes,
      interactiveTransferBytes,
      animation,
      initialCamera, interactionOptions, attemptedRotationBearing, beforeWheelZoom, afterWheelZoom,
      theme, opacities, category: 'electronics', searchResult: firstName,
      selectedPlace: selectedName, worldCamera, rangeResponses: ranges, errors,
    };
    results.push(result);
    console.log(JSON.stringify(result));
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
const reportPath = resolve(root, 'reports/phase9-browser-smoke.json');
writeFileSync(reportPath, `${JSON.stringify({ browser: `Chromium ${browser.version()}`, viewport: { width: 390, height: 844, mobileEmulation: true }, results }, null, 2)}\n`);
