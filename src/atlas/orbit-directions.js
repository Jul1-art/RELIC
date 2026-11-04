/** Arc-length paths keep the blue wake attached to the displayed planet. */
export function makeOrbitPath(points, closed = true) {
  const distances = [0];
  for (let i=1;i<points.length;i++) distances.push(distances.at(-1)+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y,points[i].z-points[i-1].z));
  return {points,distances,length:distances.at(-1)||0,closed};
}

export function projectOrbitDistance(path, point) {
  let best=Infinity,along=0;
  for(let i=1;i<path.points.length;i++){
    const a=path.points[i-1],b=path.points[i],x=b.x-a.x,y=b.y-a.y,z=b.z-a.z;
    const lengthSquared=x*x+y*y+z*z;if(!lengthSquared)continue;
    const t=Math.max(0,Math.min(1,((point.x-a.x)*x+(point.y-a.y)*y+(point.z-a.z)*z)/lengthSquared));
    const error=(point.x-a.x-t*x)**2+(point.y-a.y-t*y)**2+(point.z-a.z-t*z)**2;
    if(error<best){best=error;along=path.distances[i-1]+t*Math.sqrt(lengthSquared);}
  }
  return along;
}

export function sampleOrbitDistance(path, distance, out={}) {
  if(!path.length){Object.assign(out,path.points[0]||{x:0,y:0,z:0});return out;}
  const d=path.closed?((distance%path.length)+path.length)%path.length:Math.max(0,Math.min(path.length,distance));
  let lo=0,hi=path.distances.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(path.distances[mid]<=d)lo=mid;else hi=mid;}
  const a=path.points[lo],b=path.points[hi],t=(d-path.distances[lo])/Math.max(1e-15,path.distances[hi]-path.distances[lo]);
  out.x=a.x+(b.x-a.x)*t;out.y=a.y+(b.y-a.y)*t;out.z=a.z+(b.z-a.z)*t;return out;
}

/** No independent wall clock: identical planet positions produce identical wakes. */
export function writeOrbitTrail(path, head, positions, fraction=.085) {
  const end=projectOrbitDistance(path,head),count=positions.length/3,sample={},nearest=sampleOrbitDistance(path,end);
  for(let index=0;index<count;index++){
    const t=index/(count-1);sampleOrbitDistance(path,end-path.length*fraction*(1-t),sample);
    // A changing JPL ellipse or an integrated comet trajectory may lie slightly
    // off the cached path. Blend that small residual into the exact current head.
    const correction=t**4;positions[index*3]=sample.x+(head.x-nearest.x)*correction;
    positions[index*3+1]=sample.y+(head.y-nearest.y)*correction;positions[index*3+2]=sample.z+(head.z-nearest.z)*correction;
  }
  return end;
}

/** Blue trailing arcs advance only with the simulation's physical positions. */
export function createOrbitDirections({THREE,scene,planets,orbitLines,getPosition}) {
  const group=new THREE.Group();group.name='planet-orbit-directions';scene.add(group);
  const trailMaterial=new THREE.LineBasicMaterial({color:0xffffff,vertexColors:true,transparent:true,opacity:.98,depthWrite:false,toneMapped:false});
  const blue=new THREE.Color(0x228fff);
  const records=planets.map(planet=>{
    const source=orbitLines.get(planet.id).geometry.attributes.position;
    const points=Array.from({length:source.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(source,i));
    const path=makeOrbitPath(points,planet.closed??planet.id!=='67p');
    const geometry=new THREE.BufferGeometry(),positions=new Float32Array(72*3),colors=new Float32Array(72*3);
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    const line=new THREE.Line(geometry,trailMaterial);line.frustumCulled=false;group.add(line);
    return {planet,path,geometry,positions,line,lastHead:new THREE.Vector3(Infinity,Infinity,Infinity)};
  });
  const head=new THREE.Vector3();
  let appliedTheme;
  function setTheme(theme='night'){
    const light=theme==='day';if(appliedTheme===light)return;appliedTheme=light;
    const background=light?1:0;
    for(const {geometry} of records){
      const colors=geometry.attributes.color;
      for(let i=0;i<colors.count;i++){
        const brightness=.015+.985*(i/(colors.count-1))**1.8;
        colors.setXYZ(i,background+(blue.r-background)*brightness,background+(blue.g-background)*brightness,background+(blue.b-background)*brightness);
      }
      colors.needsUpdate=true;
    }
  }
  setTheme();
  return {
    setTheme,
    update(_camera,visible,date){
      group.visible=visible;if(!visible)return;
      for(const record of records){
        const {planet,path,geometry,positions,line,lastHead}=record;
        const current=getPosition?.(planet.id,date)||planet.position||path.points[0];
        if(!current||![current.x,current.y,current.z].every(Number.isFinite)){line.visible=false;continue;}
        line.visible=true;head.set(current.x,current.y,current.z);
        const moved=head.distanceToSquared(lastHead)>1e-20;
        if(moved){writeOrbitTrail(path,head,positions);geometry.attributes.position.needsUpdate=true;lastHead.copy(head);}
      }
    },
    dispose(){group.removeFromParent();for(const record of records)record.geometry.dispose();trailMaterial.dispose();}
  };
}
