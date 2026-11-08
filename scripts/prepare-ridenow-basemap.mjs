#!/usr/bin/env node
// Validate a pre-published ODbL Shortbread PMTiles file and create an R2 manifest.
// This script does not fetch third-party providers. The CI import is separate from runtime.
import { open, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const input = process.argv[2];
const output = process.argv[3];
const source = process.env.MAZO_BASEMAP_SOURCE_URL;
if (!input || !output || !source || !source.startsWith('https://data.bbbike.org/')) {
  console.error('Usage: MAZO_BASEMAP_SOURCE_URL=https://data.bbbike.org/... node scripts/prepare-ridenow-basemap.mjs archive.pmtiles manifest.json');
  process.exit(2);
}
const fd = await open(input, 'r');
try {
  const stat = await fd.stat();
  if (stat.size < 127 || stat.size > 2_000_000_000) throw Error('Implausible PMTiles size');
  const header = Buffer.alloc(127);
  if ((await fd.read(header,0,127,0)).bytesRead !== 127) throw Error('Short PMTiles header');
  if (header.toString('utf8',0,7) !== 'PMTiles' || header[7] !== 3) throw Error('Not PMTiles v3');
  const u64 = pos => {
    const v=header.readBigUInt64LE(pos);
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('PMTiles offset overflow');
    return Number(v);
  };
  const metaOffset=u64(24),metaLength=u64(32);
  const rootOffset=u64(8),rootLength=u64(16);
  const tileOffset=u64(56),tileLength=u64(64);
  const internalCompression=header[97],tileCompression=header[98],tileType=header[99];
  const minzoom=header[100],maxzoom=header[101];
  if (![1,2].includes(internalCompression)||![1,2].includes(tileCompression)||tileType!==1||
      rootOffset<127||rootOffset+rootLength>stat.size||
      metaLength<2||metaLength>2_000_000||metaOffset+metaLength>stat.size||
      tileOffset+tileLength>stat.size||minzoom>maxzoom||maxzoom>22)
    throw Error('Unsupported PMTiles headers or compression');
  const bounds=[102,106,110,114].map(i=>header.readInt32LE(i)/1e7);
  if (!(bounds[0]>=-180&&bounds[2]<=180&&bounds[1]>=-90&&bounds[3]<=90&&bounds[0]<bounds[2]&&bounds[1]<bounds[3]))
    throw Error('Invalid geographic extent');
  const compressed=Buffer.alloc(metaLength);
  if ((await fd.read(compressed,0,metaLength,metaOffset)).bytesRead!==metaLength) throw Error('Truncated metadata');
  const meta=JSON.parse((internalCompression===2?gunzipSync(compressed):compressed).toString('utf8'));
  let layers=meta.vector_layers;
  if (typeof layers==='string') layers=JSON.parse(layers);
  if (!Array.isArray(layers)) throw Error('Archive has no vector_layers declaration; cannot validate Shortbread schema');
  const names=new Set(layers.map(l=>l.id));
  for (const mandatory of ['streets','buildings']) {
    if (!names.has(mandatory))throw Error('Missing mandatory layer: '+mandatory);
  }
  if (!names.has('ocean')&&!names.has('water_polygons')) throw Error('Missing water layer');
  const file=await readFile(input);
  const revision=createHash('sha256').update(file).digest('hex');
  const manifest={
    schema:'MazoBasemap/1', revision, archive_key:`basemap/archives/${revision}.pmtiles`,
    bytes:stat.size, bounds, minzoom, maxzoom, vector_layers:layers,
    attribution:'© OpenStreetMap contributors (ODbL 1.0)',
    license:'ODbL-1.0', source:{publisher:'BBBike.org',url:source,format:'Shortbread PMTiles'},
    imported_at:new Date().toISOString(), coverage:'Sri Lanka'
  };
  await writeFile(output, JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({revision,bytes:stat.size,bounds,zoom:[minzoom,maxzoom],layers:[...names]},null,2));
} finally { await fd.close(); }
