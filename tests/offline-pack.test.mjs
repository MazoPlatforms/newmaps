import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadOfflinePack, offlinePackResources, removeOfflinePack } from '../assets/js/offline-pack.mjs';

const manifests = {
  manifest: { source_sha256: 'f'.repeat(64), delivery: { mvt_pmtiles: { file: 'places.pmtiles', sha256: 'a'.repeat(64), bytes: 3 }, search_index: { file: 'search.json', sha256: 'b'.repeat(64), bytes: 3 }, place_details: { file: 'details.json', sha256: 'c'.repeat(64), bytes: 3 } } },
  roadsManifest: { geojson: 'roads.mzp', sha256: 'd'.repeat(64), bytes: 3 },
  routingManifest: { graph_file: 'routing.json', graph_sha256: 'e'.repeat(64), graph_bytes: 3 },
};

test('offline pack manifest includes search, details, place archive and local routing dependencies', () => {
  const pack = offlinePackResources(...Object.values(manifests));
  assert.equal(pack.resources.length, 8);
  assert.ok(pack.resources.some((item) => item.url.includes('places.pmtiles')));
  assert.ok(pack.resources.some((item) => item.url.includes('routing.json')));
  assert.ok(pack.resources.some((item) => item.url.includes('roads.mzp')));
  const detailsChanged = structuredClone(manifests);
  detailsChanged.manifest.delivery.place_details.sha256 = '9'.repeat(64);
  assert.notEqual(offlinePackResources(...Object.values(detailsChanged)).version, pack.version, 'detail changes must trigger an offline-pack update');
});

test('offline update verifies the full download and replaces the old version only after success', async () => {
  const values = new Map([['mazo-offline-pack-old', new Map()]]);
  const cacheStorage = {
    async keys() { return [...values.keys()]; },
    async open(name) { if (!values.has(name)) values.set(name, new Map()); const store = values.get(name); return { async put(key, value) { store.set(key, value); } }; },
    async delete(name) { return values.delete(name); },
  };
  const bytes = new TextEncoder().encode('abc');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const fixture = { ...manifests, manifest: { ...manifests.manifest, source_sha256: sha, delivery: Object.fromEntries(Object.entries(manifests.manifest.delivery).map(([key, value]) => [key, { ...value, sha256: sha }])) }, roadsManifest: { ...manifests.roadsManifest, sha256: sha }, routingManifest: { ...manifests.routingManifest, graph_sha256: sha } };
  const result = await downloadOfflinePack({ ...fixture, cacheStorage, fetcher: async () => new Response(bytes), estimate: async () => ({ quota: 1000, usage: 0 }) });
  assert.equal(result.resources, 8);
  assert.equal(values.has('mazo-offline-pack-old'), false);
  assert.equal(values.get(result.cacheName).size, 8);
});

test('failed/offline or corrupt download leaves prior pack intact and cleanup removes only offline packs', async () => {
  const values = new Map([['mazo-offline-pack-old', new Map()], ['other-app-cache', new Map()]]);
  const cacheStorage = { async keys() { return [...values.keys()]; }, async open(name) { if (!values.has(name)) values.set(name, new Map()); return { async put() {} }; }, async delete(name) { return values.delete(name); } };
  await assert.rejects(downloadOfflinePack({ ...manifests, cacheStorage, fetcher: async () => new Response('no'), estimate: async () => ({ quota: 1000, usage: 0 }) }), /Size check failed/);
  assert.equal(values.has('mazo-offline-pack-old'), true);
  assert.equal(await removeOfflinePack(cacheStorage), 1);
  assert.equal(values.has('other-app-cache'), true);
});

test('offline package checks available quota before requesting data', async () => {
  let requests = 0;
  const cacheStorage = { async keys() { return []; }, async open() { throw new Error('Cache should not open on insufficient quota'); } };
  await assert.rejects(downloadOfflinePack({ ...manifests, cacheStorage, fetcher: async () => { requests += 1; }, estimate: async () => ({ quota: 10, usage: 5 }) }), /Not enough browser storage/);
  assert.equal(requests, 0);
});
