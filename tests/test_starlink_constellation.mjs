import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {constants} from '../vendor/satellite/satellite.es.js';
import {constellationRadius,constellationViewDistance,STARLINK_COLOR,STARLINK_POINT_SIZE} from '../src/satellites/constellation-view.js';
import {createSatelliteCatalog,GROUPS} from '../src/satellites/catalog.js';
import {SATELLITE_CLASS_IDS,SATELLITE_CLASS_DISPLAY} from '../vendor/gods-eye-view/satellites/classes.js';
const now=Date.parse('2026-11-12T12:00:00Z');
const tle=`ISS (ZARYA)
1 25544U 98067A   26315.85209532  .00008096  00000+0  15318-3 0  9994
2 25544  51.6324 289.3631 0007314  15.2015 344.9192 15.49321770594643`;
const starlinkTle=tle.replace('ISS (ZARYA)','STARLINK-TEST').replaceAll('25544','45544');
const until=async fn=>{const start=Date.now();while(!fn()){if(Date.now()-start>4000)assert.fail('Timed out waiting for constellation');await new Promise(resolve=>setTimeout(resolve,5));}};

test('the complete Starlink feed is published before other catalogues finish',async()=>{
 let release,activeStarted=false,visible=new Map();const activeGate=new Promise(resolve=>release=resolve),requests=[];
 const catalog=createSatelliteCatalog({now:()=>now,cacheStorage:null,onChange:state=>visible=state.records,fetchImpl:async url=>{
   const group=String(url).split('/').pop();requests.push(group);
   if(group==='active'){activeStarted=true;await activeGate;}
   return new Response(group==='starlink'?starlinkTle:tle);
 }});
 const pending=catalog.refresh();
 try{
   await until(()=>activeStarted);
   assert.deepEqual(requests.slice(0,3),['stations','starlink','active']);assert.ok(GROUPS.includes('starlink'));
   assert.equal(visible.get(45544)?.satelliteClass,'starlink');assert.ok(visible.has(25544));
 }finally{release();await pending;catalog.dispose();}
});

test('a background refresh keeps the existing constellation visible until its replacement is ready',async()=>{
 let refreshing=false,waiting=false,release;const gate=new Promise(resolve=>release=resolve);
 const catalog=createSatelliteCatalog({now:()=>now,cacheStorage:null,fetchImpl:async url=>{
   const group=String(url).split('/').pop();
   if(refreshing&&group==='starlink'){waiting=true;await gate;}
   return new Response(group==='starlink'?starlinkTle:tle);
 }});
 await catalog.refresh();assert.ok(catalog.records.has(45544));refreshing=true;
 const pending=catalog.refresh();
 try{await until(()=>waiting);assert.ok(catalog.records.has(45544),'A slow feed must not clear the existing shell');}
 finally{release();await pending;catalog.dispose();}
});

test('Starlink framing contains the largest apogee in portrait and landscape',()=>{
 const records=new Map([[1,{satelliteClass:'starlink',satrec:{a:1.2,ecco:.1}}],[2,{satelliteClass:'telecom',satrec:{a:7,ecco:0}}]]);
 const radius=constellationRadius(records);assert.ok(Math.abs(radius-1.2*constants.earthRadius*1000*1.1)<1e-6);
 for(const aspect of [390/844,768/1024,1024/768,1360/900]){
   const fovy=Math.PI/3,distance=constellationViewDistance(radius,fovy,aspect),angle=Math.asin(radius/distance);
   assert.ok(angle<fovy/2);assert.ok(angle<Math.atan(Math.tan(fovy/2)*aspect));
 }
 assert.equal(constellationViewDistance(radius,0,1),null);assert.equal(constellationViewDistance(radius,Math.PI/3,0),null);
});

class Vector{
 constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
 static ZERO=new Vector();static UNIT_Z=new Vector(0,0,1);static UNIT_Y=new Vector(0,1,0);
 static clone(v){return new Vector(v.x,v.y,v.z);}static dot(a,b){return a.x*b.x+a.y*b.y+a.z*b.z;}
 static fromElements(x,y,z,out){return Object.assign(out,{x,y,z});}
 static magnitudeSquared(v){return this.dot(v,v);}static normalize(v,out){const n=Math.sqrt(this.magnitudeSquared(v));return Object.assign(out,{x:v.x/n,y:v.y/n,z:v.z/n});}
 static multiplyByScalar(v,n,out){return Object.assign(out,{x:v.x*n,y:v.y*n,z:v.z*n});}
 static subtract(a,b,out){return Object.assign(out,{x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});}
 static negate(v,out){return this.multiplyByScalar(v,-1,out);}
}
class Collection{items=[];add(value){this.items.push(value);return value;}remove(value){this.items=this.items.filter(item=>item!==value);}get length(){return this.items.length;}}
class Color{constructor(css){this.css=css;}withAlpha(alpha){return {css:this.css,alpha};}static fromCssColorString(css){return new Color(css);}static WHITE=new Color('#fff');static BLACK=new Color('#000');}

