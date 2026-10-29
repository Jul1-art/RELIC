import test from 'node:test';
import assert from 'node:assert/strict';
import {findZoomFocus} from '../src/atlas/zoom-focus.js';
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
