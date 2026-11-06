import {normalizeVisualSettings} from './visual-effects.js';

const MODES=new Set(['normal','crt','nvg','flir','anime','noir']);
const CAMERA=new Set(['tilt','north','reset','home','locate']);
const FLAGS=new Set(['stars','lighting','moons','orbits','labels','bloom','sharpen','scope']);
const NUMBERS=new Set(['bloomIntensity','sharpenIntensity','scopeFeather','exposure','contrast']);
const number=value=>typeof value==='number'&&Number.isFinite(value);

/** Deliberately serialize only public view coordinates, never the current URL's
 * arbitrary query parameters, user preferences, provider settings or tokens. */
export function createInspectionLink(state,baseURL=new URL('../../index.html',import.meta.url)){
  const url=new URL(baseURL);url.search='';url.hash='';
  if(typeof state.body!=='string'||!state.body||state.body==='overview')return url.href;
  url.searchParams.set('body',state.body.slice(0,100));
  url.searchParams.set('view','inspection');
  for(const [key,value,min,max] of [
    ['lat',state.latitude,-90,90],['lon',state.longitude,-180,180],
    ['range',state.rangeMeters??(number(state.altitudeKm)?state.altitudeKm*1000:undefined),1,1e13],
    ['heading',state.headingDeg,-360,360],['tilt',state.tiltDeg,0,85],
  ])if(number(value))url.searchParams.set(key,String(Math.round(Math.max(min,Math.min(max,value))*1e6)/1e6));
  const mode=state.settings?.style;if(MODES.has(mode)&&mode!=='normal')url.searchParams.set('visual',mode);
  return url.href;
}
export function readInspectionLink(url){
  const query=new URL(url).searchParams,result={};
  for(const [key,min,max]of [['lat',-90,90],['lon',-180,180],['range',1,1e13],['heading',-360,360],['tilt',0,85]]){
    const raw=query.get(key),value=Number(raw);if(raw!==null&&raw.trim()&&Number.isFinite(value)&&value>=min&&value<=max)result[key]=value;
  }
  const style=query.get('visual');if(MODES.has(style))result.style=style;
  return result;
}

/** One adapter per top-level renderer. The shell only sends semantic commands;
 * cameras and scientific scene objects remain owned by their renderer. */
export function connectInspectionControls({getState,execute,applySettings=()=>{},getLanguage=()=> 'en',events=window,documentRef=document,clipboard=globalThis.navigator?.clipboard,initialSettings={}}){
  let settings=normalizeVisualSettings(initialSettings),disposed=false,last='';
  const feedback=(message,extra={})=>events.dispatchEvent(new CustomEvent('relic-inspection-feedback',{detail:{message,...extra}}));
  function publish(force=false){
    if(disposed||documentRef.hidden)return;
    const state={...getState(),settings};const signature=JSON.stringify(state);
    if(force||signature!==last){last=signature;events.dispatchEvent(new CustomEvent('relic-inspection-state',{detail:state}));}
    return state;
  }
  function setSettings(patch){
    settings=normalizeVisualSettings(patch,settings);
    applySettings(settings);publish(true);return settings;
  }
  async function receive(event){
    if(disposed)return;
    const state=getState(),{action,value}=event.detail||{};
    if(!state?.body||state.body==='overview'||typeof action!=='string')return;
    if(action==='share'){
      const url=createInspectionLink({...state,settings});let copied=false;
      try{if(clipboard?.writeText){await clipboard.writeText(url);copied=true;}}catch{}
      if(!copied){
        const field=documentRef.createElement('textarea');field.value=url;field.style.cssText='position:fixed;left:-9999px';documentRef.body.append(field);
        const previous=documentRef.activeElement;field.select();try{copied=Boolean(documentRef.execCommand?.('copy'));}catch{}field.remove();previous?.focus?.({preventScroll:true});
      }
      feedback(getLanguage()==='fr'?(copied?'Lien de la vue copié':'Copiez ce lien pour partager la vue'):(copied?'View link copied':'Copy this link to share the view'),copied?{}:{type:'share',url});return;
    }
    if(action==='preset'&&MODES.has(value)){setSettings({style:value,styleParams:{}});return;}
    if(FLAGS.has(action)&&typeof value==='boolean'){setSettings({[action]:value});return;}
    if(NUMBERS.has(action)&&number(value)){setSettings({[action]:value});return;}
    if(action==='styleParams'&&value&&typeof value==='object'&&!Array.isArray(value)){setSettings({styleParams:value});return;}
    if(CAMERA.has(action)){
      try{const handled=await execute(action,value);if(handled===false)feedback(getLanguage()==='fr'?'Cette action est indisponible dans cette vue.':'This action is unavailable in this view.');publish(true);}
      catch{feedback(getLanguage()==='fr'?'La vue ne peut pas effectuer cette action.':'The view could not complete this action.');}
    }
  }
  events.addEventListener('relic-inspection-command',receive);
  const ready=()=>publish(true);events.addEventListener('relic-inspection-mounted',ready);
  const timer=setInterval(publish,500);
  applySettings(settings);publish(true);
  return {publish,setSettings,get settings(){return settings;},dispose(){if(disposed)return;disposed=true;clearInterval(timer);events.removeEventListener('relic-inspection-command',receive);events.removeEventListener('relic-inspection-mounted',ready);}};
}
