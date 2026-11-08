import { ifNoneMatchMatches } from './http-validators.mjs';
import { liveDataObjectKey } from './live-data-registry.mjs';

const API = '/api/v1';
const ARCHIVE = 'generated/places.pmtiles';
const TILE_TYPE = 'application/vnd.mapbox-vector-tile';
const DIRECTORY_CACHE = new Map();
const MAX_DIRECTORY_BYTES = 1_000_000;
const PMTILES_HEADER_BYTES = 127;
const encoder = new TextEncoder();

const POI_LAYERS = [
  { id: 'places-halo', type: 'circle', source: 'mazo', 'source-layer': 'places', minzoom: 4,
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 12, 7, 16, 10],
      'circle-color': '#ffffff', 'circle-opacity': 0.95, 'circle-stroke-width': 0 } },
  { id: 'places-dot', type: 'circle', source: 'mazo', 'source-layer': 'places', minzoom: 4,
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.2, 12, 5, 16, 7],
      'circle-color': ['match', ['get', 'kind'], 'health', '#d63b4b', 'fuel', '#e28b28',
        'school', '#7358bd', 'worship', '#29876a', 'landmark', '#b7791f', '#147d91'],
      'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.2 } },
  { id: 'places-label', type: 'symbol', source: 'mazo', 'source-layer': 'places', minzoom: 12,
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Mazo Maps Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 16, 13],
      'text-offset': [0, 1.15], 'text-anchor': 'top', 'text-max-width': 12,
      'text-allow-overlap': false, 'text-ignore-placement': false },
    paint: { 'text-color': '#243238', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 } },
];

function json(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: {
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, If-None-Match', 'Access-Control-Max-Age': '600',
    'X-Content-Type-Options': 'nosniff', 'X-Mazo-API-Version': 'v1', ...headers,
  } });
}

function pmtilesU64(view, offset) {
  const n = view.getBigUint64(offset, true);
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('PMTiles offset is too large');
  return Number(n);
}

async function bytesOf(object) {
  if (!object) throw new Error('PMTiles object range is missing');
  return new Uint8Array(await new Response(object.body).arrayBuffer());
}

function decodeVarints(bytes, count, startIndex) {
  const values = new Array(count);
  let offset = startIndex;
  for (let i = 0; i < count; i += 1) {
    let value = 0;
    let shift = 0;
    while (true) {
      if (offset >= bytes.length || shift > 49) throw new Error('Invalid PMTiles directory varint');
      const byte = bytes[offset++];
      value += (byte & 0x7f) * (2 ** shift);
      if (!(byte & 0x80)) break;
      shift += 7;
    }
    if (!Number.isSafeInteger(value)) throw new Error('PMTiles directory value exceeds safe range');
    values[i] = value;
  }
  return { values, offset };
}

async function inflateDirectory(compressed) {
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_DIRECTORY_BYTES) throw new Error('PMTiles directory exceeds size limit');
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function decodeDirectory(bytes) {
  const { values: [count], offset: afterCount } = decodeVarints(bytes, 1, 0);
  if (count > 1_000_000) throw new Error('PMTiles directory has too many entries');
  let cursor = afterCount;
  const ids = decodeVarints(bytes, count, cursor); cursor = ids.offset;
  const runLengths = decodeVarints(bytes, count, cursor); cursor = runLengths.offset;
  const lengths = decodeVarints(bytes, count, cursor); cursor = lengths.offset;
  const offsets = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const { values: [value], offset } = decodeVarints(bytes, 1, cursor); cursor = offset;
    offsets[i] = value === 0 && i > 0 ? offsets[i - 1] + lengths.values[i - 1] : value - 1;
  }
  let tileId = 0;
  for (let i = 0; i < count; i += 1) { tileId += ids.values[i]; ids.values[i] = tileId; }
  return ids.values.map((id, i) => ({ id, run: runLengths.values[i], length: lengths.values[i], offset: offsets[i] }));
}

async function directoryFor(ctx, state, offset, length, depth = 0) {
  if (depth > 4 || length <= 0 || length > MAX_DIRECTORY_BYTES) throw new Error('Invalid PMTiles directory bounds');
  const key = `${state.sha256}:${offset}:${length}`;
  if (DIRECTORY_CACHE.has(key)) return DIRECTORY_CACHE.get(key);
  // Cache only decoded bytes/entries. Never retain a request-bound R2 promise
  // across Worker requests or isolates.
  const result = decodeDirectory(await inflateDirectory(await ctx.read(offset, length)));
  DIRECTORY_CACHE.set(key, result);
  while (DIRECTORY_CACHE.size > 48) DIRECTORY_CACHE.delete(DIRECTORY_CACHE.keys().next().value);
  return result;
}

