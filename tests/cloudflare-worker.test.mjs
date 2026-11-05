import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { servePmtilesRange } from '../src/worker.mjs';

const payload = new TextEncoder().encode('0123456789');

function assetsFor(response = new Response(payload, {
  headers: {
    'Content-Type': 'application/vnd.pmtiles',
    'Content-Length': String(payload.byteLength),
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: '"pmtiles-v1"',
  },
})) {
  const requests = [];
  return {
    requests,
    fetch: async (request) => {
      requests.push(request);
      return response.clone();
    },
  };
}

test('passes non-range requests through to the static asset binding', async () => {
  const assets = assetsFor();
  const request = new Request('https://example.test/generated/places.pmtiles');
  const response = await servePmtilesRange(request, assets);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '0123456789');
  assert.equal(assets.requests.length, 1);
});

test('serves an explicit PMTiles byte range with correct 206 headers', async () => {
  const assets = assetsFor();
  const request = new Request('https://example.test/generated/places.pmtiles', {
    headers: { Range: 'bytes=2-5' },
  });
  const response = await worker.fetch(request, { ASSETS: assets });
  assert.equal(response.status, 206);
  assert.equal(await response.text(), '2345');
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(response.headers.get('Content-Range'), 'bytes 2-5/10');
  assert.equal(response.headers.get('Content-Length'), '4');
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.equal(assets.requests[0].headers.has('range'), false);
});

test('supports open-ended and suffix byte ranges', async () => {
  const openEnded = await servePmtilesRange(
    new Request('https://example.test/generated/places.pmtiles', { headers: { Range: 'bytes=8-' } }), assetsFor(),
  );
  assert.equal(await openEnded.text(), '89');
  assert.equal(openEnded.headers.get('Content-Range'), 'bytes 8-9/10');

  const suffix = await servePmtilesRange(
    new Request('https://example.test/generated/places.pmtiles', { headers: { Range: 'bytes=-3' } }), assetsFor(),
  );
  assert.equal(await suffix.text(), '789');
  assert.equal(suffix.headers.get('Content-Range'), 'bytes 7-9/10');
});

test('returns 416 for malformed, multi-range, and unsatisfiable requests', async () => {
  for (const value of ['bytes=20-30', 'bytes=4-2', 'bytes=0-1,4-5', 'bytes=-0', 'bytes=-']) {
    const response = await servePmtilesRange(
      new Request('https://example.test/generated/places.pmtiles', { headers: { Range: value } }), assetsFor(),
    );
    assert.equal(response.status, 416, value);
    assert.equal(response.headers.get('Content-Range'), 'bytes */10', value);
  }
});

test('ignores a stale If-Range validator and returns the complete asset', async () => {
  const response = await servePmtilesRange(
    new Request('https://example.test/generated/places.pmtiles', {
      headers: { Range: 'bytes=0-2', 'If-Range': '"old-version"' },
    }),
    assetsFor(),
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '0123456789');
});
