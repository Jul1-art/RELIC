import test from 'node:test';
import assert from 'node:assert/strict';
import {findZoomFocus,pickFocusNearRay} from '../src/atlas/zoom-focus.js';
const camera={x:0,y:0,z:20},ray={x:0,y:0,z:-1};
const earth={id:'earth',position:{x:0,y:0,z:0},radius:2};
test('approaching a planet along the zoom ray locks it before surface entry',()=>assert.equal(findZoomFocus([earth],camera,ray),'earth'));
test('distant, off-axis and behind-camera worlds do not hijack a zoom',()=>{
  assert.equal(findZoomFocus([earth],{x:0,y:0,z:150},ray),null);
  assert.equal(findZoomFocus([{...earth,position:{x:9,y:0,z:0}}],camera,ray),null);
  assert.equal(findZoomFocus([earth],camera,{x:0,y:0,z:1}),null);
});
test('a world under the pointer wins over a neighbouring planet',()=>{
  const mars={id:'mars',position:{x:3,y:0,z:0},radius:2};
  assert.equal(findZoomFocus([mars,earth],camera,ray),'earth');
});
test('unavailable geometry cannot create a spurious lock',()=>{
  assert.equal(findZoomFocus([{...earth,visible:false}],camera,ray),null);
  assert.equal(findZoomFocus([earth],camera,{x:NaN,y:0,z:1}),null);
});

test('all eight planetary sizes can lock at a large linear heliocentric offset',()=>{
  const planets=[['mercury',1.38,62],['venus',1.8,116],['earth',1.9,160],['mars',1.6,244],['jupiter',3.15,832],['saturn',2.72,1526],['uranus',2.15,3070],['neptune',2.12,4811]];
  for(const [id,radius,x] of planets){
    const body={id,radius,position:{x,y:0,z:-x/2}};
    const observer={x,y:0,z:body.position.z+radius*9};
    assert.equal(findZoomFocus([body],observer,ray),id);
    assert.equal(findZoomFocus([{...body,displayRadius:100000}],{...observer,z:body.position.z+radius*1000},ray),null,'Enlarged overview symbols must not cause a distant lock');
  }
});

test('a fast wheel step cannot jump through the capture region without locking',()=>{
  const body={id:'neptune',radius:2.12,position:{x:4800,y:4,z:-1200}};
  const previousCamera={x:4800,y:4,z:-1000},camera={x:4800,y:4,z:-1260};
  assert.equal(findZoomFocus([body],camera,ray),null,'The current ray is already behind the planet');
  assert.equal(findZoomFocus([body],camera,ray,{previousCamera}),'neptune');
  assert.equal(findZoomFocus([{...body,position:{x:4900,y:4,z:-1200}}],camera,ray,{previousCamera}),null,'Unrelated off-axis worlds must not capture a zoom sweep');
});

test('overshooting just inside a globe acquires it instead of leaving the camera trapped',()=>{
  assert.equal(findZoomFocus([earth],{x:0,y:0,z:.2},ray),'earth');
  assert.equal(findZoomFocus([{...earth,visible:false}],{x:0,y:0,z:.2},ray),null);
});

test('tiny moons use accurate perpendicular distance even at large coordinates',()=>{
  const moon={id:'tiny-moon',radius:1e-5,position:{x:10000,y:0,z:10000}};
  const camera={x:10000.001,y:0,z:10001};
  assert.equal(findZoomFocus([moon],camera,ray,{angularMargin:0,minimumDistance:2}),null);
  assert.equal(findZoomFocus([moon],{...camera,x:10000},ray,{angularMargin:0,minimumDistance:2}),'tiny-moon');
});

test('planetary click and touch targets remain selectable when rendered as small markers',()=>{
  const body={id:'venus',radius:1.8,position:{x:0,y:0,z:0}},origin={x:0,y:0,z:10000};
  const unitsPerPixel=2*10000*Math.tan(40*Math.PI/360)/800;
  const near={...body,position:{x:unitsPerPixel*11,y:0,z:0}};
  assert.equal(pickFocusNearRay([near],origin,ray),'venus');
  const outside={...body,position:{x:unitsPerPixel*18,y:0,z:0}};
  assert.equal(pickFocusNearRay([outside],origin,ray),null);
  assert.equal(pickFocusNearRay([outside],origin,ray,{pixels:22}),'venus');
  assert.equal(pickFocusNearRay([{...near,position:{x:0,y:0,z:11000}}],origin,ray),null);
});

test('the world under the pointer wins generous targets and malformed bodies stay inert',()=>{
  const bodies=[{id:'neighbour',radius:1,position:{x:8,y:0,z:0}},earth];
  assert.equal(pickFocusNearRay(bodies,{x:0,y:0,z:1000},ray),'earth');
  assert.equal(pickFocusNearRay([{...earth,radius:Infinity}],camera,ray),null);
  assert.equal(pickFocusNearRay([earth],camera,ray,{pixels:Infinity}),null);
});
