import test from 'node:test';
import assert from 'node:assert/strict';
import {sunDirectionScene, bodyOrientationAngles, bodyOrientationBasis, createSolarIllumination} from '../src/atlas/solar-illumination.js';
import * as THREE from '../vendor/three.module.js';

const norm = v => Math.hypot(v.x, v.y, v.z);
const dot = (a, b) => a.x*b.x + a.y*b.y + a.z*b.z;
const cross = (a, b) => ({ x:a.y*b.z-a.z*b.y, y:a.z*b.x-a.x*b.z, z:a.x*b.y-a.y*b.x });
const date = new Date('2026-10-29T12:00:00Z');

test('Sunward directions follow the ecliptic-to-scene frame independently of scene scale', () => {
  assert.deepEqual(sunDirectionScene({x:10,y:0,z:0}), {x:-1,y:-0,z:0});
  assert.deepEqual(sunDirectionScene({x:0,y:10,z:0}), {x:-0,y:-0,z:1});
  assert.deepEqual(sunDirectionScene({x:0,y:0,z:10}), {x:-0,y:-1,z:0});
  const a=sunDirectionScene({x:1,y:-3,z:8}), b=sunDirectionScene({x:1000,y:-3000,z:8000});
  assert(norm({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z})<1e-12);
  assert.equal(sunDirectionScene({x:0,y:0,z:0}), null);
  assert.equal(sunDirectionScene({x:NaN,y:0,z:1}), null);
});

test('IAU cartographic bases remain orthonormal and right-handed for all eight worlds', () => {
  for(const id of ['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune']) {
    const b=bodyOrientationBasis(id,date);
    for(const axis of ['x','y','z'])assert(Math.abs(norm(b[axis])-1)<1e-12,id);
    assert(Math.abs(dot(b.x,b.y))<1e-12,id); assert(Math.abs(dot(b.y,b.z))<1e-12,id);
    assert(dot(cross(b.x,b.y),b.z)>1-1e-12,id);
  }
  assert.equal(bodyOrientationBasis('unknown',date),null);
});

test('planetary phase depends on UTC date, including the retrograde rotation of Venus and Uranus', () => {
  const later=new Date(+date+3600000);
  for(const [id,low,high] of [['earth',14,16],['mars',14,16],['venus',-.1,0],['uranus',-22,-19]]) {
    const a=bodyOrientationAngles(id,date), b=bodyOrientationAngles(id,later);
    const change=((b.primeMeridianDeg-a.primeMeridianDeg+540)%360)-180;
    assert(change>low&&change<high,`${id}: ${change}`);
  }
});

test('the large Mars periodic terms are retained instead of mistaking polynomial constants for its pole', () => {
  const p=bodyOrientationAngles('mars',new Date('2000-01-01T11:58:50.816Z'));
  assert(p.raDeg>317.6&&p.raDeg<317.8);assert(p.decDeg>52.8&&p.decDeg<53.0);
  assert.equal(bodyOrientationAngles('earth',new Date(NaN)),null);
});

test('three independent CSPICE reference matrices retain the correct date, axis and meridian conventions', () => {
  // NASA CSPICE pxform(IAU_BODY, J2000, ET), pck00011.tpc, at the date above.
  // Reference columns mapped to Three sphere (+X prime, +Y north, -Z east).
  const reference={
    earth:[[-.7943784508044461,.24351394806905588,.5564744684110394],[.0026078184929280704,.9174820555027338,-.3977686225850228],[-.6074175468162211,-.3145276377781443,-.729463014068201]],
    mars:[[-.1901521118420188,.033528427241918526,.9811819499607113],[.4461232060486119,.8932218649467452,.05593554331519814],[-.8745377404017097,.44836429892191676,-.18480583341802237]],
    neptune:[[.14468861519962178,-.38443788214506786,.9117415858692806],[.3604108604274722,.8786143453106481,.31327439075077657],[-.9215037798715451,.2832743316754204,.265681080802339]],
  };
  for(const [id,columns] of Object.entries(reference)) {
    const basis=bodyOrientationBasis(id,date);
    for(const [index,axis] of ['x','y','z'].entries())for(const [j,coordinate] of ['x','y','z'].entries())assert(Math.abs(basis[axis][coordinate]-columns[index][j])<1e-8,id);
  }
});

test('illumination survives texture recompiles and lights delayed tiles while inspection time is frozen', () => {
  const group=new THREE.Group(), mesh=new THREE.Mesh(new THREE.SphereGeometry(1),new THREE.MeshStandardMaterial());
  group.add(mesh);
  const lighting=createSolarIllumination({THREE,getHeliocentricPosition:()=>({x:1,y:0,z:0})});
  const previousCompile=mesh.material.onBeforeCompile;
  lighting.register('earth',group); lighting.registerOrientation('earth',mesh);lighting.update(date);
  const shader={uniforms:{},fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  mesh.material.onBeforeCompile(shader,null);
  assert.equal(shader.uniforms.relicSunDirection.value.x,-1);
  assert(shader.fragmentShader.includes('mat3(viewMatrix) * relicSunDirection'));
  assert.equal((shader.fragmentShader.match(/uniform vec3 relicSunDirection;/g)||[]).length,1);
  assert(Math.abs(mesh.quaternion.length()-1)<1e-12);
  const tile=new THREE.Mesh(new THREE.SphereGeometry(1),new THREE.MeshStandardMaterial());mesh.add(tile);
  lighting.update(date);
  const tileShader={uniforms:{},fragmentShader:THREE.ShaderLib.standard.fragmentShader};tile.material.onBeforeCompile(tileShader,null);
  assert.equal(tileShader.uniforms.relicSunDirection.value.x,-1);
  lighting.dispose();assert.equal(mesh.material.onBeforeCompile,previousCompile);
  mesh.geometry.dispose();tile.geometry.dispose();mesh.material.dispose();tile.material.dispose();
});
