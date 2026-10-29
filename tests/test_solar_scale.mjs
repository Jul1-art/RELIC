import test from 'node:test';
import assert from 'node:assert/strict';
import {AU_KM,auToWorld,kmToWorld,scaleRuler} from '../src/atlas/solar-scale.js';

test('linear solar distances preserve physical ratios from Mercury to Kuiper belt',()=>{
  assert.equal(auToWorld(0),0);
  for(const distance of [.3075,1,5.2,30,50]){
    assert.equal(auToWorld(distance)/auToWorld(1),distance);
    assert.ok(Math.abs(kmToWorld(distance*AU_KM)-auToWorld(distance))<1e-10);
  }
  assert.ok(auToWorld(.723)-auToWorld(.387)>50);
});

test('perspective ruler converts a chosen readable length back to true kilometres',()=>{
  const context={distance:5000,fov:40,viewportHeight:800,kmPerWorldUnit:AU_KM/160,maxPixels:140};
  const ruler=scaleRuler(context);
  assert.equal(ruler.unit,'AU');assert.ok(ruler.pixels>25&&ruler.pixels<=140);
  assert.ok(Math.abs(ruler.pixels*ruler.kmPerPixel-ruler.value*AU_KM)<1);
  const twice=scaleRuler({...context,distance:10000});
  assert.equal(twice.kmPerPixel/ruler.kmPerPixel,2);
});

test('close-up ruler uses local physical body scale and rejects invalid frames',()=>{
  const ruler=scaleRuler({distance:.02,fov:40,viewportHeight:800,kmPerWorldUnit:6371/1.9});
  assert.equal(ruler.unit,'km');assert.ok(ruler.value<20);
  assert.equal(scaleRuler({distance:NaN,fov:40,viewportHeight:800,kmPerWorldUnit:1}),null);
});
