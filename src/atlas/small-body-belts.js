/**
 * Sparse, statistical populations, not an asteroid ephemeris catalogue.
 * The samples follow separate Kepler ellipses. Kirkwood gaps are sampled in
 * semi-major-axis space: eccentric orbits can cross the same radial distance.
 * Body sizes/brightness are enlarged for legibility. There is no dust disc.
 */
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const YEAR_DAYS = 365.256;
const JUPITER_AU = 5.202887;

export const BELT_METADATA = Object.freeze({
  kind:'statistical-illustration',
  actualObjectEphemerides:false,
  sizeToScale:false,
  main:Object.freeze({
    id:'main-belt',
    name:{en:'Main asteroid belt',fr:'Ceinture principale d’astéroïdes'},
    semiMajorAxisAU:[2.1,3.3],
    material:{en:'Predominantly rocky bodies',fr:'Corps principalement rocheux'},
    description:{en:'A sparse population between Mars and Jupiter. Resonances with Jupiter produce gaps in the distribution of orbital sizes.',fr:'Une population dispersée entre Mars et Jupiter. Les résonances avec Jupiter creusent des lacunes dans la distribution des tailles d’orbite.'},
    sources:[
      'https://ssd.jpl.nasa.gov/diagrams/mb_hist.html',
      'https://science.nasa.gov/learn/basics-of-space-flight/chapter1-3/',
      'https://academic.oup.com/mnras/article/453/4/3619/2593672',
    ],
  }),
  kuiper:Object.freeze({
    id:'kuiper-belt',
    name:{en:'Kuiper belt',fr:'Ceinture de Kuiper'},
    semiMajorAxisAU:[30,50],
    material:{en:'Icy and rocky bodies',fr:'Corps de glace et de roche'},
    description:{en:'A thick, sparse population beyond Neptune. The main region extends roughly from 30 to 50 AU; the scattered disc continues much farther.',fr:'Une population épaisse et dispersée au-delà de Neptune. La région principale s’étend environ de 30 à 50 UA ; le disque diffus va beaucoup plus loin.'},
    sources:['https://science.nasa.gov/solar-system/kuiper-belt/facts/'],
  }),
  disclosure:{en:'Statistical illustration. Samples are not individually identified observed objects. Bodies are enlarged for visibility; the space between real objects is vastly greater than their sizes.',fr:'Illustration statistique. Les points ne représentent pas individuellement des objets observés identifiés. Les corps sont agrandis pour être visibles ; les distances réelles entre objets dépassent largement leurs dimensions.'},
});

export const KIRKWOOD_GAPS = Object.freeze([
  {resonance:'3:1',semimajorAxisAU:JUPITER_AU / Math.pow(3,2/3),widthAU:.023},
  {resonance:'5:2',semimajorAxisAU:JUPITER_AU / Math.pow(2.5,2/3),widthAU:.016},
  {resonance:'7:3',semimajorAxisAU:JUPITER_AU / Math.pow(7/3,2/3),widthAU:.011},
  {resonance:'2:1',semimajorAxisAU:JUPITER_AU / Math.pow(2,2/3),widthAU:.027},
].map(Object.freeze));

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state,1664525)+1013904223) >>> 0) / 4294967296);
}
const gaussian = (value,centre,width) => Math.exp(-.5 * ((value-centre)/width)**2);
const rayleigh = (random,scale) => scale * Math.sqrt(-2 * Math.log(Math.max(1e-12,1-random())));

function mainSemiMajorAxis(random) {
  for (let attempt=0;attempt<10000;attempt++) {
    const a = 2.1 + random()*1.2;
    let density = .12 + .68*gaussian(a,2.34,.11) + .88*gaussian(a,2.70,.115) + .78*gaussian(a,3.10,.105);
    for (const gap of KIRKWOOD_GAPS) density *= 1 - .985*gaussian(a,gap.semimajorAxisAU,gap.widthAU);
    if (random() < Math.min(1,density)) return a;
  }
  throw new Error('The asteroid population rejection sampler did not converge');
}

/** All phases are illustrative samples, never positions attributed to real asteroids. */
export function generateBeltPopulation(kind,count,seed=kind==='main'?190387:440294) {
  if (!['main','kuiper'].includes(kind)) throw new TypeError('Unknown small-body population');
  if (!Number.isInteger(count) || count<0 || count>100000) throw new RangeError('Population count must be an integer from 0 to 100000');
  const random = randomGenerator(seed);
  return Array.from({length:count},()=>{
    let a,e,inclination;
    if (kind==='main') {
      a = mainSemiMajorAxis(random);
      e = Math.min(.26,.018+rayleigh(random,.062));
      inclination = Math.min(24,rayleigh(random,5.3))*DEG;
    } else {
      const cold = random()<.67;
      // The cold classical component is flatter and concentrated at 42–48 AU.
      // The hotter component thickens the view without inventing a solid ring.
      a = cold ? 42+random()*5.8 : 30+random()*20;
      const limit = Math.max(.012,1-28.8/a);
      e = Math.min(limit,cold ? .012+rayleigh(random,.032) : .03+rayleigh(random,.095));
      inclination = Math.min(cold?8:30,rayleigh(random,cold?2.2:9.5))*DEG;
    }
    return {kind,semimajorAxisAU:a,eccentricity:e,inclinationRad:inclination,nodeRad:random()*TAU,
      argumentRad:random()*TAU,meanAnomalyRad:random()*TAU,periodDays:YEAR_DAYS*Math.pow(a,1.5)};
  });
}

