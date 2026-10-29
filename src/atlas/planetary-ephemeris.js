import { approximatePosition } from './orbital-data.js';
import { backendJSON } from '../core/atlas-services.js';

export const PLANET_IDS=Object.freeze(['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune']);
export const HORIZONS_SOURCE='https://ssd.jpl.nasa.gov/horizons/';
const DAY_MS=86400000,DAY_SECONDS=86400,UNIX_JD=2440587.5,SOLAR_GM=132712440041.9394;

/** UTC geometric vectors: never interpret the API's default TDB epochs as UTC. */
export function interpolatePlanetState(entry,date=new Date()){
  const time=Number(date),rows=entry?.states,jd=time/DAY_MS+UNIX_JD;
  if(!Number.isFinite(time)||!rows||rows.length<2||jd<rows[0][0]||jd>rows.at(-1)[0])return null;
  let lo=0,hi=rows.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(rows[mid][0]<=jd)lo=mid;else hi=mid;}
  const a=rows[lo],b=rows[hi],days=b[0]-a[0];if(!(days>0))return null;
  const t=(jd-a[0])/days,t2=t*t,t3=t2*t;
  const position=[],velocity=[];
  for(let axis=1;axis<=3;axis++){
    position.push((2*t3-3*t2+1)*a[axis]+(t3-2*t2+t)*days*a[axis+3]+(-2*t3+3*t2)*b[axis]+(t3-t2)*days*b[axis+3]);
    velocity.push(((6*t2-6*t)*a[axis]+(3*t2-4*t+1)*days*a[axis+3]+(-6*t2+6*t)*b[axis]+(3*t2-2*t)*days*b[axis+3])/days/DAY_SECONDS);
  }
  if(!position.concat(velocity).every(Number.isFinite))return null;
  return {positionKm:{x:position[0],y:position[1],z:position[2]},velocityKmS:{x:velocity[0],y:velocity[1],z:velocity[2]},
    distanceFromSunKm:Math.hypot(...position),speedKmS:Math.hypot(...velocity),validAt:new Date(time).toISOString(),
    state:'ephemeris',kind:'calculated ephemeris',interpolated:true,solution:entry.solution,
    source:'NASA/JPL Horizons · interpolated UTC vectors',sourceUrl:HORIZONS_SOURCE};
}

const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
/** Instantaneous osculating ellipse from a Horizons state. Includes the current
 * planet position; the curve is a geometric orbit guide, not a future forecast.
 */
export function osculatingOrbit(state,segments=512){
  if(!state?.positionKm||!state?.velocityKmS)return [];
  const r=['x','y','z'].map(axis=>state.positionKm[axis]),v=['x','y','z'].map(axis=>state.velocityKmS[axis]);
  const radius=Math.hypot(...r),h=cross(r,v),hl=Math.hypot(...h);
  if(!(radius>0&&hl>0)||!r.concat(v).every(Number.isFinite))return [];
  const vxh=cross(v,h),eccentricity=vxh.map((value,i)=>value/SOLAR_GM-r[i]/radius),e=Math.hypot(...eccentricity);
  if(!(e>=0&&e<1))return [];
  const p=hl*hl/SOLAR_GM,unitP=e>1e-10?eccentricity.map(value=>value/e):r.map(value=>value/radius),
    unitH=h.map(value=>value/hl),unitQ=cross(unitH,unitP),count=Math.max(64,Math.min(2048,Math.round(segments)));
  return Array.from({length:count+1},(_,index)=>{
    const f=index/count*Math.PI*2,distance=p/(1+e*Math.cos(f));
    const point=unitP.map((value,i)=>distance*(value*Math.cos(f)+unitQ[i]*Math.sin(f)));
    return {x:point[0],y:point[1],z:point[2]};
  });
}

function correctFrame(value){return value?.timeScale==='UTC'&&value.center==='500@10'&&value.correction==='geometric / NONE'&&value.frame==='heliocentric J2000 ecliptic / ICRF'&&value.units?.position==='km'&&value.units.velocity==='km/day'&&value.units.epoch==='JD UTC';}
export function validatePlanetCatalogue(value){
  if(value?.version!==1||!correctFrame(value))return false;
  return PLANET_IDS.every(id=>{
    const rows=value.bodies?.[id]?.states;
    return Array.isArray(rows)&&rows.length>=2&&rows.every((row,index)=>Array.isArray(row)&&row.length===7&&row.every(Number.isFinite)&&(!index||row[0]>rows[index-1][0]));
  });
}

/** Read the bundled ephemeris on static hosts, optionally refreshing short UTC
 * state windows through RELIC's own server. NASA forbids direct browser API
 * embedding; all Horizons requests are serialized by that server or updater.
 */
export function createPlanetaryEphemeris({fetcher=(...args)=>globalThis.fetch(...args),
  assetURL=new URL('../../assets/ephemeris/planets-horizons.json',import.meta.url),
  requestLive=()=>backendJSON('./api/ephemeris/planets',{ttl:60000,timeout:4000}),
  onChange=()=>{},autoRefresh=true}={}){
  let catalogue=null,disposed=false,liveRequest=null,timer=null,status='loading';const live=new Map();
  const controller=new AbortController();
  async function refreshLive(){
    if(disposed||liveRequest)return liveRequest;
    liveRequest=Promise.resolve().then(requestLive).then(payload=>{
      if(!correctFrame(payload))return;
      for(const id of PLANET_IDS){
        const entry=payload.bodies?.[id],rows=entry?.states;
        if(Array.isArray(rows)&&rows.length>=2&&rows.every((row,index)=>Array.isArray(row)&&row.length===7&&row.every(Number.isFinite)&&(!index||row[0]>rows[index-1][0])))live.set(id,entry);
      }
      if(!disposed)onChange();
    }).catch(()=>{/* The bundled ephemeris remains authoritative over its documented dates. */}).finally(()=>{liveRequest=null;});
    return liveRequest;
  }
  const ready=(async()=>{
    const timeout=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetcher(assetURL,{signal:controller.signal,cache:'force-cache'});
      if(!response.ok)throw new Error('Ephemeris file unavailable');
      const value=await response.json();if(!validatePlanetCatalogue(value))throw new Error('Invalid planetary ephemeris');
      if(!disposed){catalogue=value;status='ready';onChange();}
    }catch{if(!disposed){status='unavailable';onChange();}}finally{clearTimeout(timeout);}
    if(autoRefresh&&!disposed){void refreshLive();timer=setInterval(()=>{if(!globalThis.document?.hidden)void refreshLive();},60000);}
  })();
  function getState(id,date=new Date()){
    if(!PLANET_IDS.includes(id))return null;
    const fresh=interpolatePlanetState(live.get(id),date);
    if(fresh)return {...fresh,body:id,delivery:'server',retrievedAt:live.get(id).fetchedAt};
    const bundled=interpolatePlanetState(catalogue?.bodies[id],date);
    if(bundled)return {...bundled,body:id,delivery:'bundled',retrievedAt:catalogue.retrievedAt};
    return approximatePosition(id,date);
  }
  return {ready,refreshLive,getState,getPosition:(id,date)=>getState(id,date)?.positionKm,
    getOrbit:(id,date,segments)=>osculatingOrbit(getState(id,date),segments),
    get status(){return {state:status,retrievedAt:catalogue?.retrievedAt,start:catalogue?.start,stop:catalogue?.stop};},
    dispose(){disposed=true;controller.abort();clearInterval(timer);live.clear();}
  };
}
