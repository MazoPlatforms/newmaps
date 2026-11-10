import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MemorySource, buildLocalBasemapStyle, loadLocalBasemap } from '../assets/js/local-basemap.mjs';

const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const sha = (data) => createHash('sha256').update(data).digest('hex');
const manifest = (overrides = {}) => ({
  format: 'MazoBasemap/1',
  archives: [
    { id: 'island', file: 'island.pmtiles', bytes: bytes.length, sha256: sha(bytes), min_zoom: 0, max_zoom: 12 },
    { id: 'detail', file: 'detail.pmtiles', bytes: bytes.length, sha256: sha(bytes), min_zoom: 13, max_zoom: 14, ...overrides },
  ],
});

test('style without archives is a blank, valid, local style', () => {
  const style = buildLocalBasemapStyle('light', null, { baseUrl: '/assets/basemap/' });
  assert.deepEqual(Object.keys(style.sources), []);
  assert.equal(style.layers.length, 1);
  assert.equal(style.glyphs, '/assets/basemap/fonts/{fontstack}/{range}.pbf');
});

test('style references only local sources and contains no remote URL', () => {
  const style = buildLocalBasemapStyle('dark', manifest(), { baseUrl: '/assets/basemap/' });
  const ids = style.layers.map((layer) => layer.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const layer of style.layers) if (layer.source) assert.ok(style.sources[layer.source], layer.id);
  assert.doesNotMatch(JSON.stringify(style).replaceAll('pmtiles://mazo-basemap-', ''), /:\/\//);
  assert.notEqual(style.layers[0].paint['background-color'], buildLocalBasemapStyle('light', manifest(), { baseUrl: '/' }).layers[0].paint['background-color']);
});

test('island roads hand over to the detail archive', () => {
  const style = buildLocalBasemapStyle('light', manifest(), { baseUrl: '/' });
  const islandRoad = style.layers.find((layer) => layer.id === 'island-road-major');
  assert.equal(islandRoad.maxzoom, 13);
  assert.ok(style.layers.some((layer) => layer.id === 'detail-building'));
});

test('MemorySource slices bytes', async () => {
  const { data } = await new MemorySource('k', bytes.buffer).getBytes(2, 3);
  assert.deepEqual([...new Uint8Array(data)], [3, 4, 5]);
});

function harness(m) {
  const added = [];
  const fetchImpl = async (url) => url.endsWith('manifest.json')
    ? new Response(JSON.stringify(m)) : new Response(bytes);
  const pmtiles = { PMTiles: class { constructor(source) { this.source = source; } } };
  return { added, args: { pmtiles, protocol: { add: (a) => added.push(a) }, fetchImpl, cacheStorage: null, baseUrl: 'http://localhost/assets/basemap/' } };
}

test('loader verifies and registers every archive', async () => {
  const { added, args } = harness(manifest());
  await loadLocalBasemap(args);
  assert.deepEqual(added.map((a) => a.source.getKey()), ['mazo-basemap-island', 'mazo-basemap-detail']);
});

test('loader rejects a tampered archive', async () => {
  const { args } = harness(manifest({ sha256: 'a'.repeat(64) }));
  await assert.rejects(loadLocalBasemap(args), /verification/);
});
