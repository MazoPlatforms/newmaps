import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import worker from '../src/worker-core.mjs';
import { zxyToPmtilesId } from '../src/vector-tiles.mjs';

try { await readFile(new URL('../dist/generated/fonts/MazoMapsSansRegular/0-255.pbf', import.meta.url)); }
catch { execFileSync('python3', ['scripts/build_cloudflare_assets.py'], { stdio: 'inherit' }); }
const archive = new Uint8Array(await readFile(new URL('../generated/places.pmtiles', import.meta.url)));
const mapManifest = JSON.parse(await readFile(new URL('../generated/manifest.json', import.meta.url), 'utf8'));
const archiveSha = createHash('sha256').update(archive).digest('hex');
const mapBytes = new TextEncoder().encode(JSON.stringify(mapManifest));
const mapSha = createHash('sha256').update(mapBytes).digest('hex');
const glyphPath = 'generated/fonts/MazoMapsSansRegular/0-255.pbf';
const glyphBytes = new Uint8Array(await readFile(new URL(`../dist/${glyphPath}`, import.meta.url)));
const glyphSha = createHash('sha256').update(glyphBytes).digest('hex');
const basemapDescriptorPath = 'generated/sri-lanka-basemap-range.json';
let basemapDescriptor = null;
let basemapEntries = {};
try {
  const liveDataRoot = new URL('../.build/live-data/', import.meta.url);
  const descriptorBytes = new Uint8Array(await readFile(new URL(basemapDescriptorPath, liveDataRoot)));
  basemapDescriptor = JSON.parse(new TextDecoder().decode(descriptorBytes));
  const descriptorSha = createHash('sha256').update(descriptorBytes).digest('hex');
  basemapEntries[basemapDescriptorPath] = { sha256: descriptorSha, bytes: descriptorBytes.byteLength,
    content_type: 'application/json', storage: 'github' };
  for (const chunk of basemapDescriptor.chunks) {
    const path = `generated/sri-lanka-basemap-pmtiles-chunks/${chunk.file}`;
    basemapEntries[path] = { sha256: chunk.sha256, bytes: chunk.bytes, content_type: 'application/octet-stream', storage: 'r2-chunk' };
  }
} catch { /* Non-deployment test workflows may not generate the country basemap. */ }
const basemapChunkByHash = new Map(Object.entries(basemapEntries)
  .filter(([path]) => path.includes('-pmtiles-chunks/')).map(([path, entry]) => [entry.sha256, { path, entry }]));
const revision = 'vector-fixture-revision';
const manifest = { revision, artifact_revision: 'f'.repeat(40), files: {
  'generated/places.pmtiles': { sha256: archiveSha, bytes: archive.byteLength, content_type: 'application/vnd.pmtiles' },
  'generated/manifest.json': { sha256: mapSha, bytes: mapBytes.byteLength, content_type: 'application/json' },
  [glyphPath]: { sha256: glyphSha, bytes: glyphBytes.byteLength, content_type: 'application/x-protobuf' },
  ...basemapEntries,
} };

