import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const origin='https://example.test/RELIC/';

async function worker() {
  const stores=new Map(), events=new Map(), requests=[], networkPolicies=[];
  let active=0,peak=0,time=Date.parse('2026-10-25T12:00:00Z');
  let serve=async request=>new Response(/\.html(?:\?|$)/.test(request.url)?'<title>Earth — RELIC</title><main>viewer</main>':'resource', {headers:{'Content-Type':/\.html(?:\?|$)/.test(request.url)?'text/html':'application/javascript'}});
  const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const entries=stores.get(name);return{async match(key){return entries.get(typeof key==='string'?key:key.url)?.clone();},async put(key,response){entries.set(typeof key==='string'?key:key.url,response.clone());}};},async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);}};
  class Clock extends Date {static now(){return time;}}
  const self={registration:{scope:origin},clients:{async claim(){}},async skipWaiting(){},addEventListener(name,callback){events.set(name,callback);},RELICFilmCache:{serve(request,scope){return Promise.resolve(new Response(JSON.stringify({range:request.headers.get('Range'),scope}),{status:206}));}}};
  const context=vm.createContext({self,caches,URL,Request,Response,Headers,Date:Clock,console,importScripts(){},async fetch(request,options={}){requests.push(request.url);networkPolicies.push(options.cache);active++;peak=Math.max(peak,active);try{await new Promise(resolve=>setTimeout(resolve,4));return await serve(request);}finally{active--;}}});
  vm.runInContext(source,context,{filename:'sw.js'});
  function request(path,{navigate=false,reload=false,headers={}}={}){const r=new Request(new URL(path,origin),{cache:reload?'reload':'default',headers});if(navigate)Object.defineProperty(r,'mode',{value:'navigate'});return r;}
  async function dispatch(type,event={}){let work;events.get(type)({...event,waitUntil(p){work=p;},respondWith(p){work=p;}});return work===undefined?undefined:await work;}
  return{stores,events,requests,networkPolicies,request,dispatch,peak:()=>peak,advance:ms=>{time+=ms;},setServe:fn=>{serve=fn;},async message(type){let reply;await dispatch('message',{data:{type},ports:[{postMessage(value){reply=value;}}]});return reply;}};
}

test('installation fetches only seven small shell resources with at most three concurrent requests',async()=>{
 const w=await worker();await w.dispatch('install');assert.equal(w.requests.length,7);assert(w.peak()<=3);assert(!w.requests.some(url=>url.includes('/vendor/')||url.includes('/prologue/')||url.includes('api-config')));
});

test('planet parameters share their static document, and mutable module versions are cached within a release',async()=>{
 const w=await worker();await w.dispatch('install');const before=w.requests.length;
 for(const body of ['earth','moon','mars'])assert.equal((await w.dispatch('fetch',{request:w.request('terrain.html?body='+body,{navigate:true})})).status,200);
 assert.equal(w.requests.length,before);
 for(const version of ['1','2','3'])assert.equal((await w.dispatch('fetch',{request:w.request('app-settings.js?v='+version)})).status,200);
 assert.equal(w.requests.length,before+1);
});

test('simultaneous uncached module requests share one network operation',async()=>{
 const w=await worker();const responses=await Promise.all(Array.from({length:18},()=>w.dispatch('fetch',{request:w.request('navigation.js')})));
 assert.equal(w.requests.length,1);assert.deepEqual(await Promise.all(responses.map(r=>r.text())),Array(18).fill('resource'));
});

