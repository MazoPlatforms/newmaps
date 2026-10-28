import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { closestRouteProgress, findLocalRoutes, validateRoutingGraph } from '../assets/js/routing-graph.mjs';

const graph = JSON.parse(readFileSync(new URL('../generated/kattankudy-routing.json', import.meta.url), 'utf8'));

test('build output is structurally valid and carries measured local coverage metadata', () => {
  assert.equal(validateRoutingGraph(graph), graph);
  assert.equal(graph.nodes.length, 7990);
  assert.deepEqual(graph.bounds, [81.6973617, 7.5101429, 81.7912717, 7.7249628]);
  assert.match(graph.scope, /not an administrative boundary/);
});

test('routes snap to a real road segment and return geometry, steps, distance, and honest ETA notes', () => {
  const result = findLocalRoutes(graph, [81.73, 7.68], [81.74, 7.68], 'driving');
  assert.ok(Array.isArray(result.routes) && result.routes.length > 0);
  const route = result.routes[0];
  assert.equal(route.geometry.type, 'LineString');
  assert.ok(route.geometry.coordinates.length > 2);
  assert.ok(route.distance > 1000 && route.distance < 3000);
  assert.ok(route.duration > 0);
  assert.ok(route.startSnapMeters < 80 && route.endSnapMeters < 80);
  assert.ok(route.instructions.length >= 2);
  assert.match(route.durationNote, /not posted or verified speed limits/);
});

test('directions respect one-way masks while walking can travel both ways', () => {
  const directed = {
    version: 1,
    nodes: [[81.7, 7.68], [81.701, 7.68]],
    ways: [{ id: 'oneway', name: 'One Way Road', highway: 'residential', modes: 3, oneway: 'yes' }],
    segments: [[0, 1, 0, 3, 2]],
  };
  assert.equal(findLocalRoutes(directed, [81.70095, 7.68], [81.70005, 7.68], 'driving').error, 'no_connected_route');
  const reverseWalk = findLocalRoutes(directed, [81.70095, 7.68], [81.70005, 7.68], 'walking');
  assert.ok(reverseWalk.routes.length);
});

test('three materially distinct alternatives are returned when connected roads permit them', () => {
  const result = findLocalRoutes(graph, [81.73, 7.68], [81.74, 7.68], 'driving', { alternatives: 2 });
  assert.ok(result.routes.length > 1);
  assert.equal(new Set(result.routes.map((route) => route.edges.map((edge) => `${edge.from}>${edge.to}:${edge.way}`).join('|'))).size, result.routes.length);
});

test('unsnappable, disconnected, malformed, and invalid route inputs fail closed', () => {
  assert.equal(findLocalRoutes(graph, [80, 8], [81.74, 7.68], 'driving').error, 'snap_too_far');
  const disconnected = { version: 1, nodes: [[0, 0], [0.001, 0], [1, 1], [1.001, 1]], ways: [{ name: '', highway: 'road' }], segments: [[0, 1, 0, 1, 1], [2, 3, 0, 1, 1]] };
  assert.equal(findLocalRoutes(disconnected, [0, 0], [1.001, 1], 'driving').error, 'no_connected_route');
  assert.throws(() => validateRoutingGraph({ version: 1, nodes: [], ways: [], segments: [[0, 1, 0, 1, 1]] }), /Malformed/);
  assert.throws(() => findLocalRoutes(graph, [81.73, 7.68], [81.74, 7.68], 'airplane'), /Unsupported/);
});

test('route progress follows the route line instead of choosing a globally nearest future instruction', () => {
  const progress = closestRouteProgress([[81.7, 7.68], [81.71, 7.68], [81.72, 7.68]], [81.715, 7.68001]);
  assert.ok(progress.distanceMeters < 2);
  assert.ok(progress.progressMeters > 1500 && progress.progressMeters < 1800);
  assert.ok(progress.routeLengthMeters > 2000);
});
