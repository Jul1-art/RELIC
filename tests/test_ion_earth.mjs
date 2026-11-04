import test from 'node:test';
import assert from 'node:assert/strict';
import {createIonEarthTiles,earthTilesOptions,ION_EARTH_ASSET_ID} from '../src/worlds/ion-earth.js';

class Event{
  listeners=new Set();
  addEventListener(callback){this.listeners.add(callback);return()=>this.listeners.delete(callback);}
  raise(...args){for(const callback of [...this.listeners])callback(...args);}
}
function fixture({resource=async()=>({privateResource:true}),timeoutMs=10000,compact=false}={}){
  const requests=[],states=[],owned=new Set(),created=[];
  const viewer={scene:{globe:{show:true},primitives:{add(value){owned.add(value);return value;},remove(value){owned.delete(value);value.destroy();}},requestRender(){}},isDestroyed:()=>false};
  const Cesium={IonResource:{async fromAssetId(id,options){requests.push({id,options});return resource();}},Cesium3DTileset:{async fromUrl(resource,options){
    const value={resource,options,show:true,tileVisible:new Event(),initialTilesLoaded:new Event(),tileFailed:new Event(),loadProgress:new Event(),destroy(){this.destroyed=true;}};
    created.push(value);return value;
  }}};
  const controller=createIonEarthTiles({Cesium,viewer,compact,timeoutMs,onState:state=>states.push(state)});
  return {controller,viewer,requests,states,owned,created};
}

test('ion Earth uses the explicit caller token and waits for visible complete photogrammetry',async t=>{
  const f=fixture();t.after(()=>f.controller.destroy());
  assert.equal(await f.controller.enable('fixture-browser-token'),true);
  assert.equal(f.requests[0].id,ION_EARTH_ASSET_ID);assert.equal(f.requests[0].options.accessToken,'fixture-browser-token');
  assert.equal(f.controller.status,'loading');assert.equal(f.viewer.scene.globe.show,true);assert.equal(f.controller.active,false);
  const tiles=f.created[0];tiles.initialTilesLoaded.raise();
  assert.equal(f.controller.active,false,'Metadata or an empty initial selection may not hide the globe');
  tiles.tileVisible.raise();assert.equal(f.controller.active,true);assert.equal(f.controller.status,'ready');assert.equal(f.viewer.scene.globe.show,false);
  assert.equal(tiles.options.maximumScreenSpaceError,8);assert.equal(tiles.options.enableCollision,true);assert.equal(tiles.options.showCreditsOnScreen,true);
});

test('mobile quality retains bounded memory and genuine collision-enabled tiles',()=>{
  const desktop=earthTilesOptions(false),mobile=earthTilesOptions(true);
  assert.ok(mobile.maximumScreenSpaceError>desktop.maximumScreenSpaceError);
  assert.ok(mobile.cacheBytes+mobile.maximumCacheOverflowBytes<=160*1024*1024);
  assert.equal(mobile.cullRequestsWhileMoving,true);assert.equal(mobile.enableCollision,true);
});

test('missing or rejected credentials keep the real fallback and expose no provider exception',async t=>{
  const f=fixture({resource:async()=>{throw new Error('secret provider URL');}});t.after(()=>f.controller.destroy());
  assert.equal(await f.controller.enable(''),false);assert.equal(f.requests.length,0);assert.equal(f.controller.status,'missing');
  assert.equal(await f.controller.enable('fixture-token'),false);assert.equal(f.controller.status,'error');assert.equal(f.viewer.scene.globe.show,true);
  assert.equal(JSON.stringify(f.states).includes('secret'),false);assert.equal(f.owned.size,0);
});

test('disabling and re-enabling an already rendered Earth reuses its tiles',async t=>{
  const f=fixture();t.after(()=>f.controller.destroy());await f.controller.enable('fixture-token');
  const tiles=f.created[0];tiles.tileVisible.raise();tiles.initialTilesLoaded.raise();f.controller.disable();
  assert.equal(tiles.show,false);assert.equal(f.viewer.scene.globe.show,true);
  await f.controller.enable('fixture-token');assert.equal(f.requests.length,1);assert.equal(f.controller.active,true);assert.equal(tiles.show,true);assert.equal(f.viewer.scene.globe.show,false);
});

test('leaving before the asset resolves cannot install or reactivate stale tiles',async()=>{
  let resolve;const f=fixture({resource:()=>new Promise(done=>{resolve=done;})});
  const pending=f.controller.enable('fixture-token');f.controller.destroy();resolve({});
  assert.equal(await pending,false);assert.equal(f.created.length,0);assert.equal(f.viewer.scene.globe.show,true);assert.equal(f.owned.size,0);
});

test('a stalled request times out to the visible globe and cannot resurrect after the deadline',async t=>{
  let resolve;const f=fixture({resource:()=>new Promise(done=>{resolve=done;}),timeoutMs:2});t.after(()=>f.controller.destroy());
  const pending=f.controller.enable('fixture-token');await new Promise(done=>setTimeout(done,12));
  assert.equal(f.controller.status,'error');assert.equal(f.viewer.scene.globe.show,true);
  resolve({});assert.equal(await pending,false);assert.equal(f.created.length,0);assert.equal(f.controller.active,false);
});

test('partial tiles cannot claim a ready Earth and failed-view cleanup removes listeners',async t=>{
  const f=fixture({timeoutMs:2});t.after(()=>f.controller.destroy());await f.controller.enable('fixture-token');
  const tiles=f.created[0];tiles.tileVisible.raise();tiles.tileFailed.raise({message:'private URL'});
  assert.equal(f.controller.status,'loading');assert.equal(f.viewer.scene.globe.show,true);
  await new Promise(done=>setTimeout(done,12));assert.equal(f.controller.status,'error');assert.equal(tiles.destroyed,true);
  assert.equal(tiles.tileVisible.listeners.size,0);assert.equal(tiles.initialTilesLoaded.listeners.size,0);
});


test('changing or removing browser credentials releases the previous credential-backed tiles',async t=>{
  const f=fixture();t.after(()=>f.controller.destroy());await f.controller.enable('first-fixture-token');
  const first=f.created[0];first.tileVisible.raise();first.initialTilesLoaded.raise();
  assert.equal(f.controller.active,true);
  await f.controller.enable('second-fixture-token');
  assert.equal(first.destroyed,true);assert.equal(f.requests.length,2);
  assert.equal(f.requests[1].options.accessToken,'second-fixture-token');
  assert.equal(f.viewer.scene.globe.show,true);assert.equal(f.controller.status,'loading');
  const second=f.created[1];second.tileVisible.raise();second.initialTilesLoaded.raise();
  await f.controller.enable('');
  assert.equal(second.destroyed,true);assert.equal(f.owned.size,0);assert.equal(f.controller.active,false);
  assert.equal(f.controller.status,'missing');assert.equal(f.viewer.scene.globe.show,true);
});
