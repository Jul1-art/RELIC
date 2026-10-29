/** Ray/sphere intersection used by globe grabbing and pointer-anchored zoom. */
export function intersectGlobeRay(origin, direction, center, radius) {
  const length=Math.hypot(direction.x,direction.y,direction.z);
  if(!(length>0)||!Number.isFinite(length)||!(radius>0))return null;
  const dx=direction.x/length,dy=direction.y/length,dz=direction.z/length;
  const x=origin.x-center.x,y=origin.y-center.y,z=origin.z-center.z;
  const along=x*dx+y*dy+z*dz,constant=x*x+y*y+z*z-radius*radius;
  const discriminant=along*along-constant;
  if(discriminant<0||!Number.isFinite(discriminant))return null;
  const root=Math.sqrt(discriminant),near=-along-root,far=-along+root;
  const distance=near>=0?near:far>=0?far:null;
  return distance===null?null:{x:origin.x+dx*distance,y:origin.y+dy*distance,z:origin.z+dz*distance,distance};
}

/** A small physical clearance above imagery tiles, never a claim of measured terrain. */
export function minimumGlobeAltitude({radius,radiusKm,minAltitudeKm=.001}) {
  const measured=Number.isFinite(radiusKm)&&radiusKm>0?radius*Math.max(.001,minAltitudeKm)/radiusKm:radius*1e-6;
  return Math.max(radius*1e-8,measured);
}

/** Stable inspection controls. The selected globe never gets panned off its centre.
 * Dragging parallel-transports the camera around the sphere; wheel/pinch keeps
 * the grabbed surface point under the pointer. Ordinary OrbitControls retain
 * overview/sky gestures, and source imagery remains attached to the globe.
 */
