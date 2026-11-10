import { readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

export async function listMapDataSnapshotFiles(directory) {
  const root = resolve(directory);
  const paths = [];

  async function collect(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) await collect(path);
      else if (entry.isFile() && !entry.name.endsWith('.pmtiles')) paths.push(path);
    }
  }

  await collect(root);
  return paths.filter((path) => !relative(root, path).split(sep).some((segment) => segment.endsWith('-pmtiles-chunks')))
    .map((path) => ({ path, relative: relative(root, path).split(sep).join('/') }));
}
