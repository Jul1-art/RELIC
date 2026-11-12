/** Cloudflare adapter of GEV server/providers/space/celestrak.js (MIT).
 * Fixed upstream, six-hour cache, single-flight refresh and shared cooldown.
 * CelesTrak has no CORS headers: never fetch the feed in a browser directly.
 */
import {celestrakTleUrl} from '../vendor/gods-eye-view/satellites/spaceProviderRequests.js';
import {parseTleText} from '../vendor/gods-eye-view/satellites/tle.js';
const GROUPS=new Set(['stations','starlink','active','visual','gps-ops','glo-ops','galileo','geo','resource','weather','planet','sar','science']);
const TTL=21600000,MAX_AGE=14*86400000,MAX_BYTES=16*1024*1024;
export function createCelestrakProxy({fetchImpl=globalThis.fetch,cache,now=()=>Date.now()}={}){
  const inflight=new Map();let cooldownUntil=0,lastFailure='';
  return async function handle(request){
    const url=new URL(request.url),group=url.pathname.split('/').pop();
    if(request.method!=='GET')return new Response('GET required',{status:405,headers:{Allow:'GET'}});
    if(!GROUPS.has(group)||url.search)return new Response('Unknown satellite group',{status:400});
    if(request.headers.get('Sec-Fetch-Site')==='cross-site')return new Response('Same-origin requests only',{status:403});
    const key=new Request(new URL(`/__satellite-cache/v1/${group}`,url.origin)),cooldownKey=new Request(new URL('/__satellite-cache/v1/cooldown',url.origin));
    let cached,sharedCooldown;
    try{[cached,sharedCooldown]=await Promise.all([cache?.match(key),cache?.match(cooldownKey)]);}catch{}
    if(sharedCooldown)cooldownUntil=Math.max(cooldownUntil,Number(await sharedCooldown.text())||0);
    const stamp=cached?Number(cached.headers.get('X-TLE-Fetched-Ms')):0,age=now()-stamp;
    const send=(body,state,at,status=200)=>new Response(body,{status,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-TLE-Cache':state,
      ...(at?{'X-TLE-Fetched-Ms':String(at)}:{}),...(status!==200&&lastFailure?{'X-TLE-Upstream-Status':lastFailure}:{}),...(now()<cooldownUntil?{'Retry-After':String(Math.ceil((cooldownUntil-now())/1000))}:{})}});
    if(cached&&age>=0&&age<TTL)return send(await cached.text(),'HIT',stamp);
    const fallback=async()=>cached&&age>=0&&age<MAX_AGE?send(await cached.text(),'STALE-ERROR',stamp):send('Satellite catalogue temporarily unavailable','NONE',0,503);
    if(now()<cooldownUntil)return fallback();
    if(!inflight.has(group))inflight.set(group,(async()=>{
      lastFailure='';
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
      try{
        const response=await fetchImpl(celestrakTleUrl(group),{signal:controller.signal,headers:{'User-Agent':'RELIC-satellites/1.0 (+https://github.com/Jul1-art/Hackathon_NASA)'}});
        if(!response.ok){
          lastFailure=`http-${response.status}`;
          const retry=response.headers.get('Retry-After');
          const delay=/^\d+$/.test(retry||'')?Number(retry)*1000:Math.max(60000,Date.parse(retry||'')-now()||0);
          cooldownUntil=Math.max(cooldownUntil,now()+delay);
          try{await cache?.put(cooldownKey,new Response(String(cooldownUntil),{headers:{'Cache-Control':`public, max-age=${Math.ceil(delay/1000)}`}}));}catch{}
          throw Error('Upstream unavailable');
        }
        const reader=response.body.getReader();let size=0;const chunks=[];
        while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES){await reader.cancel();throw Error('Catalogue too large');}chunks.push(value);}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        const text=new TextDecoder().decode(bytes);
        if(!parseTleText(text.slice(0,65536)).length)throw Error('No usable orbital data');
        const at=now();try{await cache?.put(key,new Response(text,{headers:{'Cache-Control':`public, max-age=${MAX_AGE/1000}`,'X-TLE-Fetched-Ms':String(at)}}));}catch{}
        return {text,at};
      }catch(error){if(!lastFailure)lastFailure=error?.message==='No usable orbital data'?'invalid-elements':'network';cooldownUntil=Math.max(cooldownUntil,now()+60000);return null;}
      finally{clearTimeout(timeout);}
    })().finally(()=>inflight.delete(group)));
    const fresh=await inflight.get(group);return fresh?send(fresh.text,'MISS',fresh.at):fallback();
  };
}
