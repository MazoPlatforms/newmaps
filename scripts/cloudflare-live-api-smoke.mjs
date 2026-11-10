import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';

const base = new URL(process.env.MAZO_WORKERS_URL || 'https://maps.mazo.workers.dev/');
const api = new URL('api/v1/', base);
const index = JSON.parse(await readFile('dist/generated/search-index.json', 'utf8'));
const nameColumn = index.fields.indexOf('name');
const coordinatesColumn = index.fields.indexOf('coordinates');
const probe = index.records.find((row) => typeof row[nameColumn] === 'string' && row[nameColumn].length >= 4
  && Array.isArray(row[coordinatesColumn]));
assert.ok(probe, 'generated place search index should contain a usable smoke-test query');
const query = probe[nameColumn];

async function get(path) {
  const response = await fetch(new URL(path, api), { headers: { Accept: 'application/json', Origin: 'https://ridenow.example' } });
  assert.ok(response.ok, `${path} must return a successful response (HTTP ${response.status})`);
  assert.equal(response.headers.get('access-control-allow-origin'), '*', `${path} must be CORS-readable`);
  assert.equal(response.headers.get('x-mazo-api-version'), 'v1');
  return { response, body: await response.json() };
}

async function readVersion() {
  const response = await fetch(new URL('api/version', base), { cache: 'no-store' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.revision, /^[a-f0-9]{40}$/);
  const etag = response.headers.get('etag');
  assert.ok(etag, 'version polling response should provide an ETag');
  return { body, etag };
}

let { body: liveVersion, etag: versionEtag } = await readVersion();
let unchangedVersion;
// A deploy and the push/workflow_run sync pair can briefly overlap at the edge.
// Let all routes settle on the newest manifest before requiring an unchanged
// poll to return 304; keep this bounded so genuine cache/ETag regressions fail.
for (let attempt = 0; attempt < 30; attempt += 1) {
  unchangedVersion = await fetch(new URL('api/version', base), {
    cache: 'no-store', headers: { 'If-None-Match': versionEtag },
  });
  if (unchangedVersion.status === 304) break;
  assert.equal(unchangedVersion.status, 200,
    'a concurrent publication may return the newer version before an unchanged poll returns 304');
  liveVersion = await unchangedVersion.json();
  assert.match(liveVersion.revision, /^[a-f0-9]{40}$/);
  versionEtag = unchangedVersion.headers.get('etag');
  assert.ok(versionEtag, 'newer version responses should provide an ETag');
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
assert.equal(unchangedVersion.status, 304,
  'version polling should return 304 after observing the latest concurrent update');

let catalogResult = await get('manifest');
for (let attempt = 0; catalogResult.body.revision !== liveVersion.revision && attempt < 30; attempt += 1) {
  ({ body: liveVersion, etag: versionEtag } = await readVersion());
  catalogResult = await get('manifest');
  if (catalogResult.body.revision !== liveVersion.revision) await new Promise((resolve) => setTimeout(resolve, 1000));
}
const { body: catalog } = catalogResult;
assert.equal(catalog.revision, liveVersion.revision,
  'manifest and version polling should settle on the same published revision');
const archive = catalog.manifest.files['generated/places.pmtiles'];
assert.ok(archive && /^[a-f0-9]{64}$/.test(archive.sha256));
const archiveUrl = new URL('api/data/generated/places.pmtiles', base);
archiveUrl.searchParams.set('v', archive.sha256);
archiveUrl.searchParams.set('bytes', String(archive.bytes));
const range = await fetch(archiveUrl, { headers: { Range: 'bytes=19-82' } });
assert.equal(range.status, 206, 'live R2 PMTiles byte range must return 206');
assert.equal(range.headers.get('content-range'), `bytes 19-82/${archive.bytes}`);
assert.equal((await range.arrayBuffer()).byteLength, 64);
const suffix = await fetch(archiveUrl, { headers: { Range: 'bytes=-37' } });
assert.equal(suffix.status, 206, 'live R2 PMTiles suffix range must return 206');
assert.equal(suffix.headers.get('content-range'), `bytes ${archive.bytes - 37}-${archive.bytes - 1}/${archive.bytes}`);
assert.equal((await suffix.arrayBuffer()).byteLength, 37);
const fullArchive = await fetch(archiveUrl);
assert.equal(fullArchive.status, 200);
assert.equal(createHash('sha256').update(new Uint8Array(await fullArchive.arrayBuffer())).digest('hex'), archive.sha256,
  'live R2 PMTiles full archive must match its versioned SHA-256');
const privateChunk = await fetch(new URL('generated/places-pmtiles-chunks/00000.bin', base));
assert.equal(privateChunk.status, 404, 'internal PMTiles chunks stay private after live sync');
const { body: search } = await get(`places/search?q=${encodeURIComponent(query)}&limit=5`);
assert.ok(search.results.some((place) => place.name === query), 'search should find its canonical smoke-test record');
const { body: geocode } = await get(`geocode?q=${encodeURIComponent(query)}&limit=5`);
assert.equal(geocode.type, 'FeatureCollection');
assert.ok(geocode.features.some((feature) => feature.properties.name === query));

const styleResponse = await fetch(new URL('style.json', api));
assert.equal(styleResponse.status, 200);
const style = await styleResponse.json();
assert.equal(style.sources.mazo.type, 'vector');
assert.ok(style.sources.openmaptiles?.url?.includes('/basemap/tiles.json?revision='));
const tilejsonResponse = await fetch(new URL('tiles.json', api));
assert.equal(tilejsonResponse.status, 200);
const tilejson = await tilejsonResponse.json();
assert.equal(tilejson.scheme, 'xyz');
assert.equal(tilejson.vector_layers[0].id, 'places');
const nativeTile = await fetch(new URL('tiles/10/744/489.pbf', api));
assert.equal(nativeTile.status, 200);
assert.match(nativeTile.headers.get('content-type') || '', /application\/vnd\.mapbox-vector-tile/);
const encodedTile = new Uint8Array(await nativeTile.arrayBuffer());
const decodedTile = new VectorTile(new Pbf(nativeTile.headers.get('content-encoding') === 'gzip' ? gunzipSync(encodedTile) : encodedTile));
assert.ok(decodedTile.layers.places?.length, 'synchronized PMTiles must serve decodable XYZ places');
const basemapTiles = await fetch(new URL('basemap/tiles.json', api));
assert.equal(basemapTiles.status, 200);
const basemapTile = await fetch(new URL('basemap/tiles/10/744/489.pbf', api));
assert.equal(basemapTile.status, 200);
assert.equal(basemapTile.headers.get('content-encoding'), null);
const decodedBasemapTile = new VectorTile(new Pbf(new Uint8Array(await basemapTile.arrayBuffer())));
assert.ok(decodedBasemapTile.layers.transportation?.length, 'self-hosted Sri Lanka basemap should serve actual road features');
assert.ok(decodedBasemapTile.layers.country_land?.length, 'self-hosted basemap should include its country outline');
const glyphUrl = new URL(style.glyphs.replace('{fontstack}', 'Mazo%20Maps%20Sans%20Regular').replace('{range}', '0-255'));
assert.equal((await fetch(glyphUrl)).status, 200, 'glyph resources should be published to R2 with the live data manifest');
assert.equal((await fetch(new URL('sprite.json', api))).status, 200);
assert.equal((await fetch(new URL('sprite.png', api))).status, 200);
assert.equal((await fetch(new URL('basemap/sprite.json', api))).status, 200);

const graph = JSON.parse(await readFile('dist/generated/kattankudy-routing.json', 'utf8'));
const segment = graph.segments.find((row) => (row[3] | row[4]) === 7);
assert.ok(segment, 'production routing graph should include a segment supporting driving, walking and cycling');
const from = graph.nodes[segment[0]];
const to = graph.nodes[segment[1]];
const routes = {};
for (const profile of ['driving', 'walking', 'cycling']) {
  const routeResponse = await fetch(new URL('route', api), {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Origin: 'https://ridenow.example' },
    body: JSON.stringify({ start_lon: from[0], start_lat: from[1], end_lon: to[0], end_lat: to[1], profile }),
  });
  assert.ok(routeResponse.ok, `${profile} route must return a successful response (HTTP ${routeResponse.status})`);
  assert.equal(routeResponse.headers.get('access-control-allow-origin'), '*');
  assert.equal(routeResponse.headers.get('x-mazo-api-version'), 'v1');
  const route = await routeResponse.json();
  assert.equal(route.profile, profile);
  assert.ok(route.routes.length > 0, `${profile} response should include a route`);
  assert.equal(route.routes[0].geometry.type, 'LineString');
  assert.ok(route.routes[0].geometry.coordinates.length >= 2);
  assert.ok(route.routes[0].distance > 0 && route.routes[0].duration > 0);
  assert.ok(route.routes[0].startSnapMeters <= 80 && route.routes[0].endSnapMeters <= 80);
  routes[profile] = { alternatives: route.routes.length, distance: route.routes[0].distance,
    duration: route.routes[0].duration, coordinateCount: route.routes[0].geometry.coordinates.length };
}
const countryRouteResponse = await fetch(new URL('route', api), {
  method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  body: JSON.stringify({ start_lon: 79.8612, start_lat: 6.9271, end_lon: 81.73, end_lat: 7.68, profile: 'driving' }),
});
assert.equal(countryRouteResponse.status, 200, 'self-hosted routing should connect Colombo to Kattankudy');
const countryRoute = await countryRouteResponse.json();
assert.match(countryRoute.coverage, /^Sri Lanka OSM road network/);
assert.ok(countryRoute.routes[0].distance > 100_000, 'country route should span more than 100 km');
assert.ok(countryRoute.routes[0].geometry.coordinates.length > 10, 'country route should return detailed road geometry');

const outsideCoverage = await fetch(new URL('route', api), {
  method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  body: JSON.stringify({ start_lon: 78, start_lat: 7.7, end_lon: 79.8612, end_lat: 6.9271, profile: 'driving' }),
});
assert.equal(outsideCoverage.status, 422, 'routing outside the declared Sri Lanka extract should fail');
assert.equal((await outsideCoverage.json()).error, 'outside_coverage');

console.log(JSON.stringify({ status: 'PASS', revision: liveVersion.revision,
  polling: { version: 200, conditional: unchangedVersion.status, etag: versionEtag },
  endpoints: { manifest: 200, search: 200, geocode: 200, route: 200 }, pmtiles: { byteRange: 206,
    contentRange: range.headers.get('content-range'), suffixRange: 206, fullSha256: archive.sha256, privateChunk: 404 },
  nativeMapLibre: { style: 200, tilejson: 200, tile: 200, decodedPlaceFeatures: decodedTile.layers.places.length, glyphs: 200, sprites: 200 },
  cors: 'public-read-only',
  searchQuery: query, routes,
  countrywideRoute: { from: 'Colombo', to: 'Kattankudy', distance: countryRoute.routes[0].distance,
    duration: countryRoute.routes[0].duration, coordinates: countryRoute.routes[0].geometry.coordinates.length,
    coverage: countryRoute.coverage },
  routeCoverage: 'Sri Lanka OSM road network (snapshot 261104); outside extract bounds return 422' }, null, 2));
