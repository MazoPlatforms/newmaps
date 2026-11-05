import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker-core.mjs';
import { liveDataObjectKey } from '../src/live-data-registry.mjs';

const revision = 'a'.repeat(40);
const payloads = {
  'generated/api-search-index.json': { version: 1, fields: ['id', 'name', 'address', 'coordinates', 'discoveryCategory', 'searchText'], records: [
    ['01TESTPLACE0000000000000000', 'Harbor Clinic', 'Main Street', [79.91, 7.72], 'health', 'harbor clinic main street health clinic'],
  ] },
  'generated/kattankudy-routing-manifest.json': { graph_file: 'kattankudy-routing.json' },
  'generated/kattankudy-routing.json': { version: 1, nodes: [[79.91, 7.72], [79.911, 7.72]], ways: [{ name: 'Main Street', highway: 'residential' }], segments: [[0, 1, 0, 7, 7]] },
};

function rideApiEnv({ allowed = true } = {}) {
  const files = {};
  const objects = new Map();
  for (const [path, payload] of Object.entries(payloads)) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const sha256 = 'b'.repeat(64);
    const entry = { sha256, bytes: bytes.byteLength, content_type: 'application/json' };
    files[path] = entry;
    objects.set(liveDataObjectKey(path, sha256), { bytes, size: bytes.byteLength, customMetadata: { path, sha256 } });
  }
  const manifest = { format: 'MazoLiveData/1', revision, run_number: 1, files };
  let counts = 0;
  return {
    manifest,
    env: {
      LIVE_DATA_REGISTRY: { getByName: () => ({ fetch: async () => Response.json(manifest) }) },
      DATA_BUCKET: { get: async (key) => {
        const row = objects.get(key);
        return row && { ...row, body: row.bytes, httpMetadata: { contentType: 'application/json' } };
      } },
      API_RATE_LIMITER: { limit: async () => { counts += 1; return { success: allowed }; } },
    },
    count: () => counts,
  };
}

test('RideNow v1 place search and geocoding are versioned, CORS-readable and rate limited', async () => {
  const fixture = rideApiEnv();
  const search = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/places/search?q=clinic'), fixture.env);
  assert.equal(search.status, 200);
  assert.equal(search.headers.get('access-control-allow-origin'), '*');
  assert.equal(search.headers.get('x-mazo-api-version'), 'v1');
  assert.equal(search.headers.get('x-mazo-data-revision'), revision);
  assert.equal((await search.json()).results[0].name, 'Harbor Clinic');
  const geocode = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/geocode?q=Harbor'), fixture.env);
  const feature = (await geocode.json()).features[0];
  assert.equal(feature.geometry.type, 'Point');
  assert.deepEqual(feature.geometry.coordinates, [79.91, 7.72]);
  assert.equal(fixture.count(), 2);
});

test('RideNow v1 routing returns local routes and preflight exposes only documented CORS methods', async () => {
  const fixture = rideApiEnv();
  const route = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/route', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start_lon: 79.91, start_lat: 7.72, end_lon: 79.911, end_lat: 7.72, profile: 'walking' }),
  }), fixture.env);
  const body = await route.json();
  assert.equal(route.status, 200);
  assert.equal(body.profile, 'walking');
  assert.equal(body.routes.length, 1);
  assert.equal(body.coverage, 'Kattankudy-area local road graph');
  const preflight = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/route', { method: 'OPTIONS' }), fixture.env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  assert.match(preflight.headers.get('access-control-allow-methods'), /GET/);
  assert.match(preflight.headers.get('access-control-allow-methods'), /POST/);
});

test('RideNow v1 limits malformed or excessive traffic and marks throttle responses', async () => {
  const fixture = rideApiEnv({ allowed: false });
  const response = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/geocode?q=x'), fixture.env);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal((await response.json()).error, 'rate_limited');
});
