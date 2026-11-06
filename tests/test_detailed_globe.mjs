import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {normalizeVisualSettings} from '../src/ui/visual-effects.js';

async function fixture(){
  const messages=[],states=[],listeners=new Map(),frames=[];
  const document={documentElement:{dataset:{theme:'night'}},querySelector:()=>true,createElement(tag){
    const value={tag,classList:{add(){}},setAttribute(){},remove(){this.removed=true;},contentWindow:{postMessage:(message,origin)=>messages.push({message,origin})}};
    if(tag==='iframe')frames.push(value);return value;
  }};
  const context=vm.createContext({URL,document,location:{origin:'https://example.invalid'},window:{addEventListener:(type,cb)=>listeners.set(type,cb),removeEventListener:type=>listeners.delete(type)},setTimeout:()=>1,clearTimeout(){}});
  const source=await readFile(new URL('../src/atlas/detailed-globe.js',import.meta.url),'utf8');
  const module=new vm.SourceTextModule(source,{context,initializeImportMeta(meta){meta.url='https://example.invalid/RELIC/src/atlas/detailed-globe.js';}});
  await module.link(name=>{
    assert.equal(name,'../ui/visual-effects.js');
    return new vm.SyntheticModule(['normalizeVisualSettings'],function(){this.setExport('normalizeVisualSettings',normalizeVisualSettings);},{context});
  });await module.evaluate();
  const globe=module.namespace.createDetailedGlobe({host:{append(){}},onState:state=>states.push(state)});
  const receive=(frame,type,state,origin='https://example.invalid')=>listeners.get('message')({origin,source:frame.contentWindow,data:{channel:'relic-detailed-globe-v15',type,state}});
  return {globe,frames,messages,states,receive,listeners,document};
}

test('lazy detail view accepts only the current same-origin frame and releases replaced WebGL frames',async()=>{
  const f=await fixture();f.globe.setFocus({id:'earth',lat:40,lon:2,date:'2026-10-29T12:00:00Z'});
  assert.equal(f.globe.loading,true);assert.equal(f.frames.length,1);
  const first=f.frames[0];assert.equal(first.src,'https://example.invalid/RELIC/pages/globe.html?body=earth&theme=night');
  f.receive(first,'ready',{},'https://untrusted.invalid');assert.equal(f.globe.active,false);
  f.receive(first,'boot');assert.equal(f.messages.at(-1).message.action,'focus');
  f.receive(first,'ready',{latitude:40,longitude:2,rangeMeters:1000});assert.equal(f.globe.active,true);
  f.globe.zoom(.5);assert.equal(f.messages.at(-1).message.action,'zoom');
  f.globe.setFocus({id:'moon'});assert.equal(first.removed,true);assert.equal(f.globe.active,false);
  f.receive(first,'ready',{});assert.equal(f.globe.active,false,'A late replaced frame cannot reclaim the viewport');
  const second=f.frames[1];f.receive(second,'ready',{latitude:0,longitude:0});assert.equal(f.globe.active,true);
  f.globe.hide();assert.equal(second.removed,true);assert.equal(f.globe.active,false);assert.equal(f.globe.getViewState(),null);
  f.globe.dispose();assert.equal(f.listeners.size,0);
});

test('detail failure restores the fallback and unsupported bodies never open a planetary frame',async()=>{
  const f=await fixture();assert.equal(f.globe.setFocus({id:'jupiter'}),false);assert.equal(f.frames.length,0);
  f.globe.setFocus({id:'mars'});f.receive(f.frames[0],'error');
  assert.equal(f.globe.active,false);assert.equal(f.globe.loading,false);assert.equal(f.frames[0].removed,true);
  assert.equal(f.states.at(-1).error,'unavailable');assert.equal(f.globe.zoom(.5),false);f.globe.dispose();
});

test('theme changes reach a loading or ready globe without replacing its camera or focus',async()=>{
  const f=await fixture();f.globe.setFocus({id:'moon',lat:10,lon:20});
  const frame=f.frames[0];f.document.documentElement.dataset.theme='day';
  f.receive(frame,'boot');
  assert.equal(f.messages.at(-2).message.action,'theme');assert.equal(f.messages.at(-2).message.value,'day');
  assert.equal(f.messages.at(-1).message.focus.lat,10);
  f.receive(frame,'ready',{});const focusMessages=f.messages.filter(row=>row.message.action==='focus').length;
  f.document.documentElement.dataset.theme='night';f.listeners.get('relic-preferences-change')();
  assert.equal(f.messages.at(-1).message.value,'night');assert.equal(f.messages.at(-1).message.action,'theme');
  assert.equal(f.frames.length,1);assert.equal(frame.removed,undefined);
  assert.equal(f.messages.filter(row=>row.message.action==='focus').length,focusMessages);f.globe.dispose();
});

// A preview can change before the child frame loads or while it is replaced.
test('the current safe visual settings reach every newly booted detail frame',async()=>{
  const f=await fixture();
  f.globe.setVisualSettings({style:'nvg',stars:false,token:'not-for-the-frame',styleParams:{gain:.7,token:'private'}});
  f.globe.setFocus({id:'earth'});f.receive(f.frames[0],'boot');
  let message=f.messages.at(-1).message;
  assert.equal(message.action,'visualSettings');assert.equal(message.value.style,'nvg');
  assert.equal(message.value.stars,false);assert.equal(message.value.styleParams.gain,.7);
  assert.equal('token' in message.value,false);assert.equal('token' in message.value.styleParams,false);
  f.globe.setFocus({id:'mars'});f.receive(f.frames[1],'boot');
  message=f.messages.at(-1).message;
  assert.equal(message.value.style,'nvg');assert.equal(message.value.styleParams.gain,.7);
  f.globe.dispose();
});
