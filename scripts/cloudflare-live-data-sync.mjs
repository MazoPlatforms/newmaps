import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSignedHeaders } from '../src/live-data-auth.mjs';

const contentTypes = new Map([
  ['.json', 'application/json'], ['.geojson', 'application/geo+json'], ['.mzp', 'application/geo+json'],
  ['.pmtiles', 'application/vnd.pmtiles'], ['.pbf', 'application/x-protobuf'], ['.csv', 'text/csv'],
]);

async function listFiles(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

export async function buildLiveDataManifest(root, { revision, runNumber, sourceRef = 'refs/heads/main', updatedAt = new Date().toISOString() }) {
  if (!/^[a-f0-9]{40}$/.test(revision || '') || !Number.isSafeInteger(Number(runNumber)) || Number(runNumber) < 1) {
    throw new Error('A 40-character Git commit SHA and positive GitHub Actions run number are required');
  }
  const entries = {};
  for (const absolute of (await listFiles(root)).sort()) {
    const path = relative(root, absolute).split(sep).join('/');
    if (!path.startsWith('generated/') && !path.startsWith('data/')) continue;
    if (path === 'generated/live-data-manifest.json' || path.startsWith('generated/places-pmtiles-chunks/')) continue;
    const bytes = await readFile(absolute);
    const extension = extname(path).toLowerCase();
    entries[path] = {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.byteLength,
      content_type: contentTypes.get(extension) || (extension === '.pmtiles' ? 'application/vnd.pmtiles' : 'application/octet-stream'),
    };
  }
  if (!Object.keys(entries).length) throw new Error('No generated or data files were found in the live-data build directory');
  return { format: 'MazoLiveData/1', revision, run_number: Number(runNumber), source_ref: sourceRef, updated_at: updatedAt, files: entries };
}

async function signedFetch({ baseUrl, secret, pathname, method = 'POST', body, filePath = '', contentType = '', fetcher = fetch }) {
  const bytes = body instanceof Uint8Array ? body : new TextEncoder().encode(typeof body === 'string' ? body : JSON.stringify(body));
  const headers = await createSignedHeaders({ secret, method, pathname, body: bytes, filePath, contentType, nonce: randomUUID() });
  if (contentType) headers['Content-Type'] = contentType;
  else if (method !== 'PUT') headers['Content-Type'] = 'application/json';
  return fetcher(new URL(pathname, baseUrl), { method, headers, body: bytes });
}

async function responseJson(response) {
  let body;
  try { body = await response.json(); } catch { body = { error: await response.text().catch(() => '') }; }
  if (!response.ok) {
    const error = new Error(body.error || `Live data sync returned HTTP ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function postJson(options, pathname, payload) {
  const response = await signedFetch({ ...options, pathname, body: JSON.stringify(payload) });
  return responseJson(response);
}

async function uploadFile({ root, options, entry }) {
  const bytes = await readFile(join(root, ...entry.path.split('/')));
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== entry.sha256 || bytes.byteLength !== entry.bytes) throw new Error(`Built file changed while syncing: ${entry.path}`);
  const response = await signedFetch({ ...options, pathname: '/api/admin/upload', method: 'POST', body: bytes,
    filePath: entry.path, contentType: entry.content_type });
  return responseJson(response);
}

async function uploadChanged(root, options, changed, concurrency = 4) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, changed.length) }, async () => {
    while (cursor < changed.length) {
      const entry = changed[cursor++];
      await retryTransient(() => uploadFile({ root, options, entry }));
    }
  });
  await Promise.all(workers);
}

async function retryTransient(operation, attempts = 3) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await operation(); } catch (error) {
      if (attempt + 1 >= attempts || (error.status && error.status < 500 && error.status !== 429)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
    }
  }
}

export async function syncLiveData({ root, manifest, baseUrl, secret, fetcher = fetch }) {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || typeof secret !== 'string' || secret.length < 32) {
    throw new Error('A valid live Worker URL and MAZO_LIVE_DATA_HMAC_SECRET (at least 32 characters) are required');
  }
  const options = { baseUrl: base, secret, fetcher };
  let plan = await retryTransient(() => postJson(options, '/api/admin/plan', { manifest }));
  await uploadChanged(root, options, plan.changed || []);
  try {
    const published = await postJson(options, '/api/admin/publish', { manifest, expected_revision: plan.expected_revision ?? null });
    return { ...published, changed: (plan.changed || []).map(({ path }) => path), deleted: plan.deleted || [], unchanged: plan.unchanged || 0 };
  } catch (error) {
    if (error.status !== 409) throw error;
    // Re-plan once if another protected-branch run published while uploads were in flight.
    plan = await retryTransient(() => postJson(options, '/api/admin/plan', { manifest }));
    await uploadChanged(root, options, plan.changed || []);
    const published = await postJson(options, '/api/admin/publish', { manifest, expected_revision: plan.expected_revision ?? null });
    return { ...published, changed: (plan.changed || []).map(({ path }) => path), deleted: plan.deleted || [], unchanged: plan.unchanged || 0 };
  }
}

async function main() {
  const root = process.env.MAZO_LIVE_DATA_ROOT || fileURLToPath(new URL('../dist/', import.meta.url));
  const manifest = await buildLiveDataManifest(root, {
    revision: process.env.GITHUB_SHA,
    runNumber: process.env.GITHUB_RUN_NUMBER,
    sourceRef: process.env.GITHUB_REF || 'refs/heads/main',
  });
  const result = await syncLiveData({ root, manifest, baseUrl: process.env.MAZO_LIVE_SYNC_URL,
    secret: process.env.MAZO_LIVE_DATA_HMAC_SECRET });
  console.log(JSON.stringify({ revision: result.revision, file_count: result.file_count,
    changed_count: result.changed.length, deleted_count: result.deleted.length,
    unchanged_count: result.unchanged, bytes_uploaded: result.changed.reduce((sum, path) => sum + manifest.files[path].bytes, 0) }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`Live data synchronization failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