async function findTile(ctx, state, target) {
  let offset = state.rootOffset;
  let length = state.rootLength;
  for (let depth = 0; depth <= 4; depth += 1) {
    const entries = await directoryFor(ctx, state, offset, length, depth);
    let low = 0;
    let high = entries.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (entries[middle].id <= target) low = middle + 1;
      else high = middle;
    }
    const entry = entries[low - 1];
    if (!entry) return null;
    if (entry.run > 0) return target < entry.id + entry.run ? entry : null;
    offset = state.leafOffset + entry.offset;
    length = entry.length;
  }
  throw new Error('PMTiles directory nesting exceeds limit');
}

function rotate(n, point, rx, ry) {
  if (ry !== 0) return point;
  if (rx === 1) { point.x = n - 1 - point.x; point.y = n - 1 - point.y; }
  [point.x, point.y] = [point.y, point.x];
  return point;
}

export function zxyToPmtilesId(z, x, y) {
  let distance = 0;
  const point = { x, y };
  for (let scale = 2 ** (z - 1); scale > 0; scale = Math.floor(scale / 2)) {
    const rx = (point.x & scale) > 0 ? 1 : 0;
    const ry = (point.y & scale) > 0 ? 1 : 0;
    distance += scale * scale * ((3 * rx) ^ ry);
    rotate(scale, point, rx, ry);
  }
  return ((4 ** z) - 1) / 3 + distance;
}

async function getCurrentManifest(env) {
  const stub = env.LIVE_DATA_REGISTRY.getByName('mazo-live-data');
  const response = await stub.fetch(new Request('https://live-data-registry/manifest'));
  if (response.ok) return response.json();
  if (response.status !== 404) throw new Error('Live data manifest unavailable');
  const bootstrap = await env.ASSETS.fetch(new Request('https://maps.invalid/generated/live-data-manifest.json'));
  if (!bootstrap.ok) throw new Error('Bootstrap data manifest unavailable');
  return bootstrap.json();
}

async function archiveContext(env, manifest, mapManifest) {
  const entry = manifest.files?.[ARCHIVE];
  if (!entry || !Number.isSafeInteger(entry.bytes) || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')) throw new Error('Places archive is not published');
  const bootstrap = manifest.revision === 'bootstrap';
  const key = bootstrap ? null : liveDataObjectKey(ARCHIVE, entry.sha256);
  const read = async (offset, length) => {
    if (offset < 0 || length <= 0 || offset + length > entry.bytes) throw new Error('PMTiles byte range is outside archive');
    if (bootstrap) {
      const url = new URL(`/${ARCHIVE}`, 'https://maps.invalid');
      url.searchParams.set('v', entry.sha256);
      const response = await env.ASSETS.fetch(new Request(url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } }));
      if (response.status !== 206) throw new Error('Static PMTiles range read failed');
      return new Uint8Array(await response.arrayBuffer());
    }
    const object = await env.DATA_BUCKET.get(key, { range: { offset, length } });
    if (!object || object.size !== entry.bytes || object.customMetadata?.sha256 !== entry.sha256
      || object.customMetadata?.path !== ARCHIVE) throw new Error('PMTiles object does not match the active content manifest');
    return bytesOf(object);
  };
  const headerBytes = await read(0, PMTILES_HEADER_BYTES);
  const view = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength);
  if (new TextDecoder().decode(headerBytes.slice(0, 7)) !== 'PMTiles' || view.getUint8(7) !== 3) throw new Error('Unsupported PMTiles archive');
  const state = {
    sha256: entry.sha256,
    rootOffset: pmtilesU64(view, 8), rootLength: pmtilesU64(view, 16),
    leafOffset: pmtilesU64(view, 40), leafLength: pmtilesU64(view, 48),
    tileOffset: pmtilesU64(view, 56), tileLength: pmtilesU64(view, 64),
    minZoom: view.getUint8(100), maxZoom: view.getUint8(101),
    minLon: view.getInt32(102, true) / 1e7, minLat: view.getInt32(106, true) / 1e7,
    maxLon: view.getInt32(110, true) / 1e7, maxLat: view.getInt32(114, true) / 1e7,
    tileCount: pmtilesU64(view, 80), entry,
  };
  if (view.getUint8(97) !== 2 || view.getUint8(98) !== 2 || view.getUint8(99) !== 1
    || state.rootOffset < PMTILES_HEADER_BYTES || state.rootOffset + state.rootLength > entry.bytes
    || state.tileOffset + state.tileLength > entry.bytes) throw new Error('Unsupported or malformed PMTiles header');
  const delivery = mapManifest.delivery?.mvt_pmtiles;
  if (state.tileCount !== delivery?.tiles || state.maxZoom !== delivery.max_zoom || state.minZoom !== delivery.min_zoom) {
    throw new Error('PMTiles header does not match the active manifest');
  }
  return { read, state };
}

