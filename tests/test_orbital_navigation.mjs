import test from 'node:test';
import assert from 'node:assert/strict';
import {wheelZoomFactor,systemExitDistance,finiteCameraState} from '../src/atlas/orbital-navigation.js';

test('one wheel notch cannot nearly double a focused-world distance',()=>{
  assert.ok(wheelZoomFactor(120)>1&&wheelZoomFactor(120)<1.2);
  assert.ok(wheelZoomFactor(50000)<1.25);
  assert.ok(Math.abs(wheelZoomFactor(120)*wheelZoomFactor(-120)-1)<1e-12);
});
test('line and pixel wheel devices produce equivalent gestures and invalid input does not move',()=>{
  assert.equal(wheelZoomFactor(3,1),wheelZoomFactor(48));
  assert.equal(wheelZoomFactor(NaN),1);
  assert.ok(wheelZoomFactor(2)<wheelZoomFactor(120));
});
test('ordinary zoom-out uses the inner system; all-orbits exploration stays available explicitly',()=>{
  assert.ok(systemExitDistance(3,150,3000)<1000);
  assert.ok(systemExitDistance(3,150,3000,'all')>10000);
  assert.equal(finiteCameraState({x:0,y:1,z:2},{x:0,y:0,z:0}),true);
  assert.equal(finiteCameraState({x:NaN,y:1,z:2},{x:0,y:0,z:0}),false);
});
