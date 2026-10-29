import test from 'node:test';
import assert from 'node:assert/strict';
import {displayedMoonRadius,moonOrbitOpacity} from '../src/atlas/moon-visibility.js';

test('zooming away from Saturn never opts into the full orbit catalogue',()=>{
  for(const distance of [16,40,400,4000,40000])assert.equal(moonOrbitOpacity({distance,planetRadius:2.72,count:292}).all,0);
  const explicit=moonOrbitOpacity({mode:'all',distance:4000,planetRadius:2.72,count:292});
  assert(explicit.all>0&&explicit.all<.05);assert.equal(explicit.inner,0);
});
test('moon orbits fade in continuously and clear the selected close-up',()=>{
  const a=moonOrbitOpacity({distance:6.99,planetRadius:1}),b=moonOrbitOpacity({distance:7.01,planetRadius:1});
  assert(Math.abs(a.inner-b.inner)<.003);
  assert.deepEqual(moonOrbitOpacity({mode:'all',distance:1000,planetRadius:1,closeMoon:true}),{inner:0,all:0});
});
test('unselected major moons remain readable while selected moons keep safe framing',()=>{
  const view={baseRadius:.05,distance:200,viewportHeight:800,fovDeg:40,major:true};
  const desktop=displayedMoonRadius(view),touch=displayedMoonRadius({...view,touch:true});
  assert(desktop>view.baseRadius&&touch>desktop);
  assert.equal(displayedMoonRadius({...view,selected:true}),view.baseRadius);
  assert(displayedMoonRadius({...view,allOrbits:true})<desktop);
});
