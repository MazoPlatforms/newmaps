const DEFAULT_ASSET_ORIGIN = 'https://raw.githubusercontent.com/MazoPlatforms/newmaps';
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const CONTENT_SHA = /^[a-f0-9]{64}$/;

function requestedBounds(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header || '');
  if (!match || (!match[1] && !match[2])) return null;
  let start; let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) return null;
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return null;
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

export function githubDataAssetUrl(path, revision, origin = DEFAULT_ASSET_ORIGIN) {
  if (typeof path !== 'string' || !/^(?:generated|data)\/[A-Za-z0-9._/-]+$/.test(path)
    || path.includes('..') || path.includes('//') || path.includes('\\') || !COMMIT_SHA.test(revision || '')) {
    throw new Error('Invalid GitHub data asset identity');
  }
  const base = new URL(origin);
  if (!['https:', 'http:'].includes(base.protocol)) throw new Error('Invalid GitHub data asset origin');
  // Snapshot commits are immutable GitHub revisions. Preserve path segments for raw.githubusercontent.com.
  return new URL(`${revision}/${path.split('/').map(encodeURIComponent).join('/')}`, `${base.href.replace(/\/$/, '')}/`);
}

export async function fetchGithubDataAsset({ request, path, revision, entry, origin, fetcher = fetch, cache = globalThis.caches?.default }) {
  if (!entry || !CONTENT_SHA.test(entry.sha256 || '') || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  let url;
  try { url = githubDataAssetUrl(path, revision, origin); } catch {
    return new Response(null, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  const range = request.headers.get('range') || '';
  // Hash addressed cache keys preserve unchanged files across snapshot commits
  // while a byte change naturally receives a different immutable cache entry.
  const cacheUrl = new URL(`https://mazo-github-data-cache.invalid/${path}`);
  cacheUrl.searchParams.set('sha256', entry.sha256);
  if (range) cacheUrl.searchParams.set('range', range);
  const cacheKey = new Request(cacheUrl, { method: 'GET' });
  if (request.method === 'GET' && cache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  const upstreamHeaders = new Headers();
  if (range) upstreamHeaders.set('Range', range);
  let upstream;
  try {
    upstream = await fetcher(url, { method: request.method, headers: upstreamHeaders, redirect: 'follow' });
  } catch {
    return new Response(null, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  if (upstream.status !== 200 && upstream.status !== 206 && upstream.status !== 304) {
    return new Response(null, { status: upstream.status === 404 ? 404 : 502, headers: { 'Cache-Control': 'no-store' } });
  }
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Type': entry.content_type || 'application/octet-stream',
    ETag: `"${entry.sha256}"`,
    'X-Content-Type-Options': 'nosniff',
    'X-Mazo-Data-SHA256': entry.sha256,
  });
  const upstreamLengthHeader = upstream.headers.get('content-length');
  const upstreamLength = upstreamLengthHeader === null ? Number.NaN : Number(upstreamLengthHeader);
  if (upstream.status === 200 && Number.isFinite(upstreamLength) && upstreamLength !== entry.bytes) {
    return new Response(null, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  if (upstream.status === 206) {
    const contentRange = upstream.headers.get('content-range') || '';
    const rangeMatch = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
    const requested = requestedBounds(range, entry.bytes);
    if (!rangeMatch || Number(rangeMatch[2]) < Number(rangeMatch[1]) || Number(rangeMatch[3]) !== entry.bytes
      || !requested || Number(rangeMatch[1]) !== requested.start || Number(rangeMatch[2]) !== requested.end
      || (Number.isFinite(upstreamLength) && upstreamLength !== Number(rangeMatch[2]) - Number(rangeMatch[1]) + 1)) {
      return new Response(null, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
    headers.set('Content-Range', contentRange);
    if (Number.isFinite(upstreamLength)) headers.set('Content-Length', String(upstreamLength));
  } else if (upstream.status === 200) headers.set('Content-Length', String(entry.bytes));
  const response = new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers });
  if (request.method === 'GET' && cache && (response.status === 200 || response.status === 206)) {
    try { await cache.put(cacheKey, response.clone()); } catch { /* Cache API rejection must not break origin delivery. */ }
  }
  return response;
}

export function isPmtilesStoragePath(path) {
  return path === 'generated/places.pmtiles'
    || path === 'generated/sri-lanka-basemap.pmtiles'
    || path.startsWith('generated/places-pmtiles-chunks/')
    || path.startsWith('generated/sri-lanka-basemap-pmtiles-chunks/');
}
