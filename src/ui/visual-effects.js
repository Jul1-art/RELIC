import {retroShader} from '../../vendor/gods-eye-view/styles/retro.js';
import {nightVisionShader} from '../../vendor/gods-eye-view/styles/surveillance.js';
import {thermalShader} from '../../vendor/gods-eye-view/styles/thermal.js';
import {animeShader} from '../../vendor/gods-eye-view/styles/anime.js';
import {noirShader} from '../../vendor/gods-eye-view/styles/noir.js';
import {SHARPEN_SHADER,STYLE_PRESET_DEFAULTS} from '../../vendor/gods-eye-view/ui/visualPresets.js';

/** Original MIT-licensed God's Eye View shader modules remain byte-identical.
 * Only decorative sensor HUD compositing is omitted: these pictures are not
 * temperature measurements and RELIC never fabricates timestamps/readings. */
export const VISUAL_PRESETS=Object.freeze([
  {id:'normal',label:'Normal'},{id:'crt',label:'CRT'},{id:'nvg',label:'NVG'},
  {id:'flir',label:'FLIR'},{id:'anime',label:'Anime'},{id:'noir',label:'Noir'},
]);
export const STYLE_SHADERS=Object.freeze({crt:retroShader,nvg:nightVisionShader,flir:thermalShader,anime:animeShader,noir:noirShader});
export {SHARPEN_SHADER};
export const VISUAL_SETTINGS=Object.freeze({
  stars:{type:'boolean',default:true,label:'Stars',fr:'Étoiles'},
  lighting:{type:'boolean',default:true,label:'Sunlight',fr:'Éclairage solaire'},
  moons:{type:'boolean',default:true,label:'Moons',fr:'Lunes'},
  orbits:{type:'boolean',default:true,label:'Orbits',fr:'Orbites'},
  labels:{type:'boolean',default:true,label:'Labels',fr:'Noms'},
  bloom:{type:'boolean',default:false,label:'Bloom',fr:'Halo lumineux'},
  sharpen:{type:'boolean',default:true,label:'Sharpen',fr:'Netteté'},
  scope:{type:'boolean',default:false,label:'Scope',fr:'Vue circulaire'},
  bloomIntensity:{type:'range',default:36,min:0,max:200,step:1,label:'Bloom intensity',fr:'Intensité du halo'},
  sharpenIntensity:{type:'range',default:49,min:0,max:100,step:1,label:'Sharpen intensity',fr:'Intensité de la netteté'},
  scopeFeather:{type:'range',default:100,min:0,max:100,step:1,label:'Scope feather',fr:'Douceur du contour'},
  exposure:{type:'range',default:1,min:.5,max:2,step:.05,label:'Exposure',fr:'Exposition'},
  contrast:{type:'range',default:1,min:.5,max:2,step:.05,label:'Contrast',fr:'Contraste'},
});
const names={crt:'retro',nvg:'surveillance',flir:'thermal'};
const french={pixelation:'Pixellisation',distortion:'Distorsion',instability:'Instabilité',gain:'Gain',bloom:'Halo',scanlineStr:'Lignes de balayage',sensitivity:'Sensibilité',mode:'Blanc / noir chaud',palette:'Palette Ironbow',saturation:'Saturation',edgeThick:'Épaisseur des contours',contrastAmt:'Contraste',grainAmt:'Grain',vignetteAmt:'Vignettage'};
export const STYLE_PARAMETERS=Object.freeze(Object.fromEntries(Object.entries(STYLE_SHADERS).map(([id,shader])=>[id,Object.entries(shader.uniforms).map(([key,meta])=>({key,...meta,default:STYLE_PRESET_DEFAULTS[names[id]]?.styleParams?.[names[id]]?.[key]??meta.default,step:meta.max>10?1:.01,fr:french[key]||key}))])));
export function visualStyleShader(id){
  let shader=STYLE_SHADERS[id]?.fragmentShader;
  if(!shader)return null;
  if(id==='nvg')shader=shader.replace(/\/\/ ── HUD Overlay [\s\S]*?(?=\/\/ ── Final composite)/,'');
  if(id==='flir')shader=shader.replace(/\/\/ ── HUD Overlay [\s\S]*?(?=\/\/ ── Lens shading)/,'');
  return shader;
}
export function normalizeVisualSettings(patch={},previous){
  if(!patch||typeof patch!=='object')patch={};
  const base=previous||Object.fromEntries(Object.entries(VISUAL_SETTINGS).map(([key,meta])=>[key,meta.default]));
  const next={...base,style:base.style||'normal'};
  for(const [key,meta] of Object.entries(VISUAL_SETTINGS)){
    const value=patch[key];
    if(meta.type==='boolean'){if(typeof value==='boolean')next[key]=value;}
    else if(typeof value==='number'&&Number.isFinite(value))next[key]=Math.max(meta.min,Math.min(meta.max,value));
  }
  if(VISUAL_PRESETS.some(item=>item.id===patch.style))next.style=patch.style;
  const reset=next.style!==base.style;
  const params=Object.fromEntries((STYLE_PARAMETERS[next.style]||[]).map(meta=>[meta.key,reset?meta.default:base.styleParams?.[meta.key]??meta.default]));
  for(const meta of STYLE_PARAMETERS[next.style]||[]){const value=patch.styleParams?.[meta.key];if(typeof value==='number'&&Number.isFinite(value))params[meta.key]=Math.max(meta.min,Math.min(meta.max,value));}
  next.styleParams=params;
  return next;
}

export const TONE_SCOPE_SHADER=`
  uniform sampler2D colorTexture;
  uniform vec2 colorTextureDimensions;
  uniform float exposure;
  uniform float contrast;
  uniform float scopeEnabled;
  uniform float feather;
  uniform vec3 background;
  in vec2 v_textureCoordinates;
  void main(){
    vec4 source=texture(colorTexture,v_textureCoordinates);
    vec3 color=clamp((source.rgb*exposure-.5)*contrast+.5,0.,1.);
    vec2 p=(v_textureCoordinates-.5)*vec2(colorTextureDimensions.x/colorTextureDimensions.y,1.);
    float radius=.47;
    float edge=max(.001,feather*.30);
    float mask=1.-smoothstep(radius-edge,radius,length(p));
    out_FragColor=vec4(mix(color,mix(background,color,mask),scopeEnabled),source.a);
  }
`;
