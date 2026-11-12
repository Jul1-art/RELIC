import {labelBudgetFor} from '../../vendor/gods-eye-view/detection/detectionPolicy.js';
import {allocateLayerQuotas} from '../../vendor/gods-eye-view/detection/labelArbiter.js';
import {setKeyholeFadeTuning,getKeyholeGeometry,keyholeLabelAlphaFromGeometry} from '../../vendor/gods-eye-view/detection/keyhole.js';
import {appendCornerBracket,composeLabel,acquireAlpha} from '../../vendor/gods-eye-view/detection/detectionDraw.js';

/** Bounded name overlay. Every visible point receives its own GPU bracket below. */
export function createSatelliteDetection({Cesium:C,viewer,getCandidates,getPoint,getSelected,now=()=>performance.now(),documentRef=document}){
 const canvas=documentRef.createElement('canvas');canvas.className='relic-satellite-detection';canvas.setAttribute('aria-hidden','true');
 viewer.container.append(canvas);const ctx=canvas.getContext('2d');
 let enabled=true,disposed=false,last=-Infinity,width=0,height=0,ratio=1;
 let tuning={detectionDensity:100,detectionAllocation:'ELASTIC',detectionFade:40,detectionOutside:100};
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
  const max=Math.min(width<700?28:90,labelBudgetFor(viewer.camera.positionCartographic?.height,tuning.detectionDensity)),geometry=getKeyholeGeometry(width,height),occupied=[],selected=getSelected(),candidates=getCandidates(),priority=[];
  if(selected)priority.push(selected);
  const iss=candidates.find(row=>row.id===25544);if(iss&&iss!==selected)priority.push(iss);
  const pool=candidates.slice(0,600),demand=new Map();for(const row of pool)demand.set(row.satelliteClass,(demand.get(row.satelliteClass)||0)+1);const quotas=allocateLayerQuotas(demand,max,tuning.detectionAllocation,{stations:4,probes:2});const used=new Map();
  let drawn=0,scanned=0;
  for(let index=0;index<priority.length+candidates.length;index++){
   const row=index<priority.length?priority[index]:candidates[index-priority.length];
   if(++scanned>600||drawn>=max)break;
   if(priority.includes(row)&&scanned>priority.length)continue;
   if(!priority.includes(row)&&(used.get(row.satelliteClass)||0)>=(quotas.get(row.satelliteClass)||0))continue;
   const point=getPoint(row.id);if(!point?.show||!occluder.isPointVisible(point.position))continue;
   const p=C.SceneTransforms.worldToWindowCoordinates(viewer.scene,point.position,screen);
   if(!p||p.x<12||p.x>width-40||p.y<15||p.y>height-36)continue;
   const x=Math.round(p.x),y=Math.round(p.y);
   if(occupied.some(box=>Math.abs(box.x-x)<130&&Math.abs(box.y-y)<36))continue;
   occupied.push({x,y});drawn++;used.set(row.satelliteClass,(used.get(row.satelliteClass)||0)+1);
   if(!seen.has(row.id))seen.set(row.id,time);
   ctx.globalAlpha=acquireAlpha(seen.get(row.id),time,180)*keyholeLabelAlphaFromGeometry(x,y,geometry);
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
 return {setSettings(value){tuning={...tuning,...value};setKeyholeFadeTuning({fadeRatio:tuning.detectionFade/100,outsideOpacity:tuning.detectionOutside/100});last=-Infinity;},setEnabled(value){enabled=Boolean(value);canvas.hidden=!enabled;last=-Infinity;if(!enabled)clear();},render,dispose(){disposed=true;remove();seen.clear();canvas.remove();}};
}

/** One instanced, depth-tested frame per satellite, independent of label limits.
 * All billboards share one atlas image drawn with GEV's original corner geometry.
 * Projection and motion follow Cesium's point positions on the GPU each frame.
 */
export function createSatelliteBrackets({Cesium:C,viewer,documentRef=document}){
 const image=documentRef.createElement('canvas');image.width=image.height=20;
 const ctx=image.getContext('2d');ctx.strokeStyle='#fff';ctx.lineWidth=1.25;
 ctx.beginPath();appendCornerBracket(ctx,10,10,8,8);ctx.stroke();
 const collection=viewer.scene.primitives.add(new C.BillboardCollection()),frames=new Map();
 const regular=C.Color.fromCssColorString('#00d4ff'),iss=C.Color.fromCssColorString('#ff5555');
 let selected=null,disposed=false;
 const color=id=>id===25544?iss:id===selected?C.Color.WHITE:regular;
 return {
  update(id,position,show){
   if(disposed)return;
   let frame=frames.get(id);
   if(!frame){
    frame=collection.add({id:`relic-satellite:${id}`,position,show:Boolean(show),width:20,height:20,
     horizontalOrigin:C.HorizontalOrigin.CENTER,verticalOrigin:C.VerticalOrigin.CENTER,
     color:color(id),disableDepthTestDistance:0});
    // A stable ID prevents one duplicate texture-atlas entry per satellite.
    frame.setImage('relic-satellite-bracket-v1',image);frames.set(id,frame);
   }else{frame.position=position;frame.show=Boolean(show);}
  },
  setVisible(id,value){const frame=frames.get(id);if(frame)frame.show=Boolean(value);},
  setSelected(id){const previous=selected;selected=id;for(const key of [previous,id]){const frame=frames.get(key);if(frame)frame.color=color(key);}},
  setEnabled(value){collection.show=Boolean(value);},
  remove(id){const frame=frames.get(id);if(frame){collection.remove(frame);frames.delete(id);}},
  dispose(){if(disposed)return;disposed=true;if(!viewer.isDestroyed())viewer.scene.primitives.remove(collection);frames.clear();},
 };
}
