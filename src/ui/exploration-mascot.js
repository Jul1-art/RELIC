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
  let styled=false,suspended=false,paused=false,timer,frame=0,position=0,request=0,disposed=false;

  function motionAllowed() {
    const preference=document.documentElement.dataset.motion;
    return preference!=='reduced'&&(preference==='full'||!systemMotion.matches);
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
    button.style.translate=`${x}px 0`;
  }
  function stopWalking() {
    request++;
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    frame=0;
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
    const ready=await sprite.prepareWalk(right);
    if(step!==request||!canWalk())return;
    if(!ready||getComputedStyle(button).visibility==='hidden'){
      rest();
      return;
    }
    const origin=position;
    const stride=sprite.element.offsetHeight*.42;
    const cycles=Math.max(1,Math.round(Math.abs(destination-origin)/stride));
    const duration=cycles*560;
    let start;
    function advance(time) {
      start ??= time;
      const progress=Math.min(1,(time-start)/duration);
      place(origin+(destination-origin)*progress);
      if(progress<1){
        sprite.drawWalk(progress*cycles);
        frame=requestAnimationFrame(advance);
      }else{
        frame=0;
        sprite.setPose(right?'right_profile':'left_profile','idle');
        schedule(rest,3800);
      }
    }
    frame=requestAnimationFrame(advance);
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
