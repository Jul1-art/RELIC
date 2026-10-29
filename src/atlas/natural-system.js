import {loadMoonCatalogue,relativePositionKm,sampleOrbitKm,hasMeanOrbit} from './moon-data.js';

/** Complete planetary moon catalogue, batched orbits and selectable 3D bodies. */
export async function createNaturalSystems({THREE,scene,planetGroups,planets,getLanguage,onSelect,getSelected,labelHost,camera}){
 const catalogue=await loadMoonCatalogue();
 const textureCatalogue=await fetch(new URL('../../assets/moons/texture-catalog.json',import.meta.url)).then(r=>r.json());
 const textureFiles=new Map(textureCatalogue.textures.map(t=>[t.name,t.file]));const rows=catalogue.satellites.filter(r=>planetGroups.has(r.parent));
 const states=new Map(),systems=new Map(),pickable=[],owned=[],labelNodes=[];
 const dummy=new THREE.Object3D(),v=new THREE.Vector3();let focus='overview',lastDate=new Date(),lastUpdate=-Infinity,disposed=false;
 const sphere=new THREE.SphereGeometry(1,64,40),rock=new THREE.IcosahedronGeometry(1,1);owned.push(sphere,rock);
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
   const state={row,system,major:isMajor,radius,position:new THREE.Vector3(),offset:new THREE.Vector3(),compact:hasMeanOrbit(row)?planet.size*(2+2.2*Math.pow(row.aKm/majorA,.6))/row.aKm:0,textureLoaded:false};
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
   if(system.instances){system.instances.instanceMatrix.needsUpdate=true;system.instances.boundingSphere=null;}
  }
 }
 function updateOrbitVisibility(){
  for(const system of systems.values()){
   const distance=camera.position.distanceTo(system.group.position);const selected=states.get(focus);
   const closeMoon=selected&&camera.position.distanceTo(selected.position)<selected.radius*15;
   const show=focus!=='overview'&&!closeMoon&&distance>system.planet.size*8;
   const all=distance>system.majorRadius*4;
   system.orbits.visible=show&&all;system.innerOrbits.visible=show&&!all;
  }
 }
 function updateLabels(){
  const parentFocus=parentOf(focus)||focus;const selected=states.get(focus);let candidates=[];
  if(focus!=='overview'&&!(selected&&camera.position.distanceTo(selected.position)<selected.radius*12))candidates=[...(selected?[selected]:[]),...([...states.values()].filter(s=>s.major&&s.row.parent===parentFocus&&s!==selected))].slice(0,10);
  while(labelNodes.length<candidates.length){const button=document.createElement('button');button.type='button';button.className='natural-moon-label';button.addEventListener('click',()=>onSelect(button.dataset.moon));labelLayer.append(button);labelNodes.push(button);}
  const width=labelLayer.clientWidth,height=labelLayer.clientHeight,occupied=[];
  labelNodes.forEach((button,index)=>{
   const state=candidates[index];if(!state){button.hidden=true;return;}
   v.copy(state.position).project(camera);const x=(v.x*.5+.5)*width,y=(-v.y*.5+.5)*height;
   const visible=v.z>-1&&v.z<1&&x>15&&x<width-70&&y>30&&y<height-70&&!occupied.some(o=>Math.abs(o.x-x)<80&&Math.abs(o.y-y)<24);
   button.hidden=!visible;if(!visible)return;occupied.push({x,y});button.dataset.moon=state.row.id;button.textContent=state.row.name;button.style.transform=`translate(${x+8}px,${y-10}px)`;
  });
 }
 updatePositions(lastDate);
 return {
  pickable,
  update(date=new Date(),dt=0){lastDate=date;const now=Number(date);if(Math.abs(now-lastUpdate)>200){updatePositions(date);lastUpdate=now;}else for(const state of states.values())state.position.copy(planetGroups.get(state.row.parent).position).add(state.offset);updateOrbitVisibility();updateLabels();},
  setFocus(id){focus=id||'overview';updatePositions(lastDate);lastUpdate=Number(lastDate);updateOrbitVisibility();updateLabels();},
  getParent:parentOf,
  getSatellites(parent){return systems.get(parent)?.records||[];},
  getMesh(id){return states.get(id)?.mesh||null;},
  getBody(id){const state=states.get(id);if(!state)return null;const row=state.row,known=state.mesh&&(textureFiles.has(row.name.toLowerCase())||id==='moon');return {...row,size:state.radius,name:id==='moon'?(fr()?'La Lune':'The Moon'):row.name,kind:fr()?'Satellite naturel':'Natural satellite',color:row.name==='Titan'?'#c9a66c':'#aeb6bd',subtitle:(fr()?'Satellite de ':'Moon of ')+(fr()?state.system.planet.name:({earth:'Earth',saturn:'Saturn'}[row.parent]||state.system.planet.name)),description:hasMeanOrbit(row)?(fr()?'Orbite moyenne issue du catalogue NASA/JPL. La position est indicative et ne remplace pas une éphéméride.':'Mean orbit from the NASA/JPL catalogue. The position is illustrative and does not replace an ephemeris.'):(fr()?'Petit satellite observé par Cassini. Aucun élément orbital moyen n’est publié par JPL ; le repère dans les anneaux est illustratif.':'A small satellite observed by Cassini. JPL publishes no mean orbital elements; its ring marker is illustrative.'),modelNote:known?(id==='moon'?(fr()?'Texture LROC / NASA ; forme globale simplifiée.':'LROC / NASA texture; simplified global shape.'):(fr()?'Texture du modèle officiel NASA ; forme globale simplifiée.':'Official NASA model texture; simplified global shape.')):(fr()?'Surface et forme illustratives. Les petites lunes sont agrandies ; les dimensions non mesurées restent inconnues.':'Illustrative surface and shape. Small moons are enlarged; unmeasured dimensions remain unknown.')};},
  worldPosition(id){return states.get(id)?.position;},
  getViewRadius(parent,{majorOnly=false}={}){const sys=systems.get(parent);return sys?(majorOnly?sys.majorRadius:sys.fullRadius):planets.find(p=>p.id===parent)?.size||1;},
  resolveIntersection(hit){return hit.object.userData.moonIds?.[hit.instanceId]|| (states.has(hit.object.userData.id)?hit.object.userData.id:null);},
  getCounts(){return {...catalogue.coverage,total:rows.length,renderedMeanOrbits:rows.filter(hasMeanOrbit).length};},
  dispose(){disposed=true;for(const sys of systems.values())sys.group.removeFromParent();for(const item of owned)item.dispose();labelLayer.remove();}
 };
}
