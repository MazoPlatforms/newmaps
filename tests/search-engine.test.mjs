import test from 'node:test';
import assert from 'node:assert/strict';
import { availableCategories, createPlaceSearchIndex, distanceMeters, normalizeSearchText, searchPlaces, transliterateSearchText } from '../assets/js/search-engine.mjs';
import { discoveryCategoryFor } from '../assets/js/place-categories.mjs';

const places = [
  { id: 'canonical-a', name: 'Aayisha Meat Shop', address: 'Main Street', categories: ['Grocery store'], discoveryCategory: 'market', coordinates: { latitude: 7.686, longitude: 81.737 } },
  { id: 'canonical-b', name: 'Aayisha Medical Centre', address: 'Lake Road', categories: ['Medical clinic'], discoveryCategory: 'health', coordinates: { latitude: 7.690, longitude: 81.740 } },
  { id: 'canonical-c', name: 'SMR Transport', address: 'Main Street', categories: ['Transportation service'], discoveryCategory: 'transport', coordinates: { latitude: 7.700, longitude: 81.750 } },
  { id: 'island', name: 'தமிழ் பள்ளி', categories: ['School'], discoveryCategory: 'school', coordinates: { latitude: 7.701, longitude: 81.751 } },
];

test('normalizes case, accents, punctuation and whitespace for matching only', () => {
  assert.equal(normalizeSearchText('  CAFÉ—Road  '), 'cafe road');
  assert.equal(places[2].name, 'SMR Transport');
  assert.equal(normalizeSearchText(places[3].name), 'தமிழ் பள்ளி');
});

test('matches approximate Tamil and Sinhala romanizations without mutating canonical Unicode names', () => {
  const local = [
    { id: 'tamil-shop', name: 'கடை', address: '', categories: ['Shop'], discoveryCategory: 'shop', coordinates: { latitude: 7.7, longitude: 81.7 } },
    { id: 'sinhala-shop', name: 'කඩේ', address: '', categories: ['Shop'], discoveryCategory: 'shop', coordinates: { latitude: 7.7, longitude: 81.7 } },
  ];
  assert.equal(transliterateSearchText('கடை'), 'katai');
  assert.equal(transliterateSearchText('කඩේ'), 'kadee');
  const index = createPlaceSearchIndex(local);
  assert.equal(index.search({ query: 'katai' })[0].place.id, 'tamil-shop');
  assert.equal(index.search({ query: 'kade' })[0].place.id, 'sinhala-shop');
  assert.equal(local[0].name, 'கடை');
});

test('matches partial names without changing or inventing place names', () => {
  assert.equal(searchPlaces(places, { query: 'meat sh' })[0].place.id, 'canonical-a');
  assert.equal(searchPlaces(places, { query: 'transport' })[0].place.name, 'SMR Transport');
  assert.equal(searchPlaces(places, { query: 'never existed' }).length, 0);
});

test('tolerates a small typo while ranking a correct name match first', () => {
  const rows = searchPlaces(places, { query: 'meat shopp' });
  assert.equal(rows[0].place.name, 'Aayisha Meat Shop');
  const ranked = searchPlaces([...places, { id: 'fuzzy', name: 'Meat Shpo', categories: [], coordinates: places[0].coordinates }], { query: 'meat shop' });
  assert.equal(ranked[0].place.id, 'canonical-a');
});

test('filters using categories present in the loaded data', () => {
  assert.deepEqual(searchPlaces(places, { category: 'health' }).map((row) => row.place.id), ['canonical-b']);
  assert.deepEqual(availableCategories(places).map((row) => row.name), ['health', 'market', 'school', 'transport']);
  assert.deepEqual(searchPlaces(places, { category: 'unsupported-category' }), []);
});

test('maps expanded Sri Lankan source categories to supported discovery filters', () => {
  assert.equal(discoveryCategoryFor({ categories: ['Private sector bank'] }), 'bank');
  assert.equal(discoveryCategoryFor({ categories: ['Hindu temple'] }), 'worship');
  assert.equal(discoveryCategoryFor({ categories: ['University'] }), 'school');
  assert.equal(discoveryCategoryFor({ categories: ['Beach'] }), 'park');
  const supported = new Set(['atm', 'bank', 'fuel', 'auto', 'electronics', 'government', 'hardware',
    'landmark', 'salon', 'sports', 'transport', 'market', 'services', 'gym', 'jewelry', 'school',
    'stationery', 'cafe', 'food', 'hotel', 'worship', 'health', 'park', 'shop']);
  for (const categories of [['Bank'], ['Church'], ['University'], ['Bus stop'], ['Beach']]) {
    assert.ok(supported.has(discoveryCategoryFor({ categories })));
  }
});

test('nearby mode sorts by distance, applies its radius and reports measured distances', () => {
  const rows = searchPlaces(places, { origin: { latitude: 7.689, longitude: 81.739 }, maxDistanceMeters: 600 });
  assert.equal(rows[0].place.id, 'canonical-b');
  assert.ok(rows[0].distanceMeters < rows[1].distanceMeters);
  assert.deepEqual(searchPlaces(places, { origin: { latitude: 0, longitude: 0 }, maxDistanceMeters: 100 }), []);
  assert.equal(distanceMeters({ latitude: 91, longitude: 0 }, places[0].coordinates), null);
});

test('district-wide search keeps distant Batticaloa places searchable without nearby mode', () => {
  const districtPlaces = [
    { id: 'south', name: 'Vellavely Public Library', categories: ['Library'], coordinates: { latitude: 7.37, longitude: 81.80 } },
    { id: 'north', name: 'Vakarai Public Library', categories: ['Library'], coordinates: { latitude: 8.12, longitude: 81.43 } },
  ];
  const rows = searchPlaces(districtPlaces, { query: 'public library' });
  assert.deepEqual(new Set(rows.map((row) => row.place.id)), new Set(['south', 'north']));
});

test('search ranking prioritizes name relevance and uses distance as a modest tie-breaker', () => {
  const rows = searchPlaces([
    { ...places[0], coordinates: { latitude: 7.69, longitude: 81.74 } },
    { ...places[0], id: 'other', name: 'Meat and grocery supplier', coordinates: { latitude: 7.686, longitude: 81.737 } },
  ], { query: 'Aayisha Meat Shop', origin: { latitude: 7.686, longitude: 81.737 } });
  assert.equal(rows[0].place.id, 'canonical-a');
});

test('suppresses repeated canonical IDs and resolves retired aliases before selection', () => {
  const rows = searchPlaces([
    { ...places[0], id: 'retired-a', name: 'Retired copy' },
    places[0],
    places[0],
  ], { aliases: { 'retired-a': { canonical_id: 'canonical-a' } } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].place.id, 'canonical-a');
  assert.equal(searchPlaces([{ id: 'missing-name', coordinates: places[0].coordinates }]).length, 0);
});

test('prepares a reusable lightweight index without changing source place records', () => {
  const snapshot = structuredClone(places);
  const index = createPlaceSearchIndex(places);
  assert.equal(index.size, places.length);
  assert.equal(index.search({ query: 'aayisha' })[0].place.id, 'canonical-a');
  assert.deepEqual(places, snapshot);
});

