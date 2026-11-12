import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
test('touch rendering targets 60 Hz within a pixel budget and reduces resolution when renders are slow',async()=>{
 let clock=1;const context=vm.createContext({performance:{now:()=>clock},document:{hidden:false},devicePixelRatio:3});
 const module=new vm.SourceTextModule(await readFile(new URL('../src/worlds/world-performance.js',import.meta.url),'utf8'),{context});await module.link(()=>{});await module.evaluate();
 let pre,post,removed=0;
 const viewer={canvas:{clientWidth:1024,clientHeight:1366},scene:{preRender:{addEventListener:f=>(pre=f,()=>removed++)},postRender:{addEventListener:f=>(post=f,()=>removed++)},requestRender(){}}};
 const adaptive=module.namespace.installAdaptiveWorldQuality(viewer,{compact:true});const first=viewer.resolutionScale;
 assert.equal(viewer.targetFrameRate,60);assert.ok(1024*1366*first*first<=1000001);
 for(let i=0;i<24;i++){pre();clock+=25;post();clock+=250;}
 assert.ok(viewer.resolutionScale<first);assert.ok(viewer.resolutionScale>=.65);assert.equal(viewer.targetFrameRate,60);
 adaptive.dispose();assert.equal(removed,2);
 const cadence=module.namespace.installAdaptiveWorldQuality(viewer,{compact:true}),initial=viewer.resolutionScale;
 for(let i=0;i<24;i++){pre();clock+=1;post();clock+=24;}
 assert.ok(viewer.resolutionScale<initial,'Slow continuous frame cadence adapts even when CPU draw submission is cheap');cadence.dispose();assert.equal(removed,4);
});
