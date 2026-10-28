import assert from 'node:assert/strict';
import { createReadStream, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const types = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.mzp':'application/geo+json','.pmtiles':'application/vnd.pmtiles' };
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (file !== root && !file.startsWith(`${root}${sep}`)) { response.writeHead(403).end(); return; }
  let size; try { size = statSync(file).size; } catch { response.writeHead(404).end(); return; }
  const headers = { 'Access-Control-Allow-Origin':'*','Accept-Ranges':'bytes','Cache-Control':'public, max-age=600','Content-Type':types[extname(file)]||'application/octet-stream' };
  const range = request.headers.range;
  if (!range && ['.html','.js','.mjs','.css','.json','.mzp'].includes(extname(file)) && /\bgzip\b/.test(request.headers['accept-encoding']||'')) {
    const zipped = gzipSync(readFileSync(file)); headers['Content-Encoding']='gzip';headers.Vary='Accept-Encoding';headers['Content-Length']=zipped.length;response.writeHead(200,headers);response.end(zipped);return;
  }
  if (range) { const match=/^bytes=(\d+)-(\d*)$/.exec(range);if(!match){response.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}const start=Number(match[1]),end=Math.min(match[2]?Number(match[2]):size-1,size-1);if(start>=size||end<start){response.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}headers['Content-Range']=`bytes ${start}-${end}/${size}`;headers['Content-Length']=end-start+1;response.writeHead(206,headers);createReadStream(file,{start,end}).pipe(response);return; }
  headers['Content-Length']=size;response.writeHead(200,headers);createReadStream(file).pipe(response);
});
const results=[];
await new Promise((resolveListen)=>server.listen(0,'127.0.0.1',resolveListen));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--js-flags=--expose-gc']});
const waitReady=(page)=>page.waitForFunction(()=>window.__MAZO_MAP_TEST__?.isStyleLoaded()&&document.querySelector('#map-frame')?.dataset.state==='ready',null,{timeout:45000});
async function measure(page,context,journey){
  const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:60,downloadThroughput:655360,uploadThroughput:131072,connectionType:'cellular3g'});
  const requests=[],ranges=[];page.on('request',request=>requests.push(request.url()));page.on('response',response=>{if(response.url().includes('places.pmtiles'))ranges.push({status:response.status(),bytes:Number(response.headers()['content-length']||0)});});
  const started=Date.now();await page.goto(`${origin}/?map-test=1`,{waitUntil:'domcontentloaded'});console.error('Document loaded; waiting for map readiness');await waitReady(page);console.error('Map ready');await page.evaluate(()=>new Promise(resolve=>{window.__MAZO_MAP_TEST__.jumpTo({center:[81.73,7.68],zoom:12,bearing:0,pitch:0});requestAnimationFrame(()=>requestAnimationFrame(resolve))}));
  const startupMs=Date.now()-started;
  const perf=await page.evaluate(()=>{const entries=performance.getEntriesByType('resource');return {transferBytes:entries.reduce((sum,e)=>sum+e.transferSize,0),cachedResourceCount:entries.filter(e=>e.transferSize===0).length,pmtilesRangeNetworkTransferBytes:entries.filter(e=>e.name.includes('/generated/places.pmtiles')).reduce((sum,e)=>sum+e.transferSize,0)}});
  const interactionStarted=Date.now();
  const categoryButton=page.locator('.categories button').filter({hasText:/Electronics/i}).first();await categoryButton.click();
  await page.locator('#map-search').fill('Noor Accessories Showroom');await page.waitForSelector('#search-results [role="option"]');await page.locator('#search-results [role="option"]').first().click();await page.waitForSelector('#place-sheet:not([hidden])');
  const searchAndDetailsMs=Date.now()-interactionStarted;
  await page.evaluate(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(_success,failure){failure({code:1})},watchPosition(){return 1},clearWatch(){}}}));
  await page.route('**/route/v1/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:'Ok',routes:[{distance:1200,duration:240,geometry:{type:'LineString',coordinates:[[81.72,7.68],[81.73,7.68]]},legs:[{steps:[{distance:1200,name:'Test Road',maneuver:{type:'depart',location:[81.72,7.68]}}]}]}],waypoints:[{location:[81.72,7.68],distance:0},{location:[81.73,7.68],distance:0}]})}));
  const directionsStarted=Date.now();await page.locator('#place-directions').click();await page.waitForFunction(()=>!document.querySelector('#route-details').hidden);await page.locator('#route-pick-on-map').click();const point=await page.evaluate(()=>window.__MAZO_MAP_TEST__.project(window.__MAZO_MAP_TEST__.getCenter().toArray()));await page.mouse.click(point.x,point.y);await page.waitForFunction(()=>/(?:Local|Online) route ready/.test(document.querySelector('#route-status').innerText),null,{timeout:30000});const directionsMs=Date.now()-directionsStarted;
  const cdpHeap=await context.newCDPSession(page);await cdpHeap.send('HeapProfiler.collectGarbage');const heap=await cdpHeap.send('Runtime.getHeapUsage');await cdpHeap.detach();
  const frames=await page.evaluate(()=>new Promise(resolveFrame=>{let prior=performance.now(),start=prior;const durations=[];const tick=now=>{durations.push(now-prior);prior=now;if(now-start<1000)requestAnimationFrame(tick);else{durations.sort((a,b)=>a-b);resolveFrame({p50:durations[Math.floor(durations.length*.5)]||0,p95:durations[Math.floor(durations.length*.95)]||0,max:durations.at(-1)||0,samples:durations.length})}};window.__MAZO_MAP_TEST__.easeTo({center:[81.69,7.72],zoom:14,duration:900,bearing:0,pitch:0});requestAnimationFrame(tick)}));
  await cdp.detach();return { journey, startupMs, searchAndDetailsMs, directionsMs, ...perf, postGcHeapBytes:heap.usedSize, frameIntervalsMs:frames, requests:requests.length, pmtilesRangeResponses:ranges.length, pmtilesRangeResponseBodyBytes:ranges.reduce((sum,row)=>sum+row.bytes,0), pmtilesStatuses:[...new Set(ranges.map(row=>row.status))] };
}
try{
 for(const profile of [{name:'desktop',viewport:{width:1280,height:800},isMobile:false},{name:'android-chrome-emulation',viewport:{width:390,height:844},isMobile:true}]){
  for(let run=0;run<Number(process.env.MAZO_BENCH_REPETITIONS||3);run++){
   console.error(`Benchmarking ${profile.name} run ${run+1}`);
   const context=await browser.newContext({...profile,deviceScaleFactor:1,hasTouch:profile.isMobile});
   const cold=await context.newPage();results.push({profile:profile.name,run,...await measure(cold,context,'cold')});await cold.close();
   const warm=await context.newPage();results.push({profile:profile.name,run,...await measure(warm,context,'warm')});
   await context.close();
  }
 }
}finally{await browser.close();server.close();}
const summary={};for(const profile of ['desktop','android-chrome-emulation']){summary[profile]={};for(const journey of ['cold','warm']){const rows=results.filter(row=>row.profile===profile&&row.journey===journey);const median=key=>{const values=rows.map(row=>key.split('.').reduce((value,part)=>value?.[part],row)).sort((a,b)=>a-b);return values[Math.floor(values.length/2)]};summary[profile][journey]={runs:rows.length,startupMsMedian:median('startupMs'),searchAndDetailsMsMedian:median('searchAndDetailsMs'),directionsMsMedian:median('directionsMs'),transferBytesMedian:median('transferBytes'),postGcHeapBytesMedian:median('postGcHeapBytes'),requestCountMedian:median('requests'),pmtilesRangeNetworkTransferBytesMedian:median('pmtilesRangeNetworkTransferBytes'),frameP95MsMedian:median('frameIntervalsMs.p95')};}}
const report={generatedAt:new Date().toISOString(),browser:`Chromium ${browser.version()}`,renderer:'Headless Chromium with SwiftShader; not a physical device',network:{latencyMs:60,downloadBps:655360,uploadBps:131072},cold:'Fresh browser context; CDN may have a warm edge cache.',warm:'Same context, second page navigation; browser HTTP cache retained.',journeys:['map readiness','viewport pan/zoom','category filtering','name search','place details','directions','forced-GC heap','frame interval sampling'],summary,results};
const output=resolve(process.env.MAZO_BENCH_OUTPUT||'reports/phase12-14-browser-benchmark.json');writeFileSync(output,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify(report,null,2));
