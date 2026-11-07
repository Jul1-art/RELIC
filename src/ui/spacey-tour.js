import {getLanguage,setLanguage} from '../atlas/atlas-live.js?v=3';

const STORAGE_KEY='relic.spacey-tour.v1';
const STEP_COPY=[
  ['welcome','Welcome aboard',"Hi, I'm Spacey, your guide to RELIC. Let me show you the main controls, then you can explore at your own pace."],
  ['worlds','Choose a world','Open Worlds to choose a planet, moon, or comet. You can also select a world directly in the solar system.'],
  ['earth','A closer look',"Let's visit Earth. I'll lock the view onto the planet so we can explore its surface and its nearby worlds."],
  ['camera','Your view controls','These four buttons share your view, switch between vertical and tilted views, turn north upward, and recenter the whole planet.'],
  ['data','Explore the details',"World Data brings together the planet's key facts, its moons and orbits, and exploration sites and missions."],
  ['display','Make the view yours','Display controls the scene and image. Adjust stars, lighting, labels, and visual effects here. Available controls depend on the current world.'],
  ['destinations','Places and visual styles','Location finds a place or coordinates on this world. Visual Presets changes the image style. You can return to Normal at any time.'],
  ['finish','Ready to explore',"Select the RELIC logo to return to the solar system. You're ready to explore. Select me whenever you'd like to replay this tour."],
];
const $=selector=>document.querySelector(selector);
const visible=element=>Boolean(element&&!element.hidden&&element.getClientRects().length);
const emit=(name,detail)=>window.dispatchEvent(new CustomEvent(name,{detail,cancelable:true}));
const selectWorld=body=>emit('planet-dashboard-world',{body});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function roundedHole(rect,padding=8){
  const x=Math.max(0,rect.left-padding),y=Math.max(0,rect.top-padding);
  const right=Math.min(innerWidth,rect.right+padding),bottom=Math.min(innerHeight,rect.bottom+padding);
  const w=right-x,h=bottom-y,r=Math.min(14,w/2,h/2);
  return `M${x+r} ${y}H${right-r}Q${right} ${y} ${right} ${y+r}V${bottom-r}Q${right} ${bottom} ${right-r} ${bottom}H${x+r}Q${x} ${bottom} ${x} ${bottom-r}V${y+r}Q${x} ${y} ${x+r} ${y}Z`;
}

function mergeHoles(rectangles){
  const result=[];
  for(const rectangle of rectangles){
    let merged={left:rectangle.left,top:rectangle.top,right:rectangle.right,bottom:rectangle.bottom};
    for(let index=result.length-1;index>=0;index--){
      const other=result[index];
      if(merged.left-16>other.right||merged.right+16<other.left||merged.top-16>other.bottom||merged.bottom+16<other.top)continue;
      merged={left:Math.min(merged.left,other.left),top:Math.min(merged.top,other.top),right:Math.max(merged.right,other.right),bottom:Math.max(merged.bottom,other.bottom)};
      result.splice(index,1);
    }
    result.push(merged);
  }
  return result;
}

function iconChip(source,label,action){
  if(!source)return null;
  const chip=document.createElement(action?'button':'span');
  chip.className='spacey-tour-control-chip';
  if(action){chip.type='button';chip.addEventListener('click',action);}
  const icon=source.querySelector('svg,img,.fas,.world-icon')||source.querySelector('.dock-label-icon');
  if(icon){
    const clone=icon.cloneNode(true);
    for(const node of [clone,...clone.querySelectorAll('*')]){
      for(const name of ['id','aria-controls','aria-describedby','aria-labelledby','tabindex'])node.removeAttribute(name);
    }
    clone.setAttribute('aria-hidden','true');
    if(icon.matches('.dock-label-icon')){
      const appearance=getComputedStyle(icon);
      clone.classList.add('spacey-tour-source-mask');
      Object.assign(clone.style,{
        display:'inline-block',flex:'0 0 19px',width:'19px',height:'19px',
        maskImage:appearance.maskImage,webkitMaskImage:appearance.webkitMaskImage,
        maskPosition:appearance.maskPosition,webkitMaskPosition:appearance.webkitMaskPosition,
        maskRepeat:appearance.maskRepeat,webkitMaskRepeat:appearance.webkitMaskRepeat,
        maskSize:appearance.maskSize,webkitMaskSize:appearance.webkitMaskSize,
        backgroundColor:appearance.backgroundColor,color:appearance.color,
      });
    }
    chip.append(clone);
  }
  const text=document.createElement('span');text.textContent=label;chip.append(text);
  return chip;
}

