export const ROUTING_MODE_BITS = Object.freeze({ driving: 1, walking: 2, cycling: 4 });
export const MAX_SNAP_DISTANCE_METERS = 80;

const radians = (degrees) => degrees * Math.PI / 180;

export function distanceMeters(a, b) {
  const lat1 = radians(a[1]);
  const lat2 = radians(b[1]);
  const dLat = lat2 - lat1;
  const dLon = radians(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function project(point, start, end) {
  const latitude = radians((start[1] + end[1] + point[1]) / 3);
  const scaleX = Math.cos(latitude);
  const px = (point[0] - start[0]) * scaleX;
  const py = point[1] - start[1];
  const dx = (end[0] - start[0]) * scaleX;
  const dy = end[1] - start[1];
  const denominator = dx * dx + dy * dy;
  const t = denominator ? Math.max(0, Math.min(1, (px * dx + py * dy) / denominator)) : 0;
  const coordinate = [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
  return { t, coordinate, distance: distanceMeters(point, coordinate) };
}

export function validateRoutingGraph(graph) {
  if (graph?.version !== 1 || !Array.isArray(graph.nodes) || !Array.isArray(graph.ways) || !Array.isArray(graph.segments)) {
    throw new Error('Unsupported local routing graph');
  }
  for (const segment of graph.segments) {
    if (!Array.isArray(segment) || segment.length !== 5 ||
        !Number.isInteger(segment[0]) || !Number.isInteger(segment[1]) ||
        segment[0] < 0 || segment[1] < 0 || segment[0] >= graph.nodes.length || segment[1] >= graph.nodes.length ||
        !Number.isInteger(segment[2]) || segment[2] < 0 || segment[2] >= graph.ways.length ||
        !Number.isInteger(segment[3]) || !Number.isInteger(segment[4])) {
      throw new Error('Malformed local routing segment');
    }
  }
  return graph;
}

function snapPoint(graph, coordinate, modeBit, maximumDistance) {
  if (!Array.isArray(coordinate) || coordinate.length !== 2 || !coordinate.every(Number.isFinite) ||
      Math.abs(coordinate[0]) > 180 || Math.abs(coordinate[1]) > 90) return null;
  let best = null;
  for (let index = 0; index < graph.segments.length; index += 1) {
    const [aIndex, bIndex, wayIndex, forward, reverse] = graph.segments[index];
    if (!((forward | reverse) & modeBit)) continue;
    const a = graph.nodes[aIndex];
    const b = graph.nodes[bIndex];
    const hit = project(coordinate, a, b);
    if (!best || hit.distance < best.distance) {
      best = { segmentIndex: index, aIndex, bIndex, wayIndex, forward, reverse, ...hit };
    }
  }
  return best && best.distance <= maximumDistance ? best : null;
}

function addEdge(adjacency, from, to, way, meters, penalty = 1) {
  if (!adjacency.has(from)) adjacency.set(from, []);
  adjacency.get(from).push({ to, way, meters, cost: meters * penalty });
}

const adjacencyCache = new WeakMap();
function networkFor(graph, modeBit) {
  let modes = adjacencyCache.get(graph);
  if (!modes) { modes = new Map(); adjacencyCache.set(graph, modes); }
  if (modes.has(modeBit)) return modes.get(modeBit);
  const adjacency = new Map();
  for (const [a, b, way, forward, reverse] of graph.segments) {
    const meters = distanceMeters(graph.nodes[a], graph.nodes[b]);
    if (forward & modeBit) addEdge(adjacency, a, b, way, meters);
    if (reverse & modeBit) addEdge(adjacency, b, a, way, meters);
  }
  modes.set(modeBit, adjacency);
  return adjacency;
}

class MinHeap {
  #items = [];
  get size() { return this.#items.length; }
  push(item) {
    const items = this.#items;
    items.push(item);
    let index = items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (items[parent][0] <= item[0]) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = item;
  }
  pop() {
    const items = this.#items;
    if (!items.length) return null;
    const first = items[0];
    const last = items.pop();
    if (items.length) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= items.length) break;
        const child = right < items.length && items[right][0] < items[left][0] ? right : left;
        if (items[child][0] >= last[0]) break;
        items[index] = items[child];
        index = child;
      }
      items[index] = last;
    }
    return first;
  }
}

function localTimeSeconds(meters, profile, highway) {
  if (profile === 'walking') return meters / (highway === 'steps' ? 0.65 : 1.15);
  if (profile === 'cycling') return meters / (highway === 'cycleway' ? 4.2 : 3.2);
  const kmh = ({ trunk: 35, trunk_link: 30, primary: 30, primary_link: 25, secondary: 25,
    tertiary: 22, unclassified: 20, residential: 18, living_street: 12, service: 12,
    track: 12, road: 18, roundabout: 20 })[highway] ?? 18;
  return meters / (kmh * 1000 / 3600);
}

function routeOnce(graph, from, to, profile, penalizedWays) {
  const modeBit = ROUTING_MODE_BITS[profile];
  if (!modeBit) throw new Error(`Unsupported routing mode: ${profile}`);
  const startId = graph.nodes.length;
  const endId = startId + 1;
  const adjacency = networkFor(graph, modeBit);
  const startEdges = [];
  const endEdges = new Map();
  const penaltySet = new Set(penalizedWays);
  const addEndEdge = (node, way, meters) => addEdge(endEdges, node, endId, way, meters);

  const startSegment = graph.segments[from.segmentIndex];
  const startLength = distanceMeters(graph.nodes[from.aIndex], graph.nodes[from.bIndex]);
  if (startSegment[4] & modeBit) startEdges.push({ to: from.aIndex, way: from.wayIndex, meters: startLength * from.t, cost: startLength * from.t });
  if (startSegment[3] & modeBit) startEdges.push({ to: from.bIndex, way: from.wayIndex, meters: startLength * (1 - from.t), cost: startLength * (1 - from.t) });

  const endSegment = graph.segments[to.segmentIndex];
  const endLength = distanceMeters(graph.nodes[to.aIndex], graph.nodes[to.bIndex]);
  if (endSegment[3] & modeBit) addEndEdge(to.aIndex, to.wayIndex, endLength * to.t);
  if (endSegment[4] & modeBit) addEndEdge(to.bIndex, to.wayIndex, endLength * (1 - to.t));
  if (from.segmentIndex === to.segmentIndex) {
    if (to.t >= from.t && (startSegment[3] & modeBit)) startEdges.push({ to: endId, way: from.wayIndex, meters: startLength * (to.t - from.t), cost: startLength * (to.t - from.t) });
    if (to.t < from.t && (startSegment[4] & modeBit)) startEdges.push({ to: endId, way: from.wayIndex, meters: startLength * (from.t - to.t), cost: startLength * (from.t - to.t) });
  }

  const distance = new Map([[startId, 0]]);
  const previous = new Map();
  const unsettled = new MinHeap();
  unsettled.push([0, startId]);
  while (unsettled.size) {
    const [currentCost, current] = unsettled.pop();
    if (currentCost !== distance.get(current)) continue;
    if (current === endId) break;
    const networkEdges = current === startId ? startEdges : adjacency.get(current) ?? [];
    const targetEdges = endEdges.get(current) ?? [];
    for (const edge of targetEdges.length ? [...networkEdges, ...targetEdges] : networkEdges) {
      const edgeCost = edge.meters * (penaltySet.has(edge.way) ? 2.4 : 1);
      if ((distance.get(edge.to) ?? Infinity) <= currentCost + edgeCost) continue;
      distance.set(edge.to, currentCost + edgeCost);
      previous.set(edge.to, { from: current, edge });
      unsettled.push([currentCost + edgeCost, edge.to]);
    }
  }
  if (!previous.has(endId)) return { error: 'no_connected_route', startSnapMeters: from.distance, endSnapMeters: to.distance };

  const path = [];
  let cursor = endId;
  while (cursor !== startId) {
    const entry = previous.get(cursor);
    if (!entry) return { error: 'no_connected_route', startSnapMeters: from.distance, endSnapMeters: to.distance };
    path.push({ ...entry.edge, from: entry.from, to: cursor });
    cursor = entry.from;
  }
  path.reverse();
  const nodeSequence = [startId];
  for (const edge of path) nodeSequence.push(edge.to);
  const coordinates = [from.coordinate];
  for (const id of nodeSequence.slice(1, -1)) coordinates.push(graph.nodes[id]);
  coordinates.push(to.coordinate);
  const compactCoordinates = coordinates.filter((point, index) => !index || distanceMeters(point, coordinates[index - 1]) > 0.25);
  const meters = path.reduce((sum, edge) => sum + edge.meters, 0);
  const durationSeconds = path.reduce((sum, edge) => sum + localTimeSeconds(edge.meters, profile, graph.ways[edge.way]?.highway), 0);
  return {
    profile,
    source: 'local-road-graph',
    geometry: { type: 'LineString', coordinates: compactCoordinates },
    distance: meters,
    duration: durationSeconds,
    startSnapMeters: from.distance,
    endSnapMeters: to.distance,
    edges: path,
    ways: [...new Set(path.map((edge) => edge.way))],
    instructions: makeInstructions(graph, path, from.coordinate, to.coordinate, startId, endId),
    durationNote: 'Offline time is an estimate using average speeds by road class, not posted or verified speed limits.',
  };
}

function bearing(a, b) {
  const y = Math.sin(radians(b[0] - a[0])) * Math.cos(radians(b[1]));
  const x = Math.cos(radians(a[1])) * Math.sin(radians(b[1])) - Math.sin(radians(a[1])) * Math.cos(radians(b[1])) * Math.cos(radians(b[0] - a[0]));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function makeInstructions(graph, edges, startCoordinate, endCoordinate, startId, endId) {
  const coordinateFor = (node) => node === startId ? startCoordinate : node === endId ? endCoordinate : graph.nodes[node];
  const instructions = [{ type: 'depart', modifier: '', name: graph.ways[edges[0]?.way]?.name ?? '', location: startCoordinate, progressMeters: 0 }];
  let progress = 0;
  for (let i = 1; i < edges.length; i += 1) {
    const previous = edges[i - 1];
    const current = edges[i];
    const previousName = graph.ways[previous.way]?.name ?? '';
    const currentName = graph.ways[current.way]?.name ?? '';
    const vertex = coordinateFor(current.from);
    const changesRoad = currentName && previousName && currentName !== previousName;
    let modifier = '';
    if (i < edges.length - 1) {
      const next = edges[i + 1];
      const incoming = bearing(coordinateFor(previous.from), vertex);
      const outgoing = bearing(vertex, coordinateFor(next.to));
      const delta = ((outgoing - incoming + 540) % 360) - 180;
      if (Math.abs(delta) >= 28) modifier = delta < 0 ? 'left' : 'right';
    }
    progress += previous.meters;
    if (changesRoad || modifier) instructions.push({ type: modifier ? 'turn' : 'continue', modifier, name: currentName, location: vertex, progressMeters: progress });
  }
  const last = edges.at(-1);
  if (last) instructions.push({ type: 'arrive', modifier: '', name: graph.ways[last.way]?.name ?? '', location: endCoordinate, progressMeters: edges.reduce((sum, edge) => sum + edge.meters, 0) });
  return instructions;
}

export function findLocalRoutes(graph, start, finish, profile, { alternatives = 2, maxSnapDistance = MAX_SNAP_DISTANCE_METERS } = {}) {
  validateRoutingGraph(graph);
  const modeBit = ROUTING_MODE_BITS[profile];
  if (!modeBit) throw new Error(`Unsupported routing mode: ${profile}`);
  const from = snapPoint(graph, start, modeBit, maxSnapDistance);
  const to = snapPoint(graph, finish, modeBit, maxSnapDistance);
  if (!from || !to) return { error: 'snap_too_far', startSnapMeters: from?.distance ?? null, endSnapMeters: to?.distance ?? null };
  const routes = [];
  const penalizedWays = [];
  const seen = new Set();
  for (let attempt = 0; attempt <= alternatives; attempt += 1) {
    const result = routeOnce(graph, from, to, profile, penalizedWays);
    if (result.error) {
      if (!routes.length) return result;
      break;
    }
    const key = result.edges.map((edge) => `${edge.from}>${edge.to}:${edge.way}`).join('|');
    if (seen.has(key)) break;
    seen.add(key);
    routes.push(result);
    const newWays = result.ways.filter((way) => !penalizedWays.includes(way));
    if (!newWays.length) break;
    penalizedWays.push(...newWays);
  }
  return { routes, startSnapMeters: routes[0].startSnapMeters, endSnapMeters: routes[0].endSnapMeters };
}

export function closestRouteProgress(geometry, coordinate) {
  if (!Array.isArray(geometry) || geometry.length < 2 || !Array.isArray(coordinate)) return null;
  let total = 0;
  let best = null;
  for (let i = 0; i < geometry.length - 1; i += 1) {
    const a = geometry[i];
    const b = geometry[i + 1];
    const segment = distanceMeters(a, b);
    const hit = project(coordinate, a, b);
    const along = total + segment * hit.t;
    if (!best || hit.distance < best.distanceMeters) best = { distanceMeters: hit.distance, progressMeters: along, coordinate: hit.coordinate };
    total += segment;
  }
  return { ...best, routeLengthMeters: total };
}
