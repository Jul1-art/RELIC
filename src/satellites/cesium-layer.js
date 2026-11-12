import {createSatelliteDetection,createSatelliteBrackets} from './detection.js';
/** RELIC host adapter for God's Eye View satellite rendering (MIT).
 * Uses GEV's point sizes/palette, red ISS, synchronous orbit primitives,
 * GMST ring rotation and round-robin propagation of the dense catalogue.
 */
import {createSatelliteCatalog,REFRESH_MS} from './catalog.js';
import {ISS_NORAD,COVERAGE_MS,propagatePosition,computeOrbitPath,orbitRotation} from './orbits.js';
import {SATELLITE_CLASS_IDS,SATELLITE_CLASS_DISPLAY} from '../../vendor/gods-eye-view/satellites/classes.js';
import {createSatellitePanel} from './panel.js?v=63';
import {STARLINK_COLOR,STARLINK_POINT_SIZE,constellationRadius,constellationViewDistance} from './constellation-view.js';
export function createEarthSatellites({Cesium:C,viewer,host=document.body,getLanguage,onLanguageChange,onInteraction=()=>{},now=()=>Date.now()}){
 const scene=viewer.scene,points=scene.primitives.add(new C.PointPrimitiveCollection()),labels=scene.primitives.add(new C.LabelCollection());
 const brackets=createSatelliteBrackets({Cesium:C,viewer});
 const byId=new Map(),rings=new Map(),samples=new Map(),classes=Object.fromEntries(SATELLITE_CLASS_IDS.map(id=>[id,true]));
 const colors=Object.fromEntries(SATELLITE_CLASS_IDS.map(id=>[id,C.Color.fromCssColorString(SATELLITE_CLASS_DISPLAY[id].color)]));
 colors.starlink=C.Color.fromCssColorString(STARLINK_COLOR);
 const pointScratch=new C.Cartesian3();
 // A single worker owns dense SGP4 propagation. Unsupported/blocked workers
 // retain the bounded main-thread fallback; selected objects remain immediate.
 let worker=null,workerBusy=false,workerBuffer=null,workerCursor=0,lastWorkerAt=-Infinity,lastPriorityAt=-Infinity;
 function sampleWorker(){
  if(!worker||workerBusy||workerBuffer||disposed||paused||!shown||document.hidden||!rows.length)return;
  workerBusy=true;lastWorkerAt=now();worker.postMessage({type:'sample',revision,at:lastWorkerAt});
 }
 function stopWorker(){worker?.terminate();worker=null;workerBusy=false;workerBuffer=null;request();}
 try{if(typeof Worker==='function'){
  worker=new Worker(new URL('./propagation-worker.js',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{if(disposed||data.revision!==revision)return;workerBusy=false;workerBuffer=data.data;workerCursor=0;request();};
  worker.onerror=()=>{stopWorker();};
 }}catch{worker=null;}
 function applySample(row,pos){
  const point=byId.get(row.id);if(!point)return;
  samples.set(row.id,pos);const wasShown=point.show;point.show=visible(row);
  if(point.show!==wasShown)enabledCount+=point.show?1:-1;
  point.position=C.Cartesian3.fromElements(pos.x,pos.y,pos.z,pointScratch);brackets.update(row.id,point.position,point.show);
 }
 function drainWorker(){
  if(!workerBuffer)return;
  const start=performance.now();let processed=0;
  for(;workerCursor<rows.length;workerCursor++){
   const i=workerCursor*8,row=rows[workerCursor];
   if(Number.isFinite(workerBuffer[i])&&row.id!==ISS_NORAD&&row.id!==selected?.id){const pos=samples.get(row.id)||{};Object.assign(pos,{x:workerBuffer[i],y:workerBuffer[i+1],z:workerBuffer[i+2],latitude:workerBuffer[i+3],longitude:workerBuffer[i+4],altitude:workerBuffer[i+5],speedMps:workerBuffer[i+6],at:workerBuffer[i+7]});applySample(row,pos);}
   if(!Number.isFinite(workerBuffer[i])){const point=byId.get(row.id);if(point?.show){point.show=false;enabledCount--;brackets.setVisible(row.id,false);}samples.delete(row.id);}
   if(++processed>=400||performance.now()-start>=1.5){workerCursor++;break;}
  }
  if(workerCursor>=rows.length){workerBuffer=null;sampleWorker();}
  else request();
 }
 const issColor=C.Color.fromCssColorString('#ff4444');
 const credit=new C.Credit('Satellite orbits · <a href="https://celestrak.org/" target="_blank" rel="noopener noreferrer">CelesTrak</a> · SGP4 / satellite.js · <a href="https://github.com/bilawalsidhu/gods-eye-view" target="_blank" rel="noopener noreferrer">God’s Eye View / Bilawal Sidhu · MIT</a>',false);
 viewer.creditDisplay?.addStaticCredit(credit);
 let disposed=false,paused=false,shown=true,selected=null,following=null,ownedEntity=null,rows=[],cursor=0,revision=0,buildTimer=0,lastPanelAt=0,lastRingAt=0,lastRefreshAttempt=now(),catalogSnapshot=null,enabledCount=0;
 const request=()=>{if(!disposed&&!viewer.isDestroyed())scene.requestRender();};
 const visible=row=>shown&&classes[row.satelliteClass]&&Math.abs(now()-row.epoch)<=COVERAGE_MS;
 function sample(row,date){
   if(!row||Math.abs(date.getTime()-row.epoch)>COVERAGE_MS)return null;
   const position=propagatePosition(row.satrec,date);if(position)samples.set(row.id,{...position,at:date.getTime()});
   return position;
 }
 function updatePoint(row,date){
   const point=byId.get(row.id);if(!point)return;
   const pos=sample(row,date),wasShown=point.show;point.show=visible(row)&&Boolean(pos);
   if(point.show!==wasShown)enabledCount+=point.show?1:-1;
   if(pos)point.position=C.Cartesian3.fromElements(pos.x,pos.y,pos.z,pointScratch);
   brackets.update(row.id,point.position,point.show);
   return pos;
 }
 const panel=createSatellitePanel({host,getLanguage,onLanguageChange,
   onResetFilters:()=>{shown=true;for(const id of SATELLITE_CLASS_IDS)classes[id]=true;panel.setVisibility(true);panel.setClasses(classes);syncVisibility();},
   onStarlink:showStarlinkConstellation,onSelect:(id,follow)=>select(id,follow),onFollow:value=>value?startFollowing():stopFollowing(),
   onVisibility:value=>{shown=value;if(!value)stopFollowing();syncVisibility();},
   onClassChange:(id,value)=>{classes[id]=value;if(!value&&selected?.satelliteClass===id)stopFollowing();syncVisibility();},
   onRefresh:()=>{lastRefreshAttempt=now();void catalog.refresh();}});
 const catalog=createSatelliteCatalog({now,onChange:value=>{
   if(disposed)return;panel.update(value);
   // Status-only updates keep the point collection and orbit geometry alive.
   if(catalogSnapshot===value.records)return;
   catalogSnapshot=value.records;rebuild(value.records);
 }});
 function rebuild(records){
   const token=++revision;clearTimeout(buildTimer);
   rows=[...records.values()];cursor=0;workerBuffer=null;workerCursor=0;workerBusy=false;
   if(worker){worker.postMessage({type:'catalog',revision:token,rows:rows.map(({satrec,epoch})=>({satrec,epoch}))});sampleWorker();}
   for(const [id,point]of byId)if(!records.has(id)){if(point.show)enabledCount--;points.remove(point);brackets.remove(id);byId.delete(id);samples.delete(id);hideRing(id);}
   for(const id of rings.keys())hideRing(id);
   if(selected){selected=records.get(selected.id)||null;panel.select(selected);brackets.setSelected(selected?.id??null);if(!selected)stopFollowing();}
   let offset=0,lastBuildRender=0;
   function chunk(){
     if(disposed||token!==revision)return;
     const end=Math.min(rows.length,offset+80),date=new Date(now());const chunkStart=performance.now();
     for(;offset<end;offset++){
       const row=rows[offset];let point=byId.get(row.id);
       if(!point){point=points.add({id:`relic-satellite:${row.id}`,show:false,position:C.Cartesian3.ZERO,pixelSize:row.id===ISS_NORAD?12:row.satelliteClass==='stations'?8:row.satelliteClass==='starlink'?STARLINK_POINT_SIZE:5,
         color:row.id===ISS_NORAD?issColor:colors[row.satelliteClass],outlineColor:row.satelliteClass==='starlink'?C.Color.fromCssColorString(STARLINK_COLOR).withAlpha(.3):C.Color.WHITE.withAlpha(.3),outlineWidth:row.id===ISS_NORAD?2:row.satelliteClass==='starlink'?.5:0,disableDepthTestDistance:0});byId.set(row.id,point);}
       point.color=row.id===ISS_NORAD?issColor:colors[row.satelliteClass];if(!worker||row.id===ISS_NORAD||row.id===selected?.id)updatePoint(row,date);
       if(performance.now()-chunkStart>=2){offset++;break;}
     }
     if(now()-lastBuildRender>=80||offset===rows.length){syncLabels();panel.setPopulation?.(enabledCount);request();lastBuildRender=now();}
     if(offset<rows.length)buildTimer=setTimeout(chunk,0);
     else{showRing(records.get(ISS_NORAD));if(selected)showRing(selected);}
   }
   chunk();
 }
 const issLabel=labels.add({text:'ISS',show:false,position:C.Cartesian3.ZERO,font:'bold 12px system-ui',fillColor:issColor,outlineColor:C.Color.BLACK,outlineWidth:3,style:C.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new C.Cartesian2(12,-12),disableDepthTestDistance:0});
 const selectedLabel=labels.add({text:'',show:false,position:C.Cartesian3.ZERO,font:'12px system-ui',fillColor:C.Color.WHITE,outlineColor:C.Color.BLACK,outlineWidth:3,style:C.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new C.Cartesian2(12,-12),disableDepthTestDistance:0});
 const detection=createSatelliteDetection({Cesium:C,viewer,getCandidates:()=>rows,getPoint:id=>byId.get(id),getSelected:()=>selected});
 let detectionShown=true;
 function syncLabels(){
   const iss=byId.get(ISS_NORAD);issLabel.show=!detectionShown&&Boolean(iss?.show);if(iss)issLabel.position=iss.position;
   const point=selected&&byId.get(selected.id);selectedLabel.show=!detectionShown&&Boolean(point?.show&&selected.id!==ISS_NORAD);if(point){selectedLabel.position=point.position;selectedLabel.text=selected.name;}
 }
 function showRing(row){
   if(!row||rings.has(row.id)||disposed)return;
   const date=new Date(now()),path=computeOrbitPath(row.satrec,date);if(path.points.length<2)return;
   const color=row.id===ISS_NORAD?issColor:colors[row.satelliteClass];
   const primitive=scene.primitives.add(new C.Primitive({geometryInstances:new C.GeometryInstance({id:`relic-satellite-orbit:${row.id}`,
     geometry:new C.PolylineGeometry({positions:path.points.map(p=>new C.Cartesian3(p.x,p.y,p.z)),width:row.id===ISS_NORAD?2.5:2,vertexFormat:C.PolylineColorAppearance.VERTEX_FORMAT}),
     attributes:{color:C.ColorGeometryInstanceAttribute.fromColor(color.withAlpha(.6)),depthFailColor:C.ColorGeometryInstanceAttribute.fromColor(color.withAlpha(.15))}}),
     appearance:new C.PolylineColorAppearance({translucent:true}),depthFailAppearance:new C.PolylineColorAppearance({translucent:true}),asynchronous:false,allowPicking:false,show:visible(row)}));
   rings.set(row.id,{...path,primitive,row});request();
 }
 function hideRing(id){const ring=rings.get(id);if(ring){scene.primitives.remove(ring.primitive);rings.delete(id);}}
 function syncVisibility(){
   enabledCount=0;
   for(const row of rows){const point=byId.get(row.id);if(point){point.show=visible(row)&&samples.has(row.id);brackets.setVisible(row.id,point.show);if(point.show)enabledCount++;}}
   for(const ring of rings.values())ring.primitive.show=visible(ring.row);
   syncLabels();panel.setPopulation?.(enabledCount);request();
 }
 function stopFollowing(){
   if(ownedEntity){if(viewer.trackedEntity===ownedEntity)viewer.trackedEntity=undefined;viewer.entities.remove(ownedEntity);ownedEntity=null;}
   following=null;panel.setFollowing(false);request();
 }
 function startFollowing(){
   if(!selected||!byId.get(selected.id)?.show)return false;
   stopFollowing();onInteraction();viewer.camera.cancelFlight();following=selected.id;
   const high=(samples.get(selected.id)?.altitude||0)>2000000?4:1;
   ownedEntity=viewer.entities.add({id:'relic-satellite-follow',position:new C.CallbackPositionProperty(()=>byId.get(following)?.position,false),viewFrom:new C.Cartesian3(-450000*high,-450000*high,350000*high)});
   viewer.trackedEntity=ownedEntity;panel.setFollowing(true);request();return true;
 }
 function select(id,follow=false){
   const row=catalog.records.get(Number(id));if(!row)return false;
   if(selected?.id!==row.id){stopFollowing();if(selected?.id!==ISS_NORAD)hideRing(selected?.id);}
   selected=row;brackets.setSelected(row.id);shown=true;classes[row.satelliteClass]=true;panel.setVisibility(true);panel.setClasses(classes);updatePoint(row,new Date(now()));syncVisibility();panel.select(row);showRing(row);
   if(follow)startFollowing();request();return true;
 }
 function showStarlinkConstellation(){
   if(disposed||!rows.some(row=>row.satelliteClass==='starlink'))return false;
   stopFollowing();onInteraction();viewer.camera.cancelFlight();
   if(selected?.id!==ISS_NORAD)hideRing(selected?.id);
   selected=null;brackets.setSelected(null);panel.select(null);shown=true;
   for(const id of SATELLITE_CLASS_IDS)classes[id]=id==='starlink'||id==='stations';
   panel.setVisibility(true);panel.setClasses(classes);syncVisibility();
   const camera=viewer.camera,frustum=camera.frustum;
   const aspect=frustum.aspectRatio||scene.canvas.clientWidth/Math.max(1,scene.canvas.clientHeight);
   const distance=constellationViewDistance(constellationRadius(catalog.records),frustum.fovy||Math.PI/3,aspect);
   if(!distance)return false;
   const radial=C.Cartesian3.clone(camera.positionWC);
   if(C.Cartesian3.magnitudeSquared(radial)<1)radial.x=1;
   C.Cartesian3.normalize(radial,radial);
   const direction=C.Cartesian3.negate(radial,new C.Cartesian3());
   let up=C.Cartesian3.clone(camera.upWC);
   C.Cartesian3.subtract(up,C.Cartesian3.multiplyByScalar(direction,C.Cartesian3.dot(up,direction),new C.Cartesian3()),up);
   if(C.Cartesian3.magnitudeSquared(up)<1e-12){
     up=C.Cartesian3.clone(Math.abs(direction.z)<.9?C.Cartesian3.UNIT_Z:C.Cartesian3.UNIT_Y);
     C.Cartesian3.subtract(up,C.Cartesian3.multiplyByScalar(direction,C.Cartesian3.dot(up,direction),new C.Cartesian3()),up);
   }
   C.Cartesian3.normalize(up,up);camera.lookAtTransform(C.Matrix4.IDENTITY);
   const reduced=document.documentElement?.dataset.motion==='reduced'||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
   camera.flyTo({destination:C.Cartesian3.multiplyByScalar(radial,distance,new C.Cartesian3()),orientation:{direction,up},duration:reduced?0:.85,complete:request});
   panel.collapse?.();request();return true;
 }
 function tick(){
   if(disposed||paused||document.hidden||viewer.useDefaultRenderLoop===false)return;
   const time=now(),date=new Date(time);
   if(time-lastPriorityAt>=100){lastPriorityAt=time;const iss=catalog.records.get(ISS_NORAD);if(iss)updatePoint(iss,date);
   if(selected&&selected.id!==ISS_NORAD)updatePoint(selected,date);}
   drainWorker();if(worker&&!workerBusy&&!workerBuffer&&time-lastWorkerAt>=250)sampleWorker();
   if(following!==null&&!byId.get(following)?.show)stopFollowing();
   // Same round-robin principle as GEV dense mode; bound main-thread work even
   // when the complete active feed contains tens of thousands of satellites.
   if(shown&&!worker){const start=performance.now(),budget=Math.max(1,Math.ceil(rows.length/20));
     for(let i=0;i<budget&&rows.length;i++){
       if(cursor>=rows.length)cursor=0;const row=rows[cursor++];
       if(row.id!==ISS_NORAD&&row.id!==selected?.id&&classes[row.satelliteClass])updatePoint(row,date);
       if(performance.now()-start>1.5)break;
     }
   }
   syncLabels();
   if(time-lastRingAt>=1000){
     lastRingAt=time;
     for(const [id,ring]of [...rings]){
       ring.primitive.show=visible(ring.row);
       if(Math.abs(time-ring.bakeMs)>30*60000){hideRing(id);showRing(catalog.records.get(id));continue;}
       const rotation=C.Matrix3.fromRotationZ(orbitRotation(ring.gmstAtBake,date));
       ring.primitive.modelMatrix=C.Matrix4.fromRotationTranslation(rotation,C.Cartesian3.ZERO,ring.primitive.modelMatrix);
     }
   }
   if(time-lastPanelAt>=500){lastPanelAt=time;panel.setPopulation?.(enabledCount);if(selected)panel.position(samples.get(selected.id),following===selected.id);}
 }
 const removePreRender=scene.preRender.addEventListener(tick);
 const timer=setInterval(()=>{
   if(disposed||paused||document.hidden||viewer.useDefaultRenderLoop===false)return;
   if((catalog.nextRetryAt&&now()>=catalog.nextRetryAt)||now()-lastRefreshAttempt>=REFRESH_MS){lastRefreshAttempt=now();void catalog.refresh();}
   request();
 },250);
 const interrupt=()=>{if(following!==null)stopFollowing();};
 for(const type of ['pointerdown','wheel'])scene.canvas.addEventListener(type,interrupt,{passive:true});
 const visibility=()=>{if(!document.hidden)request();};document.addEventListener('visibilitychange',visibility);
 void catalog.refresh();
 return {select,stopFollowing,showStarlinkConstellation,
   setDetectionSettings(value){detection.setSettings(value);request();},
   setDetection(value){detectionShown=Boolean(value);detection.setEnabled(value);brackets.setEnabled(value&&!paused);syncLabels();request();},
   handleClick(position){
     const id=scene.pick(position)?.id;
     return typeof id==='string'&&id.startsWith('relic-satellite:')?select(Number(id.slice('relic-satellite:'.length)),true):false;
   },
   pause(value=true){paused=Boolean(value);detection.setEnabled(!paused&&detectionShown);brackets.setEnabled(!paused&&detectionShown);if(paused)stopFollowing();else request();},
   dispose(){
     if(disposed)return;stopFollowing();disposed=true;++revision;worker?.terminate();worker=null;workerBuffer=null;clearInterval(timer);clearTimeout(buildTimer);catalog.dispose();removePreRender();detection.dispose();brackets.dispose();panel.dispose();
     for(const type of ['pointerdown','wheel'])scene.canvas.removeEventListener(type,interrupt);
     document.removeEventListener('visibilitychange',visibility);
     if(!viewer.isDestroyed()){for(const id of [...rings.keys()])hideRing(id);scene.primitives.remove(points);scene.primitives.remove(labels);viewer.creditDisplay?.removeStaticCredit(credit);}
     byId.clear();samples.clear();rows=[];
   }};
}
