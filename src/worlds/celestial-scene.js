/** Physical celestial context for a detailed globe. Positions and axes are
 * already transformed by the atlas into the inspected body's fixed frame,
 * in metres. These bodies keep their actual radii and angular separations.
 * https://cesium.com/learn/cesiumjs/ref-doc/Primitive.html
 */
const finitePoint=value=>value&&[value.x,value.y,value.z].every(Number.isFinite);
const length=value=>Math.hypot(value.x,value.y,value.z);

export function celestialPixelRadius(radius,distance,fovy,viewportHeight){
  if(![radius,distance,fovy,viewportHeight].every(Number.isFinite)||radius<=0||distance<=0||fovy<=0||fovy>=Math.PI||viewportHeight<=0)return 0;
  return radius*viewportHeight/(2*distance*Math.tan(fovy/2));
}

/** Exact centre-view distance for the scale ruler, including a distant world.
 * Cross products avoid subtracting nearly equal squared astronomical ranges.
 */
export function celestialRayDistance(origin,direction,body){
  if(!finitePoint(origin)||!finitePoint(direction)||!finitePoint(body?.position)||!(body.radiusMeters>0))return null;
  const n=length(direction);if(!(n>0))return null;
  const dx=direction.x/n,dy=direction.y/n,dz=direction.z/n;
  const x=body.position.x-origin.x,y=body.position.y-origin.y,z=body.position.z-origin.z;
  const along=x*dx+y*dy+z*dz,miss=Math.hypot(y*dz-z*dy,z*dx-x*dz,x*dy-y*dx);
  if(miss>body.radiusMeters)return null;
  const half=Math.sqrt(Math.max(0,body.radiusMeters**2-miss**2)),near=along-half,far=along+half;
  return near>0?near:far>0?far:null;
}

/** A label/point must never be forced through the selected world. Actual mesh
 * depth testing also accounts for terrain, other bodies and partial occultation.
 * Below the reference sphere (e.g. a lunar basin), measured terrain is decisive.
 */
export function celestialCentreOccluded(origin,target,radius){
  if(!finitePoint(origin)||!finitePoint(target)||!(radius>0)||length(origin)<=radius)return false;
  const dx=target.x-origin.x,dy=target.y-origin.y,dz=target.z-origin.z,dd=dx*dx+dy*dy+dz*dz;
  if(!(dd>0))return false;
  const t=-(origin.x*dx+origin.y*dy+origin.z*dz)/dd;
  return t>0&&t<1&&Math.hypot(origin.x+t*dx,origin.y+t*dy,origin.z+t*dz)<radius;
}

export function getBodyIdFromPick(pick){
  return typeof pick?.id==='string'&&pick.primitive?.relicCelestial===true?pick.id:null;
}

function validRow(row){return row&&typeof row.id==='string'&&row.id.length>0&&row.id.length<=100&&finitePoint(row.position)&&length(row.position)>0&&length(row.position)<1e16&&Number.isFinite(row.radiusMeters)&&row.radiusMeters>0&&row.radiusMeters<1e10;}

/** A Cesium ellipsoid's +X seam is u=0. A half turn about north places the
 * map's u=.5 central meridian on the supplied +X prime-meridian vector. Axes
 * remain right handed: +X prime, +Y east, +Z north in the body's own frame.
 */
export function celestialModelMatrix(Cesium,row){
  const {Cartesian3,Matrix3,Matrix4}=Cesium;
  const axes=row.axes&&['x','y','z'].every(axis=>finitePoint(row.axes[axis])&&length(row.axes[axis])>.9)?row.axes:{x:{x:1,y:0,z:0},y:{x:0,y:1,z:0},z:{x:0,y:0,z:1}};
  const rotation=new Matrix3();
  Matrix3.setColumn(rotation,0,new Cartesian3(-axes.x.x,-axes.x.y,-axes.x.z),rotation);
  Matrix3.setColumn(rotation,1,new Cartesian3(-axes.y.x,-axes.y.y,-axes.y.z),rotation);
  Matrix3.setColumn(rotation,2,new Cartesian3(axes.z.x,axes.z.y,axes.z.z),rotation);
  return Matrix4.fromRotationTranslation(rotation,new Cartesian3(row.position.x,row.position.y,row.position.z));
}

const MATERIAL_SOURCE=`czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec4 texel = texture(image, materialInput.st);
  vec3 towardSunEC = normalize(czm_viewRotation * towardSun);
  float daylight = max(dot(normalize(materialInput.normalEC), towardSunEC), 0.0);
  material.diffuse = texel.rgb * (0.012 + 1.25 * daylight);
  material.alpha = texel.a;
  return material;
}`;