function fixture() {
  let readBytes = 0;
  let basemapReadBytes = 0;
  const registry = { fetch: async () => Response.json(manifest) };
  const env = {
    LIVE_DATA_REGISTRY: { getByName: () => registry },
    DATA_BUCKET: {
      get: async (_key, options = {}) => {
        const hash = _key.split('/')[1];
        const basemapChunk = basemapChunkByHash.get(hash);
        const source = hash === archiveSha ? archive : hash === mapSha ? mapBytes : hash === glyphSha ? glyphBytes : null;
        if (!source && basemapChunk) {
          const file = await readFile(new URL(`../.build/live-data/${basemapChunk.path}`, import.meta.url));
          const offset = options.range?.offset ?? 0;
          const length = options.range?.length ?? file.byteLength;
          const content = file.subarray(offset, offset + length);
          basemapReadBytes += content.byteLength;
          return { size: file.byteLength, body: new Blob([content]).stream(),
            customMetadata: { sha256: hash, path: basemapChunk.path } };
        }
        if (!source && hash === basemapEntries[basemapDescriptorPath]?.sha256) {
          const bytes = new Uint8Array(await readFile(new URL(`../dist/${basemapDescriptorPath}`, import.meta.url)));
          return { size: bytes.byteLength, body: new Blob([bytes]).stream(), customMetadata: { sha256: hash, path: basemapDescriptorPath } };
        }
        const offset = options.range?.offset ?? 0;
        const length = options.range?.length ?? source.byteLength;
        const content = source.slice(offset, offset + length);
        if (hash === archiveSha) readBytes += content.byteLength;
        return { size: source.byteLength, body: new Blob([content]).stream(),
          customMetadata: { sha256: hash,
            path: hash === archiveSha ? 'generated/places.pmtiles' : hash === mapSha ? 'generated/manifest.json' : glyphPath } };
      },
    },
    ASSETS: { fetch: async request => {
      const path = new URL(request.url).pathname;
      if (!path.startsWith('/vector-assets/') && !path.startsWith('/generated/') && !path.startsWith('/assets/')) return new Response(null, { status: 404 });
      try { return new Response(await readFile(new URL(`../dist/${path.replace(/^\//, '')}`, import.meta.url))); }
      catch { return new Response(null, { status: 404 }); }
    } },
    GITHUB_DATA_FETCH: async () => new Response(await readFile(new URL(`../.build/live-data/${basemapDescriptorPath}`, import.meta.url)),
      { headers: { 'Content-Type': 'application/json' } }),
  };
  return { env, get readBytes() { return readBytes; }, get basemapReadBytes() { return basemapReadBytes; } };
}

test('XYZ to PMTiles Hilbert ids match the archive coordinate scheme', () => {
  assert.equal(zxyToPmtilesId(10, 744, 489), 1_202_046);
  assert.equal(zxyToPmtilesId(12, 2977, 1959), 19_232_745);
  assert.equal(zxyToPmtilesId(14, 11911, 7839), 307_723_925);
});

