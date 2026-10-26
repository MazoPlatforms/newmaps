// Reliable OpenFreeMap fallback; optional local PMTiles are enabled only after verification.
const $=s=>document.querySelector(s);
const styles={light:'https://tiles.openfreemap.org/styles/liberty',dark:'https://tiles.openfreemap.org/styles/dark'};
const theme=()=>document.documentElement.dataset.theme==='dark'?'dark':'light';
const map=new maplibregl.Map({container:'map',style:styles[theme()],center:[81.729,7.685],zoom:14,minZoom:12,maxBounds:[[81.685,7.635],[81.785,7.735]]});
// Minimal map chrome: touch gestures remain available without zoom buttons.
const datasets=["places.json","bakery.json","supermarket.json","halls.json","banks.json","mosque.json","textiles.json","cafe.json","gym.json","jewelry.json","schools.json","stationery.json","atms.json","automotive.json","electronics.json","fuel.json","government.json","hardware.json","hospitals.json","hotels.json","landmarks.json","markets.json","salons.json","saloons.json","services.json","sports.json","transport.json","accessories.json","accommodation.json","addresses.json","agriculture.json","baby.json","bags.json","boundaries.json","boundary.json","clinics.json","cosmetics.json","couriers.json","education.json","emergency.json","entrances.json","fancy.json","fashion.json","finance.json","footwear.json","furniture.json","homeware.json","opticals.json","parking.json","pet-shops.json","pharmacies.json","public-utilities.json","recreation.json","religious.json","tailors.json","utilities.json","waterways.json","computer.json","mobile.json"];
let places=[],category='all',roadsVisible=true,placesVisible=true;
const KATTANKUDY=[81.70,7.65,81.77,7.72];
const inArea=p=>+p.coordinates.longitude>=KATTANKUDY[0]&&+p.coordinates.longitude<=KATTANKUDY[2]&&+p.coordinates.latitude>=KATTANKUDY[1]&&+p.coordinates.latitude<=KATTANKUDY[3];
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function kind(p){const c=(p.categories||[]).join(' ').toLowerCase();if(/atm|cash machine/.test(c))return 'atm';if(/fuel|gas station|petrol/.test(c))return 'fuel';if(/mechanic|automotive|car repair|vehicle repair/.test(c))return 'auto';if(/electronics|mobile phone|computer|electrical/.test(c))return 'electronics';if(/government|municipal|public office/.test(c))return 'government';if(/hardware|tool shop|building material/.test(c))return 'hardware';if(/landmark|historical|monument/.test(c))return 'landmark';if(/salon|saloon|barber|beauty/.test(c))return 'salon';if(/sport|stadium|playground/.test(c))return 'sports';if(/transport|bus station|taxi/.test(c))return 'transport';if(/grocery|market|supermarket/.test(c))return 'market';if(/repair|service center|service centre/.test(c))return 'services';if(/gym|fitness/.test(c))return 'gym';if(/jewel|goldsmith/.test(c))return 'jewelry';if(/school|education|college|tuition|learning/.test(c))return 'school';if(/stationery|print shop|bookstore/.test(c))return 'stationery';if(/cafe|coffee|ice cream|tea shop/.test(c))return 'cafe';if(/bakery|restaurant|food|hotel & bakery/.test(c))return 'food';if(/hotel|lodg|hall|banquet/.test(c))return 'hotel';if(/mosque|worship|masjid/.test(c))return 'worship';if(/hospital|clinic|pharmacy|medical/.test(c))return 'health';if(/park|nature/.test(c))return 'park';return 'shop'}
const artwork={food:['#b87353','M7 3v7m3-7v7M5 7h7v3a3 3 0 0 1-3 3v8m9-18v18m0-18c-4 3-4 8 0 8'],health:['#b5666c','M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6Z'],shop:['#6d81aa','M5 8h14l1 12H4ZM9 8V6a3 3 0 0 1 6 0v2'],hotel:['#8c76a6','M3 19V6m0 9h18v4m-12-8h9a3 3 0 0 1 3 3v1M6 9h3v4H6Z'],park:['#628c6e','M12 3L5 12h4l-5 5h16l-5-5h4ZM12 17v4'],atm:['#558b76',''],fuel:['#b98451',''],auto:['#617b91',''],electronics:['#6478b4',''],government:['#728a9b',''],hardware:['#907b61',''],landmark:['#8c7597',''],salon:['#b87e99',''],sports:['#588e87',''],transport:['#647fa0',''],market:['#6c8c70',''],services:['#7d8c9d',''],gym:['#538a8c',''],jewelry:['#a67b41',''],school:['#4e7fba',''],stationery:['#6e8791',''],cafe:['#b87353',''],worship:['#967c9c','M4 20h16M6 20V9l6-5 6 5v11M10 20v-6h4v6m-2-16V1']};
const POI_SOURCE='mazo-pois';
const POI_LAYER='mazo-poi-symbols';
function priority(p){const k=kind(p);return ({health:1,worship:2,shop:3,food:4,hotel:5,park:6})[k]||7}
function iconFor(k){return 'mazo-'+k}
function registerIcons(){
 const paths={
 atm:'M20 19h16v25H20zM24 26h8M24 32h8M24 38h5',fuel:'M18 19h15v25H18zM21 23h9v9h-9M33 26h5v14q0 4-5 4',auto:'M19 31l4-9h13l4 9M17 31h25v10H17zM22 41v4m15-4v4',electronics:'M18 19h20v18H18zM23 42h10M28 37v5',government:'M14 25l14-8 14 8M17 28h22M20 28v13m8-13v13m8-13v13M15 43h26',hardware:'M19 21l5 5-7 7 5 5 7-7 5 5 8-8-5-5-8 8-5-5z',landmark:'M17 43V25l11-8 11 8v18M15 43h26M24 43V31h8v12',salon:'M20 19l16 24M36 19L20 43M18 20a3 3 0 1 0 6 0M32 20a3 3 0 1 0 6 0',sports:'M28 17a11 11 0 1 0 0 22a11 11 0 1 0 0-22M19 24l18 9M28 17v22',transport:'M18 20h20v22H18zM18 35h20M22 42v4m12-4v4M23 26h10',market:'M17 25h22l-3 18H20zM21 25l7-8 7 8',services:'M20 19l7 7-7 7 5 5 7-7 6 6M20 19l-4 4 4 4',
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
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=80;
  const ctx=canvas.getContext('2d');
  ctx.beginPath();ctx.moveTo(32,77);ctx.bezierCurveTo(25,65,9,49,9,31);
  ctx.arc(32,31,23,Math.PI,0);ctx.bezierCurveTo(55,49,39,65,32,77);ctx.closePath();
  ctx.fillStyle=color;ctx.fill();ctx.lineWidth=4;ctx.strokeStyle='#fff';ctx.stroke();
  ctx.save();ctx.translate(4,3);ctx.scale(0.86,0.86);
  ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.lineJoin='round';ctx.lineCap='round';
  ctx.stroke(new Path2D(paths[kind]||paths.shop));ctx.restore();
  map.addImage(id,ctx.getImageData(0,0,64,80),{pixelRatio:2});
 }
}
function poiFeatures(){return places.map((p,i)=>({type:'Feature',id:i,geometry:{type:'Point',coordinates:[+p.coordinates.longitude,+p.coordinates.latitude]},properties:{name:p.name,kind:kind(p),priority:priority(p),index:i,category:(p.categories||[]).join(' '),address:p.address||''}}))}
function ensurePoiLayer(){
 if(!map.getStyle()?.layers)return;
 const data={type:'FeatureCollection',features:poiFeatures()};
 if(!map.getSource(POI_SOURCE))map.addSource(POI_SOURCE,{type:'geojson',data});
 else map.getSource(POI_SOURCE).setData(data);
 registerIcons();
 if(!map.getLayer(POI_LAYER))map.addLayer({
  id:POI_LAYER,type:'symbol',source:POI_SOURCE,minzoom:12,
  layout:{
   'icon-image':['concat','mazo-',['get','kind']],
   'icon-anchor':'bottom','icon-size':['interpolate',['linear'],['zoom'],12,0.48,15,0.62,18,0.82],
   'icon-allow-overlap':false,'icon-padding':4,
   'text-field':['get','name'],'text-font':['Noto Sans Regular'],
   'text-size':['interpolate',['linear'],['zoom'],14,10,17,13],
   'text-offset':[0,0.7],'text-anchor':'top','text-max-width':12,
   'text-optional':true,'text-allow-overlap':false,'text-padding':4
  },
  paint:{'text-color':theme()==='dark'?'#e5e7eb':'#334155',
   'text-halo-color':theme()==='dark'?'#17212e':'#ffffff','text-halo-width':1.5}
 });
 refresh();
}
map.on('click',POI_LAYER,e=>{const i=Number(e.features?.[0]?.properties?.index);if(Number.isInteger(i)&&places[i])openPlace(places[i])});
map.on('mouseenter',POI_LAYER,()=>map.getCanvas().style.cursor='pointer');
map.on('mouseleave',POI_LAYER,()=>map.getCanvas().style.cursor='');
let selectedPlace=null,sheetState='half',dragStart=null,dragDelta=0,closeTimer=null;
const sheet=$('#place-sheet');
function setSheetState(state){
 sheetState=state;sheet.dataset.state=state;document.querySelector('.map-actions').dataset.sheet=state;
 sheet.style.removeProperty('--sheet-drag');
}
function closePlace(){selectedPlace=null;document.querySelector('.map-actions').removeAttribute('data-sheet');sheet.classList.add('is-closing');clearTimeout(closeTimer);closeTimer=setTimeout(()=>{sheet.hidden=true;sheet.classList.remove('is-closing')},260);map.easeTo({padding:{bottom:0},duration:260});}
function openPlace(p){
 selectedPlace=p;clearTimeout(closeTimer);sheet.classList.remove('is-closing');sheet.hidden=false;setSheetState('half');
 $('#place-title').textContent=p.name;
 $('#place-category').textContent=(p.categories||[]).join(' · ')||'Place';
 $('#place-address').textContent=p.address||'Address unavailable';
 $('#place-coordinates').textContent=Number(p.coordinates.latitude).toFixed(6)+', '+Number(p.coordinates.longitude).toFixed(6);
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
   if(String(h.day).toLowerCase()===today.toLowerCase()){row.classList.add('is-today');const dot=document.createElement('span');dot.className='hours-today-dot';dot.setAttribute('aria-label','Today');day.prepend(dot)}
   row.append(day,time);hours.append(row);
  }
 }else{const empty=document.createElement('p');empty.className='hours-empty';empty.textContent='Opening hours unavailable';hours.append(empty)}
 const c=p.coordinates;map.easeTo({center:[+c.longitude,+c.latitude],zoom:Math.max(map.getZoom(),16),padding:{bottom:Math.round(window.innerHeight*.25)},duration:400});
}
$('#place-close').onclick=closePlace;

