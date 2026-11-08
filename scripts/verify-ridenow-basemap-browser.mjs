#!/usr/bin/env node
/** Production browser audit: no third-party network is permitted. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';

const origin = new URL(process.argv[2] || 'https://maps.mazo.workers.dev').origin;
assert.equal(new URL(origin).protocol, 'https:');
// Verify HTTP transport returns decoded Mapbox vector tile bytes, not double-gzip.
const sampleTile = new URL('/api/v1/basemap/tiles/13/5955/3920.pbf',origin);
const tileResponse = await fetch(sampleTile, { signal:AbortSignal.timeout(20000) });
assert.equal(tileResponse.status,200,'Sample Kattankudy tile must be published');
const tileBytes = new Uint8Array(await tileResponse.arrayBuffer());
const decodedTile = new VectorTile(new Pbf(tileBytes));
assert.ok(decodedTile.layers.streets, 'The HTTP-decoded tile must be a valid PBF with streets');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const external = [], failed = [], requests = [], networkFailures = [], httpFailures = [], mapErrors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
    isMobile: true, hasTouch: true, serviceWorkers: 'block'
  });
  const page = await context.newPage();
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (!url.startsWith('https:') && !url.startsWith('http:')) return route.continue();
    if (new URL(url).origin !== origin) {
      external.push(url); return route.abort('blockedbyclient');
    }
    requests.push(url); return route.continue();
  });
  page.on('pageerror', e => failed.push('script: ' + e.message));
  page.on('requestfailed', r => networkFailures.push({url:r.url(),failure:r.failure()}));
  page.on('response', r => {
    if (r.status() >= 400) httpFailures.push({status:r.status(),url:r.url()});
    if (r.status() >= 500) failed.push('HTTP ' + r.status() + ' ' + r.url());
  });
  await page.goto(origin + '/?map-test=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  try {
    await page.waitForFunction(() => window.__MAZO_MAP_TEST__?.isStyleLoaded()
      && document.querySelector('#map-frame')?.dataset.state === 'ready', undefined, { timeout: 45000 });
  } catch (error) {
    const state=await page.evaluate(() => ({
      frameState:document.querySelector('#map-frame')?.dataset.state,
      mapPresent:Boolean(window.__MAZO_MAP_TEST__),
      styleLoaded:window.__MAZO_MAP_TEST__?.isStyleLoaded(),
      styleName:window.__MAZO_MAP_TEST__?.getStyle()?.name,
      sources:Object.keys(window.__MAZO_MAP_TEST__?.getStyle()?.sources||{}),
      searchStatus:document.querySelector('#search-status')?.textContent,
      mapErrors:window.__MAZO_MAP_ERRORS__?.slice(-20)||[]
    })).catch(e=>({diagnosticError:String(e)}));
    console.error('Production initial-style diagnostic:', JSON.stringify({
      state, external:external.slice(-20), failed:failed.slice(-20),
      networkFailures:networkFailures.slice(-20),httpFailures:httpFailures.slice(-20),
      recentRequests:requests.slice(-40)
    }));
    throw error;
  }
  const first = await page.evaluate(() => {
    const m = window.__MAZO_MAP_TEST__;
    const style = m.getStyle();
    return { sources: Object.keys(style.sources), layers: style.layers.map(x => x.id),
      zoom: m.getZoom(), center: m.getCenter().toArray() };
  });
  assert.ok(first.sources.includes('basemap'), 'The complete R2 basemap must be active');
  assert.ok(first.sources.includes('mazo'), 'Place vector source must remain active');
  for (const id of ['mazo-minor-roads', 'mazo-buildings', 'mazo-ocean']) {
    assert.ok(first.layers.includes(id), 'Expected native basemap layer: ' + id);
  }
  await page.evaluate(() => window.__MAZO_MAP_TEST__.jumpTo({
    center: [81.727, 7.703], zoom: 15, bearing: 0, pitch: 0
  }));
  try {
    await page.waitForFunction(() => {
      const m = window.__MAZO_MAP_TEST__;
      return m.getLayer('mazo-minor-roads') &&
        m.queryRenderedFeatures(undefined, { layers: ['mazo-minor-roads'] }).length > 0;
    }, undefined, { timeout: 45000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => {
      const m=window.__MAZO_MAP_TEST__;
      const style=m?.getStyle();
      return {
        styleLoaded:m?.isStyleLoaded(),zoom:m?.getZoom(),
        center:m?.getCenter()?.toArray(),
        canvas: m?.getCanvas() ? {width:m.getCanvas().width,height:m.getCanvas().height} : null,
        sourceLoaded:m?.isSourceLoaded('basemap'),
        layers:(style?.layers||[]).filter(l=>l.source==='basemap').map(l=>({id:l.id,sourceLayer:l['source-layer'],minzoom:l.minzoom,visibility:l.layout?.visibility})),
        rendered:m ? m.queryRenderedFeatures().slice(0,10).map(f=>({layer:f.layer?.id,source:f.source,type:f.type})) : [],
        styleErrors:window.__MAZO_MAP_ERRORS__||[],
      };
    }).catch(e=>({error:String(e)}));
    console.error('Production rendered-roads diagnostic:',JSON.stringify({
      diagnostic,external,failed,networkFailures:networkFailures.slice(-30),
      httpFailures:httpFailures.slice(-30),recentRequests:requests.slice(-50)
    }));
    throw error;
  }
  const roadCount = await page.evaluate(() => window.__MAZO_MAP_TEST__
    .queryRenderedFeatures(undefined, { layers: ['mazo-minor-roads'] }).length);
  await page.locator('#theme-toggle').click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark'
    && window.__MAZO_MAP_TEST__?.isStyleLoaded(), undefined, { timeout: 30000 });
  assert.ok(requests.some(x => x.includes('/api/v1/basemap/tiles/')),
    'Browser must request native basemap tiles through this origin');
  assert.deepEqual(external, [], 'The map must not request any third-party runtime');
  assert.deepEqual(failed, [], 'No script errors or HTTP 5xx expected');
  console.log(JSON.stringify({ ok: true, origin, sourceNames: first.sources,
    roadCount, requests: requests.length, external: external.length, errors: failed.length }, null, 2));
  await context.close();
} finally {
  await browser.close();
}
