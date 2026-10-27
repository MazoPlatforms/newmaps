import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { createPlaceSearchIndex } from '../assets/js/search-engine.mjs';
import { decodeSearchIndex } from '../assets/js/place-delivery.mjs';

const mzpBytes = readFileSync('generated/batticaloa-district.mzp');
const searchBytes = readFileSync('generated/search-index.json');
const aliases = JSON.parse(readFileSync('data/places/aliases.json', 'utf8')).aliases;

function percentile(values, fraction) {
  return [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
}

function benchmark(name, bytes, decode) {
  const samples = [];
  let records = 0;
  for (let trial = 0; trial < 7; trial++) {
    global.gc?.();
    const start = performance.now();
    const parsed = JSON.parse(bytes.toString('utf8'));
    const parseMs = performance.now() - start;
    const conversionStart = performance.now();
    const places = decode(parsed);
    const index = createPlaceSearchIndex(places, aliases);
    const initializeMs = performance.now() - conversionStart;
    const queryStart = performance.now();
    for (let i = 0; i < 10; i++) index.search({ query: 'school kattankudy' });
    const tenSearchesMs = performance.now() - queryStart;
    records = index.size;
    global.gc?.();
    samples.push({ parseMs, initializeMs, searchesMs: tenSearchesMs * 10 });
  }
  const result = (key) => ({
    median: Number(percentile(samples.map((sample) => sample[key]), 0.5).toFixed(3)),
    p95: Number(percentile(samples.map((sample) => sample[key]), 0.95).toFixed(3)),
  });
  return {
    name, bytes: bytes.length, gzipBytes: gzipSync(bytes, { level: 9, mtime: 0 }).length,
    records, trials: samples.length, jsonParseMs: result('parseMs'),
    decodeAndIndexMs: result('initializeMs'), oneHundredSearchesMs: result('searchesMs'),
  };
}

const result = {
  runtime: `Node ${process.version}; CPU benchmark only, not a browser benchmark`,
  mzp: benchmark('MZP GeoJSON', mzpBytes, (collection) => collection.features.map((feature) => ({
    ...feature.properties,
    id: feature.id,
    coordinates: { longitude: feature.geometry.coordinates[0], latitude: feature.geometry.coordinates[1] },
  }))),
  compact: benchmark('PMTiles independent search index', searchBytes, decodeSearchIndex),
};
console.log(JSON.stringify(result, null, 2));
