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
