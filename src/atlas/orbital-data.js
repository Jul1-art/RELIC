/** JPL's published approximate Keplerian elements, valid 1800–2050.
 * Source: https://ssd.jpl.nasa.gov/planets/approx_pos.html (Table 1).
 * This is an educational position model, not live telemetry or a Horizons vector.
 */
export const MODEL_SOURCE = 'https://ssd.jpl.nasa.gov/planets/approx_pos.html';
const AU = 149597870.7;
const GM = 132712440041.9394; // km³/s², JPL solar gravitational parameter.
const RAD = Math.PI / 180;
// a(AU), e, I(deg), mean longitude, longitude of perihelion, ascending node;
// each pair is the J2000 value and its change per Julian century.
const ELEMENTS = {
  mercury:[[.38709927,.00000037],[.20563593,.00001906],[7.00497902,-.00594749],[252.25032350,149472.67411175],[77.45779628,.16047689],[48.33076593,-.12534081]],
  venus:[[.72333566,.00000390],[.00677672,-.00004107],[3.39467605,-.00078890],[181.97909950,58517.81538729],[131.60246718,.00268329],[76.67984255,-.27769418]],
  earth:[[1.00000261,.00000562],[.01671123,-.00004392],[-.00001531,-.01294668],[100.46457166,35999.37244981],[102.93768193,.32327364],[0,0]],
  mars:[[1.52371034,.00001847],[.09339410,.00007882],[1.84969142,-.00813131],[-4.55343205,19140.30268499],[-23.94362959,.44441088],[49.55953891,-.29257343]],
  jupiter:[[5.20288700,-.00011607],[.04838624,-.00013253],[1.30439695,-.00183714],[34.39644051,3034.74612775],[14.72847983,.21252668],[100.47390909,.20469106]],
  saturn:[[9.53667594,-.00125060],[.05386179,-.00050991],[2.48599187,.00193609],[49.95424423,1222.49362201],[92.59887831,-.41897216],[113.66242448,-.28867794]],
  uranus:[[19.18916464,-.00196176],[.04725744,-.00004397],[.77263783,-.00242939],[313.23810451,428.48202785],[170.95427630,.40805281],[74.01692503,.04240589]],
  neptune:[[30.06992276,.00026291],[.00859048,.00005105],[1.77004347,.00035372],[-55.12002969,218.45945325],[44.96476227,-.32241464],[131.78422574,-.00508664]],
};

export function approximatePosition(body, date = new Date()) {
  const time = Number(date), year = new Date(time).getUTCFullYear();
  if (!ELEMENTS[body] || !Number.isFinite(time) || year < 1800 || year > 2050) return null;
  const T = ((time / 86400000 + 2440587.5) - 2451545) / 36525;
  const [a,e,I,L,p,node] = ELEMENTS[body].map(([value,rate]) => value + rate * T);
  const M = (((L - p + 180) % 360 + 360) % 360 - 180) * RAD;
  let E = M;
  for (let i = 0; i < 12; i++) { const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-12) break; }
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const w = (p - node) * RAD, n = node * RAD, inc = I * RAD;
  const x = (Math.cos(w)*Math.cos(n)-Math.sin(w)*Math.sin(n)*Math.cos(inc))*xp + (-Math.sin(w)*Math.cos(n)-Math.cos(w)*Math.sin(n)*Math.cos(inc))*yp;
  const y = (Math.cos(w)*Math.sin(n)+Math.sin(w)*Math.cos(n)*Math.cos(inc))*xp + (-Math.sin(w)*Math.sin(n)+Math.cos(w)*Math.cos(n)*Math.cos(inc))*yp;
  const z = Math.sin(w)*Math.sin(inc)*xp + Math.cos(w)*Math.sin(inc)*yp;
  const distanceFromSunKm = Math.hypot(x,y,z) * AU;
  return { body, state:'estimated', kind:'model', model:'JPL approximate elements (1800–2050)', validAt:new Date(time).toISOString(), distanceFromSunKm,
    speedKmS:Math.sqrt(GM * (2 / distanceFromSunKm - 1 / (a * AU))), positionKm:{ x:x*AU,y:y*AU,z:z*AU }, source:'NASA/JPL · approximate orbital model', sourceUrl:MODEL_SOURCE };
}

/** Mean Kepler orbit in ecliptic kilometres, matching approximatePosition's model. */
export function approximateOrbit(body, date = new Date(), segments = 360) {
  const time=Number(date),year=new Date(time).getUTCFullYear();
  if(!ELEMENTS[body] || !Number.isFinite(time) || year<1800 || year>2050)return [];
  const T=((time/86400000+2440587.5)-2451545)/36525;
  const [a,e,I,,p,node]=ELEMENTS[body].map(([value,rate])=>value+rate*T);
  const w=(p-node)*RAD,n=node*RAD,inc=I*RAD;
  const result=[];const count=Math.max(32,Math.min(1440,Math.round(segments)));
  for(let index=0;index<=count;index++){
    const E=index/count*Math.PI*2,xp=a*(Math.cos(E)-e),yp=a*Math.sqrt(1-e*e)*Math.sin(E);
    result.push({x:((Math.cos(w)*Math.cos(n)-Math.sin(w)*Math.sin(n)*Math.cos(inc))*xp+(-Math.sin(w)*Math.cos(n)-Math.cos(w)*Math.sin(n)*Math.cos(inc))*yp)*AU,
      y:((Math.cos(w)*Math.sin(n)+Math.sin(w)*Math.cos(n)*Math.cos(inc))*xp+(-Math.sin(w)*Math.sin(n)+Math.cos(w)*Math.cos(n)*Math.cos(inc))*yp)*AU,
      z:(Math.sin(w)*Math.sin(inc)*xp+Math.cos(w)*Math.sin(inc)*yp)*AU});
  }
  return result;
}

export function approximatePositions(date = new Date()) {
  return Object.fromEntries(Object.keys(ELEMENTS).map(body => [body,approximatePosition(body,date)]).filter(([,value]) => value));
}

export function parseSolarWind(rows, now = Date.now()) {
  if (!Array.isArray(rows) || !rows.length) return null;
  if (!Array.isArray(rows[0])) {
    rows = [['time_tag','speed'], ...rows.filter(row=>row && row.active!==false).sort((a,b)=>String(a.time_tag||'').localeCompare(String(b.time_tag||''))).map(row=>[row.time_tag,row.proton_speed ?? row.speed])];
  }
  const timeColumn = rows[0].indexOf('time_tag'), speedColumn = rows[0].indexOf('speed');
  if (timeColumn < 0 || speedColumn < 0) return null;
  for (let index = rows.length - 1; index > 0; index--) {
    const row = rows[index];
    if (!Array.isArray(row) || row[speedColumn] === null || row[speedColumn] === '') continue;
    const speed = Number(row[speedColumn]);
    const raw = String(row[timeColumn] || '');
    const measuredAt = Date.parse(raw.replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(raw) ? '' : 'Z'));
    const age = now - measuredAt;
    if (!Number.isFinite(speed) || speed <= 0 || speed > 3000 || !Number.isFinite(measuredAt) || age < -300000 || age > 6*3600000) continue;
    return { state:age <= 30*60000 ? 'current':'stale', kind:'measurement', speedKmS:speed, measuredAt:new Date(measuredAt).toISOString(), source:'NOAA SWPC · solar wind near Earth', sourceUrl:'https://www.spaceweather.gov/products/solar-wind' };
  }
  return null;
}
