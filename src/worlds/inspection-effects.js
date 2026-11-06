import { bloomStrengthFromIntensity } from '../../vendor/gods-eye-view/bloom.js';
import { STYLE_PARAMETERS, SHARPEN_SHADER, TONE_SCOPE_SHADER, createStyleTransition, normalizeVisualSettings, visualStyleShader } from '../ui/visual-effects.js';

/** A stable sky with small neutral stars. A cube map keeps the stars
 * behind the world and rotates naturally with the camera. */
function createStarSky(Cesium,side,light) {
  let seed=39750241;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const faces=['positiveX','negativeX','positiveY','negativeY','positiveZ','negativeZ'];
  const sources=Object.fromEntries(faces.map(face=>{
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=side;
    const context=canvas.getContext('2d',{alpha:false});
    context.fillStyle=light?'#fff':'#000';context.fillRect(0,0,side,side);
    for(let index=0;index<100;index++){
      const x=random()*side,y=random()*side,brightness=random();
      const radius=.36+brightness*.66;
      const shade=light?0:255;
      context.fillStyle=`rgba(${shade},${shade},${shade},${.24+brightness*.66})`;
      context.beginPath();context.arc(x,y,radius,0,Math.PI*2);context.fill();
    }
    return [face,canvas];
  }));
  return new Cesium.SkyBox({sources});
}

/** Stages render only the planetary canvas. Interface text and provider credits
 * stay in the browser layer and retain their original colors and contrast. */
export function createCesiumInspectionEffects({Cesium,viewer}) {
  const scene=viewer.scene, stages=scene.postProcessStages;
  const originalLighting=scene.globe.enableLighting;
  const originalSky=scene.skyBox;
  const skies=new Map();
  const skySize=scene.canvas.clientWidth>760?1024:512;
  const bloom=stages.bloom;
  const bloomKeys=['glowOnly','contrast','brightness','delta','sigma','stepSize'];
  const originalBloom={enabled:bloom.enabled,uniforms:Object.fromEntries(bloomKeys.map(key=>[key,bloom.uniforms[key]]))};
  const presets=new Map();
  const addStage=(name,fragmentShader,uniforms)=>{
    const stage=new Cesium.PostProcessStage({name:`relic_inspection_${name}`,fragmentShader,uniforms});
    stage.enabled=false;
    return stages.add(stage);
  };
  // Insert all style stages before sharpening and tone adjustment. Disabled
  // stages do not run and are compiled on first use by Cesium.
  for (const [id,parameters] of Object.entries(STYLE_PARAMETERS)) {
    const shader=visualStyleShader(id);
    const uniforms={intensity:0,...Object.fromEntries(parameters.map(meta=>[meta.key,meta.default]))};
    if (shader.includes('uniform float time;')) uniforms.time=0;
    presets.set(id,addStage(id,shader,uniforms));
  }
  const sharpen=addStage('sharpen',SHARPEN_SHADER,{amount:1.08});
  const tone=addStage('tone',TONE_SCOPE_SHADER,{exposure:1,contrast:1,scopeEnabled:0,feather:1,background:new Cesium.Cartesian3()});
  let settings=normalizeVisualSettings(), theme='night', frame=null, paused=false, destroyed=false;
  const transition=createStyleTransition();
  const start=performance.now();
  const requestRender=()=>{if(!viewer.isDestroyed())scene.requestRender();};

  function syncStyles(time) {
    transition.update();
    let animated=transition.active;
    for(const [id,stage] of presets){
      const intensity=transition.intensities[id];
      stage.uniforms.intensity=intensity;
      stage.enabled=intensity>.001;
      if(stage.enabled&&stage.uniforms.time!==undefined){
        stage.uniforms.time=(time-start)/1000;
        animated=true;
      }
    }
    return animated;
  }
  function animate(time) {
    frame=null;
    if(destroyed||paused||viewer.isDestroyed())return;
    const animated=syncStyles(time);
    requestRender();
    if(animated)frame=requestAnimationFrame(animate);
  }
  function schedule() {
    if(destroyed||paused){
      if(frame!==null)cancelAnimationFrame(frame);
      frame=null;
      return;
    }
    if(syncStyles(performance.now())&&frame===null)frame=requestAnimationFrame(animate);
  }
  function syncBackground() {
    if(!skies.has(theme))skies.set(theme,createStarSky(Cesium,skySize,theme==='day'));
    const sky=skies.get(theme);
    scene.skyBox=sky;
    sky.show=settings.stars;
    const value=theme==='day'?1:0;
    tone.uniforms.background.x=tone.uniforms.background.y=tone.uniforms.background.z=value;
  }
  function setSettings(patch) {
    if(destroyed)return;
    settings=normalizeVisualSettings(patch,settings);
    scene.globe.enableLighting=settings.lighting;
    syncBackground();
    transition.setStyle(settings.style);
    const stage=presets.get(settings.style);
    if(stage)Object.assign(stage.uniforms,settings.styleParams);
    sharpen.enabled=settings.sharpen&&settings.sharpenIntensity>0;
    sharpen.uniforms.amount=.1+settings.sharpenIntensity*.02;
    tone.enabled=settings.scope||settings.exposure!==1||settings.contrast!==1;
    tone.uniforms.exposure=settings.exposure;
    tone.uniforms.contrast=settings.contrast;
    tone.uniforms.scopeEnabled=Number(settings.scope);
    tone.uniforms.feather=settings.scopeFeather/100;
    // Same intensity curve as God's Eye View, using Cesium's native bloom.
    const raw=bloomStrengthFromIntensity(settings.bloomIntensity);
    const strength=Math.max(0,(raw-.06)/.94);
    const eased=strength*strength*(3-2*strength);
    bloom.enabled=settings.bloom&&raw>.06;
    Object.assign(bloom.uniforms,{glowOnly:false,contrast:255-eased*168,brightness:-.5+eased*.36,sigma:.28+eased*6.3,delta:.2+eased*2.25,stepSize:1+eased*1.25});
    schedule();
    requestRender();
  }
  function setTheme(value) {
    if(destroyed)return;
    theme=value==='day'?'day':'night';
    syncBackground();
    requestRender();
  }
  function pause(value=true) {
    if(destroyed)return;
    paused=Boolean(value);
    schedule();
    if(!paused)requestRender();
  }
  function destroy() {
    if(destroyed)return;
    destroyed=true;
    schedule();
    if(viewer.isDestroyed())return;
    for(const stage of [...presets.values(),sharpen,tone])stages.remove(stage);
    bloom.enabled=originalBloom.enabled;
    Object.assign(bloom.uniforms,originalBloom.uniforms);
    scene.globe.enableLighting=originalLighting;
    if(scene.skyBox===skies.get(theme))scene.skyBox=originalSky;
    for(const sky of skies.values())sky.destroy();
  }
  setSettings(settings);
  return {setSettings,setTheme,pause,destroy,get settings(){return settings;}};
}
