import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderedFrameMeter} from '../src/worlds/world-performance.js';
test('FPS uses actual render counts and elapsed wall time, including stalls and idle',()=>{
 let clock=0,hidden=false;const reports=[];const meter=createRenderedFrameMeter({now:()=>clock,hidden:()=>hidden,report:n=>reports.push(n)});
 for(let i=0;i<37;i++)meter.frame();clock=1000;assert.equal(meter.sample(),37);
 clock=2000;assert.equal(meter.sample(),0);
 for(let i=0;i<8;i++)meter.frame();clock=4000;assert.equal(meter.sample(),4,'A two second stall must not be reported as eight FPS');
 for(let i=0;i<120;i++)meter.frame();clock=5000;assert.equal(meter.sample(),120,'No 60 FPS cap or invented target');
 hidden=true;meter.frame();clock=6000;assert.equal(meter.sample(),null);hidden=false;meter.reset();clock=6100;assert.equal(meter.sample(),null);meter.frame();clock=7000;assert.equal(meter.sample(),1);
 assert.deepEqual(reports,[37,0,4,120,1]);
});
