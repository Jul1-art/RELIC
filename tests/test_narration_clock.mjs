import assert from 'node:assert/strict';
import test from 'node:test';
import {createNarrationClock} from '../src/ui/narration-clock.js';

class Media extends EventTarget{
  currentTime=0;duration=12;paused=true;ended=false;
  emit(type){this.dispatchEvent(new Event(type));}
  play(){this.paused=false;this.ended=false;this.emit('playing');}
  pause(){this.paused=true;this.emit('pause');}
  seek(time){this.currentTime=time;this.emit('seeking');}
}
function setup(){
  const audio=new Media(),frames=new Map(),seen=[];
  let identifier=0,completed=0,unavailable=0;
  const clock=createNarrationClock({audio,cues:[{time:0,id:'normal'},{time:3,id:'crt'},{time:6,id:'nvg'},{time:9,id:'normal'}],
    onCue:cue=>seen.push(cue.id),onComplete:()=>completed++,onUnavailable:()=>unavailable++,
    requestFrame:callback=>{const id=++identifier;frames.set(id,callback);return id;},cancelFrame:id=>frames.delete(id)});
  return {audio,clock,seen,frames,get completed(){return completed;},get unavailable(){return unavailable;},
    frame(){const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback();}};
}

test('Earth cue waits for actual playback, including a blocked play attempt',()=>{
  const state=setup();
  state.audio.emit('timeupdate');state.audio.seek(0);state.frame();
  assert.deepEqual(state.seen,[]);
  assert.equal(state.frames.size,0);
  state.audio.play();
  assert.deepEqual(state.seen,['normal']);
  state.clock.dispose();
});

test('buffering and paused media cannot advance a narrated demonstration',()=>{
  const state=setup();state.audio.play();
  for(let i=0;i<120;i++)state.frame();
  assert.deepEqual(state.seen,['normal']);
  state.audio.currentTime=3.1;state.frame();
  assert.deepEqual(state.seen,['normal','crt']);
  state.audio.pause();
  assert.equal(state.frames.size,0);
  state.audio.currentTime=7;state.audio.emit('timeupdate');state.frame();
  assert.deepEqual(state.seen,['normal','crt']);
  state.audio.play();
  assert.deepEqual(state.seen,['normal','crt','nvg']);
  state.clock.dispose();
});

test('a delayed frame or forward seek applies one current design rather than flashing missed ones',()=>{
  const state=setup();state.audio.play();
  state.audio.currentTime=7.2;state.frame();
  assert.deepEqual(state.seen,['normal','nvg']);
  state.audio.seek(10);
  assert.deepEqual(state.seen,['normal','nvg','normal']);
  state.audio.emit('timeupdate');state.frame();
  assert.equal(state.seen.length,3);
  state.clock.dispose();
});

test('backward seeks reapply the matching design, even when explicitly seeking while paused',()=>{
  const state=setup();state.audio.play();state.audio.seek(7);
  state.audio.pause();state.audio.seek(4);state.audio.seek(1);
  assert.deepEqual(state.seen,['normal','nvg','crt','normal']);
  assert.equal(state.frames.size,0);
  state.clock.dispose();
});

test('completion samples the final design and completes exactly once',()=>{
  const state=setup();state.audio.play();
  state.audio.currentTime=12;state.audio.ended=true;state.audio.paused=true;state.audio.emit('ended');
  assert.deepEqual(state.seen,['normal','normal']);
  assert.equal(state.completed,1);assert.equal(state.frames.size,0);
  state.audio.emit('ended');state.audio.seek(4);state.audio.play();state.frame();
  assert.equal(state.completed,1);assert.equal(state.seen.length,2);
  state.clock.dispose();
});

test('skip/dispose and media failure prevent any later scene changes',()=>{
  const disposed=setup();disposed.audio.play();disposed.clock.dispose();
  disposed.audio.seek(7);disposed.audio.play();disposed.audio.emit('error');disposed.frame();
  assert.deepEqual(disposed.seen,['normal']);assert.equal(disposed.frames.size,0);assert.equal(disposed.unavailable,0);
  const failed=setup();failed.audio.play();failed.audio.emit('error');failed.audio.emit('error');
  failed.audio.seek(7);failed.audio.play();failed.frame();
  assert.deepEqual(failed.seen,['normal']);assert.equal(failed.unavailable,1);assert.equal(failed.frames.size,0);
  failed.clock.dispose();
});
