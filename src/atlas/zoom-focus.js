/** Geometry only: a wheel/pinch must approach a visible world before it locks. */
export function findZoomFocus(bodies, camera, direction, { distanceFactor=12, angularMargin=.025 }={}) {
  const length=Math.hypot(direction.x,direction.y,direction.z);
  if(!Number.isFinite(length)||length<=0)return null;
  const ray={x:direction.x/length,y:direction.y/length,z:direction.z/length};
  let best=null,bestScore=Infinity;
  for(const body of bodies){
    const p=body.position,r=body.radius;
    if(!p||!Number.isFinite(r)||r<=0||body.visible===false)continue;
    const x=p.x-camera.x,y=p.y-camera.y,z=p.z-camera.z;
    const along=x*ray.x+y*ray.y+z*ray.z;
    if(!Number.isFinite(along)||along<=0)continue;
    const distance=Math.hypot(x,y,z);
    if(distance>Math.max(10,r*distanceFactor)||distance<r*.7)continue;
    const miss=Math.sqrt(Math.max(0,distance*distance-along*along));
    if(miss>r*1.5+along*angularMargin)continue;
    const score=miss/r+distance/(r*distanceFactor)*.15;
    if(score<bestScore){bestScore=score;best=body.id;}
  }
  return best;
}
