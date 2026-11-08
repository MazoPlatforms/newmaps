import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMazoCartographicStyle, MAZO_PALETTE } from '../assets/js/cartographic-style.mjs';

test('light/dark palette updates self-hosted Shortbread layers without fetching a new style', () => {
  const layers = [
    { id: 'mazo-background', type: 'background', paint: { 'background-color': '#fff' } },
    { id: 'mazo-ocean', type: 'fill', 'source-layer': 'ocean', paint: { 'fill-color': '#fff' } },
    { id: 'mazo-inland-water', type: 'fill', 'source-layer': 'water_polygons', paint: { 'fill-color': '#fff' } },
    { id: 'mazo-water-lines', type: 'line', 'source-layer': 'water_lines', paint: { 'line-color': '#fff' } },
    { id: 'mazo-buildings', type: 'fill', 'source-layer': 'buildings', paint: { 'fill-color': '#fff' } },
    { id: 'mazo-minor-roads', type: 'line', 'source-layer': 'streets', paint: { 'line-color': '#fff', 'line-width': 1 } },
    { id: 'mazo-major-roads', type: 'line', 'source-layer': 'streets', paint: { 'line-color': '#fff', 'line-width': 2 } },
  ];
  const changes = [];
  const map = {
    getStyle: () => ({ layers }),
    setPaintProperty: (id, property, value) => changes.push({ id, property, value }),
    setLayerZoomRange: () => {},
  };
  const stats = applyMazoCartographicStyle(map, 'dark');
  const property = (id, key) => changes.find(v => v.id === id && v.property === key)?.value;
  assert.equal(property('mazo-background', 'background-color'), MAZO_PALETTE.dark.land);
  assert.equal(property('mazo-ocean', 'fill-color'), MAZO_PALETTE.dark.water);
  assert.equal(property('mazo-inland-water', 'fill-color'), MAZO_PALETTE.dark.water);
  assert.equal(property('mazo-water-lines', 'line-color'), MAZO_PALETTE.dark.waterLine);
  assert.equal(property('mazo-buildings', 'fill-color'), MAZO_PALETTE.dark.building);
  assert.equal(property('mazo-minor-roads', 'line-color'), MAZO_PALETTE.dark.roadLocal);
  assert.equal(property('mazo-major-roads', 'line-color'), MAZO_PALETTE.dark.roadMajor);
  assert.ok(stats.roads >= 2);
  assert.ok(stats.water >= 2);
  assert.ok(stats.buildings >= 1);
});
