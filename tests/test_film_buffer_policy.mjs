import test from 'node:test';
import assert from 'node:assert/strict';
import {bufferedFilmSeconds,filmBufferPolicy} from '../intro/film-buffer-policy.js';

const ranges=values=>({length:values.length,start:index=>values[index][0],end:index=>values[index][1]});
test('only the contiguous playable range counts toward the reserve',()=>{
 assert.equal(bufferedFilmSeconds(ranges([[0,8],[8.05,16],[30,80]]),4),12);
 assert.equal(bufferedFilmSeconds(ranges([[30,80]]),4),0);
 assert.equal(bufferedFilmSeconds(null,4),0);
});
test('slower measured links prepare a larger reserve before playback',()=>{
 const normal=filmBufferPolicy();const slow=filmBufferPolicy({bandwidth:1500000});
 assert.equal(normal.required,8);assert.equal(normal.preloadTarget,32);
 assert(slow.required>normal.required);assert(slow.preloadTarget>=slow.required);
 assert(slow.forwardTarget<=144);assert.equal(slow.slow,true);
});
test('memory, remaining duration and playback speed bound the buffer',()=>{
 const low=filmBufferPolicy({connection:{effectiveType:'3g'},deviceMemory:2,playing:true});
 assert(low.forwardTarget<=64);assert(low.required<=56);assert.equal(low.maxBufferBytes,48*1024*1024);
 const end=filmBufferPolicy({duration:100,position:98,playing:true,rebuffer:true});
 assert.equal(end.required,2);assert.equal(end.forwardTarget,2);
 const fast=filmBufferPolicy({bandwidth:4000000,playbackRate:2});
 assert.equal(fast.slow,true);assert(fast.required>8);
});