/* In-map directions: pickup defaults to device location; map-click override.
   Public OSRM endpoints are best-effort and need a managed backend for production SLA. */
const routePanel=$('#route-panel');
let routeSteps=[],routeWatch=null,routeCurrent=null;
let routeDestination=null,routePickup=null,routeMode='driving',routeAbort=null,routeLine=null,routePickupMarker=null,routeDestinationMarker=null,pickingPickup=false,routeSequence=0;
const routeStatus=message=>{$('#route-status').textContent=message};
const routeCoord=c=>c.map(x=>Number(x).toFixed(6)).join(',');
function routeClear(){
 if(routeWatch!==null){navigator.geolocation.clearWatch(routeWatch);routeWatch=null}
 routeSteps=[];routeCurrent=null;$('#route-turn-card').hidden=true;
 if(routeAbort)routeAbort.abort();routeAbort=null;routeSequence++;
 for(const id of ['mazo-route-line'])if(map.getLayer(id))map.removeLayer(id);
 if(map.getSource('mazo-route'))map.removeSource('mazo-route');
 routePickupMarker?.remove();routeDestinationMarker?.remove();
 routePickupMarker=routeDestinationMarker=null;routeLine=null;
}
function routeDraw(){
 if(!routeLine||!map.getStyle()?.layers)return;
 if(!map.getSource('mazo-route'))map.addSource('mazo-route',{type:'geojson',data:routeLine});
 else map.getSource('mazo-route').setData(routeLine);
 if(!map.getLayer('mazo-route-line'))map.addLayer({id:'mazo-route-line',type:'line',source:'mazo-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#2563eb','line-width':6,'line-opacity':0.9}});
}
map.on('style.load',()=>{if(!routePanel.hidden)routeDraw()});
function routeMarkers(){
 routePickupMarker?.remove();routeDestinationMarker?.remove();
 if(routePickup)routePickupMarker=new maplibregl.Marker({color:'#16a34a'}).setLngLat(routePickup).addTo(map);
 if(routeDestination)routeDestinationMarker=new maplibregl.Marker({color:'#dc2626'}).setLngLat(routeDestination).addTo(map);
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
 // Distinct public OSRM profiles; walking/cycling do not silently fall back to driving.
 const base=profile==='driving'?'https://router.project-osrm.org/route/v1/driving/':profile==='foot'?'https://routing.openstreetmap.de/routed-foot/route/v1/driving/':'https://routing.openstreetmap.de/routed-bike/route/v1/driving/';
 const url=base+routeCoord(routePickup)+';'+routeCoord(routeDestination)+'?overview=full&geometries=geojson&steps=true';
 try{
  const res=await fetch(url,{signal:controller.signal});
  if(!res.ok)throw Error('Routing service returned '+res.status);
  const data=await res.json();if(sequence!==routeSequence)return;
  const route=data.routes?.[0];if(data.code!=='Ok'||!route?.geometry?.coordinates?.length)throw Error('No connected route found.');
  routeLine={type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:route.geometry}]};routeDraw();routeMarkers();
  const km=(route.distance/1000).toFixed(route.distance<1000?2:1);
  const mins=Math.max(1,Math.round(route.duration/60));
  $('#route-summary').textContent=km+' km · about '+mins+' min · '+routeMode;
  routeStatus('Route ready');
  const list=$('#route-steps');routeSteps=[];
  for(const leg of route.legs||[])for(const step of leg.steps||[]){
   const li=document.createElement('li');const m=step.maneuver||{};
   if(Array.isArray(m.location))routeSteps.push({location:m.location,type:m.type||'continue',modifier:m.modifier||'',name:step.name||''});
   const action=(m.modifier?m.modifier+' ':'')+(m.type||'Continue').replace(/_/g,' ');
   li.textContent=action+' '+(step.name?'onto '+step.name:'')+' · '+Math.round(step.distance)+' m';list.append(li);
  }
  routeCurrent=routePickup;routeUpdateTurn();routeStartWatch();
  const b=new maplibregl.LngLatBounds();for(const c of route.geometry.coordinates)b.extend(c);
  map.fitBounds(b,{padding:{top:95,bottom:230,left:35,right:35},maxZoom:17,duration:550});
 }catch(e){if(e.name==='AbortError'||sequence!==routeSequence)return;routeStatus('Unable to calculate route: '+e.message+' Try again or select another pickup.');routeLine=null;routeDraw()}
}
async function routeOpen(place){
 closePlace();routePanel.hidden=false;pickingPickup=false;
 routeClear();$('#route-details').hidden=true;$('#route-expand').setAttribute('aria-expanded','false');routeDestination=[+place.coordinates.longitude,+place.coordinates.latitude];
 $('#route-destination').value=place.name;$('#route-pickup').value='Locating…';
 $('#route-summary').textContent='';$('#route-steps').replaceChildren();
 routeStatus('Requesting your location…');routeMarkers();
 try{
  const coords=await routeLocation();if(routePanel.hidden)return;
  if(!map.getMaxBounds()?.contains(coords)){routeStatus('Your location is outside the current map boundary. Choose a pickup within Kattankudy.');$('#route-pickup').value='Choose pickup on map';return}
  routePickup=coords;$('#route-pickup').value='My location';await routeCalculate();
 }catch(e){routeStatus(e.message);$('#route-pickup').value='Choose pickup on map'}
}
$('#route-expand').onclick=()=>{
 const details=$('#route-details'),open=details.hidden;details.hidden=!open;
 $('#route-expand').setAttribute('aria-expanded',String(open));
 $('#route-expand').textContent=open?'Less':'Details';
 $('#route-steps').hidden=!open;
};
function routeMeters(a,b){
 const rad=Math.PI/180,lat1=a[1]*rad,lat2=b[1]*rad,dlat=(b[1]-a[1])*rad,dlon=(b[0]-a[0])*rad;
 const h=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2;
 return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));
}
function routeUpdateTurn(){
 if(!routeSteps.length||!routeCurrent)return;
 // Choose nearest maneuver ahead by proximity to maneuver points; approximate,
 // not map-matched navigation or authoritative lane guidance.
 let nearest=0,best=Infinity;
 routeSteps.forEach((step,i)=>{const d=routeMeters(routeCurrent,step.location);if(d<best){best=d;nearest=i}});
 const step=routeSteps[Math.min(routeSteps.length-1,nearest+(best<25?1:0))];
 const d=routeMeters(routeCurrent,step.location);
 const action=step.type==='depart'?'Depart':step.type==='arrive'?'Arrive at destination':step.type==='turn'?'Turn '+(step.modifier||''):step.type==='roundabout'?'Enter roundabout':step.type==='new name'?'Continue':step.type.replace(/_/g,' ');
 $('#route-turn-icon').textContent=/left/i.test(action)?'↰':/right/i.test(action)?'↱':step.type==='arrive'?'●':'↑';
 $('#route-turn-title').textContent=action+(step.name?' · '+step.name:'');
 $('#route-turn-distance').textContent=(d<1000?Math.round(d)+' m':(d/1000).toFixed(1)+' km')+' to maneuver · approximate GPS guidance';
 $('#route-turn-card').hidden=false;
}
function routeStartWatch(){
 if(routeWatch!==null){navigator.geolocation.clearWatch(routeWatch);routeWatch=null}
 if(!navigator.geolocation||$('#route-pickup').value!=='My location')return;
 routeWatch=navigator.geolocation.watchPosition(p=>{
  if(routePanel.hidden)return;
  const c=[p.coords.longitude,p.coords.latitude];if(p.coords.accuracy>100)return;
  routeCurrent=c;routeUpdateTurn();
 },()=>{}, {enableHighAccuracy:true,maximumAge:2000,timeout:15000});
}
$('#route-close').onclick=()=>{routePanel.hidden=true;pickingPickup=false;routeClear()};
$('#route-use-location').onclick=async()=>{
 pickingPickup=false;routeStatus('Requesting your location…');
 try{const c=await routeLocation();if(!map.getMaxBounds()?.contains(c))throw Error('Outside Kattankudy map bounds. Choose a pickup on the map.');routePickup=c;$('#route-pickup').value='My location';await routeCalculate()}catch(e){routeStatus(e.message)}
};
$('#route-pick-map').onclick=()=>{pickingPickup=true;routeStatus('Tap a road or point on the map to choose pickup.');};
map.on('click',e=>{
 if(!pickingPickup||routePanel.hidden)return;
 pickingPickup=false;routePickup=[e.lngLat.lng,e.lngLat.lat];
 $('#route-pickup').value=e.lngLat.lat.toFixed(5)+', '+e.lngLat.lng.toFixed(5);
 routeCalculate();
});
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
  if(!sheet.hidden)return;
  const features=map.queryRenderedFeatures([[e.point.x-14,e.point.y-14],[e.point.x+14,e.point.y+14]],{layers:map.getLayer(POI_LAYER)?[POI_LAYER]:[]});
  for(const f of features){const i=Number(f.properties?.index);if(Number.isInteger(i)&&places[i]){openPlace(places[i]);return}}
 });

