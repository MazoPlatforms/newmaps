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

export async function servePmtilesRange(request, assets) {
  const range = request.headers.get('range');
  if (request.method !== 'GET' || !range) return assets.fetch(request);

  const source = await assets.fetch(fullAssetRequest(request));
  if (source.status !== 200) return source;
  if (!ifRangeMatches(request, source.headers)) return source;

  const bytes = await source.arrayBuffer();
  const bounds = parseByteRange(range, bytes.byteLength);
  if (!bounds) return rangeNotSatisfiable(bytes.byteLength, source.headers);

  const { start, end } = bounds;
  return new Response(bytes.slice(start, end + 1), {
    status: 206,
    headers: partialHeaders(source.headers, start, end, bytes.byteLength),
  });
}

export default {
  fetch(request, env) {
    return servePmtilesRange(request, env.ASSETS);
  },
};
