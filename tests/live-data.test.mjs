import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignedHeaders, verifySignedRequest } from '../src/live-data-auth.mjs';
import { LiveDataRegistry, liveDataObjectKey } from '../src/live-data-registry.mjs';
import worker from '../src/worker.mjs';
import { discoverLiveData, liveDataResourceUrl, startLiveDataPolling } from '../assets/js/live-data-client.mjs';

const enc = new TextEncoder();
const secret = 'test-only-secret-that-is-long-enough-32';
const sha = 'a'.repeat(64);
const commit = 'b'.repeat(40);

function makeManifest(revision = commit, run_number = 1, files = { 'data/example.json': {
  sha256: sha, bytes: 4, content_type: 'application/json',
} }) {
  return { format: 'MazoLiveData/1', revision, run_number, updated_at: '2026-11-05T00:00:00.000Z', files };
}

test('signed admin requests validate digest, method, path, timestamp and nonce', async () => {
  const body = enc.encode('{"hello":"world"}');
  const pathname = '/api/admin/plan';
  const headers = await createSignedHeaders({ secret, method: 'POST', pathname, body, nonce: '0123456789abcdef0123456789abcdef' });
  const request = new Request(`https://maps.mazo.workers.dev${pathname}`, { method: 'POST', headers, body });
  const verified = await verifySignedRequest(request, secret);
  assert.ok(verified);
  assert.equal(new TextDecoder().decode(verified.bytes), '{"hello":"world"}');

  const tampered = new Request(`https://maps.mazo.workers.dev${pathname}`, { method: 'POST', headers, body: enc.encode('{}') });
  assert.equal(await verifySignedRequest(tampered, secret), null);
});

test('registry plans changed/deleted objects and publishes atomically with stale-run protection', async () => {
  const records = new Map();
  const storage = {
    kv: { get: (key) => records.get(key), put: (key, value) => records.set(key, value) },
    transactionSync: (fn) => fn(),
  };
  const objects = new Map();
  const env = { DATA_BUCKET: { head: async (key) => objects.get(key) || null } };
  const registry = new LiveDataRegistry({ storage }, env);
  const manifest1 = makeManifest();
  const key1 = liveDataObjectKey('data/example.json', sha);
  objects.set(key1, { size: 4, customMetadata: { sha256: sha, path: 'data/example.json' } });

  let response = await registry.fetch(new Request('https://registry/plan', { method: 'POST', body: JSON.stringify({ manifest: manifest1 }) }));
  let plan = await response.json();
  assert.deepEqual(plan.changed.map((entry) => entry.path), ['data/example.json']);
  assert.equal(plan.expected_revision, null);
  response = await registry.fetch(new Request('https://registry/publish', { method: 'POST', body: JSON.stringify({ manifest: manifest1, expected_revision: null }) }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).published, true);

  const manifest2 = makeManifest('c'.repeat(40), 2, { 'data/new.json': { sha256: 'd'.repeat(64), bytes: 2, content_type: 'application/json' } });
  objects.set(liveDataObjectKey('data/new.json', 'd'.repeat(64)), { size: 2, customMetadata: { sha256: 'd'.repeat(64), path: 'data/new.json' } });
  response = await registry.fetch(new Request('https://registry/plan', { method: 'POST', body: JSON.stringify({ manifest: manifest2 }) }));
  plan = await response.json();
  assert.deepEqual(plan.deleted, ['data/example.json']);
  response = await registry.fetch(new Request('https://registry/publish', { method: 'POST', body: JSON.stringify({ manifest: manifest2, expected_revision: commit }) }));
  assert.equal(response.status, 200);
  response = await registry.fetch(new Request('https://registry/publish', { method: 'POST', body: JSON.stringify({ manifest: manifest1, expected_revision: 'c'.repeat(40) }) }));
  assert.equal(response.status, 409);
});

test('Worker serves R2 byte and suffix ranges without buffering an entire data object', async () => {
  const data = enc.encode('0123456789');
  const key = liveDataObjectKey('generated/sample.pmtiles', sha);
  const calls = [];
  const bucket = {
    head: async () => ({ size: data.byteLength, customMetadata: { sha256: sha, path: 'generated/sample.pmtiles' } }),
    get: async (_key, options) => {
      calls.push(options);
      const offset = options?.range?.offset ?? 0;
      const length = options?.range?.length ?? data.byteLength;
      const bytes = data.slice(offset, offset + length);
      return { size: data.byteLength, body: bytes, httpMetadata: { contentType: 'application/vnd.pmtiles' },
        writeHttpMetadata: (headers) => headers.set('Content-Type', 'application/vnd.pmtiles'),
        customMetadata: { sha256: sha, path: 'generated/sample.pmtiles' } };
    },
  };
  const env = { DATA_BUCKET: bucket };
  const url = `https://maps.mazo.workers.dev/api/data/generated/sample.pmtiles?v=${sha}&bytes=${data.byteLength}`;
  const range = await worker.fetch(new Request(url, { headers: { Range: 'bytes=2-5' } }), env);
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('Content-Range'), 'bytes 2-5/10');
  assert.equal(await range.text(), '2345');
  assert.deepEqual(calls[0], { range: { offset: 2, length: 4 } });
  const suffix = await worker.fetch(new Request(url, { headers: { Range: 'bytes=-3' } }), env);
  assert.equal(suffix.status, 206);
  assert.equal(suffix.headers.get('Content-Range'), 'bytes 7-9/10');
  assert.equal(await suffix.text(), '789');
  assert.equal(calls[1].range.offset, 7);
  assert.equal(calls[1].range.length, 3);
});