async function layerFixture(){
 let onCatalog,panelHandlers,currentRecords=new Map(),flyTo,preRender;
 const C={PointPrimitiveCollection:Collection,LabelCollection:Collection,Cartesian3:Vector,Cartesian2:class{constructor(x,y){Object.assign(this,{x,y});}},Credit:class{},Color,LabelStyle:{FILL_AND_OUTLINE:1},Matrix4:{IDENTITY:{}},Matrix3:{}};
 const primitiveCollection=new Collection(),events=new Map(),canvas={clientWidth:390,clientHeight:844,addEventListener:(type,callback)=>events.set(type,callback),removeEventListener:type=>events.delete(type)};
 const viewer={scene:{primitives:primitiveCollection,canvas,requestRender(){},preRender:{addEventListener:callback=>{preRender=callback;return()=>preRender=null;}}},isDestroyed:()=>false,entities:{remove(){}},camera:{positionWC:new Vector(18000000,0,0),upWC:Vector.UNIT_Z,frustum:{fovy:Math.PI/3,aspectRatio:390/844},cancelFlight(){},lookAtTransform(){},flyTo:options=>flyTo=options}};
 const panel={update(){},select(){},setVisibility(){},setClasses(){},setFollowing(){},position(){},dispose(){}};
 const exported={
  './detection.js':{createSatelliteBrackets:()=>({update(){},remove(){},setVisible(){},setSelected(){},setEnabled(){},dispose(){}}),createSatelliteDetection:()=>({setEnabled(){},dispose(){}})},
  './catalog.js':{REFRESH_MS:21600000,createSatelliteCatalog:options=>{onCatalog=options.onChange;return {get records(){return currentRecords;},refresh:async()=>{},dispose(){}};}},
  './orbits.js':{ISS_NORAD:25544,COVERAGE_MS:14*86400000,propagatePosition:satrec=>satrec.position,computeOrbitPath:()=>({points:[]}),orbitRotation:()=>0},
  '../../vendor/gods-eye-view/satellites/classes.js':{SATELLITE_CLASS_IDS,SATELLITE_CLASS_DISPLAY},
  './panel.js':{createSatellitePanel:options=>{panelHandlers=options;return panel;}},
  './constellation-view.js':{STARLINK_COLOR,STARLINK_POINT_SIZE,constellationRadius,constellationViewDistance},
 };
 const context=vm.createContext({document:{body:{},hidden:false,documentElement:{dataset:{motion:'reduced'}},addEventListener(){},removeEventListener(){}},performance,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){}});
 const module=new vm.SourceTextModule(await readFile(new URL('../src/satellites/cesium-layer.js',import.meta.url),'utf8'),{context});
 await module.link(name=>{const values=exported[name];assert.ok(values,name);return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value]of Object.entries(values))this.setExport(key,value);},{context});});await module.evaluate();
 const layer=module.namespace.createEarthSatellites({Cesium:C,viewer,now:()=>now});
 return {layer,viewer,points:primitiveCollection.items[0],panelHandlers,events,get flyTo(){return flyTo;},get preRender(){return preRender;},publish(records){currentRecords=records;onCatalog({records,status:'loading'});}};
}

test('a growing catalogue renders every Starlink point even when its first ISS record is unchanged',async()=>{
 const f=await layerFixture();
 const station={id:25544,name:'ISS',satelliteClass:'stations',epoch:now,satrec:{position:{x:6800000,y:0,z:0}}};
 try{
   f.publish(new Map([[25544,station]]));assert.equal(f.points.length,1);
   const records=new Map([[25544,station]]);
   for(let i=0;i<10000;i++)records.set(50000+i,{id:50000+i,name:`STARLINK-${i}`,satelliteClass:'starlink',epoch:now,satrec:{a:1.1,ecco:.001,position:{x:6900000,y:i,z:0}}});
   f.publish(records);await until(()=>f.points.length===10001);
   assert.equal(f.points.items.filter(point=>point.show&&point.id!=='relic-satellite:25544').length,10000);
   const original=f.points.items.slice(1,5).map(point=>({...point.position}));
   assert.equal(f.layer.showStarlinkConstellation(),true);assert.ok(f.flyTo);
   const distance=Math.sqrt(Vector.magnitudeSquared(f.flyTo.destination));assert.ok(distance>constellationRadius(records));assert.equal(f.flyTo.duration,0);
   assert.deepEqual(f.points.items.slice(1,5).map(point=>({...point.position})),original,'Framing must not inflate orbital positions');
 }finally{f.layer.dispose();}
 assert.equal(f.viewer.scene.primitives.length,0);assert.equal(f.preRender,null);assert.equal(f.events.size,0);
});
