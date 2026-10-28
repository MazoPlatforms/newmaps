import { availableCategories, createPlaceSearchIndex } from './search-engine.mjs';
import { createPlaceLookup, decodePlaceDetails, decodeSearchIndex } from './place-delivery.mjs';
import { CAMERA_OPTIONS, POI_ZOOM_THRESHOLDS, cameraDuration as reducedMotionDuration, configureNorthUpInteractions, placeFeature, placePriority, poiLayerFilter } from './map-presentation.mjs?v=phase9-cartography-1';
import { applyMazoCartographicStyle, isBasemapPlacePoiLayer, MAZO_PALETTE } from './cartographic-style.mjs?v=phase9-basemap-audit-1';
import { closestRouteProgress, findLocalRoutes, validateRoutingGraph } from './routing-graph.mjs';
import { downloadOfflinePack, removeOfflinePack, offlinePackResources } from './offline-pack.mjs';

// Reliable OpenFreeMap fallback; optional local PMTiles are enabled only after verification.
const $=s=>document.querySelector(s);
const styles={light:'https://tiles.openfreemap.org/styles/liberty',dark:'https://tiles.openfreemap.org/styles/liberty'};
const theme=()=>document.documentElement.dataset.theme==='dark'?'dark':'light';
const cameraDuration=milliseconds=>reducedMotionDuration(milliseconds,window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true);
const map=new maplibregl.Map({container:'map',style:styles[theme()],...CAMERA_OPTIONS});
// A bounded test-only camera/inspection facade for reproducible browser scenarios.
if(new URLSearchParams(location.search).has('map-test'))window.__MAZO_MAP_TEST__=Object.freeze({
 isStyleLoaded:()=>map.isStyleLoaded(),areTilesLoaded:()=>map.areTilesLoaded(),jumpTo:options=>map.jumpTo(options),
 jumpToWhenIdle:options=>new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);resolve(true)};map.once('idle',done);map.jumpTo(options);timer=setTimeout(()=>{map.off('idle',done);resolve(false)},15000)}),easeTo:options=>map.easeTo(options),
 getCenter:()=>map.getCenter(),getZoom:()=>map.getZoom(),getBearing:()=>map.getBearing(),getPitch:()=>map.getPitch(),
 project:coordinates=>map.project(coordinates),
 isMoving:()=>map.isMoving(),
 getMinZoom:()=>map.getMinZoom(),getMaxZoom:()=>map.getMaxZoom(),getStyle:()=>map.getStyle(),
 isDragRotateEnabled:()=>map.dragRotate.isEnabled(),isTouchZoomRotateEnabled:()=>map.touchZoomRotate.isEnabled(),
 getSource:id=>{const source=map.getSource(id);return source?{type:source.type}:null;},
 getLayer:id=>{const layer=map.getLayer(id);return layer?{id:layer.id,type:layer.type}:null;},
 getPaintProperty:(id,property)=>map.getPaintProperty(id,property),
 getGeoJSONFeatureCount:id=>{const source=map.getSource(id);return Array.isArray(source?._data?.features)?source._data.features.length:null;},
 getSourceData:id=>{const source=map.getSource(id);return source?._data??null;},
 queryRenderedFeatures:(...args)=>map.queryRenderedFeatures(...args),
});
// Preserve pinch zoom and keyboard panning while removing all rotation/pitch controls.
configureNorthUpInteractions(map);
// Minimal map chrome: touch gestures remain available without zoom buttons.
let places=[],category='all',roadsVisible=true,placesVisible=true,roadGeoJSONPromise=null,placeAliases={},placeSearchIndex=null,nearbyOrigin=null,nearbyMode=false,pmtilesProtocol=null,offlineBaseStyle=false;
let placeById=new Map(),deliveryManifest=null,placeDetailPromise=null,searchIndexPromise=null,placeDetailsLoaded=false;
let presentedCategory=null,presentedSelectedId=null,presentedVisibility=null;
// Presentation-only Sri Lankan postal address cleanup. This never invents a house number.
function displaySriLankanAddress(value){
 if(typeof value!=='string'||!value.trim())return '';
 let s=value.trim().replace(/\s+/g,' ');
 // Plus Codes are location references, not mailing addresses. Retain codes where
 // there is no identified street; otherwise prefer the actual street description.
 s=s.replace(/^[A-Z0-9]{4}\+[A-Z0-9]{2,3},\s*(?=[^,]*\b(?:Road|Rd|Lane|Ln|Street|St|Avenue|Ave|Mawatha|Highway|Hwy)\b)/i,'');
 s=s.replace(/\b(?:Methaipalli|Methapalli|Methai Palli|Meththai Palli)\s+(?:Road|Rd|Lane|Ln)\b/gi,'Meththaippalli Road');
 s=s.replace(/\bRd\.?(?=,|$|\s)/gi,'Road').replace(/\bLn\.?(?=,|$|\s)/gi,'Lane')
    .replace(/\bSt\.(?=,|$)/gi,'Street').replace(/\bSt(?=,|$)/gi,'Street')
    .replace(/\bHwy\.?(?=,|$|\s)/gi,'Highway');
 s=s.replace(/^no[.\s:-]*(\d[^,\s]*)[,\s]+/i,'No. $1, ');
 s=s.replace(/\bKattankudy\s*[-–]\s*(0?[1-6])\b/gi,(_,n)=>'Kattankudy '+n.padStart(2,'0'));
 if(/(?:,\s*|^)Kattankudy\s+0[1-6]$/i.test(s))s+=', Kattankudy 30100';
 else if(/(?:,\s*|^)Kattankudy$/i.test(s))s+=' 30100';
 return s.replace(/\s+,/g,',').replace(/,\s*,/g,',').trim();
}
// Normalize presentation across ALL datasets, including duplicates from category files.
const canonicalNames=new Map([
 ['methai mosque school','BT/BC/Meththaippalli Vidyalaya'],
 ['bt/bc/meththaippalli vidyalaya','BT/BC/Meththaippalli Vidyalaya'],
 ['aayisha catering','Aayisha Catering'],
 ['smr transport','SMR Transport'],
 ['baqalathul kanz','Baqalathul Kanz'],
 ['aaysha fresh chicken','Aaysha Fresh Chicken']
]);
const knownAcronyms=new Set(['SMR','BT','BC','ATM','ATMs','LED','CCTV','IT','ICT','PC','USB','GPS','NGO','TV','AC','DC','MCC','RDA','SLT','HNB','BOC','NSB','NDB','DFCC','CEB','LPG','KFC','BTS']);
function canonicalPlaceName(raw){
 const value=String(raw??'').trim().replace(/\s+/g,' ');
 if(/[\u0B80-\u0BFF\u0D80-\u0DFF]/.test(value))return value;
 const known=canonicalNames.get(value.toLocaleLowerCase('en'));
 if(known)return known;
 // Preserve existing intentional mixed-case brand styling. Only normalize
 // names written entirely in upper/lower case, without guessing new spelling.
 const letters=value.replace(/[^A-Za-z]/g,'');
 if(!letters||!(letters===letters.toUpperCase()||letters===letters.toLowerCase()))return value;
 return value.replace(/[A-Za-z]+(?:'[A-Za-z]+)*/g,word=>{
  const upper=word.toUpperCase();
  if(knownAcronyms.has(upper))return upper;
  if(/^\d/.test(word))return word;
  return word[0].toUpperCase()+word.slice(1).toLowerCase();
 });
}
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const artwork={food:['#b75e37','M7 3v7m3-7v7M5 7h7v3a3 3 0 0 1-3 3v8m9-18v18m0-18c-4 3-4 8 0 8'],health:['#b64452','M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6Z'],shop:['#4268a9','M5 8h14l1 12H4ZM9 8V6a3 3 0 0 1 6 0v2'],hotel:['#72539f','M3 19V6m0 9h18v4m-12-8h9a3 3 0 0 1 3 3v1M6 9h3v4H6Z'],park:['#40774f','M12 3L5 12h4l-5 5h16l-5-5h4ZM12 17v4'],atm:['#137b70',''],bank:['#4e627e',''],fuel:['#a65f20',''],auto:['#45637b',''],electronics:['#4f5fc0',''],government:['#456a7f',''],hardware:['#785538',''],landmark:['#755881',''],salon:['#a7537d',''],sports:['#147a77',''],transport:['#3e64a0',''],market:['#397347',''],services:['#5e6978',''],gym:['#147579',''],jewelry:['#876215',''],school:['#205b9b',''],stationery:['#526d72',''],cafe:['#ad5931',''],worship:['#74587c','']};
const POI_SOURCE='mazo-pois';
const SELECTED_POI_SOURCE='mazo-selected-place';
const POI_LAYERS=['mazo-poi-major','mazo-poi-district','mazo-poi-local','mazo-poi-selected'];
function priority(p){return placePriority(p)}
function iconFor(k){return 'mazo-'+k}
function registerIcons(){
 const paths={
 atm:'M20 19h16v25H20zM24 26h8M24 32h8M24 38h5',bank:'M14 25l14-8 14 8M17 28h22M20 28v13m8-13v13m8-13v13M15 43h26',fuel:'M18 19h15v25H18zM21 23h9v9h-9M33 26h5v14q0 4-5 4',auto:'M19 31l4-9h13l4 9M17 31h25v10H17zM22 41v4m15-4v4',electronics:'M18 19h20v18H18zM23 42h10M28 37v5',government:'M14 25l14-8 14 8M17 28h22M20 28v13m8-13v13m8-13v13M15 43h26',hardware:'M19 21l5 5-7 7 5 5 7-7 5 5 8-8-5-5-8 8-5-5z',landmark:'M17 43V25l11-8 11 8v18M15 43h26M24 43V31h8v12',salon:'M20 19l16 24M36 19L20 43M18 20a3 3 0 1 0 6 0M32 20a3 3 0 1 0 6 0',sports:'M28 17a11 11 0 1 0 0 22a11 11 0 1 0 0-22M19 24l18 9M28 17v22',transport:'M18 20h20v22H18zM18 35h20M22 42v4m12-4v4M23 26h10',market:'M17 25h22l-3 18H20zM21 25l7-8 7 8',services:'M20 19l7 7-7 7 5 5 7-7 6 6M20 19l-4 4 4 4',
 food:'M23 21v18m-6-18v10m6-10v10m-6 0h6m13-10v18m0-18c-7 5-7 11 0 11',
 cafe:'M16 24h19v9a9 9 0 0 1-18 0v-9m18 2h4a4 4 0 0 1-4 8M16 40h20',
 health:'M24 20h8v8h8v8h-8v8h-8v-8h-8v-8h8z',
 shop:'M17 25h22l-2 17H19zm5 0v-4a6 6 0 0 1 12 0v4',
 hotel:'M16 40V24m0 11h24v5m-18-10h14a4 4 0 0 1 4 4v1',
 park:'M28 18l-12 18h7l-4 5h18l-4-5h7zM28 41v5',
 worship:'M15 42h26M19 42V27l9-8 9 8v15M25 42v-9h6v9',
 gym:'M16 27v12m4-16v20m16-20v20m4-16v12M20 33h16',
 jewelry:'M16 27l7-8h10l7 8-12 17zM16 27h24M23 19l5 8 5-8M28 27v17',
 school:'M14 26l14-7 14 7-14 7zM20 30v9q8 6 16 0v-9M42 27v12',
 stationery:'M18 38l2-8 17-17 7 7-17 17zM20 30l7 7M17 43h25'
 };
 for(const [kind,[color]] of Object.entries(artwork)){
  const id=iconFor(kind);if(map.hasImage(id))continue;
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
  const ctx=canvas.getContext('2d');
  ctx.beginPath();ctx.arc(32,32,26,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
  ctx.lineWidth=4;ctx.strokeStyle='#fff';ctx.stroke();
  ctx.beginPath();ctx.arc(32,32,29,0,Math.PI*2);ctx.lineWidth=1.5;ctx.strokeStyle=theme()==='dark'?'#101c23':'#34434a';ctx.stroke();
  ctx.save();ctx.translate(32,32);ctx.scale(0.72,0.72);ctx.translate(-28,-31);
  ctx.strokeStyle='#fff';ctx.lineWidth=3.4;ctx.lineJoin='round';ctx.lineCap='round';
  ctx.stroke(new Path2D(paths[kind]||paths.shop));ctx.restore();
  map.addImage(id,ctx.getImageData(0,0,64,64),{pixelRatio:2});
 }
}
function selectedPoiFeatures(){return {type:'FeatureCollection',features:selectedPlace?.coordinates&&Number.isFinite(+selectedPlace.coordinates.longitude)&&Number.isFinite(+selectedPlace.coordinates.latitude)?[placeFeature(selectedPlace)]:[]}}
function poiLayout(){return {
 'icon-image':['concat','mazo-',['get','kind']],
 'icon-anchor':'center',
 'icon-size':['interpolate',['linear'],['zoom'],6,0.48,9,0.56,12,0.64,15,0.74,18,0.82,20,0.9],
 'icon-allow-overlap':false,'icon-padding':['interpolate',['linear'],['zoom'],6,16,9,18,12,19,15,26,18,22,20,18],
 'text-field':['get','name'],'text-font':['Noto Sans Regular'],
 'text-size':['interpolate',['linear'],['zoom'],6,9,9,10,12,11,16,12,20,13],
 'text-offset':[0,0.8],'text-anchor':'top','text-max-width':11,
 'text-optional':true,'text-allow-overlap':false,'text-padding':['interpolate',['linear'],['zoom'],6,9,12,8,16,6],
 'symbol-z-order':'auto',
 // MapLibre places lower sort keys first when resolving symbol collisions.
 'symbol-sort-key':['get','priority'],
}}
function addPoiSymbolLayer(id,tier,minzoom){
 map.addLayer({id,type:'symbol',source:POI_SOURCE,'source-layer':'places',minzoom,filter:poiLayerFilter(tier,category),layout:poiLayout(),paint:{
  'icon-opacity':1,'text-opacity':1,
  'text-color':MAZO_PALETTE[theme()].label,
  'text-halo-color':MAZO_PALETTE[theme()].halo,'text-halo-width':1.6,
 }});
}
function visiblePoiFilter(tier){
 const filter=poiLayerFilter(tier,category);
 return selectedPlace?.id?['all',filter,['!=',['get','id'],selectedPlace.id]]:filter;
}
function ensurePoiLayer(){
 if(!map.getStyle()?.layers)return;
 if(!window.mazoPmtilesUrl)return;
 if(!map.getSource(POI_SOURCE)){
  map.addSource(POI_SOURCE,{type:'vector',url:window.mazoPmtilesUrl,promoteId:{places:'id'}});
 }
 if(!map.getSource(SELECTED_POI_SOURCE))map.addSource(SELECTED_POI_SOURCE,{type:'geojson',data:selectedPoiFeatures(),promoteId:'id'});
 registerIcons();
 if(!map.getLayer('mazo-poi-major'))addPoiSymbolLayer('mazo-poi-major','major',POI_ZOOM_THRESHOLDS.major);
 if(!map.getLayer('mazo-poi-district'))addPoiSymbolLayer('mazo-poi-district','district',POI_ZOOM_THRESHOLDS.district);
 if(!map.getLayer('mazo-poi-local'))addPoiSymbolLayer('mazo-poi-local','local',POI_ZOOM_THRESHOLDS.local);
 if(!map.getLayer('mazo-poi-selected'))map.addLayer({
  id:'mazo-poi-selected',type:'symbol',source:SELECTED_POI_SOURCE,minzoom:0,
  layout:{...poiLayout(),'icon-allow-overlap':true,'text-allow-overlap':true,'icon-size':1.25,'text-size':14,'symbol-sort-key':1000},
  paint:{'icon-opacity':1,'text-opacity':1,'text-color':MAZO_PALETTE[theme()].label,'text-halo-color':MAZO_PALETTE[theme()].halo,'text-halo-width':2.2},
 });
 updatePoiPresentation();
 refresh();
}
function updatePoiPresentation(){
 const selectedId=selectedPlace?.id||null;
 const categoryChanged=presentedCategory!==category;
 if(categoryChanged||presentedSelectedId!==selectedId){
  for(const [id,tier] of [['mazo-poi-major','major'],['mazo-poi-district','district'],['mazo-poi-local','local']]){
   if(map.getLayer(id))map.setFilter(id,visiblePoiFilter(tier));
  }
  if(categoryChanged&&map.getLayer('mazo-poi-local'))map.setLayerZoomRange('mazo-poi-local',category==='all'?POI_ZOOM_THRESHOLDS.local:POI_ZOOM_THRESHOLDS.category,Math.min(24,map.getMaxZoom()+1));
  presentedCategory=category;
  if(presentedSelectedId!==selectedId&&map.getSource(SELECTED_POI_SOURCE)?.setData)map.getSource(SELECTED_POI_SOURCE).setData(selectedPoiFeatures());
  presentedSelectedId=selectedId;
 }
 if(presentedVisibility!==placesVisible){
  for(const id of POI_LAYERS)if(map.getLayer(id))map.setLayoutProperty(id,'visibility',placesVisible?'visible':'none');
  presentedVisibility=placesVisible;
 }
}
function selectVectorPlace(id){
 const choose=()=>{const place=placeById.get(String(id));if(place&&selectedPlace?.id!==place.id)openPlace(place)};
 if(placeById.has(String(id)))choose();else ensureSearchIndex().then(choose).catch(console.error);
}
map.on('click',POI_LAYERS.slice(0,3),e=>{if(!routePanel.hidden)return;const properties=e.features?.[0]?.properties||{};const place=placeById.get(String(properties.id));if(place&&selectedPlace?.id!==place.id)openPlace(place);else if(!place)selectVectorPlace(properties.id)});
map.on('mouseenter',POI_LAYERS.slice(0,3),()=>map.getCanvas().style.cursor='pointer');
map.on('mouseleave',POI_LAYERS.slice(0,3),()=>map.getCanvas().style.cursor='');
let selectedPlace=null,sheetState='half',dragStart=null,dragDelta=0,closeTimer=null;
const sheet=$('#place-sheet');
function setSheetState(state){
 sheetState=state;sheet.dataset.state=state;document.querySelector('.map-actions').dataset.sheet=state;
 sheet.style.removeProperty('--sheet-drag');
}
function pushPlaceHistory(place){
 const url=location.pathname+location.search+'#place='+encodeURIComponent(place.id);
 history.pushState({...history.state,mazoPlaceId:place.id},'',url);
}
function clearPlaceHistory(id){
 if(history.state?.mazoPlaceId!==id)return;
 history.replaceState({...history.state,mazoPlaceId:null},'',location.pathname+location.search);
}
function closePlace({preserveHistory=false}={}){
 if(!preserveHistory&&selectedPlace)clearPlaceHistory(selectedPlace.id);
 selectedPlace=null;updatePoiPresentation();document.querySelector('.map-actions').removeAttribute('data-sheet');sheet.classList.add('is-closing');clearTimeout(closeTimer);closeTimer=setTimeout(()=>{sheet.hidden=true;sheet.classList.remove('is-closing')},260);map.easeTo({padding:{bottom:0},bearing:0,pitch:0,duration:cameraDuration(260)});
}
function openPlace(p,{preserveHistory=false}={}){
 if(typeof routePanel!=='undefined'&&!routePanel.hidden)return;
 if(!preserveHistory&&selectedPlace?.id!==p.id)pushPlaceHistory(p);
 selectedPlace=p;clearTimeout(closeTimer);sheet.classList.remove('is-closing');sheet.hidden=false;setSheetState('half');
 updatePoiPresentation();
 renderPlaceDetails(p);
 if(!placeDetailsLoaded)loadPlaceDetails().then(details=>{for(const [id,full] of details){const place=placeById.get(id);if(place)Object.assign(place,full)}placeDetailsLoaded=true;if(selectedPlace?.id===p.id)renderPlaceDetails(p)}).catch(error=>console.warn('Optional place details unavailable:',error));
 const c=p.coordinates;if(c&&Number.isFinite(+c.latitude)&&Number.isFinite(+c.longitude))map.easeTo({center:[+c.longitude,+c.latitude],zoom:Math.max(map.getZoom(),16),bearing:0,pitch:0,padding:{bottom:Math.round(window.innerHeight*.25)},duration:cameraDuration(400)});
}
window.addEventListener('popstate',event=>{
 const id=event.state?.mazoPlaceId;
 if(!id){closePlace({preserveHistory:true});return}
 void ensureSearchIndex().then(()=>{const place=placeById.get(String(id));if(place)openPlace(place,{preserveHistory:true});else closePlace({preserveHistory:true})}).catch(error=>{console.warn('Place history lookup:',error);closePlace({preserveHistory:true})});
});
function renderPlaceDetails(p){
 $('#place-title').textContent=p.name;
 $('#place-category').textContent=(p.categories||[]).join(' · ')||'Place';
 $('#place-address').textContent=p.address||'Address unavailable';
 $('#place-coordinates').textContent=p.coordinates&&Number.isFinite(+p.coordinates.latitude)&&Number.isFinite(+p.coordinates.longitude)?Number(p.coordinates.latitude).toFixed(6)+', '+Number(p.coordinates.longitude).toFixed(6):'Location unavailable';
 const phone=$('#place-phone');phone.hidden=!p.phone;phone.href=p.phone?'tel:'+String(p.phone).replace(/[^+0-9]/g,''):'#';
 const website=$('#place-website');const url=String(p.website||'');website.hidden=!/^https?:\/\//i.test(url);if(!website.hidden)website.href=url;

 const hours=$('#place-hours');hours.replaceChildren();
 if(Array.isArray(p.hours)&&p.hours.length){
  const today=new Date().toLocaleDateString('en-US',{weekday:'long'});
  for(const h of p.hours){
   const row=document.createElement('div');row.className='hours-row';
   const day=document.createElement('span');day.className='hours-day';day.textContent=h.day||'Day';
   const time=document.createElement('span');time.className='hours-time';
   const values=Array.isArray(h.times)?h.times:[];
   time.textContent=values.length?values.join(' · '):'Closed';
   if(String(h.day).toLowerCase()===today.toLowerCase()){row.classList.add('is-today');const dot=document.createElement('span');dot.className='hours-today-dot';dot.setAttribute('aria-hidden','true');day.prepend(dot)}
   row.append(day,time);hours.append(row);
  }
 }else{const empty=document.createElement('p');empty.className='hours-empty';empty.textContent='Opening hours unavailable';hours.append(empty)}
}
$('#place-close').onclick=closePlace;

/* In-map directions: pickup defaults to device location; map-click override.
   Public OSRM endpoints are best-effort and need a managed backend for production SLA. */
const routePanel=$('#route-panel');
let routeSheetState='compact';
function setRouteSheetState(state){
 if(routePanel.hidden)return;
 routeSheetState=state;
 routePanel.dataset.state=state;
 const expanded=state==='half';
 $('#route-details').hidden=!expanded;
 $('#route-steps').hidden=!expanded;
 requestAnimationFrame(routeLayout);
}
routePanel.addEventListener('pointerdown',e=>{
 if(e.target.closest('#route-close'))return;
 setRouteSheetState('half');
});
routePanel.addEventListener('focusin',()=>setRouteSheetState('half'));
map.getCanvas().addEventListener('pointerdown',()=>{if(!routePanel.hidden)setRouteSheetState('compact')});
map.getCanvas().addEventListener('wheel',()=>{if(!routePanel.hidden)setRouteSheetState('compact')},{passive:true});
map.on('movestart',()=>{if(!routePanel.hidden)setRouteSheetState('compact')});

function routeLayout(){
 // Force mobile bottom docking even when older CSS is cached or theme rules conflict.
 routePanel.style.setProperty('position','fixed','important');
 routePanel.style.setProperty('top','auto','important');
 routePanel.style.setProperty('bottom','0px','important');
 routePanel.style.setProperty('left','0px','important');
 routePanel.style.setProperty('right','0px','important');
 routePanel.style.setProperty('width','100%','important');
 routePanel.style.setProperty('max-height',routeSheetState==='half'?'55dvh':'none','important');
 routePanel.style.setProperty('border-radius','18px 18px 0 0','important');
 const turn=$('#route-turn-card');
 turn.style.setProperty('position','fixed','important');
 turn.style.setProperty('top','auto','important');
 turn.style.setProperty('bottom',(routePanel.getBoundingClientRect().height+12)+'px','important');
 turn.style.setProperty('z-index','12','important');
}
window.addEventListener('resize',()=>{if(!routePanel.hidden)routeLayout()});
let routeSteps=[],routeWatch=null,routeCurrent=null,routeProgressGeometry=[],routingGraphPromise=null,routeOffRouteCount=0,lastRouteRecalculation=0;
let routeDestination=null,routePickup=null,routeMode='driving',routeAbort=null,routeLine=null,routePickupMarker=null,routeDestinationMarker=null,pickingPickup=false,routeSequence=0,routeSource='online',routeCandidates=[];
const routeStatus=message=>{$('#route-status').textContent=message};
const routeCoord=c=>c.map(x=>Number(x).toFixed(6)).join(',');
function routeClear(){
 if(routeWatch!==null){navigator.geolocation.clearWatch(routeWatch);routeWatch=null}
 routeSteps=[];routeCurrent=null;routeProgressGeometry=[];routeOffRouteCount=0;routeCandidates=[];$('#route-turn-card').hidden=true;$('#route-alternatives').replaceChildren();$('#route-alternatives').hidden=true;
 if(routeAbort)routeAbort.abort();routeAbort=null;routeSequence++;
 for(const id of ['mazo-route-line'])if(map.getLayer(id))map.removeLayer(id);
 if(map.getSource('mazo-route'))map.removeSource('mazo-route');
 routePickupMarker?.remove();routeDestinationMarker?.remove();
 routePickupMarker=routeDestinationMarker=null;routeLine=null;
}
function routeDraw(){
 if(!map.getStyle()?.layers)return;
 const data=routeLine||{type:'FeatureCollection',features:[]};
 if(!map.getSource('mazo-route'))map.addSource('mazo-route',{type:'geojson',data});
 else map.getSource('mazo-route').setData(data);
 if(!map.getLayer('mazo-route-line'))map.addLayer({id:'mazo-route-line',type:'line',source:'mazo-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#2563eb','line-width':6,'line-opacity':0.9}});
}
map.on('style.load',()=>{if(!routePanel.hidden)routeDraw()});
function routeMarkers(){
 routePickupMarker?.remove();routeDestinationMarker?.remove();
 if(routePickup)routePickupMarker=new maplibregl.Marker({color:'#16a34a'}).setLngLat(routePickup).addTo(map);
 if(routeDestination)routeDestinationMarker=new maplibregl.Marker({color:'#dc2626'}).setLngLat(routeDestination).addTo(map);
}
function routeRender(geometry,start,end){
 routeLine={type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry}]};routeProgressGeometry=geometry.coordinates;routeDraw();
 routePickupMarker?.remove();routeDestinationMarker?.remove();
 routePickupMarker=new maplibregl.Marker({color:'#16a34a'}).setLngLat(start).addTo(map);
 routeDestinationMarker=new maplibregl.Marker({color:'#dc2626'}).setLngLat(end).addTo(map);
}
function routeFit(coordinates){const bounds=new maplibregl.LngLatBounds();for(const c of coordinates)bounds.extend(c);map.fitBounds(bounds,{padding:{top:95,bottom:230,left:35,right:35},maxZoom:17,bearing:0,pitch:0,duration:cameraDuration(550)})}
async function findLocalRoute(start,end,mode){
 if(!routingGraphPromise)routingGraphPromise=checkedJson('./generated/kattankudy-routing-manifest.json').then(manifest=>checkedJson('./generated/'+manifest.graph_file,manifest.graph_sha256)).then(validateRoutingGraph);
 const graph=await routingGraphPromise;const result=findLocalRoutes(graph,start,end,mode,{alternatives:2});
 if(result.routes?.length)return result;
 if(result.error==='snap_too_far')return null;
 return null;
}
function routeRenderInstructions(rows){
 const list=$('#route-steps');list.replaceChildren();routeSteps=rows.map((row,index)=>({...row,progressMeters:Number.isFinite(row.progressMeters)?row.progressMeters:null,index}));
 let progress=0;for(const row of routeSteps){if(row.progressMeters===null){progress+=Number(row.distance)||0;row.progressMeters=progress}}
 for(const step of routeSteps){const li=document.createElement('li');const action=(step.modifier?step.modifier+' ':'')+(step.type||'Continue').replace(/_/g,' ');li.textContent=action+' '+(step.name?'onto '+step.name:'')+(step.distance?` · ${Math.round(step.distance)} m`:'');list.append(li)}
}
function routeLocation(){
 return new Promise((resolve,reject)=>{
  if(!navigator.geolocation){reject(Error('Location is unavailable in this browser. Choose pickup on the map.'));return}
  navigator.geolocation.getCurrentPosition(p=>resolve([p.coords.longitude,p.coords.latitude]),e=>reject(Error(e.code===1?'Location permission denied. Choose pickup on the map.':'Could not determine your location. Choose pickup on the map.')),{enableHighAccuracy:true,timeout:12000,maximumAge:10000});
 });
}
async function routeCalculate(){
 if(!routePickup||!routeDestination)return;
 if(routeAbort)routeAbort.abort();const controller=new AbortController();routeAbort=controller;const sequence=++routeSequence;
 routeStatus('Calculating '+routeMode+' route…');$('#route-summary').textContent='';$('#route-steps').replaceChildren();
 const profile=routeMode==='walking'?'foot':routeMode==='cycling'?'bike':'driving';
 try{
  const local=await findLocalRoute(routePickup,routeDestination,routeMode);
  if(sequence!==routeSequence)return;
  if(local){
   routeCandidates=local.routes.map(route=>({...route,source:'local',startCoordinate:route.geometry.coordinates[0],endCoordinate:route.geometry.coordinates.at(-1)}));
   routeShowCandidate(0);routeCurrent=routePickup;routeUpdateTurn();routeStartWatch();return;
  }
 }catch(error){console.warn('Local routing unavailable:',error)}
 // Distinct public OSRM profiles; walking/cycling do not silently fall back to driving.
 const base=profile==='driving'?'https://router.project-osrm.org/route/v1/driving/':profile==='foot'?'https://routing.openstreetmap.de/routed-foot/route/v1/driving/':'https://routing.openstreetmap.de/routed-bike/route/v1/driving/';
  const url=base+routeCoord(routePickup)+';'+routeCoord(routeDestination)+'?overview=full&geometries=geojson&steps=true&alternatives=2';
 try{
  const res=await fetch(url,{signal:controller.signal});
  if(!res.ok)throw Error('Routing service returned '+res.status);
  const data=await res.json();if(sequence!==routeSequence)return;
  const routes=data.routes||[];const route=routes[0];if(data.code!=='Ok'||!route?.geometry?.coordinates?.length)throw Error('No connected route found.');
  const snappedStart=data.waypoints?.[0]?.location||routePickup,snappedEnd=data.waypoints?.at(-1)?.location||routeDestination;
  routeCandidates=routes.map(candidate=>{
   let progress=0;const instructions=[];
   for(const leg of candidate.legs||[])for(const step of leg.steps||[]){const maneuver=step.maneuver||{};if(Array.isArray(maneuver.location))instructions.push({location:maneuver.location,type:maneuver.type||'continue',modifier:maneuver.modifier||'',name:step.name||'',distance:step.distance,progressMeters:progress});progress+=Number(step.distance)||0}
   return {...candidate,source:'online',startCoordinate:snappedStart,endCoordinate:snappedEnd,instructions};
  });routeShowCandidate(0);routeCurrent=routePickup;routeUpdateTurn();routeStartWatch();
 }catch(e){if(e.name==='AbortError'||sequence!==routeSequence)return;routeStatus('Unable to calculate route: '+e.message+' Try again or select another pickup.');routeLine=null;routeDraw();routePickupMarker?.remove();routeDestinationMarker?.remove();routePickupMarker=routeDestinationMarker=null}
}
function routeShowCandidate(index){
 const route=routeCandidates[index];if(!route)return;routeSource=route.source;routeRender(route.geometry,route.startCoordinate,route.endCoordinate);routeProgressGeometry=route.geometry.coordinates;
 const km=(route.distance/1000).toFixed(route.distance<1000?2:1),mins=Math.max(1,Math.round(route.duration/60));
 $('#route-summary').textContent=km+' km · about '+mins+' min · '+routeMode+(route.source==='local'?' · local road graph':' · online routing service');
 routeStatus(route.source==='local'?`Local route ready. Start/end snapped ${Math.round(route.startSnapMeters)} m / ${Math.round(route.endSnapMeters)} m. ETA uses average road-class speeds, not verified speed limits.`:`Online route ready. Coordinates are sent to the selected public routing service; start/end snap ${Math.round(route.startSnapMeters||0)} m / ${Math.round(route.endSnapMeters||0)} m.`);
 routeRenderInstructions(route.instructions||[]);routeUpdateTurn();routeFit(route.geometry.coordinates);
 const choices=$('#route-alternatives');choices.replaceChildren();choices.hidden=routeCandidates.length<2;
 routeCandidates.forEach((candidate,choice)=>{const button=document.createElement('button');button.type='button';button.setAttribute('aria-pressed',String(choice===index));button.textContent=`Route ${choice+1} · ${(candidate.distance/1000).toFixed(1)} km`;button.onclick=()=>routeShowCandidate(choice);choices.append(button)});
}
async function routeOpen(place){
 closePlace();routePanel.hidden=false;pickingPickup=false;document.querySelector('.search-dock').style.display='none';setRouteSheetState('compact');
 routeClear();routeDestination=[+place.coordinates.longitude,+place.coordinates.latitude];
 $('#route-destination').value=place.name;$('#route-pickup').value='Locating…';
 $('#route-summary').textContent='';$('#route-steps').replaceChildren();
 routeStatus('Requesting your location…');routeMarkers();
 try{
  const coords=await routeLocation();if(routePanel.hidden)return;
  const bounds=map.getMaxBounds();if(bounds&&!bounds.contains(coords)){routeStatus('Your location is outside the available map bounds. Choose a pickup on the map.');$('#route-pickup').value='Choose pickup on map';return}
  routePickup=coords;$('#route-pickup').value='My location';await routeCalculate();
 }catch(e){routeStatus(e.message);$('#route-pickup').value='Choose pickup on map';setRouteSheetState('half')}
}
function routeMeters(a,b){
 const rad=Math.PI/180,lat1=a[1]*rad,lat2=b[1]*rad,dlat=(b[1]-a[1])*rad,dlon=(b[0]-a[0])*rad;
 const h=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2;
 return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));
}
function routeUpdateTurn(){
 if(!routeSteps.length||!routeCurrent)return;
 const progress=closestRouteProgress(routeProgressGeometry,routeCurrent);
 const along=progress?.progressMeters??0;
 const step=routeSteps.find((item,index)=>index>0&&item.progressMeters>along+12)||routeSteps.at(-1);
 const d=routeMeters(routeCurrent,step.location);
 const action=step.type==='depart'?'Depart':step.type==='arrive'?'Arrive at destination':step.type==='turn'?'Turn '+(step.modifier||''):step.type==='roundabout'?'Enter roundabout':step.type==='new name'?'Continue':step.type.replace(/_/g,' ');
 $('#route-turn-icon').textContent=/left/i.test(action)?'↰':/right/i.test(action)?'↱':step.type==='arrive'?'●':'↑';
 $('#route-turn-title').textContent=action+(step.name?' · '+step.name:'');
 $('#route-turn-distance').textContent=(d<1000?Math.round(d)+' m':(d/1000).toFixed(1)+' km')+' to maneuver · approximate GPS guidance'+(progress&&progress.distanceMeters>40?' · off-route?':'');
 $('#route-turn-card').hidden=false;routeLayout();
}
function routeStartWatch(){
 if(routeWatch!==null){navigator.geolocation.clearWatch(routeWatch);routeWatch=null}
 if(!navigator.geolocation||$('#route-pickup').value!=='My location')return;
 routeWatch=navigator.geolocation.watchPosition(p=>{
  if(routePanel.hidden)return;
  const c=[p.coords.longitude,p.coords.latitude];if(p.coords.accuracy>100)return;
  routeCurrent=c;const progress=closestRouteProgress(routeProgressGeometry,c);routeUpdateTurn();
  if(progress&&progress.distanceMeters>70)routeOffRouteCount++;else routeOffRouteCount=0;
  if(routeOffRouteCount>=3&&Date.now()-lastRouteRecalculation>30000&&routeDestination){routeOffRouteCount=0;lastRouteRecalculation=Date.now();routePickup=c;$('#route-pickup').value='My location';routeStatus('You appear to be off route. Recalculating…');void routeCalculate()}
 },()=>{}, {enableHighAccuracy:true,maximumAge:2000,timeout:15000});
}
$('#route-close').onclick=()=>{document.querySelector('.search-dock').style.removeProperty('display');routePanel.hidden=true;pickingPickup=false;routeClear()};
$('#route-pick-on-map').onclick=()=>{
 pickingPickup=true;$('#route-pick-on-map').setAttribute('aria-pressed','true');
 $('#route-pickup').value='Tap the map to choose pickup';routeStatus('Tap the map where your route should start.');
 setRouteSheetState('compact');map.getCanvas().style.cursor='crosshair';
};
$('#route-use-location').onclick=async()=>{
 pickingPickup=false;$('#route-pick-on-map').setAttribute('aria-pressed','false');map.getCanvas().style.cursor='';routeStatus('Requesting your location…');
 try{const c=await routeLocation();const bounds=map.getMaxBounds();if(bounds&&!bounds.contains(c))throw Error('Your location is outside the available map bounds. Choose a pickup on the map.');routePickup=c;$('#route-pickup').value='My location';await routeCalculate()}catch(e){routeStatus(e.message);setRouteSheetState('half')}
};


