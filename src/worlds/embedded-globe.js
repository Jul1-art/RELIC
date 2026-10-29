import * as Cesium from '../../vendor/cesium/index.js';
import {getCesiumToken,validateCesiumToken} from '../core/api-config.js';
import {SURFACE_SOURCES} from '../atlas/surface-imagery.js';
import {bodyOrientationBasis,sunDirectionScene} from '../atlas/solar-illumination.js';
import {approximatePosition} from '../atlas/orbital-data.js';
import {loadGlobalHeightGrid,createGlobalTerrainProvider} from './global-terrain.js';

Cesium.Ion.defaultAccessToken='';
const CHANNEL='relic-detailed-globe-v15';
const body=new URLSearchParams(location.search).get('body');
if(!['earth','moon','mars'].includes(body))throw new Error('Unsupported globe');
// The packaged MOLA radial-shape raster uses planetocentric latitude and a
// 3396km spherical datum; keeping that datum avoids inventing areoid heights.
const ellipsoid=body==='earth'?Cesium.Ellipsoid.WGS84:body==='moon'?Cesium.Ellipsoid.MOON:new Cesium.Ellipsoid(3396000,3396000,3396000);
Cesium.Ellipsoid.default=ellipsoid;
const radius=ellipsoid.maximumRadius,DEG=Math.PI/180;
const credits=document.querySelector('#credits'),sourceCredit=document.querySelector('#source-credit');
let viewer,tileset,buildings,disposed=false,ready=false,paused=false,focus={id:body},sourceMode='imagery',sourceLabel='',ionStatus='loading';
let lastState=0,lastFrame=null,globalGrid=null,geography={lat:18,lon:0},lastHeading=0;
const adaptiveImagery=[];
const post=(type,payload={})=>{if(parent!==window)parent.postMessage({channel:CHANNEL,type,...payload},location.origin);};
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const clamp=Cesium.Math.clamp;
const compact=matchMedia('(pointer:coarse)').matches||innerWidth<760;
function requestRender(){if(viewer&&!viewer.isDestroyed())viewer.scene.requestRender();}
function updateCredits(){
  const source=sourceMode==='nasa-global-dem'?globalGrid?.sourceUrl:body==='earth'?'https://cesium.com/learn/cesiumjs-learn/cesiumjs-terrain/':body==='moon'?'https://cesium.com/platform/cesium-ion/content/cesium-moon/':'https://cesium.com/platform/cesium-ion/content/cesium-mars/';
  sourceCredit.replaceChildren();
  const link=document.createElement('a');link.href=source;link.target='_blank';link.rel='noopener noreferrer';link.textContent=sourceLabel;sourceCredit.append(link);
  requestAnimationFrame(()=>{if(disposed)return;document.documentElement.style.setProperty('--credit-height',`${Math.ceil(credits.getBoundingClientRect().height)}px`);if(viewer&&!viewer.isDestroyed())viewer.resize();requestRender();});
}
const creditObserver=new ResizeObserver(()=>{if(disposed)return;document.documentElement.style.setProperty('--credit-height',`${Math.ceil(credits.getBoundingClientRect().height)}px`);if(viewer&&!viewer.isDestroyed())viewer.resize();requestRender();state(true);});creditObserver.observe(credits);

