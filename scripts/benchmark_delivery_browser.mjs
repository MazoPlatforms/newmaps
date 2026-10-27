import { mkdirSync, writeFileSync } from 'node:fs';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';

let baseUrl = process.env.MAZO_BENCHMARK_URL || 'https://mazoplatforms.github.io/newmaps/';
let localServer;
if (process.env.MAZO_BENCHMARK_LOCAL === '1') {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mzp': 'application/geo+json', '.pmtiles': 'application/vnd.pmtiles', '.svg': 'image/svg+xml', '.png': 'image/png' };
  localServer = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const target = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (target !== root && !target.startsWith(`${root}${sep}`)) return response.writeHead(403).end();
    let size;
    try { size = statSync(target).size; } catch { return response.writeHead(404).end(); }
    const headers = { 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=600', 'Content-Type': types[extname(target)] || 'application/octet-stream' };
    const range = request.headers.range;
    if (!range && ['.mzp', '.json'].includes(extname(target)) && /\bgzip\b/.test(request.headers['accept-encoding'] || '')) {
      const compressed = gzipSync(readFileSync(target));
      headers['Content-Encoding'] = 'gzip';
      headers['Content-Length'] = compressed.length;
      response.writeHead(200, headers);
      return response.end(compressed);
    }
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) return response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      const start = Number(match[1]); const end = Math.min(match[2] ? Number(match[2]) : size - 1, size - 1);
      if (start >= size || end < start) return response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`; headers['Content-Length'] = end - start + 1;
      response.writeHead(206, headers); return createReadStream(target, { start, end }).pipe(response);
    }
    headers['Content-Length'] = size; response.writeHead(200, headers); createReadStream(target).pipe(response);
  });
  await new Promise((resolveListen) => localServer.listen(0, '127.0.0.1', resolveListen));
  baseUrl = `http://127.0.0.1:${localServer.address().port}/`;
}
const repetitions = Number(process.env.MAZO_BENCHMARK_REPETITIONS || 3);
const latencyMs = Number(process.env.MAZO_BENCHMARK_LATENCY_MS || 60);
const downloadBps = Number(process.env.MAZO_BENCHMARK_DOWNLOAD_BPS || 5 * 1024 * 1024 / 8);
const uploadBps = Number(process.env.MAZO_BENCHMARK_UPLOAD_BPS || 1024 * 1024 / 8);
const deviceProfiles = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  { name: 'android-chrome-emulation', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
];
const results = [];
const errors = [];
const reportPath = process.env.MAZO_BENCHMARK_REPORT || 'reports/phase9-delivery-profile.json';

async function gcAwareHeap(session, page) {
  const before = await session.send('Performance.getMetrics');
  const beforeValues = Object.fromEntries(before.metrics.map(({ name, value }) => [name, value]));
  const memoryApiBeforeGc = await page.evaluate(() => performance.memory ? {
    usedJSHeapSize: performance.memory.usedJSHeapSize,
    totalJSHeapSize: performance.memory.totalJSHeapSize,
  } : null);
  await session.send('HeapProfiler.collectGarbage');
  const { metrics } = await session.send('Performance.getMetrics');
  const values = Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
  const memoryApi = await page.evaluate(() => performance.memory ? {
    usedJSHeapSize: performance.memory.usedJSHeapSize,
    totalJSHeapSize: performance.memory.totalJSHeapSize,
    jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
  } : null);
  return {
    jsHeapUsedBytesBeforeGc: Math.round(beforeValues.JSHeapUsedSize || 0),
    jsHeapUsedBytesAfterForcedGc: Math.round(values.JSHeapUsedSize || 0),
    jsHeapTotalBytes: Math.round(values.JSHeapTotalSize || 0),
    domNodes: values.Nodes ?? null,
    documents: values.Documents ?? null,
    memoryApiBeforeGc,
    memoryApi,
  };
}

