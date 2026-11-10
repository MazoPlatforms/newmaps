// Fully self-hosted basemap. Tiles, glyphs and fonts are read from this origin only;
// no third-party tile, style, font, sprite or routing service is ever contacted.
import { MAZO_PALETTE } from './cartographic-style.mjs';

export { MAZO_PALETTE };
export const BASEMAP_FONT = 'MazoMapsSansRegular';
export const BASEMAP_ATTRIBUTION = '© OpenStreetMap contributors · © OpenMapTiles';
export const BASEMAP_MANIFEST_FORMAT = 'MazoBasemap/1';
const CACHE_NAME = 'mazo-basemap-v1';
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

export const archiveSourceKey = (id) => `mazo-basemap-${id}`;

export function basemapBaseUrl(documentBase = globalThis.document?.baseURI || globalThis.location?.href || 'http://localhost/') {
  return new URL('./assets/basemap/', documentBase).href;
}

// ---------------------------------------------------------------- style ---
const ROAD_STOPS = {
  major: [4, 0.1, 5, 0.38, 8, 0.9, 11, 1.5, 14, 2.7, 16, 4, 18, 5.7, 20, 7.5],
  secondary: [6, 0.4, 9, 0.8, 12, 1.55, 14, 2.35, 16, 3.2, 18, 4.5, 20, 5.8],
  local: [11, 0.6, 13, 1.05, 14, 1.5, 16, 2.25, 18, 3.3, 20, 4.5],
  path: [13, 0.4, 16, 1, 18, 1.8, 20, 2.6],
};
const ROAD_CLASSES = {
  major: ['motorway', 'trunk', 'primary'],
  secondary: ['secondary', 'tertiary'],
  local: ['minor', 'service', 'track', 'busway'],
  path: ['path', 'pedestrian'],
};
const ROAD_MIN_ZOOM = { major: 4.5, secondary: 7.5, local: 10.5, path: 13.5 };
// Change this expression to prefer Tamil (`name:ta`) or Sinhala (`name:si`) labels.
const LABEL_FIELD = ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];

const inClass = (classes) => ['match', ['get', 'class'], classes, true, false];

function roadWidth(group, casing) {
  const offset = casing ? 1.15 : 0;
  const stops = ROAD_STOPS[group].map((value, index) => (index % 2 ? value + offset : value));
  return ['interpolate', ['exponential', 1.2], ['zoom'], ...stops];
}

function textPaint(color, palette, halo = 1.8) {
  return { 'text-color': color, 'text-halo-color': palette.halo, 'text-halo-width': halo, 'text-opacity': 1 };
}

function textLayout(size, extra = {}) {
  return { 'text-field': LABEL_FIELD, 'text-font': [BASEMAP_FONT], 'text-size': size,
    'text-max-width': 8, 'text-padding': 2, 'text-optional': true, ...extra };
}

