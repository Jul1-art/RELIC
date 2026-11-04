import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../intro/film-stream-v7.js', import.meta.url),'utf8');
const policySource=await readFile(new URL('../intro/film-buffer-policy.js', import.meta.url),'utf8');
async function fixture({hlsSupported=true,nativeHls=false,src='fixture.mp4',connection={}}={}){
 let hls;
 class Hls {
  static Events={ERROR:'error',MANIFEST_PARSED:'manifest',FRAG_LOADED:'loaded',FRAG_BUFFERED:'buffered'};
  static ErrorTypes={MEDIA_ERROR:'media',NETWORK_ERROR:'network'};
  static isSupported(){return hlsSupported;}
  constructor(config){hls=this;this.config=config;this.handlers={};this.levels=[];this.stops=0;this.starts=0;this.sources=0;}
  on(event,handler){this.handlers[event]=handler;} emit(event,data){this.handlers[event]?.(event,data);}
  attachMedia(){} loadSource(){this.sources++;} startLoad(){this.starts++;} stopLoad(){this.stops++;} recoverMediaError(){} destroy(){this.destroyed=true;}
 }
 class Media extends EventTarget {
  paused=false;currentTime=42;duration=529;playbackRate=1;readyState=2;plays=0;loads=0;src='';ranges=[];
  get buffered(){return {length:this.ranges.length,start:index=>this.ranges[index][0],end:index=>this.ranges[index][1]};}
  load(){this.loads++;}
  play(){this.plays++;this.paused=false;return Promise.resolve();}
  canPlayType(){return nativeHls?'maybe':'';}
 }
 const context=vm.createContext({Event,DOMException,setTimeout,clearTimeout});
 const dependency=new vm.SyntheticModule(['default'],function(){this.setExport('default',Hls);},{context});
 const policy=new vm.SourceTextModule(policySource,{context});await policy.link(()=>{});await policy.evaluate();
 const module=new vm.SourceTextModule(source,{context});
 await module.link(specifier=>specifier.includes('film-buffer-policy')?policy:dependency);await module.evaluate();
 const video=new Media();
 return{video,get hls(){return hls;},attach:options=>module.namespace.attachFilmSource(video,{hls:'fixture.m3u8',src},{connection,...options})};
}

test('attaching a film source and recovering without play intent never starts playback',async()=>{
 const {video,attach}=await fixture();const stream=attach();assert.equal(video.plays,0);
 assert(stream.recover());video.dispatchEvent(new Event('loadedmetadata'));
 assert.equal(video.currentTime,42);assert.equal(video.plays,0);
});
test('source recovery may continue an explicitly requested playback',async()=>{
 const {video,attach}=await fixture();const stream=attach({shouldResume:()=>true});
 assert(stream.recover());video.dispatchEvent(new Event('loadedmetadata'));assert.equal(video.plays,1);
});
test('pausing during recovery cancels its pending playback continuation',async()=>{
 const {video,attach}=await fixture();let intended=true;const stream=attach({shouldResume:()=>intended});
 assert(stream.recover());intended=false;video.dispatchEvent(new Event('loadedmetadata'));assert.equal(video.plays,0);
});
test('a closed player cannot restart when delayed media metadata arrives',async()=>{
 const {video,attach}=await fixture();const stream=attach({shouldResume:()=>true});
 assert(stream.recover());stream.destroy();video.dispatchEvent(new Event('loadedmetadata'));assert.equal(video.plays,0);
});

test('an HLS-only HD edition never falls back to a lower-resolution file',async()=>{
 const {video,attach}=await fixture({src:''});const stream=attach();
 assert.equal(stream.mode,'hls');assert.equal(stream.recover(),false);assert.equal(video.src,'');assert.equal(video.plays,0);
});
test('native HLS opens the same HD playlist without starting playback',async()=>{
 const {video,attach}=await fixture({hlsSupported:false,nativeHls:true,src:''});const stream=attach();
 assert.equal(stream.mode,'native-hls');assert.equal(video.src,'fixture.m3u8');assert.equal(video.plays,0);assert.equal(stream.recover(),false);
});
test('an unsupported stream reports failure without loading an empty document or playing',async()=>{
 const {video,attach}=await fixture({hlsSupported:false,src:''});
 assert.throws(()=>attach(),/does not support the film stream/);assert.equal(video.loads,0);assert.equal(video.plays,0);
});

test('preloading creates a bounded HD reserve without ever calling play',async()=>{
 const f=await fixture();const states=[];const stream=f.attach({onBuffer:state=>states.push(state)});
 assert.equal(f.video.preload,'auto');assert.equal(f.video.plays,0);assert.equal(f.hls.config.maxBufferLength,32);
 f.video.ranges=[[42,74]];f.video.dispatchEvent(new Event('progress'));
 assert.equal(stream.getBufferState().ahead,32);assert.equal(stream.getBufferState().ready,true);
 assert.equal(states.at(-1).preloading,true);stream.destroy();
});

test('buffer preparation waits for contiguous reserve and is cancellable',async()=>{
 const f=await fixture();const stream=f.attach();stream.setPlaybackIntent(true);
 const abort=new AbortController();let completed=false;
 const ready=stream.waitForBuffer({signal:abort.signal}).then(()=>{completed=true;});
 f.video.ranges=[[90,140]];f.video.dispatchEvent(new Event('progress'));await Promise.resolve();assert.equal(completed,false);
 f.video.ranges=[[42,50]];f.video.dispatchEvent(new Event('progress'));await ready;assert.equal(completed,true);assert.equal(f.video.plays,0);
 f.video.currentTime=200;
 const cancel=stream.waitForBuffer({signal:abort.signal});abort.abort();await assert.rejects(cancel,{name:'AbortError'});
 stream.destroy();
});

test('rebuffering requires a larger reserve instead of restarting with one frame',async()=>{
 const f=await fixture();const stream=f.attach();stream.setPlaybackIntent(true);f.video.ranges=[[42,50]];
 assert.equal(stream.getBufferState().ready,true);assert.equal(stream.getBufferState(true).ready,false);
 let done=false;const ready=stream.waitForBuffer({rebuffer:true}).then(()=>{done=true;});
 f.video.dispatchEvent(new Event('progress'));await Promise.resolve();assert.equal(done,false);
 f.video.ranges=[[42,66]];f.video.dispatchEvent(new Event('progress'));await ready;assert.equal(f.video.plays,0);stream.destroy();
});

test('background suspension stops requests and resumes the retained source',async()=>{
 const f=await fixture();const stream=f.attach();f.hls.levels=[{}];f.hls.emit('manifest');
 stream.suspend(true);assert.equal(f.hls.stops,1);assert.equal(stream.getBufferState().suspended,true);
 stream.suspend(false);assert.equal(f.hls.starts,1);assert.equal(f.hls.sources,1);assert.equal(f.video.plays,0);
 const ready=stream.waitForBuffer();stream.destroy();await assert.rejects(ready,{name:'AbortError'});
 assert.equal(f.hls.destroyed,true);
});
