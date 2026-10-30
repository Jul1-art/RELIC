import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from '../vendor/cesium/index.js';
import {celestialPixelRadius,celestialCentreOccluded,celestialModelMatrix,createCelestialScene,getBodyIdFromPick,celestialRayDistance} from '../src/worlds/celestial-scene.js';

const earth={id:'earth',name:'Earth',radiusMeters:6371000,position:{x:384400000,y:0,z:0},imageUrl:'earth.webp',sunDirection:{x:1,y:0,z:0}};

test('a distant Earth uses its actual view distance for the ruler and empty sky has none',()=>{
  const origin={x:0,y:0,z:0};
  assert.equal(celestialRayDistance(origin,{x:1,y:0,z:0},earth),384400000-6371000);
  assert.equal(celestialRayDistance(origin,{x:0,y:1,z:0},earth),null);
  assert.equal(celestialRayDistance(origin,{x:-1,y:0,z:0},earth),null);
  const pixels=celestialPixelRadius(earth.radiusMeters,384400000,Math.PI/3,800);
  const kmPerPixel=2*384400000*Math.tan(Math.PI/6)/800/1000;
  assert.ok(Math.abs(pixels*2*kmPerPixel-12742)<1e-8);
});

test('Earth seen from the Moon has its real angular size, while distant planets stay subpixel',()=>{
  const diameter=2*celestialPixelRadius(6371000,384400000,Math.PI/3,800);
  assert.ok(diameter>22&&diameter<24);
  assert.ok(celestialPixelRadius(69911000,6e11,Math.PI/3,800)<.1);
  assert.equal(celestialPixelRadius(NaN,1,1,800),0);
});

test('horizon occlusion does not put a point through the inspected Moon, or hide sky from a measured basin',()=>{
  const radius=1737400,above={x:0,y:0,z:radius+2000};
  assert.equal(celestialCentreOccluded(above,{x:0,y:0,z:-384400000},radius),true);
  assert.equal(celestialCentreOccluded(above,{x:0,y:0,z:384400000},radius),false);
  assert.equal(celestialCentreOccluded({x:0,y:0,z:radius-1000},{x:384400000,y:0,z:0},radius),false);
});

test('Cesium geometry texture meridians map onto the physical prime/east/north basis',()=>{
  const row={...earth,axes:{x:{x:0,y:1,z:0},y:{x:-1,y:0,z:0},z:{x:0,y:0,z:1}}};
  const matrix=celestialModelMatrix(Cesium,row),transform=point=>Cesium.Cartesian3.subtract(Cesium.Matrix4.multiplyByPoint(matrix,new Cesium.Cartesian3(...point),new Cesium.Cartesian3()),new Cesium.Cartesian3(earth.position.x,0,0),new Cesium.Cartesian3());
  assert.deepEqual(transform([-1,0,0]),new Cesium.Cartesian3(0,1,0),'geometry u=.5 becomes +Xprime');
  assert.deepEqual(transform([0,-1,0]),new Cesium.Cartesian3(-1,0,0),'geometry u=.75 becomes +Yeast');
  assert.deepEqual(transform([0,0,1]),new Cesium.Cartesian3(0,0,1));
  const rotation=Cesium.Matrix4.getMatrix3(matrix,new Cesium.Matrix3());assert.equal(Cesium.Matrix3.determinant(rotation),1);
});

