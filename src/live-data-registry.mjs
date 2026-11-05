const COMMIT_SHA = /^[a-f0-9]{40}$/;
const CONTENT_SHA = /^[a-f0-9]{64}$/;
const ALLOWED_PATH = /^(?:generated|data)\/[A-Za-z0-9._/-]+$/;
const MAX_FILES = 5000;

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
  if (entries.length === 0 || entries.length > MAX_FILES) throw new Error('Live data manifest file count is invalid');
  let totalBytes = 0;
  for (const [path, entry] of entries) {
    if (!validPath(path) || !entry || !CONTENT_SHA.test(entry.sha256 || '')
      || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0
      || typeof entry.content_type !== 'string' || entry.content_type.length > 160) {
      throw new Error(`Invalid live data file entry: ${path}`);
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

export class LiveDataRegistry {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/version') {
      const record = currentRecord(this.ctx.storage);
      if (!record) return json({ error: 'Live data has not been synchronized.' }, 404);
      return json({ format: 'MazoLiveData/1', revision: record.manifest.revision, run_number: record.run_number,
        updated_at: record.manifest.updated_at, file_count: Object.keys(record.manifest.files).length });
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
        .filter(([path, entry]) => previous[path]?.sha256 !== entry.sha256 || previous[path]?.bytes !== entry.bytes)
        .map(([path, entry]) => ({ path, ...entry }));
      const deleted = Object.keys(previous).filter((path) => !Object.hasOwn(candidate.files, path)).sort();
      return json({ expected_revision: record?.manifest.revision || null, changed, deleted,
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
      .filter(([path, entry]) => previous[path]?.sha256 !== entry.sha256 || previous[path]?.bytes !== entry.bytes);
    const missing = [];
    for (const [path, entry] of changed) {
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
