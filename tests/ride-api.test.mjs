import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker-core.mjs';
import { liveDataObjectKey } from '../src/live-data-registry.mjs';

const revision = 'a'.repeat(40);
const payloads = {
  'generated/manifest.json': { format: 'PMTiles/1', delivery: { mvt_pmtiles: { file: 'places.pmtiles', min_zoom: 4, max_zoom: 16 } } },
  'generated/places.pmtiles': 'pmtiles-fixture',
  'generated/search-index.json': { version: 1 },
  'generated/place-details.json': { version: 1 },
  'generated/kattankudy-roads.mzp': 'roads-fixture',
  'generated/api-search-index.json': { version: 1, fields: ['id', 'name', 'address', 'coordinates', 'discoveryCategory', 'searchText'], records: [
    ['01TESTPLACE0000000000000000', 'Harbor Clinic', 'Main Street', [79.91, 7.72], 'health', 'harbor clinic main street health clinic'],
  ] },
  'generated/kattankudy-routing-manifest.json': { graph_file: 'kattankudy-routing.json' },
  'generated/kattankudy-routing.json': { version: 1, nodes: [[79.91, 7.72], [79.911, 7.72]], ways: [{ name: 'Main Street', highway: 'residential' }], segments: [[0, 1, 0, 7, 7]] },
  'generated/sri-lanka-routing-source-manifest.json': { format: 'MazoCountryRoutingSource/1', source: 'OpenStreetMap via Geofabrik', snapshot: '261104', sha256: 'c'.repeat(64), bounds: [79.16416, 5.621275, 82.64612, 10.07153], attribution: '© OpenStreetMap contributors, ODbL 1.0', license: 'https://www.openstreetmap.org/copyright' },
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
  const manifest = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/manifest'), fixture.env);
  const contract = await manifest.json();
  assert.equal(contract.map_manifest.format, 'PMTiles/1');
  assert.equal(contract.resources.pmtiles.path, 'generated/places.pmtiles');
  assert.match(contract.resources.pmtiles.url, /\/api\/data\/generated\/places\.pmtiles\?v=/);
  assert.equal(contract.routing.offline_coverage, 'Kattankudy local road graph');
  const geocode = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/geocode?q=Harbor'), fixture.env);
  const feature = (await geocode.json()).features[0];
  assert.equal(feature.geometry.type, 'Point');
  assert.deepEqual(feature.geometry.coordinates, [79.91, 7.72]);
  assert.equal(fixture.count(), 3);
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

test('RideNow route API returns real geometry for all supported profiles and rejects out-of-coverage routes', async () => {
  const fixture = rideApiEnv();
  for (const profile of ['driving', 'walking', 'cycling']) {
    const response = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/route', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_lon: 79.91, start_lat: 7.72, end_lon: 79.911, end_lat: 7.72, profile }),
    }), fixture.env);
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.profile, profile);
    assert.equal(result.routes[0].geometry.type, 'LineString');
    assert.ok(result.routes[0].geometry.coordinates.length >= 2);
    assert.ok(result.routes[0].distance > 0);
    assert.ok(result.routes[0].duration > 0);
    assert.equal(result.routes.length, 1);
  }
  const outside = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/route', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start_lon: 80, start_lat: 8, end_lon: 80.001, end_lat: 8, profile: 'driving' }),
  }), fixture.env);
  assert.equal(outside.status, 422);
  assert.equal((await outside.json()).error, 'snap_too_far');
});

test('RideNow routing delegates all Sri Lanka profiles to the self-hosted country graph', async () => {
  const fixture = rideApiEnv();
  const requests = [];
  fixture.env.SRI_LANKA_ROUTER = { getByName: (name) => ({ fetch: async (request) => {
    requests.push({ name, request });
    const url = new URL(request.url);
    const profile = url.pathname.split('/')[3];
    return Response.json({ code: 'Ok', waypoints: [
      { distance: 7, location: [79.87, 6.93] }, { distance: 9, location: [81.7, 7.7] },
    ], routes: [{ distance: 120_000, duration: 10_000, geometry: {
      type: 'LineString', coordinates: [[79.87, 6.93], [80.4, 7.1], [81.7, 7.7]],
    }, legs: [{ steps: [{ name: 'A Road', distance: 120_000, duration: 10_000,
      maneuver: { type: 'depart', location: [79.87, 6.93] } }] }] }], profile });
  } }) };

  for (const profile of ['driving', 'walking', 'cycling']) {
    const response = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/route', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_lon: 79.87, start_lat: 6.93, end_lon: 81.7, end_lat: 7.7, profile }),
    }), fixture.env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.coverage, 'Sri Lanka OSM road network (Geofabrik snapshot 261104)');
    assert.equal(body.source.license, 'https://www.openstreetmap.org/copyright');
    assert.equal(body.routes[0].source, 'self-hosted-country-road-graph');
    assert.equal(body.routes[0].geometry.coordinates.length, 3);
    assert.equal(body.routes[0].startSnapMeters, 7);
    assert.equal(body.routes[0].endSnapMeters, 9);
    assert.equal(body.routes[0].instructions[0].name, 'A Road');
    assert.match(new URL(requests.at(-1).request.url).pathname, new RegExp(`/route/v1/${profile}/`));
    assert.equal(requests.at(-1).name, profile);
    assert.equal(requests.at(-1).request.headers.get('x-mazo-routing-source'), 'c'.repeat(64));
  }

  const beforeOutside = requests.length;
  const outside = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/route', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start_lon: 78, start_lat: 7, end_lon: 81.7, end_lat: 7.7, profile: 'driving' }),
  }), fixture.env);
  assert.equal(outside.status, 422);
  assert.equal((await outside.json()).error, 'outside_coverage');
  assert.equal(requests.length, beforeOutside, 'coordinates outside declared Sri Lanka extract bounds never reach OSRM');
});

test('RideNow v1 limits malformed or excessive traffic and marks throttle responses', async () => {
  const fixture = rideApiEnv({ allowed: false });
  const response = await worker.fetch(new Request('https://maps.mazo.workers.dev/api/v1/geocode?q=x'), fixture.env);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal((await response.json()).error, 'rate_limited');
});
