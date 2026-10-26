import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../intro/film-stream-v7.js',import.meta.url),'utf8');
async function fixture(){
 class Hls {
  static Events={ERROR:'error'};
  static ErrorTypes={MEDIA_ERROR:'media'};
  static isSupported(){return true;}
  on(){} attachMedia(){} loadSource(){} recoverMediaError(){} destroy(){}
 }
 class Media extends EventTarget {
  paused=false;currentTime=42;duration=529;plays=0;loads=0;src='';
  load(){this.loads++;}
  play(){this.plays++;this.paused=false;return Promise.resolve();}
  canPlayType(){return '';}
 }
 const context=vm.createContext({Event});
 const dependency=new vm.SyntheticModule(['default'],function(){this.setExport('default',Hls);},{context});
 const module=new vm.SourceTextModule(source,{context});
 await module.link(()=>dependency);await module.evaluate();
 const video=new Media();
 return{video,attach:options=>module.namespace.attachFilmSource(video,{hls:'fixture.m3u8',src:'fixture.mp4'},options)};
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
