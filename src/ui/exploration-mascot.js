import {createMascotSprite} from './mascot-sprite.js?v=pixel-5';
import {createSpaceyTour} from './spacey-tour.js';
import {createMascotArrival} from './mascot-arrival.js';

export function createExplorationMascot({loading,getLanguage,onLanguageChange}) {
  const sprite=createMascotSprite();
  const button=document.createElement('button');
  button.type='button';
  button.className='relic-exploration-mascot';
  button.hidden=true;
  button.append(sprite.element);
  const styles=document.createElement('link');
  styles.rel='stylesheet';
  styles.href=new URL('./exploration-mascot.css',import.meta.url).href;
  const systemMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let styled=false,suspended=false,disposed=false,guiding=false;
  let x=0,y=0,frame=0,resolveMovement;
  let arrived=false,arriving=false,arrivalVersion=0;

  function reducedMotion() {
    const motion=document.documentElement.dataset.motion;
    return motion==='reduced'||(!motion&&systemMotion.matches);
  }
  function place(left,top) {
    x=left;y=top;
    button.style.translate=`${x}px ${y}px`;
  }
  function cancelMovement() {
    cancelAnimationFrame(frame);
    frame=0;
    resolveMovement?.();
    resolveMovement=null;
    sprite.element.style.opacity='';
  }
  function moveTo(target) {
    cancelMovement();
    const box=button.getBoundingClientRect();
    const destinationX=x+Math.max(8,Math.min(innerWidth-box.width-8,target.x))-box.left;
    const destinationY=y+Math.max(8,Math.min(innerHeight-box.height-8,target.y))-box.top;
    const originX=x,originY=y,distance=Math.hypot(destinationX-x,destinationY-y);
    if(reducedMotion()||distance<8){
      place(destinationX,destinationY);
      return Promise.resolve();
    }
    const walking=distance<box.height*1.7&&Math.abs(destinationY-y)<18&&Math.abs(destinationX-x)>8;
    sprite.setPose(walking?(destinationX>x?'right_profile':'left_profile'):'front',walking?'walking':'idle');
    const duration=walking?Math.min(1400,Math.max(320,distance/(box.height*.9)*1000)):260;
    let start;
    let relocated=false;
    return new Promise(resolve=>{
      resolveMovement=resolve;
      function advance(time) {
        start??=time;
        const progress=Math.min(1,(time-start)/duration);
        const eased=progress**3*(10-15*progress+6*progress**2);
        if(walking){
          place(originX+(destinationX-originX)*eased,originY+(destinationY-originY)*eased);
          sprite.drawWalk(eased*distance/(box.height*.48),Math.sin(Math.PI*progress));
        }else{
          // A viewport change relocates the companion without flying it across the scene.
          sprite.element.style.opacity=String(Math.abs(1-progress*2));
          if(progress>=.5&&!relocated){place(destinationX,destinationY);relocated=true;}
        }
        if(progress<1)frame=requestAnimationFrame(advance);
        else{
          frame=0;resolveMovement=null;
          place(destinationX,destinationY);
          sprite.element.style.opacity='';
          sprite.setPose('front','idle');
          resolve();
        }
      }
      frame=requestAnimationFrame(advance);
    });
  }

  const tour=createSpaceyTour({
    mascot:button,
    setPose:(direction,state)=>sprite.setPose(direction,state),
    moveTo,
    onActiveChange(active,tourRunning=active){
      if(tourRunning){
        if(activePointerId!==null){
          try{button.releasePointerCapture(activePointerId);}catch{}
          activePointerId=null;
        }
        hasDragged=false;
        button.classList.remove('mascot-dragging');
      }
      const before=button.getBoundingClientRect();
      guiding=tourRunning;
      button.classList.toggle('spacey-guiding',active);
      if(active){
        const after=button.getBoundingClientRect();
        place(x+before.left-after.left,y+before.top-after.top);
      }else{
        cancelMovement();
        place(0,0);
        sprite.setPose('front','idle');
      }
      updateLabel();
    },
  });
  const arrival=createMascotArrival({host:button,sprite:sprite.element,reducedMotion});
  function updateLabel() {
    const fr=getLanguage()==='fr';
    button.setAttribute('aria-label',fr?'Spacey · Visite guidée':'Spacey · Guided tour');
    button.title=fr?'Revoir la visite avec Spacey':'Take the tour with Spacey';
  }
  function refresh() {
    if(disposed)return;
    const ready=styled&&!suspended&&loading.dataset.viewLoading==='ready';
    button.hidden=!ready;
    if(!ready){
      ++arrivalVersion;arriving=false;arrival.cancel();tour.suspend(true);return;
    }
    if(arrived){tour.suspend(false);tour.showInvite();return;}
    if(arriving)return;
    arriving=true;tour.suspend(true);
    const current=++arrivalVersion;
    arrival.play().then(completed=>{
      if(disposed||current!==arrivalVersion)return;
      arriving=false;
      if(!completed)return;
      arrived=true;tour.suspend(false);tour.showInvite();
    });
  }

  let activePointerId=null;
  let dragStartX=0,dragStartY=0;
  let dragOffsetLeft=0,dragOffsetTop=0;
  let hasDragged=false;

  function onPointerDown(event) {
    if(guiding||arriving||disposed||(event.button!==undefined&&event.button!==0))return;
    activePointerId=event.pointerId;
    dragStartX=event.clientX;
    dragStartY=event.clientY;
    hasDragged=false;
    const box=button.getBoundingClientRect();
    dragOffsetLeft=event.clientX-box.left;
    dragOffsetTop=event.clientY-box.top;
    try{button.setPointerCapture(event.pointerId);}catch{}
  }

  function onPointerMove(event) {
    if(activePointerId!==event.pointerId||guiding)return;
    const dx=event.clientX-dragStartX;
    const dy=event.clientY-dragStartY;
    if(!hasDragged&&Math.hypot(dx,dy)>=5){
      hasDragged=true;
      cancelMovement();
      button.classList.add('mascot-dragging');
    }
    if(hasDragged){
      const box=button.getBoundingClientRect();
      const targetLeft=Math.max(8,Math.min(innerWidth-box.width-8,event.clientX-dragOffsetLeft));
      const targetTop=Math.max(8,Math.min(innerHeight-box.height-8,event.clientY-dragOffsetTop));
      place(x+(targetLeft-box.left),y+(targetTop-box.top));
      if(dx>2)sprite.setPose('front_right','walking');
      else if(dx<-2)sprite.setPose('front_left','walking');
    }
  }

  function onPointerUp(event) {
    if(activePointerId!==event.pointerId)return;
    activePointerId=null;
    try{button.releasePointerCapture(event.pointerId);}catch{}
    if(hasDragged){
      button.classList.remove('mascot-dragging');
      sprite.setPose('front','idle');
      const suppressClick=(e)=>{
        e.preventDefault();
        e.stopPropagation();
      };
      button.addEventListener('click',suppressClick,{capture:true,once:true});
      setTimeout(()=>button.removeEventListener('click',suppressClick,{capture:true}),50);
    }
  }

  function onResize() {
    if(guiding||disposed)return;
    const box=button.getBoundingClientRect();
    const clampedX=Math.max(8,Math.min(innerWidth-box.width-8,box.left));
    const clampedY=Math.max(8,Math.min(innerHeight-box.height-8,box.top));
    if(clampedX!==box.left||clampedY!==box.top){
      place(x+(clampedX-box.left),y+(clampedY-box.top));
    }
  }

  button.addEventListener('pointerdown',onPointerDown);
  button.addEventListener('pointermove',onPointerMove);
  button.addEventListener('pointerup',onPointerUp);
  button.addEventListener('pointercancel',onPointerUp);
  window.addEventListener('resize',onResize);

  button.addEventListener('click',()=>{if(!guiding&&!arriving)tour.replay();});
  styles.addEventListener('load',()=>{styled=true;refresh();},{once:true});
  document.head.append(styles);
  document.body.append(button);
  const observer=new MutationObserver(refresh);
  observer.observe(loading,{attributes:true,attributeFilter:['data-view-loading']});
  const unsubscribe=onLanguageChange(updateLabel);

  return {
    explore(body){
      if(!guiding&&!button.hidden)sprite.setPose('front_right','idle');
    },
    setSuspended(value){
      if(suspended===value)return;
      suspended=value;
      if(value)cancelMovement();
      refresh();
    },
    dispose(){
      disposed=true;
      ++arrivalVersion;arrival.dispose();
      cancelMovement();
      if(activePointerId!==null){
        try{button.releasePointerCapture(activePointerId);}catch{}
        activePointerId=null;
      }
      button.removeEventListener('pointerdown',onPointerDown);
      button.removeEventListener('pointermove',onPointerMove);
      button.removeEventListener('pointerup',onPointerUp);
      button.removeEventListener('pointercancel',onPointerUp);
      window.removeEventListener('resize',onResize);
      tour.dispose();
      observer.disconnect();
      unsubscribe();
      button.remove();
      styles.remove();
    },
  };
}
