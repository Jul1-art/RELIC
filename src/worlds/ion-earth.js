/** Actual Google Photorealistic 3D Tiles, brokered by the caller's ion token.
 * The ordinary globe remains visible until the first complete 3D view renders.
 * https://cesium.com/learn/cesiumjs-learn/cesiumjs-photorealistic-3d-tiles/
 */
export const ION_EARTH_ASSET_ID=2275207;

export function earthTilesOptions(compact=false){
  return {showCreditsOnScreen:true,enableCollision:true,
    maximumScreenSpaceError:compact?16:8,
    cacheBytes:(compact?96:320)*1024*1024,
    maximumCacheOverflowBytes:(compact?24:96)*1024*1024,
    cullRequestsWhileMoving:true,cullRequestsWhileMovingMultiplier:24,
    preloadFlightDestinations:!compact,preloadWhenHidden:false,
    foveatedScreenSpaceError:true,foveatedConeSize:compact?.15:.2,foveatedTimeDelay:compact?.25:.15,
    progressiveResolutionHeightFraction:compact?.3:.5,
    dynamicScreenSpaceError:compact,dynamicScreenSpaceErrorDensity:2e-4,dynamicScreenSpaceErrorFactor:24,
  };
}

export function createIonEarthTiles({Cesium,viewer,compact=false,onState=()=>{},timeoutMs=45000}){
  let tileset=null,tilesToken='',active=false,usable=false,status='off',serial=0,destroyed=false,timer=null;
  const listeners=[];
  const unavailable=()=>destroyed||viewer.isDestroyed?.();
  const render=()=>{if(!unavailable())viewer.scene.requestRender();};
  function emit(next){status=next;onState({status,active});}
  function stopWaiting(){clearTimeout(timer);timer=null;for(const remove of listeners.splice(0))remove?.();}
  function removeTiles(){if(tileset&&!viewer.isDestroyed?.())viewer.scene.primitives.remove(tileset);tileset=null;tilesToken='';usable=false;}
  function restore(){if(!viewer.isDestroyed?.())viewer.scene.globe.show=true;active=false;render();}
  function fail(request){if(request!==serial||unavailable()||active)return;serial++;stopWaiting();removeTiles();restore();emit('error');}
  async function enable(token){
    const request=++serial;stopWaiting();
    if(unavailable())return false;
    if(!token){removeTiles();restore();emit('missing');return false;}
    if(tileset&&usable&&tilesToken===token){tileset.show=true;viewer.scene.globe.show=false;active=true;emit('ready');render();return true;}
    removeTiles();restore();emit('loading');
    timer=setTimeout(()=>fail(request),timeoutMs);
    try{
      const resource=await Cesium.IonResource.fromAssetId(ION_EARTH_ASSET_ID,{accessToken:token});
      if(request!==serial||unavailable())return false;
      const next=await Cesium.Cesium3DTileset.fromUrl(resource,earthTilesOptions(compact));
      if(request!==serial||unavailable()){next.destroy();return false;}
      tileset=viewer.scene.primitives.add(next);tilesToken=token;
      let visible=false,complete=false;
      const activate=()=>{
        if(!visible||!complete||request!==serial||unavailable())return;
        stopWaiting();viewer.scene.globe.show=false;active=usable=true;emit('ready');render();
      };
      listeners.push(next.tileVisible.addEventListener(()=>{visible=true;activate();}));
      listeners.push(next.initialTilesLoaded.addEventListener(()=>{complete=true;activate();}));
      listeners.push(next.loadProgress.addEventListener(render));
      // Listen without logging provider errors: their URLs can contain tokens.
      listeners.push(next.tileFailed.addEventListener(()=>{if(!active)render();}));
      render();return true;
    }catch{fail(request);return false;}
  }
  function disable(){serial++;stopWaiting();if(tileset)tileset.show=false;restore();emit('off');}
  function destroy(){if(destroyed)return;disable();removeTiles();destroyed=true;}
  return {enable,disable,destroy,get active(){return active;},get status(){return status;},get tileset(){return tileset;}};
}
