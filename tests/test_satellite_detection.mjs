import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from '../vendor/cesium/index.js';
import {createSatelliteDetection} from '../src/satellites/detection.js';
import {composeLabel,appendCornerBracket} from '../vendor/gods-eye-view/detection/detectionDraw.js';
test('original GEV geometry has four corner brackets and two bounded label lines',()=>{
 const segments=[];appendCornerBracket({moveTo:(...p)=>segments.push(['M',...p]),lineTo:(...p)=>segments.push(['L',...p])},100,100,8,8);
 assert.equal(segments.filter(p=>p[0]==='M').length,4);assert.equal(segments.length,12);
 const label=composeLabel({id:'SATELLITE-WITH-A-LONG-NAME',klass:'starlink',metric:'NORAD 12345'});
 assert.equal(label.primary.length,18);assert.ok(label.secondary.includes('NORAD 12345'));
});
test('detection keeps names on the visible side, bounds work and clears when disabled',()=>{
 const texts=[],ctx={setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillRect(){},fillText(text){texts.push(text);}};
 let removed=false,callback;
 const canvas={setAttribute(){},getContext:()=>ctx,remove(){removed=true;}};
 const viewer={container:{append(){}},canvas:{clientWidth:800,clientHeight:600},camera:{positionWC:new Cesium.Cartesian3(20000000,0,0)},scene:{postRender:{addEventListener(fn){callback=fn;return()=>callback=null;}}}};
 const C={...Cesium,SceneTransforms:{worldToWindowCoordinates:()=>new Cesium.Cartesian2(250,250)}};
 const rows=[{id:25544,name:'ISS',satelliteClass:'stations'},{id:2,name:'HIDDEN',satelliteClass:'science'}];
 const points=new Map([[25544,{show:true,position:new Cesium.Cartesian3(6800000,0,0)}],[2,{show:true,position:new Cesium.Cartesian3(-6800000,0,0)}]]);
 let time=200;
 const overlay=createSatelliteDetection({Cesium:C,viewer,getCandidates:()=>rows,getPoint:id=>points.get(id),getSelected:()=>null,now:()=>time,documentRef:{createElement:()=>canvas}});
 callback();assert.ok(texts.includes('ISS'));assert.ok(!texts.includes('HIDDEN'));
 const size=texts.length;callback();assert.equal(texts.length,size,'at most ten redraws per second');
 overlay.setEnabled(false);assert.equal(canvas.hidden,true);time+=200;callback();assert.equal(texts.length,size);
 overlay.dispose();assert.equal(removed,true);assert.equal(callback,null);
});

test('every satellite gets a GPU bracket beyond label limits, even at overlapping positions',async()=>{
 const {createSatelliteBrackets}=await import('../src/satellites/detection.js');
 const images=[],collections=[];
 class Billboards{
  items=[];show=true;
  add(value){const frame={...value,setImage:(id,image)=>images.push([id,image])};this.items.push(frame);return frame;}
  remove(frame){this.items.splice(this.items.indexOf(frame),1);}
 }
 const ctx={beginPath(){},moveTo(){},lineTo(){},stroke(){}};
 const image={getContext:()=>ctx};
 const viewer={isDestroyed:()=>false,scene:{primitives:{add(value){collections.push(value);return value;},remove(value){collections.splice(collections.indexOf(value),1);}}}};
 const frames=createSatelliteBrackets({Cesium:{...Cesium,BillboardCollection:Billboards},viewer,documentRef:{createElement:()=>image}});
 const position=new Cesium.Cartesian3(6800000,0,0);
 for(let id=1;id<=1500;id++)frames.update(id,position,true);
 assert.equal(collections[0].items.length,1500,'frame coverage is not limited by the 600-name scan or 48-name cap');
 assert.ok(collections[0].items.every(frame=>frame.show));
 assert.equal(new Set(images.map(([id])=>id)).size,1,'all frames reuse one texture-atlas entry');
 assert.equal(new Set(images.map(([,image])=>image)).size,1);
 const first=collections[0].items[0];frames.update(1,new Cesium.Cartesian3(7000000,1,2),false);
 assert.equal(first.position.x,7000000);assert.equal(first.show,false);
 frames.setVisible(1,true);assert.equal(first.show,true);
 frames.setSelected(1);assert.equal(first.color,Cesium.Color.WHITE);
 frames.setEnabled(false);assert.equal(collections[0].show,false);
 frames.remove(1);assert.equal(collections[0].items.length,1499);
 frames.dispose();assert.equal(collections.length,0);
});
