import test from 'node:test';
import assert from 'node:assert/strict';
import {twoline2satrec,gstime,eciToGeodetic,propagate,geodeticToEcf} from '../vendor/satellite/satellite.es.js';
import {propagatePosition,computeOrbitPath,orbitRotation,orbitalPeriodSeconds} from '../src/satellites/orbits.js';
import {parseCatalog,mergeCatalogGroups,createSatelliteCatalog,GROUPS,REFRESH_MS} from '../src/satellites/catalog.js';
const tle=`ISS (ZARYA)
1 25544U 98067A   26315.85209532  .00008096  00000+0  15318-3 0  9994
2 25544  51.6324 289.3631 0007314  15.2015 344.9192 15.49321770594643`;
const [name,l1,l2]=tle.split('\n'),date=new Date('2026-11-12T12:00:00Z'),now=()=>date.getTime();
const record=()=>twoline2satrec(l1,l2);
test('ISS position uses the same epoch, GMST and kilometre-to-metre conversion as GEV',()=>{
 const sat=record(),position=propagatePosition(sat,date),state=propagate(record(),date),geo=eciToGeodetic(state.position,gstime(date)),fixed=geodeticToEcf(geo);
 assert.ok(position);for(const axis of ['x','y','z'])assert.ok(Math.abs(position[axis]-fixed[axis]*1000)<1e-6);
 assert.ok(position.altitude>300000&&position.altitude<500000);assert.ok(position.speedMps>7000&&position.speedMps<8000);
 const later=propagatePosition(sat,new Date(now()+1000));assert.ok(Math.hypot(later.x-position.x,later.y-position.y,later.z-position.z)>6000);
});
test('orbital path bakes with fixed GMST and realigns to current Earth rotation without rebuilding',()=>{
 const sat=record(),path=computeOrbitPath(sat,date),p=propagatePosition(sat,date);
 assert.equal(path.points.length,181);assert.equal(path.gmstAtBake,gstime(date));
 assert.ok(Math.hypot(path.points[0].x-p.x,path.points[0].y-p.y,path.points[0].z-p.z)<1e-6);
 assert.ok(orbitalPeriodSeconds(sat)>5500&&orbitalPeriodSeconds(sat)<5700);
 const later=new Date(now()+600000);assert.ok(Math.abs(orbitRotation(path.gmstAtBake,later)+(gstime(later)-gstime(date)))<1e-12);
 assert.ok(orbitRotation(path.gmstAtBake,later)<0);
});
test('malformed and expired elements are skipped, and ISS keeps the station classification',()=>{
 assert.equal(parseCatalog('<html>error</html>','active',now()).length,0);
 assert.equal(parseCatalog(tle,'stations',now()+15*86400000).length,0);
 const rows=parseCatalog(tle,'stations',now());assert.equal(rows.length,1);assert.equal(rows[0].id,25544);assert.equal(rows[0].satelliteClass,'stations');
 const malformed=tle.replace('2 25544','2 12345');assert.equal(parseCatalog(malformed,'active',now()).length,0);
});
test('duplicate NORAD identifiers retain their more specific group and Starlink is not truncated',()=>{
 const stations=parseCatalog(tle,'stations',now()),active=parseCatalog(tle,'active',now());
 const merged=mergeCatalogGroups([{group:'active',records:active},{group:'stations',records:stations}]);
 assert.equal(merged.size,1);assert.equal(merged.get(25544).group,'stations');assert.ok(GROUPS.includes('active'));
});
function memoryCache(){const data=new Map();return {async match(key){return data.get(String(key))?.clone();},async put(key,value){data.set(String(key),value.clone());}};}
test('catalogue loads without credentials, deduplicates groups, and reuses its six-hour browser cache',async()=>{
 const cache=memoryCache();let calls=0,last;
 const options={now,cacheStorage:{open:async()=>cache},fetchImpl:async(url,options)=>{calls++;assert.equal(options.credentials,'same-origin');return new Response(tle);},onChange:value=>last=value};
 const catalog=createSatelliteCatalog(options);await catalog.refresh();assert.equal(catalog.records.size,1);assert.equal(last.status,'ready');assert.equal(calls,GROUPS.length);catalog.dispose();
 const second=createSatelliteCatalog(options);await second.refresh();assert.equal(calls,GROUPS.length);second.dispose();
});
test('provider errors are reported and last cached TLEs are marked stale',async()=>{
 const cache=memoryCache();for(const group of GROUPS)await cache.put(new URL(`../api/celestrak/${group}`,import.meta.url).href,new Response(tle,{headers:{'X-TLE-Fetched-Ms':String(now()-REFRESH_MS-1)}}));
 let status;const catalog=createSatelliteCatalog({now,cacheStorage:{open:async()=>cache},fetchImpl:async()=>new Response('',{status:503}),onChange:value=>status=value.status});
 await catalog.refresh();assert.equal(status,'stale');assert.equal(catalog.records.size,1);catalog.dispose();
});
test('disposal aborts requests and prevents late catalogue publication',async()=>{
 let signal,updates=0;const catalog=createSatelliteCatalog({now,cacheStorage:null,fetchImpl:async(url,options)=>{signal=options.signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));},onChange:()=>updates++});
 const pending=catalog.refresh();await new Promise(resolve=>setTimeout(resolve,0));const beforeDispose=updates;catalog.dispose();await pending;assert.equal(signal.aborted,true);assert.equal(updates,beforeDispose);
});

test('a failed complete feed never replaces valid full coverage with only the Starlink subset',async()=>{
 let time=+date,failed=false,state;
 const starlink=tle.replace('ISS (ZARYA)','STARLINK-TEST').replaceAll('25544','45544');
 const science=tle.replace('ISS (ZARYA)','SCIENCE-TEST').replaceAll('25544','55544');
 const catalog=createSatelliteCatalog({now:()=>time,cacheStorage:null,onChange:value=>state=value,fetchImpl:async url=>{
  const group=String(url).split('/').pop();
  if(group==='active')return failed?new Response('',{status:503,headers:{'Retry-After':'120'}}):new Response([tle,starlink,science].join('\n'));
  return new Response(group==='starlink'?starlink:tle);
 }});
 await catalog.refresh();assert.equal(catalog.records.size,3);assert.equal(state.sources.find(source=>source.id==='active').status,'ready');
 failed=true;time+=3600000;await catalog.refresh();
 assert.equal(catalog.records.size,3);assert.ok(catalog.records.has(55544));assert.equal(catalog.status,'partial');
 assert.equal(state.sources.find(source=>source.id==='active').status,'retained');assert.equal(catalog.nextRetryAt,time+120000);
 time+=15*86400000;await catalog.refresh();assert.equal(catalog.records.size,0,'expired elements are not retained as current positions');
 catalog.dispose();
});
