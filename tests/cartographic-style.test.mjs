import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMazoCartographicStyle, MAZO_PALETTE } from '../assets/js/cartographic-style.mjs';

function mockMap(layers) {
  const style = { layers: structuredClone(layers) };
  return {
    style,
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
  };
}

const sample = [
  { id: 'background', type: 'background', paint: { 'background-color': '#000' } },
  { id: 'water', type: 'fill', source: 'base', 'source-layer': 'water', paint: { 'fill-color': '#000' } },
  { id: 'land', type: 'fill', source: 'base', 'source-layer': 'land', paint: { 'fill-color': '#000' } },
  { id: 'landcover_wood', type: 'fill', source: 'base', 'source-layer': 'landcover', paint: { 'fill-color': '#000' } },
  { id: 'building', type: 'fill', source: 'base', 'source-layer': 'building', paint: { 'fill-color': '#000', 'fill-outline-color': '#000' } },
  { id: 'road_minor_casing', type: 'line', source: 'base', 'source-layer': 'transportation', paint: { 'line-color': '#000', 'line-opacity': 0.2 } },
  { id: 'road_minor', type: 'line', source: 'base', 'source-layer': 'transportation', paint: { 'line-color': '#000', 'line-width': 18 } },
  { id: 'highway_major_inner', type: 'line', source: 'base', 'source-layer': 'transportation', paint: { 'line-color': '#000' } },
  { id: 'highway-name-major', type: 'symbol', source: 'base', 'source-layer': 'transportation_name', layout: { 'text-field': ['get', 'name'] }, paint: { 'text-color': '#333', 'text-halo-color': '#000' } },
  { id: 'place_city', type: 'symbol', source: 'base', 'source-layer': 'place', layout: { 'text-field': ['get', 'name'], 'icon-image': 'circle' }, paint: { 'text-color': '#555', 'icon-opacity': 0.7 } },
];

test('dark palette restores separation among water, land, vegetation and buildings', () => {
  const map = mockMap(sample);
  const summary = applyMazoCartographicStyle(map, 'dark');
  const byId = Object.fromEntries(map.style.layers.map((layer) => [layer.id, layer]));
  assert.equal(byId.background.paint['background-color'], MAZO_PALETTE.dark.water);
  assert.equal(byId.water.paint['fill-color'], MAZO_PALETTE.dark.water);
  assert.equal(byId.land.paint['fill-color'], MAZO_PALETTE.dark.land);
  assert.equal(byId.landcover_wood.paint['fill-color'], MAZO_PALETTE.dark.vegetationDark);
  assert.equal(byId.building.paint['fill-color'], MAZO_PALETTE.dark.building);
  assert.equal(byId.building.paint['fill-outline-color'], MAZO_PALETTE.dark.buildingOutline);
  assert.equal(summary.buildings, 1);
  assert.equal(summary.vegetation, 1);
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
  assert.equal(map.style.layers[0].paint['background-color'], MAZO_PALETTE.light.water);
  assert.equal(summary.roads, 3);
  assert.equal(summary.labels, 1);
  assert.equal(summary.boundaries, 0);
});
