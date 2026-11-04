import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import {createSolarNavigation} from '../src/atlas/solar-navigation.js';

const controlsSource=await readFile(new URL('../vendor/OrbitControls.js',import.meta.url),'utf8');
const module=new vm.SourceTextModule(controlsSource,{context:vm.createContext({console})});
await module.link(name=>{
  assert.equal(name,'three');
  return new vm.SyntheticModule(Object.keys(THREE),function(){for(const [key,value] of Object.entries(THREE))this.setExport(key,value);},{context:module.context});
});
await module.evaluate();
const OrbitControls=module.namespace.OrbitControls;

class Surface{
  constructor(){this.listeners=new Map();this.style={};this.clientWidth=960;this.clientHeight=640;this.tabIndex=-1;this.ownerDocument=this;}
  addEventListener(type,handler,options){const rows=this.listeners.get(type)||[];rows.push({handler,capture:options===true||Boolean(options?.capture)});this.listeners.set(type,rows);}
  removeEventListener(type,handler,options){const capture=options===true||Boolean(options?.capture);this.listeners.set(type,(this.listeners.get(type)||[]).filter(row=>row.handler!==handler||row.capture!==capture));}
  getRootNode(){return this;}
  getBoundingClientRect(){return {left:0,top:0,width:this.clientWidth,height:this.clientHeight};}
  setPointerCapture(){}releasePointerCapture(){}focus(){}
  emit(type,values={}){
    const event={type,clientX:480,clientY:320,pageX:480,pageY:320,pointerId:1,pointerType:'mouse',button:0,deltaY:0,deltaMode:0,target:this,preventDefault(){this.defaultPrevented=true;},stopPropagation(){},stopImmediatePropagation(){this.immediate=true;},...values};
    if(values.clientX!==undefined&&values.pageX===undefined)event.pageX=values.clientX;
    if(values.clientY!==undefined&&values.pageY===undefined)event.pageY=values.clientY;
    const rows=[...(this.listeners.get(type)||[])].sort((a,b)=>Number(b.capture)-Number(a.capture));
    for(const row of rows){if(event.immediate)break;row.handler(event);}return event;
  }
}
function fixture(){
  const element=new Surface(),camera=new THREE.PerspectiveCamera(40,1.5,.000001,150000);
  camera.position.set(0,200,600);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  const controls=new OrbitControls(camera,element);controls.minDistance=4;controls.maxDistance=50000;
  let enabled=true,time=0;const intents=[];
  const nav=createSolarNavigation({THREE,camera,controls,element,isActive:()=>enabled,onIntent:event=>intents.push(event),now:()=>time});
  const tick=(count=1)=>{for(let i=0;i<count;i++){time+=1000/60;nav.update(1/60);controls.update();camera.updateMatrixWorld(true);}};
  const cleanup=()=>{nav.dispose();controls.dispose();};
  return {element,camera,controls,nav,intents,tick,cleanup,setActive(value){enabled=value;nav.refresh();}};
}
const touch=(id,x,y)=>({pointerType:'touch',pointerId:id,clientX:x,clientY:y});

test('right, middle and Shift-left gestures pan through actual OrbitControls without rotating the overview',()=>{
  for(const properties of [{button:2},{button:1},{button:0,shiftKey:true}]){
    const f=fixture(),before=f.camera.position.clone().sub(f.controls.target),orientation=f.camera.quaternion.clone();
    f.element.emit('pointerdown',properties);f.element.emit('pointermove',{...properties,clientX:600,clientY:350});const release=f.element.emit('pointerup',properties);assert.equal(f.nav.shouldSuppressClick(release),true);f.tick(180);
    assert.ok(f.controls.target.length()>10);assert.ok(f.camera.position.clone().sub(f.controls.target).distanceTo(before)<1e-9);assert.ok(f.camera.quaternion.angleTo(orientation)<1e-7);
    f.cleanup();
  }
});

test('left mouse and one-finger gestures rotate while keeping their orbital target fixed',()=>{
  for(const props of [{pointerType:'mouse'},{pointerType:'touch'}]){
    const f=fixture(),position=f.camera.position.clone(),radius=position.length();
    f.element.emit('pointerdown',props);f.element.emit('pointermove',{...props,clientX:570,clientY:365});const release=f.element.emit('pointerup',props);assert.equal(f.nav.shouldSuppressClick(release),true);f.tick(120);
    assert.ok(f.camera.position.distanceTo(position)>50);assert.ok(Math.abs(f.camera.position.length()-radius)<1e-9);assert.equal(f.controls.target.length(),0);f.cleanup();
  }
});

test('wheel bursts ease through useful scales, retain the pointed plane position and respect both distance limits',()=>{
  const f=fixture(),ndc=new THREE.Vector2(.4,.2),ray=new THREE.Raycaster(),normal=f.camera.getWorldDirection(new THREE.Vector3()),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,f.controls.target);
  ray.setFromCamera(ndc,f.camera);const before=ray.ray.intersectPlane(plane,new THREE.Vector3()),distance=f.controls.getDistance();
  const event=f.element.emit('wheel',{clientX:672,clientY:256,deltaY:-120});assert.equal(event.defaultPrevented,true);assert.equal(f.controls.getDistance(),distance,'A wheel event queues motion rather than jumping immediately');
  f.tick();assert.ok(f.controls.getDistance()<distance&&f.controls.getDistance()>distance*.9);f.tick(180);
  ray.setFromCamera(ndc,f.camera);const after=ray.ray.intersectPlane(plane,new THREE.Vector3());assert.ok(after.distanceTo(before)<1e-6,'The world-plane anchor remains under the pointer within floating-point precision');
  for(let i=0;i<1000;i++)f.element.emit('wheel',{deltaY:-100000});f.tick(1000);assert.ok(f.controls.getDistance()>=4-1e-10&&f.controls.getDistance()<4.001);
  for(let i=0;i<1000;i++)f.element.emit('wheel',{deltaY:100000});f.tick(1000);assert.ok(f.controls.getDistance()<=50000+1e-8&&f.controls.getDistance()>49999);f.cleanup();
});

