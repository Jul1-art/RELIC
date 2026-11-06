import {wheelZoomFactor,finiteCameraState} from './orbital-navigation.js';

/** Overview gestures share OrbitControls' rotation/pan state. Wheel and pinch
 * zoom are coalesced here so a trackpad burst cannot skip the useful scales. */
export function createSolarNavigation({THREE,camera,controls,element,isActive=()=>true,onIntent=()=>{},now=()=>performance.now()}){
  const pointers=new Map(),offset=new THREE.Vector3(),normal=new THREE.Vector3();
  const raycaster=new THREE.Raycaster(),plane=new THREE.Plane(),before=new THREE.Vector3(),after=new THREE.Vector3(),anchor=new THREE.Vector2();
  const lastPosition=camera.position.clone(),lastTarget=controls.target.clone();
  const originalTabIndex=element.tabIndex;
  let desiredDistance=null,zoomAnchor=null,touchFrame=null,lastRelease=null,disposed=false,wasActive=false;
  const touchPoints=()=>[...pointers.values()].filter(point=>point.type==='touch');
  const distance=()=>camera.position.distanceTo(controls.target);
  const limits=()=>({min:Math.max(.000001,Number.isFinite(controls.minDistance)?controls.minDistance:.000001),max:Number.isFinite(controls.maxDistance)?controls.maxDistance:Infinity});
  const bounded=value=>{const {min,max}=limits();return THREE.MathUtils.clamp(value,min,Math.max(min,max));};
  const active=()=>!disposed&&isActive();
  const rect=()=>element.getBoundingClientRect();
  function ndc(x,y){const box=rect();return {x:THREE.MathUtils.clamp((x-box.left)/Math.max(1,box.width)*2-1,-1,1),y:THREE.MathUtils.clamp(-(y-box.top)/Math.max(1,box.height)*2+1,-1,1)};}
  function metrics(){
    const points=touchPoints();if(points.length!==2)return null;
    const [a,b]=points;return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,spread:Math.hypot(a.x-b.x,a.y-b.y)};
  }
  function announceZoom(direction,source,point){onIntent({type:'zoom',direction,source,anchor:point});}
  function refresh(){
    if(!active()){
      desiredDistance=null;zoomAnchor=null;touchFrame=null;pointers.clear();wasActive=false;
      return;
    }
    controls.enablePan=true;controls.enableRotate=true;controls.enableZoom=touchPoints().length<2;
    controls.enableDamping=true;controls.dampingFactor=.085;controls.rotateSpeed=.48;controls.panSpeed=.9;
    controls.screenSpacePanning=true;controls.zoomToCursor=false;
    controls.mouseButtons.LEFT=THREE.MOUSE.ROTATE;controls.mouseButtons.MIDDLE=THREE.MOUSE.PAN;controls.mouseButtons.RIGHT=THREE.MOUSE.PAN;
    controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
    // Panning remains bounded around the system instead of losing it in space.
    controls.maxTargetRadius=Number.isFinite(controls.maxDistance)?controls.maxDistance*.65:Infinity;
    if(!wasActive){desiredDistance=null;zoomAnchor=null;lastPosition.copy(camera.position);lastTarget.copy(controls.target);}
    wasActive=true;
  }
  function cancel(){desiredDistance=null;zoomAnchor=null;touchFrame=null;}
  function queueZoom(factor,point,source){
    if(!active()||!Number.isFinite(factor)||factor<=0)return;
    desiredDistance=bounded((desiredDistance??distance())*factor);zoomAnchor=point;
    announceZoom(factor<1?-1:1,source,point);
  }
  function zoomTo(next){
    const current=distance();if(!(current>0)||!Number.isFinite(next))return false;
    camera.updateMatrixWorld(true);camera.getWorldDirection(normal);plane.setFromNormalAndCoplanarPoint(normal,controls.target);
    let held=false;
    if(zoomAnchor){anchor.set(zoomAnchor.x,zoomAnchor.y);raycaster.setFromCamera(anchor,camera);held=Boolean(raycaster.ray.intersectPlane(plane,before));}
    offset.copy(camera.position).sub(controls.target).multiplyScalar(next/current);camera.position.copy(controls.target).add(offset);
    camera.updateMatrixWorld(true);
    if(held){
      raycaster.setFromCamera(anchor,camera);
      if(raycaster.ray.intersectPlane(plane,after)){
        before.sub(after);camera.position.add(before);controls.target.add(before);
      }
    }
    camera.lookAt(controls.target);camera.updateMatrixWorld(true);return true;
  }
  function update(dt=1/60){
    if(!active()){if(wasActive)refresh();return;}
    if(!wasActive)refresh();
    const nextTouch=metrics();
    if(nextTouch&&touchFrame&&nextTouch.spread>12&&touchFrame.spread>12){
      const factor=touchFrame.spread/nextTouch.spread;
      if(Math.abs(Math.log(factor))>.0005)queueZoom(factor,ndc(nextTouch.x,nextTouch.y),'touch');
    }
    touchFrame=nextTouch;
    if(desiredDistance!==null){
      const current=distance(),wanted=bounded(desiredDistance),log=current>0?Math.log(wanted/current):0;
      const amount=Math.min(.16,Math.max(-.16,log*(1-Math.exp(-16*Math.max(0,Math.min(.05,dt))))));
      if(Math.abs(log)<.00001){zoomTo(wanted);desiredDistance=null;}
      else if(zoomTo(current*Math.exp(amount)))announceZoom(amount<0?-1:1,touchPoints().length===2?'touch':'wheel',zoomAnchor);
    }
    if(!finiteCameraState(camera.position,controls.target)){
      camera.position.copy(lastPosition);controls.target.copy(lastTarget);cancel();controls.update();
    }else{lastPosition.copy(camera.position);lastTarget.copy(controls.target);}
  }
  function pointerDown(event){
    if(!active())return;refresh();cancel();
    const type=event.pointerType||'mouse';
    if(type==='mouse'&&event.button===1)event.preventDefault();
    const modified=Boolean(event.shiftKey||event.ctrlKey||event.metaKey||event.altKey);
    pointers.set(event.pointerId,{type,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,dragged:false,blocked:type==='mouse'&&(event.button!==0||modified)});
    const touches=touchPoints();
    if(touches.length>1){for(const point of touches)point.blocked=true;controls.enableZoom=false;touchFrame=metrics();}
    element.focus?.({preventScroll:true});onIntent({type:'interaction',source:type});
  }
  function pointerMove(event){
    const point=pointers.get(event.pointerId);if(!active()||!point)return;
    point.x=event.clientX;point.y=event.clientY;
    if(Math.hypot(point.x-point.startX,point.y-point.startY)>(point.type==='touch'?7:5))point.dragged=true;
  }
  function pointerEnd(event){
    const point=pointers.get(event.pointerId);if(!point)return;
    point.x=event.clientX??point.x;point.y=event.clientY??point.y;
    if(Math.hypot(point.x-point.startX,point.y-point.startY)>(point.type==='touch'?7:5))point.dragged=true;
    lastRelease={id:event.pointerId,at:now(),blocked:point.blocked||point.dragged||event.type==='pointercancel'};
    pointers.delete(event.pointerId);touchFrame=metrics();
    if(active()&&touchPoints().length<2)controls.enableZoom=true;
  }
  function wheel(event){
    if(!active()||touchPoints().length)return;
    event.preventDefault();event.stopImmediatePropagation();
    const factor=wheelZoomFactor(event.deltaY,event.deltaMode,rect().height);
    if(factor!==1)queueZoom(factor,ndc(event.clientX,event.clientY),'wheel');
  }
  function keydown(event){
    if(!active()||event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.key==='+'||event.key==='=')queueZoom(.8,{x:0,y:0},'keyboard');
    else if(event.key==='-')queueZoom(1.25,{x:0,y:0},'keyboard');
    else if(event.key==='Home'){cancel();onIntent({type:'home',source:'keyboard'});}
    else return;
    event.preventDefault();event.stopPropagation();
  }
  const contextmenu=event=>{if(active())event.preventDefault();};
  const handlers={pointerdown:pointerDown,pointermove:pointerMove,pointerup:pointerEnd,pointercancel:pointerEnd,wheel,keydown,contextmenu};
  for(const [type,handler] of Object.entries(handlers))element.addEventListener(type,handler,{capture:true,passive:false});
  if(!Number.isFinite(originalTabIndex)||originalTabIndex<0)element.tabIndex=0;
  refresh();
  return {refresh,update,cancel,
    shouldSuppressClick(event){return Boolean((event.pointerType==='mouse'&&event.button!==0)||(lastRelease?.id===event.pointerId&&now()-lastRelease.at<600&&lastRelease.blocked));},
    get isInteracting(){return pointers.size>0;},
    dispose(){if(disposed)return;disposed=true;for(const [type,handler] of Object.entries(handlers))element.removeEventListener(type,handler,{capture:true});pointers.clear();cancel();if(originalTabIndex!==undefined)element.tabIndex=originalTabIndex;},
  };
}