test('open sessions discover new versions and offline startup uses saved validated manifest', async () => {
  const version = { format: 'MazoLiveData/1', revision: commit };
  const manifest = makeManifest();
  const values = new Map();
  const originalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    setItem: (key, value) => values.set(key, value), getItem: (key) => values.get(key),
  } });
  try {
    const live = await discoverLiveData(async (url) => url.endsWith('version')
      ? Response.json(version) : Response.json(manifest));
    assert.equal(live.version.revision, commit);
    assert.match(liveDataResourceUrl('data/example.json', live), new RegExp(`v=${sha}`));
    const offline = await discoverLiveData(async () => { throw new Error('offline'); });
    assert.equal(offline.manifest.revision, commit);

    let callback;
    let cancelled = false;
    let updated = false;
    startLiveDataPolling({ initialRevision: commit, intervalMs: 1, fetcher: async () => Response.json({ format: 'MazoLiveData/1', revision: 'c'.repeat(40) }),
      schedule: (fn) => { callback = fn; return 1; }, cancel: () => { cancelled = true; }, onUpdate: async () => { updated = true; } });
    await callback();
    assert.equal(updated, true);
    assert.equal(cancelled, true);
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalStorage });
  }
});

test('end-to-end signed sync publishes only changed objects and exposes the new revision to clients', async () => {
  const values = new Map();
  const objects = new Map();
  const storage = { kv: { get: (key) => values.get(key), put: (key, value) => values.set(key, value) }, transactionSync: (fn) => fn() };
  const registry = new LiveDataRegistry({ storage }, { DATA_BUCKET: { head: async (key) => objects.get(key) || null } });
  const bucket = {
    head: async (key) => objects.get(key) || null,
    put: async (key, bytes, options) => objects.set(key, { size: bytes.byteLength, bytes: new Uint8Array(bytes),
      customMetadata: options.customMetadata, httpMetadata: options.httpMetadata }),
    get: async (key, options) => {
      const object = objects.get(key);
      if (!object) return null;
      const start = options?.range?.offset ?? 0;
      const end = start + (options?.range?.length ?? object.size);
      return { size: object.size, body: object.bytes.slice(start, end), httpMetadata: object.httpMetadata,
        customMetadata: object.customMetadata, writeHttpMetadata: (headers) => headers.set('Content-Type', object.httpMetadata.contentType) };
    },
  };
  const env = { LIVE_DATA_HMAC_SECRET: secret, DATA_BUCKET: bucket,
    LIVE_DATA_REGISTRY: { getByName: () => ({ fetch: (request) => registry.fetch(request) }) },
    ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } };
  const content = enc.encode('new dataset');
  const contentHash = await (await import('../src/live-data-auth.mjs')).sha256Hex(content);
  const nextRevision = 'e'.repeat(40);
  const manifest = makeManifest(nextRevision, 5, { 'data/places.json': {
    sha256: contentHash, bytes: content.byteLength, content_type: 'application/json',
  } });
  async function signedCall(path, body, extra = {}) {
    const bytes = body instanceof Uint8Array ? body : enc.encode(JSON.stringify(body));
    const headers = await createSignedHeaders({ secret, method: 'POST', pathname: path, body: bytes,
      filePath: extra.filePath || '', contentType: extra.contentType || '' });
    if (extra.contentType) headers['Content-Type'] = extra.contentType;
    else headers['Content-Type'] = 'application/json';
    return worker.fetch(new Request(`https://maps.mazo.workers.dev${path}`, { method: 'POST', headers, body: bytes }), env);
  }
  let response = await signedCall('/api/admin/plan', { manifest });
  assert.equal(response.status, 200);
  const plan = await response.json();
  assert.deepEqual(plan.changed.map(({ path }) => path), ['data/places.json']);
  response = await signedCall('/api/admin/upload', content, { filePath: 'data/places.json', contentType: 'application/json' });
  assert.equal(response.status, 201);
  response = await signedCall('/api/admin/publish', { manifest, expected_revision: null });
  assert.equal(response.status, 200);

  response = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/version'), env);
  assert.equal((await response.json()).revision, nextRevision);
  response = await worker.fetch(new Request(`https://maps.mazo.workers.dev/api/data/data/places.json?v=${contentHash}&bytes=${content.byteLength}`, { headers: { Range: 'bytes=1-4' } }), env);
  assert.equal(response.status, 206);
  assert.equal(await response.text(), 'ew d');
  assert.equal(response.headers.get('Content-Range'), `bytes 1-4/${content.byteLength}`);

  const privateChunk = await worker.fetch(new Request('https://maps.mazo.workers.dev/generated/places-pmtiles-chunks/00000.bin'), env);
  assert.equal(privateChunk.status, 404);
  const badSignature = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/admin/plan', { method: 'POST', body: '{}' }), env);
  assert.equal(badSignature.status, 401);
});