test('TileJSON and light/dark styles are valid MapLibre Native URLs with revision pinning', async (t) => {
  if (!basemapDescriptor) return t.skip('Build the Sri Lanka basemap before validating the complete native style');
  const fx = fixture();
  const tilejsonResponse = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/tiles.json'), fx.env);
  assert.equal(tilejsonResponse.status, 200);
  assert.match(tilejsonResponse.headers.get('content-type'), /application\/json/);
  const tilejson = await tilejsonResponse.json();
  assert.equal(tilejson.tilejson, '3.0.0');
  assert.equal(tilejson.scheme, 'xyz');
  assert.equal(tilejson.vector_layers[0].id, 'places');
  assert.match(tilejson.tiles[0], /tiles\/\{z\}\/\{x\}\/\{y\}\.pbf\?revision=vector-fixture-revision/);

  for (const path of ['/api/v1/style.json', '/api/v1/style/dark.json']) {
    const response = await worker.fetch(new Request(`https://maps.mazo.workers.dev${path}`), fx.env);
    assert.equal(response.status, 200);
    const style = await response.json();
    assert.equal(style.version, 8);
    assert.match(style.glyphs, /\/api\/v1\/fonts\/\{fontstack\}\/\{range\}\.pbf\?/);
    assert.match(style.glyphs, /\?revision=vector-fixture-revision$/);
    assert.match(style.sprite, /\/api\/v1\/basemap\/sprite$/);
    assert.equal(style.sources.mazo.type, 'vector');
    assert.match(style.sources.openmaptiles.url, /\/api\/v1\/basemap\/tiles\.json\?revision=/);
    assert.equal(style.layers.some(layer => layer['source-layer'] === 'country_land'), true,
      'the whole-country OSM polygon should distinguish island land from ocean');
    const external = [style.glyphs, style.sprite, ...Object.values(style.sources).flatMap(source => [source.url, ...(source.tiles || [])])]
      .filter(Boolean).filter(value => /https?:\/\//i.test(value) && !value.startsWith('https://maps.mazo.workers.dev/'));
    assert.deepEqual(external, [], 'style resources should be served by Mazo rather than third-party hosts');
    assert.equal(style.layers.some(layer => layer['source-layer'] === 'transportation'), true);
    assert.equal(style.layers.some(layer => layer.id === 'places-label'), true);
    assert.equal(style.layers.some(layer => layer.id === 'places-dot'), true);
    const bootstrapPlaces = style.layers.find(layer => layer.id === 'places-dot');
    assert.equal(bootstrapPlaces.minzoom, 6.2, 'the preloaded preview must stay hidden at small country/world scales');
    assert.deepEqual(bootstrapPlaces.filter, ['==', ['get', 'overview'], true],
      'only the deterministic sparse subset should be considered for the country-scale preview');
    assert.equal(bootstrapPlaces.type, 'symbol', 'dense preview points need MapLibre collision placement');
    assert.equal(bootstrapPlaces.layout['text-allow-overlap'], false);
    assert.ok(bootstrapPlaces.layout['text-padding'] >= 16,
      'the preview should retain enough spacing to stay sparse at small screens');
    assert.equal(style.layers.some(layer => layer.id === 'places-halo'), false,
      'a second layer must not amplify dense place tiles');
  }
});

test('font glyph ranges and sprite atlas resources are served as assets with public cross-origin headers', async () => {
  const fx = fixture();
  const fontPath = '/api/v1/fonts/Mazo%20Maps%20Sans%20Regular/0-255.pbf?revision=vector-fixture-revision';
  const font = await worker.fetch(new Request(`https://maps.mazo.workers.dev${fontPath}`), fx.env);
  assert.equal(font.status, 200);
  assert.equal(font.headers.get('content-type'), 'application/x-protobuf');
  assert.equal(font.headers.get('access-control-allow-origin'), '*');
  assert.match(font.headers.get('cache-control'), /immutable/);
  assert.ok((await font.arrayBuffer()).byteLength > 1000);

  const extendedGlyph = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/fonts/Mazo%20Maps%20Sans%20Regular/55296-55551.pbf'), fx.env);
  assert.equal(extendedGlyph.status, 200, 'unmapped Unicode ranges use a valid local empty glyph protobuf');
  assert.equal(extendedGlyph.headers.get('content-type'), 'application/x-protobuf');
  assert.ok((await extendedGlyph.arrayBuffer()).byteLength > 0);

  const spriteJson = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/sprite.json'), fx.env);
  const spritePng = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/sprite@2x.png'), fx.env);
  assert.equal(spriteJson.status, 200);
  assert.deepEqual(Object.keys(await spriteJson.json()).sort(), ['fuel', 'health', 'place', 'school', 'worship']);
  assert.equal(spritePng.status, 200);
  assert.equal(spritePng.headers.get('content-type'), 'image/png');
  assert.deepEqual([...new Uint8Array(await spritePng.arrayBuffer()).slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('Sri Lanka basemap XYZ tiles are streamed from chunked PMTiles with truthful metadata and cache validators', { skip: !basemapDescriptor }, async () => {
  const fx = fixture();
  assert.equal(basemapDescriptor.chunk_size, 1024 * 1024);
  assert.ok(basemapDescriptor.chunk_count > 1);
  const tilejsonResponse = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/basemap/tiles.json'), fx.env);
  assert.equal(tilejsonResponse.status, 200);
  const tilejson = await tilejsonResponse.json();
  assert.equal(tilejson.scheme, 'xyz');
  tilejson.bounds.forEach((value, index) => assert.ok(Math.abs(value - basemapDescriptor.bounds[index]) < 1e-6));
  assert.ok(tilejson.vector_layers.some(layer => layer.id === 'transportation'));
  const response = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/basemap/tiles/10/744/489.pbf'), fx.env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-encoding'), null, 'the Worker decodes PMTiles gzip before MapLibre parses the binary MVT');
  assert.match(response.headers.get('cache-control'), /immutable/);
  const tileBytes = new Uint8Array(await response.arrayBuffer());
  assert.notDeepEqual([...tileBytes.slice(0, 2)], [0x1f, 0x8b], 'native tile response contains an uncompressed protobuf');
  const decoded = new VectorTile(new Pbf(tileBytes));
  assert.ok(decoded.layers.transportation || decoded.layers.water || decoded.layers.landuse,
    'full-island basemap tile should contain rendered vector layers');
  assert.ok(decoded.layers.country_land?.length, 'tile must include the OSM-derived whole-country land polygon');
  assert.ok(fx.basemapReadBytes < 128 * 1024,
    `read only ${fx.basemapReadBytes} exact PMTiles bytes, below 1 MiB chunk size (archive: ${basemapDescriptor.bytes} bytes)`);
  const conditional = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/basemap/tiles/10/744/489.pbf', {
    headers: { 'If-None-Match': response.headers.get('etag') },
  }), fx.env);
  assert.equal(conditional.status, 304);
});

