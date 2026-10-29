import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {hasMeanOrbit,relativePositionKm,sampleOrbitKm,planetPoleScene} from '../src/atlas/moon-data.js';
const catalog=JSON.parse(await readFile(new URL('../assets/data/natural-satellites.json',import.meta.url),'utf8'));
test('the JPL catalogue covers every planet and keeps its documented data gap explicit',()=>{
 assert.equal(catalog.coverage.planetaryTotal,456);assert.equal(catalog.coverage.meanOrbits,460);
 assert.deepEqual(catalog.coverage.byParent,{earth:1,mars:2,jupiter:115,saturn:293,uranus:29,neptune:16,pluto:5});
 assert.equal(new Set(catalog.satellites.map(r=>r.id)).size,461);
 const gap=catalog.satellites.find(r=>r.id==='s-2009-s-1');assert.equal(gap.orbitQuality,'unavailable');assert.equal(gap.aKm,null);
 assert.equal(catalog.satellites.filter(hasMeanOrbit).length,460);
});
test('all mean ellipses stay finite and within their source periapsis/apapsis in each reference plane',()=>{
 for(const row of catalog.satellites.filter(hasMeanOrbit)){
  const orbit=sampleOrbitKm(row,64);assert.equal(orbit.length,65);
  for(const p of orbit){const r=Math.hypot(p.x,p.y,p.z);assert(Number.isFinite(r),row.name);assert(r>=row.aKm*(1-row.e)-1e-5,row.name);assert(r<=row.aKm*(1+row.e)+1e-5,row.name);}
  const position=relativePositionKm(row,new Date('2026-10-29T00:00:00Z'));assert(Number.isFinite(position.x+position.y+position.z),row.name);
 }
});
test('mean-orbit phase is periodic and returns no invented orbit for missing data',()=>{
 const moon=catalog.satellites.find(r=>r.id==='moon'),date=new Date('2026-10-29T00:00:00Z');
 const a=relativePositionKm(moon,date),b=relativePositionKm(moon,new Date(+date+moon.periodDays*86400000));
 assert(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<.01);
 assert.equal(relativePositionKm(catalog.satellites.find(r=>r.id==='s-2009-s-1'),date),null);
});
test('the Uranian equator is nearly upright and all reference poles are unit vectors',()=>{
 for(const parent of ['earth','mars','jupiter','saturn','uranus','neptune']){const p=planetPoleScene(parent);assert(Math.abs(Math.hypot(p.x,p.y,p.z)-1)<1e-12);}
 assert(Math.abs(planetPoleScene('uranus').y)<.2);
});
