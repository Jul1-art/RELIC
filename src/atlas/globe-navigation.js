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

/** One metre is only a safe camera clearance above the globe, not measured relief. */
export function minimumGlobeAltitude({radius,radiusKm,minAltitudeKm=.001}) {
  const measured=Number.isFinite(radiusKm)&&radiusKm>0?radius*Math.max(.001,minAltitudeKm)/radiusKm:radius*1e-6;
  return Math.max(radius*1e-8,measured);
}

/** Locked globe controls. Left drag grabs geography; right/Shift drag and
 * two-finger drag look freely from the camera's current position, including
 * above the horizon. Ctrl/middle drag retains surface-pivot orbiting. A stored
 * free-look quaternion survives OrbitControls.update(), while controls.target
 * stays at the body centre for the atlas tracking and exit-distance code.
 */
export function createGlobeNavigation({THREE,camera,controls,domElement,getFocus,onInteraction=()=>{},onNavigate}) {
  const raycaster=new THREE.Raycaster(),ndc=new THREE.Vector2();
  const quaternion=new THREE.Quaternion(),offset=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3();
  const originalUp=camera.up.clone(),originalNear=camera.near,pointers=new Map();
  const radians=Math.PI/180;
  let anchor=null,previousCentroid=null,previousSpread=0,previousAngle=0,dragId=null,dragMode='grab',savedEnabled=true,disposed=false,frame=null,freeLook=null;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function focus(){
    const value=getFocus?.();
    if(!value?.mesh?.isMesh||!(value.radius>0)||!value.center){if(freeLook)camera.up.copy(originalUp);freeLook=null;frame=null;return null;}
    if(frame&&frame.id!==value.id)frame=null;
    if(freeLook&&freeLook.id!==value.id){freeLook=null;camera.up.copy(originalUp);}
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
  function frameBasis(point,value){
    const normal=point.clone().sub(value.center).normalize();
    value.mesh.updateWorldMatrix(true,false);
    let north=new THREE.Vector3(0,1,0).transformDirection(value.mesh.matrixWorld);
    north.addScaledVector(normal,-north.dot(normal));
    if(north.lengthSq()<1e-10){north.copy(camera.up).addScaledVector(normal,-camera.up.dot(normal));}
    if(north.lengthSq()<1e-10)north.set(0,0,1).addScaledVector(normal,-normal.z);
    north.normalize();const east=new THREE.Vector3().crossVectors(north,normal).normalize();
    return {normal,north,east};
  }
  function ensureFrame(value){
    if(frame?.id===value.id)return frame;
    const pivot=hit(new THREE.Vector2(),value)||camera.position.clone().sub(value.center).normalize().multiplyScalar(value.radius).add(value.center);
    const {normal,north,east}=frameBasis(pivot,value),relative=camera.position.clone().sub(pivot),range=relative.length();
    const tangent=relative.clone().addScaledVector(normal,-relative.dot(normal));
    const tilt=range>0?Math.acos(clamp(relative.dot(normal)/range,-1,1)):0;
    const heading=tangent.lengthSq()>1e-14?Math.atan2(tangent.dot(east),-tangent.dot(north)):0;
    frame={id:value.id,pivot,normal,north,east,range:Math.max(minimumGlobeAltitude(value),range),tilt:clamp(tilt,0,85*radians),heading,position:camera.position.clone()};
    return frame;
  }
  function look(value){
    if(freeLook?.id===value.id){
      camera.quaternion.copy(freeLook.quaternion);camera.up.copy(freeLook.up);
    }else if(frame?.id===value.id){
      // The globe remains anchored while the camera can look toward its horizon.
      const up=frame.normal.clone().multiplyScalar(Math.sin(frame.tilt)).addScaledVector(frame.north,Math.cos(frame.tilt)*Math.cos(frame.heading)).addScaledVector(frame.east,-Math.cos(frame.tilt)*Math.sin(frame.heading));
      camera.up.copy(up.normalize());camera.lookAt(frame.pivot);
    }else camera.lookAt(value.center);
    camera.updateMatrixWorld(true);
  }
  function changed(value){
    controls.target.copy(value.center);controls.update();look(value);
    if(frame?.id===value.id)frame.position.copy(camera.position);
    if(freeLook?.id===value.id)freeLook.position.copy(camera.position);
  }
  function placeFrame(value){
    const f=frame,c=Math.cos(f.tilt),s=Math.sin(f.tilt),minimum=minimumGlobeAltitude(value);
    // Solve the radial-clearance constraint for the slant range from the pivot.
    const minimumRange=-value.radius*c+Math.sqrt(value.radius*value.radius*c*c+2*value.radius*minimum+minimum*minimum);
    f.range=Math.max(minimumRange,f.range);
    offset.copy(f.normal).multiplyScalar(c).addScaledVector(f.north,-s*Math.cos(f.heading)).addScaledVector(f.east,s*Math.sin(f.heading));
    camera.position.copy(f.pivot).addScaledVector(offset,f.range);changed(value);enforce();
  }
  function rotateCamera(q,value){
    offset.copy(camera.position).sub(value.center).applyQuaternion(q);
    camera.position.copy(value.center).add(offset);camera.up.applyQuaternion(q).normalize();
    if(frame?.id===value.id){frame.pivot.sub(value.center).applyQuaternion(q).add(value.center);for(const vector of [frame.normal,frame.north,frame.east])vector.applyQuaternion(q).normalize();}
    if(freeLook?.id===value.id){freeLook.quaternion.premultiply(q);freeLook.up.applyQuaternion(q).normalize();}
    changed(value);
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
    if(distance+epsilon<minimum){if(distance<epsilon)offset.set(0,0,1);offset.setLength(minimum);camera.position.copy(value.center).add(offset);moved=true;}
    if(freeLook?.id===value.id){
      if(camera.position.distanceTo(freeLook.position)<epsilon*100)camera.position.copy(freeLook.position);
      else freeLook.position.copy(camera.position);
      look(value);
    }else if(frame?.id===value.id){
      // OrbitControls reprojects spherical coordinates even without input. Snap
      // only roundoff back to our planned pose, never override an external flight.
      if(camera.position.distanceTo(frame.position)<epsilon*100)camera.position.copy(frame.position);
      look(value);
    }else if(moved)changed(value);
    const altitude=Math.max(minimum-value.radius,camera.position.distanceTo(value.center)-value.radius);
    const near=Math.max(value.radius*1e-9,Math.min(value.radius*.005,altitude*.12));
    if(Math.abs(camera.near-near)>Math.max(near*.1,value.radius*1e-10)){camera.near=near;camera.updateProjectionMatrix();}
    return moved;
  }
  function zoom(factor,pointer){
    const value=focus();if(!value||!Number.isFinite(factor)||factor<=0)return false;
    onInteraction();const grabbed=pointer?hit(pointer,value):null;
    const {minimum,maximum}=limits(value);
    if(frame?.id===value.id){frame.range=Math.min(maximum,frame.range*factor);placeFrame(value);}
    else{
      offset.copy(camera.position).sub(value.center);let distance=offset.length();if(!(distance>0)){offset.set(0,0,1);distance=minimum;}
      const altitude=Math.max(minimum-value.radius,distance-value.radius);
      offset.setLength(Math.min(maximum,Math.max(minimum,value.radius+altitude*factor)));
      camera.position.copy(value.center).add(offset);changed(value);
    }
    if(grabbed)preserveAnchor(pointer,grabbed,value);
    enforce();return true;
  }
  function focusPoint(pointer,factor=.28){
    const value=focus(),point=hit(pointer,value);if(!value||!point)return false;
    onInteraction();frame=null;freeLook=null;const {minimum,maximum}=limits(value);
    const altitude=Math.max(minimum-value.radius,(camera.position.distanceTo(value.center)-value.radius)*factor);
    const position=point.sub(value.center).normalize().multiplyScalar(Math.min(maximum,value.radius+altitude)).add(value.center);
    if(onNavigate)onNavigate(value.center.clone(),position,550);
    else{camera.position.copy(position);changed(value);enforce();}
    return true;
  }
  function tilt(degrees){
    const value=focus();if(!value||!Number.isFinite(degrees))return false;onInteraction();
    freeLook=null;
    const f=ensureFrame(value);f.tilt=clamp(f.tilt+degrees*radians,0,85*radians);placeFrame(value);return true;
  }
  function setTilt(degrees){const value=focus();if(!value||!Number.isFinite(degrees))return false;const f=ensureFrame(value);return tilt(degrees-f.tilt/radians);}
  function turn(degrees){
    const value=focus();if(!value||!Number.isFinite(degrees))return false;onInteraction();freeLook=null;const f=ensureFrame(value);
    f.heading=(f.heading+degrees*radians)%(Math.PI*2);placeFrame(value);return true;
  }
  function moveSurface(direction,amount=1){
    const value=focus();if(!value||!['up','down','left','right'].includes(direction)||!Number.isFinite(amount))return false;onInteraction();
    const f=ensureFrame(value),height=Math.max(minimumGlobeAltitude(value),camera.position.distanceTo(value.center)-value.radius);
    const step=clamp(height/value.radius*.15,.00000002,.12)*amount;
    const vertical=direction==='up'||direction==='down',sign=direction==='up'||direction==='right'?1:-1;
    const tangent=vertical?f.north.clone().multiplyScalar(Math.cos(f.heading)).addScaledVector(f.east,-Math.sin(f.heading)):f.east.clone().multiplyScalar(Math.cos(f.heading)).addScaledVector(f.north,Math.sin(f.heading));
    const axis=new THREE.Vector3().crossVectors(f.normal,tangent).normalize();quaternion.setFromAxisAngle(axis,step*sign);rotateCamera(quaternion,value);enforce();return true;
  }
  function topDown(){
    const value=focus();if(!value)return false;onInteraction();freeLook=null;const f=ensureFrame(value);
    // Preserve the visible geography and altitude when changing to the nadir.
    const altitude=Math.max(minimumGlobeAltitude(value),camera.position.distanceTo(value.center)-value.radius);
    f.tilt=0;f.heading=0;f.range=altitude;placeFrame(value);return true;
  }
  function resetView(){
    const value=focus();if(!value)return false;onInteraction();frame=null;freeLook=null;camera.up.copy(originalUp);
    offset.copy(camera.position).sub(value.center);if(offset.lengthSq()<1e-12)offset.set(0,.3,1);
    offset.setLength(value.radius*3.1);camera.position.copy(value.center).add(offset);changed(value);enforce();return true;
  }
  function getViewState(){
    const value=focus();if(!value)return null;
    if(freeLook?.id===value.id){
      const point=camera.position.clone().sub(value.center).normalize().multiplyScalar(value.radius).add(value.center);
      const {normal,north,east}=frameBasis(point,value),direction=new THREE.Vector3(0,0,-1).applyQuaternion(freeLook.quaternion);
      const elevation=Math.asin(clamp(direction.dot(normal),-1,1))/radians;
      const surface=hit(new THREE.Vector2(),value),tangent=direction.clone().addScaledVector(normal,-direction.dot(normal));
      const heading=tangent.lengthSq()>1e-14?Math.atan2(direction.dot(east),direction.dot(north))/radians:frame?.heading/radians||0;
      return {id:value.id,freeLook:true,lookingAtSurface:Boolean(surface),elevationDeg:elevation,
        rangeWorld:surface?surface.distanceTo(camera.position):Math.max(minimumGlobeAltitude(value),camera.position.distanceTo(value.center)-value.radius),
        tiltDeg:90+elevation,headingDeg:((heading%360)+360)%360};
    }
    return {id:value.id,rangeWorld:frame?.id===value.id?frame.range:Math.max(minimumGlobeAltitude(value),camera.position.distanceTo(value.center)-value.radius),tiltDeg:frame?.id===value.id?frame.tilt/radians:0,headingDeg:frame?.id===value.id?(frame.heading/radians+360)%360:0};
  }
  /** Rotate the sightline without translating the observer. Positive yaw turns
   * right, positive pitch looks up; roll supports a two-finger twist.
   */
  function lookAround(yawDegrees=0,pitchDegrees=0,rollDegrees=0){
    const value=focus();if(!value||![yawDegrees,pitchDegrees,rollDegrees].every(Number.isFinite))return false;
    onInteraction();
    if(freeLook?.id!==value.id)freeLook={id:value.id,quaternion:camera.quaternion.clone(),up:camera.up.clone(),position:camera.position.clone()};
    const orientation=freeLook.quaternion;
    if(yawDegrees){a.set(0,1,0).applyQuaternion(orientation).normalize();quaternion.setFromAxisAngle(a,-yawDegrees*radians);orientation.premultiply(quaternion);}
    if(pitchDegrees){a.set(1,0,0).applyQuaternion(orientation).normalize();quaternion.setFromAxisAngle(a,pitchDegrees*radians);orientation.premultiply(quaternion);}
    if(rollDegrees){a.set(0,0,-1).applyQuaternion(orientation).normalize();quaternion.setFromAxisAngle(a,rollDegrees*radians);orientation.premultiply(quaternion);}
    orientation.normalize();freeLook.up.set(0,1,0).applyQuaternion(orientation).normalize();
    controls.target.copy(value.center);look(value);return true;
  }
  function centroid(){const values=[...pointers.values()];return {x:values.reduce((sum,p)=>sum+p.x,0)/values.length,y:values.reduce((sum,p)=>sum+p.y,0)/values.length};}
  function spread(){const values=[...pointers.values()];return values.length<2?0:Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y);}
  function angle(){const values=[...pointers.values()];return values.length<2?0:Math.atan2(values[1].y-values[0].y,values[1].x-values[0].x);}
  function refreshGrab(){previousCentroid=centroid();previousSpread=spread();previousAngle=angle();anchor=hit(toNdc(previousCentroid));}
  function consume(event){event.preventDefault();event.stopImmediatePropagation();}
  function down(event){
    const value=focus();if(!value||event.pointerType!=='touch'&&![0,1,2].includes(event.button))return;
    const point={x:event.clientX,y:event.clientY},orient=event.button===2||event.shiftKey,orbit=event.button===1||event.ctrlKey;
    const onSurface=hit(toNdc(point),value);
    if(!pointers.size&&!orient&&!orbit&&!onSurface&&event.pointerType!=='touch'&&!freeLook)return;
    if(!pointers.size){onInteraction();savedEnabled=controls.enabled;controls.enabled=false;dragId=value.id;dragMode=orbit?'orbit':orient||!onSurface?'look':'grab';}
    pointers.set(event.pointerId,point);domElement.setPointerCapture?.(event.pointerId);refreshGrab();consume(event);
  }
  function move(event){
    if(!pointers.has(event.pointerId))return;
    const value=focus();if(!value||value.id!==dragId){reset();return;}
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});const current=centroid(),currentNdc=toNdc(current).clone();
    if(pointers.size>1||dragMode==='look'){
      const height=Math.max(1,domElement.getBoundingClientRect().height),dx=current.x-previousCentroid.x,dy=current.y-previousCentroid.y;
      if(Math.abs(dx)>.01||Math.abs(dy)>.01)lookAround(dx/height*180,-dy/height*180);
      if(pointers.size>1){
        const twist=angle(),delta=Math.atan2(Math.sin(twist-previousAngle),Math.cos(twist-previousAngle));
        if(Math.abs(delta)>.0001)lookAround(0,0,-delta/radians);previousAngle=twist;
      }
    }else if(dragMode==='orbit'){
      const height=Math.max(1,domElement.getBoundingClientRect().height);
      tilt((current.y-previousCentroid.y)/height*120);turn(-(current.x-previousCentroid.x)/height*180);
    }else if(anchor&&!preserveAnchor(currentNdc,anchor,value)){
      const altitude=Math.max(minimumGlobeAltitude(value),camera.position.distanceTo(value.center)-value.radius);
      const height=Math.max(1,domElement.getBoundingClientRect().height),scale=2*altitude*Math.tan(camera.fov*Math.PI/360)/height/value.radius;
      const dx=clamp((current.x-previousCentroid.x)*scale,-.3,.3),dy=clamp((current.y-previousCentroid.y)*scale,-.3,.3);
      a.copy(camera.up).normalize();quaternion.setFromAxisAngle(a,-dx);rotateCamera(quaternion,value);
      a.set(1,0,0).applyQuaternion(camera.quaternion);quaternion.setFromAxisAngle(a,-dy);rotateCamera(quaternion,value);
    }
    const distance=spread();if(previousSpread>8&&distance>8)zoom(previousSpread/distance,pointers.size>1?undefined:currentNdc);
    previousCentroid=current;previousSpread=distance;anchor=hit(currentNdc,value);enforce();consume(event);
  }
  function up(event){
    if(!pointers.has(event.pointerId))return;
    pointers.delete(event.pointerId);try{domElement.releasePointerCapture?.(event.pointerId);}catch{}
    if(pointers.size){refreshGrab();dragMode=anchor?'grab':'look';}else{controls.enabled=savedEnabled;anchor=null;dragId=null;previousCentroid=null;previousSpread=0;}
    consume(event);
  }
  function doubleClick(event){if(focusPoint(toNdc({x:event.clientX,y:event.clientY})))consume(event);}
  function contextMenu(event){if(focus())event.preventDefault();}
  const listeners={pointerdown:down,pointermove:move,pointerup:up,pointercancel:up,dblclick:doubleClick,contextmenu:contextMenu};
  for(const [type,handler] of Object.entries(listeners))domElement.addEventListener(type,handler,{capture:true,passive:false});
  function reset(){
    if(pointers.size)controls.enabled=savedEnabled;
    for(const id of pointers.keys())try{domElement.releasePointerCapture?.(id);}catch{}
    pointers.clear();frame=null;freeLook=null;anchor=null;previousCentroid=null;previousSpread=0;dragId=null;
    camera.up.copy(originalUp);camera.near=originalNear;camera.updateProjectionMatrix();
  }
  function getSurfaceCoordinates(){
    const value=focus();if(!value)return null;value.mesh.updateWorldMatrix(true,false);
    const surface=freeLook?.id===value.id?(hit(new THREE.Vector2(),value)||camera.position):frame?.id===value.id?frame.pivot:camera.position;
    const local=value.mesh.worldToLocal(surface.clone()).normalize();
    const latitude=Math.asin(clamp(local.y,-1,1))*180/Math.PI;
    const longitude=((Math.atan2(-local.z,local.x)*180/Math.PI+540)%360)-180;
    const altitudeRatio=Math.max(0,camera.position.distanceTo(value.center)/value.radius-1);
    return {id:value.id,latitude,longitude,altitudeRatio,altitudeKm:Number.isFinite(value.radiusKm)?altitudeRatio*value.radiusKm:null};
  }
  return {zoom,focusPoint,enforce,reset,getSurfaceCoordinates,tilt,tiltBy:tilt,setTilt,turn,rotateHeading:turn,move:moveSurface,moveSurface,topDown,resetView,getViewState,lookAround,
    get isFreeLook(){const value=focus();return Boolean(value&&freeLook?.id===value.id);},
    dispose(){if(disposed)return;disposed=true;reset();for(const [type,handler] of Object.entries(listeners))domElement.removeEventListener(type,handler,{capture:true});}
  };
}
