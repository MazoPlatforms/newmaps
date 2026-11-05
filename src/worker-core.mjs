import { verifySignedRequest } from './live-data-auth.mjs';
import { liveDataObjectKey } from './live-data-registry.mjs';

const PMTILES_PATH = '/generated/places.pmtiles';
const PMTILES_RANGE_MANIFEST_PATH = '/generated/places-pmtiles-range.json';
const PMTILES_CHUNK_DIRECTORY = '/generated/places-pmtiles-chunks';
const LIVE_BOOTSTRAP_PATH = '/generated/live-data-manifest.json';
const LIVE_API_PREFIX = '/api/';
const MAX_PARALLEL_CHUNK_FETCHES = 4;

function fullAssetRequest(request) {
  const headers = new Headers(request.headers);
  headers.delete('range');
  headers.delete('if-range');
  return new Request(request.url, { method: 'GET', headers });
}

function rangeNotSatisfiable(size, sourceHeaders) {
  const headers = new Headers(sourceHeaders);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Range', `bytes */${size}`);
  headers.set('Content-Length', '0');
  return new Response(null, { status: 416, headers });
}

function parseByteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value ?? '');
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return null;
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

function ifRangeMatches(request, headers) {
  const validator = request.headers.get('if-range');
  if (!validator) return true;
  const etag = headers.get('etag');
  if (etag && !validator.startsWith('W/') && validator === etag) return true;
  const modified = Date.parse(headers.get('last-modified') ?? '');
  const requested = Date.parse(validator);
  return Number.isFinite(modified) && Number.isFinite(requested) && modified <= requested;
}

function partialHeaders(sourceHeaders, start, end, size) {
  const headers = new Headers(sourceHeaders);
  headers.delete('Content-Encoding');
  headers.delete('Content-Length');
  headers.delete('Content-Range');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  return headers;
}

