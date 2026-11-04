import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

async function fixture({saved={language:'fr',theme:'day',accent:'nasa',motion:'reduced',quality:'high'},legacy='day'}={}){
  const stored=new Map([
    ['relic.preferences.v1',JSON.stringify(saved)],
    ['nasa-atlas-theme',legacy],['relic.api.cesium-ion','fixture-token-unchanged']
  ]),writes=[],listeners=new Map(),documentListeners=new Map(),languageListeners=[];
  const listen=(map,type,handler)=>{if(!map.has(type))map.set(type,[]);map.get(type).push(handler);};
  const emit=(type,event={})=>{for(const handler of listeners.get(type)||[])handler(event);};
  let language='fr',dialog=null;
  const root={dataset:{theme:'night',accent:'mono'},style:{}},meta={};
  function node(){
    const slots=new Map(),attributes=new Map();
    return {dataset:{},attributes,innerHTML:'',open:false,hidden:false,disabled:false,
      setAttribute(key,value){attributes.set(key,value);},removeAttribute(key){attributes.delete(key);},focus(){},addEventListener(){},closest(){return null;},
      showModal(){this.open=true;},close(){this.open=false;},
      querySelector(selector){if(!slots.has(selector))slots.set(selector,node());return slots.get(selector);},
      querySelectorAll(){return [];}};
  }
  const toggle=node();
  const context=vm.createContext({
    document:{documentElement:root,activeElement:node(),body:{appendChild(value){dialog=value;}},
      querySelector:selector=>selector.startsWith('meta')?meta:selector.startsWith('link')?{}:null,
      querySelectorAll:selector=>selector==='[data-theme-toggle]'?[toggle]:[],createElement:()=>node(),addEventListener:(type,handler)=>listen(documentListeners,type,handler)},
    localStorage:{getItem:key=>stored.get(key)||null,setItem(key,value){
      assert.ok(['relic.preferences.v1','nasa-atlas-theme'].includes(key),'Appearance may not write credential records');
      writes.push(key);stored.set(key,value);
    }},
    CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},
    window:{addEventListener:(type,handler)=>listen(listeners,type,handler),dispatchEvent:event=>emit(event.type,event)},
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
  async function loadTheme(){
    const source=await readFile(new URL('../src/ui/theme.js',import.meta.url),'utf8');
    const theme=new vm.SourceTextModule(source,{context});
    await theme.link(name=>name.endsWith('app-settings.js')?module:name.includes('atlas-live')?live:Promise.reject(new Error('Unexpected theme dependency')));
    await theme.evaluate();
  }
  function clickToggle({prevented=false}={}){
    const event={defaultPrevented:prevented,target:{closest:()=>toggle},preventDefault(){this.defaultPrevented=true;}};
    for(const handler of documentListeners.get('click')||[])handler(event);
  }
  return {api:module.namespace,stored,writes,emit,root,meta,toggle,clickToggle,loadTheme,get dialog(){return dialog;}};
}

test('saved light appearance survives loading while unrelated preferences and provider credentials stay intact',async()=>{
  const f=await fixture(),preferences=f.api.getPreferences();
  assert.equal(preferences.theme,'day');assert.equal(preferences.accent,'mono');
  assert.equal(preferences.language,'fr');assert.equal(preferences.quality,'high');assert.equal(preferences.motion,'reduced');
  assert.equal(f.root.dataset.theme,'day');assert.equal(f.root.style.colorScheme,'light');assert.equal(f.meta.content,'#f5f5f7');
  assert.equal(f.stored.get('relic.api.cesium-ion'),'fixture-token-unchanged');
  assert.deepEqual(f.writes,[],'Loading a theme does not overwrite saved choices');
});

test('switching day and night persists the actual choice while retaining supported interaction preferences',async()=>{
  const f=await fixture();
  for(const theme of ['night','day']){
    f.api.setPreferences({theme,accent:'nasa',motion:'full',quality:'adaptive'});
    const preferences=f.api.getPreferences(),persisted=JSON.parse(f.stored.get('relic.preferences.v1'));
    assert.equal(preferences.theme,theme);assert.equal(preferences.accent,'mono');
    assert.equal(preferences.motion,'full');assert.equal(preferences.quality,'adaptive');
    assert.equal(persisted.theme,theme);assert.equal(persisted.accent,'mono');
    assert.equal(f.stored.get('nasa-atlas-theme'),theme);
    assert.equal(f.stored.get('relic.api.cesium-ion'),'fixture-token-unchanged');
  }
});

test('valid cross-tab appearance changes update the view and invalid modes cannot replace it',async()=>{
  const f=await fixture();
  f.emit('storage',{key:'relic.preferences.v1',newValue:JSON.stringify({theme:'night',accent:'nasa',motion:'full',quality:'adaptive'})});
  assert.equal(f.api.getPreferences().theme,'night');assert.equal(f.api.getPreferences().accent,'mono');
  assert.equal(f.api.getPreferences().motion,'full');assert.equal(f.root.dataset.theme,'night');
  f.emit('storage',{key:'relic.preferences.v1',newValue:JSON.stringify({theme:'invalid'})});
  assert.equal(f.api.getPreferences().theme,'night');
});

test('legacy light preference is retained when the current record has no appearance choice',async()=>{
  const f=await fixture({saved:{motion:'reduced'},legacy:'day'});
  assert.equal(f.api.getPreferences().theme,'day');assert.equal(f.api.getPreferences().motion,'reduced');
});

test('the settings window offers readable light/dark appearance along with language, quality and motion',async()=>{
  const f=await fixture();f.api.openSettings();
  assert.ok(f.dialog.open);
  for(const field of ['language','theme','quality','motion'])assert.ok(f.dialog.innerHTML.includes(`data-settings-field="${field}"`));
  for(const mode of ['day','night'])assert.ok(f.dialog.innerHTML.includes(`data-setting="theme" data-value="${mode}"`));
  assert.ok(!f.dialog.innerHTML.includes('data-settings-field="accent"'));
  assert.ok(f.dialog.innerHTML.includes('data-settings-provider'),'Provider settings remain available to the public edition');
});

test('the dock toggle switches once, reflects the saved state and remains synchronized after late mounting',async()=>{
  const f=await fixture();await f.loadTheme();
  assert.equal(f.toggle.dataset.themeState,'day');assert.equal(f.toggle.attributes.get('aria-pressed'),'true');
  f.clickToggle();
  assert.equal(f.api.getPreferences().theme,'night');assert.equal(f.toggle.dataset.themeState,'night');
  assert.equal(f.toggle.attributes.get('aria-pressed'),'false');assert.equal(f.root.style.colorScheme,'dark');
  f.emit('relic-action-rail-mounted');assert.equal(f.toggle.dataset.themeState,'night');
  f.clickToggle({prevented:true});assert.equal(f.api.getPreferences().theme,'night','An already handled click must not toggle twice');
  f.emit('storage',{key:'nasa-atlas-theme',newValue:'day'});
  assert.equal(f.root.dataset.theme,'day');assert.equal(f.toggle.dataset.themeState,'day');
});
