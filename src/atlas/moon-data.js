/** NASA/JPL mean-orbit visualization. These elements are not accurate ephemerides. */
const RAD=Math.PI/180,EPS=23.4392911*RAD,TAU=Math.PI*2;
export const POLE_SOURCE='https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc';
const POLES={mercury:[281.0103,61.4155],venus:[272.76,67.16],earth:[0,90],mars:[317.7,52.9],jupiter:[268.056595,64.495303],saturn:[40.589,83.537],uranus:[257.311,-15.175],neptune:[299.36,43.46],pluto:[132.993,-6.163]};
export function equatorialToScene({x,y,z}){const eclipticY=y*Math.cos(EPS)+z*Math.sin(EPS),eclipticZ=-y*Math.sin(EPS)+z*Math.cos(EPS);return {x,y:eclipticZ,z:-eclipticY};}
export function planetPoleScene(parent){const [ra,dec]=POLES[parent]||[0,90];return equatorialToScene({x:Math.cos(dec*RAD)*Math.cos(ra*RAD),y:Math.cos(dec*RAD)*Math.sin(ra*RAD),z:Math.sin(dec*RAD)});}
export function hasMeanOrbit(row){return row&&Number.isFinite(row.aKm)&&row.aKm>0&&Number.isFinite(row.e)&&row.e>=0&&row.e<1&&Number.isFinite(row.periodDays)&&row.periodDays>0;}
function rotate(row,E){
 const a=row.aKm,e=row.e,xp=a*(Math.cos(E)-e),yp=a*Math.sqrt(1-e*e)*Math.sin(E);
 const w=row.argumentOfPeriapsisDeg*RAD,n=row.nodeDeg*RAD,i=row.inclinationDeg*RAD;
 const x=(Math.cos(w)*Math.cos(n)-Math.sin(w)*Math.sin(n)*Math.cos(i))*xp+(-Math.sin(w)*Math.cos(n)-Math.cos(w)*Math.sin(n)*Math.cos(i))*yp;
 const y=(Math.cos(w)*Math.sin(n)+Math.sin(w)*Math.cos(n)*Math.cos(i))*xp+(-Math.sin(w)*Math.sin(n)+Math.cos(w)*Math.cos(n)*Math.cos(i))*yp;
 const z=Math.sin(w)*Math.sin(i)*xp+Math.cos(w)*Math.sin(i)*yp;
 if(row.referencePlane==='ecliptic')return {x,y:z,z:-y};
 const [defaultRA,defaultDec]=POLES[row.parent]||[0,90];
 const ra=(row.laplacePoleRaDeg??defaultRA)*RAD,dec=(row.laplacePoleDecDeg??defaultDec)*RAD;
 // Ascending node of the reference plane on the ICRF equator is RA(pole)+90°.
 const u={x:-Math.sin(ra),y:Math.cos(ra),z:0},pole={x:Math.cos(dec)*Math.cos(ra),y:Math.cos(dec)*Math.sin(ra),z:Math.sin(dec)};
 const v={x:-Math.sin(dec)*Math.cos(ra),y:-Math.sin(dec)*Math.sin(ra),z:Math.cos(dec)};
 return equatorialToScene({x:u.x*x+v.x*y+pole.x*z,y:u.y*x+v.y*y+pole.y*z,z:u.z*x+v.z*y+pole.z*z});
}
export function relativePositionKm(row,date=new Date()){
 if(!hasMeanOrbit(row))return null;
 const jd=Number(date)/86400000+2440587.5;
 if(!Number.isFinite(jd))return null;
 // IAU's north-pole convention leaves Uranus with negative rotation.
 const sense=row.parent==='uranus'&&row.referencePlane==='equatorial'?-1:1;
 const M=((row.meanAnomalyDeg*RAD+sense*(jd-row.epochJd)*TAU/row.periodDays)%TAU+TAU)%TAU;
 let E=M;for(let k=0;k<16;k++){const d=(E-row.e*Math.sin(E)-M)/(1-row.e*Math.cos(E));E-=d;if(Math.abs(d)<1e-12)break;}
 return rotate(row,E);
}
export function sampleOrbitKm(row,segments=160){if(!hasMeanOrbit(row))return [];const count=Math.max(48,Math.min(720,Math.round(segments)));return Array.from({length:count+1},(_,i)=>rotate(row,i/count*TAU));}
export async function loadMoonCatalogue(){const response=await fetch(new URL('../../assets/data/natural-satellites.json',import.meta.url));if(!response.ok)throw new Error('Satellite catalogue HTTP '+response.status);return response.json();}
