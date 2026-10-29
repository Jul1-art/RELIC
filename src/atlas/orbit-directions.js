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
  const arrowMaterial=new THREE.LineBasicMaterial({color:0x49b4ff,transparent:true,opacity:.95,depthWrite:false,toneMapped:false});
  const records=planets.map(planet=>{
    const source=orbitLines.get(planet.id).geometry.attributes.position;
    const points=Array.from({length:source.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(source,i));
    const path=makeOrbitPath(points,planet.closed??planet.id!=='67p');
    const normal=new THREE.Vector3().crossVectors(points[1].clone().sub(points[0]),points[2].clone().sub(points[1])).normalize();
    const geometry=new THREE.BufferGeometry(),positions=new Float32Array(72*3),colors=new Float32Array(72*3),blue=new THREE.Color(0x228fff);
    for(let i=0;i<72;i++){const brightness=.015+.985*(i/71)**1.8;colors[i*3]=blue.r*brightness;colors[i*3+1]=blue.g*brightness;colors[i*3+2]=blue.b*brightness;}
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    const line=new THREE.Line(geometry,trailMaterial);line.frustumCulled=false;group.add(line);
    const arrowGeometry=new THREE.BufferGeometry(),arrowVertices=new Float32Array(12);arrowGeometry.setAttribute('position',new THREE.BufferAttribute(arrowVertices,3).setUsage(THREE.DynamicDrawUsage));
    const arrow=new THREE.LineSegments(arrowGeometry,arrowMaterial);arrow.frustumCulled=false;group.add(arrow);
    return {planet,path,normal,geometry,positions,line,arrowGeometry,arrowVertices,arrow,lastHead:new THREE.Vector3(Infinity,Infinity,Infinity),lastDistance:0,end:0};
  });
  const head=new THREE.Vector3(),tip=new THREE.Vector3(),tangent=new THREE.Vector3(),side=new THREE.Vector3(),stem=new THREE.Vector3(),pointA={},pointB={};
  return {
    update(camera,visible,date){
      group.visible=visible;if(!visible)return;
      for(const record of records){
        const {planet,path,normal,geometry,positions,line,arrowGeometry,arrowVertices,arrow,lastHead}=record;
        const current=getPosition?.(planet.id,date)||planet.position||path.points[0];
        if(!current||![current.x,current.y,current.z].every(Number.isFinite)){line.visible=arrow.visible=false;continue;}
        line.visible=arrow.visible=true;head.set(current.x,current.y,current.z);
        const moved=head.distanceToSquared(lastHead)>1e-20;
        if(moved){record.end=writeOrbitTrail(path,head,positions);geometry.attributes.position.needsUpdate=true;lastHead.copy(head);}
        const distance=camera.position.distanceTo(head);
        if(!moved&&Math.abs(distance-record.lastDistance)<Math.max(1,distance)*.008)continue;
        record.lastDistance=distance;
        const length=Math.min((planet.orbit||path.length/(Math.PI*2))*.06,Math.max(.15,distance*.0045));
        const backoff=Math.max((planet.size||.6)*1.7,length*.8),tipDistance=record.end-backoff;
        sampleOrbitDistance(path,tipDistance,pointA);sampleOrbitDistance(path,tipDistance+Math.max(.001,length*.1),pointB);
        tip.set(pointA.x,pointA.y,pointA.z);tangent.set(pointB.x-pointA.x,pointB.y-pointA.y,pointB.z-pointA.z).normalize();side.crossVectors(tangent,normal).normalize();stem.copy(tip).addScaledVector(tangent,-length);
        let offset=0;for(const sign of [-1,1])for(const point of [tip,stem.clone().addScaledVector(side,length*.42*sign)]){arrowVertices[offset++]=point.x;arrowVertices[offset++]=point.y;arrowVertices[offset++]=point.z;}
        arrowGeometry.attributes.position.needsUpdate=true;
      }
    },
    dispose(){group.removeFromParent();for(const record of records){record.geometry.dispose();record.arrowGeometry.dispose();}trailMaterial.dispose();arrowMaterial.dispose();}
  };
}