/** A first-visit invitation and an explicit, replayable tour. The rendered
 * controls remain the source of icons and the targets of every action. */
export function createSpaceyTour({mascot,setPose,moveTo,onActiveChange=()=>{}}){
  const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('./spacey-tour.css',import.meta.url).href;document.head.append(style);
  const layer=document.createElement('div');layer.className='spacey-tour';layer.hidden=true;
  layer.innerHTML=`<svg class="spacey-tour-dimmer" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd"/></svg><section class="spacey-tour-bubble" role="dialog" aria-labelledby="spacey-tour-title" aria-describedby="spacey-tour-text" lang="en"><header><span class="spacey-tour-name">Spacey</span><span class="spacey-tour-progress"></span><button type="button" class="spacey-tour-close" aria-label="Close tour">×</button></header><h2 id="spacey-tour-title"></h2><p id="spacey-tour-text" aria-live="polite"></p><div class="spacey-tour-chips"></div><p class="spacey-tour-audio-status" role="status" hidden></p><footer><div class="spacey-tour-audio"><button type="button" data-tour-action="mute" aria-label="Mute Spacey" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M11 4 6 8H3v8h3l5 4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg></button><button type="button" data-tour-action="replay" aria-label="Replay voice"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/></svg></button></div><button type="button" data-tour-action="back">Back</button><button type="button" data-tour-action="next">Next</button></footer><button type="button" class="spacey-tour-skip">Skip tour</button></section>`;
  document.body.append(layer);
  const bubble=layer.querySelector('.spacey-tour-bubble'),dimmer=layer.querySelector('.spacey-tour-dimmer');
  const shade=dimmer.querySelector('path'),title=layer.querySelector('h2'),text=layer.querySelector('#spacey-tour-text');
  const progress=layer.querySelector('.spacey-tour-progress'),chips=layer.querySelector('.spacey-tour-chips');
  const audioStatus=layer.querySelector('.spacey-tour-audio-status');
  const next=layer.querySelector('[data-tour-action=next]'),back=layer.querySelector('[data-tour-action=back]');
  const mute=layer.querySelector('[data-tour-action=mute]'),voiceReplay=layer.querySelector('[data-tour-action=replay]');
  const audio=new Audio();audio.preload='metadata';
  let active=false,invited=false,suspended=false,disposed=false,step=0,version=0,muted=false,layoutFrame=0,shadeFrame=0;
  let targets=[],previousLanguage,previousWorld,opener,waiting=false,movement;
  const readSaved=()=>{try{return localStorage.getItem(STORAGE_KEY);}catch{return null;}};
  const save=value=>{try{localStorage.setItem(STORAGE_KEY,value);}catch{}};
  const restoreLanguage=()=>{if(previousLanguage){setLanguage(previousLanguage);previousLanguage=undefined;}};

  function stopAudio(){audio.pause();audio.removeAttribute('src');audio.load();}
  function playVoice(allowWaiting=false){
    if(!active||suspended||(waiting&&!allowWaiting)||muted)return;
    const id=STEP_COPY[step][0];
    audio.src=new URL(`../../assets/spacey/audio/${id}.mp3`,import.meta.url).href;
    audio.currentTime=0;audio.muted=muted;
    const current=version;
    audio.play().then(()=>{if(version===current)audioStatus.hidden=true;},()=>{
      if(version!==current||muted)return;
      audioStatus.textContent='You can read along, or select Replay voice to try the audio again.';audioStatus.hidden=false;
    });
  }
  function rects(){return targets.filter(visible).map(element=>element.getBoundingClientRect());}
  function paintShade(){
    if(layer.hidden)return;
    const holes=rects();
    dimmer.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
    shade.setAttribute('d',`M0 0H${innerWidth}V${innerHeight}H0Z`+mergeHoles(holes).map(rect=>roundedHole(rect)).join(''));
  }
  function trackShade(){
    shadeFrame=0;
    if(layer.hidden||disposed)return;
    paintShade();shadeFrame=requestAnimationFrame(trackShade);
  }
  function startShadeTracking(){if(!shadeFrame)shadeFrame=requestAnimationFrame(trackShade);}
  function stopShadeTracking(){cancelAnimationFrame(shadeFrame);shadeFrame=0;}
  async function layout(){
    layoutFrame=0;
    if(layer.hidden||disposed)return;
    const width=Math.min(354,innerWidth-28);
    bubble.style.width=`${width}px`;
    const target=rects()[0];
    const mascotHeight=mascot.getBoundingClientRect().height||76;
    const bottomReserve=innerWidth<=700&&innerHeight>540?120:16;
    const mascotBottom=innerHeight-mascotHeight-bottomReserve;
    const minimumTop=innerHeight<=540?14:78;
    const availableHeight=Math.max(60,mascotBottom-minimumTop-9);
    bubble.style.maxHeight=innerHeight<=540?`${Math.min(innerHeight*.68,availableHeight)}px`:'';
    const height=bubble.offsetHeight;
    const maximumTop=Math.max(minimumTop,mascotBottom-height-9);
    let left=innerWidth<=700?14:Math.min(innerWidth-width-24,Math.max(96,(target?.left??innerWidth*.5)-width-28));
    let top=innerWidth<=700?Math.max(132,maximumTop):Math.max(96,Math.min(innerHeight-height-130,(target?.top??innerHeight*.5)-70));
    if(target&&innerWidth>700&&target.left<innerWidth*.45)left=Math.min(innerWidth-width-24,target.right+26);
    left=clamp(left,14,innerWidth-width-14);top=clamp(top,minimumTop,maximumTop);
    bubble.style.width=`${width}px`;bubble.style.left=`${left}px`;bubble.style.top=`${top}px`;
    const current=version;
    const x=left+18,y=Math.min(mascotBottom,top+bubble.offsetHeight+9);
    if(!movement||Math.abs(movement.x-x)>.5||Math.abs(movement.y-y)>.5){
      movement={x,y,promise:moveTo({x,y})};
    }
    let pending;
    do{
      pending=movement;
      await pending.promise;
    }while(current===version&&pending!==movement);
    if(current===version)paintShade();
  }
  const scheduleLayout=()=>{if(!layoutFrame&&!layer.hidden)layoutFrame=requestAnimationFrame(layout);};
  async function waitFor(predicate,current,timeout=6000){
    const end=performance.now()+timeout;
    while(!disposed&&version===current&&!suspended){
      const result=predicate();if(result)return result;
      if(performance.now()>=end)return null;
      await new Promise(resolve=>setTimeout(resolve,60));
    }
    return null;
  }
  function closePanels(){
    if($('#rail-worlds')?.getAttribute('aria-expanded')==='true')$('#rail-worlds').click();
    for(const selector of ['#inspection-display .inspection-module-toggle','#inspection-data .inspection-module-toggle','#inspection-location .inspection-tray-toggle','#inspection-presets .inspection-tray-toggle']){
      const toggle=$(selector);if(toggle?.getAttribute('aria-expanded')==='true')toggle.click();
    }
  }
  function openPanel(selector){const toggle=$(selector);if(toggle?.getAttribute('aria-expanded')!=='true')toggle?.click();return toggle;}
  function addChip(selector,label,action){const chip=iconChip($(selector),label,action);if(chip)chips.append(chip);}
  async function prepare(id,current){
    closePanels();targets=[];
    if(id==='worlds'){
      selectWorld('overview');
      const worlds=await waitFor(()=>$('#rail-worlds'),current);
      if(version!==current||disposed||suspended)return;
      if(worlds?.getAttribute('aria-expanded')!=='true')worlds?.click();
      targets=[worlds,$('#relic-action-panel')];
      addChip('#rail-worlds','Worlds');
    }else if(id!=='welcome'){
      if(document.body.dataset.dashboardBody!=='earth')selectWorld('earth');
      await waitFor(()=>!$('#relic-inspection-shell')?.hidden&&$('#relic-inspection-shell')?.dataset.world==='earth',current,35000);
      if(version!==current||disposed||suspended)return;
      if(id==='earth'){
        await waitFor(()=>['active','unavailable'].includes(document.body.dataset.detailedGlobe),current,35000);
        targets=[];
      }else if(id==='camera'){
        targets=[$('.inspection-top-actions')];
        for(const [name,label]of [['share','Share view'],['tilt','Tilt view'],['north','North up'],['reset','Whole planet']])addChip(`[data-inspection-action=${name}]`,label);
      }else if(id==='data'){
        targets=[openPanel('#inspection-data .inspection-module-toggle'),$('#inspection-data-body')];
        addChip('#inspection-data .inspection-module-toggle','World Data');
      }else if(id==='display'){
        targets=[openPanel('#inspection-display .inspection-module-toggle'),$('#inspection-display-body')];
        addChip('#inspection-display .inspection-module-toggle','Display');
      }else if(id==='destinations'){
        openPanel('#inspection-location .inspection-tray-toggle');
        targets=[$('.inspection-command-dock')];
        addChip('#inspection-location .inspection-tray-toggle','Location',()=>{openPanel('#inspection-location .inspection-tray-toggle');scheduleLayout();});
        addChip('#inspection-presets .inspection-tray-toggle','Visual Presets',()=>{openPanel('#inspection-presets .inspection-tray-toggle');scheduleLayout();});
      }else if(id==='finish'){
        targets=[$('.inspection-home')];addChip('.inspection-home','RELIC');
      }
    }
    targets=targets.filter(Boolean);
  }
  async function go(index){
    if(disposed||!active)return;
    step=clamp(index,0,STEP_COPY.length-1);const current=++version;
    stopAudio();chips.replaceChildren();audioStatus.hidden=true;
    const [id,heading,line]=STEP_COPY[step];
    layer.dataset.step=id;title.textContent=heading;text.textContent=line;
    progress.textContent=`${step+1} / ${STEP_COPY.length}`;
    back.hidden=false;back.disabled=step===0;next.textContent=step===STEP_COPY.length-1?'Start exploring':'Next';
    waiting=true;next.disabled=true;bubble.setAttribute('aria-busy','true');
    // Start the welcome line inside the user's gesture, including on mobile.
    if(id==='welcome')playVoice(true);
    scheduleLayout();
    await prepare(id,current);
    if(current!==version||disposed||suspended)return;
    setPose('front','idle');await layout();
    if(current!==version||disposed||suspended)return;
    waiting=false;next.disabled=false;bubble.setAttribute('aria-busy','false');
    next.focus({preventScroll:true});if(id!=='welcome')playVoice();
  }
  function close({completed=false,declined=false,restore=true}={}){
    ++version;active=false;invited=false;waiting=false;movement=undefined;stopAudio();
    layer.hidden=true;cancelAnimationFrame(layoutFrame);layoutFrame=0;stopShadeTracking();
    document.body.classList.remove('spacey-guiding');onActiveChange(false);
    closePanels();restoreLanguage();
    if(completed){save('done');selectWorld('overview');}
    else if(restore&&previousWorld)selectWorld(previousWorld);
    if(declined)save('dismissed');
    previousWorld=undefined;
    const focusTarget=opener?.isConnected&&visible(opener)?opener:mascot;
    focusTarget.focus({preventScroll:true});
  }
  function start(){
    if(disposed||suspended)return;
    opener=document.activeElement;previousLanguage=getLanguage();previousWorld=document.body.dataset.dashboardBody||'overview';
    active=true;invited=false;layer.hidden=false;setLanguage('en');
    startShadeTracking();
    document.body.classList.add('spacey-guiding');onActiveChange(true);
    layer.querySelector('.spacey-tour-skip').textContent='Skip tour';
    mute.hidden=false;voiceReplay.hidden=false;
    go(0);
  }
  async function placeInvite(){
    const current=version;
    next.disabled=true;bubble.setAttribute('aria-busy','true');
    await layout();
    if(current!==version||!invited||disposed||suspended)return;
    next.disabled=false;bubble.setAttribute('aria-busy','false');
    next.focus({preventScroll:true});
  }
  function showInvite(){
    if(disposed||suspended||active||invited||readSaved())return;
    invited=true;layer.hidden=false;layer.dataset.step='invite';targets=[];
    startShadeTracking();
    document.body.classList.add('spacey-guiding');onActiveChange(true);
    title.textContent="I'm Spacey";text.textContent='Your exploration companion. Take a short guided tour of RELIC, with English narration.';
    progress.textContent='Welcome aboard';chips.replaceChildren();back.hidden=true;next.disabled=true;next.textContent='Meet Spacey';bubble.setAttribute('aria-busy','true');
    mute.hidden=true;voiceReplay.hidden=true;layer.querySelector('.spacey-tour-skip').textContent='Not now';
    setPose('front','idle');
    placeInvite();
  }
  const nextStep=()=>{if(invited)start();else if(step===STEP_COPY.length-1)close({completed:true});else go(step+1);};
  next.addEventListener('click',nextStep);back.addEventListener('click',()=>go(step-1));
  const dismiss=()=>close({declined:true});
  layer.querySelector('.spacey-tour-close').addEventListener('click',dismiss);
  layer.querySelector('.spacey-tour-skip').addEventListener('click',dismiss);
  mute.addEventListener('click',()=>{
    muted=!muted;audio.muted=muted;mute.setAttribute('aria-pressed',String(muted));mute.setAttribute('aria-label',muted?'Unmute Spacey':'Mute Spacey');
    if(muted)audio.pause();else playVoice();
  });
  voiceReplay.addEventListener('click',()=>playVoice());
  const keydown=event=>{
    if(layer.hidden)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismiss();return;}
    if(event.key==='Tab'){
      const controls=[...bubble.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled)')].filter(visible);
      if(!controls.length)return;
      const current=controls.indexOf(document.activeElement);
      if(current<0||(!event.shiftKey&&current===controls.length-1)||(event.shiftKey&&current===0)){
        event.preventDefault();
        controls[event.shiftKey?controls.length-1:0].focus({preventScroll:true});
      }
    }
  };
  document.addEventListener('keydown',keydown,true);
  window.addEventListener('resize',scheduleLayout);
  const viewport=window.visualViewport;viewport?.addEventListener('resize',scheduleLayout);
  const observer=new ResizeObserver(scheduleLayout);observer.observe(bubble);observer.observe(mascot);
  return {
    showInvite,
    replay(){if(active||invited)close({restore:false});start();},
    suspend(value){
      const nextSuspended=Boolean(value);
      if(suspended===nextSuspended)return;
      suspended=nextSuspended;
      if(!active&&!invited)return;
      if(suspended){
        ++version;movement=undefined;audio.pause();cancelAnimationFrame(layoutFrame);layoutFrame=0;stopShadeTracking();
        layer.hidden=true;document.body.classList.remove('spacey-guiding');onActiveChange(false);
      }else{
        layer.hidden=false;document.body.classList.add('spacey-guiding');onActiveChange(true);
        startShadeTracking();
        if(active)go(step);else placeInvite();
      }
    },
    dispose(){
      if(disposed)return;close({restore:false});disposed=true;
      observer.disconnect();document.removeEventListener('keydown',keydown,true);window.removeEventListener('resize',scheduleLayout);viewport?.removeEventListener('resize',scheduleLayout);layer.remove();style.remove();
    },
    get active(){return active||invited;},
  };
}
