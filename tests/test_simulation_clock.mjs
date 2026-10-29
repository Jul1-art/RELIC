import test from 'node:test';import assert from 'node:assert/strict';
import {createSimulationClock} from '../src/atlas/simulation-clock.js';
const start=Date.UTC(2026,9,29);
test('one shared clock advances by the selected physical time scale',()=>{
 const clock=createSimulationClock({startTime:start});assert.equal(clock.advance(1),86400);assert.equal(clock.time,start+86400000);
 clock.setRate(604800);clock.advance(.5);assert.equal(clock.time,start+86400000+302400000);
});
test('inspection freezes the complete model date without changing the chosen playback preference',()=>{
 const clock=createSimulationClock({startTime:start});clock.setInspection(true);clock.advance(100);assert.equal(clock.time,start);assert.equal(clock.state.running,true);
 clock.setInspection(false);clock.advance(1);assert.equal(clock.time,start+86400000);
 clock.pause();clock.setInspection(true);clock.setInspection(false);clock.advance(5);assert.equal(clock.time,start+86400000);
});
test('pause and return-to-now do not introduce a catch-up jump',()=>{
 const clock=createSimulationClock({startTime:start});clock.pause();clock.advance(3600);assert.equal(clock.time,start);
 clock.now(start+10000);assert.equal(clock.state.rate,1);clock.advance(1);assert.equal(clock.time,start+11000);
});
test('playback stops at documented ephemeris coverage and rejects invalid speed inputs',()=>{
 const limit=Date.UTC(2033,0,1),clock=createSimulationClock({startTime:limit-1000,rate:86400});clock.advance(1);
 assert.equal(clock.time,limit);assert.equal(clock.state.running,false);assert.equal(clock.state.atEnd,true);
 assert.throws(()=>clock.setRate(NaN));assert.equal(clock.advance(Infinity),0);
});
