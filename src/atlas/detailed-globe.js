const BODIES=new Set(['earth','moon','mars']);
const CHANNEL='relic-detailed-globe-v15';
/** One lazy, same-origin Cesium frame. Removing it releases its WebGL context,
 * terrain queues and credentials in memory when returning to the solar view.
 * No access token ever crosses the parent/frame message channel or URL.
 */
export function createDetailedGlobe({host,onState=()=>{},onInteraction=()=>{}}){
  if(!document.querySelector('link[href*="detailed-globe.css"]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./detailed-globe.css?v=15',import.meta.url).href;document.head.append(link);
  }
  let frame=null,current=null,ready=false,timer=0,state={},disposed=false,loading=false;
  const origin=location.origin;
  const send=(action,payload={})=>frame?.contentWindow?.postMessage({channel:CHANNEL,action,...payload},origin);
  function teardown(){
    clearTimeout(timer);if(frame){send('dispose');frame.remove();}
    frame=null;ready=false;loading=false;state={};
  }
  function emit(extra={}){onState({id:current?.id||null,active:Boolean(frame&&ready),loading,...state,...extra});}
  function hide(){teardown();current=null;emit();}
  function setFocus(value){
    if(disposed)return false;
    if(!BODIES.has(value?.id)){hide();return false;}
    const changed=current?.id!==value.id;current={...value};
    if(!frame||changed){
      teardown();loading=true;frame=document.createElement('iframe');frame.className='detailed-globe-frame';
      frame.title=value.id==='earth'?'Earth · detailed 3D':value.id==='moon'?'Moon · detailed 3D':'Mars · detailed 3D';
      frame.setAttribute('allow','fullscreen');
      const url=new URL('../../pages/globe.html',import.meta.url);url.searchParams.set('body',value.id);
      frame.src=url.href;host.append(frame);emit();
      timer=setTimeout(()=>{if(!ready){teardown();emit({error:'unavailable'});}},30000);
    }else send('focus',{focus:current});
    return true;
  }
  function receive(event){
    if(disposed||event.origin!==origin||event.source!==frame?.contentWindow||event.data?.channel!==CHANNEL)return;
    const data=event.data;
    if(data.type==='boot'){send('focus',{focus:current});return;}
    if(data.type==='ready'){clearTimeout(timer);ready=true;loading=false;frame.classList.add('is-ready');state={...state,...data.state};emit();return;}
    if(data.type==='state'){state={...state,...data.state};emit();return;}
    if(data.type==='interaction'){onInteraction();return;}
    if(data.type==='error'){teardown();emit({error:'unavailable'});}
  }
  window.addEventListener('message',receive);
  const command=(action,value)=>{if(!ready)return false;send(action,{value});return true;};
  return {setFocus,hide,
    get active(){return Boolean(frame&&ready);},get loading(){return loading;},
    getViewState:()=>ready?{id:current?.id,...state}:null,
    getSurfaceCoordinates:()=>ready?{id:current?.id,latitude:state.latitude,longitude:state.longitude,altitudeKm:state.altitudeKm}:null,
    zoom:factor=>command('zoom',factor),tilt:degrees=>command('tilt',degrees),setTilt:degrees=>command('setTilt',degrees),
    turn:degrees=>command('turn',degrees),move:direction=>command('move',direction),topDown:()=>command('topDown'),resetView:()=>command('resetView'),
    pause(value=true){send('pause',{value:Boolean(value)});},
    dispose(){hide();disposed=true;window.removeEventListener('message',receive);}
  };
}
