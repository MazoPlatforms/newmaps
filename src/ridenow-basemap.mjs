// Serve a pre-ingested Shortbread PMTiles snapshot exclusively from Cloudflare R2.
// No upstream tile host is fetched from within requests. The existing POI and
// RideNow map/route endpoints are intentionally left unchanged.
import { zxyToPmtilesId } from './vector-tiles.mjs';

const PREFIX = '/api/v1/basemap';
const MANIFEST_KEY = 'basemap/active.json';
const HEADER_SIZE = 127;
const MAX_DIRECTORY = 2_000_000;
const CACHE = new Map();
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'Accept,If-None-Match', 'X-Content-Type-Options': 'nosniff' };
const json = (body, status = 200, headers = {}) =>
  Response.json(body, { status, headers: { ...cors, 'Cache-Control': 'no-store', ...headers } });

function validManifest(m) {
  return m && /^[a-f0-9]{64}$/.test(m.revision) && m.archive_key === `basemap/archives/${m.revision}.pmtiles`
    && Number.isSafeInteger(m.bytes) && m.bytes > HEADER_SIZE
    && Array.isArray(m.bounds) && m.bounds.length === 4 && m.bounds.every(Number.isFinite)
    && Number.isInteger(m.minzoom) && Number.isInteger(m.maxzoom)
    && m.minzoom >= 0 && m.maxzoom <= 22 && m.minzoom <= m.maxzoom
    && Array.isArray(m.vector_layers) && m.vector_layers.some(l => l.id === 'streets')
    && m.vector_layers.some(l => l.id === 'buildings')
    && (m.vector_layers.some(l => l.id === 'ocean') || m.vector_layers.some(l => l.id === 'water_polygons'));
}

async function active(env) {
  if (!env.BASEMAP_BUCKET) return null;
  const object = await env.BASEMAP_BUCKET.get(MANIFEST_KEY);
  if (!object) return null;
  const m = await new Response(object.body).json();
  return validManifest(m) ? m : null;
}

function layer(id, type, sourceLayer, paint, extra = {}) {
  return { id, type, source: 'basemap', 'source-layer': sourceLayer, paint, ...extra };
}

export function styleFor(origin, m, dark = false) {
  const p = dark ? {
    bg:'#20292d', ocean:'#102e3b', water:'#102e3b', park:'#274837', site:'#27373a',
    building:'#354144', road:'#66787f', minor:'#52666c', text:'#e5edef', halo:'#20292d'
  } : {
    bg:'#efeee7', ocean:'#b5dce8', water:'#b5dce8', park:'#c5ddbf', site:'#dce8d6',
    building:'#d4d8d5', road:'#ffffff', minor:'#fefefe', text:'#354548', halo:'#f6f5ee'
  };
  const main = ['motorway','trunk','primary','secondary','tertiary'];
  return {
    version:8, name:`Mazo Maps ${dark ? 'Dark' : 'Light'} · self-hosted Sri Lanka`,
    metadata:{ 'mazo:basemap-revision':m.revision, 'mazo:coverage':'Sri Lanka only; no worldwide street coverage' },
    glyphs:`${origin}/api/v1/fonts/{fontstack}/{range}.pbf`,
    sprite:`${origin}/api/v1/sprite`,
    sources:{
      basemap:{type:'vector',url:`${origin}${PREFIX}/tiles.json?revision=${m.revision}`, attribution:'© OpenStreetMap contributors (ODbL)'},
      mazo:{type:'vector',url:`${origin}/api/v1/tiles.json`, attribution:'© Mazo Maps place data contributors'}
    },
    layers:[
      {id:'mazo-background',type:'background',paint:{'background-color':p.bg}},
      layer('mazo-land','fill','land',{'fill-color':p.bg}),
      layer('mazo-ocean','fill','ocean',{'fill-color':p.ocean}),
      layer('mazo-inland-water','fill','water_polygons',{'fill-color':p.water}),
      layer('mazo-landcover','fill','landcover',{'fill-color':p.park,'fill-opacity':0.5}),
      layer('mazo-landuse','fill','landuse',{'fill-color':p.park,'fill-opacity':0.46}),
      layer('mazo-sites','fill','sites',{'fill-color':p.site,'fill-opacity':0.7}),
      layer('mazo-buildings','fill','buildings',{'fill-color':p.building,'fill-opacity':0.9}, {minzoom:13}),
      layer('mazo-water-lines','line','water_lines',{'line-color':p.water,'line-width':2}),
      layer('mazo-minor-roads','line','streets',{
        'line-color':p.minor,
        'line-width':['interpolate',['linear'],['zoom'],5,0.4,11,1.7,14,3.7,18,9]
      }),
      layer('mazo-major-roads','line','streets',{
        'line-color':p.road,
        'line-width':['interpolate',['linear'],['zoom'],5,0.8,11,3,14,6.2,18,15]
      },{filter:['in',['get','kind'],['literal',main]]}),
      layer('mazo-street-names','symbol','street_labels',{
        'text-color':p.text,'text-halo-color':p.halo,'text-halo-width':1.3
      },{minzoom:13,layout:{'symbol-placement':'line','text-field':['coalesce',['get','name_en'],['get','name'], ''],
        'text-size':12,'text-font':['Mazo Maps Sans Regular']}}),
      layer('mazo-place-labels','symbol','place_labels',{
        'text-color':p.text,'text-halo-color':p.halo,'text-halo-width':1.5
      },{layout:{'text-field':['coalesce',['get','name_en'],['get','name'], ''],
        'text-size':['interpolate',['linear'],['zoom'],5,11,13,16],
        'text-font':['Mazo Maps Sans Regular']}}),
      {id:'mazo-poi-dot',type:'circle',source:'mazo','source-layer':'places',minzoom:13,
        paint:{'circle-color':dark?'#62dac6':'#117d90','circle-radius':4,'circle-stroke-color':p.halo,'circle-stroke-width':1}},
      {id:'mazo-poi-label',type:'symbol',source:'mazo','source-layer':'places',minzoom:14,
        layout:{'text-field':['get','name'],'text-font':['Mazo Maps Sans Regular'],
          'text-size':12,'text-offset':[0,1.2],'text-anchor':'top'},
        paint:{'text-color':p.text,'text-halo-color':p.halo,'text-halo-width':1.2}}
    ]
  };
}

