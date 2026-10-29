import {loadMoonCatalogue,relativePositionKm,sampleOrbitKm,hasMeanOrbit} from './moon-data.js';
import {displayedMoonRadius,moonOrbitOpacity} from './moon-visibility.js';

/** Complete planetary moon catalogue, batched orbits and selectable 3D bodies. */
export async function createNaturalSystems({THREE,scene,planetGroups,planets,getLanguage,onSelect,getSelected,labelHost,camera}){
 const catalogue=await loadMoonCatalogue();
 const textureCatalogue=await fetch(new URL('../../assets/moons/texture-catalog.json',import.meta.url)).then(r=>r.json());
 const textureFiles=new Map(textureCatalogue.textures.map(t=>[t.name,t.file]));const rows=catalogue.satellites.filter(r=>planetGroups.has(r.parent));
 const states=new Map(),systems=new Map(),pickable=[],owned=[],labelNodes=[];
 const dummy=new THREE.Object3D(),arrowDummy=new THREE.Object3D(),v=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);let orbitMode='auto',focus='overview',lastDate=new Date(),lastUpdate=-Infinity,disposed=false;
 const sphere=new THREE.SphereGeometry(1,64,40),rock=new THREE.IcosahedronGeometry(1,1);owned.push(sphere,rock);
 const arrowGeometry=new THREE.ConeGeometry(.48,1.5,4);owned.push(arrowGeometry);
 const loader=new THREE.TextureLoader();
 const labelLayer=document.createElement('div');labelLayer.className='natural-label-layer';labelHost.parentElement.append(labelLayer);
 const fr=()=>getLanguage()==='fr';
 const major=(r,p)=>hasMeanOrbit(r)&&(rows.filter(q=>q.parent===p.id).length<=2||(r.radiusKm>=100&&r.aKm<p.radiusKm*100));
 for(const planet of planets){
  const records=rows.filter(r=>r.parent===planet.id).sort((a,b)=>(b.radiusKm||0)-(a.radiusKm||0)||a.name.localeCompare(b.name));
  if(!records.length)continue;
  const group=new THREE.Group();group.name=planet.id+'-natural-satellites';scene.add(group);
  const system={planet,records,group,scale:planet.size/planet.radiusKm,major:records.filter(r=>major(r,planet)),fullRadius:0,majorRadius:0};systems.set(planet.id,system);
  const majorA=Math.max(...system.major.map(r=>r.aKm),planet.radiusKm*4);
  const lineVertices=[],innerVertices=[],overviewVertices=[];
  for(const row of records){
   const isMajor=system.major.includes(row),actual=(row.radiusKm||0)*system.scale;
   const radius=Math.max(actual,planet.size*.004),small=!isMajor;
   const state={row,system,major:isMajor,radius,displayRadius:radius,position:new THREE.Vector3(),offset:new THREE.Vector3(),compact:hasMeanOrbit(row)?planet.size*(2+2.2*Math.pow(row.aKm/majorA,.6))/row.aKm:0,textureLoaded:false};
   states.set(row.id,state);
   const points=sampleOrbitKm(row,160);
   for(let j=1;j<points.length;j++)for(const q of [points[j-1],points[j]]){
    lineVertices.push(q.x*system.scale,q.y*system.scale,q.z*system.scale);
    if(isMajor){overviewVertices.push(q.x*state.compact,q.y*state.compact,q.z*state.compact);innerVertices.push(q.x*system.scale,q.y*system.scale,q.z*system.scale);}
   }
   const extent=hasMeanOrbit(row)?row.aKm*(1+row.e)*system.scale+radius:planet.size*2.4;
   system.fullRadius=Math.max(system.fullRadius,extent);if(isMajor)system.majorRadius=Math.max(system.majorRadius,extent);
   if(isMajor){
    const material=new THREE.MeshStandardMaterial({color:row.name==='Io'?0xb7a06a:row.name==='Titan'?0xd2ae72:0xbfc0bd,roughness:1,emissive:0x777777,emissiveIntensity:.12});owned.push(material);
    state.mesh=new THREE.Mesh(sphere,material);state.mesh.scale.setScalar(radius);state.mesh.userData.id=row.id;state.mesh.name=row.name;group.add(state.mesh);pickable.push(state.mesh);
   }
  }
  const minor=records.map(r=>states.get(r.id)).filter(s=>!s.major);
  if(minor.length){const mat=new THREE.MeshStandardMaterial({color:0xaaa8a3,roughness:1,flatShading:true,emissive:0x777777,emissiveIntensity:.12});owned.push(mat);
   const mesh=new THREE.InstancedMesh(rock,mat,minor.length);mesh.name=planet.id+'-small-moons';mesh.frustumCulled=false;mesh.userData.moonIds=minor.map(s=>s.row.id);group.add(mesh);pickable.push(mesh);
   minor.forEach((s,i)=>{s.instances=mesh;s.instanceIndex=i;});system.instances=mesh;
  }
  if(system.major.length){
   const material=new THREE.MeshBasicMaterial({color:0x8faebe,transparent:true,opacity:.6,depthWrite:false});owned.push(material);
   system.arrows=new THREE.InstancedMesh(arrowGeometry,material,system.major.length);system.arrows.frustumCulled=false;system.arrows.name=planet.id+'-orbit-direction';group.add(system.arrows);
  }
  for(const [key,values,opacity] of [['orbits',lineVertices,.12],['innerOrbits',innerVertices,.23],['compactOrbits',overviewVertices,.10]]){
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(values,3));geometry.computeBoundingSphere();
   const material=new THREE.LineBasicMaterial({color:0x7b94a6,transparent:true,opacity,depthWrite:false});owned.push(geometry,material);
   system[key]=new THREE.LineSegments(geometry,material);system[key].name=planet.id+'-'+key;group.add(system[key]);
  }
 }
 function parentOf(id){return states.get(id)?.row.parent;}
 function loadTexture(state){
  if(state.textureLoaded||!state.mesh)return;const name=state.row.name.toLowerCase();
  const file=state.row.id==='moon'?'assets/moons/moon-lroc-2k.webp':textureFiles.get(name);
  if(!file)return;state.textureLoaded=true;
  loader.load(new URL('../../'+file,import.meta.url).href,texture=>{if(disposed){texture.dispose();return;}texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;state.mesh.material.map=texture;state.mesh.material.color.set(0xffffff);state.mesh.material.needsUpdate=true;owned.push(texture);},undefined,()=>{state.textureLoaded=false;});
 }
 function updatePositions(date){
  const parentFocus=parentOf(focus)||focus;
  for(const system of systems.values()){
   system.group.position.copy(planetGroups.get(system.planet.id).position);
   const active=focus==='overview'||parentFocus===system.planet.id;system.group.visible=active;
   system.compactOrbits.visible=focus==='overview';
   for(const row of system.records){const state=states.get(row.id);const p=relativePositionKm(row,date);
    if(p){const scale=focus==='overview'?state.compact:system.scale;state.offset.set(p.x*scale,p.y*scale,p.z*scale);}
    else state.offset.set(system.planet.size*1.9,0,0);
    state.position.copy(system.group.position).add(state.offset);
    if(state.mesh){state.mesh.position.copy(state.offset);state.mesh.visible=focus!=='overview'||state.major;if(active&&focus!=='overview')loadTexture(state);}
    else {dummy.position.copy(state.offset);dummy.rotation.set(row.naifId*.017||.4,row.naifId*.009||.8,.4);dummy.scale.setScalar(focus==='overview'?0:state.radius);dummy.updateMatrix();state.instances.setMatrixAt(state.instanceIndex,dummy.matrix);}
   }
   if(system.arrows)for(const [index,row] of system.major.entries()){
    const state=states.get(row.id),start=Number(date)+row.periodDays*86400000*.08;
    const a=relativePositionKm(row,new Date(start)),b=relativePositionKm(row,new Date(start+row.periodDays*86400000*.001));
    state.arrowOffset=new THREE.Vector3(a.x,a.y,a.z).multiplyScalar(system.scale);
    state.arrowDirection=new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z).normalize();
    state.arrowIndex=index;
   }
   if(system.instances){system.instances.instanceMatrix.needsUpdate=true;system.instances.boundingSphere=null;}
  }
 }
 function updateVisualSizes(){
  const height=Math.max(1,labelLayer.clientHeight),touch=matchMedia('(pointer:coarse)').matches;
  for(const system of systems.values()){
   if(!system.group.visible)continue;
   for(const row of system.records){
    const state=states.get(row.id),distance=camera.position.distanceTo(state.position);
    state.displayRadius=displayedMoonRadius({baseRadius:state.radius,distance,viewportHeight:height,fovDeg:camera.fov,major:state.major,selected:focus===row.id,touch,overview:focus==='overview',allOrbits:orbitMode==='all'});
    if(state.mesh)state.mesh.scale.setScalar(state.displayRadius);
    else{
     dummy.position.copy(state.offset);dummy.rotation.set(row.naifId*.017||.4,row.naifId*.009||.8,.4);
     dummy.scale.setScalar(focus==='overview'?0:state.displayRadius);dummy.updateMatrix();state.instances.setMatrixAt(state.instanceIndex,dummy.matrix);
    }
    if(system.arrows&&state.major&&state.arrowOffset){
     arrowDummy.position.copy(state.arrowOffset);arrowDummy.quaternion.setFromUnitVectors(up,state.arrowDirection);
     const d=camera.position.distanceTo(v.copy(system.group.position).add(state.arrowOffset));
     arrowDummy.scale.setScalar(2*d*Math.tan(camera.fov*Math.PI/360)/height*5.5);
     arrowDummy.updateMatrix();system.arrows.setMatrixAt(state.arrowIndex,arrowDummy.matrix);
    }
   }
   if(system.instances){system.instances.instanceMatrix.needsUpdate=true;system.instances.boundingSphere=null;}
   if(system.arrows)system.arrows.instanceMatrix.needsUpdate=true;
  }
 }
 function updateOrbitVisibility(dt=0){
  const blend=dt>0?1-Math.exp(-Math.min(dt,.1)*10):1;
  for(const system of systems.values()){
   const distance=camera.position.distanceTo(system.group.position),selected=states.get(focus);
   const closeMoon=selected&&camera.position.distanceTo(selected.position)<selected.radius*15;
   const opacity=moonOrbitOpacity({mode:orbitMode,distance,planetRadius:system.planet.size,closeMoon:focus==='overview'||closeMoon,count:system.records.length});
   for(const [key,target] of [['orbits',opacity.all],['innerOrbits',opacity.inner]]){
    const material=system[key].material;material.opacity+=(target-material.opacity)*blend;system[key].visible=material.opacity>.001;
   }
   if(system.arrows){system.arrows.visible=focus!=='overview'&&!closeMoon&&(system.orbits.visible||system.innerOrbits.visible);system.arrows.material.opacity=Math.min(.65,(system.orbits.material.opacity+system.innerOrbits.material.opacity)*5);}
  }
 }
 function pickNearRay(ray,{touch=false}={}){
  const height=Math.max(1,labelLayer.clientHeight),parentFocus=parentOf(focus)||focus;
  let chosen=null,best=Infinity;
  for(const state of states.values()){
   if(focus==='overview'?!state.major:state.row.parent!==parentFocus)continue;
   v.copy(state.position).project(camera);if(v.z<=-1||v.z>=1||Math.abs(v.x)>1.05||Math.abs(v.y)>1.05)continue;
   const along=v.copy(state.position).sub(ray.origin).dot(ray.direction);if(along<=0)continue;
   const unitsPerPixel=2*along*Math.tan(camera.fov*Math.PI/360)/height;
   const radius=Math.max(state.displayRadius,(touch?22:13)*unitsPerPixel);
   const miss=Math.sqrt(ray.distanceSqToPoint(state.position)),score=miss/radius+along*1e-9;
   if(miss<=radius&&score<best){chosen=state.row.id;best=score;}
  }
  return chosen;
 }
 function updateLabels(){
  const parentFocus=parentOf(focus)||focus;const selected=states.get(focus);let candidates=[];
  if(focus!=='overview'&&!(selected&&camera.position.distanceTo(selected.position)<selected.radius*12))candidates=[...(selected?[selected]:[]),...([...states.values()].filter(s=>s.major&&s.row.parent===parentFocus&&s!==selected))].slice(0,10);
  while(labelNodes.length<candidates.length){const button=document.createElement('button');button.type='button';button.className='natural-moon-label';button.addEventListener('click',()=>onSelect(button.dataset.moon));labelLayer.append(button);labelNodes.push(button);}
  const width=labelLayer.clientWidth,height=labelLayer.clientHeight,occupied=[],labelGap=matchMedia('(pointer:coarse)').matches?46:32;
  labelNodes.forEach((button,index)=>{
   const state=candidates[index];if(!state){button.hidden=true;return;}
   v.copy(state.position).project(camera);const x=(v.x*.5+.5)*width,y=(-v.y*.5+.5)*height;
   const visible=v.z>-1&&v.z<1&&x>15&&x<width-70&&y>30&&y<height-70&&!occupied.some(o=>Math.abs(o.x-x)<80&&Math.abs(o.y-y)<labelGap);
   button.hidden=!visible;if(!visible)return;occupied.push({x,y});button.dataset.moon=state.row.id;button.textContent=state.row.name;button.setAttribute('aria-label',(fr()?'Centrer sur ':'Focus ')+state.row.name);const d=Math.max(.00001,camera.position.distanceTo(state.position)),pixels=state.displayRadius*height/(2*Math.tan(camera.fov*Math.PI/360)*d);button.style.transform=`translate(${x+Math.max(10,pixels+6)}px,${y-14}px)`;
  });
 }
 updatePositions(lastDate);updateVisualSizes();updateOrbitVisibility();
 return {
  pickable,
  update(date=new Date(),dt=0){lastDate=date;const now=Number(date);if(Math.abs(now-lastUpdate)>200){updatePositions(date);lastUpdate=now;}else for(const state of states.values())state.position.copy(planetGroups.get(state.row.parent).position).add(state.offset);updateVisualSizes();updateOrbitVisibility(dt);updateLabels();},
  setFocus(id){const next=id||'overview';if((parentOf(next)||next)!==(parentOf(focus)||focus))orbitMode='auto';focus=next;updatePositions(lastDate);lastUpdate=Number(lastDate);updateVisualSizes();updateOrbitVisibility();updateLabels();},
  setOrbitMode(mode='auto'){orbitMode=['auto','inner','all'].includes(mode)?mode:'auto';updateVisualSizes();updateOrbitVisibility();},
  getOrbitMode:()=>orbitMode,
  getDisplayRadius:id=>states.get(id)?.displayRadius||0,
  getGroups:()=>[...systems.values()].map(system=>({parent:system.planet.id,group:system.group})),
  getGroup:parent=>systems.get(parent)?.group||null,
  pickNearRay,
  getParent:parentOf,
  getSatellites(parent){return systems.get(parent)?.records||[];},
  getMesh(id){return states.get(id)?.mesh||null;},
  getBody(id){const state=states.get(id);if(!state)return null;const row=state.row,known=state.mesh&&(textureFiles.has(row.name.toLowerCase())||id==='moon');return {...row,size:state.radius,displayRadius:state.displayRadius,name:id==='moon'?(fr()?'La Lune':'The Moon'):row.name,kind:fr()?'Satellite naturel':'Natural satellite',color:row.name==='Titan'?'#c9a66c':'#aeb6bd',subtitle:(fr()?'Satellite de ':'Moon of ')+(fr()?state.system.planet.name:({earth:'Earth',saturn:'Saturn'}[row.parent]||state.system.planet.name)),description:hasMeanOrbit(row)?(fr()?'Orbite moyenne issue du catalogue NASA/JPL. La position est indicative et ne remplace pas une éphéméride.':'Mean orbit from the NASA/JPL catalogue. The position is illustrative and does not replace an ephemeris.'):(fr()?'Petit satellite observé par Cassini. Aucun élément orbital moyen n’est publié par JPL ; le repère dans les anneaux est illustratif.':'A small satellite observed by Cassini. JPL publishes no mean orbital elements; its ring marker is illustrative.'),modelNote:(known?(id==='moon'?(fr()?'Texture LROC / NASA ; forme globale simplifiée.':'LROC / NASA texture; simplified global shape.'):(fr()?'Texture du modèle officiel NASA ; forme globale simplifiée.':'Official NASA model texture; simplified global shape.')):(fr()?'Surface et forme illustratives. Les petites lunes sont agrandies ; les dimensions non mesurées restent inconnues.':'Illustrative surface and shape. Small moons are enlarged; unmeasured dimensions remain unknown.'))+(fr()?' La taille d’affichage augmente à distance pour faciliter la sélection ; les dimensions du catalogue restent inchangées.':' Display size increases at a distance for easier selection; catalogue dimensions remain unchanged.')};},
  worldPosition(id){return states.get(id)?.position;},
  getViewRadius(parent,{majorOnly=false}={}){const sys=systems.get(parent);return sys?(majorOnly?sys.majorRadius:sys.fullRadius):planets.find(p=>p.id===parent)?.size||1;},
  resolveIntersection(hit){return hit.object.userData.moonIds?.[hit.instanceId]|| (states.has(hit.object.userData.id)?hit.object.userData.id:null);},
  getCounts(){return {...catalogue.coverage,total:rows.length,renderedMeanOrbits:rows.filter(hasMeanOrbit).length};},
  dispose(){disposed=true;for(const sys of systems.values())sys.group.removeFromParent();for(const item of owned)item.dispose();labelLayer.remove();}
 };
}
