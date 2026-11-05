import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { servePmtilesRange } from '../src/worker.mjs';

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
  const assets = assetsFor();
  const request = new Request('https://example.test/generated/places.pmtiles?v=pmtiles-v1', {
    headers: { Range: 'bytes=2-5' },
  });
  const response = await worker.fetch(request, { ASSETS: assets, PMTILES_CHUNK_SIZE: String(chunkSize) });
  assert.equal(response.status, 206);
  assert.equal(await response.text(), '2345');
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(response.headers.get('Content-Range'), 'bytes 2-5/10');
  assert.equal(response.headers.get('Content-Length'), '4');
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.equal(response.headers.get('ETag'), '"pmtiles-v1"');
  assert.equal(assets.bytesRead, 8);
  assert.deepEqual(assets.requests.map((item) => new URL(item.url).pathname), [
    '/generated/places-pmtiles-range.json',
    '/generated/places.pmtiles',
    '/generated/places-pmtiles-chunks/00000.bin',
    '/generated/places-pmtiles-chunks/00001.bin',
  ]);
  assert.equal(new URL(assets.requests[2].url).searchParams.get('v'), '"pmtiles-v1"');
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
  const response = await worker.fetch(
    new Request('https://example.test/generated/places-pmtiles-chunks/00000.bin'),
    { ASSETS: assets, PMTILES_CHUNK_SIZE: String(chunkSize) },
  );
  assert.equal(response.status, 404);
  assert.equal(assets.requests.length, 0);
});
