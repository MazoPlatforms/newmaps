import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMazoCartographicStyle, isBasemapPlacePoiLayer, MAZO_PALETTE } from '../assets/js/cartographic-style.mjs';

function mockMap(layers) {
  const style = { layers: structuredClone(layers) };
  return {
    style,
    zoomRanges: [],
    getStyle: () => style,
    setPaintProperty(id, property, value) {
      const layer = style.layers.find((item) => item.id === id);
      layer.paint ||= {};
      layer.paint[property] = value;
    },
    setLayoutProperty(id, property, value) {
      const layer = style.layers.find((item) => item.id === id);
      layer.layout ||= {};
      layer.layout[property] = value;
    },
    setFilter(id, filter) {
      const layer = style.layers.find((item) => item.id === id);
      layer.filter = filter;
    },
    setLayerZoomRange(id, minzoom, maxzoom) {
      const layer = style.layers.find((item) => item.id === id);
      layer.minzoom = minzoom;
      layer.maxzoom = maxzoom;
      this.zoomRanges.push({ id, minzoom, maxzoom });
    },
  };
}

const sample = [
  { id: 'background', type: 'background', paint: { 'background-color': '#000' } },
  { id: 'natural_earth', type: 'raster', source: 'ne2_shaded', maxzoom: 7, paint: { 'raster-opacity': 1 } },
  { id: 'water', type: 'fill', source: 'base', 'source-layer': 'water', paint: { 'fill-color': '#000' } },
  { id: 'land', type: 'fill', source: 'base', 'source-layer': 'land', paint: { 'fill-color': '#000' } },
  { id: 'landcover_wood', type: 'fill', source: 'base', 'source-layer': 'landcover', paint: { 'fill-color': '#000', 'fill-opacity': 0.4, 'fill-pattern': 'wood-pattern' } },
  { id: 'landcover_grass', type: 'fill', source: 'base', 'source-layer': 'landcover', paint: { 'fill-color': '#000' } },
  { id: 'landuse_residential', type: 'fill', source: 'base', 'source-layer': 'landuse', filter: ['==', ['get', 'class'], 'residential'], paint: { 'fill-color': '#000' } },
  { id: 'landuse_school', type: 'fill', source: 'base', 'source-layer': 'landuse', filter: ['==', ['get', 'class'], 'school'], paint: { 'fill-color': '#000' } },
  { id: 'park', type: 'fill', source: 'base', 'source-layer': 'park', paint: { 'fill-color': '#000', 'fill-opacity': 0.7 } },
  { id: 'park_outline', type: 'line', source: 'base', 'source-layer': 'park', paint: { 'line-color': '#000' } },
  { id: 'building', type: 'fill', source: 'base', 'source-layer': 'building', paint: { 'fill-color': '#000', 'fill-outline-color': '#000' } },
  { id: 'road_minor_casing', type: 'line', source: 'base', 'source-layer': 'transportation', paint: { 'line-color': '#000', 'line-opacity': 0.2 } },
  { id: 'road_minor', type: 'line', source: 'base', 'source-layer': 'transportation', paint: { 'line-color': '#000', 'line-width': 18 } },
  { id: 'road_trunk_primary', type: 'line', source: 'base', 'source-layer': 'transportation', paint: { 'line-color': '#000' } },
  { id: 'road_motorway', type: 'line', source: 'base', 'source-layer': 'transportation', paint: { 'line-color': '#000' } },
  { id: 'road_secondary_tertiary', type: 'line', source: 'base', 'source-layer': 'transportation', paint: { 'line-color': '#000' } },
  { id: 'highway_path', type: 'line', source: 'base', 'source-layer': 'transportation', paint: { 'line-color': '#000' } },
  { id: 'boundary_country_z5-', type: 'line', source: 'base', 'source-layer': 'boundary', filter: ['==', ['get', 'admin_level'], 2], paint: { 'line-color': '#000' } },
  { id: 'poi_r7', type: 'symbol', source: 'base', 'source-layer': 'poi', layout: { 'text-field': ['get', 'name'] } },
  { id: 'place_suburb', type: 'symbol', source: 'base', 'source-layer': 'place', layout: { 'text-field': ['get', 'name'] } },
  { id: 'airport', type: 'symbol', source: 'base', 'source-layer': 'aerodrome_label', layout: { 'text-field': ['get', 'name'] } },
  { id: 'highway-name-major', type: 'symbol', source: 'base', 'source-layer': 'transportation_name', layout: { 'text-field': ['get', 'name'] }, paint: { 'text-color': '#333', 'text-halo-color': '#000' } },
  { id: 'highway-shield-non-us', type: 'symbol', source: 'base', 'source-layer': 'transportation_name', minzoom: 8, layout: { 'icon-image': ['get', 'ref'] } },
  { id: 'place_city', type: 'symbol', source: 'base', 'source-layer': 'place', layout: { 'text-field': ['get', 'name'], 'icon-image': 'circle' }, paint: { 'text-color': '#555', 'icon-opacity': 0.7 } },
];

