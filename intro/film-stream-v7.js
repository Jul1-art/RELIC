import Hls from './assets/vendor/hls.full.mjs';
import {bufferedFilmSeconds,filmBufferPolicy} from './film-buffer-policy.js';

/** Prepare one retained source before Play. Loading never starts playback. */
export function attachFilmSource(video,media={}, {shouldResume=()=>false,onBuffer=()=>{},connection=globalThis.navigator?.connection}={}){
  const view=video.ownerDocument?.defaultView||globalThis;
  let player=null,destroyed=false,fallbackActive=false,mediaRecovery=false;
  let intent=false,suspended=false,measuredBandwidth=NaN,networkRetries=0,retryTimer=null,networkFailed=false;
  let lastState='',waitingTarget=false,hasManifest=false;
  const waiters=new Set(),listeners=[];
  const listen=(type,handler)=>{video.addEventListener(type,handler);listeners.push([type,handler]);};
  const duration=()=>Number.isFinite(video.duration)&&video.duration>0?video.duration:Number(media.duration)||746;
  function policy(rebuffer=waitingTarget){
    const level=player?.levels?.[Math.max(0,player.currentLevel)]||player?.levels?.[0];
    return filmBufferPolicy({connection,bandwidth:measuredBandwidth,bitrate:level?.averageBitrate||media.bitrate||2580474,duration:duration(),position:video.currentTime,playbackRate:video.playbackRate,playing:intent,rebuffer,deviceMemory:view.navigator?.deviceMemory});
  }
  function getBufferState(rebuffer=waitingTarget){
    const p=policy(rebuffer),ahead=bufferedFilmSeconds(video.buffered,video.currentTime);
    const target=waiters.size?p.required:intent?p.forwardTarget:p.preloadTarget;
    return {...p,ahead,target,progress:target>0?Math.min(1,ahead/target):1,ready:video.readyState>=2&&(ahead+.15>=p.required||p.remaining<=.15),preloading:!intent,suspended,networkRecovering:retryTimer!==null,networkFailed};
  }
  function publish(){
    if(destroyed)return;
    const state=getBufferState();
    const signature=`${Math.floor(state.ahead*2)}|${Math.ceil(state.target)}|${state.ready}|${state.preloading}|${state.suspended}|${state.networkRecovering}|${state.networkFailed}`;
    if(signature!==lastState){lastState=signature;try{onBuffer(state);}catch{/* Reporting must not interrupt loading. */}}
    for(const waiter of [...waiters])if(getBufferState(waiter.rebuffer).ready)waiter.finish(true);
  }
  function applyPolicy(){
    if(player){const p=policy();player.config.maxBufferLength=p.forwardTarget;player.config.maxMaxBufferLength=p.forwardTarget;player.config.maxBufferSize=p.maxBufferBytes;}
    publish();
  }
  function restartLoad(){
    if(destroyed||suspended||!player)return;
    networkFailed=false;
    if(!hasManifest&&!player.levels?.length)player.loadSource(media.hls);else player.startLoad(-1);
    publish();
  }
  const controller={
    mode:'mp4',recover,getBufferState,
    setPlaybackIntent(active){
      if(destroyed)return;const next=Boolean(active),retry=next&&!intent&&networkFailed;intent=next;
      if(retry){networkRetries=0;restartLoad();}applyPolicy();
    },
    suspend(value=true){
      if(destroyed||suspended===Boolean(value))return;suspended=Boolean(value);
      if(suspended){if(retryTimer!==null)view.clearTimeout(retryTimer);retryTimer=null;player?.stopLoad();}
      else restartLoad();publish();
    },
    waitForBuffer({signal,rebuffer=false}={}){
      if(destroyed||signal?.aborted)return Promise.reject(new view.DOMException('Playback preparation was cancelled.','AbortError'));
      waitingTarget=Boolean(rebuffer);applyPolicy();
      if(getBufferState(rebuffer).ready)return Promise.resolve(true);
      return new Promise((resolve,reject)=>{
        const waiter={rebuffer,finish:result=>{waiters.delete(waiter);signal?.removeEventListener('abort',abort);if(!waiters.size)waitingTarget=false;resolve(result);publish();}};
        const abort=()=>{waiters.delete(waiter);signal?.removeEventListener('abort',abort);if(!waiters.size)waitingTarget=false;reject(new view.DOMException('Playback preparation was cancelled.','AbortError'));publish();};
        signal?.addEventListener('abort',abort,{once:true});waiter.abort=abort;waiters.add(waiter);publish();
      });
    },
    destroy(){
      if(destroyed)return;destroyed=true;
      if(retryTimer!==null)view.clearTimeout(retryTimer);retryTimer=null;
      for(const waiter of [...waiters])waiter.abort();
      for(const [type,handler]of listeners)video.removeEventListener(type,handler);
      connection?.removeEventListener?.('change',applyPolicy);
      player?.destroy();player=null;
    },
  };
  function recover(){
    if(destroyed||fallbackActive||!media.src||controller.mode==='mp4')return false;
    const position=Number.isFinite(video.currentTime)?video.currentTime:0,resume=Boolean(shouldResume());
    fallbackActive=true;controller.mode='mp4';player?.destroy();player=null;
    video.src=media.src;video.preload='auto';
    video.addEventListener('loadedmetadata',()=>{
      if(destroyed)return;if(position>0&&position<video.duration)video.currentTime=position;
      if(resume&&shouldResume())video.play().catch(()=>{});
    },{once:true});video.load();return true;
  }
  video.preload='auto';
  if(media.hls&&Hls.isSupported()){
    controller.mode='hls';const p=policy();
    const retry={maxNumRetry:4,retryDelayMs:1000,maxRetryDelayMs:8000};
    player=new Hls({enableWorker:false,maxBufferLength:p.forwardTarget,maxMaxBufferLength:p.forwardTarget,maxBufferSize:p.maxBufferBytes,backBufferLength:12,
      manifestLoadPolicy:{default:{maxTimeToFirstByteMs:30000,maxLoadTimeMs:60000,timeoutRetry:retry,errorRetry:retry}},
      playlistLoadPolicy:{default:{maxTimeToFirstByteMs:30000,maxLoadTimeMs:60000,timeoutRetry:retry,errorRetry:retry}},
      fragLoadPolicy:{default:{maxTimeToFirstByteMs:45000,maxLoadTimeMs:120000,timeoutRetry:retry,errorRetry:retry}},
    });
    const on=(event,handler)=>{if(event)player.on(event,handler);};
    on(Hls.Events.MANIFEST_PARSED,()=>{hasManifest=true;applyPolicy();});
    on(Hls.Events.FRAG_LOADED,(_event,data)=>{
      const stats=data?.stats||data?.frag?.stats,elapsed=(stats?.loading?.end-stats?.loading?.start)/1000;
      if(data?.frag?.type==='main'&&stats?.loaded>0&&elapsed>.04){const sample=stats.loaded*8/elapsed;measuredBandwidth=Number.isFinite(measuredBandwidth)?measuredBandwidth*.6+sample*.4:sample;}
      networkRetries=0;networkFailed=false;applyPolicy();
    });
    on(Hls.Events.FRAG_BUFFERED,publish);
    on(Hls.Events.ERROR,(_event,data)=>{
      if(destroyed||!data.fatal)return;
      if(data.type===Hls.ErrorTypes.NETWORK_ERROR){
        player?.stopLoad();networkFailed=true;
        if(!suspended&&networkRetries<4){const delay=Math.min(8000,1000*2**networkRetries++);retryTimer=view.setTimeout(()=>{retryTimer=null;restartLoad();},delay);}
        else if(intent)video.dispatchEvent(new Event('error'));
        publish();return;
      }
      if(data.type===Hls.ErrorTypes.MEDIA_ERROR&&!mediaRecovery){mediaRecovery=true;player?.recoverMediaError();}
      else if(!recover())video.dispatchEvent(new Event('error'));
    });
    player.attachMedia(video);player.loadSource(media.hls);
  }else if(media.hls&&video.canPlayType('application/vnd.apple.mpegurl')){
    controller.mode='native-hls';video.src=media.hls;video.load();
  }else{
    if(!media.src)throw new Error('This browser does not support the film stream.');
    fallbackActive=true;video.src=media.src;video.load();
  }
  for(const type of ['progress','loadedmetadata','loadeddata','canplay','durationchange','timeupdate','seeked','ratechange'])listen(type,applyPolicy);
  connection?.addEventListener?.('change',applyPolicy);publish();
  return controller;
}
