import test from 'node:test';
import assert from 'node:assert/strict';
import { approximatePosition, approximatePositions, parseSolarWind } from '../orbital-data.js';
import { createRequestClient, retryDelay, isStaticHost } from '../atlas-services.js';
import { normalizePhotonFeature } from '../place-search.js';

test('the documented JPL model stays within Earth perihelion/aphelion and never claims live telemetry', () => {
  const winter=approximatePosition('earth',new Date('2026-01-04T12:00:00Z'));
  const summer=approximatePosition('earth',new Date('2026-07-04T12:00:00Z'));
  assert(winter.distanceFromSunKm>146000000&&winter.distanceFromSunKm<148000000);
  assert(summer.distanceFromSunKm>151000000&&summer.distanceFromSunKm<153000000);
  assert(winter.speedKmS>summer.speedKmS);
  assert(winter.speedKmS>29&&winter.speedKmS<31);
  assert.equal(winter.state,'estimated');assert.equal(winter.kind,'model');
  assert.equal(approximatePosition('earth',new Date('2100-01-01')),null);
  assert.equal(approximatePosition('moon'),null);
  const planets=approximatePositions(new Date('2026-10-25'));
  assert.equal(Object.keys(planets).length,8);
  for(const p of Object.values(planets)){assert(p.speedKmS>0&&p.distanceFromSunKm>0);assert(Object.values(p.positionKm).every(Number.isFinite));}
});

test('NOAA rows retain measurement time, skip missing speed, and reject old/future/nonphysical readings', () => {
  const now=Date.parse('2026-10-25T12:00:00Z');
  const rows=[['time_tag','density','speed','temperature'],['2026-10-25 11:58:00.000','3','425.6','100'],['2026-10-25 11:59:00.000','3',null,'100']];
  const result=parseSolarWind(rows,now);assert.equal(result.speedKmS,425.6);assert.equal(result.measuredAt,'2026-10-25T11:58:00.000Z');assert.equal(result.kind,'measurement');
  assert.equal(parseSolarWind([rows[0],['2026-10-24 00:00:00','3','420']],now),null);
  assert.equal(parseSolarWind([rows[0],['2026-10-26 00:00:00','3','420']],now),null);
  assert.equal(parseSolarWind([rows[0],['2026-10-25 11:59:00','3','9999']],now),null);
  const current=parseSolarWind([{time_tag:'2026-10-25T11:58:00Z',proton_speed:501.2},{time_tag:'2026-10-25T11:59:00Z',proton_speed:800,active:false}],now);
  assert.equal(current.speedKmS,501.2);assert.equal(current.state,'current');
});

test('public requests coalesce and respect 429 Retry-After before retrying', async () => {
  let clock=10000,calls=0;
  const client=createRequestClient({now:()=>clock,fetcher:async()=>{calls++;return{ok:calls>1,status:calls>1?200:429,headers:{get:()=> '120'},json:async()=>({ok:true})};}});
  await Promise.allSettled([client.json('https://example.org/data'),client.json('https://example.org/data')]);assert.equal(calls,1);
  await assert.rejects(client.json('https://example.org/other'),e=>e.code==='cooldown');assert.equal(calls,1);
  clock+=120001;assert.deepEqual(await client.json('https://example.org/data'),{ok:true});assert.equal(calls,2);
  assert.deepEqual(await client.json('https://example.org/data'),{ok:true});assert.equal(calls,2);
  assert.equal(retryDelay('120',0),120000);
});

test('an aborted query does not poison a later request for the same query', async () => {
  let calls=0;
  const client=createRequestClient({fetcher:async(_url,{signal})=>{calls++;if(signal.aborted)throw new DOMException('Aborted','AbortError');return{ok:true,json:async()=>({calls})};}});
  const cancelled=new AbortController();cancelled.abort();await assert.rejects(client.json('https://example.org/search',{signal:cancelled.signal}));
  assert.deepEqual(await client.json('https://example.org/search'),{calls:2});
});

test('GitHub Pages is recognized before API requests and Photon coordinates are validated', () => {
  assert.equal(isStaticHost('https://jul1-art.github.io/RELIC/'),true);
  assert.equal(isStaticHost('http://localhost:8000/'),false);
  const place=normalizePhotonFeature({geometry:{type:'Point',coordinates:[2.35,48.86]},properties:{name:'Paris',country:'France',osm_value:'city'}});
  assert.equal(place.lat,48.86);assert.equal(place.lon,2.35);assert.equal(place.name,'Paris');assert(place.range>=35000);
  assert.equal(normalizePhotonFeature({geometry:{type:'Point',coordinates:[200,100]},properties:{name:'Invalid'}}),null);
});
