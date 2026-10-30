import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

async function fixture(){
  const stored=new Map([
    ['relic.preferences.v1',JSON.stringify({language:'fr',theme:'day',accent:'nasa',motion:'reduced',quality:'high'})],
    ['nasa-atlas-theme','day'],['relic.api.cesium-ion','fixture-token-unchanged']
  ]),writes=[],listeners=new Map(),languageListeners=[];
  let language='fr',dialog=null;
  const root={dataset:{theme:'day',accent:'nasa'}},meta={};
  function node(){
    const slots=new Map();
    return {dataset:{},innerHTML:'',open:false,hidden:false,
      setAttribute(){},removeAttribute(){},focus(){},addEventListener(){},
      showModal(){this.open=true;},close(){this.open=false;},
      querySelector(selector){if(!slots.has(selector))slots.set(selector,node());return slots.get(selector);},
      querySelectorAll(){return [];}};
  }
  const context=vm.createContext({
    document:{documentElement:root,activeElement:node(),body:{appendChild(value){dialog=value;}},
      querySelector:selector=>selector.startsWith('meta')?meta:selector.startsWith('link')?{}:null,
      querySelectorAll:()=>[],createElement:()=>node(),addEventListener(){}},
    localStorage:{getItem:key=>stored.get(key)||null,setItem(key,value){
      assert.ok(['relic.preferences.v1','nasa-atlas-theme'].includes(key),'Appearance may not write credential records');
      writes.push(key);stored.set(key,value);
    }},
    CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},
    window:{addEventListener:(type,handler)=>listeners.set(type,handler),dispatchEvent(){}},
    matchMedia:()=>({matches:false,addEventListener(){}}),URL
  });
  const live=new vm.SyntheticModule(['getLanguage','setLanguage','onLanguageChange'],function(){
    this.setExport('getLanguage',()=>language);
    this.setExport('setLanguage',value=>{language=value;for(const callback of languageListeners)callback(value);});
    this.setExport('onLanguageChange',callback=>{languageListeners.push(callback);callback(language);return ()=>{};});
  },{context});
  const icons=new vm.SyntheticModule(['worldIcon'],function(){this.setExport('worldIcon',()=>'<svg></svg>');},{context});
  const source=await readFile(new URL('../src/ui/app-settings.js',import.meta.url),'utf8');
  const module=new vm.SourceTextModule(source,{context,initializeImportMeta(meta){meta.url='https://example.invalid/RELIC/src/ui/app-settings.js';}});
  await module.link(name=>name.includes('atlas-live')?live:name.endsWith('world-icons.js')?icons:Promise.reject(new Error('Unexpected settings dependency')));
  await module.evaluate();
  return {api:module.namespace,stored,writes,listeners,root,meta,get dialog(){return dialog;}};
}

test('legacy light and blue preferences become black and white without changing interaction preferences',async()=>{
  const f=await fixture(),preferences=f.api.getPreferences();
  assert.equal(preferences.theme,'night');assert.equal(preferences.accent,'mono');
  assert.equal(preferences.language,'fr');assert.equal(preferences.quality,'high');assert.equal(preferences.motion,'reduced');
  assert.equal(f.root.dataset.theme,'night');assert.equal(f.root.dataset.accent,'mono');assert.equal(f.meta.content,'#000000');
  assert.equal(f.stored.get('relic.api.cesium-ion'),'fixture-token-unchanged');
});

test('the settings API refuses removed appearance modes while preserving supported changes and credential records',async()=>{
  const f=await fixture();
  f.api.setPreferences({theme:'day',accent:'nasa',motion:'full',quality:'adaptive'});
  const preferences=f.api.getPreferences(),persisted=JSON.parse(f.stored.get('relic.preferences.v1'));
  assert.equal(preferences.theme,'night');assert.equal(preferences.accent,'mono');
  assert.equal(preferences.motion,'full');assert.equal(preferences.quality,'adaptive');
  assert.equal(persisted.theme,'night');assert.equal(persisted.accent,'mono');
  assert.equal(f.stored.get('nasa-atlas-theme'),'night');
  assert.equal(f.stored.get('relic.api.cesium-ion'),'fixture-token-unchanged');
});

test('a legacy settings message from another tab cannot restore light mode or a blue accent',async()=>{
  const f=await fixture();
  f.listeners.get('storage')({key:'relic.preferences.v1',newValue:JSON.stringify({theme:'day',accent:'nasa',motion:'full',quality:'adaptive'})});
  assert.equal(f.api.getPreferences().theme,'night');assert.equal(f.api.getPreferences().accent,'mono');
  assert.equal(f.api.getPreferences().motion,'full');assert.equal(f.root.dataset.theme,'night');
});

test('the settings window exposes language, quality and motion without obsolete appearance choices',async()=>{
  const f=await fixture();f.api.openSettings();
  assert.ok(f.dialog.open);
  assert.ok(f.dialog.innerHTML.includes('data-settings-field="language"'));
  assert.ok(f.dialog.innerHTML.includes('data-settings-field="quality"'));
  assert.ok(f.dialog.innerHTML.includes('data-settings-field="motion"'));
  assert.ok(!f.dialog.innerHTML.includes('data-settings-field="theme"'));
  assert.ok(!f.dialog.innerHTML.includes('data-settings-field="accent"'));
  assert.ok(f.dialog.innerHTML.includes('data-settings-provider'),'Provider settings remain available to the public edition');
});
