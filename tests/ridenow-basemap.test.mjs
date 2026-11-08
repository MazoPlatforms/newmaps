import test from 'node:test';
import assert from 'node:assert/strict';
import { handleBasemapApi, styleFor } from '../src/ridenow-basemap.mjs';

const revision='a'.repeat(64);
const active={
  schema:'MazoBasemap/1',revision,archive_key:`basemap/archives/${revision}.pmtiles`,
  bytes:5000000,bounds:[79.3,5.8,82,9.9],minzoom:0,maxzoom:14,
  vector_layers:[{id:'ocean'},{id:'streets'},{id:'buildings'}],
  attribution:'© OpenStreetMap contributors (ODbL 1.0)',license:'ODbL-1.0'
};
const origin='https://maps.mazo.workers.dev';
const env={
  BASEMAP_BUCKET:{
    get:async key=>key==='basemap/active.json'?{body:new Response(JSON.stringify(active)).body}:null
  }
};
test('full styles use only Mazo Maps HTTPS resources',()=>{
  for (const theme of [false,true]) {
    const style=styleFor(origin,active,theme);
    assert.equal(style.version,8);
    assert.equal(style.sources.basemap.type,'vector');
    assert.equal(style.sources.mazo.type,'vector');
    const urls=[style.glyphs,style.sprite,...Object.values(style.sources).map(s=>s.url)];
    for (const url of urls) {
      assert.equal(new URL(url).origin,origin,url);
      assert.equal(new URL(url).protocol,'https:');
    }
    assert.ok(!style.layers.some(l => l.source === 'basemap' && ['landcover','landuse'].includes(l['source-layer'])),
      'Do not reference optional layers omitted from Shortbread manifest');
    for (const layer of ['streets','buildings','ocean']) {
      assert.ok(style.layers.some(l=>l['source-layer']===layer),layer);
    }
  }
});
test('publishes a same-origin TileJSON and a data manifest',async()=>{
  const manifest=await handleBasemapApi(new Request(origin+'/api/v1/basemap/manifest'),env);
  assert.equal(manifest.status,200);
  assert.equal((await manifest.json()).revision,revision);
  const tiles=await handleBasemapApi(new Request(origin+'/api/v1/basemap/tiles.json'),env);
  assert.equal(tiles.status,200);
  const data=await tiles.json();
  assert.equal(new URL(data.tiles[0].replace('{z}','10').replace('{x}','744').replace('{y}','489')).origin,origin);
  assert.equal(data.scheme,'xyz');
});
test('rewrites legacy native style only after basemap publication',async()=>{
  const live=await handleBasemapApi(new Request(origin+'/api/v1/style.json'),env);
  assert.equal(live.status,200);
  assert.ok((await live.json()).layers.some(l=>l['source-layer']==='streets'));
  const fallback=await handleBasemapApi(new Request(origin+'/api/v1/style.json'),{BASEMAP_BUCKET:{get:async()=>null}});
  assert.equal(fallback,null);
  const unready=await handleBasemapApi(new Request(origin+'/api/v1/basemap/style/light.json'),{BASEMAP_BUCKET:{get:async()=>null}});
  assert.equal(unready.status,503);
});
test('rejects unknown revision and cross-origin URLs',async()=>{
  const bad=await handleBasemapApi(new Request(origin+'/api/v1/basemap/tiles.json?revision=old'),env);
  assert.equal(bad.status,409);
  const outside=await handleBasemapApi(new Request('https://different.example/api/v1/basemap/style/light.json'),env);
  assert.equal((await outside.json()).sources.basemap.url.startsWith('https://different.example/'),true);
  // Runtime fetches no external source; host in style is always its caller origin.
});
test('cannot treat incompatible manifest as valid archive',async()=>{
  const corrupt={...active,archive_key:'https://external/tiles.pmtiles'};
  const result=await handleBasemapApi(new Request(origin+'/api/v1/basemap/manifest'),{BASEMAP_BUCKET:{
    get:async()=>({body:new Response(JSON.stringify(corrupt)).body})
  }});
  assert.equal(result.status,503);
});
