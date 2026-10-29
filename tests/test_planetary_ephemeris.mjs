import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PLANET_IDS,interpolatePlanetState,osculatingOrbit,validatePlanetCatalogue,createPlanetaryEphemeris} from '../src/atlas/planetary-ephemeris.js';

const catalogue=JSON.parse(await readFile(new URL('../assets/ephemeris/planets-horizons.json',import.meta.url),'utf8'));
const dateFromJD=jd=>new Date((jd-2440587.5)*86400000);
const difference=(a,b)=>Math.hypot(...['x','y','z'].map((axis,index)=>a[axis]-b[index]));

test('all eight true planet centres use explicit UTC heliocentric J2000 Horizons states',()=>{
 assert(validatePlanetCatalogue(catalogue));
 for(const id of PLANET_IDS){
  const entry=catalogue.bodies[id];assert.match(entry.solution,/source:/);
  assert.equal(entry.target,String((PLANET_IDS.indexOf(id)+1)*100+99));
  const first=entry.states[0],last=entry.states.at(-1);
  assert.equal(Number(dateFromJD(first[0])),Date.parse(catalogue.start));
  assert.equal(Number(dateFromJD(last[0])),Date.parse(catalogue.stop));
  for(const row of [first,last]){
   const state=interpolatePlanetState(entry,dateFromJD(row[0]));
   assert(difference(state.positionKm,row.slice(1,4))<.00001);
   assert(difference(state.velocityKmS,row.slice(4,7).map(v=>v/86400))<1e-9);
  }
  assert.equal(interpolatePlanetState(entry,dateFromJD(first[0]-.0001)),null);
  assert.equal(interpolatePlanetState(entry,dateFromJD(last[0]+.0001)),null);
 }
 const tdb={...catalogue,timeScale:'TDB'};assert.equal(validatePlanetCatalogue(tdb),false);
 const unitMismatch={...catalogue,units:{...catalogue.units,velocity:'km/s'}};assert.equal(validatePlanetCatalogue(unitMismatch),false);
});

test('interpolation agrees with 160 independent NASA midpoint outputs, separate from stored samples',()=>{
 const errors={};
 for(const id of PLANET_IDS){
  const entry=catalogue.bodies[id];assert.equal(entry.validationStates.length,20);
  let maxPosition=0,maxVelocity=0;
  for(const reference of entry.validationStates){
   assert(!entry.states.some(row=>row[0]===reference[0]),'validation must be between samples');
   const state=interpolatePlanetState(entry,dateFromJD(reference[0]));
   maxPosition=Math.max(maxPosition,difference(state.positionKm,reference.slice(1,4)));
   maxVelocity=Math.max(maxVelocity,difference(state.velocityKmS,reference.slice(4,7).map(v=>v/86400)));
  }
  errors[id]={positionKm:maxPosition,velocityKmS:maxVelocity};
  assert(maxPosition<10,`${id} position error ${maxPosition} km`);
  assert(maxVelocity<.002,`${id} speed error ${maxVelocity} km/s`);
 }
 // Independent reference errors are printed to make the checked sample limits
 // assessable, without claiming a global/navigation-grade error bound.
 console.log('Independent Horizons midpoint differences:',JSON.stringify(errors));
});

test('osculating orbit from the NASA state passes through its current planet position',()=>{
 for(const id of PLANET_IDS){
  const state=interpolatePlanetState(catalogue.bodies[id],new Date('2026-10-29T12:00:00Z'));
  const orbit=osculatingOrbit(state,2048);assert.equal(orbit.length,2049);
  // Distance to a sampled polyline is bounded by a small sagitta at 2048 steps.
  let nearest=Infinity;const point=Object.values(state.positionKm);
  for(let index=1;index<orbit.length;index++){
   const a=Object.values(orbit[index-1]),b=Object.values(orbit[index]),d=b.map((v,i)=>v-a[i]);
   const length=d.reduce((s,v)=>s+v*v,0),t=Math.max(0,Math.min(1,point.reduce((s,v,i)=>s+(v-a[i])*d[i],0)/length));
   nearest=Math.min(nearest,Math.hypot(...point.map((v,i)=>v-a[i]-d[i]*t)));
  }
  assert(nearest/state.distanceFromSunKm<.000002,`${id} is on its guide ellipse`);
 }
});

test('static-host loading retains explicit approximate fallback if NASA asset is unavailable',async()=>{
 const provider=createPlanetaryEphemeris({fetcher:async()=>({ok:false}),autoRefresh:false});await provider.ready;
 assert.equal(provider.status.state,'unavailable');assert.equal(provider.getState('earth').state,'estimated');
 assert.equal(provider.getState('moon'),null);provider.dispose();
});

test('server windows replace bundled states only within supported coverage and matching frame/units',async()=>{
 const realDate=new Date('2026-10-29T12:00:00Z');
 const body={...catalogue.bodies.earth,states:catalogue.bodies.earth.states.filter(row=>Math.abs(row[0]-2461343)<2)};
 let payload={...catalogue,bodies:{earth:body}};
 const provider=createPlanetaryEphemeris({fetcher:async()=>({ok:true,json:async()=>catalogue}),requestLive:async()=>payload,autoRefresh:false});
 await provider.ready;assert.equal(provider.getState('earth',realDate).delivery,'bundled');
 // Use an actual stored date inside this server window, independent of today's date.
 const inWindow=dateFromJD(body.states[1][0]);await provider.refreshLive();
 assert.equal(provider.getState('earth',inWindow).delivery,'server');
 const outside=new Date('2025-04-01T00:00:00Z');assert.equal(provider.getState('earth',outside).delivery,'bundled');
 const before=provider.getState('mars',inWindow).positionKm;
 payload={...catalogue,timeScale:'TDB'};await provider.refreshLive();
 assert.equal(provider.getState('mars',inWindow).delivery,'bundled');assert.deepEqual(provider.getState('mars',inWindow).positionKm,before);
 provider.dispose();
});
