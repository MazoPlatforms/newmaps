const SEARCH_REQUIRED = ['id', 'name', 'coordinates', 'categories', 'discoveryCategory'];

export function createPlaceLookup(places, aliases = {}) {
  const canonical = new Map();
  for (const place of places ?? []) if (place?.id && !canonical.has(place.id)) canonical.set(place.id, place);
  const resolve = (id) => {
    const seen = new Set();
    while (Object.hasOwn(aliases, id)) {
      if (seen.has(id)) throw new Error(`Place alias cycle at ${id}`);
      seen.add(id);
      id = typeof aliases[id] === 'string' ? aliases[id] : aliases[id]?.canonical_id;
      if (typeof id !== 'string') return null;
    }
    return id;
  };
  const lookup = new Map(canonical);
  for (const retiredId of Object.keys(aliases)) {
    const activeId = resolve(retiredId);
    if (canonical.has(activeId)) lookup.set(retiredId, canonical.get(activeId));
  }
  return lookup;
}

export function decodeSearchIndex(payload) {
  if (payload?.version !== 1 || !Array.isArray(payload.fields) || !Array.isArray(payload.records)) {
    throw new Error('Unsupported place search index');
  }
  const indexes = Object.fromEntries(payload.fields.map((field, index) => [field, index]));
  for (const field of SEARCH_REQUIRED) {
    if (!Object.hasOwn(indexes, field)) throw new Error(`Search index is missing ${field}`);
  }
  const seen = new Set();
  return payload.records.map((row) => {
    if (!Array.isArray(row) || row.length !== payload.fields.length) throw new Error('Malformed search index row');
    const id = row[indexes.id];
    const name = row[indexes.name];
    const coordinate = row[indexes.coordinates];
    if (typeof id !== 'string' || !id || typeof name !== 'string' || !name || seen.has(id)) {
      throw new Error('Invalid or duplicate place in search index');
    }
    if (coordinate !== null && (!Array.isArray(coordinate) || coordinate.length !== 2 || !coordinate.every(Number.isFinite) ||
        Math.abs(coordinate[0]) > 180 || Math.abs(coordinate[1]) > 90)) {
      throw new Error(`Invalid coordinates in search index for ${id}`);
    }
    seen.add(id);
    return Object.fromEntries(payload.fields.map((field, index) => [
      field,
      field === 'coordinates'
        ? (coordinate ? { longitude: coordinate[0], latitude: coordinate[1] } : null)
        : row[index],
    ]));
  });
}

export function decodePlaceDetails(payload) {
  if (payload?.version !== 1 || !Array.isArray(payload.fields) || !Array.isArray(payload.records)) {
    throw new Error('Unsupported place details index');
  }
  const details = new Map();
  for (const row of payload.records) {
    if (!Array.isArray(row) || row.length !== payload.fields.length + 1 || typeof row[0] !== 'string' || details.has(row[0])) {
      throw new Error('Malformed or duplicate place details row');
    }
    details.set(row[0], Object.fromEntries(payload.fields.map((field, index) => [field, row[index + 1]])));
  }
  return details;
}