function fixture(){
  const owned=new Set(),credits=new Set(),selected=[];
  class Collection{constructor(){this.items=[];}add(value){this.items.push(value);return value;}remove(value){const index=this.items.indexOf(value);if(index>=0)this.items.splice(index,1);}}
  class Material{constructor(options){this.uniforms=options.fabric.uniforms;this.source=options.fabric.source;}static fromType(type,uniforms){return {type,uniforms};}}
  class MaterialAppearance{constructor(options){Object.assign(this,options);this.vertexFormat=Cesium.VertexFormat.POSITION_NORMAL_AND_ST;}}
  class Primitive{constructor(options){Object.assign(this,options);}}
  class Credit{constructor(html){this.html=html;}}
  const C={...Cesium,PointPrimitiveCollection:Collection,LabelCollection:Collection,Material,MaterialAppearance,Primitive,Credit};
  const origin=new Cesium.Cartesian3(0,0,2000000);
  const camera={positionWC:origin,upWC:new Cesium.Cartesian3(1,0,0),directionWC:new Cesium.Cartesian3(1,0,0),frustum:{far:1e9,fovy:Math.PI/3},cancelFlight(){},lookAtTransform(){},setView(value){this.lastView=value;}};
  const scene={canvas:{clientHeight:800},globe:{ellipsoid:Cesium.Ellipsoid.MOON},logarithmicDepthBuffer:false,preRender:new Cesium.Event(),primitives:{add(value){owned.add(value);return value;},remove(value){owned.delete(value);}},requestRender(){},pick(){return this.picked;},cartesianToCanvasCoordinates(_world,out){out.x=400;out.y=300;return out;}};
  const viewer={camera,scene,isDestroyed:()=>false,creditDisplay:{addStaticCredit(value){credits.add(value);},removeStaticCredit(value){credits.delete(value);}}};
  const celestial=createCelestialScene({Cesium:C,viewer,onSelect:id=>selected.push(id)});
  return {C,scene,viewer,celestial,owned,credits,selected};
}

test('native celestial scene keeps physical geometry, uses Sun lighting, and reorients without moving the camera',()=>{
  const f=fixture();f.celestial.setBodies([earth,{id:'sun',name:'Sun',radiusMeters:695700000,position:{x:1.5e11,y:0,z:0},imageUrl:'sun.webp',flat:true}]);
  const spheres=[...f.owned].filter(value=>value instanceof f.C.Primitive),earthSphere=spheres.find(s=>s.geometryInstances.id==='earth'),sunSphere=spheres.find(s=>s.geometryInstances.id==='sun');
  assert.equal(earthSphere.geometryInstances.geometry._radii.x,6371000);assert.equal(earthSphere.appearance.material.uniforms.towardSun.x,1);assert.equal(sunSphere.appearance.material.type,'Image');
  assert.equal(earthSphere.show,true);assert.ok(f.viewer.camera.frustum.far>1.5e11);assert.equal(f.scene.logarithmicDepthBuffer,true);assert.equal(f.credits.size,1);
  const before=Cesium.Cartesian3.clone(f.viewer.camera.positionWC);
  assert.equal(f.celestial.lookAt('earth'),true);assert.deepEqual(f.viewer.camera.lastView.destination,before);assert.deepEqual(f.viewer.camera.positionWC,before);
  const {direction,up}=f.viewer.camera.lastView.orientation;assert.ok(Math.abs(Cesium.Cartesian3.dot(direction,up))<1e-12);assert.ok(Math.abs(Cesium.Cartesian3.magnitude(up)-1)<1e-12);
  f.celestial.dispose();assert.equal(f.owned.size,0);assert.equal(f.credits.size,0);assert.equal(f.viewer.camera.frustum.far,1e9);assert.equal(f.scene.logarithmicDepthBuffer,false);
});

test('native marker picking dispatches real body ids and excludes hidden/foreground objects',()=>{
  const f=fixture();f.celestial.setBodies([earth]);
  const sphere=[...f.owned].find(value=>value instanceof f.C.Primitive);
  f.scene.picked={id:'earth',primitive:sphere};assert.equal(getBodyIdFromPick(f.scene.picked),'earth');
  assert.equal(f.celestial.handleClick({x:1,y:1}),true);assert.deepEqual(f.selected,['earth']);
  f.scene.picked={id:'a-building',primitive:{}};assert.equal(f.celestial.handleClick({x:400,y:300}),false);assert.equal(getBodyIdFromPick(f.scene.picked),null);
  f.scene.picked=undefined;f.viewer.camera.directionWC=new Cesium.Cartesian3(-1,0,0);assert.equal(f.celestial.handleClick({x:400,y:300}),false,'An offscreen world behind the viewer cannot capture a ground click');
  f.celestial.setBodies([]);assert.equal(f.celestial.lookAt('earth'),false);assert.equal(f.credits.size,0);f.celestial.dispose();
});