const u64 = (dv, i) => {
  const x = dv.getBigUint64(i, true);
  if (x > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('PMTiles offset too large');
  return Number(x);
};
const metadata = (bytes, size) => {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (new TextDecoder().decode(bytes.subarray(0,7)) !== 'PMTiles' || v.getUint8(7) !== 3) throw Error('Invalid PMTiles header');
  const s = {
    rootOffset:u64(v,8),rootLength:u64(v,16),leafOffset:u64(v,40),
    tileOffset:u64(v,56),tileLength:u64(v,64),tileCount:u64(v,80),
    internalCompression:v.getUint8(97),tileCompression:v.getUint8(98),tileType:v.getUint8(99),
    minzoom:v.getUint8(100),maxzoom:v.getUint8(101)
  };
  if (![1,2].includes(s.internalCompression) || ![1,2].includes(s.tileCompression) || s.tileType !== 1 ||
      s.rootOffset < HEADER_SIZE || s.rootOffset+s.rootLength > size || s.tileOffset+s.tileLength > size ||
      s.rootLength > MAX_DIRECTORY || s.minzoom > s.maxzoom) throw Error('Unsupported PMTiles archive');
  return s;
};
async function read(env, m, offset, length) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || length <= 0 ||
      offset < 0 || offset + length > m.bytes) throw Error('Out-of-range PMTiles read');
  const object = await env.BASEMAP_BUCKET.get(m.archive_key,{range:{offset,length}});
  if (!object || object.size !== m.bytes) throw Error('Missing or mismatched basemap archive');
  const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
  if (bytes.length !== length) throw Error('Short PMTiles range');
  return bytes;
}
async function unpack(bytes, compression) {
  if (compression === 1) return bytes;
  const data = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
  const bytesOut = new Uint8Array(await data.arrayBuffer());
  if (bytesOut.length > MAX_DIRECTORY) throw Error('PMTiles directory too large');
  return bytesOut;
}
function varint(bytes, position) {
  let v = 0, shift = 0, i = position;
  for (;;) {
    if (i >= bytes.length || shift > 49) throw Error('Bad PMTiles varint');
    const b = bytes[i++]; v += (b & 127) * (2 ** shift);
    if (!(b & 128)) return [v,i];
    shift += 7;
  }
}
function decodeDirectory(bytes) {
  let position = 0;
  const get = () => { const [n,next] = varint(bytes,position); position=next; return n; };
  const count = get();
  if (count > 200000) throw Error('Too many directory entries');
  const ids=[],runs=[],sizes=[],offs=[];
  let id=0;
  for(let i=0;i<count;i++){id+=get();ids.push(id)}
  for(let i=0;i<count;i++)runs.push(get());
  for(let i=0;i<count;i++)sizes.push(get());
  for(let i=0;i<count;i++){const v=get();offs.push(v===0&&i>0?offs[i-1]+sizes[i-1]:v-1)}
  return ids.map((v,i)=>({id:v,run:runs[i],length:sizes[i],offset:offs[i]}));
}
async function find(env,m,s,target) {
  let offset=s.rootOffset, length=s.rootLength;
  for(let depth=0;depth<5;depth++) {
    const key=`${m.revision}:${offset}:${length}`;
    let entries=CACHE.get(key);
    if (!entries) {
      entries=decodeDirectory(await unpack(await read(env,m,offset,length),s.internalCompression));
      CACHE.set(key,entries);
      while (CACHE.size>40) CACHE.delete(CACHE.keys().next().value);
    }
    let lo=0, hi=entries.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(entries[mid].id<=target)lo=mid+1;else hi=mid}
    const found=entries[lo-1]; if(!found) return null;
    if(found.run) return target<found.id+found.run ? found : null;
    offset=s.leafOffset+found.offset; length=found.length;
    if(length<=0||length>MAX_DIRECTORY)throw Error('Invalid leaf directory');
  }
  throw Error('Too many nested PMTiles directories');
}

