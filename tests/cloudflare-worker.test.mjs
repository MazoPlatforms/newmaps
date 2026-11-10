import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { servePmtilesRange } from '../src/worker-core.mjs';
import { liveDataObjectKey } from '../src/live-data-registry.mjs';

const payload = new TextEncoder().encode('0123456789');
const chunkSize = 4;

function assetsFor(bytes = payload, headers = {}) {
  const requests = [];
  let bytesRead = 0;
  const sourceHeaders = new Headers({
    'Content-Type': 'application/vnd.pmtiles',
    'Content-Length': String(bytes.byteLength),
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: '"pmtiles-v1"',
    ...headers,
  });
  return {
    requests,
    get bytesRead() { return bytesRead; },
    fetch: async (request) => {
      requests.push(request);
      const url = new URL(request.url);
      if (url.pathname === '/generated/places-pmtiles-range.json') {
        return Response.json({
          format: 'MazoPMTilesRange/1',
          bytes: bytes.byteLength,
          sha256: 'a'.repeat(64),
          chunk_size: chunkSize,
          chunk_count: Math.ceil(bytes.byteLength / chunkSize),
        });
      }
      if (url.pathname === '/generated/places.pmtiles') {
        if (request.method === 'HEAD') return new Response(null, { headers: sourceHeaders });
        bytesRead += bytes.byteLength;
        return new Response(bytes, { headers: sourceHeaders });
      }
      const match = /\/generated\/places-pmtiles-chunks\/(\d+)\.bin$/.exec(url.pathname);
      if (match) {
        const index = Number(match[1]);
        const start = index * chunkSize;
        const chunk = bytes.slice(start, Math.min(start + chunkSize, bytes.byteLength));
        bytesRead += chunk.byteLength;
        return new Response(chunk, { headers: { 'Content-Type': 'application/octet-stream' } });
      }
      return new Response('missing', { status: 404 });
    },
  };
}

test('passes full and non-GET requests through unchanged', async () => {
  for (const request of [
    new Request('https://example.test/generated/places.pmtiles'),
    new Request('https://example.test/generated/places.pmtiles', { method: 'HEAD' }),
  ]) {
    const assets = assetsFor();
    const response = await servePmtilesRange(request, assets, chunkSize);
    assert.equal(response.status, 200);
    assert.equal(assets.requests.length, 1);
  }
});

test('serves exact ranges from only the required chunks and preserves response headers', async () => {
  const data = Uint8Array.from({ length: 70_000 }, (_, index) => index % 251);
  const chunkSize = 65_536;
  const artifactRevision = 'b'.repeat(40);
  const archiveHash = 'a'.repeat(64);
  const descriptorPath = 'generated/places-pmtiles-range.json';
  const descriptorBytes = new TextEncoder().encode(JSON.stringify({ format: 'MazoPMTilesRange/1',
    sha256: archiveHash, bytes: data.byteLength, chunk_size: chunkSize, chunk_count: 2 }));
  const descriptorHash = 'd'.repeat(64);
  const entries = {
    'generated/places.pmtiles': { sha256: archiveHash, bytes: data.byteLength, content_type: 'application/vnd.pmtiles', storage: 'r2-archive' },
    [descriptorPath]: { sha256: descriptorHash, bytes: descriptorBytes.byteLength, content_type: 'application/json', storage: 'github' },
  };
  const objects = new Map();
  for (let index = 0; index < 2; index += 1) {
    const path = `generated/places-pmtiles-chunks/${String(index).padStart(5, '0')}.bin`;
    const bytes = data.slice(index * chunkSize, Math.min(data.byteLength, (index + 1) * chunkSize));
    const hash = (index ? 'e' : 'f').repeat(64);
    entries[path] = { sha256: hash, bytes: bytes.byteLength, content_type: 'application/octet-stream', storage: 'r2-chunk' };
    objects.set(liveDataObjectKey(path, hash), { bytes, size: bytes.byteLength, customMetadata: { path, sha256: hash } });
  }
  const manifest = { format: 'MazoLiveData/1', revision: 'c'.repeat(40), artifact_revision: artifactRevision,
    run_number: 2, updated_at: '2026-11-10T00:00:00.000Z', files: entries };
  const workerCalls = [];
  const env = { ASSETS: { fetch: async () => { workerCalls.push('assets'); return new Response(null, { status: 404 }); } },
    LIVE_DATA_REGISTRY: { getByName: () => ({ fetch: async (request) => { workerCalls.push(new URL(request.url).pathname); return Response.json(manifest); } }) },
    GITHUB_DATA_ASSET_ORIGIN: 'https://raw.test/MazoPlatforms/newmaps',
    GITHUB_DATA_FETCH: async () => { workerCalls.push('github'); return new Response(descriptorBytes, { headers: { 'Content-Type': 'application/json' } }); },
    DATA_BUCKET: { get: async (key, options) => {
      const item = objects.get(key);
      if (!item) return null;
      const start = options?.range?.offset || 0;
      const end = start + (options?.range?.length ?? item.size);
      return { ...item, body: item.bytes.slice(start, end), httpMetadata: { contentType: 'application/octet-stream' } };
    } },
  };
  const response = await worker.fetch(new Request('https://example.test/generated/places.pmtiles', {
    headers: { Range: 'bytes=65534-65538' },
  }), env);
  assert.equal(response.status, 206, `${await response.clone().text()} ${JSON.stringify(workerCalls)}`);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), data.slice(65_534, 65_539));
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(response.headers.get('Content-Range'), 'bytes 65534-65538/70000');
  assert.equal(response.headers.get('Content-Length'), '5');
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.equal(response.headers.get('ETag'), `"${archiveHash}"`);
});

