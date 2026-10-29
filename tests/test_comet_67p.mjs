import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import {interpolateCometState, cometPositionInScene, cometFixedInScene, AU_KM} from '../src/atlas/comet-ephemeris.js';
import {createComet67P} from '../src/atlas/comet-67p.js';

const root=new URL('../assets/comets/67p/',import.meta.url);
const ephemeris=JSON.parse(await readFile(new URL('ephemeris.json',root),'utf8'));
const source=JSON.parse(await readFile(new URL('provenance.json',root),'utf8'));

test('the bundled Horizons states are heliocentric UT states with explicit coverage and no extrapolation',()=>{
  assert.equal(ephemeris.center,'Sun (10)');assert.equal(ephemeris.timeScale,'UT');
  assert.equal(ephemeris.referenceFrame,'Ecliptic J2000');
  assert.ok(ephemeris.states.length>1400);
  assert.equal(interpolateCometState(ephemeris,new Date('2024-12-31T23:59:59Z')),null);
  assert.equal(interpolateCometState(ephemeris,new Date('2033-01-01T00:00:01Z')),null);
  const row=ephemeris.states[333],date=new Date((row[0]-2440587.5)*86400000),actual=interpolateCometState(ephemeris,date);
  assert.ok(Math.abs(actual.positionKm.x-row[1])<1e-6);
  assert.ok(Math.abs(actual.positionKm.y-row[2])<1e-6);
  assert.ok(Math.abs(actual.positionKm.z-row[3])<1e-6);
  assert.ok(actual.distanceKm>AU_KM&&actual.distanceKm<AU_KM*6);
});

test('Hermite interpolation preserves the supplied velocity and exactly reconstructs independent cubic motion',()=>{
  const jd=2440587.5;
  // x=t^3, y=2t^2+1, z=3t-2 in km, t in days.
  const data={states:[[jd,0,1,-2,0,0,3],[jd+2,8,9,4,12,8,3]]};
  const state=interpolateCometState(data,new Date(86400000*.75));
  assert.deepEqual(state.positionKm,{x:.75**3,y:2*.75**2+1,z:3*.75-2});
  assert.equal(interpolateCometState(data,new Date(NaN)),null);
});

test('ecliptic and Cheops transforms retain the measured axis conventions',()=>{
  assert.deepEqual(cometPositionInScene({x:AU_KM,y:0,z:0},a=>a),{x:1,y:0,z:-0});
  assert.deepEqual(cometPositionInScene({x:0,y:AU_KM,z:0},a=>a),{x:0,y:0,z:-1});
  assert.deepEqual(cometPositionInScene({x:0,y:0,z:AU_KM},a=>a),{x:0,y:1,z:-0});
  assert.deepEqual(cometFixedInScene([2.4473,-.0627,-.3486]),{x:2.4473,y:-.3486,z:.0627});
});

test('scientific shape and observed images retain their recorded source hashes',async()=>{
  for(const item of [source.shape,...source.images]){
    const bytes=await readFile(new URL('../'+item.file,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
  }
  assert.deepEqual(source.landings.philae.positionKm,[2.4473,-.0627,-.3486]);
  assert.deepEqual(source.landings.rosetta.positionKm,[1.68483811,.363154163,1.06380705]);
  assert.equal(source.landings.philae.frame,source.shape.frame.split(' / ')[0]);
});

test('the actual scientific mesh and landing markers share one frame and follow the moving nucleus',async()=>{
  const fetchBefore=globalThis.fetch;
  globalThis.fetch=async url=>({ok:true,text:()=>readFile(url,'utf8'),json:async()=>JSON.parse(await readFile(url,'utf8'))});
  let comet;
  try {
    const scene=new THREE.Scene();comet=await createComet67P({THREE,scene,auToWorld:a=>9+26*a**.62,onSelect:()=>{}});
    comet.setFocus('67p');comet.update(new Date('2026-10-29T12:00:00Z'));
    assert.ok(comet.getMesh('67p').geometry.index.count/3>20000);
    const center=comet.worldPosition('67p').clone();
    for(const id of ['philae','rosetta']){
      const expected=cometFixedInScene(source.landings[id].positionKm,1.2);
      const delta=comet.worldPosition(id).clone().sub(center);
      assert.ok(delta.distanceTo(new THREE.Vector3(expected.x,expected.y,expected.z))<1e-10);
      assert.ok(Math.abs(comet.getApproachDirection(id).length()-1)<1e-12);
      assert.equal(comet.getParent(id),'67p');
      assert.match(comet.getBody(id).modelNote,/schematic/);
      assert.ok(comet.getBody(id).observedImage.sourcePage.startsWith('https://www.esa.int/'));
    }
    comet.update(new Date('2026-11-29T12:00:00Z'));
    assert.ok(comet.worldPosition('67p').distanceTo(center)>1);
    comet.setFocus('jupiter');assert.equal(comet.group.visible,false);
    comet.setFocus('philae');assert.equal(comet.group.visible,true);
    assert.ok(comet.getHeliocentricPosition(new Date('2026-10-29T12:00:00Z')));
  } finally {comet?.dispose();globalThis.fetch=fetchBefore;}
});
