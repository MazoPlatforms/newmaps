import test from 'node:test';
import assert from 'node:assert/strict';
import { readR2PmtilesRange } from '../src/pmtiles-r2.mjs';
test('R2 chunk reads transfer only requested bytes, including across chunk boundaries', async () => {
 const size=1048576, calls=[];
 const files={'generated/places.pmtiles':{storage:'r2-archive',bytes:size*2}};
 for(let i=0;i<2;i++)files[`generated/places-pmtiles-chunks/${String(i).padStart(5,'0')}.bin`]={storage:'r2-chunk',bytes:size,sha256:String(i).repeat(64)};
 const env={DATA_BUCKET:{get:async(key,{range})=>{
  calls.push(range);const [path,entry]=Object.entries(files).find(([,e])=>e.sha256&&key.includes(e.sha256));
  return {size,customMetadata:{path,sha256:entry.sha256},body:new Blob([new Uint8Array(range.length).fill(Number(entry.sha256[0])+1)]).stream()};
 }}};
 const result=await readR2PmtilesRange({env,manifest:{files},archivePath:'generated/places.pmtiles',offset:size-16,length:48,chunkSize:size,totalBytes:size*2});
 assert.deepEqual(calls,[{offset:size-16,length:16},{offset:0,length:32}]);
 assert.equal(result.length,48);assert.deepEqual([...result],[...Array(16).fill(1),...Array(32).fill(2)]);
 console.log(JSON.stringify({benchmark:'48-byte boundary range',previousTransferredBytes:size*2,transferredBytes:calls.reduce((n,r)=>n+r.length,0)}));
});
