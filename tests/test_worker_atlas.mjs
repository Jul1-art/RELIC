import test from 'node:test';
import assert from 'node:assert/strict';
import {createAtlasRoutes} from '../workers/atlas.js';
import {readFile} from 'node:fs/promises';
import {interpolatePlanetState} from '../src/atlas/planetary-ephemeris.js';
const data=JSON.parse(await readFile(new URL('../assets/ephemeris/planets-horizons.json',import.meta.url)));
const date=new Date('2026-11-12T12:00:00Z');
test('Cloudflare ephemeris uses documented bundled vectors with interpolation preserved',async()=>{
 let requests=0;
 const routes=createAtlasRoutes({now:()=>+date}),env={ASSETS:{fetch:async request=>{requests++;assert.equal(new URL(request.url).pathname,'/assets/ephemeris/planets-horizons.json');return Response.json(data);}}};
 const response=await routes(new Request('https://relic.test/api/ephemeris/planets'),env);
 assert.equal(response.status,200);const payload=await response.json();assert.equal(payload.delivery,'bundled-worker');assert.equal(payload.retrievedAt,data.retrievedAt);
 for(const id of Object.keys(payload.bodies)){
  assert.ok(payload.bodies[id].states.length<=4);
  assert.deepEqual(interpolatePlanetState(payload.bodies[id],date),interpolatePlanetState(data.bodies[id],date));
 }
 await routes(new Request('https://relic.test/api/ephemeris/planets'),env);assert.equal(requests,1);
});
test('atlas summary does not invent solar wind or live positions; missing catalogue is retryable',async()=>{
 const routes=createAtlasRoutes({now:()=>+date});
 const response=await routes(new Request('https://relic.test/api/live/atlas'),{});assert.equal(response.status,200);assert.equal((await response.json()).solarWind,null);
 assert.equal((await routes(new Request('https://relic.test/api/ephemeris/planets'),{ASSETS:{fetch:async()=>new Response(null,{status:404})}})).status,503);
 assert.equal(await routes(new Request('https://relic.test/other'),{}),null);
 assert.equal((await routes(new Request('https://relic.test/api/ephemeris/planets',{method:'POST'}),{})).status,405);
});