document.querySelectorAll('[data-route-mode]').forEach(b=>b.onclick=()=>{
 routeMode=b.dataset.routeMode;
 document.querySelectorAll('[data-route-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
 routeCalculate();
});
$('#place-directions').onclick=e=>{e.preventDefault();if(selectedPlace)routeOpen(selectedPlace)};

const handle=$('#place-handle');
handle.addEventListener('pointerdown',e=>{
 if(e.button!==0)return;dragStart=e.clientY;dragDelta=0;
 handle.setPointerCapture(e.pointerId);sheet.classList.add('is-dragging');
});
handle.addEventListener('pointermove',e=>{
 if(dragStart===null)return;
 dragDelta=e.clientY-dragStart;
 sheet.style.setProperty('--sheet-drag',dragDelta+'px');
});
function finishSheetDrag(){
 if(dragStart===null)return;
 sheet.classList.remove('is-dragging');sheet.style.removeProperty('--sheet-drag');
 const dy=dragDelta;dragStart=null;dragDelta=0;
 if(Math.abs(dy)<45)return;
 const states=['compact','half','expanded'];
 const next=states.indexOf(sheetState)+(dy<0?1:-1);
 if(next<0&&dy>120){closePlace();return}
 setSheetState(states[Math.max(0,Math.min(2,next))]);
}
handle.addEventListener('pointerup',finishSheetDrag);
handle.addEventListener('pointercancel',finishSheetDrag);
handle.addEventListener('keydown',e=>{
 if(e.key==='ArrowUp'||e.key==='ArrowDown'){
  e.preventDefault();const states=['compact','half','expanded'];
  setSheetState(states[Math.max(0,Math.min(2,states.indexOf(sheetState)+(e.key==='ArrowUp'?1:-1)))]);
 }
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!sheet.hidden)closePlace()});
 // Fallback for clicks on visible labels/pins even when symbol hit-testing misses.
 map.on('click',e=>{
  if(!routePanel.hidden&&pickingPickup){
   routePickup=[e.lngLat.lng,e.lngLat.lat];pickingPickup=false;$('#route-pick-on-map').setAttribute('aria-pressed','false');
   map.getCanvas().style.cursor='';$('#route-pickup').value='Map location';routeMarkers();void routeCalculate();return;
  }
  if(!sheet.hidden||!routePanel.hidden)return;
  const layers=POI_LAYERS.filter(id=>map.getLayer(id));
  const features=map.queryRenderedFeatures([[e.point.x-14,e.point.y-14],[e.point.x+14,e.point.y+14]],{layers});
  for(const f of features){const place=placeById.get(String(f.properties?.id));if(place){if(selectedPlace?.id!==place.id)openPlace(place);return}selectVectorPlace(f.properties?.id);return}
 });

