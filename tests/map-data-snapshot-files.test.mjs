import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listMapDataSnapshotFiles } from '../scripts/map-data-snapshot-files.mjs';

test('map snapshot file enumeration preserves nested paths and excludes PMTiles objects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mazo-snapshot-files-'));
  try {
    await mkdir(join(root, 'data', 'places', '0007'), { recursive: true });
    await mkdir(join(root, 'generated', 'places-pmtiles-chunks'), { recursive: true });
    await mkdir(join(root, 'generated', 'nested'), { recursive: true });
    await writeFile(join(root, 'data', 'places', '0007', 'place.json'), '{}');
    await writeFile(join(root, 'generated', 'nested', 'manifest.json'), '{}');
    await writeFile(join(root, 'generated', 'places.pmtiles'), 'archive');
    await writeFile(join(root, 'generated', 'places-pmtiles-chunks', '00000.bin'), 'chunk');

    const files = await listMapDataSnapshotFiles(root);
    assert.deepEqual(files.map(({ relative }) => relative).sort(), [
      'data/places/0007/place.json',
      'generated/nested/manifest.json',
    ]);
    assert.ok(files.every(({ path }) => path.startsWith(root)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