function refresh(){
 const q=$('#map-search').value.trim().toLowerCase();
 const hits=places.filter(p=>(category==='all'||kind(p)===category)&&[p.name,p.address,...(p.categories||[])].join(' ').toLowerCase().includes(q));
 for(const id of [POI_LAYER])if(map.getLayer(id)){map.setLayoutProperty(id,'visibility',placesVisible?'visible':'none');map.setFilter(id,['in',['get','index'],['literal',hits.map(p=>places.indexOf(p))]])}
 const results=$('#search-results');results.replaceChildren();
 if(q){results.hidden=false;for(const p of hits.slice(0,30)){const b=document.createElement('button');b.type='button';b.textContent=p.name+' · '+(p.address||'');b.style.cssText='display:block;width:100%;padding:10px;text-align:left;border:0;background:transparent;cursor:pointer';b.onclick=()=>{openPlace(p);results.hidden=true};results.append(b)}}else results.hidden=true;
 // Search results remain available; no persistent place-count overlay.

}
map.on('click',POI_LAYER,e=>{const i=Number(e.features?.[0]?.properties?.index);if(Number.isInteger(i)&&places[i])openPlace(places[i])});
map.on('mouseenter',POI_LAYER,()=>map.getCanvas().style.cursor='pointer');
map.on('mouseleave',POI_LAYER,()=>map.getCanvas().style.cursor='');
async function roads(){try{const r=await fetch('./data/roads/kattankudy.json');if(!r.ok)return;const data=await r.json();const features=(data.roads||[]).filter(x=>x.coordinates?.length>1).map(x=>({type:'Feature',properties:{name:x.name||''},geometry:{type:'LineString',coordinates:x.coordinates}}));if(map.getSource('mazo-roads'))return;map.addSource('mazo-roads',{type:'geojson',data:{type:'FeatureCollection',features}});map.addLayer({id:'mazo-road-lines',type:'line',source:'mazo-roads',paint:{'line-color':'#f8f9fa','line-width':['interpolate',['linear'],['zoom'],11,2,16,9]}});map.addLayer({id:'mazo-road-names',type:'symbol',source:'mazo-roads',minzoom:13,filter:['!=',['get','name'],''],layout:{'symbol-placement':'line','text-field':['get','name'],'text-size':12},paint:{'text-color':'#46515b','text-halo-color':'#fff','text-halo-width':2}});for(const id of ['mazo-road-lines','mazo-road-names'])map.setLayoutProperty(id,'visibility',roadsVisible?'visible':'none')}catch(e){console.warn(e)}}


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
async function loadSpeedReviews(){
 try{
  const [sr,rr]=await Promise.all([fetch('./data/speed-limits/kattankudy.json'),fetch('./data/roads/kattankudy.json')]);
  if(!sr.ok||!rr.ok)return;
  const speed=await sr.json(),roadData=await rr.json();
  const byId=new Map((roadData.roads||[]).map(road=>[road.id,road]));
  const seen=new Set(),features=[];
  for(const record of speed.segments||[]){
   const road=byId.get(record.road_id),coords=road?.coordinates;
   if(!coords||coords.length<2)continue;
   const midpoint=coords[Math.floor(coords.length/2)];
   if(!midpoint||!midpoint.every(Number.isFinite))continue;
   const key=Math.round(midpoint[0]*800)+'/'+Math.round(midpoint[1]*800);
   if(seen.has(key))continue;seen.add(key);
   features.push({type:'Feature',geometry:{type:'Point',coordinates:midpoint},properties:{
    road:record.road_name||'Unnamed road',status:'Legal default candidate — unverified',
    candidate:record.legal_default_candidate_kmh??'',road_id:record.road_id}});
  }
  speedReviewFeatures=features;ensureSpeedReview();
 }catch(e){console.warn('Speed-limit reviews unavailable:',e)}
}
map.on('click',SPEED_LAYER,e=>{
 const f=e.features?.[0];if(!f)return;
 const p=f.properties||{};
 new maplibregl.Popup({offset:18,maxWidth:'280px'}).setLngLat(f.geometry.coordinates)
  .setDOMContent((()=>{
   const box=document.createElement('div');
   const heading=document.createElement('strong');heading.textContent='70 km/h · Legal default candidate';
   const detail=document.createElement('p');detail.textContent=p.road+' — 70 km/h is the general non-built-up motor-vehicle limit in the 2012 Gazette, shown here as a provisional default. This road has not been individually classified or verified; A04 scheduled built-up sections have different limits.';
   const note=document.createElement('small');note.textContent='Provisional map data only — not a verified posted sign or safe driving-speed recommendation. Vehicle-specific limits and local restrictions may differ.';
   box.append(heading,detail,note);return box;
  })()).addTo(map);
});
map.on('mouseenter',SPEED_LAYER,()=>map.getCanvas().style.cursor='pointer');
map.on('mouseleave',SPEED_LAYER,()=>map.getCanvas().style.cursor='');

