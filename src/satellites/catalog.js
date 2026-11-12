import {twoline2satrec} from '../../vendor/satellite/satellite.es.js';
import {parseTleText,noradIdFromSatnum,tleLineLaunchYear} from '../../vendor/gods-eye-view/satellites/tle.js';
import {classifySatellite,tleEpochMs} from '../../vendor/gods-eye-view/satellites/classes.js';
import {APP_ROOT} from '../core/paths.js';
import {COVERAGE_MS} from './orbits.js';
export const REFRESH_MS=6*3600000;
// Same CelesTrak groups as GEV plus its Space Missions full active feed.
// This is a public catalogue, not a claim to include unreported objects.
export const GROUPS=['stations','starlink','active','visual','gps-ops','glo-ops','galileo','geo','resource','weather','planet','sar','science'];
const STORE='relic-satellite-tle-v1';
export function parseCatalog(text,group,now=Date.now()){
  const result=[];
  for(const entry of parseTleText(text)){
    try{
      const satrec=twoline2satrec(entry.line1,entry.line2),id=noradIdFromSatnum(satrec?.satnum),epoch=tleEpochMs(satrec);
      if(!satrec||satrec.error!==0||!Number.isFinite(id)||!epoch||Math.abs(now-epoch)>COVERAGE_MS)continue;
      result.push({id,name:entry.name,satrec,epoch,group,
        satelliteClass:classifySatellite({noradId:id,name:entry.name,group,launchYear:tleLineLaunchYear(entry.line1),nowYear:new Date(now).getUTCFullYear()})});
    }catch{/* Skip malformed sets; retain the rest of the public feed. */}
  }
  return result;
}
/** Lower-priority active/visual duplicates never replace stations or precise
 * constellation tags. Each publication owns a new catalogue Map. */
export function mergeCatalogGroups(groups){
  const records=new Map();
  for(const group of [...groups].sort((a,b)=>(a.group==='active')-(b.group==='active'))){
    for(const record of group.records)if(!records.has(record.id))records.set(record.id,record);
  }
  return records;
}
export function createSatelliteCatalog({fetchImpl=globalThis.fetch,now=()=>Date.now(),onChange=()=>{},cacheStorage=globalThis.caches}={}){
  let disposed=false,pending=null,lastRefresh=0,status='loading',failedGroups=[],records=new Map(),controller=null;
  async function read(group,signal){
    const url=new URL(`api/celestrak/${group}`,APP_ROOT).href;
    let cache,cached;
    try{cache=await cacheStorage?.open(STORE);cached=await cache?.match(url);}catch{}
    const age=cached?now()-Number(cached.headers.get('X-TLE-Fetched-Ms')):Infinity;
    if(age>=0&&age<REFRESH_MS)return {text:await cached.text(),stale:false};
    try{
      const response=await fetchImpl(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(30000)]),credentials:'same-origin',cache:'no-store'});
      if(!response.ok)throw Error(`Catalogue unavailable (${response.status})`);
      const text=await response.text();
      if(!parseTleText(text).length)throw Error('Catalogue contains no valid TLEs');
      const stale=response.headers.get('X-TLE-Cache')==='STALE-ERROR';
      if(!stale)try{await cache?.put(url,new Response(text,{headers:{'X-TLE-Fetched-Ms':String(now())}}));}catch{}
      return {text,stale};
    }catch(error){
      if(signal.aborted)throw error;
      if(cached&&age>=0&&age<COVERAGE_MS)return {text:await cached.text(),stale:true};
      throw error;
    }
  }
  function publish(){if(!disposed)onChange({records,status,failedGroups,lastRefresh});}
  async function refresh(){
    if(disposed||pending)return pending;
    controller=new AbortController();const signal=controller.signal,initialLoad=records.size===0;
    status=records.size?'refreshing':'loading';publish();
    pending=(async()=>{
      const groups=[];failedGroups=[];let stale=false;
      // A single request at a time avoids parallel provider-throttle bursts.
      for(const group of GROUPS){
        if(disposed)return;
        try{
          const result=await read(group,signal);if(disposed)return;
          const entries=parseTleText(result.text),parsed=[];
          for(let i=0;i<entries.length;i+=150){
            if(disposed||signal.aborted)return;
            const text=entries.slice(i,i+150).map(row=>[row.name,row.line1,row.line2].join('\n')).join('\n');
            parsed.push(...parseCatalog(text,group,now()));
            await new Promise(resolve=>setTimeout(resolve,0));
          }
          if(!parsed.length)throw Error('No elements within propagation coverage');
          groups.push({group,records:parsed});stale ||= result.stale;
          // Show the ISS and the complete dense shell as soon as their own
          // feeds arrive; unrelated groups must not delay the Starlink view.
          if(initialLoad&&['stations','starlink','active'].includes(group)){records=mergeCatalogGroups(groups);publish();}
        }catch(error){
          if(signal.aborted)return;
          failedGroups.push(group);
          // A per-host throttle applies to every group. Stop, do not hammer it.
          if(error.message.includes('(429)')||error.message.includes('(403)'))break;
        }
        // Parsing thousands of SGP4 records yields between source groups.
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      if(disposed)return;
      if(groups.length){records=mergeCatalogGroups(groups);lastRefresh=now();status=failedGroups.length?'partial':stale?'stale':'ready';}
      else status=records.size?'stale':'unavailable';
      publish();
    })().finally(()=>{pending=null;});
    return pending;
  }
  return {refresh,get records(){return records;},get status(){return status;},get lastRefresh(){return lastRefresh;},
    dispose(){disposed=true;controller?.abort();}};
}
