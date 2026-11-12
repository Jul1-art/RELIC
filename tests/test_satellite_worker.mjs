import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {twoline2satrec} from '../vendor/satellite/satellite.es.js';
import {propagatePosition,COVERAGE_MS} from '../src/satellites/orbits.js';
import {propagateSnapshot} from '../src/satellites/propagation-worker.js';
const at=Date.parse('2026-11-12T12:00:00Z');
const satrec=()=>twoline2satrec('1 25544U 98067A   26315.85209532  .00008096  00000+0  15318-3 0  9994','2 25544  51.6324 289.3631 0007314  15.2015 344.9192 15.49321770594643');
test('worker positions match the existing SGP4 pipeline and expire outside coverage',()=>{
 const rec=satrec(),expected=propagatePosition(rec,new Date(at));const result=propagateSnapshot([{satrec:satrec(),epoch:at},{satrec:satrec(),epoch:at-COVERAGE_MS-1}],at);
 assert.equal(result.length,16);assert.ok(Math.abs(result[0]-expected.x)<1e-6);assert.equal(result[7],at);assert.ok(Number.isNaN(result[8]));
});
test('a real background worker returns all 16000 satellite positions in one transferable snapshot',async t=>{
 const url=new URL('../src/satellites/propagation-worker.js',import.meta.url).href;
 const bootstrap=`const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:(value,transfer)=>parentPort.postMessage(value,transfer)};import(${JSON.stringify(url)}).then(()=>{parentPort.on('message',data=>self.onmessage({data}));parentPort.postMessage('ready');});`;
 const worker=new Worker(bootstrap,{eval:true});t.after(()=>worker.terminate());await once(worker,'message');
 const rows=Array.from({length:16000},()=>({satrec:satrec(),epoch:at}));
 worker.postMessage({type:'catalog',revision:7,rows});worker.postMessage({type:'sample',revision:7,at});
 const [snapshot]=await once(worker,'message');assert.equal(snapshot.revision,7);assert.equal(snapshot.data.length,16000*8);assert.ok(Number.isFinite(snapshot.data.at(-8)));assert.equal(snapshot.data.at(-1),at);
});
