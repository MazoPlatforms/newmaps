import { liveDataObjectKey } from './live-data-registry.mjs';

async function bytesOf(object) {
  if (!object) throw new Error('PMTiles range is missing');
  return new Uint8Array(await new Response(object.body).arrayBuffer());
}

async function readChunkBytes(env, path, entry, offset, length) {
  const cache = globalThis.caches?.default;
  const key = new Request(`https://mazo-pmtiles-cache.invalid/${entry.sha256}/${offset}/${length}`);
  if (cache) {
    try {
      const cached = await cache.match(key);
      if (cached && cached.headers.get('X-Mazo-PMTiles-SHA256') === entry.sha256
        && cached.headers.get('X-Mazo-PMTiles-Path') === path
        && Number(cached.headers.get('Content-Length')) === length) {
        const bytes = new Uint8Array(await cached.arrayBuffer());
        if (bytes.byteLength === length) return bytes;
      }
    } catch { /* A cache miss or unavailable Cache API falls back to R2. */ }
  }
  const object = await env.DATA_BUCKET.get(liveDataObjectKey(path, entry.sha256), { range: { offset, length } });
  if (!object || object.size !== entry.bytes || object.customMetadata?.sha256 !== entry.sha256
    || object.customMetadata?.path !== path) throw new Error('PMTiles chunk does not match the active manifest');
  const bytes = await bytesOf(object);
  if (bytes.byteLength !== length) throw new Error('PMTiles chunk has an invalid byte length');
  if (cache) {
    try {
      await cache.put(key, new Response(bytes, { headers: { 'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable', 'X-Mazo-PMTiles-SHA256': entry.sha256,
        'X-Mazo-PMTiles-Path': path } }));
    } catch { /* Cache writes are an optimization; R2 remains authoritative. */ }
  }
  return bytes;
}

export async function readR2PmtilesRange({ env, manifest, archivePath, offset, length, chunkSize, totalBytes }) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 1
    || offset + length > totalBytes) throw new Error('PMTiles byte range is outside archive');
  const archiveEntry = manifest.files?.[archivePath];
  if (!archiveEntry || archiveEntry.bytes !== totalBytes) throw new Error('PMTiles archive is not in the active manifest');
  if (archiveEntry.storage !== 'r2-archive') {
    const object = await env.DATA_BUCKET.get(liveDataObjectKey(archivePath, archiveEntry.sha256), { range: { offset, length } });
    if (!object || object.size !== totalBytes || object.customMetadata?.sha256 !== archiveEntry.sha256
      || object.customMetadata?.path !== archivePath) throw new Error('Legacy PMTiles object does not match the active manifest');
    return bytesOf(object);
  }
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 65_536) throw new Error('Invalid PMTiles R2 chunk size');
  const output = new Uint8Array(length);
  let written = 0;
  while (written < length) {
    const absolute = offset + written;
    const index = Math.floor(absolute / chunkSize);
    const chunkPath = archivePath === 'generated/places.pmtiles'
      ? `generated/places-pmtiles-chunks/${String(index).padStart(5, '0')}.bin`
      : `generated/sri-lanka-basemap-pmtiles-chunks/${String(index).padStart(5, '0')}.bin`;
    const entry = manifest.files?.[chunkPath];
    if (!entry || entry.storage !== 'r2-chunk') throw new Error('PMTiles chunk is not in the active R2 manifest');
    const localOffset = absolute - index * chunkSize;
    const amount = Math.min(length - written, entry.bytes - localOffset);
    if (amount < 1) throw new Error('PMTiles chunk has an invalid byte length');
    const part = await readChunkBytes(env, chunkPath, entry, localOffset, amount);
    if (part.byteLength !== amount) throw new Error('PMTiles chunk range is truncated');
    output.set(part, written);
    written += amount;
  }
  return output;
}

export function streamR2PmtilesRange({ env, manifest, archivePath, offset, length, chunkSize, totalBytes }) {
  let position = 0;
  return new ReadableStream({
    async pull(controller) {
      if (position >= length) { controller.close(); return; }
      const amount = Math.min(chunkSize, length - position);
      try {
        const part = await readR2PmtilesRange({ env, manifest, archivePath,
          offset: offset + position, length: amount, chunkSize, totalBytes });
        controller.enqueue(part);
        position += part.byteLength;
      } catch (error) { controller.error(error); }
    },
  });
}