function tileJSON(base, revision, state) {
  const version = encodeURIComponent(revision);
  return {
    tilejson: '3.0.0', name: 'Mazo Maps Places', scheme: 'xyz',
    tiles: [`${base}${API}/tiles/{z}/{x}/{y}.pbf?revision=${version}`],
    minzoom: state.minZoom, maxzoom: state.maxZoom,
    bounds: [state.minLon, state.minLat, state.maxLon, state.maxLat],
    center: [81.72, 7.72, 11], attribution: '© Mazo Maps place data contributors',
    vector_layers: [{ id: 'places', fields: { id: 'String', name: 'String', kind: 'String', priority: 'Number' },
      minzoom: state.minZoom, maxzoom: state.maxZoom }],
  };
}

function style(base, theme, revision) {
  const dark = theme === 'dark';
  return {
    version: 8, name: `Mazo Maps ${dark ? 'Dark' : 'Light'} (POI vector coverage)`,
    metadata: { 'mazo:api-version': 'v1', 'mazo:data-revision': revision,
      'mazo:coverage': 'Place points cover their source coordinates; current basemap contains no road, water, building or land-use layers.' },
    glyphs: `${base}${API}/fonts/{fontstack}/{range}.pbf?revision=${encodeURIComponent(revision)}`,
    sprite: `${base}${API}/sprite?revision=${encodeURIComponent(revision)}`,
    sources: { mazo: { type: 'vector', url: `${base}${API}/tiles.json?revision=${encodeURIComponent(revision)}` } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': dark ? '#182327' : '#eef1e9' } },
      ...POI_LAYERS.map(layer => layer.id === 'places-label' ? { ...layer,
        paint: { 'text-color': dark ? '#eef6f3' : '#243238', 'text-halo-color': dark ? '#182327' : '#ffffff', 'text-halo-width': 1.5 } } : layer),
    ],
    attribution: '© Mazo Maps public place data',
  };
}

function corsHeaders(headers = {}) {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, If-None-Match', ...headers };
}

async function cacheableResponse(request, cacheKey, response) {
  if (request.method !== 'GET' || response.status !== 200 || !globalThis.caches?.default) return response;
  const cache = globalThis.caches.default;
  try { await cache.put(new Request(cacheKey), response.clone()); } catch { /* cache is an optimization */ }
  return response;
}

async function cachedResponse(request, cacheKey) {
  if (request.method !== 'GET' || !globalThis.caches?.default) return null;
  try {
    const cached = await globalThis.caches.default.match(new Request(cacheKey));
    if (!cached) return null;
    if (ifNoneMatchMatches(request.headers.get('if-none-match'), cached.headers.get('etag'))) {
      return new Response(null, { status: 304, headers: cached.headers });
    }
    return cached;
  } catch { return null; }
}

