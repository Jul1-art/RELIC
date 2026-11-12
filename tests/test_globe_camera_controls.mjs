import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from '../vendor/cesium/index.js';
import {globeZoomOutLimit,installGlobeCameraControls,installTrackpadPinchZoom} from '../src/worlds/globe-camera-controls.js';

function fixture(){
 const callbacks=new Set(),listeners=new Map(),events=[];
 const defaults={minimumZoomDistance:1,maximumZoomDistance:Infinity,zoomFactor:5,inertiaSpin:.9,inertiaZoom:.8,rotateEventTypes:[Cesium.CameraEventType.LEFT_DRAG],tiltEventTypes:[Cesium.CameraEventType.MIDDLE_DRAG],zoomEventTypes:[Cesium.CameraEventType.WHEEL,Cesium.CameraEventType.RIGHT_DRAG,Cesium.CameraEventType.PINCH]};
 const camera={frustum:{fovy:Math.PI/3},positionCartographic:{height:1e6}};
 const viewer={camera,scene:{mode:Cesium.SceneMode.SCENE3D,screenSpaceCameraController:defaults,preRender:{addEventListener(fn){callbacks.add(fn);return()=>callbacks.delete(fn);}}},container:{addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type){listeners.delete(type);}},canvas:{dispatchEvent(e){events.push(e);listeners.get('wheel')?.(e);}}};
 return {viewer,defaults,camera,callbacks,listeners,events};
}

test('world framing supports more than twice the old twelve-radius zoom on portrait screens',()=>{
 for(const radius of [6378137,1737400,3396000]){
  const wide=globeZoomOutLimit(radius,Math.PI/3);
  const portrait=globeZoomOutLimit(radius,Math.PI/5);
  assert.ok(wide>radius*20);assert.ok(portrait>radius*35);
  assert.ok(portrait>wide);
 }
});

test('camera integration preserves native gesture maps and inertia; limits never snap a distant camera inward',()=>{
 const f=fixture(),rotate=f.defaults.rotateEventTypes,tilt=f.defaults.tiltEventTypes,zoom=f.defaults.zoomEventTypes;
 const dispose=installGlobeCameraControls(f.viewer,{radius:6378137});
 assert.equal(f.defaults.rotateEventTypes,rotate);assert.equal(f.defaults.tiltEventTypes,tilt);
 assert.equal(f.defaults.inertiaSpin,.9);assert.equal(f.defaults.inertiaZoom,.8);
 assert.ok(f.defaults.zoomEventTypes.includes(Cesium.CameraEventType.RIGHT_DRAG));
 f.camera.positionCartographic.height=1e10;for(const fn of f.callbacks)fn();
 assert.equal(f.defaults.maximumZoomDistance,1e10);
 f.viewer.scene.mode=Cesium.SceneMode.SCENE2D;for(const fn of f.callbacks)fn();
 assert.equal(f.defaults.maximumZoomDistance,Infinity);
 dispose();assert.equal(f.callbacks.size,0);assert.equal(f.listeners.size,0);assert.equal(f.defaults.zoomEventTypes,zoom);
});

test('upstream trackpad relay bounds pinch travel, never consumes a regular wheel and does not relay itself',()=>{
 const f=fixture(),zoom=f.defaults.zoomEventTypes;
 const dispose=installTrackpadPinchZoom(f.viewer,{createWheelEvent:(type,init)=>({type,...init})});
 let prevented=0,stopped=0;
 const event={ctrlKey:true,deltaMode:0,deltaY:30,preventDefault(){prevented++;},stopPropagation(){stopped++;}};
 f.listeners.get('wheel')(event);
 assert.equal(f.events.length,1);assert.equal(f.events[0].deltaY,120);assert.equal(prevented,1);assert.equal(stopped,1);
 f.listeners.get('wheel')({...event,ctrlKey:false});assert.equal(f.events.length,1);
 dispose();assert.equal(f.defaults.zoomEventTypes,zoom);
});