// Preserve the vector basemap: roads, city labels and road names remain visible.
// Only provider POI icons/labels are suppressed, so our own JSON supplies businesses.
map.on('style.load',()=>{try{for(const layer of map.getStyle().layers||[]){if(layer.type==='symbol' && !layer.id.startsWith('mazo-') && /poi|place|shop|restaurant|hospital|school|transit|airport|park/i.test(layer.id) && !/road|street|city|town|village|country|state|water|marine/i.test(layer.id))map.setLayoutProperty(layer.id,'visibility','none')}ensurePoiLayer();ensureSpeedReview()}catch(error){console.error('Map layer initialization:',error)}});
(async()=>{try{const data=(await Promise.all(datasets.map(async f=>{try{const r=await fetch('./'+f);if(!r.ok)throw Error(f+' '+r.status);return await r.json()}catch(e){console.warn('Dataset skipped:',f,e);return null}}))).filter(Boolean);const seen=new Set();for(const file of data)for(const p of file.results||[]){if(!p?.name||!Number.isFinite(+p.coordinates?.latitude)||!Number.isFinite(+p.coordinates?.longitude))continue;const k=p.name.trim().toLowerCase()+'|'+(+p.coordinates.latitude).toFixed(5)+'|'+(+p.coordinates.longitude).toFixed(5);if(!seen.has(k)&&inArea(p)){seen.add(k);places.push(p)}}try{ensurePoiLayer()}catch(error){console.warn('Native POI initialization:',error)}refresh();}catch(e){console.error('Dataset error:',e)}})();
$('#map-search').addEventListener('input',refresh);$('#search-form').onsubmit=e=>{e.preventDefault();refresh()};
document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));refresh()});
$('#theme-toggle').onclick=()=>{const dark=document.documentElement.dataset.theme!=='dark';document.documentElement.dataset.theme=dark?'dark':'light';$('#theme-toggle').setAttribute('aria-pressed',String(dark));try{localStorage.setItem('mazo-maps-theme',dark?'dark':'light')}catch{};map.setStyle(styles[dark?'dark':'light']);};
const locateButton=$('#map-locate');
let locationMarker=null;
locateButton.onclick=()=>{
 if(!navigator.geolocation){alert('Location is not supported by this browser.');return}
 locateButton.disabled=true;locateButton.setAttribute('aria-busy','true');
 navigator.geolocation.getCurrentPosition(position=>{
  locateButton.disabled=false;locateButton.setAttribute('aria-busy','false');
  const coords=[position.coords.longitude,position.coords.latitude];
  if(locationMarker)locationMarker.remove();
  const dot=document.createElement('div');dot.className='user-location-dot';dot.setAttribute('aria-label','Your current location');
  locationMarker=new maplibregl.Marker({element:dot,anchor:'center'}).setLngLat(coords).addTo(map);
  // The map is intentionally Kattankudy-only. Outside it, report the actual position rather than silently clamping.
  const bounds=map.getMaxBounds();
  if(bounds&&!bounds.contains(coords)){alert('Your location is outside the current Kattankudy map boundary.');return}
  map.flyTo({center:coords,zoom:Math.max(map.getZoom(),16),duration:750});
 },error=>{
  locateButton.disabled=false;locateButton.setAttribute('aria-busy','false');
  const reason=error.code===1?'Location permission denied. Enable location access for this site.':error.code===2?'Unable to determine your location. Check GPS and connectivity.':'Location request timed out. Please try again.';
  alert(reason);
 },{enableHighAccuracy:true,timeout:12000,maximumAge:10000});
};
async function cities(){try{const r=await fetch('./data/cities.json');if(!r.ok)return;const d=await r.json();const features=(d.cities||[]).filter(c=>Number.isFinite(+c.coordinates?.longitude)&&Number.isFinite(+c.coordinates?.latitude)).map(c=>({type:'Feature',geometry:{type:'Point',coordinates:[+c.coordinates.longitude,+c.coordinates.latitude]},properties:{name:c.name||'',level:c.level||'city'}}));if(map.getSource('mazo-cities'))return;map.addSource('mazo-cities',{type:'geojson',data:{type:'FeatureCollection',features}});map.addLayer({id:'mazo-city-labels',type:'symbol',source:'mazo-cities',layout:{'text-field':['get','name'],'text-size':['interpolate',['linear'],['zoom'],5,11,13,17],'text-allow-overlap':false},paint:{'text-color':theme()==='dark'?'#e8edf4':'#27313b','text-halo-color':theme()==='dark'?'#161b22':'#fff','text-halo-width':2}})}catch(e){console.warn('City labels:',e)}}

loadSpeedReviews();
map.on('load',()=>{$('#map-frame').dataset.state='ready';try{ensurePoiLayer()}catch(e){console.warn('POI on load:',e)}});
map.on('error',event=>console.error('MapLibre:',event.error));
