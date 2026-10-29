/** Fixed chevrons indicate the time-forward sense of the JPL planetary ellipses. */
export function createOrbitDirections({THREE, scene, planets, orbitLines}) {
  const group = new THREE.Group(); group.name = 'planet-orbit-directions'; scene.add(group);
  const material = new THREE.LineBasicMaterial({color:0x8bc6e7,transparent:true,opacity:.74,depthWrite:false});
  const records = planets.map(planet => {
    const positions = orbitLines.get(planet.id).geometry.attributes.position;
    const points = Array.from({length:positions.count}, (_,i) => new THREE.Vector3().fromBufferAttribute(positions,i));
    const normal = new THREE.Vector3().crossVectors(points[1].clone().sub(points[0]),points[2].clone().sub(points[1])).normalize();
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array(4 * 4 * 3);
    geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));
    const lines = new THREE.LineSegments(geometry,material); lines.frustumCulled=false; group.add(lines);
    return {planet,points,normal,geometry,vertices};
  });
  const delta=new THREE.Vector3(),side=new THREE.Vector3(),tip=new THREE.Vector3(),stem=new THREE.Vector3();
  let lastDistance=0;
  return {
    update(camera,visible){
      group.visible=visible;if(!visible)return;
      const distance=camera.position.length();
      if(lastDistance && Math.abs(distance-lastDistance)<lastDistance*.008)return;
      lastDistance=distance;
      for(const {planet,points,normal,geometry,vertices} of records){
        const length=Math.min(planet.orbit*.13,Math.max(.25,distance*.006));let offset=0;
        for(let index=0;index<4;index++){
          const sample=Math.floor((index+.33)/4*(points.length-1));tip.copy(points[sample]);
          delta.copy(points[(sample+1)%(points.length-1)]).sub(points[(sample-1+points.length-1)%(points.length-1)]).normalize();
          side.crossVectors(delta,normal).normalize();stem.copy(tip).addScaledVector(delta,-length);
          for(const sign of [-1,1])for(const point of [tip,stem.clone().addScaledVector(side,length*.42*sign)]){vertices[offset++]=point.x;vertices[offset++]=point.y;vertices[offset++]=point.z;}
        }
        geometry.attributes.position.needsUpdate=true;
      }
    },
    dispose(){group.removeFromParent();for(const row of records)row.geometry.dispose();material.dispose();}
  };
}