function pickTarget(position){
  if(!viewer)return null;
  const point=position||new Cesium.Cartesian2(viewer.canvas.clientWidth/2,viewer.canvas.clientHeight/2),scene=viewer.scene;
  let hit;
  if(scene.pickPositionSupported&&(!scene.globe.show||buildings))try{hit=scene.pickPosition(point);}catch{}
  if(!hit&&scene.globe.show)try{hit=scene.globe.pick(viewer.camera.getPickRay(point),scene);}catch{}
  if(!hit)hit=viewer.camera.pickEllipsoid(point,ellipsoid);
  return hit&&[hit.x,hit.y,hit.z].every(Number.isFinite)?hit:null;
}
function cameraFrame(){
  const target=pickTarget();if(!target)return lastFrame;
  const matrix=Cesium.Transforms.eastNorthUpToFixedFrame(target,ellipsoid);
  const inverse=Cesium.Matrix4.inverseTransformation(matrix,new Cesium.Matrix4());
  const local=Cesium.Matrix4.multiplyByPoint(inverse,viewer.camera.positionWC,new Cesium.Cartesian3()),range=Cesium.Cartesian3.magnitude(local);
  if(!(range>0)||!Number.isFinite(range))return lastFrame;
  const pitch=-Math.asin(clamp(local.z/range,-1,1));
  const heading=pitch< -89.5*DEG?lastHeading:Math.atan2(-local.x,-local.y);
  lastFrame={target,range,pitch,heading};return lastFrame;
}
function applyFrame(frame){
  if(!frame||disposed)return;
  const range=clamp(frame.range,10,radius*12),pitch=clamp(frame.pitch,-Math.PI/2+.0002,-5*DEG);
  viewer.camera.cancelFlight();
  viewer.camera.lookAt(frame.target,new Cesium.HeadingPitchRange(frame.heading,pitch,range));
  const destination=Cesium.Cartesian3.clone(viewer.camera.positionWC),direction=Cesium.Cartesian3.clone(viewer.camera.directionWC),up=Cesium.Cartesian3.clone(viewer.camera.upWC);
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);viewer.camera.setView({destination,orientation:{direction,up}});
  lastHeading=frame.heading;lastFrame={...frame,range,pitch};requestRender();state(true);
}
function groundHeight(lat,lon){
  const point=new Cesium.Cartographic(lon*DEG,lat*DEG);
  return viewer.scene.globe.show?(viewer.scene.globe.getHeight(point)||0):0;
}
function goTo(lat,lon,range,heading=0,tilt=0){
  geography={lat:clamp(lat,-89.99,89.99),lon:((lon+540)%360)-180};
  const target=Cesium.Cartesian3.fromDegrees(geography.lon,geography.lat,groundHeight(geography.lat,geography.lon),ellipsoid);
  applyFrame({target,range:clamp(range,20,radius*12),heading:heading*DEG,pitch:(clamp(tilt,0,85)-90)*DEG});
}
function resetView(){
  const halfFov=Math.max(.08,Math.min(viewer.camera.frustum.fovy||Math.PI/3,viewer.camera.frustum.fov||Math.PI/3)/2);
  const range=radius*1.12/Math.sin(halfFov)-radius;
  goTo(geography.lat,geography.lon,range);
}
function zoom(factor){const frame=cameraFrame();if(frame&&finite(factor)&&factor>0)applyFrame({...frame,range:frame.range*clamp(factor,.1,10)});}
function orient(tiltDelta=0,headingDelta=0,absoluteTilt){
  const frame=cameraFrame();if(!frame)return;
  applyFrame({...frame,heading:frame.heading+headingDelta*DEG,pitch:((finite(absoluteTilt)?absoluteTilt:90+frame.pitch/DEG+tiltDelta)-90)*DEG});
}
function move(direction){
  const frame=cameraFrame();if(!frame||!['up','down','left','right'].includes(direction))return;
  const point=ellipsoid.cartesianToCartographic(frame.target),heading=frame.heading;
  const distance=clamp(frame.range*.12,10,radius*.08);
  const east=direction==='up'?Math.sin(heading):direction==='down'?-Math.sin(heading):direction==='right'?Math.cos(heading):-Math.cos(heading);
  const north=direction==='up'?Math.cos(heading):direction==='down'?-Math.cos(heading):direction==='right'?-Math.sin(heading):Math.sin(heading);
  const lat=clamp(point.latitude+north*distance/radius,-Math.PI/2+.0001,Math.PI/2-.0001)/DEG;
  const lon=(point.longitude+east*distance/(radius*Math.max(.03,Math.cos(point.latitude))))/DEG;
  geography={lat,lon};
  const target=Cesium.Cartesian3.fromDegrees(lon,lat,groundHeight(lat,lon),ellipsoid);
  applyFrame({...frame,target});
}
function state(force=false){
  if(disposed||!viewer||!ready||(!force&&performance.now()-lastState<250))return;
  lastState=performance.now();const frame=cameraFrame();if(!frame)return;
  const point=ellipsoid.cartesianToCartographic(frame.target),cameraPoint=ellipsoid.cartesianToCartographic(viewer.camera.positionWC);
  const latitude=point.latitude/DEG,longitude=point.longitude/DEG;
  const groundUnderCamera=viewer.scene.globe.show?(viewer.scene.globe.getHeight(cameraPoint)||0):0;
  const altitudeRatio=Math.max(0,cameraPoint.height-groundUnderCamera)/radius;
  for(const entry of adaptiveImagery){const show=altitudeRatio<entry.maximumAltitudeRatio;if(entry.layer.show!==show){entry.layer.show=show;requestRender();}}
  if(![latitude,longitude,cameraPoint.height,frame.range].every(Number.isFinite))return;
  geography={lat:latitude,lon:longitude};
  post('state',{state:{id:body,latitude,longitude,altitudeKm:Math.max(0,cameraPoint.height-groundUnderCamera)/1000,rangeMeters:frame.range,
    tiltDeg:clamp(90+frame.pitch/DEG,0,85),headingDeg:((frame.heading/DEG)%360+360)%360,
    metersPerPixel:2*frame.range*Math.tan((viewer.camera.frustum.fovy||Math.PI/3)/2)/Math.max(1,viewer.canvas.clientHeight),
    sourceMode,sourceLabel,ionStatus,creditHeight:Math.ceil(credits.getBoundingClientRect().height),globalResolutionMeters:globalGrid?.nativeEquatorialSpacingMeters||null}});
}
function setLighting(value){
  const date=Number.isFinite(Date.parse(value.date))?new Date(value.date):new Date();viewer.clock.currentTime=Cesium.JulianDate.fromDate(date);viewer.clock.shouldAnimate=false;
  let local=value.sunDirection;
  if(!local||![local.x,local.y,local.z].every(Number.isFinite)){
    const id=body==='moon'?'earth':body,position=approximatePosition(id,date)?.positionKm;
    const sun=sunDirectionScene(position),basis=bodyOrientationBasis(body==='moon'?'earth':body,date);
    if(sun&&basis){
      const dot=axis=>sun.x*axis.x+sun.y*axis.y+sun.z*axis.z;
      local={x:dot(basis.x),y:-dot(basis.z),z:dot(basis.y)};
    }
  }
  if(local){const direction=new Cesium.Cartesian3(-local.x,-local.y,-local.z);Cesium.Cartesian3.normalize(direction,direction);viewer.scene.light=new Cesium.DirectionalLight({direction,intensity:1.45});}
  viewer.scene.globe.enableLighting=true;viewer.scene.globe.dynamicAtmosphereLighting=false;
  requestRender();
}
function setFocus(value){
  if(value?.id!==body)return;focus={...value};setLighting(value);
  if(finite(value.lat)&&finite(value.lon))goTo(value.lat,value.lon,finite(value.range)?value.range:radius*.08,finite(value.heading)?value.heading:0,finite(value.tilt)?value.tilt:0);
  else resetView();
  state(true);
}
function imageryProvider(source){
  const tilingScheme=source.scheme==='mercator'?new Cesium.WebMercatorTilingScheme({ellipsoid}):new Cesium.GeographicTilingScheme({ellipsoid,numberOfLevelZeroTilesX:2,numberOfLevelZeroTilesY:1});
  return new Cesium.UrlTemplateImageryProvider({url:source.url('{z}','{x}','{y}'),maximumLevel:source.maxLevel,tilingScheme,
    rectangle:source.bounds?Cesium.Rectangle.fromDegrees(...source.bounds):undefined,credit:source.credit,enablePickFeatures:false});
}
async function addImagery(){
  const file=body==='earth'?'earth-blue-marble-4k.webp':body==='moon'?'moon-wac-8k.webp':'mars-viking-global.webp';
  viewer.imageryLayers.addImageryProvider(await Cesium.SingleTileImageryProvider.fromUrl(new URL(`../../assets/${file}`,import.meta.url).href,{credit:body==='earth'?'NASA · Blue Marble':body==='moon'?'NASA/GSFC/ASU · LROC WAC':'NASA/JPL/USGS · Viking'}));
  requestRender();
  const add=(source,maximumAltitudeRatio)=>{if(disposed)return;const layer=viewer.imageryLayers.addImageryProvider(imageryProvider(source));layer.imageryProvider.errorEvent.addEventListener(error=>{error.retry=false;});if(Number.isFinite(maximumAltitudeRatio)){layer.show=false;adaptiveImagery.push({layer,maximumAltitudeRatio});}};
  // The local global mosaic appears first; Cesium streams each newly visible
  // area at its native level as the visitor pans around the complete globe.
  if(body==='earth'){add(SURFACE_SOURCES.earth);add(SURFACE_SOURCES.earthDetail,.18);}
  else if(body==='mars'){add(SURFACE_SOURCES.mars);add(SURFACE_SOURCES.marsDetail,.12);add(SURFACE_SOURCES.jezero,.025);}
  else{add(SURFACE_SOURCES.moon);add(SURFACE_SOURCES.apollo11,.025);}
}
async function addTerrain(){
  const token=getCesiumToken();ionStatus=!token?'missing-token':validateCesiumToken(token)?'invalid-token':'loading';
  if(ionStatus==='loading')try{
    if(body==='earth'){
      const resource=await Cesium.IonResource.fromAssetId(1,{accessToken:token});
      const provider=await Cesium.CesiumTerrainProvider.fromUrl(resource,{requestVertexNormals:true,requestWaterMask:true});
      if(disposed)return;viewer.terrainProvider=provider;
      sourceMode='ion-terrain';sourceLabel='Cesium ion · World Terrain';ionStatus='ready';updateCredits();state(true);requestRender();
      // Genuine OSM building footprints/heights are an additional measured-data
      // layer; they are not photogrammetry or a claim of universal city coverage.
      try{
        const buildingResource=await Cesium.IonResource.fromAssetId(96188,{accessToken:token});
        const value=await Cesium.Cesium3DTileset.fromUrl(buildingResource,{showCreditsOnScreen:true,maximumScreenSpaceError:compact?20:12,cacheBytes:64*1024*1024,maximumCacheOverflowBytes:32*1024*1024});
        if(disposed){value.destroy();return;}buildings=viewer.scene.primitives.add(value);sourceLabel='Cesium ion · World Terrain + OSM Buildings';updateCredits();requestRender();
      }catch{/* World terrain remains available if the optional building asset is not enabled. */}
      return;
    }
    const id=body==='moon'?2684829:3644333;
    const resource=await Cesium.IonResource.fromAssetId(id,{accessToken:token});
    const value=await Cesium.Cesium3DTileset.fromUrl(resource,{showCreditsOnScreen:true,enableCollision:true,maximumScreenSpaceError:compact?10:6,
      cacheBytes:(compact?96:256)*1024*1024,maximumCacheOverflowBytes:32*1024*1024});
    if(disposed){value.destroy();return;}tileset=viewer.scene.primitives.add(value);viewer.scene.globe.show=false;
    sourceMode='ion-3d-tiles';sourceLabel=body==='moon'?'Cesium Moon · NASA/USGS LRO + Kaguya':'Cesium Mars · NASA/ESA/USGS MOLA + HRSC';ionStatus='ready';updateCredits();state(true);requestRender();return;
  }catch{
    // Provider errors can contain access-token-bearing URLs. Never forward or
    // log those error objects to the parent, UI, telemetry or public history.
    ionStatus='asset-unavailable';
  }
  if(disposed)return;
  if(body!=='earth')try{
    const grid=await loadGlobalHeightGrid(body);if(disposed)return;globalGrid=grid;
    viewer.terrainProvider=createGlobalTerrainProvider(Cesium,ellipsoid,grid);
    sourceMode='nasa-global-dem';sourceLabel=`${grid.credit} · ≈ ${(grid.nativeEquatorialSpacingMeters/1000).toFixed(1)} km terrain`;
    updateCredits();requestRender();
  }catch{sourceMode='ellipsoid';sourceLabel=body==='moon'?'NASA LROC imagery · elevation unavailable':'NASA Viking/CTX imagery · elevation unavailable';updateCredits();}
  else{sourceMode='ellipsoid';sourceLabel='NASA / Esri imagery · ion terrain unavailable';updateCredits();}
  state(true);
}
function suspend(value){paused=Boolean(value);if(disposed||!viewer||viewer.isDestroyed())return;viewer.useDefaultRenderLoop=(!paused||!ready)&&!document.hidden;if(!paused||!ready){viewer.resize();requestRender();}}
function receive(event){
  if(event.origin!==location.origin||event.source!==parent||event.data?.channel!==CHANNEL||disposed||!viewer)return;
  const {action,value}=event.data;
  if(action==='focus')setFocus(event.data.focus);
  else if(action==='pause')suspend(value);
  else if(action==='dispose')dispose();
  else if(action==='zoom')zoom(value);
  else if(action==='tilt'&&finite(value))orient(value);
  else if(action==='setTilt'&&finite(value))orient(0,0,value);
  else if(action==='turn'&&finite(value))orient(0,value);
  else if(action==='move')move(value);
  else if(action==='topDown')orient(0,0,0);
  else if(action==='resetView')resetView();
}
function dispose(){if(disposed)return;disposed=true;creditObserver.disconnect();window.removeEventListener('message',receive);if(viewer&&!viewer.isDestroyed())viewer.destroy();}
async function start(){
  try{
    viewer=new Cesium.Viewer('globe',{ellipsoid,globe:new Cesium.Globe(ellipsoid),mapProjection:new Cesium.GeographicProjection(ellipsoid),
      baseLayer:false,timeline:false,animation:false,baseLayerPicker:false,geocoder:false,homeButton:false,sceneModePicker:false,
      navigationHelpButton:false,fullscreenButton:false,vrButton:false,selectionIndicator:false,infoBox:false,creditContainer:document.querySelector('#cesium-credit'),showRenderLoopErrors:false,msaaSamples:1});
    const scene=viewer.scene,controller=scene.screenSpaceCameraController;
    viewer.clock.shouldAnimate=false;scene.requestRenderMode=true;scene.maximumRenderTimeChange=Infinity;
    scene.backgroundColor=Cesium.Color.fromCssColorString('#020408');scene.highDynamicRange=false;scene.verticalExaggeration=1;
    scene.globe.baseColor=Cesium.Color.fromCssColorString(body==='earth'?'#183444':body==='moon'?'#777573':'#82533e');
    scene.globe.maximumScreenSpaceError=compact?2.5:1.5;scene.globe.tileCacheSize=compact?72:160;scene.globe.depthTestAgainstTerrain=true;
    if(scene.skyBox)scene.skyBox.show=false;if(scene.skyAtmosphere)scene.skyAtmosphere.show=false;if(scene.sun)scene.sun.show=false;if(scene.moon)scene.moon.show=false;
    scene.globe.showGroundAtmosphere=false;scene.fog.enabled=false;
    controller.inertiaSpin=0;controller.inertiaTranslate=0;controller.inertiaZoom=0;
    controller.minimumZoomDistance=10;controller.maximumZoomDistance=radius*12;controller.enableCollisionDetection=true;
    controller.tiltEventTypes=[Cesium.CameraEventType.RIGHT_DRAG,Cesium.CameraEventType.MIDDLE_DRAG,{eventType:Cesium.CameraEventType.LEFT_DRAG,modifier:Cesium.KeyboardEventModifier.CTRL},{eventType:Cesium.CameraEventType.LEFT_DRAG,modifier:Cesium.KeyboardEventModifier.SHIFT},Cesium.CameraEventType.PINCH];
    controller.zoomEventTypes=[Cesium.CameraEventType.WHEEL,Cesium.CameraEventType.PINCH];
    viewer.resolutionScale=Math.min(devicePixelRatio||1,compact?1.35:1.8);viewer.targetFrameRate=compact?45:60;
    viewer.camera.percentageChanged=.002;
    const interaction=()=>{viewer.camera.cancelFlight();post('interaction');};
    scene.canvas.addEventListener('pointerdown',interaction,{passive:true});scene.canvas.addEventListener('wheel',interaction,{passive:true});
    scene.canvas.tabIndex=0;
    scene.canvas.addEventListener('keydown',event=>{
      const moves={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'};
      if(moves[event.key]){if(event.shiftKey&&event.key.startsWith('Arrow'))orient(event.key==='ArrowUp'?5:event.key==='ArrowDown'?-5:0,event.key==='ArrowLeft'?-10:event.key==='ArrowRight'?10:0);else move(moves[event.key]);}
      else if(event.key==='+'||event.key==='=')zoom(.8);else if(event.key==='-')zoom(1.25);else if(['n','Home'].includes(event.key))orient(0,0,0);else if(event.key.toLowerCase()==='q')orient(0,-5);else if(event.key.toLowerCase()==='e')orient(0,5);else if(event.key.toLowerCase()==='r')resetView();else return;
      event.preventDefault();interaction();
    });
    const handler=new Cesium.ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction(event=>{const hit=pickTarget(event.position);if(!hit)return;const cart=ellipsoid.cartesianToCartographic(hit),frame=cameraFrame();goTo(cart.latitude/DEG,cart.longitude/DEG,Math.max(50,(frame?.range||radius*.1)*.3),frame?.heading/DEG||0,frame?90+frame.pitch/DEG:0);interaction();},Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    scene.renderError.addEventListener(()=>{post('error');dispose();});
    scene.postRender.addEventListener(()=>state());
    viewer.camera.changed.addEventListener(()=>state(true));
    window.addEventListener('message',receive);
    document.addEventListener('visibilitychange',()=>suspend(paused));
    window.addEventListener('pagehide',dispose,{once:true});
    window.addEventListener('resize',()=>{if(!disposed){viewer.resize();requestRender();}});
    setFocus(focus);post('boot');
    await addImagery();if(disposed)return;
    // A working native frame is enough to enter inspection. Finer imagery and
    // terrain continue streaming without freezing controls behind a load screen.
    let remove=scene.postRender.addEventListener(()=>{if(disposed)return;remove();ready=true;sourceLabel=body==='earth'?'NASA / Esri imagery':body==='moon'?'NASA LROC imagery':'NASA Viking / CTX imagery';updateCredits();post('ready');state(true);suspend(paused);});
    requestRender();addTerrain();
  }catch{post('error');document.querySelector('#failure').hidden=false;document.querySelector('#failure').textContent='The detailed planetary renderer is unavailable.';dispose();}
}
start();
