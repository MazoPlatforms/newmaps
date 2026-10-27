import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_OPTIONS, INITIAL_CAMERA, POI_ZOOM_THRESHOLDS, cameraDuration, configureNorthUpInteractions, placeDisplayTier, placeFeature, placePriority, poiLayerFilter, visiblePoiTiers } from '../assets/js/map-presentation.mjs';

test('map camera starts over the service area, remains north-up, and allows a world view', () => {
  assert.deepEqual(INITIAL_CAMERA, { center: [81.5569, 7.8381], zoom: 8.6 });
  assert.equal(CAMERA_OPTIONS.minZoom, 0);
  assert.equal(CAMERA_OPTIONS.maxZoom, 20);
  assert.equal(CAMERA_OPTIONS.bearing, 0);
  assert.equal(CAMERA_OPTIONS.pitch, 0);
  assert.equal(CAMERA_OPTIONS.maxPitch, 0);
  assert.equal(CAMERA_OPTIONS.dragRotate, false);
  assert.equal(CAMERA_OPTIONS.pitchWithRotate, false);
  assert.equal(CAMERA_OPTIONS.touchPitch, false);
  assert.equal(CAMERA_OPTIONS.touchZoomRotate, true);
  assert.equal(CAMERA_OPTIONS.renderWorldCopies, true);
});

test('progressive display prioritizes public facilities before ordinary businesses', () => {
  assert.equal(placePriority({ categories: ['Historic landmark'] }), 1);
  assert.equal(placeDisplayTier({ categories: ['Historic landmark'] }), 'major');
  assert.equal(placePriority({ categories: ['Hospital'] }), 2);
  assert.equal(placeDisplayTier({ categories: ['Government office'] }), 'district');
  assert.equal(placePriority({ categories: ['Bank'] }), 2);
  assert.equal(placeDisplayTier({ categories: ['Hotel'] }), 'district');
  assert.equal(placePriority({ categories: ['Restaurant'] }), 3);
  assert.equal(placeDisplayTier({ categories: ['Grocery store'] }), 'local');
  assert.deepEqual(POI_ZOOM_THRESHOLDS, { major: 4.6, district: 7.2, local: 9.5 });
  assert.deepEqual(visiblePoiTiers(2), []);
  assert.deepEqual(visiblePoiTiers(6), ['major']);
  assert.deepEqual(visiblePoiTiers(8), ['major', 'district']);
  assert.deepEqual(visiblePoiTiers(11), ['major', 'district', 'local']);
});

test('category filters constrain map display without changing searchable features', () => {
  assert.deepEqual(poiLayerFilter('major', 'all'), ['==', ['get', 'priority'], 1]);
  assert.deepEqual(poiLayerFilter('local', 'food'), ['all', ['==', ['get', 'priority'], 3], ['==', ['get', 'kind'], 'food']]);
  const place = { id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', name: 'Example Bakery', categories: ['Bakery'], coordinates: { longitude: 81.7, latitude: 7.7 } };
  const feature = placeFeature(place, 12);
  assert.equal(feature.id, place.id);
  assert.equal(feature.properties.id, place.id);
  assert.equal(feature.properties.index, 12);
  assert.equal(feature.properties.kind, 'food');
  assert.deepEqual(feature.geometry.coordinates, [81.7, 7.7]);
});

test('camera transitions honor reduced-motion preferences', () => {
  assert.equal(cameraDuration(550, false), 550);
  assert.equal(cameraDuration(550, true), 0);
});

test('rotation gestures are disabled while keyboard panning and pinch zoom remain available', () => {
  const disabled = [];
  const listeners = {};
  const mapListeners = {};
  const map = {
    dragRotate: { disable: () => disabled.push('mouse-rotation') },
    touchZoomRotate: { disableRotation: () => disabled.push('touch-rotation') },
    touchPitch: { disable: () => disabled.push('touch-pitch') },
    getCanvas: () => ({ addEventListener: (type, listener, capture) => { listeners[type] = { listener, capture }; } }),
    on: (event, listener) => { mapListeners[event] = listener; },
    getBearing: () => 15,
    setBearing: (bearing) => { map.bearing = bearing; },
    getPitch: () => 10,
    setPitch: (pitch) => { map.pitch = pitch; },
  };
  configureNorthUpInteractions(map);
  assert.deepEqual(disabled, ['mouse-rotation', 'touch-rotation', 'touch-pitch']);
  assert.equal(listeners.keydown.capture, true);
  let prevented = false;
  let stopped = false;
  listeners.keydown.listener({ key: 'ArrowLeft', shiftKey: false, preventDefault: () => { prevented = true; }, stopImmediatePropagation: () => { stopped = true; } });
  assert.equal(prevented, false);
  assert.equal(stopped, false);
  listeners.keydown.listener({ key: 'ArrowRight', shiftKey: true, preventDefault: () => { prevented = true; }, stopImmediatePropagation: () => { stopped = true; } });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  mapListeners.rotate();
  mapListeners.pitch();
  assert.equal(map.bearing, 0);
  assert.equal(map.pitch, 0);
});

