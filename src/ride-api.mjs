import { normalizeSearchText } from '../assets/js/search-engine.mjs';
import { findLocalRoutes } from '../assets/js/routing-graph.mjs';
import { liveDataObjectKey } from './live-data-registry.mjs';

const cache = new Map();
const API_ROOT = '/api/v1';

function response(value, status = 200, extraHeaders = {}) {
  return Response.json(value, { status, headers: {
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type, If-None-Match',
    'Access-Control-Max-Age': '600',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin',
    ...extraHeaders,
  } });
}

async function currentManifest(env) {
  const stub = env.LIVE_DATA_REGISTRY.getByName('mazo-live-data');
  const live = await stub.fetch(new Request('https://live-data-registry/manifest'));
  if (live.ok) return live.json();
  if (live.status !== 404) throw new Error('manifest unavailable');
  const bootstrap = await env.ASSETS.fetch(new Request('https://maps.invalid/generated/live-data-manifest.json'));
  if (!bootstrap.ok) throw new Error('bootstrap manifest unavailable');
  return bootstrap.json();
}

async function jsonDataset(env, manifest, path) {
  const entry = manifest.files?.[path];
  if (!entry) return null;
  const cached = cache.get(`${manifest.revision}:${path}`);
  if (cached) return cached;
  let response;
  if (manifest.revision === 'bootstrap') {
    const url = new URL(`/${path}`, 'https://maps.invalid');
    url.searchParams.set('v', entry.sha256);
    response = await env.ASSETS.fetch(new Request(url));
    if (!response.ok) throw new Error('bootstrap data unavailable');
  } else {
    const object = await env.DATA_BUCKET.get(liveDataObjectKey(path, entry.sha256));
    if (!object || object.size !== entry.bytes || object.customMetadata?.sha256 !== entry.sha256
      || object.customMetadata?.path !== path) throw new Error('published data unavailable');
    response = new Response(object.body);
  }
  const value = await response.json();
  cache.set(`${manifest.revision}:${path}`, value);
  if (cache.size > 6) cache.delete(cache.keys().next().value);
  return value;
}

function compactApiSearch(index, query, limit) {
  if (!Array.isArray(index.fields) || !Array.isArray(index.records)) throw new Error('API search projection unavailable');
  const fields = Object.fromEntries(index.fields.map((field, i) => [field, i]));
  const queryText = normalizeSearchText(query);
  if (!queryText) return [];
  const matches = [];
  for (const row of index.records) {
    const searchable = row[fields.searchText];
    if (typeof searchable !== 'string' || !searchable.includes(queryText)) continue;
    const name = row[fields.name];
    const normalizedName = normalizeSearchText(name);
    matches.push({
      id: row[fields.id], name, address: row[fields.address], coordinates: row[fields.coordinates],
      discoveryCategory: row[fields.discoveryCategory],
      score: normalizedName === queryText ? 100 : normalizedName.startsWith(queryText) ? 80 : 60,
    });
  }
  matches.sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)));
  return matches.slice(0, limit);
}

function boundedLimit(value, fallback = 10, max = 25) {
  const parsed = Number(value || fallback);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(max, parsed)) : fallback;
}

export async function handleRideApi(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (!pathname.startsWith(`${API_ROOT}/`)) return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type, If-None-Match', 'Access-Control-Max-Age': '600', Vary: 'Origin',
  } });
  const isRoute = pathname === `${API_ROOT}/route`;
  if ((isRoute && request.method !== 'POST') || (!isRoute && request.method !== 'GET')) {
    return response({ error: 'method_not_allowed' }, 405, { Allow: isRoute ? 'POST, OPTIONS' : 'GET, OPTIONS' });
  }

  const ip = request.headers.get('cf-connecting-ip') || 'unknown-client';
  if (env.API_RATE_LIMITER) {
    const allowed = await env.API_RATE_LIMITER.limit({ key: ip });
    if (!allowed.success) return response({ error: 'rate_limited', retry_after_seconds: 60 }, 429, { 'Retry-After': '60' });
  }

  try {
    const manifest = await currentManifest(env);
    const revision = manifest.revision || 'bootstrap';
    const headers = { 'X-Mazo-API-Version': 'v1', 'X-Mazo-Data-Revision': revision };
    if (pathname === `${API_ROOT}/manifest`) {
      return response({ api_version: 'v1', revision, manifest }, 200, headers);
    }

    if (pathname === `${API_ROOT}/places/search` || pathname === `${API_ROOT}/geocode`) {
      const query = (url.searchParams.get('q') || '').trim();
      if (!query || query.length > 120) return response({ error: 'query_required', max_query_characters: 120 }, 400, headers);
      const index = await jsonDataset(env, manifest, 'generated/api-search-index.json');
      if (!index) return response({ error: 'search_data_unavailable' }, 503, headers);
      const results = compactApiSearch(index, query, boundedLimit(url.searchParams.get('limit')));
      if (pathname.endsWith('/geocode')) {
        const features = results.filter((place) => Array.isArray(place.coordinates)).map((place) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: place.coordinates },
          properties: { id: place.id, name: place.name, label: place.address || place.name,
            category: place.discoveryCategory, score: place.score },
        }));
        return response({ type: 'FeatureCollection', api_version: 'v1', revision, features }, 200, headers);
      }
      return response({ api_version: 'v1', revision, query, results }, 200, headers);
    }

    if (pathname === `${API_ROOT}/route`) {
      let input = Object.fromEntries(url.searchParams.entries());
      if (request.method === 'POST') {
        try { input = await request.json(); } catch { return response({ error: 'invalid_json' }, 400, headers); }
      }
      const profile = input.profile || 'driving';
      const names = ['start_lon', 'start_lat', 'end_lon', 'end_lat'];
      const coordinates = names.map((name) => Number(input[name]));
      if (!['driving', 'walking', 'cycling'].includes(profile) || !coordinates.every(Number.isFinite)
        || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[2]) > 180
        || Math.abs(coordinates[1]) > 90 || Math.abs(coordinates[3]) > 90) {
        return response({ error: 'invalid_route_request', required: [...names, 'profile'] }, 400, headers);
      }
      const graphManifest = await jsonDataset(env, manifest, 'generated/kattankudy-routing-manifest.json');
      const graphFile = graphManifest?.graph_file;
      if (!graphFile || !/^kattankudy-routing\.json$/.test(graphFile)) return response({ error: 'routing_data_unavailable' }, 503, headers);
      const graph = await jsonDataset(env, manifest, `generated/${graphFile}`);
      if (!graph) return response({ error: 'routing_data_unavailable' }, 503, headers);
      const result = findLocalRoutes(graph, [coordinates[0], coordinates[1]], [coordinates[2], coordinates[3]], profile);
      if (result.error) return response({ error: result.error, coverage: 'Kattankudy-area local road graph', ...result }, 422, headers);
      return response({ api_version: 'v1', revision, profile, coverage: 'Kattankudy-area local road graph', ...result }, 200, headers);
    }

    return response({ error: 'not_found' }, 404, headers);
  } catch {
    return response({ error: 'temporarily_unavailable' }, 503);
  }
}
