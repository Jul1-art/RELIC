import test from 'node:test';import assert from 'node:assert/strict';
import {createSimulationClock} from '../src/atlas/simulation-clock.js';
const start=Date.UTC(2026,9,29);

test('default 1x uses real UTC time rather than frame delta or accelerated playback',()=>{
 let now=start;const clock=createSimulationClock({startTime:start,getNow:()=>now});
 assert.equal(clock.state.rate,1);assert.equal(clock.state.live,true);
 now+=1000;assert.equal(clock.advance(.016),1);assert.equal(clock.time,now);
 now+=600000;clock.advance(.05);assert.equal(clock.time,now,'hidden-tab wall time is caught up');
 clock.setRate(86400);clock.advance(1);assert.equal(clock.time,now+86400000);assert.equal(clock.state.live,false);
});

test('inspection holds the view and returns to current UTC only if real time was running',()=>{
 let now=start;const clock=createSimulationClock({startTime:start,getNow:()=>now});
 clock.setInspection(true);now+=600000;clock.advance(100);assert.equal(clock.time,start);
 clock.setInspection(false);assert.equal(clock.time,now);
 clock.pause();clock.setInspection(true);now+=600000;clock.setInspection(false);clock.advance(5);assert.equal(clock.time,start+600000);
 clock.play();assert.equal(clock.time,now);
});

test('accelerated inspection resumes at chosen model date without a wall-clock jump',()=>{
 const clock=createSimulationClock({startTime:start,rate:86400,getNow:()=>start+999999});
 clock.advance(1);clock.setInspection(true);clock.advance(100);assert.equal(clock.time,start+86400000);
 clock.setInspection(false);clock.advance(1);assert.equal(clock.time,start+2*86400000);
});

test('return to now switches from simulation to physical speed and validates dates',()=>{
 let now=start+10000;const clock=createSimulationClock({startTime:start,rate:86400,getNow:()=>now});
 clock.now();assert.equal(clock.state.rate,1);assert.equal(clock.time,now);
 now+=1000;clock.advance(1);assert.equal(clock.time,start+11000);
 assert.throws(()=>clock.now(NaN));assert.throws(()=>clock.setRate(NaN));assert.equal(clock.advance(Infinity),0);
});

test('playback stops at documented ephemeris coverage',()=>{
 const limit=Date.UTC(2033,0,1),clock=createSimulationClock({startTime:limit-1000,rate:86400});clock.advance(1);
 assert.equal(clock.time,limit);assert.equal(clock.state.running,false);assert.equal(clock.state.atEnd,true);
});