test('dark palette restores separation among water, land, vegetation and buildings', () => {
  const map = mockMap(sample);
  const summary = applyMazoCartographicStyle(map, 'dark');
  const byId = Object.fromEntries(map.style.layers.map((layer) => [layer.id, layer]));
  assert.equal(byId.background.paint['background-color'], MAZO_PALETTE.dark.land);
  assert.equal(byId.water.paint['fill-color'], MAZO_PALETTE.dark.water);
  assert.equal(byId.land.paint['fill-color'], MAZO_PALETTE.dark.land);
  assert.equal(byId.landcover_wood.paint['fill-color'], MAZO_PALETTE.dark.vegetationDark);
  assert.equal(byId.landcover_wood.paint['fill-pattern'], null);
  assert.equal(byId.landcover_grass.paint['fill-color'], MAZO_PALETTE.dark.grass);
  assert.equal(byId.landuse_residential.paint['fill-color'], MAZO_PALETTE.dark.built);
  assert.equal(byId.landuse_school.paint['fill-color'], MAZO_PALETTE.dark.urban);
  assert.equal(byId.park.paint['fill-color'], MAZO_PALETTE.dark.park);
  assert.equal(byId.park_outline.paint['line-color'], MAZO_PALETTE.dark.parkOutline);
  assert.equal(byId.natural_earth.maxzoom, 9);
  assert.equal(byId.natural_earth.paint['raster-brightness-max'], 0.58);
  assert.equal(byId.building.paint['fill-color'], MAZO_PALETTE.dark.building);
  assert.equal(byId.building.paint['fill-outline-color'], MAZO_PALETTE.dark.buildingOutline);
  assert.equal(summary.buildings, 1);
  assert.equal(summary.vegetation, 2);
});

test('roads receive class hierarchy and geographic labels become fully opaque and readable', () => {
  const map = mockMap(sample);
  applyMazoCartographicStyle(map, 'dark');
  const byId = Object.fromEntries(map.style.layers.map((layer) => [layer.id, layer]));
  assert.equal(byId.road_minor.paint['line-color'], MAZO_PALETTE.dark.roadLocal);
  assert.equal(byId.road_minor_casing.paint['line-color'], MAZO_PALETTE.dark.roadCase);
  assert.equal(byId.road_minor_casing.paint['line-opacity'], 1);
  assert.ok(Array.isArray(byId.road_minor.paint['line-width']));
  assert.equal(byId['highway-name-major'].paint['text-color'], MAZO_PALETTE.dark.roadLabel);
  assert.equal(byId['highway-name-major'].paint['text-opacity'], 1);
  assert.equal(byId.place_city.paint['text-color'], MAZO_PALETTE.dark.label);
  assert.equal(byId.place_city.paint['icon-opacity'], 1);
});

test('light palette remains coordinated and reports supported source-layer coverage', () => {
  const map = mockMap(sample);
  const summary = applyMazoCartographicStyle(map, 'light');
  assert.equal(map.style.layers[0].paint['background-color'], MAZO_PALETTE.light.land);
  assert.equal(summary.roads, 6);
  assert.equal(summary.labels, 2);
  assert.equal(summary.boundaries, 1);
});

test('maritime admin boundaries are filtered without touching coast water polygons', () => {
  const map = mockMap(sample);
  applyMazoCartographicStyle(map, 'dark');
  const filter = map.style.layers.find((layer) => layer.id === 'boundary_country_z5-').filter;
  assert.deepEqual(filter, ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]]);
  const water = map.style.layers.find((layer) => layer.id === 'water');
  assert.deepEqual(water.filter, undefined);
  assert.equal(water.paint['fill-antialias'], true);
  const firstFilter = structuredClone(filter);
  applyMazoCartographicStyle(map, 'dark');
  assert.deepEqual(map.style.layers.find((layer) => layer.id === 'boundary_country_z5-').filter, firstFilter);
});

test('only business POI source layers are hidden; settlements and airports remain geographic labels', () => {
  assert.equal(isBasemapPlacePoiLayer({ type: 'symbol', 'source-layer': 'poi' }), true);
  assert.equal(isBasemapPlacePoiLayer({ type: 'symbol', 'source-layer': 'place' }), false);
  assert.equal(isBasemapPlacePoiLayer({ type: 'symbol', 'source-layer': 'aerodrome_label' }), false);
});

test('zoomed road hierarchy withholds local streets at country scale and reveals them later', () => {
  const map = mockMap(sample);
  applyMazoCartographicStyle(map, 'light');
  const ranges = Object.fromEntries(map.zoomRanges.map(({ id, minzoom }) => [id, minzoom]));
  assert.equal(ranges.road_motorway, 4.5);
  assert.equal(ranges.road_trunk_primary, 5.5);
  assert.equal(ranges.road_secondary_tertiary, 7.5);
  assert.equal(ranges.road_minor, 10.5);
  assert.equal(ranges.highway_path, 13.5);
  assert.equal(ranges['highway-name-major'], 8.5);
  assert.equal(ranges['highway-shield-non-us'], 9.5);
});
