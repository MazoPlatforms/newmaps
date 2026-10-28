import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlaceSearchIndex } from '../assets/js/search-engine.mjs';
import { createPlaceLookup, decodePlaceDetails, decodeSearchIndex } from '../assets/js/place-delivery.mjs';
import { discoveryCategoryFor } from '../assets/js/place-categories.mjs';

const id = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

test('compact search index preserves ULID, complete category discovery and exact coordinates', () => {
  const payload = { version: 1, fields: ['id', 'name', 'coordinates', 'categories', 'discoveryCategory', 'address'],
    records: [[id, 'Example Pharmacy', [81.73, 7.68], ['Pharmacy'], 'health', 'Main Street']] };
  const places = decodeSearchIndex(payload);
  assert.equal(places.length, 1);
  assert.equal(places[0].id, id);
  assert.deepEqual(places[0].coordinates, { longitude: 81.73, latitude: 7.68 });
  assert.equal(createPlaceSearchIndex(places).search({ query: 'pharmcy' })[0].place.id, id);
});

test('malformed, duplicate, or geographically invalid search records are rejected', () => {
  const fields = ['id', 'name', 'coordinates', 'categories', 'discoveryCategory'];
  assert.throws(() => decodeSearchIndex({ version: 2, fields, records: [] }), /Unsupported/);
  assert.throws(() => decodeSearchIndex({ version: 1, fields, records: [[id, 'A', [181, 0], [], 'shop']] }), /Invalid coordinates/);
  assert.throws(() => decodeSearchIndex({ version: 1, fields, records: [[id, 'A', [0, 0], [], 'shop'], [id, 'B', [0, 0], [], 'shop']] }), /duplicate/);
});

test('eligible public place without coordinates remains searchable and opens without moving the map', () => {
  const places = decodeSearchIndex({ version: 1,
    fields: ['id', 'name', 'coordinates', 'categories', 'discoveryCategory'],
    records: [[id, 'Unlocated Community Library', null, ['Library'], 'landmark']] });
  assert.equal(places.length, 1);
  assert.equal(places[0].coordinates, null);
  assert.equal(createPlaceSearchIndex(places).search({ query: 'community library' })[0].place.id, id);
});

test('details index retains complete display fields and canonical ULID lookup', () => {
  const details = decodePlaceDetails({ version: 1, fields: ['phone', 'website', 'hours'],
    records: [[id, '+94112223333', 'https://example.test', [{ day: 'Monday', times: ['09:00-17:00'] }]]] });
  assert.equal(details.get(id).phone, '+94112223333');
  assert.equal(details.get(id).website, 'https://example.test');
  assert.equal(details.get(id).hours[0].day, 'Monday');
});

test('details index rejects duplicate identifiers and malformed rows', () => {
  assert.throws(() => decodePlaceDetails({ version: 1, fields: ['phone'], records: [[id, '1'], [id, '2']] }), /duplicate/);
  assert.throws(() => decodePlaceDetails({ version: 1, fields: ['phone'], records: [[id]] }), /Malformed/);
});

test('canonical and retired ULIDs resolve to the same selected place', () => {
  const place = { id, name: 'Example Place' };
  const lookup = createPlaceLookup([place], { '01ARZ3NDEKTSV4RRFFQ69G5FAW': { canonical_id: id } });
  assert.equal(lookup.get(id), place);
  assert.equal(lookup.get('01ARZ3NDEKTSV4RRFFQ69G5FAW'), place);
  assert.throws(() => createPlaceLookup([place], { A: { canonical_id: 'B' }, B: { canonical_id: 'A' } }), /alias cycle/);
});

test('generated category identifiers match frontend category and filter rules for every searchable place', () => {
  const manifest = JSON.parse(readFileSync('generated/manifest.json', 'utf8'));
  assert.equal(manifest.production_default, 'pmtiles');
  assert.equal(manifest.format, 'PMTiles/1');
  assert.equal('geojson' in manifest, false);
  assert.equal('sha256' in manifest, false);
  assert.equal(readFileSync('generated/kattankudy-roads.mzp').length > 0, true);
  assert.equal(readFileSync('generated/kattankudy-speed-limits.mzp').length > 0, true);
  assert.throws(() => readFileSync('generated/batticaloa-district.mzp'));
  const entry = manifest.delivery.search_index;
  const payload = JSON.parse(readFileSync(`generated/${entry.file}`, 'utf8'));
  const places = decodeSearchIndex(payload);
  assert.equal(places.length, entry.records);
  for (const place of places) assert.equal(place.discoveryCategory, discoveryCategoryFor(place), place.id);
});
