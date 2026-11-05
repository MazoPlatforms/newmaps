import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

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

const version = await fetch(new URL('api/version', base), { cache: 'no-store' });
assert.equal(version.status, 200);
const liveVersion = await version.json();
assert.match(liveVersion.revision, /^[a-f0-9]{40}$/);
const versionEtag = version.headers.get('etag');
assert.ok(versionEtag, 'version polling response should provide an ETag');
const unchangedVersion = await fetch(new URL('api/version', base), {
  cache: 'no-store', headers: { 'If-None-Match': versionEtag },
});
assert.equal(unchangedVersion.status, 304, 'unchanged live manifests should respond to conditional polls with 304');
const { body: catalog } = await get('manifest');
assert.equal(catalog.revision, liveVersion.revision);
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

const graph = JSON.parse(await readFile('dist/generated/kattankudy-routing.json', 'utf8'));
const segment = graph.segments.find((row) => (row[3] | row[4]) & 1);
assert.ok(segment, 'production routing graph should include a driving segment');
const from = graph.nodes[segment[0]];
const to = graph.nodes[segment[1]];
const routeResponse = await fetch(new URL('route', api), {
  method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Origin: 'https://ridenow.example' },
  body: JSON.stringify({ start_lon: from[0], start_lat: from[1], end_lon: to[0], end_lat: to[1], profile: 'driving' }),
});
assert.ok(routeResponse.ok, `route must return a successful response (HTTP ${routeResponse.status})`);
assert.equal(routeResponse.headers.get('access-control-allow-origin'), '*');
assert.equal(routeResponse.headers.get('x-mazo-api-version'), 'v1');
const route = await routeResponse.json();
assert.equal(route.profile, 'driving');
assert.ok(route.routes.length > 0);

console.log(JSON.stringify({ status: 'PASS', revision: liveVersion.revision,
  polling: { version: 200, conditional: unchangedVersion.status, etag: versionEtag },
  endpoints: { manifest: 200, search: 200, geocode: 200, route: 200 }, pmtiles: { byteRange: 206,
    contentRange: range.headers.get('content-range'), suffixRange: 206, fullSha256: archive.sha256, privateChunk: 404 },
  cors: 'public-read-only',
  searchQuery: query, routeCoverage: route.coverage }, null, 2));
