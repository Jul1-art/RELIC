import { createMascotSprite } from './mascot-sprite.js';

const STEPS={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
const KEY_TARGETS='input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=tablist],[role=listbox],[role=menu],[role=slider]';

export function createExplorationMascot({loading,getLanguage,onLanguageChange}) {
  const sprite=createMascotSprite();
  const button=document.createElement('button');
  button.type='button';
  button.className='relic-exploration-mascot';
  button.hidden=true;
  button.setAttribute('aria-keyshortcuts','ArrowLeft ArrowRight ArrowUp ArrowDown');
  sprite.element.setAttribute('aria-hidden','true');
  button.append(sprite.element);

  const styles=document.createElement('link');
  styles.rel='stylesheet';
  styles.href=new URL('./exploration-mascot.css',import.meta.url).href;
  const systemMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const held=new Set();
  let styled=false,suspended=false,paused=false,timer,frame=0,request=0,disposed=false;
  let x=0,y=0,patrolOrigin=0,manual=false;

  function motionAllowed() {
    const preference=document.documentElement.dataset.motion;
    return preference!=='reduced'&&(preference==='full'||!systemMotion.matches);
  }
  function canWalk() {
    return !button.hidden&&!paused&&motionAllowed();
  }
  function schedule(callback,delay) {
    clearTimeout(timer);
    if(canWalk()&&!manual)timer=setTimeout(callback,delay);
  }
  function place(nextX,nextY=y) {
    x=nextX;y=nextY;
    button.style.translate=`${x}px ${y}px`;
  }
  function bounds() {
    const box=button.getBoundingClientRect();
    const minX=8-box.left+x;
    return {
      minX,
      maxX:Math.max(minX,innerWidth-8-box.right+x),
      minY:Math.min(0,62-box.top+y),
    };
  }
  function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
  function keepInView() {
    if(button.hidden)return;
    const limit=bounds();
    place(clamp(x,limit.minX,limit.maxX),clamp(y,limit.minY,0));
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
    const limit=bounds();
    const distance=innerWidth<=700?52:76;
    const home=clamp(patrolOrigin,limit.minX,limit.maxX);
    const end=home+distance<=limit.maxX?home+distance:Math.max(limit.minX,home-distance);
    const destination=Math.abs(x-home)<Math.abs(x-end)?end:home;
    if(destination===x){rest();return;}
    const right=destination>x;
    const step=request;
    const ready=await sprite.prepareWalk(right);
    if(step!==request||!canWalk())return;
    if(!ready||getComputedStyle(button).visibility==='hidden'){
      rest();
      return;
    }
    const origin=x;
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
  function manualAllowed() {
    return !button.hidden&&getComputedStyle(button).visibility!=='hidden'&&!document.querySelector('dialog[open]');
  }
  function directionFor(dx,dy) {
    return dx<0?'left_profile':dx>0?'right_profile':dy<0?'back':'front';
  }
  function move(dx,dy,distance,limit) {
    const nextX=clamp(x+dx*distance,limit.minX,limit.maxX);
    const nextY=clamp(y+dy*distance,limit.minY,0);
    const travelled=Math.abs(nextX-x)+Math.abs(nextY-y);
    place(nextX,nextY);
    return travelled;
  }
  async function steer() {
    stopWalking();
    const step=STEPS[[...held].at(-1)];
    if(!step||!manualAllowed()){if(!button.hidden)rest();return;}
    const [dx,dy]=step;
    const version=request;
    const animated=dx!==0&&await sprite.prepareWalk(dx>0);
    if(version!==request||!manualAllowed())return;
    if(!animated)sprite.setPose(directionFor(dx,dy),'idle');
    const limit=bounds(),height=sprite.element.offsetHeight,speed=height*1.55;
    let previous,travelled=0;
    function advance(time) {
      if(!manualAllowed()){releaseKeys();return;}
      const distance=move(dx,dy,speed*Math.min(.05,(time-(previous??time))/1000),limit);
      if(previous!==undefined&&distance===0){frame=0;rest();return;}
      previous=time;
      travelled+=distance;
      if(animated)sprite.drawWalk(travelled/(height*.68));
      frame=requestAnimationFrame(advance);
    }
    frame=requestAnimationFrame(advance);
  }
  function arrow(key,pressed) {
    if(!Object.hasOwn(STEPS,key))return false;
    if(!pressed){
      if(!held.delete(key))return false;
      if(motionAllowed())steer();else rest();
      return true;
    }
    if(!manualAllowed())return false;
    manual=true;
    if(!motionAllowed()){
      stopWalking();
      held.add(key);
      const [dx,dy]=STEPS[key];
      sprite.setPose(directionFor(dx,dy),'resting');
      move(dx,dy,12,bounds());
    }else if(!held.has(key)){
      held.add(key);
      const [dx,dy]=STEPS[key];
      move(dx,dy,6,bounds());
      steer();
    }
    return true;
  }
  function releaseKeys() {
    if(!held.size)return;
    held.clear();
    stopWalking();
    rest();
  }
  function keydown(event) {
    if(event.defaultPrevented||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||
      event.target?.closest?.(KEY_TARGETS))return;
    if(arrow(event.key,true))event.preventDefault();
  }
  function keyup(event) {
    if(arrow(event.key,false))event.preventDefault();
  }
  function receiveFrameKey(event) {
    if(event.origin!==location.origin||event.data?.channel!=='relic-detailed-globe-v15'||
      event.source!==document.querySelector('.detailed-globe-frame.is-ready')?.contentWindow)return;
    if(event.data.type==='mascot-key-reset')releaseKeys();
    else if(event.data.type==='mascot-key'&&typeof event.data.pressed==='boolean')arrow(event.data.key,event.data.pressed);
  }
  function resized() {
    const wasHeld=held.size;
    stopWalking();
    keepInView();
    if(wasHeld&&motionAllowed())steer();
    else rest();
  }
  function refresh() {
    if(disposed)return;
    held.clear();
    stopWalking();
    button.hidden=!styled||suspended||loading.dataset.viewLoading!=='ready';
    keepInView();
    if(canWalk()){
      sprite.setPose('front','idle');
      schedule(walk,1200);
    }else sprite.setPose('front','resting');
  }
  function updateLabel() {
    const fr=getLanguage()==='fr';
    button.setAttribute('aria-label',fr?'Pause de la mascotte':'Pause mascot');
    button.setAttribute('aria-pressed',String(paused));
    button.title=(paused?(fr?'Réveiller la mascotte':'Wake the mascot'):(fr?'Laisser la mascotte se reposer':'Let the mascot rest'))+' · ← ↑ ↓ →';
  }
  button.addEventListener('click',()=>{
    paused=!paused;
    manual=false;patrolOrigin=x;
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
  const listeners=[['keydown',keydown],['keyup',keyup],['blur',releaseKeys],['message',receiveFrameKey],['resize',resized]];
  for(const [type,listener] of listeners)window.addEventListener(type,listener);
  const unsubscribe=onLanguageChange(updateLabel);

  return {
    explore(body){
      held.clear();manual=false;patrolOrigin=x;
      stopWalking();
      if(!canWalk()){sprite.setPose('front','resting');return;}
      sprite.setPose(body==='overview'?'back':x>0?'back_left':'back_right','idle');
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
      for(const [type,listener] of listeners)window.removeEventListener(type,listener);
      systemMotion.removeEventListener('change',refresh);
      unsubscribe();
      button.remove();
      styles.remove();
    },
  };
}
