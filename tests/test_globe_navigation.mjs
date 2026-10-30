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

test('tilt uses a surface pivot and exposes an oblique horizon without moving the selected world',()=>{
  const f=fixture(),initial=f.point(new THREE.Vector2());
  assert.equal(f.nav.tilt(65),true);const tilted=f.point(new THREE.Vector2());
  assert.ok(new THREE.Vector3(initial.x,initial.y,initial.z).distanceTo(new THREE.Vector3(tilted.x,tilted.y,tilted.z))<1e-10);
  assert.ok(f.camera.position.y<-.5);assert.ok(Math.abs(f.nav.getViewState().tiltDeg-65)<1e-10);
  assert.deepEqual(f.controls.target.toArray(),[0,0,0]);assert.deepEqual(f.mesh.position.toArray(),[0,0,0]);
  assert.equal(f.nav.tilt(1000),true);assert.equal(f.nav.getViewState().tiltDeg,85);
  f.nav.dispose();
});

test('heading rotation retains the same surface pivot and physical camera clearance',()=>{
  const f=fixture();f.nav.tilt(55);const before=f.point(new THREE.Vector2()),altitude=f.camera.position.length()-1;
  f.nav.turn(90);const after=f.point(new THREE.Vector2());
  assert.ok(new THREE.Vector3(before.x,before.y,before.z).distanceTo(new THREE.Vector3(after.x,after.y,after.z))<1e-11);
  assert.ok(Math.abs(f.nav.getViewState().headingDeg-90)<1e-10);assert.ok(Math.abs((f.camera.position.length()-1)-altitude)<1e-10);
  f.nav.dispose();
});

test('tilted zoom respects one metre clearance and an idle oblique view has no camera or orientation drift',()=>{
  const f=fixture();f.nav.tilt(80);
  for(let i=0;i<120;i++)f.nav.zoom(.3);
  assert.ok(f.camera.position.length()-1>=minimumGlobeAltitude(f.focus)-1e-13);
  const position=f.camera.position.clone(),orientation=f.camera.quaternion.clone(),point=f.point(new THREE.Vector2());
  for(let i=0;i<1000;i++){f.controls.update();f.nav.enforce();}
  assert.equal(f.camera.position.distanceTo(position),0);assert.equal(f.camera.quaternion.angleTo(orientation),0);
  assert.ok(f.point(new THREE.Vector2()));assert.ok(Number.isFinite(point.z));f.nav.dispose();
});

test('navigation pad moves the surface pivot, nadir preserves it and whole-globe reset frames safely',()=>{
  const f=fixture();f.nav.zoom(.05);f.nav.tilt(60);const first=f.nav.getSurfaceCoordinates();
  assert.equal(f.nav.move('up'),true);const moved=f.nav.getSurfaceCoordinates();assert.notEqual(moved.latitude,first.latitude);
  assert.equal(f.nav.topDown(),true);const top=f.nav.getSurfaceCoordinates();
  assert.ok(Math.abs(top.latitude-moved.latitude)<1e-10);assert.ok(Math.abs(top.longitude-moved.longitude)<1e-10);assert.equal(f.nav.getViewState().tiltDeg,0);
  assert.equal(f.nav.resetView(),true);assert.ok(Math.abs(f.camera.position.length()-3.1)<1e-12);f.nav.dispose();
});

test('right drag looks around from a fixed observer position and releases the underlying controls cleanly',()=>{
  const f=fixture(),position=f.camera.position.clone(),orientation=f.camera.quaternion.clone();f.handlers.get('pointerdown')(f.event(480,320,{button:2}));
  f.handlers.get('pointermove')(f.event(550,420,{button:2}));
  const state=f.nav.getViewState();assert.equal(state.freeLook,true);assert.ok(state.tiltDeg>10);assert.notEqual(state.headingDeg,0);assert.equal(f.controls.enabled,false);
  assert.deepEqual(f.camera.position.toArray(),position.toArray());assert.ok(f.camera.quaternion.angleTo(orientation)>.1);
  f.handlers.get('pointerup')(f.event(550,420,{button:2}));assert.equal(f.controls.enabled,true);f.nav.dispose();
});