export function createCelestialScene({Cesium,viewer,onSelect=()=>{}}){
  const C=Cesium,scene=viewer.scene,records=new Map();
  const points=scene.primitives.add(new C.PointPrimitiveCollection());points.relicCelestial=true;
  const labels=scene.primitives.add(new C.LabelCollection());labels.relicCelestial=true;
  const credit=new C.Credit('Celestial imagery · NASA · <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noopener noreferrer">Solar System Scope / INOVE · CC BY 4.0</a>',true);
  const originalFar=viewer.camera.frustum.far,originalLogDepth=scene.logarithmicDepthBuffer;
  const position=new C.Cartesian3(),towardCamera=new C.Cartesian3(),screenPoint=new C.Cartesian2();
  let disposed=false,hasCredit=false,lastFar=originalFar;
  scene.logarithmicDepthBuffer=true;
  const request=()=>{if(!disposed&&!viewer.isDestroyed?.())scene.requestRender();};
  function removeRecord(record){if(record.sphere)scene.primitives.remove(record.sphere);points.remove(record.point);labels.remove(record.label);records.delete(record.row.id);}
  function materialFor(row){
    if(!row.imageUrl)return C.Material.fromType('Color',{color:C.Color.WHITE});
    if(row.id==='sun'||row.flat===true)return C.Material.fromType('Image',{image:row.imageUrl});
    const direction=finitePoint(row.sunDirection)?row.sunDirection:{x:1,y:0,z:0};
    return new C.Material({fabric:{type:'RelicCelestialImage',uniforms:{image:row.imageUrl,towardSun:new C.Cartesian3(direction.x,direction.y,direction.z)},source:MATERIAL_SOURCE}});
  }
  function ensureSphere(record){
    if(record.sphere)return record.sphere;
    const row=record.row;
    const appearance=new C.MaterialAppearance({material:materialFor(row),flat:true,closed:true,translucent:false});
    const sphere=scene.primitives.add(new C.Primitive({geometryInstances:new C.GeometryInstance({
      geometry:new C.EllipsoidGeometry({radii:new C.Cartesian3(row.radiusMeters,row.radiusMeters,row.radiusMeters),stackPartitions:48,slicePartitions:72,vertexFormat:appearance.vertexFormat}),id:row.id,
    }),appearance,modelMatrix:celestialModelMatrix(C,row),asynchronous:false,show:false,allowPicking:true}));
    sphere.relicCelestial=true;
    record.sphere=sphere;request();return sphere;
  }
  function addRecord(row){
    const point=points.add({id:row.id,position:new C.Cartesian3(row.position.x,row.position.y,row.position.z),pixelSize:2.5,color:C.Color.WHITE,outlineWidth:0,disableDepthTestDistance:0});point.relicCelestial=true;
    const label=labels.add({id:row.id,text:row.name||row.id,position:point.position,show:false,font:'11px system-ui, sans-serif',fillColor:C.Color.WHITE,outlineColor:C.Color.BLACK,outlineWidth:3,
      style:C.LabelStyle.FILL_AND_OUTLINE,horizontalOrigin:C.HorizontalOrigin.LEFT,verticalOrigin:C.VerticalOrigin.CENTER,pixelOffset:new C.Cartesian2(10,0),disableDepthTestDistance:0});label.relicCelestial=true;
    const record={row,sphere:null,point,label};records.set(row.id,record);return record;
  }
  function updateVisibility(){
    if(disposed)return;
    const camera=viewer.camera,origin=camera.positionWC,height=Math.max(1,scene.canvas.clientHeight),fovy=camera.frustum.fovy||camera.frustum.fov||Math.PI/3;
    const globeRadius=scene.globe?.ellipsoid?.maximumRadius||0;
    for(const record of records.values()){
      const p=record.row.position;position.x=p.x;position.y=p.y;position.z=p.z;
      const distance=C.Cartesian3.distance(position,origin),pixels=celestialPixelRadius(record.row.radiusMeters,distance,fovy,height);
      const occluded=celestialCentreOccluded(origin,p,globeRadius);
      // Materials begin loading their images when constructed. Defer them for
      // subpixel bodies rather than downloading every planetary texture on a
      // phone merely to draw a distant white marker.
      if(pixels>=1.2)ensureSphere(record).show=true;
      else if(record.sphere)record.sphere.show=false;
      record.point.show=pixels<1.2&&!occluded;
      record.label.show=pixels>=2.5&&!occluded&&pixels<height*.35;
      if(record.label.show){
        C.Cartesian3.subtract(origin,position,towardCamera);C.Cartesian3.normalize(towardCamera,towardCamera);
        C.Cartesian3.multiplyByScalar(towardCamera,record.row.radiusMeters*1.025,towardCamera);
        record.label.position=C.Cartesian3.add(position,towardCamera,new C.Cartesian3());
        record.label.pixelOffset=new C.Cartesian2(Math.max(9,pixels+7),0);
      }
    }
  }
  function setBodies(rows=[]){
    if(disposed)return;
    if(!Array.isArray(rows))rows=[];
    const valid=new Map();for(const row of rows.slice(0,512))if(validRow(row))valid.set(row.id,row);
    for(const record of [...records.values()])if(!valid.has(record.row.id))removeRecord(record);
    let maximumDistance=originalFar;
    for(const row of valid.values()){
      let record=records.get(row.id);
      if(record&&(record.row.radiusMeters!==row.radiusMeters||record.row.imageUrl!==row.imageUrl)){removeRecord(record);record=null;}
      if(!record)record=addRecord(row);
      else{
        record.row=row;if(record.sphere)record.sphere.modelMatrix=celestialModelMatrix(C,row);record.point.position=new C.Cartesian3(row.position.x,row.position.y,row.position.z);record.label.text=row.name||row.id;
        if(record.sphere?.appearance.material.uniforms.towardSun&&finitePoint(row.sunDirection))record.sphere.appearance.material.uniforms.towardSun=new C.Cartesian3(row.sunDirection.x,row.sunDirection.y,row.sunDirection.z);
      }
      maximumDistance=Math.max(maximumDistance,length(row.position)+row.radiusMeters*2+length(viewer.camera.positionWC));
    }
    lastFar=maximumDistance*1.05;viewer.camera.frustum.far=lastFar;
    if(valid.size&&!hasCredit){viewer.creditDisplay?.addStaticCredit(credit);hasCredit=true;}
    if(!valid.size&&hasCredit){viewer.creditDisplay?.removeStaticCredit(credit);hasCredit=false;}
    updateVisibility();request();
  }
  function lookAt(id){
    const record=records.get(id);if(!record||disposed)return false;
    const camera=viewer.camera,destination=C.Cartesian3.clone(camera.positionWC),target=record.row.position;
    const direction=C.Cartesian3.subtract(new C.Cartesian3(target.x,target.y,target.z),destination,new C.Cartesian3());
    if(C.Cartesian3.magnitudeSquared(direction)<1)return false;C.Cartesian3.normalize(direction,direction);
    let up=C.Cartesian3.clone(camera.upWC);
    C.Cartesian3.subtract(up,C.Cartesian3.multiplyByScalar(direction,C.Cartesian3.dot(up,direction),new C.Cartesian3()),up);
    if(C.Cartesian3.magnitudeSquared(up)<1e-12){up=C.Cartesian3.clone(Math.abs(direction.z)<.9?C.Cartesian3.UNIT_Z:C.Cartesian3.UNIT_Y);C.Cartesian3.subtract(up,C.Cartesian3.multiplyByScalar(direction,C.Cartesian3.dot(up,direction),new C.Cartesian3()),up);}
    C.Cartesian3.normalize(up,up);camera.cancelFlight();camera.lookAtTransform(C.Matrix4.IDENTITY);camera.setView({destination,orientation:{direction,up}});request();return true;
  }
  function handleClick(windowPosition,{pixels=13}={}){
    if(disposed||!windowPosition)return false;
    const picked=scene.pick(windowPosition),id=getBodyIdFromPick(picked);
    if(id&&records.has(id)){onSelect(id);return true;}
    // A picked building or unrelated foreground object keeps its own action.
    if(picked)return false;
    let found=null,best=pixels;
    for(const record of records.values()){
      if(!record.point.show&&!record.sphere?.show)continue;
      if(celestialCentreOccluded(viewer.camera.positionWC,record.row.position,scene.globe?.ellipsoid?.maximumRadius||0))continue;
      const direction=viewer.camera.directionWC;
      if(direction&&((record.row.position.x-viewer.camera.positionWC.x)*direction.x+(record.row.position.y-viewer.camera.positionWC.y)*direction.y+(record.row.position.z-viewer.camera.positionWC.z)*direction.z)<=0)continue;
      const screen=scene.cartesianToCanvasCoordinates(record.point.position,screenPoint);if(!screen)continue;
      const distance=Math.hypot(screen.x-windowPosition.x,screen.y-windowPosition.y);
      if(distance<best){found=record.row.id;best=distance;}
    }
    if(found){onSelect(found);return true;}return false;
  }
  const removePreRender=(scene.preUpdate||scene.preRender).addEventListener(updateVisibility);
  return {setBodies,lookAt,handleClick,getBodyIdFromPick,getBody:id=>records.get(id)?.row||null,
    dispose(){if(disposed)return;disposed=true;removePreRender();if(viewer.isDestroyed?.()){records.clear();return;}for(const record of [...records.values()])removeRecord(record);scene.primitives.remove(points);scene.primitives.remove(labels);if(hasCredit)viewer.creditDisplay?.removeStaticCredit(credit);if(viewer.camera.frustum.far===lastFar)viewer.camera.frustum.far=originalFar;scene.logarithmicDepthBuffer=originalLogDepth;}
  };
}
