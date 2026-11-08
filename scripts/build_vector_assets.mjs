import fontnik from 'fontnik';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'dist', 'vector-assets');
const fontOutput = join(root, 'dist', 'generated', 'fonts', 'MazoMapsSansRegular');
const fontPath = join(root, 'assets', 'fonts', 'MazoMapsSans-Regular.ttf');
const search = JSON.parse(await readFile(join(root, 'dist/generated/api-search-index.json'), 'utf8'));
const nameIndex = search.fields.indexOf('name');
const addressIndex = search.fields.indexOf('address');
// Map glyph requests also originate from imported OSM roads/cities, not just the
// local place-search index. Publish every BMP glyph range so unsupported ranges
// return an empty valid fontnik PBF rather than an HTML SPA fallback.
const ranges = new Set(Array.from({length: 256}, (_, i) => i * 256));
for (const row of search.records) {
  for (const value of [row[nameIndex], row[addressIndex]]) {
    for (const character of String(value || '')) {
      const point = character.codePointAt(0);
      if (point <= 0xffff) ranges.add(Math.floor(point / 256) * 256);
    }
  }
}
await mkdir(fontOutput, { recursive: true });
await mkdir(output, { recursive: true });
const font = await readFile(fontPath);
const sortedRanges = [...ranges].sort((a, b) => a - b);
for (let i = 0; i < sortedRanges.length; i += 8) {
  await Promise.all(sortedRanges.slice(i, i + 8).map(async start => {
    const end = Math.min(start + 255, 65535);
    const data = await new Promise((resolveRange, reject) => fontnik.range({ font, start, end }, (error, bytes) => {
      if (error) reject(error); else resolveRange(bytes);
    }));
    await writeFile(join(fontOutput, `${start}-${end}.pbf`), data);
  }));
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const check = Buffer.alloc(4); check.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, check]);
}
function spritePng(scale) {
  const unit = 16 * scale;
  const width = unit * 5;
  const height = unit;
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  const colors = [[20, 125, 145], [214, 59, 75], [226, 139, 40], [115, 88, 189], [41, 135, 106]];
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1); pixels[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const localX = x % unit;
      const dx = localX - (unit - 1) / 2;
      const dy = y - (unit - 1) / 2;
      const radius = unit * 0.41;
      const inner = unit * 0.14;
      const color = colors[Math.floor(x / unit)];
      const distance = Math.hypot(dx, dy);
      let rgba = [0, 0, 0, 0];
      if (distance <= radius) rgba = [255, 255, 255, 255];
      if (distance <= radius - Math.max(1, scale)) rgba = [...color, 255];
      if (distance <= inner) rgba = [255, 255, 255, 255];
      const p = row + 1 + x * 4; rgba.forEach((value, i) => { pixels[p + i] = value; });
    }
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)), pngChunk('IEND', Buffer.alloc(0))]);
}
const names = ['place', 'health', 'fuel', 'school', 'worship'];
for (const scale of [1, 2]) {
  const descriptor = Object.fromEntries(names.map((name, index) => [name, {
    width: 16 * scale, height: 16 * scale, x: index * 16 * scale, y: 0, pixelRatio: scale,
  }]));
  await writeFile(join(output, `sprite${scale === 2 ? '@2x' : ''}.json`), `${JSON.stringify(descriptor)}\n`);
  await writeFile(join(output, `sprite${scale === 2 ? '@2x' : ''}.png`), spritePng(scale));
}
console.log(JSON.stringify({ glyph_ranges: [...ranges].length, glyph_stack: 'Mazo Maps Sans Regular', sprite_icons: names.length }));
