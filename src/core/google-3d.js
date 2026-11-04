import * as Cesium from '../../vendor/cesium/index.js';
Cesium.Ion.defaultAccessToken = ''; // RELIC uses only a user-supplied token for optional ion assets.
import {getCesiumToken,setCesiumToken,validateCesiumToken,API_KEYS_CHANGED_EVENT} from './api-config.js';
import {openApiSettings} from '../ui/api-settings.js';
import {createIonEarthTiles} from '../worlds/ion-earth.js';

export function createGoogle3D(viewer,onState=()=>{}){
  const compact=globalThis.matchMedia?.('(pointer: coarse)').matches||(globalThis.navigator?.deviceMemory??8)<=4||(globalThis.innerWidth??Infinity)<=760;
  let loadedToken='',status='off',disposed=false;
  function emit(state){status=state.status;onState({...state,error:state.status==='error'?'Google 3D is unavailable. Check API settings and your provider account.':''});}
  const controller=createIonEarthTiles({Cesium,viewer,compact,onState:emit});
  async function enable(token){
    if(disposed)return false;
    token=(token??getCesiumToken()).trim();
    if(!token){loadedToken='';return controller.enable('');}
    if(validateCesiumToken(token)){
      loadedToken='';void controller.enable('');
      status='error';onState({status,active:false,error:'Enter a complete Cesium ion browser token in API settings.'});return false;
    }
    loadedToken=token;
    const result=await controller.enable(token);
    if(result&&!disposed&&loadedToken===token)setCesiumToken(token);
    return result;
  }
  function credentialsChanged(){
    if(disposed||!loadedToken||loadedToken===getCesiumToken())return;
    loadedToken='';void controller.enable('');
    if(getCesiumToken())emit({status:'off',active:false});
  }
  globalThis.addEventListener?.(API_KEYS_CHANGED_EVENT,credentialsChanged);
  function destroy(){
    if(disposed)return;disposed=true;
    globalThis.removeEventListener?.(API_KEYS_CHANGED_EVENT,credentialsChanged);
    controller.destroy();loadedToken='';
  }
  return {enable,disable:controller.disable,destroy,get active(){return controller.active;},get status(){return status;},hasToken:()=>Boolean(getCesiumToken())};
}

export function askForCesiumToken(){return openApiSettings({purpose:'google3d'});}
