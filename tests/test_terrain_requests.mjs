import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../earth-terrain.js',import.meta.url),'utf8');
async function terrainFixture(staticHost){
 let available=!staticHost,calls=0;const statuses=[];
 const context=vm.createContext({document:{baseURI:'https://example.invalid/app/'},URL,Float32Array,Number,Map,Error,AbortController,setTimeout,clearTimeout,queueMicrotask,fetch:async()=>{calls++;return{ok:false,status:404,headers:{get:()=>null}};}});
 const cesium=new vm.SyntheticModule(['GeographicTilingScheme','CustomHeightmapTerrainProvider','EllipsoidTerrainProvider'],function(){this.setExport('GeographicTilingScheme',class{});this.setExport('EllipsoidTerrainProvider',class{constructor(){this.flat=true;}});this.setExport('CustomHeightmapTerrainProvider',class{constructor(options){this.callback=options.callback;}});},{context});
 const services=new vm.SyntheticModule(['backendFeatureAvailable','markBackendFeatureUnavailable','retryDelay'],function(){this.setExport('backendFeatureAvailable',()=>available);this.setExport('markBackendFeatureUnavailable',()=>{available=false;});this.setExport('retryDelay',()=>120000);},{context});
 const module=new vm.SourceTextModule(source,{context});await module.link(name=>name.includes('cesium')?cesium:services);await module.evaluate();
 return{provider:module.namespace.createMeasuredTerrain('earth',{},value=>statuses.push(value)),calls:()=>calls,statuses};
}

test('a static host never requests height API tiles or describes fallback as measured',async()=>{
 const fixture=await terrainFixture(true);await new Promise(resolve=>queueMicrotask(resolve));
 assert.equal(fixture.calls(),0);assert.deepEqual(fixture.statuses,[false]);assert.equal(fixture.provider.flat,true);
});

test('concurrent unknown-host terrain requests share one failed capability probe',async()=>{
 const fixture=await terrainFixture(false);await Promise.all(Array.from({length:12},(_,x)=>fixture.provider.callback(x,0,4)));
 assert.equal(fixture.calls(),1);assert.deepEqual(fixture.statuses,[false]);await fixture.provider.callback(1,1,6);assert.equal(fixture.calls(),1);
});
