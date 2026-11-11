import { discoveryCategoryFor } from './place-categories.mjs';

// Start at a country overview so the Sri Lanka land shape is visible on launch.
export const INITIAL_CAMERA = Object.freeze({ center: [80.8, 7.85], zoom: 6.7 });
// Keep the island overview clean like a road atlas. POI pins are useful once a
// user is exploring a district, but overwhelm national-scale place labels.
export const POI_ZOOM_THRESHOLDS = Object.freeze({ major: 8.8, district: 14.5, category: 11.5, local: 15.5 });
// A place selected from search opens at zoom 16. Make every underlying place
// pin visible before that camera level so closing the selection reveals its
// ordinary map pin instead of making it disappear in symbol collision.
export const SHOW_ALL_POI_PINS_ZOOM = 15.5;

export const CAMERA_OPTIONS = Object.freeze({
  ...INITIAL_CAMERA,
  minZoom: 0,
  maxZoom: 20,
  bearing: 0,
  pitch: 0,
  maxPitch: 0,
  dragRotate: false,
  pitchWithRotate: false,
  touchPitch: false,
  // MapLibre's touch rotation handler is disabled after construction. Keeping
  // this enabled preserves native pinch zoom on touch devices.
  touchZoomRotate: true,
  renderWorldCopies: true,
  // Retain parent/child vector tiles across pinch zooms so MapLibre can keep
  // drawing the last complete viewport while replacement tiles are fetched.
  maxTileCacheZoomLevels: 6,
  maxTileCacheSize: 128,
  // Bound GPU work on high-density mobile screens; POI symbols remain opaque.
  // 3x phone screens render 2.25x more pixels than 2x for no visible gain on a map.
  pixelRatio: Math.min(globalThis.devicePixelRatio || 1, 2),
  // Cross-fade the previous zoom's vector tiles while replacement tiles load,
  // avoiding a flash of only the water background during pinch zoom.
  fadeDuration: 300,
});

// Only landmarks receive a country/regional tier. Other institutions become
// visible at district/city scale, where MapLibre collision placement can show
// the subset that fits the viewport.
const REGIONAL_IMPORTANCE = new Set(['landmark']);
const DISTRICT_IMPORTANCE = new Set([
  'health', 'school', 'government', 'transport', 'worship', 'bank', 'atm',
  'fuel', 'hotel', 'park', 'sports',
]);

export function placePriority(placeOrKind) {
  const kind = typeof placeOrKind === 'string'
    ? placeOrKind
    : discoveryCategoryFor(placeOrKind);
  if (REGIONAL_IMPORTANCE.has(kind)) return 1;
  if (DISTRICT_IMPORTANCE.has(kind)) return 2;
  return 3;
}

export function placeDisplayTier(placeOrKind) {
  const priority = placePriority(placeOrKind);
  return priority === 1 ? 'major' : priority === 2 ? 'district' : 'local';
}

export function placeFeature(place) {
  const kind = discoveryCategoryFor(place);
  return {
    type: 'Feature',
    id: place.id,
    geometry: {
      type: 'Point',
      coordinates: [+place.coordinates.longitude, +place.coordinates.latitude],
    },
    properties: {
      id: place.id,
      name: place.name,
      kind,
      priority: placePriority(kind),
    },
  };
}

export function poiLayerFilter(tier, category = 'all') {
  const importance = tier === 'major'
    ? ['==', ['get', 'priority'], 1]
    : tier === 'district'
      ? ['==', ['get', 'priority'], 2]
      : ['==', ['get', 'priority'], 3];
  return category === 'all'
    ? importance
    : ['all', importance, ['==', ['get', 'kind'], category]];
}

export function visiblePoiTiers(zoom) {
  return Object.entries(POI_ZOOM_THRESHOLDS)
    .filter(([tier]) => tier !== 'category')
    .filter(([, minimum]) => Number.isFinite(zoom) && zoom >= minimum)
    .map(([tier]) => tier);
}

export function cameraDuration(milliseconds, reducedMotion = false) {
  return reducedMotion ? 0 : milliseconds;
}

/*
 * Runtime speed tuning, applied whenever the style changes:
 *  - preserve the POI pin collision policy established by poiLayout(), so
 *    dense places use MapLibre symbol collisions to avoid marker walls;
 *  - the bootstrap MVT place layers (duplicates of PMTiles pins) only draw
 *    at street zoom, reducing redundant overview tile/layout work.
 * Every write is guarded by a comparison, so this settles after one pass.
 */
export function tuneMapPerformance(map) {
  let queued = false;
  const apply = () => {
    queued = false;
    try {
      for (const [id, minimum] of [['places-dot', 14], ['places-label', 16]]) {
        const layer = map.getLayer(id);
        if (layer && (layer.minzoom ?? 0) < minimum) map.setLayerZoomRange(id, minimum, 24);
      }
    } catch (error) {
      console.warn('Map performance tuning skipped:', error);
    }
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    (globalThis.requestAnimationFrame || ((callback) => setTimeout(callback, 16)))(apply);
  };
  map.on('styledata', schedule);
}

export function configureNorthUpInteractions(map) {
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();
  map.touchPitch.disable();
  // Preserve ordinary arrow-key panning and +/- zoom. Block the Shift+Arrow
  // combinations MapLibre uses for rotation and pitch before its handler sees them.
  map.getCanvas().addEventListener('keydown', (event) => {
    if (event.shiftKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  map.on('rotate', () => {
    if (Math.abs(map.getBearing()) > 0.001) map.setBearing(0);
  });
  map.on('pitch', () => {
    if (Math.abs(map.getPitch()) > 0.001) map.setPitch(0);
  });
  tuneMapPerformance(map);
}