export async function handleVectorApi(request, env, rateLimitTile) {
  const url = new URL(request.url);
  if (url.pathname.startsWith(`${API}/fonts/`) || url.pathname.startsWith(`${API}/sprite`)) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET, HEAD, OPTIONS' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
    if (url.pathname.startsWith(`${API}/sprite`)) {
      const suffix = url.pathname.slice(`${API}/sprite`.length);
      if (!['.json', '.png', '@2x.json', '@2x.png'].includes(suffix)) return new Response(null, { status: 404, headers: corsHeaders() });
      const assetUrl = new URL(`/vector-assets/sprite${suffix}`, url.origin);
      const asset = await env.ASSETS.fetch(new Request(assetUrl, { method: request.method }));
      if (!asset.ok) return new Response(null, { status: 404, headers: corsHeaders() });
      const headers = corsHeaders({ 'Content-Type': suffix.endsWith('.json') ? 'application/json; charset=utf-8' : 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable', ETag: asset.headers.get('etag') || '' });
      return new Response(request.method === 'HEAD' ? null : asset.body, { status: asset.status, headers });
    }
    let fontPath;
    try { fontPath = decodeURIComponent(url.pathname.slice(`${API}/fonts/`.length)); } catch { return new Response(null, { status: 404, headers: corsHeaders() }); }
    const fontMatch = /^Mazo Maps Sans Regular\/(\d+)-(\d+)\.pbf$/.exec(fontPath);
    if (!fontMatch || Number(fontMatch[1]) % 256 !== 0 || Number(fontMatch[2]) !== Math.min(Number(fontMatch[1]) + 255, 65535)) {
      return new Response(null, { status: 404, headers: corsHeaders() });
    }
    try {
      const manifest = await getCurrentManifest(env);
      const revision = manifest.revision || 'bootstrap';
      const requestedRevision = url.searchParams.get('revision');
      if (requestedRevision && requestedRevision !== revision) return json({ error: 'stale_asset_revision' }, 409, { 'X-Mazo-Data-Revision': revision });
      const fullPath = `generated/fonts/MazoMapsSansRegular/${fontMatch[1]}-${fontMatch[2]}.pbf`;
      const entry = manifest.files?.[fullPath];
      if (!entry) {
        // During a code deployment the Static Assets bundle can be newer than
        // the still-active R2 manifest. Serve its matching build artifact so
        // deployment smoke checks work; the following data sync publishes it
        // atomically and switches clients to the immutable R2 URL revision.
        const assetUrl = new URL(`/${fullPath}`, url.origin);
        const asset = await env.ASSETS.fetch(new Request(assetUrl, { method: request.method }));
        // ASSETS is an SPA: a missing .pbf can otherwise return index.html
        // with HTTP 200. Never pass HTML to MapLibre's protobuf decoder.
        if (!asset.ok || /text\/html|application\/json/i.test(asset.headers.get('content-type') || ''))
          return new Response(null, { status: 404, headers: corsHeaders({ 'Cache-Control': 'public, max-age=300' }) });
        return new Response(request.method === 'HEAD' ? null : asset.body, { status: 200, headers: corsHeaders({
          'Content-Type': 'application/x-protobuf', 'Cache-Control': 'public, max-age=300',
          ETag: asset.headers.get('etag') || '', 'X-Mazo-Data-Revision': revision,
        }) });
      }
      let asset;
      if (revision === 'bootstrap') {
        asset = await env.ASSETS.fetch(new Request(new URL(`/${fullPath}`, url.origin), { method: request.method }));
      } else {
        const key = liveDataObjectKey(fullPath, entry.sha256);
        const object = request.method === 'HEAD' ? await env.DATA_BUCKET.head(key) : await env.DATA_BUCKET.get(key);
        if (!object || object.size !== entry.bytes || object.customMetadata?.sha256 !== entry.sha256
          || object.customMetadata?.path !== fullPath) return new Response(null, { status: 404, headers: corsHeaders() });
        asset = new Response(request.method === 'HEAD' ? null : object.body, { status: 200 });
      }
      if (!asset.ok || /text\/html|application\/json/i.test(asset.headers.get('content-type') || ''))
        return new Response(null, { status: 404, headers: corsHeaders() });
      const etag = `"${entry.sha256}"`;
      const headers = corsHeaders({ 'Content-Type': 'application/x-protobuf', 'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: etag, 'X-Mazo-Data-Revision': revision, 'X-Content-Type-Options': 'nosniff' });
      if (ifNoneMatchMatches(request.headers.get('if-none-match'), etag)) return new Response(null, { status: 304, headers });
      return new Response(request.method === 'HEAD' ? null : asset.body, { status: 200, headers });
    } catch {
      return json({ error: 'font_asset_unavailable' }, 503);
    }
  }

  if (url.pathname === `${API}/tiles.json` || url.pathname === `${API}/style.json`
    || url.pathname === `${API}/style/dark.json`) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET, HEAD, OPTIONS' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
    try {
      const manifest = await getCurrentManifest(env);
      const revision = manifest.revision || 'bootstrap';
      const key = `https://vector-cache.invalid/${revision}${url.pathname}${url.search}`;
      const cached = await cachedResponse(request, key);
      if (cached) return cached;
      const mapManifest = manifest.files?.['generated/manifest.json'];
      if (!mapManifest) return json({ error: 'map_manifest_unavailable' }, 503);
      const mapResponse = manifest.revision === 'bootstrap'
        ? await env.ASSETS.fetch(new Request('https://maps.invalid/generated/manifest.json'))
        : await env.DATA_BUCKET.get(liveDataObjectKey('generated/manifest.json', mapManifest.sha256));
      if (!mapResponse) return json({ error: 'map_manifest_unavailable' }, 503);
      const map = manifest.revision === 'bootstrap' ? await mapResponse.json() : await new Response(mapResponse.body).json();
      const { state } = await archiveContext(env, manifest, map);
      let value;
      if (url.pathname === `${API}/tiles.json`) value = tileJSON(url.origin, revision, state);
      else if (url.pathname === `${API}/style.json` || url.pathname === `${API}/style/dark.json`) {
        value = style(url.origin, url.pathname.endsWith('/dark.json') || url.searchParams.get('theme') === 'dark' ? 'dark' : 'light', revision);
      }
      const body = JSON.stringify(value);
      const etag = `W/"${revision}-${await shortHash(body)}"`;
      const headers = corsHeaders({ 'Content-Type': 'application/json; charset=utf-8', ETag: etag,
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600', 'X-Mazo-Data-Revision': revision });
      if (ifNoneMatchMatches(request.headers.get('if-none-match'), etag)) return new Response(null, { status: 304, headers });
      const response = new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
      return cacheableResponse(request, key, response);
    } catch {
      console.error(JSON.stringify({ event: 'vector_metadata_error', path: url.pathname }));
      return json({ error: 'vector_metadata_unavailable' }, 503);
    }
  }

  const match = new RegExp(`^${API}/tiles/(\\d+)/(\\d+)/(\\d+)\\.pbf$`).exec(url.pathname);
  if (!match) return null;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET, HEAD, OPTIONS' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  const z = Number(match[1]); const x = Number(match[2]); const y = Number(match[3]);
  if (!Number.isSafeInteger(z) || z < 0 || z > 22 || !Number.isSafeInteger(x) || !Number.isSafeInteger(y)
    || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return json({ error: 'invalid_tile_coordinate' }, 400);
  if (rateLimitTile) {
    const allowed = await rateLimitTile(request);
    if (!allowed) return json({ error: 'rate_limited', retry_after_seconds: 60 }, 429, { 'Retry-After': '60' });
  }
  try {
    const manifest = await getCurrentManifest(env);
    const revision = manifest.revision || 'bootstrap';
    const version = url.searchParams.get('revision');
    if (version && version !== revision) return json({ error: 'stale_tile_revision' }, 409, { 'X-Mazo-Data-Revision': revision });
    const cacheKey = `https://vector-cache.invalid/${revision}/${z}/${x}/${y}.pbf`;
    const cached = await cachedResponse(request, cacheKey);
    if (cached) return cached;
    const mapEntry = manifest.files?.['generated/manifest.json'];
    if (!mapEntry) return json({ error: 'map_manifest_unavailable' }, 503);
    const mapObject = manifest.revision === 'bootstrap'
      ? await env.ASSETS.fetch(new Request('https://maps.invalid/generated/manifest.json'))
      : await env.DATA_BUCKET.get(liveDataObjectKey('generated/manifest.json', mapEntry.sha256));
    if (!mapObject) return json({ error: 'map_manifest_unavailable' }, 503);
    const mapManifest = manifest.revision === 'bootstrap' ? await mapObject.json() : await new Response(mapObject.body).json();
    const { read, state } = await archiveContext(env, manifest, mapManifest);
    if (z < state.minZoom || z > state.maxZoom) return new Response(null, { status: 204, headers: corsHeaders({
      'Cache-Control': 'public, max-age=86400', 'X-Mazo-Data-Revision': manifest.revision }) });
    const id = zxyToPmtilesId(z, x, y);
    const tile = await findTile({ read }, state, id);
    if (!tile) return new Response(null, { status: 204, headers: corsHeaders({
      'Cache-Control': 'public, max-age=86400', 'X-Mazo-Data-Revision': manifest.revision }) });
    const offset = state.tileOffset + tile.offset;
    if (tile.length < 1 || tile.length > 4 * 1024 * 1024 || offset + tile.length > state.tileOffset + state.tileLength) {
      throw new Error('PMTiles tile payload has invalid bounds');
    }
    const etag = `"${state.sha256}-${z}-${x}-${y}"`;
    const headers = corsHeaders({ 'Content-Type': TILE_TYPE, 'Content-Encoding': 'gzip',
      'Cache-Control': 'public, max-age=31536000, immutable', ETag: etag, 'Vary': 'Accept-Encoding',
      'X-Mazo-Data-Revision': manifest.revision || 'bootstrap', 'X-Content-Type-Options': 'nosniff' });
    if (ifNoneMatchMatches(request.headers.get('if-none-match'), etag)) return new Response(null, { status: 304, headers });
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
    const tileBytes = await read(offset, tile.length);
    if (tileBytes.byteLength !== tile.length) throw new Error('PMTiles tile payload is truncated');
    const response = new Response(tileBytes, { status: 200, headers });
    return cacheableResponse(request, cacheKey, response);
    } catch {
      console.error(JSON.stringify({ event: 'vector_tile_error', z, x, y }));
    return json({ error: 'tile_unavailable' }, 503);
  }
}

async function shortHash(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest).slice(0, 10)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
