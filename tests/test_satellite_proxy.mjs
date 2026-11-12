import test from 'node:test';
import assert from 'node:assert/strict';
import {createCelestrakProxy} from '../workers/celestrak.js';
const tle=`ISS (ZARYA)
1 25544U 98067A   26315.85209532  .00008096  00000+0  15318-3 0  9994
2 25544  51.6324 289.3631 0007314  15.2015 344.9192 15.49321770594643`;
function fixture(){let time=1800000000000,calls=0,fail=false;const data=new Map(),cache={async match(key){return data.get(key.url)?.clone();},async put(key,value){data.set(key.url,value.clone());}};
 const proxy=createCelestrakProxy({cache,now:()=>time,fetchImpl:async url=>{calls++;assert.equal(url.origin,'https://celestrak.org');return fail?new Response('',{status:429,headers:{'Retry-After':'120'}}):new Response(tle);}});
 return {proxy,cache,get calls(){return calls;},advance(value){time+=value;},fail(){fail=true;},request:group=>new Request(`https://relic.test/api/celestrak/${group}`)};
}
test('fixed upstream, shared six-hour cache, no client token',async()=>{
 const f=fixture();const first=await f.proxy(f.request('stations'));assert.equal(first.status,200);assert.equal(first.headers.get('x-tle-cache'),'MISS');assert.equal(await first.text(),tle);
 const second=await f.proxy(f.request('stations'));assert.equal(second.headers.get('x-tle-cache'),'HIT');assert.equal(f.calls,1);
});
test('same group concurrent requests share one upstream refresh',async()=>{
 const f=fixture();await Promise.all([f.proxy(f.request('active')),f.proxy(f.request('active'))]);assert.equal(f.calls,1);
});
test('throttling returns marked stale elements and holds off every group',async()=>{
 const f=fixture();await f.proxy(f.request('stations'));f.advance(7*3600000);f.fail();
 const response=await f.proxy(f.request('stations'));assert.equal(response.headers.get('x-tle-cache'),'STALE-ERROR');assert.equal(response.headers.get('Retry-After'),'120');assert.equal(f.calls,2);
 assert.equal((await f.proxy(f.request('active'))).status,503);assert.equal(f.calls,2);
});
test('cooldown survives a new worker instance through the platform cache',async()=>{
 const f=fixture();f.fail();await f.proxy(f.request('stations'));
 const other=createCelestrakProxy({cache:f.cache,now:()=>1800000000000,fetchImpl:()=>{throw Error('Must not call upstream');}});
 assert.equal((await other(f.request('active'))).status,503);
});
test('unsupported groups, cross-site requests, arbitrary URLs and writes are rejected',async()=>{
 const f=fixture();for(const group of ['unknown','https://example.com','active?url=https://example.com'])assert.equal((await f.proxy(f.request(group))).status,400);
 assert.equal((await f.proxy(new Request('https://relic.test/api/celestrak/active',{method:'POST'}))).status,405);
 assert.equal((await f.proxy(new Request('https://relic.test/api/celestrak/active',{headers:{'Sec-Fetch-Site':'cross-site'}}))).status,403);assert.equal(f.calls,0);
});
test('HTML upstream errors are not cached as orbital data',async()=>{
 const proxy=createCelestrakProxy({fetchImpl:async()=>new Response('<html>temporary error</html>')});assert.equal((await proxy(new Request('https://relic.test/api/celestrak/active'))).status,503);
});

test('the relay follows CelesTrak redirects instead of treating them as an outage',async()=>{
 const {createServer}=await import('node:http');
 const server=createServer((req,res)=>{
   if(req.url==='/start'){res.writeHead(302,{Location:'/elements'});res.end();}
   else{res.writeHead(200,{'Content-Type':'text/plain'});res.end(tle);}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
   const proxy=createCelestrakProxy({fetchImpl:(url,options)=>fetch(`http://127.0.0.1:${server.address().port}/start`,options)});
   const response=await proxy(new Request('https://relic.test/api/celestrak/stations'));
   assert.equal(response.status,200);assert.equal(await response.text(),tle);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('the dedicated full Starlink feed is served by the same cached relay',async()=>{
 const f=fixture(),response=await f.proxy(f.request('starlink'));
 assert.equal(response.status,200);assert.equal(await response.text(),tle);assert.equal(f.calls,1);
});
