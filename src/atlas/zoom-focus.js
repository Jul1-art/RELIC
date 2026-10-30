const finitePoint=point=>point&&[point.x,point.y,point.z].every(Number.isFinite);
function normalizedDirection(direction){
  if(!finitePoint(direction))return null;
  const length=Math.hypot(direction.x,direction.y,direction.z);
  return length>0&&Number.isFinite(length)?{x:direction.x/length,y:direction.y/length,z:direction.z/length}:null;
}
function rayMetrics(position,origin,direction){
  const x=position.x-origin.x,y=position.y-origin.y,z=position.z-origin.z;
  return {distance:Math.hypot(x,y,z),along:x*direction.x+y*direction.y+z*direction.z,
    // A cross product retains accuracy when the ray goes through a small moon
    // at a large heliocentric coordinate; |v|²-dot(v,d)² loses precision there.
    miss:Math.hypot(y*direction.z-z*direction.y,z*direction.x-x*direction.z,x*direction.y-y*direction.x)};
}

/** A wheel/pinch approaches a real body, regardless of whether it has a
 * dedicated Cesium renderer. Radius is its stable inspection size, never the
 * enlarged 2.6px overview selection symbol. An optional swept camera catches a
 * fast wheel step crossing a body's capture region between rendered frames.
 */
export function findZoomFocus(bodies,camera,direction,{distanceFactor=12,angularMargin=.025,minimumDistance=10,previousCamera}={}){
  const ray=normalizedDirection(direction);
  if(!ray||!finitePoint(camera)||!Number.isFinite(distanceFactor)||!(distanceFactor>1)||!Number.isFinite(angularMargin)||angularMargin<0||!Number.isFinite(minimumDistance))return null;
  let best=null,bestScore=Infinity;
  for(const body of bodies){
    const p=body.position,r=body.radius;
    if(!finitePoint(p)||!Number.isFinite(r)||r<=0||body.visible===false)continue;
    const threshold=Math.max(minimumDistance,r*distanceFactor),now=rayMetrics(p,camera,ray);
    const capture=r*1.5+Math.max(0,now.along)*angularMargin;
    let score=Infinity;
    if(now.distance<=r||now.along>0&&now.distance<=threshold&&now.miss<=capture){
      score=now.miss/Math.max(r,capture)+now.distance/threshold*.15;
    }else if(finitePoint(previousCamera)){
      const before=rayMetrics(p,previousCamera,ray);
      const dx=camera.x-previousCamera.x,dy=camera.y-previousCamera.y,dz=camera.z-previousCamera.z;
      const distanceSquared=dx*dx+dy*dy+dz*dz;
      const approach=(p.x-previousCamera.x)*dx+(p.y-previousCamera.y)*dy+(p.z-previousCamera.z)*dz;
      if(distanceSquared>0&&approach>0&&before.along>0&&before.miss<=r*1.5+before.along*angularMargin){
        const t=Math.max(0,Math.min(1,approach/distanceSquared));
        const miss=Math.hypot(p.x-previousCamera.x-t*dx,p.y-previousCamera.y-t*dy,p.z-previousCamera.z-t*dz);
        if(miss<=threshold)score=before.miss/Math.max(r,r*1.5+before.along*angularMargin)+t*.05;
      }
    }
    if(score<bestScore){bestScore=score;best=body.id;}
  }
  return best;
}

/** Generous click/touch targets for subpixel worlds in a linearly scaled solar
 * view. This supplements exact raycasting; it does not enlarge their physical
 * coordinates or select a world behind the camera.
 */
export function pickFocusNearRay(bodies,origin,direction,{fovDeg=40,viewportHeight=800,pixels=13}={}){
  const ray=normalizedDirection(direction);
  if(!ray||!finitePoint(origin)||!Number.isFinite(viewportHeight)||viewportHeight<=0||!(fovDeg>0&&fovDeg<180)||!Number.isFinite(pixels)||!(pixels>0))return null;
  const unitsPerPixel=2*Math.tan(fovDeg*Math.PI/360)/viewportHeight;
  let best=null,bestScore=Infinity;
  for(const body of bodies){
    if(body.visible===false||!finitePoint(body.position)||!Number.isFinite(body.radius)||!(body.radius>0))continue;
    const metrics=rayMetrics(body.position,origin,ray);if(metrics.along<=0)continue;
    const displayRadius=Number.isFinite(body.displayRadius)&&body.displayRadius>0?body.displayRadius:body.radius;
    const radius=Math.max(displayRadius,metrics.along*unitsPerPixel*pixels);
    const score=metrics.miss/radius+metrics.along*1e-12;
    if(metrics.miss<=radius&&score<bestScore){bestScore=score;best=body.id;}
  }
  return best;
}