function sourceLayers(source, p, { minzoom, roadsMaxzoom, buildings }) {
  const id = (name) => `${source}-${name}`;
  const from = (zoom = 0) => Math.max(minzoom, zoom);
  const fills = [
    { id: id('landcover'), type: 'fill', source, 'source-layer': 'landcover', minzoom,
      paint: { 'fill-opacity': 0.7, 'fill-color': ['match', ['get', 'class'],
        ['wood', 'forest'], p.vegetationDark, 'grass', p.grass, 'farmland', p.farmland,
        'wetland', p.wetland, 'sand', p.sand, ['ice', 'rock'], p.land, p.vegetation] } },
    { id: id('landuse'), type: 'fill', source, 'source-layer': 'landuse', minzoom,
      paint: { 'fill-color': ['match', ['get', 'class'],
        ['residential', 'suburb', 'neighbourhood', 'commercial', 'industrial', 'retail', 'garages', 'parking'], p.built,
        ['school', 'university', 'college', 'hospital', 'kindergarten', 'stadium', 'pitch', 'playground',
          'bus_station', 'railway', 'military', 'theme_park', 'zoo', 'track'], p.urban,
        ['cemetery', 'park', 'garden', 'golf_course', 'grass', 'allotments'], p.vegetation,
        'quarry', p.sand, p.urban] } },
    { id: id('park'), type: 'fill', source, 'source-layer': 'park', minzoom,
      paint: { 'fill-color': p.park, 'fill-opacity': 0.88 } },
    { id: id('park-outline'), type: 'line', source, 'source-layer': 'park', minzoom: from(8),
      paint: { 'line-color': p.parkOutline, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.25, 12, 0.7, 18, 1.2] } },
    { id: id('water'), type: 'fill', source, 'source-layer': 'water', minzoom,
      paint: { 'fill-color': p.water, 'fill-antialias': true } },
    { id: id('waterway'), type: 'line', source, 'source-layer': 'waterway', minzoom: from(8),
      paint: { 'line-color': p.waterLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 12, 1, 16, 2.2, 20, 4] } },
  ];

  const buildingLayers = buildings ? [{ id: id('building'), type: 'fill', source, 'source-layer': 'building', minzoom: from(13),
    paint: { 'fill-color': p.building, 'fill-outline-color': p.buildingOutline } }] : [];

  const roads = [];
  for (const casing of [true, false]) {
    for (const group of ['path', 'local', 'secondary', 'major']) {
      if (casing && group === 'path') continue;
      const start = from(ROAD_MIN_ZOOM[group]);
      if (start >= roadsMaxzoom) continue;
      const color = casing ? p.roadCase : group === 'path' ? p.path
        : group === 'major' ? p.roadMajor : group === 'secondary' ? p.roadSecondary : p.roadLocal;
      roads.push({ id: id(`road-${group}${casing ? '-casing' : ''}`), type: 'line', source, 'source-layer': 'transportation',
        minzoom: start, maxzoom: roadsMaxzoom,
        filter: ['all', ['==', ['geometry-type'], 'LineString'], inClass(ROAD_CLASSES[group])],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': color, 'line-width': roadWidth(group, casing),
          ...(group === 'path' && !casing ? { 'line-dasharray': [2, 1.5] } : {}) } });
    }
  }

  const overlays = [{ id: id('boundary'), type: 'line', source, 'source-layer': 'boundary', minzoom: from(2),
    filter: ['all', ['<=', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
    paint: { 'line-color': p.boundary, 'line-dasharray': [3, 2], 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 10, 1.4] } }];

  const labels = [];
  const tiers = [
    ['major', ['country', 'state', 'province', 'city'], 3, [12, 20]],
    ['town', ['town'], 6, [11, 16]],
    ['village', ['village', 'suburb', 'island', 'isolated_dwelling'], 9, [10, 14]],
    ['minor', ['hamlet', 'quarter', 'neighbourhood', 'square'], 12, [10, 13]],
  ];
  for (const [name, classes, zoom, [small, large]] of tiers) {
    labels.push({ id: id(`place-${name}`), type: 'symbol', source, 'source-layer': 'place', minzoom: from(zoom),
      filter: inClass(classes), layout: textLayout(['interpolate', ['linear'], ['zoom'], 4, small, 14, large],
        { 'symbol-sort-key': ['coalesce', ['get', 'rank'], 99] }),
      paint: textPaint(p.label, p) });
  }
  labels.push({ id: id('water-name'), type: 'symbol', source, 'source-layer': 'water_name', minzoom: from(6),
    layout: textLayout(['interpolate', ['linear'], ['zoom'], 6, 10, 14, 13], { 'text-letter-spacing': 0.1 }),
    paint: textPaint(p.waterLabel, p) });
  for (const [name, classes, zoom] of [['major', [...ROAD_CLASSES.major, ...ROAD_CLASSES.secondary], 11], ['local', ROAD_CLASSES.local, 14]]) {
    const start = from(zoom);
    if (start >= roadsMaxzoom) continue;
    labels.push({ id: id(`road-label-${name}`), type: 'symbol', source, 'source-layer': 'transportation_name', minzoom: start, maxzoom: roadsMaxzoom,
      filter: inClass(classes), layout: textLayout(['interpolate', ['linear'], ['zoom'], 11, 10, 16, 13],
        { 'symbol-placement': 'line', 'text-max-angle': 30, 'text-padding': 4 }),
      paint: textPaint(p.roadLabel, p, 1.4) });
  }
  return { fills, buildings: buildingLayers, roads, overlays, labels };
}

// Builds the complete MapLibre style locally. With no manifest (archives not
// installed yet) it returns a valid blank style so places and search still work.
export function buildLocalBasemapStyle(theme = 'light', manifest = null, { baseUrl = basemapBaseUrl() } = {}) {
  const palette = MAZO_PALETTE[theme] || MAZO_PALETTE.light;
  const archives = new Map((manifest?.archives || []).map((archive) => [archive.id, archive]));
  const island = archives.get('island');
  const detail = archives.get('detail');
  const attribution = manifest?.attribution || BASEMAP_ATTRIBUTION;
  const sources = {};
  const groups = [];
  for (const archive of [island, detail]) {
    if (archive) sources[archive.id] = { type: 'vector', url: `pmtiles://${archiveSourceKey(archive.id)}`, attribution };
  }
  if (island) groups.push(sourceLayers('island', palette, { minzoom: island.min_zoom ?? 0, roadsMaxzoom: detail ? detail.min_zoom : 24, buildings: false }));
  if (detail) groups.push(sourceLayers('detail', palette, { minzoom: detail.min_zoom, roadsMaxzoom: 24, buildings: true }));
  const gather = (key) => groups.flatMap((group) => group[key]);
  return {
    version: 8,
    name: `Mazo Maps ${theme === 'dark' ? 'Dark' : 'Light'} (self-hosted)`,
    metadata: { 'mazo:basemap': 'self-hosted' },
    glyphs: `${baseUrl}fonts/{fontstack}/{range}.pbf`,
    sources,
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': palette.land } },
      ...gather('fills'), ...gather('buildings'), ...gather('roads'), ...gather('overlays'), ...gather('labels'),
    ],
  };
}

