import { createCesiumInspectionEffects } from './inspection-effects.js';
import { connectInspectionControls, readInspectionLink } from '../ui/inspection-controls.js';
import { navigateTo } from '../ui/navigation.js';
import { appURL } from '../core/paths.js';
import { TOP_DOWN_PITCH } from './world-performance.js';

export function createStandaloneInspectionControls({Cesium,viewer,body,ellipsoid,getLanguage,readFrame,orient,beforeOrientation=()=>{},onReset,onLocate}) {
  const {camera,scene}=viewer;
  const effects=createCesiumInspectionEffects({Cesium,viewer});
  function surfaceFrame() {
    const canvas=scene.canvas;
    const center=new Cesium.Cartesian2(canvas.clientWidth/2,canvas.clientHeight/2);
    let target;
    try {
      if(scene.globe.show)target=scene.globe.pick(camera.getPickRay(center),scene);
      else if(scene.pickPositionSupported)target=scene.pickPosition(center);
    } catch { /* Fall back to the body's reference ellipsoid. */ }
    target ||= camera.pickEllipsoid(center,ellipsoid);
    if(!target)return null;
    const inverse=Cesium.Matrix4.inverseTransformation(Cesium.Transforms.eastNorthUpToFixedFrame(target,ellipsoid),new Cesium.Matrix4());
    const local=Cesium.Matrix4.multiplyByPoint(inverse,camera.positionWC,new Cesium.Cartesian3());
    const range=Cesium.Cartesian3.magnitude(local);
    if(!(range>0)||!Number.isFinite(range))return null;
    const pitch=-Math.asin(Cesium.Math.clamp(local.z/range,-1,1));
    const heading=pitch<Cesium.Math.toRadians(-88.5)?camera.heading:Math.atan2(-local.x,-local.y);
    return {target,heading,pitch,range};
  }
  const currentFrame=readFrame||surfaceFrame;
  function moveOrientation(frame,changes){
    if(orient){orient(changes);return;}
    beforeOrientation();
    camera.cancelFlight();
    camera.lookAt(frame.target,new Cesium.HeadingPitchRange(changes.heading??frame.heading,changes.pitch??frame.pitch,frame.range));
    const destination=Cesium.Cartesian3.clone(camera.positionWC);
    const direction=Cesium.Cartesian3.clone(camera.directionWC);
    const up=Cesium.Cartesian3.clone(camera.upWC);
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    camera.setView({destination,orientation:{direction,up}});
    scene.requestRender();
  }
  function state(){
    if(viewer.isDestroyed())return {};
    const frame=currentFrame();
    const position=frame?ellipsoid.cartesianToCartographic(frame.target):null;
    const fr=getLanguage()==='fr';
    const name=body==='earth'?(fr?'Terre':'Earth'):body==='moon'?(fr?'Lune':'Moon'):'Mars';
    return {body,name,latitude:position?Cesium.Math.toDegrees(position.latitude):undefined,
      longitude:position?Cesium.Math.toDegrees(position.longitude):undefined,
      altitudeKm:Math.max(0,camera.positionCartographic.height)/1000,rangeMeters:frame?.range,
      tiltDeg:frame?Cesium.Math.toDegrees(frame.pitch)+90:undefined,
      headingDeg:frame?Cesium.Math.toDegrees(Cesium.Math.zeroToTwoPi(frame.heading)):undefined,
      capabilities:{orbits:false,moons:false,labels:false}};
  }
  function execute(action,value){
    if(viewer.isDestroyed())return false;
    if(action==='home'){navigateTo(appURL('index.html'));return true;}
    if(action==='reset'){onReset();return true;}
    if(action==='locate'){
      const {lat,lon,range}=value||{};
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return false;
      return onLocate({...value,lat,lon,range:Number.isFinite(range)?Math.max(1,Math.min(1e9,range)):undefined});
    }
    const frame=currentFrame();
    if(!frame)return false;
    if(action==='north'){moveOrientation(frame,{heading:0});return true;}
    if(action==='tilt'){
      moveOrientation(frame,{pitch:frame.pitch<Cesium.Math.toRadians(-70)?Cesium.Math.toRadians(-55):TOP_DOWN_PITCH});
      return true;
    }
    return false;
  }
  const controls=connectInspectionControls({getState:state,execute,getLanguage,initialSettings:readInspectionLink(location.href),
    applySettings(settings){effects.setSettings(settings);document.documentElement.dataset.visualPreset=settings.style;}});
  const syncActivity=()=>effects.pause(document.hidden||viewer.useDefaultRenderLoop===false);
  const hide=()=>effects.pause();
  const listeners=[['visibilitychange',syncActivity,document],['relic-navigation-state',syncActivity,window],['pageshow',syncActivity,window],['pagehide',hide,window]];
  for(const [type,callback,target]of listeners)target.addEventListener(type,callback);
  syncActivity();
  return {setTheme:effects.setTheme,pause:effects.pause,destroy(){
    for(const [type,callback,target]of listeners)target.removeEventListener(type,callback);
    controls.dispose();effects.destroy();
  }};
}
