import test from 'node:test';
import assert from 'node:assert/strict';
import {createInspectionLink,readInspectionLink} from '../src/ui/inspection-controls.js';

test('the shared link contains the selected world and its public view fields only',()=>{
  const state={body:'moon',latitude:0,longitude:23.47,rangeMeters:1500,headingDeg:35,tiltDeg:25,
    settings:{style:'crt',accessToken:'fixture-credential'},accessToken:'fixture-credential'};
  const url=new URL(createInspectionLink(state,'https://example.invalid/relic/index.html?key=fixture-credential#private'));
  assert.equal(url.searchParams.get('body'),'moon');
  assert.equal(url.searchParams.get('view'),'inspection');
  assert.equal(url.hash,'');
  assert.ok(!url.href.includes('fixture-credential'));
  assert.deepEqual(readInspectionLink(url),{lat:0,lon:23.47,range:1500,heading:35,tilt:25,style:'crt'});
});

test('restoration rejects malformed coordinates, ranges, and unsupported effects',()=>{
  assert.deepEqual(readInspectionLink('https://example.invalid/index.html?lat=91&lon=-181&range=-1&heading=&tilt=Infinity&visual=custom'),{});
});