function noStoreNotFound() {
  return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

function apiJson(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function registryStub(env) {
  return env.LIVE_DATA_REGISTRY.getByName('mazo-live-data');
}

async function registryRead(env, path, ifNoneMatch = '') {
  const headers = new Headers();
  if (ifNoneMatch) headers.set('If-None-Match', ifNoneMatch);
  return registryStub(env).fetch(new Request(`https://live-data-registry${path}`, { headers }));
}

async function readLiveManifest(request, env) {
  const current = await registryRead(env, '/manifest');
  if (current.ok) return current;
  if (current.status !== 404) return current;
  const url = new URL(request.url);
  url.pathname = LIVE_BOOTSTRAP_PATH;
  url.search = '';
  return env.ASSETS.fetch(new Request(url, { headers: { 'Accept-Encoding': 'identity' } }));
}

function decodedLivePath(pathname) {
  try {
    const value = decodeURIComponent(pathname.slice(`${LIVE_API_PREFIX}data/`.length));
    if (!value || value.startsWith('/') || value.includes('..') || value.includes('\\') || value.includes('//')) return null;
    return value;
  } catch {
    return null;
  }
}

function safeVersionedDataHeaders(path, sha256, size, contentType) {
  return new Headers({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Type': contentType || (path.endsWith('.pmtiles') ? 'application/vnd.pmtiles' : 'application/octet-stream'),
    'ETag': `"${sha256}"`,
    'X-Content-Type-Options': 'nosniff',
    'X-Mazo-Data-SHA256': sha256,
    'Content-Length': String(size),
  });
}

function apiRangeNotSatisfiable(size, headers) {
  const result = new Headers(headers);
  result.set('Content-Range', `bytes */${size}`);
  result.set('Content-Length', '0');
  return new Response(null, { status: 416, headers: result });
}

async function serveLiveData(request, env) {
  const url = new URL(request.url);
  const path = decodedLivePath(url.pathname);
  const sha256 = url.searchParams.get('v') || '';
  const expectedBytes = Number(url.searchParams.get('bytes'));
  const bootstrap = url.searchParams.get('rev') === 'bootstrap';
  if (!path || !/^(?:generated|data)\/[A-Za-z0-9._/-]+$/.test(path) || !/^[a-f0-9]{64}$/.test(sha256)
    || !Number.isSafeInteger(expectedBytes) || expectedBytes < 0) {
    return apiJson({ error: 'A valid data path, SHA-256 version, and byte size are required.' }, 400);
  }

  const range = request.headers.get('range');
  if (bootstrap) {
    const assetUrl = new URL(request.url);
    assetUrl.pathname = `/${path}`;
    assetUrl.search = '';
    assetUrl.searchParams.set('v', sha256);
    const assetRequest = new Request(assetUrl, request);
    if (path === 'generated/places.pmtiles' && request.method === 'GET' && range) {
      return servePmtilesRange(assetRequest, env.ASSETS, Number(env.PMTILES_CHUNK_SIZE || 65_536));
    }
    return env.ASSETS.fetch(assetRequest);
  }
  if (!env.DATA_BUCKET) return apiJson({ error: 'Live data storage is not configured.' }, 503);
  if (!['GET', 'HEAD'].includes(request.method)) return apiJson({ error: 'Method not allowed.' }, 405);

  let objectKey;
  try { objectKey = liveDataObjectKey(path, sha256); } catch { return apiJson({ error: 'Invalid data path.' }, 400); }
  const headers = safeVersionedDataHeaders(path, sha256, expectedBytes, '');
  if (request.headers.get('if-none-match') === headers.get('etag')) return new Response(null, { status: 304, headers });
  const ifRange = request.headers.get('if-range');
  const useRange = Boolean(range) && (!ifRange || ifRange === headers.get('etag'));
  if (request.method === 'HEAD') {
    const object = await env.DATA_BUCKET.head(objectKey);
    if (!object || object.size !== expectedBytes || object.customMetadata?.sha256 !== sha256 || object.customMetadata?.path !== path) {
      return noStoreNotFound();
    }
    object.writeHttpMetadata(headers);
    headers.set('Content-Length', String(object.size));
    headers.set('ETag', `"${sha256}"`);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    return new Response(null, { status: 200, headers });
  }

  let bounds = null;
  if (useRange) {
    bounds = parseByteRange(range, expectedBytes);
    if (!bounds) return apiRangeNotSatisfiable(expectedBytes, headers);
  }
  const object = useRange
    ? await env.DATA_BUCKET.get(objectKey, { range: { offset: bounds.start, length: bounds.end - bounds.start + 1 } })
    : await env.DATA_BUCKET.get(objectKey);
  if (!object || object.size !== expectedBytes || object.customMetadata?.sha256 !== sha256 || object.customMetadata?.path !== path) {
    return noStoreNotFound();
  }
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', object.httpMetadata?.contentType || (path.endsWith('.pmtiles') ? 'application/vnd.pmtiles' : 'application/octet-stream'));
  headers.set('Content-Length', String(useRange ? bounds.end - bounds.start + 1 : object.size));
  headers.set('ETag', `"${sha256}"`);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Mazo-Data-SHA256', sha256);
  if (useRange) {
    headers.set('Content-Range', `bytes ${bounds.start}-${bounds.end}/${object.size}`);
    return new Response(object.body, { status: 206, headers });
  }
  return new Response(object.body, { status: 200, headers });
}

async function serveLiveAdmin(request, env) {
  const url = new URL(request.url);
  if (!['POST'].includes(request.method) || !['/api/admin/plan', '/api/admin/publish', '/api/admin/upload'].includes(url.pathname)) {
    return apiJson({ error: 'Not found.' }, 404);
  }
  if (!env.LIVE_DATA_HMAC_SECRET) return apiJson({ error: 'Live data synchronization is not configured.' }, 503);
  const signed = await verifySignedRequest(request, env.LIVE_DATA_HMAC_SECRET);
  if (!signed) return apiJson({ error: 'Invalid, expired, or mismatched synchronization signature.' }, 401);
  const registry = registryStub(env);
  const nonceResponse = await registry.fetch(new Request('https://live-data-registry/claim-nonce', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce: signed.nonce, expires_at: (signed.timestamp + 300) * 1000, now: Date.now() }),
  }));
  if (!nonceResponse.ok) return apiJson({ error: 'Synchronization replay protection is unavailable.' }, 503);
  if (!(await nonceResponse.json()).claimed) return apiJson({ error: 'Synchronization signature was already used.' }, 401);

  if (url.pathname === '/api/admin/upload') {
    const path = signed.filePath;
    const sha256 = signed.bodySha256;
    const contentType = signed.contentType;
    if (!env.DATA_BUCKET || !path || !contentType || signed.bytes.byteLength > 32 * 1024 * 1024) {
      return apiJson({ error: 'Invalid data upload.' }, 400);
    }
    let key;
    try { key = liveDataObjectKey(path, sha256); } catch { return apiJson({ error: 'Invalid data upload path.' }, 400); }
    const existing = await env.DATA_BUCKET.head(key);
    if (existing && existing.size === signed.bytes.byteLength && existing.customMetadata?.sha256 === sha256
      && existing.customMetadata?.path === path) {
      return apiJson({ uploaded: false, already_present: true, sha256 });
    }
    await env.DATA_BUCKET.put(key, signed.bytes, {
      httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
      customMetadata: { path, sha256 },
    });
    return apiJson({ uploaded: true, bytes: signed.bytes.byteLength, sha256 }, 201);
  }

  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(signed.bytes)); } catch { return apiJson({ error: 'Invalid synchronization JSON.' }, 400); }
  const registryResponse = await registry.fetch(new Request(`https://live-data-registry/${url.pathname.endsWith('/plan') ? 'plan' : 'publish'}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }));
  const body = await registryResponse.arrayBuffer();
  return new Response(body, { status: registryResponse.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

async function serveLiveApi(request, env) {
  const path = new URL(request.url).pathname;
  if (path === '/api/version' && request.method === 'GET') {
    const response = await registryRead(env, '/version', request.headers.get('if-none-match'));
    if (response.ok) return response;
    if (response.status === 304) return response;
    if (response.status !== 404) return apiJson({ error: 'Live data version is temporarily unavailable.' }, 503);
    const manifestResponse = await readLiveManifest(request, env);
    if (!manifestResponse.ok) return apiJson({ error: 'Live data bootstrap manifest is unavailable.' }, 503);
    const manifest = await manifestResponse.json();
    const revision = manifest.revision || 'bootstrap';
    const etag = `"${revision}"`;
    if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304,
      headers: { ETag: etag, 'Cache-Control': 'no-store' } });
    return new Response(JSON.stringify({ format: 'MazoLiveData/1', revision,
      run_number: manifest.run_number || 0, updated_at: manifest.updated_at || null,
      file_count: Object.keys(manifest.files || {}).length }),
    { headers: { 'Content-Type': 'application/json', ETag: etag, 'Cache-Control': 'no-store' } });
  }
  if (path === '/api/manifest' && request.method === 'GET') {
    const response = await readLiveManifest(request, env);
    if (!response.ok) return apiJson({ error: 'Live data manifest is temporarily unavailable.' }, 503);
    const manifest = await response.json();
    return new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json',
      ETag: `"${manifest.revision || 'bootstrap'}"`, 'Cache-Control': 'no-store' } });
  }
  if (path.startsWith('/api/data/')) return serveLiveData(request, env);
  if (path.startsWith('/api/admin/')) return serveLiveAdmin(request, env);
  return apiJson({ error: 'Not found.' }, 404);
}

function chunkPath(index) {
  return `${PMTILES_CHUNK_DIRECTORY}/${String(index).padStart(5, '0')}.bin`;
}

async function readChunk(request, assets, index, version) {
  const url = new URL(request.url);
  url.pathname = chunkPath(index);
  url.search = '';
  if (version) url.searchParams.set('v', version);

  const headers = new Headers();
  headers.set('Accept-Encoding', 'identity');
  const response = await assets.fetch(new Request(url, { method: 'GET', headers }));
  if (response.status !== 200) throw new Error(`PMTiles range chunk ${index} returned ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function servePmtilesRange(request, assets, chunkSize = 65_536) {
  const range = request.headers.get('range');
  if (request.method !== 'GET' || !range) return assets.fetch(request);

  const manifestUrl = new URL(request.url);
  manifestUrl.pathname = PMTILES_RANGE_MANIFEST_PATH;
  manifestUrl.search = '';
  const manifestResponse = await assets.fetch(new Request(manifestUrl, {
    headers: { 'Accept-Encoding': 'identity' },
  }));
  if (manifestResponse.status !== 200) return new Response('PMTiles range metadata is unavailable.', { status: 502 });
  let metadata;
  try {
    metadata = await manifestResponse.json();
  } catch {
    return new Response('PMTiles range metadata is invalid.', { status: 502 });
  }
  const size = Number(metadata.bytes);
  if (!Number.isSafeInteger(size) || size <= 0 || !/^[a-f0-9]{64}$/.test(metadata.sha256 || '')
    || metadata.format !== 'MazoPMTilesRange/1' || metadata.chunk_size !== chunkSize
    || metadata.chunk_count !== Math.ceil(size / chunkSize)
    || !Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    return new Response('PMTiles range metadata is invalid.', { status: 502 });
  }
  const bounds = parseByteRange(range, size);
  if (!bounds) return rangeNotSatisfiable(size, manifestResponse.headers);

  const headHeaders = new Headers(request.headers);
  headHeaders.delete('range');
  headHeaders.delete('if-range');
  headHeaders.set('Accept-Encoding', 'identity');
  const source = await assets.fetch(new Request(request.url, { method: 'HEAD', headers: headHeaders }));
  if (source.status !== 200) return source;
  const contentLength = source.headers.get('content-length');
  if (contentLength !== null) {
    const headSize = Number(contentLength);
    if (!Number.isSafeInteger(headSize) || headSize !== size) return new Response('PMTiles archive metadata is stale.', { status: 502 });
  }
  if (source.headers.get('content-type') && !source.headers.get('content-type').includes('pmtiles')) {
    return assets.fetch(fullAssetRequest(request));
  }
  if (!ifRangeMatches(request, source.headers)) return assets.fetch(fullAssetRequest(request));

  const { start, end } = bounds;
  const firstChunk = Math.floor(start / chunkSize);
  const lastChunk = Math.floor(end / chunkSize);
  const version = source.headers.get('etag') || source.headers.get('last-modified') || metadata.sha256;
  const chunkIndexes = Array.from({ length: lastChunk - firstChunk + 1 }, (_, offset) => firstChunk + offset);
  const chunks = [];
  try {
    for (let offset = 0; offset < chunkIndexes.length; offset += MAX_PARALLEL_CHUNK_FETCHES) {
      const batch = chunkIndexes.slice(offset, offset + MAX_PARALLEL_CHUNK_FETCHES);
      chunks.push(...await Promise.all(batch.map((index) => readChunk(request, assets, index, version))));
    }
  } catch {
    return new Response('PMTiles range data is temporarily unavailable.', { status: 502 });
  }

  const body = new Uint8Array(end - start + 1);
  let bodyOffset = 0;
  for (let position = 0; position < chunkIndexes.length; position += 1) {
    const index = chunkIndexes[position];
    const chunk = chunks[position];
    const chunkStart = index * chunkSize;
    const from = Math.max(start, chunkStart) - chunkStart;
    const to = Math.min(end + 1, chunkStart + chunk.byteLength) - chunkStart;
    const fragment = chunk.subarray(from, to);
    body.set(fragment, bodyOffset);
    bodyOffset += fragment.byteLength;
  }
  if (bodyOffset !== body.byteLength) return new Response('PMTiles range data is incomplete.', { status: 502 });

  return new Response(body, {
    status: 206,
    headers: partialHeaders(source.headers, start, end, size),
  });
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith(LIVE_API_PREFIX)) return serveLiveApi(request, env);
    if (pathname.startsWith(`${PMTILES_CHUNK_DIRECTORY}/`)) return noStoreNotFound();
    if (pathname !== PMTILES_PATH) return env.ASSETS.fetch(request);
    return servePmtilesRange(request, env.ASSETS, Number(env.PMTILES_CHUNK_SIZE || 65_536));
  },
};
