import {COMET_IDS, interpolateCometState, cometPositionInScene, cometFixedInScene} from './comet-ephemeris.js';

const ROOT = new URL('../../assets/comets/67p/', import.meta.url);
const FRAME_SCALE = 1.2; // Display units per km: enlarged nucleus, consistent local landing coordinates.
const EPOCH_PERIOD_DAYS = 6.44237116469175 * 365.25;

function parseShape(THREE, text) {
  const vertices = [], indices = [];
  for (const line of text.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (fields[0] === 'v') { const p = cometFixedInScene(fields.slice(1,4).map(Number), FRAME_SCALE); vertices.push(p.x, p.y, p.z); }
    else if (fields[0] === 'f') {
      const face = fields.slice(1).map(value => Number(value.split('/')[0]) - 1);
      for (let i = 1; i + 1 < face.length; i++) indices.push(face[0], face[i], face[i+1]);
    }
  }
  if (!vertices.length || !indices.length || !vertices.every(Number.isFinite)) throw new Error('Invalid 67P scientific shape');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices);
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

/** Sourced nucleus and landing positions. Hardware shapes are explicitly enlarged schematics. */
export async function createComet67P({THREE, scene, auToWorld, onSelect, getLanguage = () => 'en', camera, labelHost}) {
  const read = async (file, text = false) => { const response = await fetch(new URL(file, ROOT)); if (!response.ok) throw new Error('67P asset HTTP ' + response.status); return text ? response.text() : response.json(); };
  const [ephemeris, provenance, obj] = await Promise.all([read('ephemeris.json'), read('provenance.json'), read('shape-shap5-24k.obj', true)]);
  const fr = () => getLanguage() === 'fr';
  const group = new THREE.Group(); group.name = '67p-measured-nucleus'; scene.add(group);
  const geometry = parseShape(THREE, obj);
  const material = new THREE.MeshStandardMaterial({color:0x79766f, roughness:1, metalness:0, emissive:0x000000});
  const nucleus = new THREE.Mesh(geometry, material); nucleus.name = '67P OSIRIS SPC SHAP5'; nucleus.userData.id = '67p'; group.add(nucleus);
  const radius = geometry.boundingSphere.radius + geometry.boundingSphere.center.length();
  const pickable = [nucleus], owned = [geometry, material], sites = new Map(), positions = new Map([['67p', group.position]]);
  let focus = 'overview', lastState = null, disposed = false;

  function mesh(parent, geo, mat, name, x=0, y=0, z=0) {
    const item = new THREE.Mesh(geo, mat); item.name = name; item.position.set(x,y,z); parent.add(item); owned.push(geo); return item;
  }
  const gold = new THREE.MeshStandardMaterial({color:0xc4a05b, emissive:0xc4a05b, emissiveIntensity:.28, roughness:.72, metalness:.25});
  const blue = new THREE.MeshStandardMaterial({color:0x203c68, emissive:0x203c68, emissiveIntensity:.4, roughness:.6, metalness:.15});
  const white = new THREE.MeshStandardMaterial({color:0xdedbd4, emissive:0xdedbd4, emissiveIntensity:.22, roughness:.7}); owned.push(gold, blue, white);
  for (const id of ['philae', 'rosetta']) {
    const source = provenance.landings[id], point = cometFixedInScene(source.positionKm, FRAME_SCALE);
    const anchor = new THREE.Group(); anchor.name = id + '-measured-landing-site'; anchor.position.set(point.x,point.y,point.z); group.add(anchor);
    const outward = anchor.position.clone().normalize();
    const pinMaterial = new THREE.MeshBasicMaterial({color:id === 'philae' ? 0xf0cc7d : 0x81c7ed, depthTest:false}); owned.push(pinMaterial);
    const pin = mesh(anchor, new THREE.SphereGeometry(.026,16,12), pinMaterial, id + '-position-marker'); pin.renderOrder = 12; pin.userData.id = id; pickable.push(pin);
    const craft = new THREE.Group(); craft.name = id + '-enlarged-schematic'; craft.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), outward); anchor.add(craft);
    if (id === 'philae') {
      const model = new THREE.Group(); craft.add(model); model.rotation.z = 1.15; // Illustrative side-on pose, not an attitude reconstruction.
      mesh(model,new THREE.CylinderGeometry(.022,.020,.039,6),gold,'Philae bus',0,.025,0);
      mesh(model,new THREE.CylinderGeometry(.024,.024,.004,6),blue,'Philae solar panels',0,.047,0);
      for (let leg=0;leg<3;leg++) {
        const angle=leg*Math.PI*2/3, x=Math.cos(angle)*.051, z=Math.sin(angle)*.051;
        const start=new THREE.Vector3(0,.012,0),end=new THREE.Vector3(x,-.015,z),mid=start.clone().add(end).multiplyScalar(.5);
        const strut=mesh(model,new THREE.CylinderGeometry(.0015,.0015,start.distanceTo(end),6),white,'Philae landing leg',mid.x,mid.y,mid.z);
        strut.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());
        mesh(model,new THREE.CylinderGeometry(.010,.010,.003,10),gold,'Philae foot',x,-.017,z);
      }
    } else {
      mesh(craft,new THREE.BoxGeometry(.022,.019,.018),gold,'Rosetta bus',0,.020,0);
      for (const sign of [-1,1]) mesh(craft,new THREE.BoxGeometry(.092,.0015,.025),blue,'Rosetta solar wing',sign*.062,.020,0);
      const dish=mesh(craft,new THREE.SphereGeometry(.012,16,10,0,Math.PI*2,0,Math.PI/2),white,'Rosetta high-gain antenna',0,.039,0); dish.scale.y=.35;
    }
    // The enlarged inspection schematic must stay readable above the coarse global terrain.
    craft.traverse(item=>{if(item.isMesh){item.userData.id=id;item.renderOrder=20;item.material.depthTest=false;pickable.push(item);}});
    sites.set(id,{anchor,craft,pin,outward,source,size:id==='philae'?.075:.17});positions.set(id,new THREE.Vector3());
  }

  const orbitPoints=[]; const startJD=ephemeris.states[0][0];
  for (const row of ephemeris.states) {
    if(row[0]-startJD>EPOCH_PERIOD_DAYS)break;
    const p=cometPositionInScene({x:row[1],y:row[2],z:row[3]},auToWorld);orbitPoints.push(new THREE.Vector3(p.x,p.y,p.z));
  }
  const orbitGeometry=new THREE.BufferGeometry().setFromPoints(orbitPoints), orbitMaterial=new THREE.LineBasicMaterial({color:0xc4a56c,transparent:true,opacity:.17,depthWrite:false});
  const orbit=new THREE.Line(orbitGeometry,orbitMaterial);orbit.name='67P Horizons heliocentric trajectory';scene.add(orbit);owned.push(orbitGeometry,orbitMaterial);
  const labels=[];
  const layer=labelHost&&document.createElement('div');
  if(layer){layer.className='comet-label-layer';labelHost.parentElement.append(layer);for(const id of COMET_IDS){const button=document.createElement('button');button.type='button';button.className='comet-site-label';button.textContent=id==='67p'?'67P':id==='philae'?'Philae · Abydos':'Rosetta · Sais';button.addEventListener('click',()=>onSelect(id));layer.append(button);labels.push({id,button});}}
  const projected=new THREE.Vector3();
  function updateLabels(){
    if(!layer||!camera)return;
    const w=layer.clientWidth,h=layer.clientHeight;
    for(const {id,button} of labels){
      let visible=group.visible&&(focus==='overview'?id==='67p':id!=='67p');
      const point=positions.get(id);projected.copy(point).project(camera);
      const x=(projected.x*.5+.5)*w,y=(-projected.y*.5+.5)*h;
      if(id!=='67p'&&focus==='67p'){const site=sites.get(id);visible=visible&&site.outward.dot(camera.position.clone().sub(point))>0;}
      if(focus===id&&id!=='67p')visible=false;
      visible=visible&&projected.z>-1&&projected.z<1&&x>20&&x<w-110&&y>20&&y<h-65;
      button.hidden=!visible;if(visible)button.style.transform=`translate(${x+12}px,${y-10}px)`;
    }
  }
  function update(date=new Date()){
    lastState=interpolateCometState(ephemeris,date);
    if(lastState){const p=cometPositionInScene(lastState.positionKm,auToWorld);group.position.set(p.x,p.y,p.z);}
    group.visible=Boolean(lastState)&&(focus==='overview'||COMET_IDS.includes(focus));orbit.visible=focus==='overview';
    group.updateMatrixWorld(true);
    for(const [id,site] of sites){site.craft.visible=focus===id;site.anchor.getWorldPosition(positions.get(id));site.pin.visible=focus==='67p'&&(!camera||site.outward.dot(camera.position.clone().sub(positions.get(id)))>0);}
    updateLabels();
  }
  function getBody(id){
    if(!COMET_IDS.includes(id))return null;
    const common={id,color:'#aaa397',sourceUrl:'https://ssd.jpl.nasa.gov/horizons/',sourceName:'NASA/JPL Horizons',ephemerisStatus:lastState?.state||'unavailable',distanceFromSunKm:lastState?.distanceKm,validAt:lastState?.validAt};
    if(id==='67p')return {...common,name:'67P / Churyumov–Gerasimenko',kind:fr()?'Comète':'Comet',subtitle:fr()?'La comète de Rosetta et Philae':'Rosetta and Philae’s comet',size:radius,radiusKm:1.7,description:fr()?'Philae repose à Abydos depuis 2014. Rosetta a terminé sa mission à Sais en 2016. Leur position sur le noyau provient des données ESA SPICE.':'Philae has rested at Abydos since 2014. Rosetta ended its mission at Sais in 2016. Their positions on the nucleus come from ESA SPICE data.',modelNote:fr()?'Forme mesurée OSIRIS SHAP5, réduite à 24 000 facettes. Position héliocentrique JPL Horizons interpolée pour la date actuelle (2025–2032). Pose de référence fixe : la rotation actuelle du noyau n’est pas reconstruite.':'Measured OSIRIS SHAP5 shape, reduced to 24,000 facets. Date-dependent heliocentric position interpolated from JPL Horizons (2025–2032). Fixed reference pose: the nucleus’ current spin phase is not reconstructed.',sites:['philae','rosetta']};
    const site=sites.get(id),image=provenance.images.find(row=>row.id===id),isPhilae=id==='philae';
    return {...common,parent:'67p',name:isPhilae?'Philae':'Rosetta',kind:fr()?'Matériel spatial':'Space hardware',subtitle:(isPhilae?'Abydos':'Sais')+' · 67P',size:site.size,latitudeDeg:site.source.latitudeDeg,longitudeDeg:site.source.longitudeDeg,positionFrame:site.source.frame,positionKm:site.source.positionKm,sourceUrl:site.source.source,sourceName:'ESA SPICE · '+(isPhilae?'SONC-FD':'Rosetta impact reconstruction'),coordinateConvention:'Planetocentric latitude / east-positive longitude',
      description:fr()?(isPhilae?'Position finale publiée par SONC-FD en 2017, dans le repère Cheops. Philae a été photographié à cet emplacement en septembre 2016.':'Site d’impact reconstruit par ESA SPICE, à partir du dernier état de la trajectoire. Aucune image de Rosetta après l’impact ne permet de connaître l’état actuel du matériel.'):(isPhilae?'Final position published by SONC-FD in 2017 in the Cheops frame. Philae was photographed here in September 2016.':'Impact site reconstructed by ESA SPICE from the trajectory’s final state. No post-impact image of Rosetta establishes the hardware’s present condition.'),
      modelNote:fr()?'Coordonnées scientifiques conservées ; le maillage global ne résout pas les détails locaux. Le matériel est un schéma agrandi, avec une orientation et un éclairage de lecture illustratifs. Les décimales de la source ne donnent pas une précision garantie.':'Source coordinates are retained; the global mesh does not resolve local terrain. Hardware is an enlarged schematic with illustrative attitude and inspection fill light. Source decimal places do not imply guaranteed accuracy.',
      observedImage:{...image,src:new URL(image.file.split('/').at(-1),ROOT).href,caption:fr()?(isPhilae?'Philae observé par OSIRIS le 2 septembre 2016.':'Images OSIRIS du site de Sais pendant la descente ; elles ne montrent pas l’épave après l’impact.'):(isPhilae?'Philae observed by OSIRIS on 2 September 2016.':'OSIRIS descent images of the Sais site; these do not show the wreck after impact.')}};
  }
  update();
  return {group,pickable,orbit,provenance,ephemeris,getBody,
    update,
    getHeliocentricPosition(date=new Date()){return interpolateCometState(ephemeris,date)?.positionKm||null;},
    setFocus(id){focus=id||'overview';update(lastState?.validAt?new Date(lastState.validAt):new Date());},
    getParent:id=>id==='philae'||id==='rosetta'?'67p':undefined,
    worldPosition:id=>COMET_IDS.includes(id)&&lastState?positions.get(id):undefined,
    getMesh:id=>id==='67p'?nucleus:sites.get(id)?.craft||null,
    getApproachDirection(id){const site=sites.get(id);if(!site)return null;const tangent=new THREE.Vector3(0,1,0).cross(site.outward).normalize();return site.outward.clone().multiplyScalar(.9).addScaledVector(tangent,.32).normalize();},
    getSceneMeshes(){const meshes=[];group.traverse(item=>{if(item.isMesh)meshes.push(item);});return meshes;},
    dispose(){if(disposed)return;disposed=true;group.removeFromParent();orbit.removeFromParent();for(const item of owned)item.dispose();layer?.remove();}
  };
}
