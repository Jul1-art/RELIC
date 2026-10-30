import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as Cesium from '../vendor/cesium/index.js';
import * as celestial from '../src/worlds/celestial-scene.js';
import * as navigation from '../src/atlas/orbital-navigation.js';

// Execute the native renderer's actual navigation functions without booting a
// WebGL widget. Only its final browser bootstrap is replaced by test accessors.
async function fixture(body){
  const source=await readFile(new URL('../src/worlds/embedded-globe.js',import.meta.url),'utf8');
  assert.match(source,/\nstart\(\);\s*$/);
  const instrumented=source.replace(/\nstart\(\);\s*$/,`
    export {pickTarget,cameraFrame,zoom,state};
    export function install(v,options={}){
      viewer=v;buildings=options.buildings;lastFrame=options.frame||null;
      ready=Boolean(options.ready);focus={id:body,context:options.context||[]};
    }
  `);
  const messages=[],element={getBoundingClientRect:()=>({height:24})};
  const context=vm.createContext({
    URLSearchParams,performance,location:{search:`?body=${body}`,origin:'https://example.invalid'},
    window:{},parent:{postMessage:message=>messages.push(message)},
    document:{querySelector:()=>element},innerWidth:1200,matchMedia:()=>({matches:false}),
    ResizeObserver:class{observe(){}},
  });
  const dependencies={
    '../../vendor/cesium/index.js':Cesium,
    '../core/api-config.js':{getCesiumToken(){},validateCesiumToken(){}},
    '../atlas/surface-imagery.js':{SURFACE_SOURCES:{}},
    '../atlas/solar-illumination.js':{bodyOrientationBasis(){},sunDirectionScene(){}},
    '../atlas/orbital-data.js':{approximatePosition(){}},
    './global-terrain.js':{loadGlobalHeightGrid(){},createGlobalTerrainProvider(){}},
    './celestial-scene.js':celestial,
    '../atlas/orbital-navigation.js':navigation,
  };
  const module=new vm.SourceTextModule(instrumented,{context});
  await module.link(name=>{
    const dependency=dependencies[name];assert.ok(dependency,`Unexpected dependency ${name}`);
    return new vm.SyntheticModule(Object.keys(dependency),function(){for(const [key,value] of Object.entries(dependency))this.setExport(key,value);},{context});
  });
  const originalEllipsoid=Cesium.Ellipsoid.default;
  await module.evaluate();
  return {api:module.namespace,messages,restore:()=>{Cesium.Ellipsoid.default=originalEllipsoid;}};
}

function viewerFor({body='moon',depth,terrain=null,ellipsoidHit=null,globe=false,celestialId}={}){
  const radius=body==='earth'?6378137:body==='moon'?1737400:3396000;
  const position=new Cesium.Cartesian3(radius*1.5,0,0),ray=new Cesium.Ray(position,Cesium.Cartesian3.UNIT_X);
  let depthCalls=0;
  const viewer={
    isDestroyed:()=>false,canvas:{clientWidth:800,clientHeight:600},
    scene:{pickPositionSupported:true,pick:()=>celestialId?{id:celestialId,primitive:{relicCelestial:true}}:undefined,
      pickPosition(){depthCalls++;return depth;},requestRender(){},
      globe:{show:globe,pick:()=>terrain,getHeight:()=>0}},
    camera:{positionWC:position,directionWC:Cesium.Cartesian3.UNIT_X,frustum:{fov:Math.PI/3,get fovy(){return this.fov;}},
      getPickRay:()=>ray,pickEllipsoid:()=>ellipsoidHit,
      lookAt(){assert.fail('A celestial depth pick must never become a navigation pivot');}},
  };
  return {viewer,radius,get depthCalls(){return depthCalls;}};
}

test('Earth depth from a lunar ion view cannot replace the last lunar surface pivot',async t=>{
  const f=await fixture('moon');t.after(f.restore);
  const v=viewerFor({depth:new Cesium.Cartesian3(378000000,0,0),celestialId:'earth'});
  const frame={target:new Cesium.Cartesian3(v.radius,0,0),range:v.radius/2,heading:0,pitch:-Math.PI/2};
  f.api.install(v.viewer,{frame});
  assert.equal(f.api.pickTarget(),null);
  assert.equal(f.api.cameraFrame(),frame);
  assert.equal(v.depthCalls,0,'Celestial primitives are excluded before reconstructing their depth');
});

test('OSM buildings and high lunar/Martian terrain remain valid selected-ground hits',async()=>{
  for(const [body,height] of [['earth',1000],['moon',11000],['mars',23000]]){
    const f=await fixture(body);
    try{
      const v=viewerFor({body});
      const ground=new Cesium.Cartesian3(v.radius+height,0,0);v.viewer.scene.pickPosition=()=>ground;
      f.api.install(v.viewer,{buildings:body==='earth'});
      assert.equal(f.api.pickTarget(),ground,body);
    }finally{f.restore();}
  }
});

test('unidentified external depth is rejected and selected-globe terrain picking still works',async t=>{
  const f=await fixture('earth');t.after(f.restore);
  const terrain=new Cesium.Cartesian3(6378137,0,0);
  const v=viewerFor({body:'earth',depth:new Cesium.Cartesian3(382000000,0,0),terrain,globe:true});
  f.api.install(v.viewer,{buildings:{}});
  assert.equal(f.api.pickTarget(),terrain);
  assert.equal(v.depthCalls,1,'The radial surface bound also handles unknown/unavailable pick IDs');
});

test('Phobos and Deimos depth near ion Mars uses optical zoom without translating the observer',async t=>{
  const f=await fixture('mars');t.after(f.restore);
  for(const distance of [9376000,23463000]){
    const v=viewerFor({body:'mars',depth:new Cesium.Cartesian3(distance,0,0)});
    const position=Cesium.Cartesian3.clone(v.viewer.camera.positionWC);
    f.api.install(v.viewer);
    f.api.zoom(.8);
    assert.ok(Math.abs(v.viewer.camera.frustum.fov-Math.PI/3*.8)<1e-12);
    assert.deepEqual(v.viewer.camera.positionWC,position);
  }
});

test('a context world in ion depth contributes its own physical scale instead of lunar ground scale',async t=>{
  const f=await fixture('moon');t.after(f.restore);
  const v=viewerFor({depth:new Cesium.Cartesian3(378000000,0,0)});
  const frame={target:new Cesium.Cartesian3(v.radius,0,0),range:v.radius/2,heading:0,pitch:-Math.PI/2};
  const earth={id:'earth',radiusMeters:6371000,position:{x:384400000,y:0,z:0}};
  f.api.install(v.viewer,{ready:true,frame,context:[earth]});
  f.api.state(true);
  const state=f.messages.at(-1).state;
  assert.equal(state.scaleReference,'earth');
  const range=earth.position.x-earth.radiusMeters-v.viewer.camera.positionWC.x;
  assert.ok(Math.abs(state.metersPerPixel-2*range*Math.tan(Math.PI/6)/600)<1e-8);
});
