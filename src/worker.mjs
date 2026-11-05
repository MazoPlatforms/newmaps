const PMTILES_PATH = '/generated/places.pmtiles';
const PMTILES_RANGE_MANIFEST_PATH = '/generated/places-pmtiles-range.json';
const PMTILES_CHUNK_DIRECTORY = '/generated/places-pmtiles-chunks';
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
  fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith(`${PMTILES_CHUNK_DIRECTORY}/`)) return noStoreNotFound();
    if (pathname !== PMTILES_PATH) return env.ASSETS.fetch(request);
    return servePmtilesRange(request, env.ASSETS, Number(env.PMTILES_CHUNK_SIZE || 65_536));
  },
};
