import test from 'node:test';
import assert from 'node:assert/strict';
import {createAtlasBootstrap} from '../src/atlas/atlas-bootstrap.js';

function fixture({closed=false,fail=false}={}){
  const events=new EventTarget(),filmScript=new EventTarget(),root={dataset:{}};
  events.__relicFilmActive=closed?false:true;let loads=0,errors=0;
  const bootstrap=createAtlasBootstrap({root,events,filmScript,load:async()=>{loads++;if(fail)throw new Error('Fixture failure');},onError:()=>errors++});
  function film(active){const event=new Event('relic-film-state');event.detail={active};events.dispatchEvent(event);}
  return {bootstrap,root,film,filmScript,get loads(){return loads;},get errors(){return errors;}};
}
test('the intro retains the network until exploration; replay never imports the atlas twice',async()=>{
  const f=fixture();await Promise.resolve();assert.equal(f.loads,0);assert.equal(f.root.dataset.atlasBootstrap,'deferred');
  f.film(true);await Promise.resolve();assert.equal(f.loads,0);
  f.film(false);await f.bootstrap.pending;assert.equal(f.loads,1);assert.equal(f.root.dataset.atlasBootstrap,'ready');
  f.film(true);f.film(false);await Promise.resolve();assert.equal(f.loads,1);f.bootstrap.dispose();
});
test('returning from a world with the film already closed starts exploration immediately',async()=>{
  const f=fixture({closed:true});await f.bootstrap.pending;assert.equal(f.loads,1);assert.equal(f.root.dataset.atlasBootstrap,'ready');
});
test('an unavailable film module still allows exploration and a failed atlas reports one error',async()=>{
  const f=fixture({fail:true});f.filmScript.dispatchEvent(new Event('error'));await f.bootstrap.pending;
  assert.equal(f.loads,1);assert.equal(f.errors,1);assert.equal(f.root.dataset.atlasBootstrap,'failed');
  f.film(false);await Promise.resolve();assert.equal(f.errors,1);
});
test('disposing a pending intro does not start unrelated 3D downloads',async()=>{
  const f=fixture();f.bootstrap.dispose();f.film(false);f.filmScript.dispatchEvent(new Event('error'));await Promise.resolve();assert.equal(f.loads,0);
});
