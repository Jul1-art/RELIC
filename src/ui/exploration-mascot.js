import { createMascotSprite } from './mascot-sprite.js';

export function createExplorationMascot({loading,getLanguage,onLanguageChange}) {
  const sprite=createMascotSprite();
  const button=document.createElement('button');
  button.type='button';
  button.className='relic-exploration-mascot';
  button.hidden=true;
  sprite.element.setAttribute('aria-hidden','true');
  button.append(sprite.element);

  const styles=document.createElement('link');
  styles.rel='stylesheet';
  styles.href=new URL('./exploration-mascot.css',import.meta.url).href;
  const systemMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let styled=false,suspended=false,paused=false,timer,flight,position=0,request=0,disposed=false;

  function motionAllowed() {
    const preference=document.documentElement.dataset.motion;
    return Boolean(button.animate)&&preference!=='reduced'&&(preference==='full'||!systemMotion.matches);
  }
  function canWalk() {
    return !button.hidden&&!paused&&motionAllowed();
  }
  function schedule(callback,delay) {
    clearTimeout(timer);
    if(canWalk())timer=setTimeout(callback,delay);
  }
  function place(x) {
    position=x;
    button.style.transform=`translateX(${x}px)`;
  }
  function stopWalking() {
    request++;
    clearTimeout(timer);
    if(!flight)return;
    // Preserve the point already reached when a movement is interrupted.
    const transform=getComputedStyle(button).transform;
    if(transform!=='none')place(new DOMMatrixReadOnly(transform).m41);
    const cancelled=flight;
    flight=null;
    cancelled.cancel();
  }
  function rest() {
    sprite.setPose('front','resting');
    schedule(walk,18000);
  }
  async function walk() {
    if(!canWalk())return;
    if(getComputedStyle(button).visibility==='hidden'){
      schedule(walk,2500);
      return;
    }
    stopWalking();
    const end=window.innerWidth<=700?52:76;
    const destination=position<end/2?end:0;
    const right=destination>position;
    const step=request;
    const ready=await sprite.setPose(right?'front_right':'front_left','walking');
    if(step!==request||!canWalk())return;
    if(!ready||getComputedStyle(button).visibility==='hidden'){
      rest();
      return;
    }
    const moving=button.animate(
      [{transform:`translateX(${position}px)`},{transform:`translateX(${destination}px)`}],
      {duration:Math.max(450,Math.abs(destination-position)*19),easing:'linear'},
    );
    flight=moving;
    moving.finished.then(()=>{
      if(flight!==moving)return;
      flight=null;
      place(destination);
      sprite.setPose(right?'right_profile':'left_profile','idle');
      schedule(rest,3800);
    },()=>{});
  }
  function refresh() {
    if(disposed)return;
    stopWalking();
    button.hidden=!styled||suspended||loading.dataset.viewLoading!=='ready';
    if(canWalk()){
      sprite.setPose('front','idle');
      schedule(walk,1200);
    }else sprite.setPose('front','resting');
  }
  function updateLabel() {
    const fr=getLanguage()==='fr';
    button.setAttribute('aria-label',fr?'Pause de la mascotte':'Pause mascot');
    button.setAttribute('aria-pressed',String(paused));
    button.title=paused?(fr?'Réveiller la mascotte':'Wake the mascot'):(fr?'Laisser la mascotte se reposer':'Let the mascot rest');
  }
  button.addEventListener('click',()=>{
    paused=!paused;
    updateLabel();
    refresh();
  });

  styles.addEventListener('load',()=>{styled=true;refresh();},{once:true});
  document.head.append(styles);
  document.body.append(button);
  const observer=new MutationObserver(refresh);
  observer.observe(loading,{attributes:true,attributeFilter:['data-view-loading']});
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});
  systemMotion.addEventListener('change',refresh);
  const unsubscribe=onLanguageChange(updateLabel);

  return {
    explore(body){
      if(!canWalk())return;
      stopWalking();
      sprite.setPose(body==='overview'?'back':position>0?'back_left':'back_right','idle');
      schedule(walk,1500);
    },
    setSuspended(value){
      if(suspended===value)return;
      suspended=value;
      refresh();
    },
    dispose(){
      disposed=true;
      stopWalking();
      observer.disconnect();
      systemMotion.removeEventListener('change',refresh);
      unsubscribe();
      button.remove();
      styles.remove();
    },
  };
}
