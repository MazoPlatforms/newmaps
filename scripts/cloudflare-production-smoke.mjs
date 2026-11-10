import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';

const configuredUrl = process.env.MAZO_WORKERS_URL || 'http://127.0.0.1:8787/';
const base = new URL(configuredUrl);
if (!base.pathname.endsWith('/')) base.pathname += '/';

async function get(path, options) {
  return fetch(new URL(path.replace(/^\//, ''), base), options);
}

const home = await get('');
assert.equal(home.status, 200, 'Worker homepage should return HTTP 200');
assert.match(home.headers.get('content-type') || '', /text\/html/i);
const html = await home.text();
assert.match(html, /Mazo Maps/i, 'Worker homepage should contain the map app shell');

const spa = await get(`audit/spa-smoke-${Date.now()}`);
assert.equal(spa.status, 200, 'unknown client route should use the SPA index fallback');
assert.match(spa.headers.get('content-type') || '', /text\/html/i);
const spaHtml = await spa.text();
assert.match(spaHtml, /Mazo Maps/i);
const baseHref = spaHtml.match(/<base\s+href=["']([^"']+)["']/i)?.[1];
assert.equal(new URL(baseHref || '', spa.url).pathname, '/',
  'nested SPA shells should use the Workers root as their document base');
const assetPaths = [...new Set([...spaHtml.matchAll(/\b(?:src|href)=["']([^"']*\/assets\/[^"']+)["']/g)]
  .map((match) => match[1]))];
assert.ok(assetPaths.some((path) => path.includes('/assets/css/site.css')),
  'SPA shell should reference its stylesheet from the Workers root');
assert.ok(assetPaths.some((path) => path.includes('/assets/js/app.js')),
  'SPA shell should reference its app module from the Workers root');
for (const required of [
  '/assets/mazo-mark.svg',
  '/assets/vendor/maplibre-gl-5.7.0/maplibre-gl.css',
  '/assets/vendor/maplibre-gl-5.7.0/maplibre-gl.js',
]) {
  assert.ok(assetPaths.some((path) => new URL(path, spa.url).pathname === required),
    `SPA shell should reference required production asset ${required}`);
}
for (const path of assetPaths) {
  const assetUrl = new URL(path, spa.url);
  const asset = await fetch(assetUrl);
  assert.equal(asset.status, 200, `SPA asset ${path} should resolve from a nested route`);
  const contentType = asset.headers.get('content-type') || '';
  if (assetUrl.pathname.endsWith('.css')) assert.match(contentType, /text\/css/i, `${path} should be CSS, not SPA HTML`);
  if (/\.(?:js|mjs)$/.test(assetUrl.pathname)) assert.match(contentType, /javascript/i, `${path} should be JavaScript, not SPA HTML`);
  if (assetUrl.pathname.endsWith('.svg')) assert.match(contentType, /image\/svg\+xml/i, `${path} should be an SVG image`);
}
const liveDataClient = await fetch(new URL('/assets/js/live-data-client.mjs', spa.url));
assert.equal(liveDataClient.status, 200, 'live-data client module should be published as a static asset');
assert.match(liveDataClient.headers.get('content-type') || '', /javascript/i,
  'live-data client module should not be served as the SPA HTML fallback');
const serviceWorker = await fetch(new URL('/service-worker.js', spa.url));
assert.equal(serviceWorker.status, 200, 'SPA routes should resolve the root-scoped service worker');
assert.match(serviceWorker.headers.get('content-type') || '', /javascript/i,
  'service worker should not be served as the SPA HTML fallback');

const apiManifest = await get('api/v1/manifest', { headers: { Accept: 'application/json' } });
assert.equal(apiManifest.status, 200, 'versioned map API manifest should return HTTP 200');
assert.match(apiManifest.headers.get('content-type') || '', /application\/json/i,
  'versioned API manifest must not be the SPA HTML fallback');
const apiContract = await apiManifest.json();
assert.equal(apiContract.api_version, 'v1');
assert.ok(apiContract.map_manifest?.delivery?.mvt_pmtiles,
  'versioned API manifest should describe the PMTiles vector map');
assert.ok(apiContract.resources?.pmtiles?.url,
  'versioned API manifest should expose the immutable PMTiles resource URL');

const mapStyle = await get('api/v1/style.json');
assert.equal(mapStyle.status, 200, 'Native MapLibre style should be available as JSON');
const style = await mapStyle.json();
assert.equal(style.version, 8);
assert.equal(style.sources.mazo.type, 'vector');
assert.ok(style.sources.openmaptiles?.url?.includes('/api/v1/basemap/tiles.json?revision='),
  'MapLibre style should use the self-hosted Sri Lanka TileJSON source');
assert.match(style.glyphs, /\/api\/v1\/fonts\/\{fontstack\}\/\{range\}\.pbf\?revision=/);
const darkStyle = await get('api/v1/style/dark.json');
assert.equal(darkStyle.status, 200);
assert.equal(darkStyle.headers.get('content-type')?.includes('application/json'), true);
const basemapJsonResponse = await get('api/v1/basemap/tiles.json');
assert.equal(basemapJsonResponse.status, 200, 'self-hosted basemap TileJSON should be available');
const basemapJson = await basemapJsonResponse.json();
basemapJson.bounds.forEach((value, index) => assert.ok(Math.abs(value - [79.16416, 5.621275, 82.64612, 10.07153][index]) < 1e-6));
assert.ok(basemapJson.vector_layers.some((layer) => layer.id === 'transportation'));
const basemapTile = await get('api/v1/basemap/tiles/10/744/489.pbf');
assert.equal(basemapTile.status, 200, 'Sri Lanka basemap tile should be served from R2-backed PMTiles ranges');
assert.equal(basemapTile.headers.get('content-encoding'), null, 'native basemap MVT is decoded for MapLibre clients');
assert.match(basemapTile.headers.get('cache-control') || '', /immutable/);
const basemapTileDecoded = new VectorTile(new Pbf(new Uint8Array(await basemapTile.arrayBuffer())));
assert.ok(basemapTileDecoded.layers.transportation?.length || basemapTileDecoded.layers.water?.length
  || basemapTileDecoded.layers.landuse?.length, 'basemap tile should decode to actual OSM vector features');
const nativeTileJSON = await get('api/v1/tiles.json');
assert.equal(nativeTileJSON.status, 200);
const tileJSON = await nativeTileJSON.json();
assert.equal(tileJSON.tilejson, '3.0.0');
assert.equal(tileJSON.scheme, 'xyz');
assert.equal(tileJSON.vector_layers[0].id, 'places');
const nativeTile = await get('api/v1/tiles/10/744/489.pbf');
assert.equal(nativeTile.status, 200, 'known Kattankudy XYZ tile should be served');
assert.match(nativeTile.headers.get('content-type') || '', /application\/vnd\.mapbox-vector-tile/);
assert.equal(nativeTile.headers.get('content-encoding'), 'gzip');
const nativeTileBytes = new Uint8Array(await nativeTile.arrayBuffer());
const decodedTileBytes = nativeTile.headers.get('content-encoding') === 'gzip' ? gunzipSync(nativeTileBytes) : nativeTileBytes;
const decodedTile = new VectorTile(new Pbf(decodedTileBytes));
assert.ok(decodedTile.layers.places?.length, 'known vector tile should decode to place features');
const font = await fetch(new URL(new URL(style.glyphs.replace('{fontstack}', 'Mazo%20Maps%20Sans%20Regular')
  .replace('{range}', '0-255'), base)));
assert.equal(font.status, 200, 'style glyph template should return a MapLibre glyph PBF');
assert.match(font.headers.get('content-type') || '', /application\/x-protobuf/);
const spriteJson = await get('api/v1/sprite.json');
assert.equal(spriteJson.status, 200, 'style sprite descriptor should resolve');
const spritePng = await get('api/v1/sprite.png');
assert.equal(spritePng.status, 200, 'style sprite atlas should resolve');

const manifestResponse = await get('generated/manifest.json', { headers: { 'Cache-Control': 'no-cache' } });
assert.equal(manifestResponse.status, 200, 'place manifest should return HTTP 200');
const manifest = await manifestResponse.json();
const archive = manifest.delivery?.mvt_pmtiles;
assert.ok(archive?.file && /^[a-f0-9]{64}$/.test(archive.sha256), 'manifest should contain a PMTiles file and checksum');
assert.ok(Number.isSafeInteger(archive.bytes) && archive.bytes > 127, 'manifest should contain the PMTiles byte size');

const archivePath = `generated/${archive.file}?v=${archive.sha256}`;
const range = await get(archivePath, { headers: { Range: 'bytes=0-31' } });
assert.equal(range.status, 206, 'PMTiles byte ranges should return HTTP 206');
assert.equal(range.headers.get('content-range'), `bytes 0-31/${archive.bytes}`);
assert.equal(range.headers.get('accept-ranges'), 'bytes');
assert.match(range.headers.get('cache-control') || '', /immutable/);
assert.match(range.headers.get('etag') || '', /^".+"$/);
const rangeBody = new Uint8Array(await range.arrayBuffer());
assert.equal(rangeBody.byteLength, 32);
assert.equal(new TextDecoder().decode(rangeBody.slice(0, 7)), 'PMTiles');

const suffix = await get(archivePath, { headers: { Range: 'bytes=-16' } });
assert.equal(suffix.status, 206, 'suffix ranges should return HTTP 206');
assert.equal(suffix.headers.get('content-range'), `bytes ${archive.bytes - 16}-${archive.bytes - 1}/${archive.bytes}`);
assert.equal((await suffix.arrayBuffer()).byteLength, 16);

const fullArchive = await get(archivePath);
assert.equal(fullArchive.status, 200, 'unranged PMTiles requests should return the complete archive');
const fullArchiveBytes = new Uint8Array(await fullArchive.arrayBuffer());
assert.equal(fullArchiveBytes.byteLength, archive.bytes, 'full PMTiles download should match its manifest size');
assert.equal(createHash('sha256').update(fullArchiveBytes).digest('hex'), archive.sha256,
  'full PMTiles download should match its manifest checksum for offline-pack downloads');

const chunkPath = 'generated/places-pmtiles-chunks/00000.bin';
const hiddenChunk = await get(chunkPath);
assert.equal(hiddenChunk.status, 404, 'internal chunk assets should not be directly public');
const hiddenBasemapChunk = await get('generated/sri-lanka-basemap-pmtiles-chunks/00000.bin');
assert.equal(hiddenBasemapChunk.status, 404, 'basemap range chunks should not be directly public');

console.log(JSON.stringify({
  base: base.origin,
  homepage: home.status,
  spa: spa.status,
  manifest: manifestResponse.status,
  nativeStyle: mapStyle.status,
  nativeTileJSON: nativeTileJSON.status,
  nativePbf: nativeTile.status,
  decodedPlaceFeatures: decodedTile.layers.places.length,
  glyphs: font.status,
  sprite: [spriteJson.status, spritePng.status],
  pmtilesRange: range.status,
  contentRange: range.headers.get('content-range'),
  suffixRange: suffix.status,
  fullArchive: fullArchive.status,
  hiddenChunk: hiddenChunk.status,
  hiddenBasemapChunk: hiddenBasemapChunk.status,
  archiveBytes: archive.bytes,
}, null, 2));