test('free look can point above the horizon and into the sky without leaving the selected world',()=>{
  const f=fixture({id:'moon',radius:1,radiusKm:1737.4}),position=f.camera.position.clone();
  assert.equal(f.nav.lookAround(0,120),true);const state=f.nav.getViewState();
  assert.deepEqual(f.camera.position.toArray(),position.toArray());assert.deepEqual(f.mesh.position.toArray(),[0,0,0]);
  assert.equal(state.freeLook,true);assert.equal(state.lookingAtSurface,false);assert.ok(state.elevationDeg>29.99);
  assert.equal(f.point(new THREE.Vector2()),null);assert.ok(Number.isFinite(state.rangeWorld));
  const point=f.nav.getSurfaceCoordinates();assert.equal(point.id,'moon');assert.ok(Number.isFinite(point.latitude)&&Number.isFinite(point.longitude));
  f.nav.dispose();
});

test('right or Shift dragging can start on empty sky',()=>{
  for(const modifiers of [{button:2},{shiftKey:true}]){
    const f=fixture(),position=f.camera.position.clone(),orientation=f.camera.quaternion.clone();
    assert.equal(f.point(new THREE.Vector2(.94,.94)),null);
    f.handlers.get('pointerdown')(f.event(931,19,modifiers));assert.equal(f.controls.enabled,false);
    f.handlers.get('pointermove')(f.event(821,89,modifiers));
    assert.equal(f.nav.getViewState().freeLook,true);assert.deepEqual(f.camera.position.toArray(),position.toArray());
    assert.ok(f.camera.quaternion.angleTo(orientation)>.1);
    f.handlers.get('pointerup')(f.event(821,89,modifiers));assert.equal(f.controls.enabled,true);f.nav.dispose();
  }
});

test('a surface drag after free look keeps the grabbed geography under the pointer',()=>{
  const f=fixture();f.nav.lookAround(5,3);const before=f.point(new THREE.Vector2());assert.ok(before);
  f.handlers.get('pointerdown')(f.event(480,320));f.handlers.get('pointermove')(f.event(510,340));
  const after=f.point(new THREE.Vector2(510/960*2-1,-340/640*2+1));assert.ok(after);
  assert.ok(new THREE.Vector3(before.x,before.y,before.z).distanceTo(new THREE.Vector3(after.x,after.y,after.z))<1e-10);
  assert.equal(f.nav.getViewState().freeLook,true);assert.ok(Math.abs(f.camera.position.length()-3)<1e-12);
  f.handlers.get('pointerup')(f.event(510,340));f.nav.dispose();
});

test('matched two-finger vertical motion changes the sightline while preserving the observer location',()=>{
  const f=fixture(),position=f.camera.position.clone(),orientation=f.camera.quaternion.clone(),touch=(x,y,id)=>f.event(x,y,{pointerType:'touch',pointerId:id});
  f.handlers.get('pointerdown')(touch(450,320,1));f.handlers.get('pointerdown')(touch(510,320,2));
  f.handlers.get('pointermove')(touch(450,390,1));f.handlers.get('pointermove')(touch(510,390,2));
  assert.equal(f.nav.getViewState().freeLook,true);assert.ok(f.camera.position.distanceTo(position)<1e-12);assert.ok(f.camera.quaternion.angleTo(orientation)>.1);
  f.handlers.get('pointerup')(touch(510,390,2));f.handlers.get('pointerup')(touch(450,390,1));f.nav.dispose();
});

test('explicit nadir and reset clear free look, while invalid rotations cannot corrupt the pose',()=>{
  const f=fixture();f.nav.lookAround(35,120,10);const orientation=f.camera.quaternion.toArray(),position=f.camera.position.toArray();
  assert.equal(f.nav.lookAround(NaN,0),false);assert.deepEqual(f.camera.position.toArray(),position);assert.deepEqual(f.camera.quaternion.toArray(),orientation);
  f.nav.topDown();assert.notEqual(f.nav.getViewState().freeLook,true);assert.ok(f.point(new THREE.Vector2()));
  f.nav.lookAround(80,150);f.nav.resetView();assert.notEqual(f.nav.getViewState().freeLook,true);assert.ok(f.point(new THREE.Vector2()));
  f.nav.lookAround(20,130);f.focus.id='mars';f.controls.update();f.nav.enforce();assert.equal(f.nav.getViewState().id,'mars');assert.notEqual(f.nav.getViewState().freeLook,true);
  f.nav.dispose();
});