export function createGlobeNavigation({THREE,camera,controls,domElement,getFocus,onInteraction=()=>{},onNavigate}) {
  const raycaster=new THREE.Raycaster(),ndc=new THREE.Vector2(),center=new THREE.Vector3();
  const quaternion=new THREE.Quaternion(),offset=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3();
  const originalUp=camera.up.clone(),originalNear=camera.near,pointers=new Map();
  let anchor=null,previousCentroid=null,previousSpread=0,dragId=null,savedEnabled=true,disposed=false;
  function focus(){
    const value=getFocus?.();
    if(!value?.mesh?.isMesh||!(value.radius>0)||!value.center)return null;
    return value;
  }
  function toNdc(point){
    const bounds=domElement.getBoundingClientRect();
    return ndc.set((point.x-bounds.left)/Math.max(1,bounds.width)*2-1,-(point.y-bounds.top)/Math.max(1,bounds.height)*2+1);
  }
  function hit(pointer,value=focus()){
    if(!value)return null;
    camera.updateMatrixWorld(true);raycaster.setFromCamera(pointer,camera);
    const result=intersectGlobeRay(raycaster.ray.origin,raycaster.ray.direction,value.center,value.radius);
    return result?new THREE.Vector3(result.x,result.y,result.z):null;
  }
  function changed(value){
    controls.target.copy(value.center);camera.lookAt(value.center);camera.updateMatrixWorld(true);controls.update();
  }
  function rotateCamera(q,value){
    offset.copy(camera.position).sub(value.center).applyQuaternion(q);
    camera.position.copy(value.center).add(offset);camera.up.applyQuaternion(q).normalize();changed(value);
  }
  function preserveAnchor(pointer,point,value){
    const after=hit(pointer,value);if(!after)return false;
    a.copy(after).sub(value.center).normalize();b.copy(point).sub(value.center).normalize();
    quaternion.setFromUnitVectors(a,b);rotateCamera(quaternion,value);return true;
  }
  function limits(value){
    const minimum=value.radius+minimumGlobeAltitude(value);
    controls.minDistance=minimum;
    return {minimum,maximum:Math.max(minimum,Number.isFinite(controls.maxDistance)?controls.maxDistance:minimum*10000)};
  }
  function enforce(){
    const value=focus();if(!value)return false;
    const {minimum}=limits(value);offset.copy(camera.position).sub(value.center);
    const distance=offset.length(),epsilon=Math.max(value.radius*1e-12,1e-13);
    if(!Number.isFinite(distance))return false;
    let moved=false;
    if(distance+epsilon<minimum){if(distance<epsilon)offset.set(0,0,1);offset.setLength(minimum);camera.position.copy(value.center).add(offset);changed(value);moved=true;}
    const altitude=Math.max(minimum-value.radius,camera.position.distanceTo(value.center)-value.radius);
    const near=Math.max(value.radius*1e-9,Math.min(value.radius*.005,altitude*.12));
    if(Math.abs(camera.near-near)>Math.max(near*.1,value.radius*1e-10)){camera.near=near;camera.updateProjectionMatrix();}
    return moved;
  }
  function zoom(factor,pointer){
    const value=focus();if(!value||!Number.isFinite(factor)||factor<=0)return false;
    onInteraction();const grabbed=pointer?hit(pointer,value):null;
    const {minimum,maximum}=limits(value);offset.copy(camera.position).sub(value.center);
    let distance=offset.length();if(!(distance>0)){offset.set(0,0,1);distance=minimum;}
    const altitude=Math.max(minimum-value.radius,distance-value.radius);
    offset.setLength(Math.min(maximum,Math.max(minimum,value.radius+altitude*factor)));
    camera.position.copy(value.center).add(offset);changed(value);
    if(grabbed)preserveAnchor(pointer,grabbed,value);
    enforce();return true;
  }
  function focusPoint(pointer,factor=.28){
    const value=focus(),point=hit(pointer,value);if(!value||!point)return false;
    onInteraction();const {minimum,maximum}=limits(value);
    const altitude=Math.max(minimum-value.radius,(camera.position.distanceTo(value.center)-value.radius)*factor);
    const position=point.sub(value.center).normalize().multiplyScalar(Math.min(maximum,value.radius+altitude)).add(value.center);
    if(onNavigate)onNavigate(value.center.clone(),position,550);
    else{camera.position.copy(position);changed(value);enforce();}
    return true;
  }
  function centroid(){const values=[...pointers.values()];return {x:values.reduce((sum,p)=>sum+p.x,0)/values.length,y:values.reduce((sum,p)=>sum+p.y,0)/values.length};}
  function spread(){const values=[...pointers.values()];return values.length<2?0:Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y);}
  function refreshGrab(){previousCentroid=centroid();previousSpread=spread();anchor=hit(toNdc(previousCentroid));}
  function consume(event){event.preventDefault();event.stopImmediatePropagation();}
  function down(event){
    const value=focus();if(!value||event.pointerType!=='touch'&&event.button!==0&&event.button!==2)return;
    const point={x:event.clientX,y:event.clientY};if(!pointers.size&&!hit(toNdc(point),value))return;
    if(!pointers.size){onInteraction();savedEnabled=controls.enabled;controls.enabled=false;dragId=value.id;}
    pointers.set(event.pointerId,point);domElement.setPointerCapture?.(event.pointerId);refreshGrab();consume(event);
  }
  function move(event){
    if(!pointers.has(event.pointerId))return;
    const value=focus();if(!value||value.id!==dragId){reset();return;}
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});const current=centroid(),currentNdc=toNdc(current).clone();
    if(anchor&&!preserveAnchor(currentNdc,anchor,value)){
      const altitude=Math.max(minimumGlobeAltitude(value),camera.position.distanceTo(value.center)-value.radius);
      const height=Math.max(1,domElement.getBoundingClientRect().height),scale=2*altitude*Math.tan(camera.fov*Math.PI/360)/height/value.radius;
      const dx=Math.max(-.3,Math.min(.3,(current.x-previousCentroid.x)*scale)),dy=Math.max(-.3,Math.min(.3,(current.y-previousCentroid.y)*scale));
      a.copy(camera.up).normalize();quaternion.setFromAxisAngle(a,-dx);rotateCamera(quaternion,value);
      a.set(1,0,0).applyQuaternion(camera.quaternion);quaternion.setFromAxisAngle(a,-dy);rotateCamera(quaternion,value);
    }
    const distance=spread();if(previousSpread>8&&distance>8)zoom(previousSpread/distance,currentNdc);
    previousCentroid=current;previousSpread=distance;anchor=hit(currentNdc,value);enforce();consume(event);
  }
  function up(event){
    if(!pointers.has(event.pointerId))return;
    pointers.delete(event.pointerId);try{domElement.releasePointerCapture?.(event.pointerId);}catch{/* Capture may already be released by the browser. */}
    if(pointers.size)refreshGrab();else{controls.enabled=savedEnabled;anchor=null;dragId=null;previousCentroid=null;previousSpread=0;}
    consume(event);
  }
  function doubleClick(event){if(focusPoint(toNdc({x:event.clientX,y:event.clientY})))consume(event);}
  function contextMenu(event){if(focus())event.preventDefault();}
  const listeners={pointerdown:down,pointermove:move,pointerup:up,pointercancel:up,dblclick:doubleClick,contextmenu:contextMenu};
  for(const [type,handler] of Object.entries(listeners))domElement.addEventListener(type,handler,{capture:true,passive:false});
  function reset(){
    if(pointers.size)controls.enabled=savedEnabled;
    for(const id of pointers.keys())try{domElement.releasePointerCapture?.(id);}catch{}
    pointers.clear();anchor=null;previousCentroid=null;previousSpread=0;dragId=null;
    camera.up.copy(originalUp);camera.near=originalNear;camera.updateProjectionMatrix();
  }
  function getSurfaceCoordinates(){
    const value=focus();if(!value)return null;value.mesh.updateWorldMatrix(true,false);
    const local=value.mesh.worldToLocal(camera.position.clone()).normalize();
    const latitude=Math.asin(Math.max(-1,Math.min(1,local.y)))*180/Math.PI;
    const longitude=((Math.atan2(-local.z,local.x)*180/Math.PI+540)%360)-180;
    const altitudeRatio=Math.max(0,camera.position.distanceTo(value.center)/value.radius-1);
    return {id:value.id,latitude,longitude,altitudeRatio,altitudeKm:Number.isFinite(value.radiusKm)?altitudeRatio*value.radiusKm:null};
  }
  return {zoom,focusPoint,enforce,reset,getSurfaceCoordinates,
    dispose(){if(disposed)return;disposed=true;reset();for(const [type,handler] of Object.entries(listeners))domElement.removeEventListener(type,handler,{capture:true});}
  };
}
