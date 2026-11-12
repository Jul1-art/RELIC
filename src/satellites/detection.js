import {appendCornerBracket,composeLabel,acquireAlpha} from '../../vendor/gods-eye-view/detection/detectionDraw.js';

/** Bounded Canvas2D adapter for GEV's original detection geometry and labels. */
export function createSatelliteDetection({Cesium:C,viewer,getCandidates,getPoint,getSelected,now=()=>performance.now(),documentRef=document}){
 const canvas=documentRef.createElement('canvas');canvas.className='relic-satellite-detection';canvas.setAttribute('aria-hidden','true');
 viewer.container.append(canvas);const ctx=canvas.getContext('2d');
 let enabled=true,disposed=false,last=-Infinity,width=0,height=0,ratio=1;
 const seen=new Map(),occluder=new C.EllipsoidalOccluder(C.Ellipsoid.WGS84,viewer.camera.positionWC),screen=new C.Cartesian2();
 function clear(){ctx?.clearRect(0,0,canvas.width,canvas.height);}
 function render(){
  if(disposed||!enabled||!ctx)return;
  const time=now();if(time-last<100)return;last=time;
  const w=viewer.canvas.clientWidth,h=viewer.canvas.clientHeight,dpr=Math.min(globalThis.devicePixelRatio||1,1.5);
  if(w!==width||h!==height||dpr!==ratio){width=w;height=h;ratio=dpr;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
  ctx.font='10px "GEV JetBrains Mono",ui-monospace,monospace';ctx.textBaseline='top';ctx.lineWidth=1;
  occluder.cameraPosition=viewer.camera.positionWC;
  const max=width<700?18:48,occupied=[],selected=getSelected(),candidates=getCandidates(),priority=[];
  if(selected)priority.push(selected);
  const iss=candidates.find(row=>row.id===25544);if(iss&&iss!==selected)priority.push(iss);
  let drawn=0,scanned=0;
  for(let index=0;index<priority.length+candidates.length;index++){
   const row=index<priority.length?priority[index]:candidates[index-priority.length];
   if(++scanned>600||drawn>=max)break;
   if(priority.includes(row)&&scanned>priority.length)continue;
   const point=getPoint(row.id);if(!point?.show||!occluder.isPointVisible(point.position))continue;
   const p=C.SceneTransforms.worldToWindowCoordinates(viewer.scene,point.position,screen);
   if(!p||p.x<12||p.x>width-40||p.y<15||p.y>height-36)continue;
   const x=Math.round(p.x),y=Math.round(p.y);
   if(occupied.some(box=>Math.abs(box.x-x)<130&&Math.abs(box.y-y)<36))continue;
   occupied.push({x,y});drawn++;
   if(!seen.has(row.id))seen.set(row.id,time);
   ctx.globalAlpha=acquireAlpha(seen.get(row.id),time,180);
   ctx.strokeStyle=row.id===25544?'#ff5555':selected?.id===row.id?'#fff':'#00d4ff';
   ctx.beginPath();appendCornerBracket(ctx,x,y,8,8);ctx.stroke();
   const label=composeLabel({id:row.name,klass:row.satelliteClass,metric:`NORAD ${row.id}`});
   const right=x+14+label.primary.length*6>width-6,tx=right?x-14:x+14;
   ctx.textAlign=right?'right':'left';
   const textWidth=Math.max(label.primary.length,label.secondary.length)*6+8;
   ctx.fillStyle='rgba(0,0,0,.72)';ctx.fillRect(right?tx-textWidth+4:tx-4,y-12,textWidth,27);
   ctx.fillStyle='#fff';ctx.fillText(label.primary,tx,y-11);
   ctx.fillStyle='#a6b3be';ctx.fillText(label.secondary,tx,y+2);
  }
  ctx.globalAlpha=1;
  // Only a bounded set of acquisition timestamps is retained across the sky.
  if(seen.size>200)for(const [id,at]of seen)if(time-at>30000)seen.delete(id);
 }
 const remove=viewer.scene.postRender.addEventListener(render);
 return {setEnabled(value){enabled=Boolean(value);canvas.hidden=!enabled;last=-Infinity;if(!enabled)clear();},render,dispose(){disposed=true;remove();seen.clear();canvas.remove();}};
}
