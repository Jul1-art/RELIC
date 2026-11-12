/** Adapted from God's Eye View satellites/orbits.js (MIT, Bilawal Sidhu).
 * Same TLE → SGP4 → GMST → geodetic / Earth-fixed pipeline, in metres.
 * Original implementation and provenance: vendor/gods-eye-view/satellites/.
 */
import {propagate,gstime,eciToGeodetic,degreesLat,degreesLong,geodeticToEcf} from '../../vendor/satellite/satellite.es.js';
export const ISS_NORAD=25544;
export const COVERAGE_MS=14*86400000;
export function propagatePosition(satrec,date){
  try{
    const state=propagate(satrec,date);
    if(!state?.position||typeof state.position==='boolean')return null;
    const geo=eciToGeodetic(state.position,gstime(date));
    const fixed=geodeticToEcf(geo),velocity=state.velocity;
    const result={latitude:degreesLat(geo.latitude),longitude:degreesLong(geo.longitude),altitude:geo.height*1000,
      speedMps:velocity&&typeof velocity!=='boolean'?Math.hypot(velocity.x,velocity.y,velocity.z)*1000:null,
      x:fixed.x*1000,y:fixed.y*1000,z:fixed.z*1000};
    return [result.latitude,result.longitude,result.altitude,result.x,result.y,result.z].every(Number.isFinite)&&result.altitude>0?result:null;
  }catch{return null;}
}
export function orbitalPeriodSeconds(satrec){return 86400/Math.max(satrec.no*1440/(2*Math.PI),.1);}
/** Freeze GMST at bake time, exactly as GEV does, then rotate the ring by
 * -(GMST(now)-GMST(bake)) at render time. Never rebuild geometry each tick. */
export function computeOrbitPath(satrec,date,steps=180){
  const points=[],fixedGmst=gstime(date),period=orbitalPeriodSeconds(satrec)*1000;
  for(let i=0;i<=steps;i++){
    try{
      const state=propagate(satrec,new Date(date.getTime()+period*i/steps));
      if(!state?.position||typeof state.position==='boolean')continue;
      const geo=eciToGeodetic(state.position,fixedGmst),p=geodeticToEcf(geo);
      if([p.x,p.y,p.z].every(Number.isFinite))points.push({x:p.x*1000,y:p.y*1000,z:p.z*1000});
    }catch{/* An invalid orbital sample never creates a bogus point. */}
  }
  return {points,gmstAtBake:fixedGmst,bakeMs:date.getTime()};
}
export const orbitRotation=(gmstAtBake,date)=>-(gstime(date)-gmstAtBake);