test('two-finger translation pans at unchanged scale; simultaneous pinch and pan stay finite and suppress selection',()=>{
  const f=fixture(),distance=f.controls.getDistance(),start=f.controls.target.clone();
  f.element.emit('pointerdown',touch(10,400,300));f.element.emit('pointerdown',touch(11,600,300));assert.equal(f.controls.enableZoom,false);
  f.element.emit('pointermove',touch(10,450,330));f.element.emit('pointermove',touch(11,650,330));f.tick(120);
  assert.ok(f.controls.target.distanceTo(start)>10);assert.ok(Math.abs(f.controls.getDistance()-distance)<1e-8,'One frame coalesces both touches, so parallel movement does not become pinch zoom');
  f.element.emit('pointermove',touch(10,410,350));f.element.emit('pointermove',touch(11,690,350));f.tick(180);
  assert.ok(f.controls.getDistance()<distance*.8);assert.ok([...f.camera.position.toArray(),...f.controls.target.toArray()].every(Number.isFinite));
  const first=f.element.emit('pointerup',touch(10,410,350));assert.equal(f.nav.shouldSuppressClick(first),true);const second=f.element.emit('pointerup',touch(11,690,350));assert.equal(f.nav.shouldSuppressClick(second),true);assert.equal(f.controls.enableZoom,true);f.cleanup();
});

test('returning a drag to its starting point still suppresses a click, while a fresh stationary tap is accepted',()=>{
  const f=fixture();f.element.emit('pointerdown');f.element.emit('pointermove',{clientX:560});f.element.emit('pointermove',{clientX:480});const drag=f.element.emit('pointerup');assert.equal(f.nav.shouldSuppressClick(drag),true);
  f.element.emit('pointerdown',{pointerId:2});const tap=f.element.emit('pointerup',{pointerId:2});assert.equal(f.nav.shouldSuppressClick(tap),false);
  f.element.emit('pointerdown',touch(3,450,310));const finger=f.element.emit('pointerup',touch(3,451,311));assert.equal(f.nav.shouldSuppressClick(finger),false);f.cleanup();
});

test('leaving overview cancels queued motion and never reconfigures the focused globe',()=>{
  const f=fixture();f.element.emit('wheel',{deltaY:-120});f.setActive(false);const before=f.camera.position.clone();f.controls.enablePan=false;f.controls.enableZoom=false;f.controls.enableDamping=false;
  f.element.emit('wheel',{deltaY:-120});f.element.emit('pointerdown',touch(4,400,300));f.nav.update(1);assert.deepEqual(f.camera.position,before);assert.equal(f.controls.enablePan,false);assert.equal(f.controls.enableZoom,false);assert.equal(f.controls.enableDamping,false);
  f.setActive(true);f.tick(2);assert.ok(f.camera.position.distanceTo(before)<1e-9);assert.equal(f.controls.enablePan,true);f.cleanup();assert.equal(f.element.tabIndex,-1);
});

test('keyboard pan and zoom scale with the view, Home delegates framing, and invalid camera state recovers',()=>{
  const f=fixture(),target=f.controls.target.clone();f.element.emit('keydown',{key:'ArrowRight'});assert.ok(f.controls.target.distanceTo(target)>10);
  const distance=f.controls.getDistance();f.element.emit('keydown',{key:'+'});f.tick(180);assert.ok(f.controls.getDistance()<distance);f.element.emit('keydown',{key:'Home'});assert.equal(f.intents.at(-1).type,'home');
  f.camera.position.x=NaN;f.tick();assert.ok([...f.camera.position.toArray(),...f.controls.target.toArray()].every(Number.isFinite));f.cleanup();
});


test('release displacement and cancelled touch gestures never activate a planet; middle drag cancels browser autoscroll',()=>{
  const f=fixture();
  const middle=f.element.emit('pointerdown',{button:1});assert.equal(middle.defaultPrevented,true);f.element.emit('pointerup',{button:1});
  f.element.emit('pointerdown',touch(20,300,300));const moved=f.element.emit('pointerup',touch(20,340,310));assert.equal(f.nav.shouldSuppressClick(moved),true);
  f.element.emit('pointerdown',touch(21,300,300));f.element.emit('pointerdown',touch(22,450,300));
  const cancelled=f.element.emit('pointercancel',touch(21,300,300));assert.equal(f.nav.shouldSuppressClick(cancelled),true);assert.equal(f.controls.enableZoom,true);
  const remaining=f.element.emit('pointerup',touch(22,450,300));assert.equal(f.nav.shouldSuppressClick(remaining),true);assert.equal(f.nav.isInteracting,false);f.cleanup();
});

test('line and page wheel inputs use the same bounded easing path, and disposing leaves the native surface usable',()=>{
  for(const deltaMode of [1,2]){
    const f=fixture(),initial=f.controls.getDistance();
    const wheel=f.element.emit('wheel',{deltaY:-3,deltaMode});assert.equal(wheel.immediate,true);assert.equal(f.controls.getDistance(),initial);
    f.tick(180);assert.ok(f.controls.getDistance()<initial);f.cleanup();
    const after=f.element.emit('wheel',{deltaY:-1,deltaMode});assert.equal(after.immediate,undefined);assert.equal(f.element.tabIndex,-1);
  }
});