/** Three.js axes match the atlas: ecliptic x,z,y -> world x,y,z. */
export function beltSamplePosition(sample,days=0) {
  const {semimajorAxisAU:a,eccentricity:e,inclinationRad:i,nodeRad:n,argumentRad:w} = sample;
  const M = (sample.meanAnomalyRad+TAU*days/sample.periodDays)%TAU;
  let E=M;
  for (let step=0;step<8;step++) {
    const change=(E-e*Math.sin(E)-M)/(1-e*Math.cos(E)); E-=change;
    if (Math.abs(change)<1e-12) break;
  }
  const xp=a*(Math.cos(E)-e),yp=a*Math.sqrt(1-e*e)*Math.sin(E);
  const cw=Math.cos(w),sw=Math.sin(w),cn=Math.cos(n),sn=Math.sin(n),ci=Math.cos(i),si=Math.sin(i);
  const x=(cw*cn-sw*sn*ci)*xp+(-sw*cn-cw*sn*ci)*yp;
  const y=(cw*sn+sw*cn*ci)*xp+(-sw*sn+cw*cn*ci)*yp;
  const z=sw*si*xp+cw*si*yp;
  return [x,z,y];
}

const QUALITY = {
  low:{main:3600,kuiper:4400,rocks:48},
  auto:{main:8200,kuiper:10200,rocks:112},
  high:{main:16000,kuiper:20000,rocks:160},
};

/**
 * auToWorld converts a heliocentric distance (AU) into the atlas display radius.
 * A radial display compression is supported; orientation is retained.
 * update(dt,selected) advances real seconds, not an unexplained fast simulation.
 * setEpochDays(days) can be used by an explicitly labelled time simulation.
 */