export async function handleBasemapApi(request,env) {
  const url=new URL(request.url);
  const standard=url.pathname==='/api/v1/style.json'||url.pathname==='/api/v1/style/dark.json';
  if (!url.pathname.startsWith(PREFIX) && !standard) return null;
  if (!['GET','HEAD','OPTIONS'].includes(request.method))
    return json({error:'method_not_allowed'},405,{Allow:'GET,HEAD,OPTIONS'});
  if (request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try {
    const m=await active(env);
    if(!m) return standard?null:json({error:'basemap_not_published'},503);
    if(url.pathname===PREFIX+'/manifest')
      return json(m,200,{'Cache-Control':'public, max-age=60'});
    const assetRevision=url.searchParams.get('revision');
    if(assetRevision && assetRevision!==m.revision)
      return json({error:'stale_basemap_revision'},409);
    let data;
    if(standard || /^\/api\/v1\/basemap\/style\/(light|dark)\.json$/.test(url.pathname))
      data=styleFor(url.origin,m,url.pathname.includes('/dark.'));
    else if(url.pathname===PREFIX+'/tiles.json')
      data={tilejson:'3.0.0',name:'Mazo Maps Sri Lanka Shortbread',scheme:'xyz',
        tiles:[`${url.origin}${PREFIX}/tiles/{z}/{x}/{y}.pbf?revision=${m.revision}`],
        bounds:m.bounds,minzoom:m.minzoom,maxzoom:m.maxzoom,
        attribution:m.attribution,vector_layers:m.vector_layers};
    if(data) {
      const etag=`W/"${m.revision}-${url.pathname.endsWith('dark.json')?'dark':'light'}-${url.pathname.includes('tiles')?'tiles':'style'}"`;
      const headers={...cors,'Content-Type':'application/json; charset=utf-8',
        'Cache-Control':'public,max-age=120','ETag':etag};
      if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers});
      return new Response(request.method==='HEAD'?null:JSON.stringify(data),{status:200,headers});
    }
    const matches=/^\/api\/v1\/basemap\/tiles\/(\d+)\/(\d+)\/(\d+)\.pbf$/.exec(url.pathname);
    if(!matches)return json({error:'not_found'},404);
    const [z,x,y]=matches.slice(1).map(Number);
    if(!Number.isSafeInteger(z)||z<0||z>22||!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||
      x<0||y<0||x>=2**z||y>=2**z) return json({error:'invalid_tile_coordinate'},400);
    if(z<m.minzoom||z>m.maxzoom)return new Response(null,{status:204,headers:cors});
    if(env.VECTOR_TILE_RATE_LIMITER){
      const ip=request.headers.get('cf-connecting-ip')||'unknown-client';
      const allowed=await env.VECTOR_TILE_RATE_LIMITER.limit({key:ip});
      if(!allowed.success) return json({error:'rate_limited'},429,{'Retry-After':'60'});
    }
    const s=metadata(await read(env,m,0,HEADER_SIZE),m.bytes);
    if(s.minzoom!==m.minzoom||s.maxzoom!==m.maxzoom)throw Error('Basemap manifest/header mismatch');
    const entry=await find(env,m,s,zxyToPmtilesId(z,x,y));
    if(!entry)return new Response(null,{status:204,headers:cors});
    const offset=s.tileOffset+entry.offset;
    if(entry.length>4_000_000||entry.length<1||offset+entry.length>s.tileOffset+s.tileLength)
      throw Error('Invalid tile range');
    const tag=`"${m.revision}-${z}-${x}-${y}"`;
    const headers={...cors,'Content-Type':'application/vnd.mapbox-vector-tile',
      'Cache-Control':'public,max-age=31536000,immutable','ETag':tag};
    if(s.tileCompression===2)headers['Content-Encoding']='gzip';
    if(request.headers.get('If-None-Match')===tag)return new Response(null,{status:304,headers});
    return new Response(request.method==='HEAD'?null:await read(env,m,offset,entry.length),{status:200,headers});
  }catch(error){
    console.error(JSON.stringify({event:'self_hosted_basemap_error',message:String(error.message||error)}));
    return standard?null:json({error:'basemap_temporarily_unavailable'},503);
  }
}
