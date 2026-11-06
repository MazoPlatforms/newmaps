import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import worker from '../src/worker-core.mjs';
import { liveDataObjectKey } from '../src/live-data-registry.mjs';

const archive = new Uint8Array(await readFile('generated/places.pmtiles'));
const mapBytes = new Uint8Array(await readFile('generated/manifest.json'));
const archiveSha = createHash('sha256').update(archive).digest('hex');
const mapSha = createHash('sha256').update(mapBytes).digest('hex');
const revision = 'benchmark-vector-tiles-0000000000000000000000000000000000000000';
const files = {
  'generated/places.pmtiles': { sha256: archiveSha, bytes: archive.byteLength, content_type: 'application/vnd.pmtiles' },
  'generated/manifest.json': { sha256: mapSha, bytes: mapBytes.byteLength, content_type: 'application/json' },
};
const manifest = { revision, files };
const readKeys = new Map([[liveDataObjectKey('generated/places.pmtiles', archiveSha), archive],
  [liveDataObjectKey('generated/manifest.json', mapSha), mapBytes]]);
let rangeBytes = 0;
let archiveRangeReads = 0;
const env = {
  LIVE_DATA_REGISTRY: { getByName: () => ({ fetch: async () => Response.json(manifest) }) },
  DATA_BUCKET: { get: async (key, options = {}) => {
    const source = readKeys.get(key);
    if (!source) return null;
    const start = options.range?.offset ?? 0;
    const length = options.range?.length ?? source.byteLength;
    const bytes = source.slice(start, start + length);
    if (key.includes(archiveSha) && options.range) { archiveRangeReads += 1; rangeBytes += bytes.byteLength; }
    const sha256 = key.includes(archiveSha) ? archiveSha : mapSha;
    const path = key.includes(archiveSha) ? 'generated/places.pmtiles' : 'generated/manifest.json';
    return { size: source.byteLength, body: new Blob([bytes]).stream(), customMetadata: { sha256, path } };
  } },
  ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
};
const tiles = [[10, 744, 489], [12, 2977, 1959], [14, 11911, 7839]];
const start = performance.now();
const results = [];
for (const [z, x, y] of tiles) {
  const response = await worker.fetch(new Request(`https://maps.mazo.workers.dev/api/v1/tiles/${z}/${x}/${y}.pbf?revision=${revision}`), env);
  if (response.status !== 200) throw new Error(`Sample tile ${z}/${x}/${y} returned ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer()).byteLength;
  results.push({ z, x, y, pbfBytes: bytes });
}
const elapsedMs = performance.now() - start;
const wholeArchiveBytes = archive.byteLength * tiles.length;
console.log(JSON.stringify({ mode: 'local mocked R2 range-read benchmark', tiles: results,
  archiveBytes: archive.byteLength, archiveRangeReads, rangeBytes, wholeArchiveBytes,
  avoidedBytes: wholeArchiveBytes - rangeBytes,
  readAmplificationReduction: Number((wholeArchiveBytes / rangeBytes).toFixed(1)), elapsedMs: Number(elapsedMs.toFixed(2)),
  note: 'Local worker runtime + in-memory R2 mock; not Cloudflare edge latency or billed usage.' }, null, 2));