test('Ctrl or middle drag keeps the optional surface-pivot orbit gesture',()=>{
  for(const modifiers of [{ctrlKey:true},{button:1}]){
    const f=fixture(),position=f.camera.position.clone();f.handlers.get('pointerdown')(f.event(480,320,modifiers));
    f.handlers.get('pointermove')(f.event(540,420,modifiers));
    assert.notEqual(f.nav.getViewState().freeLook,true);assert.ok(f.nav.getViewState().tiltDeg>10);assert.ok(f.camera.position.distanceTo(position)>.1);
    f.handlers.get('pointerup')(f.event(540,420,modifiers));f.nav.dispose();
  }
});

test('two-finger vertical motion tilts, twist turns, and pinch zooms without losing the globe',()=>{
  const f=fixture(),touch=(x,y,id)=>f.event(x,y,{pointerType:'touch',pointerId:id});
  f.handlers.get('pointerdown')(touch(450,320,1));f.handlers.get('pointerdown')(touch(510,320,2));
  f.handlers.get('pointermove')(touch(420,390,1));f.handlers.get('pointermove')(touch(550,420,2));
  const state=f.nav.getViewState();assert.ok(state.tiltDeg>5);assert.notEqual(state.headingDeg,0);assert.ok(f.camera.position.length()<3);
  assert.ok(f.point(new THREE.Vector2()));f.handlers.get('pointerup')(touch(550,420,2));f.handlers.get('pointerup')(touch(420,390,1));assert.equal(f.controls.enabled,true);f.nav.dispose();
});


test('the vendored OrbitControls cannot introduce idle drift in a tilted surface view',async()=>{
  const {readFile}=await import('node:fs/promises');
  const controlsSource=(await readFile(new URL('../vendor/OrbitControls.js',import.meta.url),'utf8')).replace("from 'three'",`from '${new URL('../vendor/three.module.js',import.meta.url).href}'`);
  const {OrbitControls}=await import(`data:text/javascript;base64,${Buffer.from(controlsSource).toString('base64')}`);
  const camera=new THREE.PerspectiveCamera(40,1.5,.000001,10000);camera.position.set(0,0,3);camera.lookAt(0,0,0);
  const doc={addEventListener(){},removeEventListener(){}},domElement={style:{},getRootNode:()=>doc,addEventListener(){},removeEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:960,height:640})};
  const controls=new OrbitControls(camera,domElement);controls.enableDamping=false;controls.enableZoom=false;controls.maxDistance=1000;
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1),new THREE.MeshBasicMaterial());mesh.updateMatrixWorld(true);
  const focus={id:'earth',mesh,center:new THREE.Vector3(),radius:1,radiusKm:6371};
  const nav=createGlobeNavigation({THREE,camera,controls,domElement,getFocus:()=>focus});nav.tilt(82);
  for(let i=0;i<120;i++)nav.zoom(.4);
  const position=camera.position.toArray(),quaternion=camera.quaternion.toArray();
  for(let i=0;i<1000;i++){controls.update();nav.enforce();}
  assert.deepEqual(camera.position.toArray(),position);assert.deepEqual(camera.quaternion.toArray(),quaternion);
  assert.ok(camera.position.length()-1>=minimumGlobeAltitude(focus)-1e-12);
  nav.lookAround(23,130,17);const freePosition=camera.position.toArray(),freeQuaternion=camera.quaternion.toArray(),freeUp=camera.up.toArray();
  for(let i=0;i<1000;i++){controls.update();nav.enforce();}
  assert.deepEqual(camera.position.toArray(),freePosition);assert.deepEqual(camera.quaternion.toArray(),freeQuaternion);assert.deepEqual(camera.up.toArray(),freeUp);
  nav.dispose();controls.dispose();
});