test('429 serves a cached module and honours Retry-After before any further network request',async()=>{
 const w=await worker();await w.dispatch('fetch',{request:w.request('navigation.js')});
 w.setServe(async()=>new Response('rate limit',{status:429,headers:{'Retry-After':'90'}}));
 const cached=await w.dispatch('fetch',{request:w.request('navigation.js',{reload:true})});assert.equal(cached.status,200);assert.equal(await cached.text(),'resource');
 const count=w.requests.length;const paused=await w.dispatch('fetch',{request:w.request('world-ui.js')});assert.equal(paused.status,503);assert.equal(paused.headers.get('Retry-After'),'90');assert.equal(w.requests.length,count);
 w.advance(90001);w.setServe(async()=>new Response('resumed'));assert.equal(await(await w.dispatch('fetch',{request:w.request('world-ui.js')})).text(),'resumed');assert.equal(w.requests.length,count+1);
});

test('an HTML rate-limit shield never replaces the cached application document',async()=>{
 const w=await worker();await w.dispatch('install');w.setServe(async()=>new Response('<title>Rate limit exceeded</title>',{headers:{'Content-Type':'text/html'}}));
 const result=await w.dispatch('fetch',{request:w.request('terrain.html?body=mars',{navigate:true,reload:true})});assert.equal(result.status,200);assert((await result.text()).includes('RELIC'));
 const count=w.requests.length;await w.dispatch('fetch',{request:w.request('world-performance.js')});assert.equal(w.requests.length,count);
});

test('503 HTTP-date cooldown persists in cache and does not create automatic retries',async()=>{
 const w=await worker();w.setServe(async()=>new Response('busy',{status:503,headers:{'Retry-After':'Sun, 25 Oct 2026 12:02:00 GMT'}}));
 const result=await w.dispatch('fetch',{request:w.request('app.js')});assert.equal(result.status,503);assert.equal(result.headers.get('Retry-After'),'120');
 const count=w.requests.length;await new Promise(resolve=>setTimeout(resolve,20));assert.equal(w.requests.length,count);
 const metadata=[...w.stores.values()].flatMap(store=>[...store.keys()]).filter(key=>key.endsWith('__relic_host_cooldown__.json'));assert.equal(metadata.length,1);
});

test('offline application caching is explicit, bounded, and reports completion through the message port',async()=>{
 const w=await worker();const reply=await w.message('RELIC_CACHE_OFFLINE_SHELL');assert.equal(reply.ok,true);assert(w.requests.length>40);assert(w.peak()<=3);assert(!w.requests.some(url=>/\.(mp4|m4s|m3u8)(?:\?|$)/.test(url)));
});

test('API, external, authenticated, credential-query and ordinary Range requests are not intercepted',async()=>{
 const w=await worker();for(const request of [w.request('api/live/atlas'),w.request('https://api.cesium.com/v1/assets/1'),w.request('app.js',{headers:{Authorization:'Bearer fixture'}}),w.request('map.json?access_token=fixture'),w.request('asset.bin',{headers:{Range:'bytes=0-99'}})])assert.equal(await w.dispatch('fetch',{request}),undefined);
 assert.equal(w.requests.length,0);
});

test('saved-film byte ranges still use the dedicated film cache and intro scope',async()=>{
 const w=await worker();const result=await w.dispatch('fetch',{request:w.request('intro/assets/prologue/example.mp4',{headers:{Range:'bytes=0-99'}})});assert.equal(result.status,206);assert.deepEqual(await result.json(),{range:'bytes=0-99',scope:origin+'intro/'});assert.equal(w.requests.length,0);
});


test('a new interface revalidates browser HTTP cache once and keeps unchanged vendor assets reusable',async()=>{
 const w=await worker();
 await w.dispatch('fetch',{request:w.request('planet-dashboard.js?v=first')});
 await w.dispatch('fetch',{request:w.request('planet-dashboard.js?v=again')});
 assert.equal(w.requests.length,1);
 assert.equal(w.networkPolicies[0],'no-cache');
 await w.dispatch('fetch',{request:w.request('vendor/three.module.js')});
 await w.dispatch('fetch',{request:w.request('vendor/three.module.js')});
 assert.equal(w.requests.length,2);
 assert.equal(w.networkPolicies[1],'default');
});
