import { ifNoneMatchMatches } from './http-validators.mjs';

const COMMIT_SHA = /^[a-f0-9]{40}$/;
const CONTENT_SHA = /^[a-f0-9]{64}$/;
const ALLOWED_PATH = /^(?:generated|data)\/[A-Za-z0-9._/-]+$/;
const MAX_FILES = 5000;

function storageFor(path, entry) {
  if (entry?.storage) return entry.storage;
  return path.endsWith('.pmtiles') ? 'legacy-r2-archive' : 'legacy-r2';
}

function validPath(path) {
  return typeof path === 'string' && ALLOWED_PATH.test(path)
    && !path.includes('..') && !path.includes('//') && !path.includes('\\');
}

export function validateLiveManifest(manifest) {
  if (!manifest || manifest.format !== 'MazoLiveData/1' || !COMMIT_SHA.test(manifest.revision || '')
    || !Number.isSafeInteger(manifest.run_number) || manifest.run_number < 1
    || !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) {
    throw new Error('Invalid live data manifest envelope');
  }
  const entries = Object.entries(manifest.files);
  if (manifest.artifact_revision !== undefined && !COMMIT_SHA.test(manifest.artifact_revision || '')) {
    throw new Error('Invalid GitHub data snapshot commit');
  }
  if (entries.length === 0 || entries.length > MAX_FILES) throw new Error('Live data manifest file count is invalid');
  let totalBytes = 0;
  for (const [path, entry] of entries) {
    if (!validPath(path) || !entry || !CONTENT_SHA.test(entry.sha256 || '')
      || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0
      || typeof entry.content_type !== 'string' || entry.content_type.length > 160) {
      throw new Error(`Invalid live data file entry: ${path}`);
    }
    if (entry.storage !== undefined && !['github', 'r2-archive', 'r2-chunk'].includes(entry.storage)) {
      throw new Error(`Invalid live data storage provider: ${path}`);
    }
    if ((entry.storage === 'r2-archive' && !path.endsWith('.pmtiles'))
      || (entry.storage === 'r2-chunk' && !/^generated\/(?:places|sri-lanka-basemap)-pmtiles-chunks\/[0-9]{5}\.bin$/.test(path))
      || (entry.storage === 'github' && (path.endsWith('.pmtiles')
        || /^generated\/(?:places|sri-lanka-basemap)-pmtiles-chunks\//.test(path)))) {
      throw new Error(`Live data is assigned to an invalid storage provider: ${path}`);
    }
    totalBytes += entry.bytes;
  }
  if (!Number.isSafeInteger(totalBytes)) throw new Error('Live data manifest size is invalid');
  return manifest;
}

export function liveDataObjectKey(path, sha256) {
  if (!validPath(path) || !CONTENT_SHA.test(sha256 || '')) throw new Error('Invalid live object key');
  const pathHex = Array.from(new TextEncoder().encode(path), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `objects/${sha256}/${pathHex}`;
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function currentRecord(storage) {
  return storage.kv.get('live-data-current') || null;
}

function claimNonce(storage, nonce, expiresAt, now) {
  if (!/^[a-f0-9-]{16,64}$/i.test(nonce || '') || !Number.isSafeInteger(expiresAt)
    || expiresAt <= now || expiresAt > now + 10 * 60_000) return false;
  return storage.transactionSync(() => {
    const active = storage.kv.get('live-data-sync-nonces') || {};
    for (const [usedNonce, deadline] of Object.entries(active)) {
      if (!Number.isSafeInteger(deadline) || deadline <= now) delete active[usedNonce];
    }
    if (Object.hasOwn(active, nonce) || Object.keys(active).length >= 20_000) return false;
    active[nonce] = expiresAt;
    storage.kv.put('live-data-sync-nonces', active);
    return true;
  });
}

export class LiveDataRegistry {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/claim-nonce') {
      let payload;
      try { payload = await request.json(); } catch { return json({ error: 'Invalid nonce claim.' }, 400); }
      const claimed = claimNonce(this.ctx.storage, payload.nonce, payload.expires_at, payload.now);
      return json({ claimed });
    }
    if (request.method === 'GET' && url.pathname === '/version') {
      const record = currentRecord(this.ctx.storage);
      if (!record) return json({ error: 'Live data has not been synchronized.' }, 404);
      const etag = `"${record.manifest.revision}"`;
      if (ifNoneMatchMatches(request.headers.get('if-none-match'), etag)) {
        return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'no-store' } });
      }
      return Response.json({ format: 'MazoLiveData/1', revision: record.manifest.revision, run_number: record.run_number,
        updated_at: record.manifest.updated_at, file_count: Object.keys(record.manifest.files).length },
      { headers: { ETag: etag, 'Cache-Control': 'no-store' } });
    }
    if (request.method === 'GET' && url.pathname === '/manifest') {
      const record = currentRecord(this.ctx.storage);
      return record ? json(record.manifest) : json({ error: 'Live data has not been synchronized.' }, 404);
    }
    if (request.method !== 'POST' || !['/plan', '/publish'].includes(url.pathname)) return json({ error: 'Not found.' }, 404);

    let payload;
    try { payload = await request.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
    let candidate;
    try { candidate = validateLiveManifest(payload.manifest || payload); } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid live data manifest.' }, 400);
    }
    const record = currentRecord(this.ctx.storage);
    if (url.pathname === '/plan') {
      const previous = record?.manifest.files || {};
      const changed = Object.entries(candidate.files)
        .filter(([path, entry]) => previous[path]?.sha256 !== entry.sha256 || previous[path]?.bytes !== entry.bytes
          || storageFor(path, previous[path]) !== storageFor(path, entry))
        .map(([path, entry]) => ({ path, ...entry }));
      const deleted = Object.keys(previous).filter((path) => !Object.hasOwn(candidate.files, path)).sort();
      const upload = [];
      if (!this.env.DATA_BUCKET && changed.some(({ path, ...entry }) => storageFor(path, entry) === 'r2-chunk')) {
        return json({ error: 'PMTiles storage is not configured.' }, 503);
      }
      for (const entry of changed) {
        if (storageFor(entry.path, entry) !== 'r2-chunk') continue;
        const object = await this.env.DATA_BUCKET.head(liveDataObjectKey(entry.path, entry.sha256));
        if (!object || object.size !== entry.bytes || object.customMetadata?.sha256 !== entry.sha256
          || object.customMetadata?.path !== entry.path) upload.push(entry);
      }
      return json({ expected_revision: record?.manifest.revision || null, changed, upload, deleted,
        unchanged: Object.keys(candidate.files).length - changed.length });
    }

    const expectedRevision = payload.expected_revision ?? null;
    if (record?.manifest.revision === candidate.revision) {
      return json({ published: true, idempotent: true, revision: candidate.revision,
        file_count: Object.keys(candidate.files).length });
    }
    if ((record?.manifest.revision || null) !== expectedRevision) {
      return json({ error: 'Live data changed while this sync was running; create a fresh plan and retry.',
        current_revision: record?.manifest.revision || null }, 409);
    }
    if (record && candidate.run_number <= record.run_number) {
      return json({ error: 'Refusing to publish an older or replayed GitHub Actions run.', current_run_number: record.run_number }, 409);
    }

    const previous = record?.manifest.files || {};
    const changed = Object.entries(candidate.files)
      .filter(([path, entry]) => previous[path]?.sha256 !== entry.sha256 || previous[path]?.bytes !== entry.bytes
        || storageFor(path, previous[path]) !== storageFor(path, entry));
    const missing = [];
    for (const [path, entry] of changed) {
      if (storageFor(path, entry) !== 'r2-chunk') continue;
      const object = await this.env.DATA_BUCKET.head(liveDataObjectKey(path, entry.sha256));
      if (!object || object.size !== entry.bytes || object.customMetadata?.sha256 !== entry.sha256
        || object.customMetadata?.path !== path) missing.push(path);
    }
    if (missing.length) return json({ error: 'Some changed data objects have not been uploaded.', missing }, 409);

    const nextRecord = { manifest: candidate, run_number: candidate.run_number };
    const committed = this.ctx.storage.transactionSync(() => {
      const latest = currentRecord(this.ctx.storage);
      if ((latest?.manifest.revision || null) !== expectedRevision) return false;
      if (latest && candidate.run_number <= latest.run_number) return false;
      this.ctx.storage.kv.put('live-data-current', nextRecord);
      return true;
    });
    if (!committed) {
      const latest = currentRecord(this.ctx.storage);
      if (latest?.manifest.revision === candidate.revision) return json({ published: true, idempotent: true, revision: candidate.revision });
      return json({ error: 'Another data update was published first.', current_revision: latest?.manifest.revision || null }, 409);
    }
    return json({ published: true, revision: candidate.revision, run_number: candidate.run_number,
      file_count: Object.keys(candidate.files).length, changed_count: changed.length,
      deleted_count: Object.keys(previous).filter((path) => !Object.hasOwn(candidate.files, path)).length });
  }
}