async function profileJourney(page, cdp, requestRecords, pageErrors, stageState, profile, mode, repetition, cacheState) {
  const requestOffset = requestRecords.length;
  stageState.current = 'startup';
  const start = Date.now();
  const query = mode === 'pmtiles' ? '?delivery=pmtiles&map-test=1' : '?map-test=1';
  const url = new URL(query, baseUrl).href;
  await page.evaluate(() => performance.clearResourceTimings()).catch(() => {});
  if (cacheState === 'cold') await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  else await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });

  const expectedSourceType = mode === 'pmtiles' ? 'vector' : 'geojson';
  await page.waitForFunction((sourceType) => {
    const testMap = window.__MAZO_MAP_TEST__;
    if (!testMap?.isStyleLoaded() || document.querySelector('#map-frame')?.dataset.state !== 'ready') return false;
    const source = testMap.getSource('mazo-pois');
    if (!source || source.type !== sourceType) return false;
    const layers = ['mazo-poi-major', 'mazo-poi-district', 'mazo-poi-local'].filter((id) => testMap.getLayer(id));
    return layers.length > 0 && testMap.queryRenderedFeatures(undefined, { layers }).length > 0
      && document.querySelector('#search-status').hidden;
  }, expectedSourceType, { timeout: 90_000 });
  const readyMs = Date.now() - start;
  const initialCamera = await page.evaluate(() => ({
    zoom: window.__MAZO_MAP_TEST__.getZoom(), bearing: window.__MAZO_MAP_TEST__.getBearing(), pitch: window.__MAZO_MAP_TEST__.getPitch(),
  }));
  const source = await page.evaluate(() => window.__MAZO_MAP_TEST__.getSource('mazo-pois'));
  if (mode === 'pmtiles') {
    const archiveUrl = await page.evaluate(() => window.mazoPmtilesUrl);
    if (!archiveUrl?.startsWith('pmtiles://')) throw new Error('PMTiles query silently switched away from PMTiles URL');
  }
  const startupGcHeap = await gcAwareHeap(cdp, page);
  if (process.env.MAZO_BENCHMARK_SCREENSHOTS && profile.name === 'desktop' && repetition === 1 && cacheState === 'cold') {
    mkdirSync(process.env.MAZO_BENCHMARK_SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: `${process.env.MAZO_BENCHMARK_SCREENSHOTS}/${mode}-map.png` });
  }
  stageState.current = 'search';

  const categoryStart = Date.now();
  const category = page.locator('.categories button').filter({ hasText: /Electronics/ }).first();
  await category.click();
  await page.locator('#map-search').fill('Noor Accessories Showroom');
  await page.waitForFunction(() => document.querySelector('#search-results [role="option"] strong')?.textContent?.includes('Noor Accessories'), undefined, { timeout: 30_000 });
  const searchAndFilterMs = Date.now() - categoryStart;
  stageState.current = 'details';

  const detailsStart = Date.now();
  const detailsResponse = mode === 'pmtiles'
    ? page.waitForResponse((response) => response.url().includes('/generated/place-details.json'), { timeout: 30_000 })
    : null;
  await page.locator('#search-results [role="option"]').first().click();
  await page.waitForFunction(() => !document.querySelector('#place-sheet').hidden, undefined, { timeout: 15_000 });
  if (detailsResponse) await detailsResponse;
  const selectedName = await page.locator('#place-title').innerText();
  const detailsMs = Date.now() - detailsStart;
  if (process.env.MAZO_BENCHMARK_SCREENSHOTS && profile.name === 'desktop' && repetition === 1 && cacheState === 'cold') {
    await page.screenshot({ path: `${process.env.MAZO_BENCHMARK_SCREENSHOTS}/${mode}-selected-details.png` });
  }
  const journeyGcHeap = await gcAwareHeap(cdp, page);

  stageState.current = 'camera';
  const frameTiming = await page.evaluate(() => new Promise((resolve) => {
    const intervals = [];
    const longTasks = [];
    let previous = performance.now();
    const started = previous;
    let observer;
    try {
      observer = new PerformanceObserver((list) => longTasks.push(...list.getEntries().map((entry) => entry.duration)));
      observer.observe({ type: 'longtask' });
    } catch {}
    window.__MAZO_MAP_TEST__.easeTo({ center: [81.73, 7.68], zoom: 14, bearing: 0, pitch: 0, duration: 1_500 });
    const sample = (now) => {
      intervals.push(now - previous);
      previous = now;
      if (now - started < 1_700) requestAnimationFrame(sample);
      else {
        observer?.disconnect();
        intervals.sort((a, b) => a - b);
        const percentile = (q) => intervals[Math.min(intervals.length - 1, Math.floor((intervals.length - 1) * q))] || 0;
        resolve({ samples: intervals.length, p50Ms: percentile(0.5), p95Ms: percentile(0.95), maxMs: intervals.at(-1) || 0, longTasksOver50Ms: longTasks.filter((ms) => ms > 50).length });
      }
    };
    requestAnimationFrame(sample);
  }));
  const postAnimationGcHeap = await gcAwareHeap(cdp, page);
  stageState.current = 'idle';
  await new Promise((resolve) => setTimeout(resolve, 500));
  const performanceResources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => ({
    name: entry.name, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize,
    decodedBodySize: entry.decodedBodySize, duration: entry.duration,
  })));

  const runRequests = requestRecords.slice(requestOffset);
  const archiveResponses = runRequests.filter((item) => item.path.endsWith('/places.pmtiles'));
  const rangeResponses = archiveResponses.filter((item) => item.status === 206 && item.contentRange);
  if (mode === 'pmtiles' && !rangeResponses.length) throw new Error('PMTiles run did not perform a verified HTTP Range request');
  if (mode === 'mzp' && archiveResponses.length) throw new Error('MZP default unexpectedly requested PMTiles');
  const result = {
    profile: profile.name, mode, repetition, cacheState, latencyMs, downloadBps, uploadBps,
    source, initialCamera, readyMs, searchAndFilterMs, detailsMs, selectedName, frameTiming,
    startupGcHeap, journeyGcHeap, postAnimationGcHeap,
    requests: runRequests, requestCount: runRequests.length,
    transferredEncodedBytes: runRequests.reduce((sum, item) => sum + (item.encodedDataBytes || 0), 0),
    stageTotals: Object.fromEntries(['startup', 'search', 'details', 'camera', 'idle'].map((stage) => {
      const stageRequests = runRequests.filter((item) => item.stage === stage);
      return [stage, { requestCount: stageRequests.length, encodedBytes: stageRequests.reduce((sum, item) => sum + (item.encodedDataBytes || 0), 0) }];
    })),
    pmtilesRangeCount: rangeResponses.length,
    pmtilesRangeBytes: rangeResponses.reduce((sum, item) => sum + Number(item.contentLength || 0), 0),
    performanceResources,
    errors: [...pageErrors],
  };
  pageErrors.length = 0;
  return result;
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  for (const profile of deviceProfiles) {
    const contextOptions = { viewport: profile.viewport, isMobile: profile.isMobile, hasTouch: profile.hasTouch, deviceScaleFactor: profile.deviceScaleFactor };
    for (let repetition = 1; repetition <= repetitions; repetition++) {
      const modeOrder = repetition % 2 ? ['mzp', 'pmtiles'] : ['pmtiles', 'mzp'];
      for (const mode of modeOrder) {
        const context = await browser.newContext(contextOptions);
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
        await cdp.send('Network.emulateNetworkConditions', {
          offline: false, latency: latencyMs, downloadThroughput: downloadBps, uploadThroughput: uploadBps,
          connectionType: 'cellular3g', packetLoss: 0, packetQueueLength: 0, packetReordering: false,
        });
        await cdp.send('Performance.enable');
        await cdp.send('HeapProfiler.enable');
        const requestRecords = [];
        const pageErrors = [];
        const stageState = { current: 'startup' };
        const requestById = new Map();
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text().slice(0, 250)); });
        cdp.on('Network.requestWillBeSent', (event) => {
          const url = new URL(event.request.url);
          const row = {
            url: event.request.url, host: url.host, path: url.pathname, method: event.request.method,
            stage: stageState.current, status: null, encodedDataBytes: 0, fromDiskCache: false,
            fromServiceWorker: false, cacheControl: null, age: null, xCache: null,
            contentRange: null, contentLength: null,
          };
          requestRecords.push(row);
          requestById.set(event.requestId, row);
        });
        cdp.on('Network.responseReceived', (event) => {
          const row = requestById.get(event.requestId);
          if (!row) return;
          const headers = event.response.headers || {};
          const header = (name) => Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1] || null;
          row.status = event.response.status;
          row.fromDiskCache = Boolean(event.response.fromDiskCache);
          row.fromServiceWorker = Boolean(event.response.fromServiceWorker);
          row.cacheControl = header('cache-control');
          row.age = header('age');
          row.xCache = header('x-cache') || header('x-proxy-cache');
          row.contentRange = header('content-range');
          row.contentLength = header('content-length');
        });
        cdp.on('Network.loadingFinished', (event) => {
          const row = requestById.get(event.requestId);
          if (row) row.encodedDataBytes = Math.max(0, Math.round(event.encodedDataLength || 0));
        });
        cdp.on('Network.loadingFailed', (event) => {
          const row = requestById.get(event.requestId);
          if (row) row.error = event.errorText;
        });

        const cold = await profileJourney(page, cdp, requestRecords, pageErrors, stageState, profile, mode, repetition, 'cold');
        results.push(cold);
        console.log(JSON.stringify({ profile: profile.name, mode, repetition, cacheState: 'cold', readyMs: cold.readyMs, totalBytes: cold.transferredEncodedBytes, forcedGcHeap: cold.postAnimationGcHeap.jsHeapUsedBytesAfterForcedGc, frame: cold.frameTiming }));
        const warm = await profileJourney(page, cdp, requestRecords, pageErrors, stageState, profile, mode, repetition, 'warm');
        results.push(warm);
        console.log(JSON.stringify({ profile: profile.name, mode, repetition, cacheState: 'warm', readyMs: warm.readyMs, totalBytes: warm.transferredEncodedBytes, forcedGcHeap: warm.postAnimationGcHeap.jsHeapUsedBytesAfterForcedGc, frame: warm.frameTiming }));
        await context.close();
      }
    }
  }
} catch (error) {
  errors.push(error.stack || String(error));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  const median = (values) => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const summary = {};
  for (const profile of deviceProfiles) {
    summary[profile.name] = {};
    for (const mode of ['mzp', 'pmtiles']) {
      summary[profile.name][mode] = {};
      for (const cacheState of ['cold', 'warm']) {
        const group = results.filter((item) => item.profile === profile.name && item.mode === mode && item.cacheState === cacheState);
        summary[profile.name][mode][cacheState] = {
          runs: group.length,
          readyMsMedian: median(group.map((item) => item.readyMs)),
          encodedBytesMedian: median(group.map((item) => item.transferredEncodedBytes)),
          forcedGcHeapBytesMedian: median(group.map((item) => item.postAnimationGcHeap.jsHeapUsedBytesAfterForcedGc)),
          animationFrameP95MsMedian: median(group.map((item) => item.frameTiming.p95Ms)),
          animationLongTasksOver50MsMedian: median(group.map((item) => item.frameTiming.longTasksOver50Ms)),
          pmtilesRangeBytesMedian: median(group.map((item) => item.pmtilesRangeBytes)),
        };
      }
    }
  }
  const report = {
    generatedAt: new Date().toISOString(), target: baseUrl,
    browser: `Chromium ${browser.version()}`,
    renderer: 'Headless Chromium / SwiftShader software WebGL in Codespaces',
    networkProfile: { label: 'emulated throttled network: 60 ms RTT and 5 Mbit/s down / 1 Mbit/s up', latencyMs, downloadBps, uploadBps },
    repetitionCount: repetitions,
    coldCacheDefinition: 'A fresh browser context for each cold journey. The CDN may be warm; repository responses record cache headers and edge age/cache status.',
    warmCacheDefinition: 'Same browser context reload after the identical journey with HTTP cache enabled; GitHub Pages reports max-age=600 for generated assets.',
    deviceProfiles: deviceProfiles.map(({ name, viewport, isMobile, hasTouch, deviceScaleFactor }) => ({ name, viewport, isMobile, hasTouch, deviceScaleFactor })),
    results, summary, errors,
    physicalAndroidTesting: 'Unavailable: no adb executable or attached Android device was found in this Codespace.',
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  localServer?.close();
}
