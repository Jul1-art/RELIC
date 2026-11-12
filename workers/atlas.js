/** Cloudflare routes use the packaged NASA/JPL catalogue, never fabricated telemetry. */
export function createAtlasRoutes({now=()=>Date.now()}={}){
 let cataloguePromise;
 async function catalogue(request,env){
  if(!cataloguePromise)cataloguePromise=env.ASSETS.fetch(new Request(new URL('/assets/ephemeris/planets-horizons.json',request.url))).then(async response=>{
   if(!response.ok)throw Error('Catalogue unavailable');const value=await response.json();
   if(value.version!==1||!value.bodies)throw Error('Invalid catalogue');return value;
  }).catch(error=>{cataloguePromise=null;throw error;});
  return cataloguePromise;
 }
 return async (request,env)=>{
  const path=new URL(request.url).pathname;
  if(!['/api/ephemeris/planets','/api/live/atlas'].includes(path))return null;
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=60','X-RELIC-Source':'bundled NASA/JPL Horizons ephemeris'};
  if(path==='/api/live/atlas')return new Response(request.method==='HEAD'?null:JSON.stringify({generatedAt:new Date(now()).toISOString(),positions:{},solarWind:null,delivery:'public-sources',note:'Positions use the packaged Horizons catalogue. Solar wind is retrieved directly from NOAA by the client.'}),{headers});
  try{
   const data=await catalogue(request,env),jd=now()/86400000+2440587.5,bodies={};
   for(const [id,entry]of Object.entries(data.bodies)){
    const states=entry.states;if(!states?.length)continue;
    let lo=0,hi=states.length-1;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(states[mid][0]<=jd)lo=mid;else hi=mid;}
    bodies[id]={...entry,states:states.slice(Math.max(0,lo-1),Math.min(states.length,hi+2)),fetchedAt:data.retrievedAt};
   }
   return new Response(request.method==='HEAD'?null:JSON.stringify({...data,bodies,delivery:'bundled-worker'}),{headers});
  }catch{return new Response(JSON.stringify({error:'Packaged ephemeris temporarily unavailable'}),{status:503,headers:{...headers,'Cache-Control':'no-store','Retry-After':'60'}});}
 };
}
