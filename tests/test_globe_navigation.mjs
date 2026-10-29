import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createGlobeNavigation,intersectGlobeRay,minimumGlobeAltitude} from '../src/atlas/globe-navigation.js';

function fixture({id='earth',radius=1,radiusKm=6371}={}){
  const camera=new THREE.PerspectiveCamera(40,1.5,.0000001,10000);camera.position.set(0,0,3*radius);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius),new THREE.MeshBasicMaterial());mesh.updateMatrixWorld(true);
  const handlers=new Map(),domElement={getBoundingClientRect:()=>({left:0,top:0,width:960,height:640}),addEventListener:(type,fn)=>handlers.set(type,fn),removeEventListener:type=>handlers.delete(type),setPointerCapture(){},releasePointerCapture(){}};
  const controls={target:new THREE.Vector3(),enabled:true,enableDamping:false,minDistance:radius*1.0002,maxDistance:1000,update(){camera.lookAt(this.target);camera.updateMatrixWorld(true);}};
  const focus={id,mesh,center:new THREE.Vector3(),radius,radiusKm};
  let requested=null;
  const nav=createGlobeNavigation({THREE,camera,controls,domElement,getFocus:()=>focus,onNavigate:(target,position)=>{requested={target,position};}});
  const point=ndc=>{camera.updateMatrixWorld(true);const ray=new THREE.Raycaster();ray.setFromCamera(ndc,camera);return intersectGlobeRay(ray.ray.origin,ray.ray.direction,focus.center,radius);};
  const event=(x,y,overrides={})=>({clientX:x,clientY:y,pointerId:1,pointerType:'mouse',button:0,preventDefault(){},stopImmediatePropagation(){},...overrides});
  return {nav,camera,controls,mesh,focus,handlers,point,event,request:()=>requested};
}

test('sphere picking chooses the visible surface and rejects rays pointing into space',()=>{
  assert.deepEqual(intersectGlobeRay({x:0,y:0,z:3},{x:0,y:0,z:-1},{x:0,y:0,z:0},1),{x:0,y:0,z:1,distance:2});
  assert.equal(intersectGlobeRay({x:0,y:0,z:3},{x:0,y:0,z:1},{x:0,y:0,z:0},1),null);
  assert.equal(intersectGlobeRay({x:0,y:0,z:3},{x:0,y:0,z:0},{x:0,y:0,z:0},1),null);
});

test('pointer-anchored zoom retains the exact selected geography rather than drifting toward the centre',()=>{
  const f=fixture(),pointer=new THREE.Vector2(.16,.08),before=f.point(pointer);
  assert.ok(before);assert.equal(f.nav.zoom(.4,pointer),true);
  const after=f.point(pointer);
  assert.ok(new THREE.Vector3(before.x,before.y,before.z).distanceTo(new THREE.Vector3(after.x,after.y,after.z))<1e-10);
  assert.deepEqual(f.controls.target.toArray(),[0,0,0]);f.nav.dispose();
});

test('repeated close zoom stops above the surface and idle enforcement causes no drift',()=>{
  const f=fixture();for(let i=0;i<120;i++)f.nav.zoom(.3,new THREE.Vector2());
  const clearance=f.camera.position.length()-f.focus.radius;
  assert.ok(clearance>=minimumGlobeAltitude(f.focus)-1e-13);
  assert.ok(clearance/f.focus.radius*f.focus.radiusKm>=.001-1e-9);
  const before=f.camera.position.clone();for(let i=0;i<1000;i++)f.nav.enforce();
  assert.equal(f.camera.position.distanceTo(before),0);f.nav.dispose();
});

test('surface grab moves over a sphere without panning the selected world off centre',()=>{
  const f=fixture(),origin=f.point(new THREE.Vector2());
  f.handlers.get('pointerdown')(f.event(480,320));assert.equal(f.controls.enabled,false);
  f.handlers.get('pointermove')(f.event(540,345));
  const after=f.point(new THREE.Vector2(540/960*2-1,-(345/640)*2+1));
  assert.ok(new THREE.Vector3(origin.x,origin.y,origin.z).distanceTo(new THREE.Vector3(after.x,after.y,after.z))<1e-10);
  assert.ok(Math.abs(f.camera.position.length()-3)<1e-12);
  assert.deepEqual(f.controls.target.toArray(),[0,0,0]);
  f.handlers.get('pointerup')(f.event(540,345));assert.equal(f.controls.enabled,true);f.nav.dispose();
});

test('surface coordinates account for the selected mesh orientation and physical radius',()=>{
  const f=fixture({id:'moon',radius:2,radiusKm:1737.4}),lat=37*Math.PI/180,lon=-71*Math.PI/180;
  f.mesh.rotation.set(.3,.7,-.2);f.mesh.updateMatrixWorld(true);
  const direction=new THREE.Vector3(Math.cos(lat)*Math.cos(lon),Math.sin(lat),-Math.cos(lat)*Math.sin(lon)).transformDirection(f.mesh.matrixWorld);
  f.camera.position.copy(direction).multiplyScalar(2.2);
  const location=f.nav.getSurfaceCoordinates();
  assert.equal(location.id,'moon');assert.ok(Math.abs(location.latitude-37)<1e-10);assert.ok(Math.abs(location.longitude+71)<1e-10);
  assert.ok(Math.abs(location.altitudeKm-173.74)<1e-9);f.nav.dispose();
});

test('double-click navigation points at the clicked location and keeps the flight outside the globe',()=>{
  const f=fixture({id:'naif-501',radius:1,radiusKm:1821.6}),pointer=new THREE.Vector2(.15,0),surface=f.point(pointer);
  assert.equal(f.nav.focusPoint(pointer),true);const request=f.request();
  assert.deepEqual(request.target.toArray(),[0,0,0]);
  assert.ok(request.position.length()>1);
  const expected=new THREE.Vector3(surface.x,surface.y,surface.z).normalize();
  assert.ok(request.position.clone().normalize().distanceTo(expected)<1e-12);f.nav.dispose();
});
