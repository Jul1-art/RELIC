import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {interpolatePlanetState} from '../src/atlas/planetary-ephemeris.js';
import {makeCelestialContext,sceneToBodyFixed} from '../src/atlas/celestial-context.js';
import {bodyOrientationBasis} from '../src/atlas/solar-illumination.js';
const data=JSON.parse(await readFile(new URL('../assets/ephemeris/planets-horizons.json',import.meta.url)));
const getState=(id,date)=>interpolatePlanetState(data.bodies[id],date);
const magnitude=v=>Math.hypot(v.x,v.y,v.z);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;

test('Earth from the Moon retains NASA physical separation and radius rather than overview scale',()=>{
  for(const date of [new Date('2025-04-01T00:00:00Z'),new Date('2026-10-30T00:00:00Z'),new Date('2032-08-12T06:00:00Z')]){
    const context=makeCelestialContext({selected:'moon',date,getState});
    assert.equal(context.length,9);assert(!context.some(row=>row.id==='moon'));
    const earth=context.find(row=>row.id==='earth'),sun=context.find(row=>row.id==='sun');
    assert.equal(earth.radiusMeters,6371000);
    const a=getState('earth',date).positionKm,b=getState('moon',date).positionKm;
    const distanceKm=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
    assert.ok(Math.abs(magnitude(earth.position)/1000-distanceKm)<1e-7);
    assert.ok(distanceKm>330000&&distanceKm<410000);
    assert.ok(magnitude(sun.position)>1.4e11&&magnitude(sun.position)<1.6e11);
    const longitude=Math.atan2(earth.position.y,earth.position.x)*180/Math.PI;
    assert.ok(Math.abs(longitude)<10,`Earth must lie over the lunar near side, got ${longitude}°`);
    const {x,y,z}=earth.axes;
    for(const axis of [x,y,z])assert.ok(Math.abs(magnitude(axis)-1)<1e-12);
    assert.ok(Math.abs(dot(x,y))<1e-12);assert.ok(Math.abs(dot(y,z))<1e-12);
  }
});

test('Moon interpolation matches separate NASA outputs and never extrapolates',()=>{
  const moon=data.bodies.moon;assert.equal(moon.target,'301');assert.equal(moon.validationStates.length,20);
  for(const row of moon.validationStates){
    const state=interpolatePlanetState(moon,new Date((row[0]-2440587.5)*86400000));
    assert.ok(Math.hypot(state.positionKm.x-row[1],state.positionKm.y-row[2],state.positionKm.z-row[3])<1);
  }
  assert.equal(interpolatePlanetState(moon,new Date('2034-01-01T00:00:00Z')),null);
});

test('IAU map axes convert exactly to the native prime/east/north axes',()=>{
  const basis=bodyOrientationBasis('moon',new Date('2026-10-30T00:00:00Z'));
  for(const [input,expected] of [[basis.x,[1,0,0]],[basis.y,[0,0,1]],[basis.z,[0,-1,0]]]){
    const actual=sceneToBodyFixed(input,basis);
    Object.values(actual).forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-12));
  }
  assert.deepEqual(makeCelestialContext({selected:'moon',date:new Date(),getState:()=>null}),[]);
});
