import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import worker, { servePmtilesRange } from '../src/worker.mjs';

const root = fileURLToPath(new URL('../dist/generated/', import.meta.url));
const archive = new Uint8Array(await readFile(`${root}places.pmtiles`));
const metadata = JSON.parse(await readFile(`${root}places-pmtiles-range.json`, 'utf8'));
const sha256 = createHash('sha256').update(archive).digest('hex');
const samples = 40;
const rangeLength = 16 * 1024;
const chunkSize = metadata.chunk_size;

function staticAssets() {
  let bytesRead = 0;
  return {
    get bytesRead() { return bytesRead; },
    fetch: async (request) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/places-pmtiles-range.json')) return Response.json(metadata);
      if (url.pathname.endsWith('/places.pmtiles')) {
        return new Response(request.method === 'HEAD' ? null : archive, { headers: {
          'Content-Type': 'application/vnd.pmtiles', 'Content-Length': String(archive.byteLength), ETag: `"${sha256}"`,
        } });
      }
      const match = /places-pmtiles-chunks\/(\d+)\.bin$/.exec(url.pathname);
      if (!match) return new Response(null, { status: 404 });
      const start = Number(match[1]) * chunkSize;
      const bytes = archive.slice(start, start + chunkSize);
      bytesRead += bytes.byteLength;
      return new Response(bytes);
    },
  };
}

const staticAssetsMock = staticAssets();
const staticEnv = { ASSETS: staticAssetsMock, PMTILES_CHUNK_SIZE: String(chunkSize) };
let r2BytesRead = 0;
const r2Env = { DATA_BUCKET: {
  get: async (_key, { range }) => {
    const bytes = archive.slice(range.offset, range.offset + range.length);
    r2BytesRead += bytes.byteLength;
    return { size: archive.byteLength, body: bytes, httpMetadata: { contentType: 'application/vnd.pmtiles' },
      customMetadata: { sha256, path: 'generated/places.pmtiles' },
      writeHttpMetadata: (headers) => headers.set('Content-Type', 'application/vnd.pmtiles') };
  },
  head: async () => ({ size: archive.byteLength, customMetadata: { sha256, path: 'generated/places.pmtiles' } }),
} };

async function sample(label, operation) {
  const durations = [];
  for (let index = 0; index < samples; index += 1) {
    const start = (index * 37_919) % (archive.byteLength - rangeLength);
    const request = new Request(`https://maps.mazo.workers.dev${label === 'R2 native range'
      ? `/api/data/generated/places.pmtiles?v=${sha256}&bytes=${archive.byteLength}` : '/generated/places.pmtiles'}`, {
      headers: { Range: `bytes=${start}-${start + rangeLength - 1}` },
    });
    const before = performance.now();
    const response = await operation(request);
    const body = await response.arrayBuffer();
    durations.push(performance.now() - before);
    if (response.status !== 206 || body.byteLength !== rangeLength) throw new Error(`${label} returned an invalid range response`);
  }
  durations.sort((left, right) => left - right);
  return { p50_ms: Number(durations[Math.floor(samples * 0.5)].toFixed(3)), p95_ms: Number(durations[Math.floor(samples * 0.95)].toFixed(3)) };
}

const staticTiming = await sample('static 64 KiB chunks', (request) => servePmtilesRange(request, staticAssetsMock, chunkSize));
const liveTiming = await sample('R2 native range', (request) => worker.fetch(request, r2Env));
const usefulBytes = samples * rangeLength;
console.log(JSON.stringify({ archive_bytes: archive.byteLength, samples, range_bytes_each: rangeLength, useful_bytes: usefulBytes,
  static_chunk_bytes_read: staticAssetsMock.bytesRead, r2_bytes_read: r2BytesRead,
  static_amplification: Number((staticAssetsMock.bytesRead / usefulBytes).toFixed(3)),
  r2_amplification: Number((r2BytesRead / usefulBytes).toFixed(3)),
  static_in_process_latency: staticTiming, r2_in_process_latency: liveTiming,
  latency_note: 'In-process mock timings exclude network, edge cache, and Cloudflare billing.' }, null, 2));
