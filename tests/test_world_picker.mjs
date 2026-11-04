import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const context=vm.createContext({URL,setTimeout,clearTimeout});
const source=await readFile(new URL('../src/ui/planet-dashboard.js',import.meta.url),'utf8');
const services={getLanguage:()=> 'en',onLanguageChange:()=>{},worldIcon:()=>'',parseCoordinateQuery:()=>null,searchPlaces:async()=>[],navigateTo:()=>{}};
const imports=new vm.SyntheticModule(Object.keys(services),function(){for(const [name,value]of Object.entries(services))this.setExport(name,value);},{context});
const module=new vm.SourceTextModule(source,{context,initializeImportMeta(meta){meta.url='https://example.invalid/RELIC/src/ui/planet-dashboard.js';}});
await module.link(()=>imports);await module.evaluate();
const {createWorldPickerNavigation}=module.namespace;

class Element{
 constructor(id='',document=null){this.id=id;this.document=document;this.parent=null;this.children=[];this.listeners=new Map();this.attributes=new Map();this.dataset={};this.hidden=false;this.inert=false;this.tabIndex=-1;this.classes=new Set();this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};}
 append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
 contains(node){return this===node||this.children.some(child=>child.contains(node));}
 setAttribute(name,value){this.attributes.set(name,String(value));}
 getAttribute(name){return this.attributes.get(name)??null;}
 removeAttribute(name){this.attributes.delete(name);}
 addEventListener(type,handler){const list=this.listeners.get(type)||[];list.push(handler);this.listeners.set(type,list);}
 removeEventListener(type,handler){this.listeners.set(type,(this.listeners.get(type)||[]).filter(value=>value!==handler));}
 emit(type,properties={}){const event={type,target:this,key:'',preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...properties};let target=this;do{for(const handler of target.listeners.get(type)||[])handler(event);target=event.stopped?null:target.parent;}while(target);return event;}
 click(){return this.emit('click');}
 focus(){for(let node=this;node;node=node.parent)if(node.hidden||node.inert)return;this.document.activeElement=this;}
 scrollIntoView(){}
}
function fixture(){
 const documentRef=new Element('document'),frames=[],chosen=[],clicks=[];
 const node=id=>new Element(id,documentRef);
 const picker=node('picker'),toggle=node('trigger'),list=node('worlds'),outside=node('outside');list.hidden=true;
 const ids=['overview','earth','moon','mars','neptune'],options=new Map(ids.map(id=>[id,node('world-'+id)]));
 list.append(...options.values());picker.append(toggle,list);documentRef.append(picker,outside);documentRef.activeElement=outside;
 picker.addEventListener('click',event=>clicks.push(event.target.id));
 let body='earth';
 const controller=createWorldPickerNavigation({picker,toggle,list,options,getBody:()=>body,getNames:()=>({overview:'Solar system',earth:'Earth',moon:'Moon',mars:'Mars',neptune:'Neptune'}),onChoose:id=>chosen.push(id),documentRef,frame:fn=>frames.push(fn)});
 const inline=focus=>picker.emit('planet-dashboard-picker',{detail:{inline:true,focus}});
 return {picker,toggle,list,outside,documentRef,options,chosen,clicks,controller,inline,flush(){while(frames.length)frames.shift()();},setBody(value){body=value;controller.refresh();}};
}

test('inline Worlds remains exposed through Tab, focus transfers and pointer interactions',()=>{
 const f=fixture();f.inline(true);
 assert.equal(f.list.hidden,false);assert.equal(f.toggle.hidden,true);assert.equal(f.toggle.inert,true);assert.equal(f.list.tabIndex,0);assert.equal(f.documentRef.activeElement,f.list);
 const tab=f.list.emit('keydown',{key:'Tab'});assert.notEqual(tab.defaultPrevented,true);
 f.outside.focus();f.picker.emit('focusout',{relatedTarget:f.outside});f.documentRef.emit('pointerdown',{target:f.outside});f.flush();
 assert.equal(f.list.hidden,false);assert.equal(f.picker.dataset.open,'true');assert.equal(f.documentRef.activeElement,f.outside);
 f.controller.close();assert.equal(f.list.hidden,false);f.controller.dispose();
});

test('inline arrow keys, Home, End and localized typeahead use the production selection path',()=>{
 const f=fixture();f.inline(true);
 f.list.emit('keydown',{key:'End'});assert.equal(f.list.getAttribute('aria-activedescendant'),'world-neptune');
 f.list.emit('keydown',{key:'Home'});assert.equal(f.list.getAttribute('aria-activedescendant'),'world-overview');
 f.list.emit('keydown',{key:'ArrowUp'});assert.equal(f.list.getAttribute('aria-activedescendant'),'world-neptune');
 f.list.emit('keydown',{key:'m'});assert.equal(f.list.getAttribute('aria-activedescendant'),'world-moon');
 f.list.emit('keydown',{key:'Enter'});assert.deepEqual(f.chosen,['moon']);assert.deepEqual(f.clicks,['world-moon']);assert.equal(f.list.hidden,false);
 f.controller.dispose();
});

test('choosing the current world with Enter still emits a click so the dock can dismiss',()=>{
 const f=fixture();f.inline(true);f.list.emit('keydown',{key:'Enter'});
 assert.deepEqual(f.chosen,['earth']);assert.deepEqual(f.clicks,['world-earth']);assert.equal(f.list.hidden,false);
 const escape=f.list.emit('keydown',{key:'Escape'});assert.notEqual(escape.defaultPrevented,true);assert.notEqual(escape.stopped,true);
 f.setBody('mars');assert.equal(f.list.getAttribute('aria-activedescendant'),'world-mars');f.controller.dispose();
});

test('ordinary dropdown keeps its independent close, Escape and focus-return behavior',()=>{
 const f=fixture();f.toggle.click();assert.equal(f.list.hidden,false);assert.equal(f.documentRef.activeElement,f.list);
 f.list.emit('keydown',{key:'Escape'});assert.equal(f.list.hidden,true);assert.equal(f.documentRef.activeElement,f.toggle);
 f.toggle.click();f.list.emit('keydown',{key:'Tab'});assert.equal(f.list.hidden,true);
 f.toggle.click();f.documentRef.emit('pointerdown',{target:f.outside});assert.equal(f.list.hidden,true);
 f.controller.setInline(false);assert.equal(f.toggle.hidden,false);assert.equal(f.toggle.inert,false);assert.equal(f.list.hidden,true);assert.equal(f.list.tabIndex,-1);
 f.toggle.click();f.outside.focus();f.picker.emit('focusout',{relatedTarget:f.outside});f.flush();assert.equal(f.list.hidden,true);f.controller.dispose();
});
