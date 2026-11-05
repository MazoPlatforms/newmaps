import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

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
assert.match(await spa.text(), /Mazo Maps/i);

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

console.log(JSON.stringify({
  base: base.origin,
  homepage: home.status,
  spa: spa.status,
  manifest: manifestResponse.status,
  pmtilesRange: range.status,
  contentRange: range.headers.get('content-range'),
  suffixRange: suffix.status,
  fullArchive: fullArchive.status,
  hiddenChunk: hiddenChunk.status,
  archiveBytes: archive.bytes,
}, null, 2));
