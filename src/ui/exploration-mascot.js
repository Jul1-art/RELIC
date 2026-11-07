import {createMascotSprite} from './mascot-sprite.js';
import {createSpaceyTour} from './spacey-tour.js';

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
    onActiveChange(active){
      const before=button.getBoundingClientRect();
      guiding=active;
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
  function updateLabel() {
    const fr=getLanguage()==='fr';
    button.setAttribute('aria-label',fr?'Spacey · Visite guidée':'Spacey · Guided tour');
    button.title=fr?'Revoir la visite avec Spacey':'Take the tour with Spacey';
  }
  function refresh() {
    if(disposed)return;
    const ready=styled&&!suspended&&loading.dataset.viewLoading==='ready';
    button.hidden=!ready;
    tour.suspend(!ready);
    if(ready)tour.showInvite();
  }
  button.addEventListener('click',()=>{if(!guiding)tour.replay();});
  styles.addEventListener('load',()=>{styled=true;refresh();},{once:true});
  document.head.append(styles);
  document.body.append(button);
  const observer=new MutationObserver(refresh);
  observer.observe(loading,{attributes:true,attributeFilter:['data-view-loading']});
  const unsubscribe=onLanguageChange(updateLabel);

  return {
    explore(body){
      if(!guiding&&!button.hidden)sprite.setPose(body==='overview'?'back_right':'front_right','idle');
    },
    setSuspended(value){
      if(suspended===value)return;
      suspended=value;
      if(value)cancelMovement();
      refresh();
    },
    dispose(){
      disposed=true;
      cancelMovement();
      tour.dispose();
      observer.disconnect();
      unsubscribe();
      button.remove();
      styles.remove();
    },
  };
}