// --------------------------------------------------------------- loader ---
// PMTiles archives are small enough to hold in memory. Reading them whole means
// the map needs no HTTP Range support and works from Cache Storage when offline.
export class MemorySource {
  constructor(key, buffer) { this.key = key; this.buffer = buffer; }
  getKey() { return this.key; }
  async getBytes(offset, length) { return { data: this.buffer.slice(offset, offset + length) }; }
}

async function sha256Hex(buffer) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function validateBasemapManifest(manifest) {
  if (manifest?.format !== BASEMAP_MANIFEST_FORMAT || !Array.isArray(manifest.archives) || !manifest.archives.length) {
    throw new Error('Basemap manifest is invalid');
  }
  for (const archive of manifest.archives) {
    if (!/^[a-z0-9-]+$/.test(archive.id || '') || !/^[A-Za-z0-9._-]+\.pmtiles$/.test(archive.file || '')
      || !Number.isSafeInteger(archive.bytes) || archive.bytes <= 0 || archive.bytes > MAX_ARCHIVE_BYTES
      || !/^[a-f0-9]{64}$/.test(archive.sha256 || '')
      || !Number.isInteger(archive.min_zoom) || !Number.isInteger(archive.max_zoom)) {
      throw new Error(`Basemap archive entry is invalid: ${archive?.id}`);
    }
  }
  return manifest;
}

async function openCache(cacheStorage) {
  try { return (await cacheStorage?.open(CACHE_NAME)) ?? null; } catch { return null; }
}

async function fetchManifest(baseUrl, fetchImpl, cache) {
  const url = `${baseUrl}manifest.json`;
  try {
    const response = await fetchImpl(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Basemap manifest ${response.status}`);
    try { await cache?.put(url, response.clone()); } catch { /* cache is optional */ }
    return await response.json();
  } catch (error) {
    const cached = await cache?.match(url);
    if (cached) return cached.json();
    throw error;
  }
}

async function fetchArchive(baseUrl, archive, fetchImpl, cache) {
  const url = `${baseUrl}${archive.file}?v=${archive.sha256}`;
  let buffer = null;
  const cached = await cache?.match(url);
  if (cached) buffer = await cached.arrayBuffer();
  else {
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`${archive.file} ${response.status}`);
    try { await cache?.put(url, response.clone()); } catch { /* cache is optional */ }
    buffer = await response.arrayBuffer();
  }
  const valid = buffer.byteLength === archive.bytes
    && (!globalThis.crypto?.subtle || (await sha256Hex(buffer)) === archive.sha256);
  if (!valid) {
    try { await cache?.delete(url); } catch { /* ignore */ }
    throw new Error(`${archive.file} failed its size/checksum verification`);
  }
  return { url, buffer };
}

export async function loadLocalBasemap({ pmtiles, protocol, fetchImpl = globalThis.fetch?.bind(globalThis),
  cacheStorage = globalThis.caches, baseUrl = basemapBaseUrl() } = {}) {
  if (!pmtiles?.PMTiles || typeof protocol?.add !== 'function') throw new Error('PMTiles library is unavailable');
  const cache = await openCache(cacheStorage);
  const manifest = validateBasemapManifest(await fetchManifest(baseUrl, fetchImpl, cache));
  const loaded = await Promise.all(manifest.archives.map((archive) => fetchArchive(baseUrl, archive, fetchImpl, cache)));
  manifest.archives.forEach((archive, index) => {
    protocol.add(new pmtiles.PMTiles(new MemorySource(archiveSourceKey(archive.id), loaded[index].buffer)));
  });
  if (cache) {
    const wanted = new Set([`${baseUrl}manifest.json`, ...loaded.map((item) => item.url)]);
    try { for (const request of await cache.keys()) if (!wanted.has(request.url)) await cache.delete(request); } catch { /* ignore */ }
  }
  return manifest;
}
