import {constants} from '../../vendor/satellite/satellite.es.js';
/** GEV's dense catalogue uses point markers. At whole-Earth scale, keep this
 * shell bright enough to read against space and the globe's imagery. The
 * marker size changes; the SGP4 positions and orbital altitudes do not. */
export const STARLINK_COLOR='#80dfff';
export const STARLINK_POINT_SIZE=4;
/** Include every valid Starlink orbit's apogee, including transfer orbits.
 * satrec.a is expressed in the WGS72 Earth radii used by satellite.js. */
export function constellationRadius(records,earthRadius=6378137){
 let radius=earthRadius+1000000;
 for(const row of records.values()){
   if(row.satelliteClass!=='starlink')continue;
   const apogee=row.satrec?.a*constants.earthRadius*1000*(1+row.satrec?.ecco);
   if(Number.isFinite(apogee)&&apogee>radius)radius=apogee;
 }
 return radius;
}
/** Camera-to-centre distance framing the full shell with a margin on both
 * portrait and landscape screens. No satellites are decimated or moved. */
export function constellationViewDistance(radius,fovy,aspectRatio){
 if(![radius,fovy,aspectRatio].every(Number.isFinite)||radius<=0||fovy<=0||fovy>=Math.PI||aspectRatio<=0)return null;
 const halfFov=Math.min(fovy/2,Math.atan(Math.tan(fovy/2)*aspectRatio));
 return radius*1.16/Math.sin(halfFov);
}
