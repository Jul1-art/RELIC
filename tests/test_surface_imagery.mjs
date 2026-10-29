import test from 'node:test';
import assert from 'node:assert/strict';
import {SURFACE_SOURCES as sources,chooseSurfaceSource,surfaceMatrix,surfaceLevel} from '../src/atlas/surface-imagery.js';
import {SurfaceTileCache} from '../src/atlas/surface-tile-cache.js';
const turn=()=>new Promise(resolve=>setTimeout(resolve,0));

test('close Earth and Mars views use detailed imagery; polar and distant views keep global coverage',()=>{
  assert.equal(chooseSurfaceSource('earth',{altitudeRatio:.01,latitude:48,longitude:2}),sources.earthDetail);
  assert.equal(chooseSurfaceSource('earth',{altitudeRatio:.01,latitude:86,longitude:2}),sources.earth);
  assert.equal(chooseSurfaceSource('earth',{altitudeRatio:.3,latitude:48,longitude:2}),sources.earth);
  assert.equal(chooseSurfaceSource('mars',{altitudeRatio:.01,latitude:0,longitude:0}),sources.marsDetail);
  assert.equal(chooseSurfaceSource('mars',{altitudeRatio:.001,latitude:18.48,longitude:77.40}),sources.jezero);
  assert.equal(chooseSurfaceSource('moon',{altitudeRatio:.001,latitude:.68,longitude:23.48}),sources.apollo11);
  assert.equal(chooseSurfaceSource('moon',{altitudeRatio:.001,latitude:40,longitude:-100}),sources.moon);
});
test('source tiling and native-resolution caps are retained at deep zoom',()=>{
  assert.deepEqual(surfaceMatrix(sources.marsDetail,2),{columns:8,rows:4});
  assert.deepEqual(surfaceMatrix(sources.earthDetail,2),{columns:4,rows:4});
  const view={radius:1,altitude:1e-8,latitude:0,fov:40,viewportHeight:900,pixelRatio:2};
  assert.equal(surfaceLevel(sources.marsDetail,view),12);
  assert.equal(surfaceLevel(sources.earthDetail,view),19);
  assert.equal(surfaceLevel(sources.moon,view),8);
});
test('tile requests coalesce and never exceed the network concurrency budget',async()=>{
  const pending=[],urls=[];let active=0,peak=0;
  const cache=new SurfaceTileCache({concurrency:2,load:url=>{urls.push(url);active++;peak=Math.max(peak,active);return new Promise(resolve=>pending.push(()=>{active--;resolve({dispose(){}});}));}});
  const promises=Array.from({length:7},(_,i)=>cache.request(String(i),'tile/'+i));
  assert.equal(cache.request('0','tile/0'),promises[0]);await turn();assert.equal(urls.length,2);
  while(pending.length){pending.splice(0).forEach(resolve=>resolve());await turn();}
  await Promise.all(promises);assert.equal(peak,2);assert.equal(urls.length,7);cache.dispose();
});
test('superseded queued tiles are dropped before downloading',async()=>{
  const urls=[];let release;
  const cache=new SurfaceTileCache({concurrency:1,load:url=>{urls.push(url);return new Promise(resolve=>{release=resolve;});}});
  const first=cache.request('a','tile/a'),stale=cache.request('b','tile/b');const rejected=assert.rejects(stale,{name:'AbortError'});
  cache.setWanted(['a']);await rejected;await turn();release({dispose(){}});await first;await turn();assert.deepEqual(urls,['tile/a']);cache.dispose();
});
test('failed tiles cool down while pinned visible textures survive LRU cleanup',async()=>{
  let now=0,calls=0;const disposed=[];
  const cache=new SurfaceTileCache({maxEntries:2,retryMs:100,now:()=>now,load:async url=>{calls++;if(url==='fail'&&calls===1)throw new Error('offline');return{dispose(){disposed.push(url);}};}});
  await assert.rejects(cache.request('f','fail'));await turn();await assert.rejects(cache.request('f','fail'));assert.equal(calls,1);
  now=101;await cache.request('f','fail');await turn();assert.equal(calls,2);
  cache.setWanted(['f'],['f']);now++;await cache.request('b','b');await turn();now++;await cache.request('c','c');await turn();
  assert.equal(cache.entries.has('f'),true);assert.equal(cache.entries.has('b'),false);assert.deepEqual(disposed,['b']);cache.dispose();
});