function refresh(){
 const q=$('#map-search').value.trim();
 if(!placeSearchIndex&&(q||nearbyMode)){
  const results=$('#search-results'),input=$('#map-search');results.replaceChildren();const loading=document.createElement('p');loading.className='search-empty';loading.textContent='Loading full place search…';results.append(loading);results.hidden=false;input.setAttribute('aria-expanded','true');updatePoiPresentation();ensureSearchIndex().then(refresh).catch(error=>{loading.textContent='Place search could not be loaded.';console.error('Search index:',error)});return;
 }
 const ranked=placeSearchIndex?.search({query:q,category,origin:nearbyMode?nearbyOrigin:null,maxDistanceMeters:nearbyMode?10000:Infinity})||[];
 updatePoiPresentation();
 const results=$('#search-results'),input=$('#map-search'),status=$('#search-status');results.replaceChildren();input.removeAttribute('aria-activedescendant');
 const showResults=Boolean(q||nearbyMode);
 results.hidden=!showResults;input.setAttribute('aria-expanded',String(showResults));
 if(showResults){
  if(!ranked.length){const empty=document.createElement('p');empty.className='search-empty';empty.textContent=nearbyMode?'No public places found within 10 km.':'No matching places found.';results.append(empty)}
  for(const [index,row] of ranked.entries()){
   const p=row.place,b=document.createElement('button');b.type='button';b.id=`search-result-${index}`;b.setAttribute('role','option');b.setAttribute('aria-selected','false');
   const title=document.createElement('strong');title.textContent=p.name;
   const detail=document.createElement('span');detail.textContent=[p.categories?.[0],p.address,row.distanceMeters===null?null:`${row.distanceMeters<1000?Math.round(row.distanceMeters)+' m':(row.distanceMeters/1000).toFixed(1)+' km'}`].filter(Boolean).join(' · ');
   b.append(title,detail);b.onclick=()=>{openPlace(p);results.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');input.focus()};results.append(b);
  }
 }
 if(places.length){status.hidden=true;status.textContent=''}
}
function loadRoadGeoJSON(){
 if(!roadGeoJSONPromise)roadGeoJSONPromise=(async()=>{
  const mr=await fetch('./generated/kattankudy-roads-manifest.json');if(!mr.ok)throw Error('Road manifest '+mr.status);
  const manifest=await mr.json(),r=await fetch('./generated/'+manifest.geojson+'?v='+manifest.sha256);if(!r.ok)throw Error('Road MZP '+r.status);
  const data=JSON.parse(await r.text());if(data.type!=='FeatureCollection'||data.features.length!==manifest.valid_geographic_features)throw Error('Road MZP manifest mismatch');
  return data;
 })();
 return roadGeoJSONPromise;
}
async function roads(){try{const data=await loadRoadGeoJSON();if(map.getSource('mazo-roads'))return;map.addSource('mazo-roads',{type:'geojson',data});map.addLayer({id:'mazo-road-lines',type:'line',source:'mazo-roads',paint:{'line-color':'#f8f9fa','line-width':['interpolate',['linear'],['zoom'],11,2,16,9]}});map.addLayer({id:'mazo-road-names',type:'symbol',source:'mazo-roads',minzoom:13,filter:['!=',['get','name'],null],layout:{'symbol-placement':'line','text-field':['get','name'],'text-size':12},paint:{'text-color':'#46515b','text-halo-color':'#fff','text-halo-width':2}});for(const id of ['mazo-road-lines','mazo-road-names'])map.setLayoutProperty(id,'visibility',roadsVisible?'visible':'none')}catch(e){console.warn('Road MZP unavailable:',e)}}


/* Gazette-backed provisional 70 km/h defaults. Not individually verified road limits.
   A04 built-up geometry requires authoritative chainage matching before 50 km/h display. */
const SPEED_SOURCE='mazo-speed-review',SPEED_LAYER='mazo-speed-review-signs';
let speedReviewFeatures=[];
function ensureSpeedReview(){
 if(!map.getStyle()?.layers||!speedReviewFeatures.length)return;
 const id='mazo-speed-review-icon';
 if(!map.hasImage(id)){
  const canvas=document.createElement('canvas');canvas.width=72;canvas.height=72;
  const ctx=canvas.getContext('2d');
  ctx.beginPath();ctx.arc(36,36,31,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();
  ctx.lineWidth=7;ctx.strokeStyle='#d63030';ctx.stroke();
  ctx.fillStyle='#263238';ctx.font='bold 29px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('70',36,39);
  map.addImage(id,ctx.getImageData(0,0,72,72),{pixelRatio:2});
 }
 const data={type:'FeatureCollection',features:speedReviewFeatures};
 if(map.getSource(SPEED_SOURCE))map.getSource(SPEED_SOURCE).setData(data);
 else map.addSource(SPEED_SOURCE,{type:'geojson',data});
 if(!map.getLayer(SPEED_LAYER))map.addLayer({id:SPEED_LAYER,type:'symbol',source:SPEED_SOURCE,minzoom:16,
  layout:{'icon-image':id,'icon-size':['interpolate',['linear'],['zoom'],16,0.34,19,0.53],
   'icon-allow-overlap':false,'icon-ignore-placement':false,'icon-padding':22}});
}
let speedReviewPromise=null;
async function loadSpeedReviews(){
 if(speedReviewPromise)return speedReviewPromise;
 speedReviewPromise=(async()=>{
  try{
   const response=await fetch('./generated/kattankudy-speed-limits-manifest.json');
   if(!response.ok)throw Error('Speed review manifest '+response.status);
   const manifest=await response.json();
   const speedData=await checkedJson('./generated/'+manifest.geojson,manifest.sha256);
   if(speedData.type!=='FeatureCollection'||speedData.features.length!==manifest.valid_geographic_features)throw Error('Speed review manifest mismatch');
   const seen=new Set(),features=[];
   for(const feature of speedData.features||[]){
    const coordinates=feature.geometry?.coordinates;
    if(feature.geometry?.type!=='LineString'||!Array.isArray(coordinates)||coordinates.length<2)continue;
    const midpoint=coordinates[Math.floor(coordinates.length/2)];
    if(!midpoint||!midpoint.every(Number.isFinite))continue;
    const key=Math.round(midpoint[0]*800)+'/'+Math.round(midpoint[1]*800);
    if(seen.has(key))continue;seen.add(key);
    const record=feature.properties||{};
    features.push({type:'Feature',geometry:{type:'Point',coordinates:midpoint},properties:{
     road:record.road_name||'Unnamed road',status:'Legal default candidate — unverified',
     candidate:record.legal_default_candidate_kmh??'',road_id:record.road_id,
     sourceMaxspeed:record.supplementary_maxspeed_evidence?.maxspeed??'',sourceUnit:record.supplementary_maxspeed_evidence?.maxspeed_unit??null,
     sourceStatus:record.supplementary_maxspeed_evidence?.maxspeed_status??''}});
   }
   speedReviewFeatures=features;ensureSpeedReview();
  }catch(e){console.warn('Speed-limit reviews unavailable:',e);speedReviewPromise=null}
 })();
 return speedReviewPromise;
 }
map.on('click',SPEED_LAYER,e=>{
 if(!routePanel.hidden)return;
 const f=e.features?.[0];if(!f)return;
 const p=f.properties||{};
 new maplibregl.Popup({offset:18,maxWidth:'280px'}).setLngLat(f.geometry.coordinates)
  .setDOMContent((()=>{
   const box=document.createElement('div');
   const heading=document.createElement('strong');heading.textContent='70 km/h · Legal default candidate';
   const detail=document.createElement('p');detail.textContent=p.road+' — 70 km/h is the general non-built-up motor-vehicle limit in the 2012 Gazette, shown here as a provisional default. This road has not been individually classified or verified; A04 scheduled built-up sections have different limits.';
   const sourceTag=document.createElement('p');if(p.sourceStatus==='unverified_source_tag'){sourceTag.textContent='Supplementary OSM maxspeed tag: '+p.sourceMaxspeed+(p.sourceUnit?' '+p.sourceUnit:' (unit not declared)')+' — unverified source data.';box.append(sourceTag)}
   const note=document.createElement('small');note.textContent='Provisional map data only — not a verified posted sign or safe driving-speed recommendation. Vehicle-specific limits and local restrictions may differ.';
   box.append(heading,detail,note);return box;
  })()).addTo(map);
});
map.on('mouseenter',SPEED_LAYER,()=>map.getCanvas().style.cursor='pointer');
map.on('mouseleave',SPEED_LAYER,()=>map.getCanvas().style.cursor='');
map.on('error',event=>{
 if(event.sourceId===POI_SOURCE){
  const status=$('#search-status'),retry=$('#places-retry');
  status.hidden=false;status.classList.add('is-error');status.textContent='Place map tiles could not be loaded. Search may still work; check your connection and retry.';
  retry.hidden=false;console.error('PMTiles place source error:',event.error);
 }
});

// Preserve the vector basemap: roads, city labels and road names remain visible.
// Only provider POI icons/labels are suppressed, so our own JSON supplies businesses.
map.on('style.load',()=>{try{presentedCategory=null;presentedSelectedId=null;presentedVisibility=null;applyMazoCartographicStyle(map,theme());for(const layer of map.getStyle().layers||[]){if(!layer.id.startsWith('mazo-')&&isBasemapPlacePoiLayer(layer))map.setLayoutProperty(layer.id,'visibility','none')}ensurePoiLayer();ensureSpeedReview()}catch(error){console.error('Map layer initialization:',error)}});
async function checkedJson(file,sha256){
 const response=await fetch(file+'?v='+sha256);if(!response.ok)throw Error(file+' '+response.status);
 const bytes=await response.arrayBuffer();
 if(sha256&&globalThis.crypto?.subtle){const digest=Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(digest!==sha256)throw Error(file+' checksum mismatch')}
 return JSON.parse(new TextDecoder().decode(bytes));
}
function installPlaceIndex(payload){
 const seen=new Set();
 for(const place of decodeSearchIndex(payload)){
  const canonicalId=window.resolveMazoPlaceId(place.id);if(seen.has(canonicalId))continue;seen.add(canonicalId);
  const normalized={...place,name:canonicalPlaceName(place.name),address:displaySriLankanAddress(place.address)};
  places.push(normalized);placeById.set(canonicalId,normalized);
 }
 placeSearchIndex=createPlaceSearchIndex(places,placeAliases);
 placeById=createPlaceLookup(places,placeAliases);
}
async function ensureSearchIndex(){
 if(placeSearchIndex)return placeSearchIndex;
 if(!searchIndexPromise){const entry=deliveryManifest?.delivery?.search_index;if(!entry)throw Error('Search index is not in the manifest');searchIndexPromise=checkedJson('./generated/'+entry.file,entry.sha256).then(installPlaceIndex)}
 await searchIndexPromise;return placeSearchIndex;
}
async function loadPlaceDetails(){
 if(!placeDetailPromise){const entry=deliveryManifest?.delivery?.place_details;if(!entry)throw Error('Place details index is not in the manifest');placeDetailPromise=checkedJson('./generated/'+entry.file,entry.sha256).then(decodePlaceDetails)}
 return placeDetailPromise;
}
async function loadPmtiles(manifest){
 const entry=manifest.delivery?.mvt_pmtiles,index=manifest.delivery?.search_index;if(!entry||!index)throw Error('PMTiles delivery is not present in manifest');
 const script=await new Promise((resolve,reject)=>{if(window.pmtiles)return resolve();const tag=document.createElement('script');tag.src='./assets/vendor/pmtiles-4.5.0.js';tag.onload=resolve;tag.onerror=()=>reject(Error('PMTiles protocol library could not be loaded'));document.head.append(tag)});
 void script;if(!window.pmtiles?.Protocol||!window.pmtiles?.PMTiles)throw Error('PMTiles protocol library did not initialize');
 const archiveUrl=new URL('./generated/'+entry.file,location.href).href+'?v='+entry.sha256;const archive=new window.pmtiles.PMTiles(archiveUrl);
 const header=await archive.getHeader(),metadata=await archive.getMetadata();
 if(!metadata.vector_layers?.some(layer=>layer.id==='places')||header.minZoom!==entry.min_zoom||header.maxZoom!==entry.max_zoom)throw Error('PMTiles archive metadata mismatch');
 if(!pmtilesProtocol){pmtilesProtocol=new window.pmtiles.Protocol();maplibregl.addProtocol('pmtiles',pmtilesProtocol.tile)}
 pmtilesProtocol.add(archive);
 window.mazoPmtilesUrl='pmtiles://'+archiveUrl;deliveryManifest=manifest;
 for(const id of [...POI_LAYERS].reverse())if(map.getLayer(id))map.removeLayer(id);
 if(map.getSource(POI_SOURCE))map.removeSource(POI_SOURCE);
 presentedCategory=null;presentedSelectedId=null;presentedVisibility=null;ensurePoiLayer();
 renderCategoryFilters();refresh();const status=$('#search-status');status.hidden=true;status.textContent='';
}
async function loadPlaceData(){const status=$('#search-status'),retry=$('#places-retry');retry.hidden=true;status.hidden=false;status.classList.remove('is-error');status.textContent='Loading places…';places=[];placeById.clear();placeSearchIndex=null;searchIndexPromise=null;placeDetailsLoaded=false;placeDetailPromise=null;try{const response=await fetch('./generated/manifest.json',{cache:'no-cache'});if(!response.ok)throw Error('Manifest '+response.status);const manifest=await response.json();if(manifest.production_default!=='pmtiles'||manifest.format!=='PMTiles/1')throw Error('The place manifest does not declare PMTiles as its sole delivery format');deliveryManifest=manifest;placeAliases=manifest.aliases||{};window.resolveMazoPlaceId=id=>{const seen=new Set();while(placeAliases[id]){if(seen.has(id))throw Error('Place alias cycle');seen.add(id);id=typeof placeAliases[id]==='string'?placeAliases[id]:placeAliases[id].canonical_id}return id};
 await loadPmtiles(manifest);
 status.hidden=true;status.textContent='';status.classList.remove('is-error');retry.hidden=true;
}catch(error){status.hidden=false;status.textContent='Place map tiles could not be loaded. Search may still work; check your connection and retry.';status.classList.add('is-error');retry.hidden=false;console.error('Place data error:',error);if(deliveryManifest)void ensureSearchIndex().catch(indexError=>console.warn('Place search index unavailable:',indexError))}}
$('#places-retry').onclick=()=>void loadPlaceData();
void loadPlaceData();
const offlineStatus=$('#offline-status'),offlineButton=$('#offline-download');
if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(error=>console.warn('Offline cache worker unavailable:',error));
async function updateOfflineStatus(){
 try{const keys=await caches.keys();const packs=keys.filter(key=>key.startsWith('mazo-offline-pack-'));offlineStatus.hidden=false;offlineStatus.textContent=packs.length?'Offline place search, details, local roads and limited Kattankudy routing are downloaded. Basemap, live directions outside that area, and online updates still require internet.':'Offline data is not downloaded. Basemap tiles are online-only.';offlineButton.title=packs.length?'Remove downloaded offline place data':'Download offline place data';offlineButton.setAttribute('aria-label',offlineButton.title)}catch{offlineStatus.hidden=false;offlineStatus.textContent='Offline storage is unavailable in this browser.'}
}
offlineButton.onclick=async()=>{
 offlineButton.disabled=true;offlineStatus.hidden=false;
 try{
  const keys=await caches.keys(),existing=keys.filter(key=>key.startsWith('mazo-offline-pack-'));
  if(existing.length&&!navigator.onLine){await removeOfflinePack();offlineStatus.textContent='Downloaded place data removed. The basemap was never stored offline.'}
  else{
   offlineStatus.textContent='Checking for offline data updates…';
   const [places,roads,routing]=await Promise.all(['./generated/manifest.json','./generated/kattankudy-roads-manifest.json','./generated/kattankudy-routing-manifest.json'].map(async url=>{const response=await fetch(url,{cache:'no-cache'});if(!response.ok)throw Error(`Manifest unavailable (${response.status})`);return response.json()}));
   const pack=offlinePackResources(places,roads,routing),target='mazo-offline-pack-'+pack.version;
   if(existing.includes(target)){await removeOfflinePack();offlineStatus.textContent='Downloaded place data removed. The basemap was never stored offline.'}
   else{const total=pack.resources.reduce((sum,row)=>sum+(Number(row.bytes)||0),0);offlineStatus.textContent=`Downloading ${pack.resources.length} files (${(total/1048576).toFixed(1)} MB)…`;await downloadOfflinePack({manifest:places,roadsManifest:roads,routingManifest:routing});offlineStatus.textContent=`Offline place, search, detail and Kattankudy routing data saved or updated (${(total/1048576).toFixed(1)} MB). Basemap remains online-only.`}
  }
 }catch(error){offlineStatus.textContent=`Offline data operation failed: ${error.message}`}
 finally{offlineButton.disabled=false;await updateOfflineStatus()}
};
window.addEventListener('online',updateOfflineStatus);window.addEventListener('offline',updateOfflineStatus);void updateOfflineStatus();
window.addEventListener('offline',()=>{const message=$('#network-status');message.textContent='You are offline. The basemap may stop updating; already loaded places remain available.';message.hidden=false});
window.addEventListener('online',()=>{$('#network-status').hidden=true});
function renderCategoryFilters(){
 const container=document.querySelector('.categories'),all=container.querySelector('[data-category="all"]');container.replaceChildren(all);
 const labels={bank:'Banks & finance',food:'Food',health:'Health',hotel:'Hotels',park:'Nature',shop:'Shopping',atm:'ATMs',fuel:'Fuel',auto:'Auto',electronics:'Electronics',government:'Government',hardware:'Hardware',landmark:'Landmarks',salon:'Salons',sports:'Sports',transport:'Transport',market:'Markets',services:'Services',gym:'Fitness',jewelry:'Jewelry',school:'Education',stationery:'Books & print',cafe:'Cafés',worship:'Worship'};
 const categories=places.length?availableCategories(places):Object.entries(deliveryManifest?.delivery?.search_index?.categories||{}).map(([name,count])=>({name,count}));
 for(const {name,count} of categories){const button=document.createElement('button');button.type='button';button.dataset.category=name;button.setAttribute('aria-pressed','false');button.textContent=`${labels[name]||name} · ${count}`;container.append(button)}
 container.querySelectorAll('[data-category]').forEach(button=>button.onclick=()=>{category=button.dataset.category;nearbyMode=Boolean(nearbyOrigin)&&nearbyMode;container.querySelectorAll('[data-category]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));refresh()});
}
$('#map-search').addEventListener('input',refresh);$('#search-form').onsubmit=e=>{e.preventDefault();refresh()};
const searchInput=$('#map-search');
searchInput.addEventListener('keydown',event=>{const results=$('#search-results'),items=[...results.querySelectorAll('[role="option"]')];if(event.key==='Escape'){results.hidden=true;searchInput.setAttribute('aria-expanded','false');searchInput.removeAttribute('aria-activedescendant');return}if(results.hidden||!items.length)return;let active=items.findIndex(item=>item.id===searchInput.getAttribute('aria-activedescendant'));if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();active=(active+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items.forEach((item,index)=>item.setAttribute('aria-selected',String(index===active)));searchInput.setAttribute('aria-activedescendant',items[active].id);items[active].scrollIntoView({block:'nearest'})}else if(event.key==='Enter'&&active>=0){event.preventDefault();items[active].click()}});
function applyThemeToMap(){
 if(!map.isStyleLoaded()){map.once('style.load',applyThemeToMap);return}
 const selected=theme(),palette=MAZO_PALETTE[selected];
 applyMazoCartographicStyle(map,selected);
 for(const id of Object.keys(artwork).map(iconFor))if(map.hasImage(id))map.removeImage(id);
 registerIcons();
 for(const id of POI_LAYERS)if(map.getLayer(id)){
  map.setPaintProperty(id,'text-color',palette.label);map.setPaintProperty(id,'text-halo-color',palette.halo);
 }
 if(map.getLayer('mazo-city-labels')){map.setPaintProperty('mazo-city-labels','text-color',palette.label);map.setPaintProperty('mazo-city-labels','text-halo-color',palette.halo)}
 if(map.getLayer('mazo-road-lines'))map.setPaintProperty('mazo-road-lines','line-color',selected==='dark'?'#89999d':'#f8f9fa');
 if(map.getLayer('mazo-road-names')){map.setPaintProperty('mazo-road-names','text-color',palette.roadLabel);map.setPaintProperty('mazo-road-names','text-halo-color',palette.halo)}
}
$('#theme-toggle').onclick=()=>{const dark=document.documentElement.dataset.theme!=='dark';document.documentElement.dataset.theme=dark?'dark':'light';$('#theme-toggle').setAttribute('aria-pressed',String(dark));try{localStorage.setItem('mazo-maps-theme',dark?'dark':'light')}catch{};applyThemeToMap();};
const locateButton=$('#map-locate');
let locationMarker=null;
locateButton.onclick=()=>{
 const status=$('#search-status');
 if(!navigator.geolocation){status.hidden=false;status.textContent='Location is unavailable in this browser. Search or filter places instead.';return}
 locateButton.disabled=true;locateButton.setAttribute('aria-busy','true');
 navigator.geolocation.getCurrentPosition(position=>{
  locateButton.disabled=false;locateButton.setAttribute('aria-busy','false');
  const coords=[position.coords.longitude,position.coords.latitude];
  nearbyOrigin={latitude:position.coords.latitude,longitude:position.coords.longitude};nearbyMode=true;
  if(locationMarker)locationMarker.remove();
  const dot=document.createElement('div');dot.className='user-location-dot';dot.setAttribute('role','img');dot.setAttribute('aria-label','Your current location');
  locationMarker=new maplibregl.Marker({element:dot,anchor:'center'}).setLngLat(coords).addTo(map);
  refresh();
  const bounds=map.getMaxBounds();
  if(bounds&&!bounds.contains(coords)){status.hidden=false;status.textContent='Your location is outside the available map data. Nearby results are limited to mapped Batticaloa District places within 10 km.';return}
  status.hidden=false;status.textContent='Showing public places within 10 km, sorted by distance.';
  map.flyTo({center:coords,zoom:Math.max(map.getZoom(),16),bearing:0,pitch:0,duration:cameraDuration(750)});
 },error=>{
  locateButton.disabled=false;locateButton.setAttribute('aria-busy','false');
  nearbyMode=false;nearbyOrigin=null;refresh();status.hidden=false;status.textContent=error.code===1?'Location permission denied. You can continue using search and category filters.':error.code===2?'GPS location is unavailable. Check your device settings or continue using search.':'Location request timed out. You can continue using search.';
 },{enableHighAccuracy:true,timeout:12000,maximumAge:10000});
};
async function cities(){try{const r=await fetch('./data/cities.json');if(!r.ok)return;const d=await r.json();const features=(d.cities||[]).filter(c=>Number.isFinite(+c.coordinates?.longitude)&&Number.isFinite(+c.coordinates?.latitude)).map(c=>({type:'Feature',geometry:{type:'Point',coordinates:[+c.coordinates.longitude,+c.coordinates.latitude]},properties:{name:c.name||'',level:c.level||'city'}}));if(map.getSource('mazo-cities'))return;map.addSource('mazo-cities',{type:'geojson',data:{type:'FeatureCollection',features}});map.addLayer({id:'mazo-city-labels',type:'symbol',source:'mazo-cities',layout:{'text-field':['get','name'],'text-size':['interpolate',['linear'],['zoom'],5,11,13,17],'text-allow-overlap':false},paint:{'text-color':theme()==='dark'?'#e8edf4':'#27313b','text-halo-color':theme()==='dark'?'#161b22':'#fff','text-halo-width':2}})}catch(e){console.warn('City labels:',e)}}

map.on('load',()=>{$('#map-frame').dataset.state='ready';try{ensurePoiLayer()}catch(e){console.warn('POI on load:',e)}if(map.getZoom()>=15.5)void loadSpeedReviews()});
const maybeLoadSpeedReviews=()=>{if(map.getZoom()>=15.5)void loadSpeedReviews()};
map.on('zoomend',maybeLoadSpeedReviews);
map.on('moveend',maybeLoadSpeedReviews);
map.on('error',event=>console.error('MapLibre:',event.error));
map.on('error',event=>{
 if(navigator.onLine||offlineBaseStyle)return;
 offlineBaseStyle=true;
 const background=theme()==='dark'?'#202d32':'#ebe8df';
 map.setStyle({version:8,sources:{},layers:[{id:'offline-background',type:'background',paint:{'background-color':background}}]});
 const status=document.querySelector('#offline-status');if(status){status.hidden=false;status.textContent='Offline mode: saved places and Kattankudy road routing can work from the downloaded pack. Basemap tiles and remote routes are unavailable.'}
});