test('XYZ tile response decodes the PMTiles payload by range without buffering the archive', async () => {
  const fx = fixture();
  const response = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/tiles/10/744/489.pbf'), fx.env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/vnd.mapbox-vector-tile');
  assert.equal(response.headers.get('content-encoding'), null, 'MapLibre receives the uncompressed MVT protobuf');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  const body = new Uint8Array(await response.arrayBuffer());
  assert.ok(body.byteLength > 100);
  assert.notDeepEqual([...body.slice(0, 2)], [0x1f, 0x8b], 'tile response is decoded from PMTiles gzip');
  const decoded = new VectorTile(new Pbf(body));
  assert.ok(decoded.layers.places, 'tile should contain the documented places MVT layer');
  assert.ok(decoded.layers.places.length > 0, 'sample Kattankudy XYZ tile should contain features');
  assert.match(String(decoded.layers.places.feature(0).properties.id), /^01[A-Z0-9]+$/);
  assert.ok(fx.readBytes < archive.byteLength / 4, `read ${fx.readBytes} bytes for one ${body.byteLength}-byte tile`);

  const conditional = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/tiles/10/744/489.pbf', {
    headers: { 'If-None-Match': response.headers.get('etag') },
  }), fx.env);
  assert.equal(conditional.status, 304);
});

test('tile coordinate bounds, stale revisions, missing tiles and CORS preflight are handled explicitly', async () => {
  const fx = fixture();
  assert.equal((await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/tiles/2/4/0.pbf'), fx.env)).status, 400);
  assert.equal((await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/tiles/10/744/489.pbf?revision=old'), fx.env)).status, 409);
  assert.equal((await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/tiles/10/0/0.pbf'), fx.env)).status, 204);
  const preflight = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/tiles/10/744/489.pbf', { method: 'OPTIONS' }), fx.env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
});

test('PBF rate limiting is independent from the lower-volume RideNow JSON limiter', async () => {
  const fx = fixture();
  let tileLimitKey = null;
  fx.env.VECTOR_TILE_RATE_LIMITER = { limit: async ({ key }) => { tileLimitKey = key; return { success: false }; } };
  fx.env.API_RATE_LIMITER = { limit: async () => { throw new Error('JSON API limiter must not gate the vector tile route'); } };
  const response = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/tiles/10/744/489.pbf', {
    headers: { 'cf-connecting-ip': '192.0.2.18' },
  }), fx.env);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal(tileLimitKey, '192.0.2.18');
});
