import { bloomStrengthFromIntensity } from '../../vendor/gods-eye-view/bloom.js';
import { STYLE_PARAMETERS, SHARPEN_SHADER, TONE_SCOPE_SHADER, createStyleTransition, createScopeTransition, normalizeVisualSettings, visualStyleShader } from '../ui/visual-effects.js';

const FULLSCREEN_VERTEX=`
  precision highp float;
  in vec3 position;
  in vec2 uv;
  out vec2 v_textureCoordinates;
  void main(){v_textureCoordinates=uv;gl_Position=vec4(position.xy,0.,1.);}
`;

const BLOOM_SHADER=`
  uniform sampler2D colorTexture;
  uniform vec2 colorTextureDimensions;
  uniform float strength;
  in vec2 v_textureCoordinates;
  vec3 bright(vec2 uv){return max(texture(colorTexture,uv).rgb-vec3(.64),vec3(0.));}
  void main(){
    vec2 uv=v_textureCoordinates;
    vec2 pixel=(2.+8.*strength)/colorTextureDimensions;
    vec4 original=texture(colorTexture,uv);
    vec3 halo=(bright(uv+vec2(pixel.x,0.))+bright(uv-vec2(pixel.x,0.))
      +bright(uv+vec2(0.,pixel.y))+bright(uv-vec2(0.,pixel.y))
      +bright(uv+pixel)+bright(uv-pixel)
      +bright(uv+vec2(-pixel.x,pixel.y))+bright(uv+vec2(pixel.x,-pixel.y)))/8.;
    out_FragColor=vec4(clamp(original.rgb+halo*strength*1.6,0.,1.),original.a);
  }
`;

/** Full-screen GLSL passes for bodies rendered by Three. The atlas calls its
 * normal renderer directly in overview, so no extra buffers or passes run there. */
