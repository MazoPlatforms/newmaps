// Reliable OpenFreeMap fallback; optional local PMTiles are enabled only after verification.
const $=s=>document.querySelector(s);
const styles={light:'https://tiles.openfreemap.org/styles/liberty',dark:'https://tiles.openfreemap.org/styles/dark'};
const theme=()=>document.documentElement.dataset.theme==='dark'?'dark':'light';
const map=new maplibregl.Map({container:'map',style:styles[theme()],center:[81.729,7.685],zoom:14,minZoom:12,maxBounds:[[81.685,7.635],[81.785,7.735]]});
map.addControl(new maplibregl.NavigationControl(),'bottom-right');
const datasets=['places.json','bakery.json','supermarket.json','halls.json','banks.json','mosque.json','textiles.json'];
let places=[],category='all',roadsVisible=true,placesVisible=true;
const KATTANKUDY=[81.70,7.65,81.77,7.72];
const inArea=p=>+p.coordinates.longitude>=KATTANKUDY[0]&&+p.coordinates.longitude<=KATTANKUDY[2]&&+p.coordinates.latitude>=KATTANKUDY[1]&&+p.coordinates.latitude<=KATTANKUDY[3];
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function kind(p){const c=(p.categories||[]).join(' ').toLowerCase();if(/bakery|restaurant|cafe|food|hotel & bakery/.test(c))return 'food';if(/hotel|lodg|hall|banquet/.test(c))return 'hotel';if(/mosque|worship|masjid/.test(c))return 'worship';if(/hospital|clinic|pharmacy|medical/.test(c))return 'health';if(/park|nature/.test(c))return 'park';return 'shop'}
const artwork={food:['#b87353','M7 3v7m3-7v7M5 7h7v3a3 3 0 0 1-3 3v8m9-18v18m0-18c-4 3-4 8 0 8'],health:['#b5666c','M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6Z'],shop:['#6d81aa','M5 8h14l1 12H4ZM9 8V6a3 3 0 0 1 6 0v2'],hotel:['#8c76a6','M3 19V6m0 9h18v4m-12-8h9a3 3 0 0 1 3 3v1M6 9h3v4H6Z'],park:['#628c6e','M12 3L5 12h4l-5 5h16l-5-5h4ZM12 17v4'],worship:['#967c9c','M4 20h16M6 20V9l6-5 6 5v11M10 20v-6h4v6m-2-16V1']};
const POI_SOURCE='mazo-pois';
const POI_LAYER='mazo-poi-symbols';
function priority(p){const k=kind(p);return ({health:1,worship:2,shop:3,food:4,hotel:5,park:6})[k]||7}
function iconFor(k){return 'mazo-'+k}
function registerIcons(){
 for(const [kind,[color]] of Object.entries(artwork)){
  const id=iconFor(kind);if(map.hasImage(id))continue;
  const canvas=document.createElement('canvas');canvas.width=48;canvas.height=48;
  const ctx=canvas.getContext('2d');ctx.beginPath();ctx.arc(24,24,21,0,Math.PI*2);
  ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=3;ctx.stroke();
  ctx.beginPath();ctx.arc(24,24,15,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
  ctx.font='bold 19px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';
  ctx.fillText(({food:'F',health:'+',shop:'S',hotel:'H',park:'P',worship:'W'})[kind],24,25);
  map.addImage(id,ctx.getImageData(0,0,48,48),{pixelRatio:2});
 }
}
function poiFeatures(){return places.map((p,i)=>({type:'Feature',id:i,geometry:{type:'Point',coordinates:[+p.coordinates.longitude,+p.coordinates.latitude]},properties:{name:p.name,kind:kind(p),priority:priority(p),index:i,category:(p.categories||[]).join(' '),address:p.address||''}}))}
function ensurePoiLayer(){
 if(!map.isStyleLoaded())return;
 const data={type:'FeatureCollection',features:poiFeatures()};
 if(!map.getSource(POI_SOURCE))map.addSource(POI_SOURCE,{type:'geojson',data});
 else map.getSource(POI_SOURCE).setData(data);
 if(!map.getLayer('mazo-poi-dots'))map.addLayer({
  id:'mazo-poi-dots',type:'circle',source:POI_SOURCE,minzoom:12,
  paint:{'circle-radius':['interpolate',['linear'],['zoom'],12,3,14,5,17,8],
   'circle-color':['match',['get','kind'],'food','#b87353','health','#b5666c','shop','#6d81aa','hotel','#8c76a6','park','#628c6e','worship','#967c9c','#6d81aa'],
   'circle-stroke-color':'#ffffff','circle-stroke-width':2,
   'circle-opacity':0.95}
 });
 if(!map.getLayer(POI_LAYER))map.addLayer({
  id:POI_LAYER,type:'symbol',source:POI_SOURCE,minzoom:14,
  layout:{'text-field':['get','name'],'text-font':['Noto Sans Regular'],
   'text-size':['interpolate',['linear'],['zoom'],14,10,17,13],
   'text-offset':[0,1.2],'text-anchor':'top','text-max-width':12,
   'text-optional':true,'text-allow-overlap':false,'text-padding':4},
  paint:{'text-color':theme()==='dark'?'#e5e7eb':'#334155',
   'text-halo-color':theme()==='dark'?'#17212e':'#ffffff','text-halo-width':1.5}
 });
 refresh();
}
map.on('click','mazo-poi-dots',e=>{const i=Number(e.features?.[0]?.properties?.index);if(Number.isInteger(i)&&places[i])openPlace(places[i])});
map.on('mouseenter','mazo-poi-dots',()=>map.getCanvas().style.cursor='pointer');
map.on('mouseleave','mazo-poi-dots',()=>map.getCanvas().style.cursor='');
function openPlace(p){const c=p.coordinates;map.flyTo({center:[+c.longitude,+c.latitude],zoom:Math.max(map.getZoom(),16)});new maplibregl.Popup({offset:20}).setLngLat([+c.longitude,+c.latitude]).setHTML('<strong>'+safe(p.name)+'</strong><p>'+safe(p.address||'')+'</p><p>'+safe((p.categories||[]).join(', '))+'</p>'+(p.phone?'<p>'+safe(p.phone)+'</p>':'')).addTo(map)}
function refresh(){
 const q=$('#map-search').value.trim().toLowerCase();
 const hits=places.filter(p=>(category==='all'||kind(p)===category)&&[p.name,p.address,...(p.categories||[])].join(' ').toLowerCase().includes(q));
 for(const id of [POI_LAYER,'mazo-poi-dots'])if(map.getLayer(id)){map.setLayoutProperty(id,'visibility',placesVisible?'visible':'none');map.setFilter(id,['in',['get','index'],['literal',hits.map(p=>places.indexOf(p))]])}
 const results=$('#search-results');results.replaceChildren();
 if(q){results.hidden=false;for(const p of hits.slice(0,30)){const b=document.createElement('button');b.type='button';b.textContent=p.name+' · '+(p.address||'');b.style.cssText='display:block;width:100%;padding:10px;text-align:left;border:0;background:transparent;cursor:pointer';b.onclick=()=>{openPlace(p);results.hidden=true};results.append(b)}}else results.hidden=true;
 $('#map-status').textContent=hits.length+' places in Kattankudy';

}
map.on('click',POI_LAYER,e=>{const i=Number(e.features?.[0]?.properties?.index);if(Number.isInteger(i)&&places[i])openPlace(places[i])});
map.on('mouseenter',POI_LAYER,()=>map.getCanvas().style.cursor='pointer');
map.on('mouseleave',POI_LAYER,()=>map.getCanvas().style.cursor='');
async function roads(){try{const r=await fetch('./data/roads/kattankudy.json');if(!r.ok)return;const data=await r.json();const features=(data.roads||[]).filter(x=>x.coordinates?.length>1).map(x=>({type:'Feature',properties:{name:x.name||''},geometry:{type:'LineString',coordinates:x.coordinates}}));if(map.getSource('mazo-roads'))return;map.addSource('mazo-roads',{type:'geojson',data:{type:'FeatureCollection',features}});map.addLayer({id:'mazo-road-lines',type:'line',source:'mazo-roads',paint:{'line-color':'#f8f9fa','line-width':['interpolate',['linear'],['zoom'],11,2,16,9]}});map.addLayer({id:'mazo-road-names',type:'symbol',source:'mazo-roads',minzoom:13,filter:['!=',['get','name'],''],layout:{'symbol-placement':'line','text-field':['get','name'],'text-size':12},paint:{'text-color':'#46515b','text-halo-color':'#fff','text-halo-width':2}});for(const id of ['mazo-road-lines','mazo-road-names'])map.setLayoutProperty(id,'visibility',roadsVisible?'visible':'none')}catch(e){console.warn(e)}}

// Preserve the vector basemap: roads, city labels and road names remain visible.
// Only provider POI icons/labels are suppressed, so our own JSON supplies businesses.
map.on('style.load',()=>{try{for(const layer of map.getStyle().layers||[]){if(layer.type==='symbol' && /poi|place|shop|restaurant|hospital|school|transit|airport|park/i.test(layer.id) && !/road|street|city|town|village|country|state|water|marine/i.test(layer.id))map.setLayoutProperty(layer.id,'visibility','none')}ensurePoiLayer()}catch(error){console.error('Map layer initialization:',error)}});
(async()=>{try{const data=await Promise.all(datasets.map(async f=>{const r=await fetch('./'+f);if(!r.ok)throw Error(f+' '+r.status);return r.json()}));const seen=new Set();for(const file of data)for(const p of file.results||[]){if(!p?.name||!Number.isFinite(+p.coordinates?.latitude)||!Number.isFinite(+p.coordinates?.longitude))continue;const k=p.name.trim().toLowerCase()+'|'+(+p.coordinates.latitude).toFixed(5)+'|'+(+p.coordinates.longitude).toFixed(5);if(!seen.has(k)&&inArea(p)){seen.add(k);places.push(p)}}if(map.isStyleLoaded())try{ensurePoiLayer()}catch(error){console.warn('Native POI initialization:',error)}refresh();}catch(e){$('#map-status').textContent='Dataset error: '+e.message}})();
$('#map-search').addEventListener('input',refresh);$('#search-form').onsubmit=e=>{e.preventDefault();refresh()};
document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));refresh()});
$('#layers-toggle').onclick=()=>{const p=$('#layers-panel');p.hidden=!p.hidden;$('#layers-toggle').setAttribute('aria-expanded',String(!p.hidden))};
document.querySelectorAll('[data-layer]').forEach(x=>x.onchange=()=>{if(x.dataset.layer==='places'){placesVisible=x.checked;refresh()}if(x.dataset.layer==='roads'){roadsVisible=x.checked;for(const id of ['mazo-road-lines','mazo-road-names'])if(map.getLayer(id))map.setLayoutProperty(id,'visibility',roadsVisible?'visible':'none')}});
$('#theme-toggle').onclick=()=>{const dark=document.documentElement.dataset.theme!=='dark';document.documentElement.dataset.theme=dark?'dark':'light';$('#theme-toggle').setAttribute('aria-pressed',String(dark));try{localStorage.setItem('mazo-maps-theme',dark?'dark':'light')}catch{};map.setStyle(styles[dark?'dark':'light']);};
$('#map-reset').onclick=()=>map.flyTo({center:[81.729,7.685],zoom:14});
$('#map-locate').onclick=()=>navigator.geolocation?.getCurrentPosition(p=>map.flyTo({center:[p.coords.longitude,p.coords.latitude],zoom:15}),()=>alert('Location unavailable'));
$('#map-fullscreen').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
async function cities(){try{const r=await fetch('./data/cities.json');if(!r.ok)return;const d=await r.json();const features=(d.cities||[]).filter(c=>Number.isFinite(+c.coordinates?.longitude)&&Number.isFinite(+c.coordinates?.latitude)).map(c=>({type:'Feature',geometry:{type:'Point',coordinates:[+c.coordinates.longitude,+c.coordinates.latitude]},properties:{name:c.name||'',level:c.level||'city'}}));if(map.getSource('mazo-cities'))return;map.addSource('mazo-cities',{type:'geojson',data:{type:'FeatureCollection',features}});map.addLayer({id:'mazo-city-labels',type:'symbol',source:'mazo-cities',layout:{'text-field':['get','name'],'text-size':['interpolate',['linear'],['zoom'],5,11,13,17],'text-allow-overlap':false},paint:{'text-color':theme()==='dark'?'#e8edf4':'#27313b','text-halo-color':theme()==='dark'?'#161b22':'#fff','text-halo-width':2}})}catch(e){console.warn('City labels:',e)}}

map.on('load',()=>{$('#map-frame').dataset.state='ready'});
map.on('error',event=>console.error('MapLibre:',event.error));
