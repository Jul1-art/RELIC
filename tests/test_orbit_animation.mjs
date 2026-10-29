import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {makeOrbitPath,projectOrbitDistance,sampleOrbitDistance,writeOrbitTrail,createOrbitDirections} from '../src/atlas/orbit-directions.js';

const square=[{x:0,y:0,z:0},{x:10,y:0,z:0},{x:10,y:10,z:0},{x:0,y:10,z:0},{x:0,y:0,z:0}];
test('orbital heads project continuously onto segments rather than hopping between samples',()=>{
  const path=makeOrbitPath(square);
  assert.ok(Math.abs(projectOrbitDistance(path,{x:4.05,y:.2,z:0})-4.05)<1e-12);
  assert.ok(Math.abs(sampleOrbitDistance(path,4.05).x-4.05)<1e-12);
  assert.deepEqual(sampleOrbitDistance(path,-3),{x:0,y:3,z:0});
});

test('a closed orbit wake crosses its seam without cutting across the orbital interior',()=>{
  const path=makeOrbitPath(square),positions=new Float32Array(15);
  writeOrbitTrail(path,{x:5,y:0,z:0},positions,.2);
  assert.deepEqual(Array.from(positions.slice(0,3)),[0,3,0]);
  assert.deepEqual(Array.from(positions.slice(-3)),[5,0,0]);
  for(let i=3;i<positions.length;i+=3)assert.ok(Math.hypot(positions[i]-positions[i-3],positions[i+1]-positions[i-2],positions[i+2]-positions[i-1])<=2.000001);
});

test('open trajectories never invent a previous segment beyond their first published state',()=>{
  const path=makeOrbitPath([{x:0,y:0,z:0},{x:10,y:0,z:0},{x:20,y:0,z:0}],false),positions=new Float32Array(24);
  writeOrbitTrail(path,{x:1,y:0,z:0},positions,.2);
  assert.equal(positions[0],0);assert.equal(positions.at(-3),1);
  for(let i=0;i<positions.length;i+=3)assert.ok(positions[i]>=0&&positions[i]<=1);
});

test('blue wakes follow the physical displayed position and remain frozen when that position is paused',()=>{
  const scene=new THREE.Scene(),geometry=new THREE.BufferGeometry().setFromPoints(square.map(p=>new THREE.Vector3(p.x,p.y,p.z)));
  const line=new THREE.Line(geometry,new THREE.LineBasicMaterial()),head=new THREE.Vector3(5,0,0),camera=new THREE.PerspectiveCamera();camera.position.set(0,0,20);
  const dates=[],view=createOrbitDirections({THREE,scene,planets:[{id:'earth',orbit:10,size:1}],orbitLines:new Map([['earth',line]]),getPosition:(id,date)=>{assert.equal(id,'earth');dates.push(Number(date));return head;}});
  view.update(camera,true,new Date(0));const trail=scene.getObjectByName('planet-orbit-directions').children[0],before=Array.from(trail.geometry.attributes.position.array);
  view.update(camera,true,new Date(86400000));assert.deepEqual(Array.from(trail.geometry.attributes.position.array),before);
  head.set(6,0,0);view.update(camera,true,new Date(172800000));
  assert.deepEqual(Array.from(trail.geometry.attributes.position.array.slice(-3)),[6,0,0]);assert.deepEqual(dates,[0,86400000,172800000]);
  view.dispose();assert.equal(scene.getObjectByName('planet-orbit-directions'),undefined);
});
