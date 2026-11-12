import test from 'node:test';
import assert from 'node:assert/strict';
import {createSatellitePanel} from '../src/satellites/panel.js';
class Node{
 constructor(tag){this.tag=tag;this.children=[];this.listeners=new Map();this.dataset={};this.style={setProperty(){}};this.attributes={};this.value='';this.hidden=false;this.open=false;}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
 addEventListener(type,fn){this.listeners.set(type,fn);}emit(type){this.listeners.get(type)?.();}setAttribute(key,value){this.attributes[key]=value;}remove(){this.removed=true;}
}
function find(root,className){if(root.className===className)return root;for(const child of root.children){const found=find(child,className);if(found)return found;}}
const row={id:25544,name:'ISS (ZARYA)',satelliteClass:'stations',epoch:Date.parse('2026-11-12T00:00:00Z'),satrec:{no:.067}};
test('panel exposes the live ISS, class filters, search, and follow commands without an API key form',()=>{
 const previous=globalThis.document;const body=new Node('body'),head=new Node('head');globalThis.document={body,head,documentElement:{lang:'fr'},createElement:tag=>new Node(tag),querySelector:()=>null};
 try{
  let selected,followed,visibility,filter,disposed=false,starlinkRequested=false;
  const panel=createSatellitePanel({getLanguage:()=> 'fr',onLanguageChange:()=>()=>{disposed=true;},onStarlink:()=>starlinkRequested=true,onSelect:(...value)=>selected=value,onFollow:value=>followed=value,onVisibility:value=>visibility=value,onClassChange:(...value)=>filter=value,onRefresh(){}});
  const root=body.children[0];root.open=true;panel.update({records:new Map([[25544,row],[45544,{...row,id:45544,name:'STARLINK-TEST',satelliteClass:'starlink'}]]),status:'ready'});
  assert.equal(find(root,'satellite-count').textContent,'2');assert.match(find(root,'satellite-starlink-count').textContent,/Starlink 1/);find(root,'satellite-starlink').emit('click');assert.equal(starlinkRequested,true);find(root,'satellite-iss').emit('click');assert.deepEqual(selected,[25544,true]);
  panel.select(row);panel.position({latitude:1,longitude:2,altitude:410000,speedMps:7700,at:Date.parse('2026-11-12T12:00:00Z')},true);
  find(root,'satellite-follow').emit('click');assert.equal(followed,false);
  find(root,'satellite-visibility').emit('click');assert.equal(visibility,false);
  const search=find(root,'satellite-search');search.value='25544';search.emit('input');assert.equal(find(root,'satellite-results').children.length,1);
  const input=find(root,'satellite-filters').children[0].children[0];input.checked=false;input.emit('change');assert.deepEqual(filter,['stations',false]);
  panel.setClasses({stations:true});assert.equal(input.checked,true);panel.collapse();assert.equal(root.open,false);panel.dispose();assert.equal(root.removed,true);assert.equal(disposed,true);
 }finally{globalThis.document=previous;}
});
