export const OFFLINE_CACHE_PREFIX = 'mazo-offline-pack-';

export function offlinePackResources(manifest, roadsManifest, routingManifest) {
  const delivery = manifest?.delivery ?? {};
  const values = [delivery.mvt_pmtiles, delivery.search_index, delivery.place_details];
  if (!/^[a-f0-9]{64}$/.test(manifest?.source_sha256 || '') || values.some((entry) => !entry?.file || !/^[a-f0-9]{64}$/.test(entry?.sha256 || ''))) throw new Error('Place manifest is incomplete');
  if (!roadsManifest?.geojson || !roadsManifest?.sha256 || !routingManifest?.graph_file || !routingManifest?.graph_sha256) {
    throw new Error('Offline road or routing manifest is incomplete');
  }
  const resources = [
    { url: './generated/manifest.json', bytes: null },
    { url: './generated/kattankudy-roads-manifest.json', bytes: null },
    { url: './generated/kattankudy-routing-manifest.json', bytes: null },
    ...values.map((entry) => ({ url: `./generated/${entry.file}?v=${entry.sha256}`, bytes: entry.bytes ?? null })),
    { url: `./generated/${roadsManifest.geojson}?v=${roadsManifest.sha256}`, bytes: roadsManifest.bytes ?? null },
    { url: `./generated/${routingManifest.graph_file}?v=${routingManifest.graph_sha256}`, bytes: routingManifest.graph_bytes ?? null },
  ];
  return { version: [manifest.source_sha256, delivery.mvt_pmtiles.sha256, delivery.search_index.sha256, delivery.place_details.sha256, roadsManifest.sha256, routingManifest.graph_sha256].join('-'), resources };
}

export async function downloadOfflinePack({ manifest, roadsManifest, routingManifest, cacheStorage = caches, fetcher = fetch, estimate = navigator.storage?.estimate?.bind(navigator.storage) }) {
  const pack = offlinePackResources(manifest, roadsManifest, routingManifest);
  const cacheName = OFFLINE_CACHE_PREFIX + pack.version;
  const previousNames = (await cacheStorage.keys()).filter((name) => name.startsWith(OFFLINE_CACHE_PREFIX));
  const cacheAlreadyExisted = previousNames.includes(cacheName);
  const estimateResult = await estimate?.();
  const expectedBytes = pack.resources.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
  if (estimateResult?.quota && expectedBytes > estimateResult.quota - estimateResult.usage) throw new Error('Not enough browser storage is available for this offline pack.');
  const cache = await cacheStorage.open(cacheName);
  try {
    for (const resource of pack.resources) {
      const response = await fetcher(resource.url, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Could not download ${resource.url} (${response.status})`);
      const buffer = await response.arrayBuffer();
      if (resource.bytes && buffer.byteLength !== resource.bytes) throw new Error(`Size check failed for ${resource.url}`);
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      const expected = new URL(resource.url, globalThis.location?.href ?? 'https://mazo.invalid/').searchParams.get('v');
      if (expected && [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('') !== expected) throw new Error(`Integrity check failed for ${resource.url}`);
      await cache.put(resource.url, new Response(buffer, { headers: { 'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream', 'X-Mazo-Offline-Version': pack.version } }));
    }
  } catch (error) {
    if (!cacheAlreadyExisted) await cacheStorage.delete(cacheName);
    throw error;
  }
  for (const oldName of previousNames) if (oldName !== cacheName) await cacheStorage.delete(oldName);
  return { version: pack.version, resources: pack.resources.length, bytes: expectedBytes, cacheName };
}

export async function removeOfflinePack(cacheStorage = caches) {
  const names = (await cacheStorage.keys()).filter((name) => name.startsWith(OFFLINE_CACHE_PREFIX));
  await Promise.all(names.map((name) => cacheStorage.delete(name)));
  return names.length;
}