export function createSmallBodyBelts({THREE,scene,auToWorld=au=>au*12,quality='auto'}={}) {
  if (!THREE || !scene) throw new TypeError('The belts require the active Three.js scene');
  const group=new THREE.Group();group.name='small-body-belts';
  group.userData={kind:BELT_METADATA.kind,provenance:BELT_METADATA};
  const layers=[];const owned=[];const dummy=new THREE.Object3D();const white=new THREE.Color();
  let enabled=true,selected='overview',visibility=1,elapsedDays=0,lastPositionDay=0,currentQuality='auto';
  const projection = (position,target,index) => {
    const radius=Math.hypot(...position),display=auToWorld(radius);
    if (!Number.isFinite(display) || display<0) throw new RangeError('auToWorld must return a finite, nonnegative radius');
    const scale=radius?display/radius:0;
    target[index]=position[0]*scale;target[index+1]=position[1]*scale;target[index+2]=position[2]*scale;
  };

  function rockGeometry(seed) {
    const geometry=new THREE.IcosahedronGeometry(1,1);const random=randomGenerator(seed);
    const vertices=geometry.attributes.position;
    // Consistent radial deformation for duplicate vertices avoids open seams.
    const displacement=new Map();
    for(let j=0;j<vertices.count;j++) {
      const key=[vertices.getX(j),vertices.getY(j),vertices.getZ(j)].map(v=>v.toFixed(5)).join(',');
      if(!displacement.has(key))displacement.set(key,.74+random()*.32);
      const factor=displacement.get(key);
      vertices.setXYZ(j,vertices.getX(j)*factor,vertices.getY(j)*factor*.82,vertices.getZ(j)*factor*.68);
    }
    geometry.computeVertexNormals();owned.push(geometry);return geometry;
  }

  for(const [kind,count] of [['main',QUALITY.high.main],['kuiper',QUALITY.high.kuiper]]) {
    const samples=generateBeltPopulation(kind,count);
    const random=randomGenerator(kind==='main'?81807:36167);
    const positions=new Float32Array(count*3),colours=new Float32Array(count*3);
    const geometry=new THREE.BufferGeometry();
    for(let j=0;j<count;j++) {
      projection(beltSamplePosition(samples[j]),positions,j*3);
      const tint=kind==='main' ? new THREE.Color(random()<.58?'#8a8175':'#736e69') : new THREE.Color(random()<.69?'#899092':'#92796c');
      tint.multiplyScalar(.64+random()*.30);
      colours.set([tint.r,tint.g,tint.b],j*3);
    }
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    geometry.setAttribute('color',new THREE.BufferAttribute(colours,3));
    geometry.computeBoundingSphere();owned.push(geometry);
    const material=new THREE.PointsMaterial({vertexColors:true,size:kind==='main'?1.05:.9,sizeAttenuation:false,
      transparent:true,opacity:kind==='main'?.62:.51,depthWrite:false,blending:THREE.NormalBlending});
    owned.push(material);
    const points=new THREE.Points(geometry,material);points.name=kind==='main'?'main-asteroid-population':'kuiper-icy-population';
    points.frustumCulled=true;points.userData={...BELT_METADATA[kind],sampleCount:count};group.add(points);
    const rocks=[];
    for(let variant=0;variant<2;variant++) {
      const rockMaterial=new THREE.MeshStandardMaterial({color:kind==='main'?'#797269':'#9b9590',roughness:1,metalness:0,
        flatShading:true,transparent:true,opacity:1,depthWrite:false});
      owned.push(rockMaterial);
      const instances=new THREE.InstancedMesh(rockGeometry(2105+variant+(kind==='main'?0:10)),rockMaterial,80);
      instances.name=kind+'-representative-rocks-'+variant;
      for(let j=0;j<80;j++) {
        const p=beltSamplePosition(samples[j*2+variant]);const data=[0,0,0];projection(p,data,0);
        dummy.position.fromArray(data);dummy.rotation.set(random()*TAU,random()*TAU,random()*TAU);
        const radius=Math.max(.012,auToWorld(kind==='main'?2.7:43)*(.00015+random()*.0005));
        dummy.scale.setScalar(radius);dummy.updateMatrix();instances.setMatrixAt(j,dummy.matrix);
        white.set(kind==='main'?'#81776c':random()<.66?'#a3a29a':'#978072');
        white.multiplyScalar(.7+random()*.4);instances.setColorAt(j,white);
      }
      instances.instanceMatrix.needsUpdate=true;instances.instanceColor.needsUpdate=true;
      instances.computeBoundingSphere();instances.frustumCulled=true;group.add(instances);rocks.push(instances);
    }
    layers.push({kind,samples,points,geometry,material,positions,rocks,baseOpacity:material.opacity});
  }
  scene.add(group);

  function setQuality(value='auto') {
    currentQuality=Object.hasOwn(QUALITY,value)?value:'auto';
    const spec=QUALITY[currentQuality];
    for(const layer of layers) {
      layer.geometry.setDrawRange(0,spec[layer.kind]);
      // A maximum of 160 instanced rocks in the whole scene, not per layer.
      for(const mesh of layer.rocks)mesh.count=Math.floor(spec.rocks/4);
    }
  }
  function applyVisibility() {
    const active=visibility>.005;
    group.visible=enabled&&active;
    for(const layer of layers) {
      layer.material.opacity=layer.baseOpacity*visibility;
      for(const rock of layer.rocks)rock.material.opacity=visibility;
    }
  }
  function setEpochDays(days) {
    if (!Number.isFinite(days))return;
    elapsedDays=days;lastPositionDay=days;
    for(const layer of layers) {
      for(let j=0;j<layer.samples.length;j++)projection(beltSamplePosition(layer.samples[j],days),layer.positions,j*3);
      layer.geometry.attributes.position.needsUpdate=true;
      // Update the small instanced subset while preserving its orientation/size.
      for(let variant=0;variant<layer.rocks.length;variant++) {
        const mesh=layer.rocks[variant];
        for(let j=0;j<80;j++) {
          mesh.getMatrixAt(j,dummy.matrix);dummy.matrix.decompose(dummy.position,dummy.quaternion,dummy.scale);
          const data=[0,0,0];projection(beltSamplePosition(layer.samples[j*2+variant],days),data,0);
          dummy.position.fromArray(data);dummy.updateMatrix();mesh.setMatrixAt(j,dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate=true;
      }
    }
  }
  function update(deltaSeconds=0,focus=selected,{advance=true}={}) {
    selected=focus||'overview';
    const dt=Math.max(0,Math.min(1,Number(deltaSeconds)||0));
    if(advance)elapsedDays+=dt/86400;
    // Real orbital motion is negligible over a browsing session. Recompute only
    // after a real day or an explicit setEpochDays, rather than rotate a rigid ring.
    if(Math.abs(elapsedDays-lastPositionDay)>=1)setEpochDays(elapsedDays);
    const target=selected==='overview'?1:.075;
    visibility+=(target-visibility)*(1-Math.exp(-dt*5));
    applyVisibility();
  }
  setQuality(quality);applyVisibility();
  return {
    group,metadata:BELT_METADATA,update,setQuality,setEpochDays,
    setFocus(id){selected=id||'overview';},
    setVisible(value){enabled=Boolean(value);applyVisibility();},
    get quality(){return currentQuality;},
    get counts(){const spec=QUALITY[currentQuality];return {main:spec.main,kuiper:spec.kuiper,representativeRocks:Math.floor(spec.rocks/4)*4};},
    dispose(){group.removeFromParent();for(const resource of owned)resource.dispose();},
  };
}
