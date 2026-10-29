import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import * as imagery from '../src/atlas/surface-imagery.js';
import * as cache from '../src/atlas/surface-tile-cache.js';
const turn=()=>new Promise(resolve=>setTimeout(resolve,0));
async function fixture(){
  const requests=[],states=[];
  class Loader{setCrossOrigin(){return this;}loadAsync(url){return new Promise((resolve,reject)=>requests.push({url,resolve,reject}));}}
  const context=vm.createContext({performance,Float32Array,console});
  const synthetic=object=>new vm.SyntheticModule(Object.keys(object),function(){for(const [key,value] of Object.entries(object))this.setExport(key,value);},{context});
  const source=await readFile(new URL('../src/atlas/surface-detail.js',import.meta.url),'utf8');
  const module=new vm.SourceTextModule(source,{context});
  await module.link(name=>name==='three'?synthetic({...THREE,TextureLoader:Loader}):name.endsWith('surface-imagery.js')?synthetic(imagery):synthetic(cache));await module.evaluate();
  const camera=new THREE.PerspectiveCamera(40,16/9,.000001,100);camera.position.set(1.1,0,0);
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),new THREE.MeshStandardMaterial());
  const renderer={domElement:{clientWidth:1280,clientHeight:720},getPixelRatio:()=>1,capabilities:{getMaxAnisotropy:()=>8}};
  const detail=new module.namespace.SurfaceDetail(camera,renderer,state=>states.push(state));
  async function drain(){
    for(let attempt=0;attempt<100;attempt++){
      requests.splice(0).forEach(row=>row.resolve(new THREE.Texture()));await turn();
      if(!detail.textureCache.running&&!detail.textureCache.queue.length)return;
    }
    throw new Error('Tile requests did not settle');
  }
  return{detail,camera,mesh,requests,states,drain};
}

test('surface panning retains complete old coverage until the central replacement is sufficiently ready',async()=>{
  const f=await fixture();f.detail.update(1000,'earth',f.mesh,1);await f.drain();
  const old=f.detail.tiles.slice();assert.ok(old.length>=9);assert.ok(old.every(tile=>tile.parent===f.mesh));
  f.camera.position.set(.95,0,.58);f.detail.update(1300,'earth',f.mesh,1);await turn();
  f.requests.shift().resolve(new THREE.Texture());await turn();
  assert.equal(f.detail.tiles[0],old[0]);assert.ok(old.every(tile=>tile.parent===f.mesh));
  await f.drain();assert.ok(old.every(tile=>tile.parent===null));assert.ok(f.detail.tiles.every(tile=>tile.parent===f.mesh));
  assert.equal(f.states.at(-1).provider,'earth-world-imagery');assert.match(f.states.at(-1).credit,/Esri/);f.detail.dispose();
});

test('an unavailable central high-resolution tile retains imagery and falls back to a credited global source',async()=>{
  const f=await fixture();f.detail.update(1000,'earth',f.mesh,1);await f.drain();const old=f.detail.tiles.slice();
  f.camera.position.set(.95,0,-.58);f.detail.update(1300,'earth',f.mesh,1);await turn();
  f.requests.shift().reject(new Error('missing central coverage'));await f.drain();
  assert.equal(f.detail.tiles[0],old[0]);assert.equal(f.states.at(-1).retained,true);
  f.detail.update(1600,'earth',f.mesh,1);await f.drain();
  assert.equal(f.states.at(-1).provider,'earth-blue-marble');assert.match(f.states.at(-1).credit,/NASA/);f.detail.dispose();
});
