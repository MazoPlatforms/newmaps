// Builds EVERY glyph range (0-65535) for the self-hosted basemap from the bundled,
// OFL-licensed Mazo Maps Sans font, so labels never request a font from a CDN.
// Output: assets/basemap/fonts/MazoMapsSansRegular/<start>-<end>.pbf
import fontnik from 'fontnik';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const font = await readFile(join(root, 'assets', 'fonts', 'MazoMapsSans-Regular.ttf'));
const output = join(root, 'assets', 'basemap', 'fonts', 'MazoMapsSansRegular');
await mkdir(output, { recursive: true });

let written = 0;
for (let start = 0; start < 65536; start += 256) {
  const end = start + 255;
  const data = await new Promise((resolveRange, reject) => fontnik.range({ font, start, end }, (error, bytes) => {
    if (error) reject(error); else resolveRange(bytes);
  }));
  await writeFile(join(output, `${start}-${end}.pbf`), data);
  written += 1;
}
console.log(JSON.stringify({ font_stack: 'MazoMapsSansRegular', glyph_ranges: written }));
