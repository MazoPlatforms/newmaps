import { DurableObject } from 'cloudflare:workers';
import worker from './worker-core.mjs';
import { LiveDataRegistry as RegistryCore } from './live-data-registry.mjs';
import { ifNoneMatchMatches } from './http-validators.mjs';

// Keep HTTP parsing/registry logic unit-testable in Node, while the deployed
// class uses the current Durable Object runtime base and SQLite state.
export class LiveDataRegistry extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.registry = new RegistryCore(ctx, env);
  }

  fetch(request) {
    return this.registry.fetch(request);
  }
}

/*
 * Speed layer. Cloudflare's Cache API is a no-op on *.workers.dev, so before
 * this every map tile paid a Durable Object round-trip plus R2/GitHub reads and
 * a gzip inflate, even for tiles that were requested a second earlier. Two small
 * per-isolate memos remove almost all of that work:
 *  1. the live-data manifest (3 s TTL) used by every vector request;
 *  2. finished tile / font / sprite / style responses (bounded LRU).
 * Revisions are part of immutable URLs, so a data publish simply yields new keys.
 */
const MANIFEST_URL = 'https://live-data-registry/manifest';
const MANIFEST_TTL_MS = 3000;
let manifestMemo = null;

function memoManifestFetch(stub, request) {
  const now = Date.now();
  if (!manifestMemo || now - manifestMemo.at > MANIFEST_TTL_MS) {
    const memo = { at: now, promise: null };
    memo.promise = (async () => {
      const response = await stub.fetch(request);
      const body = await response.text();
      if (!response.ok && manifestMemo === memo) manifestMemo = null;
      return { status: response.status, headers: [...response.headers], body };
    })().catch((error) => { if (manifestMemo === memo) manifestMemo = null; throw error; });
    manifestMemo = memo;
  }
  return manifestMemo.promise.then(({ status, headers, body }) => new Response(body, { status, headers }));
}

function withManifestMemo(env) {
  const registry = env?.LIVE_DATA_REGISTRY;
  if (!registry || typeof registry.getByName !== 'function') return env;
  const wrapped = new Proxy(registry, {
    get(target, property) {
      if (property !== 'getByName') return Reflect.get(target, property);
      return (...args) => {
        const stub = target.getByName(...args);
        return new Proxy(stub, {
          get(stubTarget, stubProperty) {
            if (stubProperty !== 'fetch') return Reflect.get(stubTarget, stubProperty);
            return (request, init) => {
              const isManifest = request instanceof Request && request.method === 'GET' && request.url === MANIFEST_URL;
              return isManifest ? memoManifestFetch(stubTarget, request) : stubTarget.fetch(request, init);
            };
          },
        });
      };
    },
  });
  return { ...env, LIVE_DATA_REGISTRY: wrapped };
}

const TILE_PATH = /^\/api\/v1\/(?:basemap\/)?tiles\/\d+\/\d+\/\d+\.pbf$/;
const STATIC_PATH = /^\/api\/v1\/(?:fonts\/|sprite|basemap\/sprite)/;
const META_PATH = /^\/api\/v1\/(?:basemap\/tiles\.json|tiles\.json|style\.json|style\/dark\.json)$/;
const META_TTL_MS = 5000;
const MAX_ENTRIES = 240;
const MAX_BYTES = 40 * 1024 * 1024;
const MAX_ITEM_BYTES = 1024 * 1024;
const responseMemo = new Map();
let memoBytes = 0;

function memoKind(request, url) {
  if (request.method !== 'GET') return null;
  if (TILE_PATH.test(url.pathname) || STATIC_PATH.test(url.pathname)) return 'immutable';
  if (META_PATH.test(url.pathname)) return 'meta';
  return null;
}

function replay(entry, request) {
  const headers = new Headers(entry.headers);
  if (entry.status === 200 && ifNoneMatchMatches(request.headers.get('if-none-match'), headers.get('etag'))) {
    headers.delete('content-length');
    return new Response(null, { status: 304, headers });
  }
  return new Response(entry.body && entry.status !== 204 ? entry.body.slice(0) : null, { status: entry.status, headers });
}

function evict(keep) {
  for (const [key, pending] of responseMemo) {
    if (responseMemo.size <= MAX_ENTRIES && memoBytes <= MAX_BYTES) break;
    if (key === keep || !pending.entry) continue;
    memoBytes -= pending.entry.size;
    responseMemo.delete(key);
  }
}

async function memoizedFetch(request, env, ctx) {
  const url = new URL(request.url);
  const kind = memoKind(request, url);
  const memoEnv = withManifestMemo(env);
  if (!kind) return worker.fetch(request, memoEnv, ctx);
  const key = url.pathname + url.search;
  let pending = responseMemo.get(key);
  if (pending?.entry?.expires <= Date.now()) {
    memoBytes -= pending.entry.size;
    responseMemo.delete(key);
    pending = null;
  }
  if (pending) {
    responseMemo.delete(key);
    responseMemo.set(key, pending); // LRU touch
  } else {
    pending = { entry: null, promise: null };
    pending.promise = (async () => {
      const response = await worker.fetch(request, memoEnv, ctx);
      const body = response.status === 204 || response.status === 304 || !response.body ? null : await response.arrayBuffer();
      const entry = { status: response.status, headers: [...response.headers], body,
        size: body ? body.byteLength : 0, expires: kind === 'meta' ? Date.now() + META_TTL_MS : Infinity };
      const cacheable = (response.status === 200 || response.status === 204) && entry.size <= MAX_ITEM_BYTES;
      if (cacheable) { pending.entry = entry; memoBytes += entry.size; evict(key); }
      else if (responseMemo.get(key) === pending) responseMemo.delete(key);
      return entry;
    })().catch((error) => { if (responseMemo.get(key) === pending) responseMemo.delete(key); throw error; });
    responseMemo.set(key, pending);
  }
  return replay(await pending.promise, request);
}

export default { ...worker, fetch: memoizedFetch };