test('supports open-ended and suffix byte ranges', async () => {
  const openEnded = await servePmtilesRange(
    new Request('https://example.test/generated/places.pmtiles', { headers: { Range: 'bytes=8-' } }),
    assetsFor(), chunkSize,
  );
  assert.equal(await openEnded.text(), '89');
  assert.equal(openEnded.headers.get('Content-Range'), 'bytes 8-9/10');

  const suffix = await servePmtilesRange(
    new Request('https://example.test/generated/places.pmtiles', { headers: { Range: 'bytes=-3' } }),
    assetsFor(), chunkSize,
  );
  assert.equal(await suffix.text(), '789');
  assert.equal(suffix.headers.get('Content-Range'), 'bytes 7-9/10');
});

test('returns 416 without fetching chunks for malformed and unsatisfiable ranges', async () => {
  for (const value of ['bytes=20-30', 'bytes=4-2', 'bytes=0-1,4-5', 'bytes=-0', 'bytes=-']) {
    const assets = assetsFor();
    const response = await servePmtilesRange(
      new Request('https://example.test/generated/places.pmtiles', { headers: { Range: value } }),
      assets, chunkSize,
    );
    assert.equal(response.status, 416, value);
    assert.equal(response.headers.get('Content-Range'), 'bytes */10', value);
    assert.equal(assets.requests.length, 1, value);
  }
});

test('a matching If-Range serves chunks and a stale validator returns the complete archive', async () => {
  const matching = await servePmtilesRange(
    new Request('https://example.test/generated/places.pmtiles', {
      headers: { Range: 'bytes=0-2', 'If-Range': '"pmtiles-v1"' },
    }), assetsFor(), chunkSize,
  );
  assert.equal(matching.status, 206);
  assert.equal(await matching.text(), '012');

  const assets = assetsFor();
  const stale = await servePmtilesRange(
    new Request('https://example.test/generated/places.pmtiles', {
      headers: { Range: 'bytes=0-2', 'If-Range': '"old-version"' },
    }), assets, chunkSize,
  );
  assert.equal(stale.status, 200);
  assert.equal(await stale.text(), '0123456789');
  assert.equal(assets.bytesRead, payload.byteLength);
});

test('does not expose internal static chunk assets to public requests', async () => {
  const assets = assetsFor();
  for (const path of ['/generated/places-pmtiles-chunks/00000.bin', '/generated/sri-lanka-basemap-pmtiles-chunks/00000.bin']) {
    const response = await worker.fetch(new Request(`https://example.test${path}`),
      { ASSETS: assets, PMTILES_CHUNK_SIZE: String(chunkSize) });
    assert.equal(response.status, 404);
  }
  assert.equal(assets.requests.length, 0);
});