export function createThreeInspectionEffects({THREE,renderer,scene,camera}) {
  let settings=normalizeVisualSettings(), theme='night', resources, destroyed=false;
  const start=performance.now();
  const transition=createStyleTransition();
  const scope=createScopeTransition();
  const styleParams=new Map();
  const size=new THREE.Vector2();
  const toneFunctions=new Map([
    [THREE.LinearToneMapping,'LinearToneMapping'],[THREE.ReinhardToneMapping,'ReinhardToneMapping'],
    [THREE.CineonToneMapping,'OptimizedCineonToneMapping'],[THREE.ACESFilmicToneMapping,'ACESFilmicToneMapping'],
    [THREE.AgXToneMapping,'AgXToneMapping'],[THREE.NeutralToneMapping,'NeutralToneMapping'],
  ]);
  function createPass(fragmentShader,values={}) {
    const uniforms=Object.fromEntries(Object.entries({colorTexture:null,colorTextureDimensions:new THREE.Vector2(),...values}).map(([key,value])=>[key,{value}]));
    return new THREE.RawShaderMaterial({
      glslVersion:THREE.GLSL3,vertexShader:FULLSCREEN_VERTEX,
      fragmentShader:`precision highp float;\nprecision highp int;\nout vec4 out_FragColor;\n${fragmentShader}`,
      uniforms,depthTest:false,depthWrite:false,toneMapped:false,blending:THREE.NoBlending,
    });
  }
  function prepare() {
    const tone=toneFunctions.get(renderer.toneMapping);
    const toSRGB=renderer.outputColorSpace===THREE.SRGBColorSpace;
    // Render targets in Three store linear light. Convert to the same display
    // space as the normal canvas before evaluating the original sensor shaders.
    const output=createPass(`
      uniform sampler2D colorTexture;
      in vec2 v_textureCoordinates;
      ${THREE.ShaderChunk.tonemapping_pars_fragment}
      void main(){
        vec4 source=texture(colorTexture,v_textureCoordinates);
        vec3 color=${tone?`${tone}(source.rgb)`:'source.rgb'};
        ${toSRGB?'color=mix(color*12.92,1.055*pow(max(color,vec3(0.)),vec3(.41666667))-.055,step(vec3(.0031308),color));':''}
        out_FragColor=vec4(color,source.a);
      }
    `,{toneMappingExposure:renderer.toneMappingExposure});
    const sharpen=createPass(SHARPEN_SHADER,{amount:1.08});
    const bloom=createPass(BLOOM_SHADER,{strength:0});
    const adjustments=createPass(TONE_SCOPE_SHADER,{exposure:1,contrast:1,scopeEnabled:0,feather:1,background:new THREE.Vector3()});
    const presets=new Map();
    const capture=new THREE.WebGLRenderTarget(1,1,{type:renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType});
    const scratch=[0,1].map(()=>new THREE.WebGLRenderTarget(1,1,{depthBuffer:false}));
    const geometry=new THREE.PlaneGeometry(2,2);
    const quad=new THREE.Mesh(geometry,output);
    quad.frustumCulled=false;
    const passesScene=new THREE.Scene();passesScene.add(quad);
    resources={output,sharpen,bloom,adjustments,presets,capture,scratch,geometry,quad,passesScene,passesCamera:new THREE.Camera()};
  }
  function stylePass(id) {
    const {presets}=resources;
    if(!presets.has(id)){
      const shader=visualStyleShader(id);
      const values={intensity:0,...Object.fromEntries(STYLE_PARAMETERS[id].map(meta=>[meta.key,meta.default]))};
      if(shader.includes('uniform float time;'))values.time=0;
      presets.set(id,createPass(shader,values));
    }
    return presets.get(id);
  }
  function setSettings(patch) {
    settings=normalizeVisualSettings(patch,settings);
    transition.setStyle(settings.style);
    scope.setEnabled(settings.scope);
    styleParams.set(settings.style,settings.styleParams);
  }
  function setTheme(value) {theme=value==='day'?'day':'night';}
  function render(time=performance.now()) {
    const bloomStrength=bloomStrengthFromIntensity(settings.bloomIntensity);
    const needsBloom=settings.bloom&&bloomStrength>.06;
    const needsSharpen=settings.sharpen&&settings.sharpenIntensity>0;
    const scopeAmount=scope.update();
    const needsTone=scopeAmount>0||scope.active||settings.exposure!==1||settings.contrast!==1;
    transition.update();
    if(destroyed||renderer.capabilities.isWebGL2===false||(!needsBloom&&!needsSharpen&&!needsTone&&!transition.active&&settings.style==='normal')){
      renderer.render(scene,camera);return;
    }
    if(!resources)prepare();
    const {output,sharpen,bloom,adjustments,capture,scratch,quad,passesScene,passesCamera}=resources;
    renderer.getDrawingBufferSize(size);
    // Bound off-screen memory on high-density 4K and tablet displays.
    const scale=Math.min(1,Math.sqrt(3_500_000/Math.max(1,size.x*size.y)));
    const width=Math.max(1,Math.floor(size.x*scale)),height=Math.max(1,Math.floor(size.y*scale));
    if(capture.width!==width||capture.height!==height)for(const target of [capture,...scratch])target.setSize(width,height);
    const passes=[output];
    output.uniforms.toneMappingExposure.value=renderer.toneMappingExposure;
    for(const [id,intensity] of Object.entries(transition.intensities)){
      if(intensity<=.001)continue;
      const style=stylePass(id);
      style.uniforms.intensity.value=intensity;
      for(const [key,value] of Object.entries(styleParams.get(id)))style.uniforms[key].value=value;
      if(style.uniforms.time)style.uniforms.time.value=(time-start)/1000;
      passes.push(style);
    }
    if(needsBloom){bloom.uniforms.strength.value=bloomStrength;passes.push(bloom);}
    if(needsSharpen){sharpen.uniforms.amount.value=.1+settings.sharpenIntensity*.02;passes.push(sharpen);}
    if(needsTone){
      adjustments.uniforms.exposure.value=settings.exposure;
      adjustments.uniforms.contrast.value=settings.contrast;
      adjustments.uniforms.scopeEnabled.value=scopeAmount;
      adjustments.uniforms.feather.value=settings.scopeFeather/100;
      adjustments.uniforms.background.value.setScalar(theme==='day'?1:0);
      passes.push(adjustments);
    }
    const previous=renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(capture);
      renderer.render(scene,camera);
      let input=capture;
      passes.forEach((pass,index)=>{
        const target=index===passes.length-1?previous:scratch[index%2];
        pass.uniforms.colorTexture.value=input.texture;
        pass.uniforms.colorTextureDimensions.value.set(width,height);
        quad.material=pass;
        renderer.setRenderTarget(target);
        renderer.render(passesScene,passesCamera);
        input=target;
      });
    } finally {renderer.setRenderTarget(previous);}
  }
  function destroy() {
    if(destroyed)return;
    destroyed=true;
    if(!resources)return;
    const {output,sharpen,bloom,adjustments,presets,capture,scratch,geometry}=resources;
    for(const item of [output,sharpen,bloom,adjustments,...presets.values(),capture,...scratch,geometry])item.dispose();
    resources=null;
  }
  return {setSettings,setTheme,render,destroy,get settings(){return settings;}};
}
