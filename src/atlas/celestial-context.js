import {bodyOrientationBasis} from './solar-illumination.js';

export const CELESTIAL_BODIES=Object.freeze({
  sun:{radiusKm:695700,image:'sun-scope.webp'},
  mercury:{radiusKm:2439.7,image:'mercury-scope.webp'},
  venus:{radiusKm:6051.8,image:'venus-scope.webp'},
  earth:{radiusKm:6371,image:'earth-blue-marble-4k.webp'},
  moon:{radiusKm:1737.4,image:'moon-wac-8k.webp'},
  mars:{radiusKm:3389.5,image:'mars-viking-global.webp'},
  jupiter:{radiusKm:69911,image:'jupiter-scope.webp'},
  saturn:{radiusKm:58232,image:'saturn-scope.webp'},
  uranus:{radiusKm:25362,image:'uranus-scope.webp'},
  neptune:{radiusKm:24622,image:'neptune-scope.webp'}
});
const IDENTITY={x:{x:1,y:0,z:0},y:{x:0,y:1,z:0},z:{x:0,y:0,z:1}};
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
export const eclipticToScene=v=>({x:v.x,y:v.z,z:-v.y});
/** Three map axes (+X prime,+Y north,-Z east) -> Cesium body-fixed axes
 * (+X prime,+Y east,+Z north). Distances are in physical metres, with no
 * overview compression or enlarged planetary radii.
 */
export function sceneToBodyFixed(v,basis){return {x:dot(v,basis.x),y:-dot(v,basis.z),z:dot(v,basis.y)};}
export function makeCelestialContext({selected,date,getState,getName=id=>id,companions=[]}){
  const getPosition=id=>id==='sun'?{x:0,y:0,z:0}:getState(id,date)?.positionKm;
  const origin=getPosition(selected),basis=bodyOrientationBasis(selected,date);
  if(!origin||!basis)return [];
  const rows=Object.entries(CELESTIAL_BODIES).map(([id,data])=>({id,...data,positionKm:getPosition(id)}));
  rows.push(...companions.filter(row=>!CELESTIAL_BODIES[row.id]));
  return rows.filter(row=>row.id!==selected&&row.positionKm&&row.radiusKm>0).map(row=>{
    const relative=eclipticToScene({x:row.positionKm.x-origin.x,y:row.positionKm.y-origin.y,z:row.positionKm.z-origin.z});
    const fixed=sceneToBodyFixed(relative,basis),worldBasis=bodyOrientationBasis(row.id,date)||IDENTITY;
    const axis=vector=>sceneToBodyFixed(vector,basis);
    const sun=axis(eclipticToScene({x:-row.positionKm.x,y:-row.positionKm.y,z:-row.positionKm.z})),length=Math.hypot(sun.x,sun.y,sun.z);
    return {id:row.id,name:row.name||getName(row.id),radiusMeters:row.radiusKm*1000,
      position:{x:fixed.x*1000,y:fixed.y*1000,z:fixed.z*1000},
      axes:{x:axis(worldBasis.x),y:axis({x:-worldBasis.z.x,y:-worldBasis.z.y,z:-worldBasis.z.z}),z:axis(worldBasis.y)},
      sunDirection:length?{x:sun.x/length,y:sun.y/length,z:sun.z/length}:null,
      imageUrl:row.imageUrl||(row.image?new URL('../../assets/'+row.image,import.meta.url).href:null)};
  });
}
