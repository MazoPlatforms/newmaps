import { discoveryCategoryFor } from './place-categories.mjs';

export const INITIAL_CAMERA = Object.freeze({ center: [81.5569, 7.8381], zoom: 8.6 });
export const POI_ZOOM_THRESHOLDS = Object.freeze({ major: 6.2, district: 8.6, category: 9.4, local: 12.4 });

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
  // Only brief collision transitions remain; POI symbol opacity itself is 1.
  fadeDuration: 100,
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

export function placeFeature(place, index) {
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
      index,
      category: (place.categories || []).join(' '),
      address: place.address || '',
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
}
