import * as THREE from 'three';

import {SURFACE_SOURCES, chooseSurfaceSource, surfaceMatrix, surfaceLevel} from './surface-imagery.js';
import {SurfaceTileCache} from './surface-tile-cache.js';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;

function tileGeometry(source, radius, level, x, y) {
  const { columns, rows } = surfaceMatrix(source, level);
  const divisions = level < 5 ? 26 : 16;
  const positions = [], uvs = [], indices = [];
  for (let row = 0; row <= divisions; row++) {
    const tileV = row / divisions;
    const globalV = (y + tileV) / rows;
    const latitude = source.scheme === 'mercator'
      ? Math.atan(Math.sinh(Math.PI * (1 - 2 * globalV)))
      : Math.PI * (.5 - globalV);
    const cosLat = Math.cos(latitude), sinLat = Math.sin(latitude);
    for (let col = 0; col <= divisions; col++) {
      const tileU = col / divisions;
      const longitude = TAU * ((x + tileU) / columns);
      positions.push(-radius * cosLat * Math.cos(longitude), radius * sinLat, radius * cosLat * Math.sin(longitude));
      uvs.push(tileU, 1 - tileV);
    }
  }
  for (let row = 0; row < divisions; row++) for (let col = 0; col < divisions; col++) {
    const a = row * (divisions + 1) + col, b = a + 1, c = a + divisions + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export class SurfaceDetail {
  constructor(camera,renderer,onState) {
    Object.assign(this,{camera,renderer,onState});
    this.loader=new THREE.TextureLoader().setCrossOrigin('anonymous');
    this.tiles=[];this.signature='';this.generation=0;this.lastCheck=-Infinity;this.activeBody=null;
    this.pending=null;this.retryAt=Infinity;this.sourceCooldown=new Map();this.currentSource=null;
    const phone=(renderer.domElement?.clientWidth||1200)<700;
    this.textureCache=new SurfaceTileCache({concurrency:4,maxEntries:phone?56:112,load:async url=>{
      const texture=await this.loader.loadAsync(url);texture.colorSpace=THREE.SRGBColorSpace;
      texture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());return texture;
    }});
    this.cache=this.textureCache.entries;
  }
  disposeTiles(tiles){for(const tile of new Set(tiles)){tile.parent?.remove(tile);tile.geometry.dispose();tile.material.dispose();}}
  clear(){
    this.generation++;this.disposeTiles([...this.tiles,...(this.pending?.loaded||[])]);
    this.tiles=[];this.pending=null;this.signature='';this.activeBody=null;this.currentSource=null;this.retryAt=Infinity;
    this.textureCache.setWanted([]);this.onState(null);
  }
  dispose(){this.clear();this.textureCache.dispose();}
  state(source,extra={}){
    const credits=[this.currentSource?.credit,source.credit].filter((value,index,items)=>value&&items.indexOf(value)===index);
    this.onState({id:this.activeBody,provider:source.id,credit:credits.join(' · '),sourceUrl:source.sourceUrl,local:Boolean(source.local),...extra});
  }
  fallback(source,id,context){
    if(source.local)return id==='mars'?SURFACE_SOURCES.marsDetail:SURFACE_SOURCES.moon;
    return SURFACE_SOURCES[id];
  }
  update(now,id,mesh,radius){
    if(!SURFACE_SOURCES[id]||!mesh||!radius){if(this.signature)this.clear();return;}
    if(now-this.lastCheck<240)return;this.lastCheck=now;
    mesh.updateWorldMatrix(true,false);
    const center=mesh.getWorldPosition(new THREE.Vector3()),distance=this.camera.position.distanceTo(center);
    const altitude=Math.max(distance-radius,radius*.000005),altitudeRatio=altitude/radius;
    if(altitudeRatio>1.05){if(this.signature)this.clear();return;}
    const facing=mesh.worldToLocal(this.camera.position.clone()).normalize();
    const u=((Math.atan2(facing.z,-facing.x)/TAU)%1+1)%1;
    const latitude=Math.asin(clamp(facing.y,-1,1)),latitudeDegrees=THREE.MathUtils.radToDeg(latitude),longitude=u*360-180;
    const context={altitudeRatio,latitude:latitudeDegrees,longitude};
    let source=chooseSurfaceSource(id,context);
    while((this.sourceCooldown.get(source.id)||0)>now){const next=this.fallback(source,id,context);if(next===source)break;source=next;}
    const height=this.renderer.domElement?.clientHeight||800,pixelRatio=this.renderer.getPixelRatio?.()||1;
    const level=surfaceLevel(source,{radius,altitude,latitude:latitudeDegrees,fov:this.camera.fov,viewportHeight:height,pixelRatio});
    const {columns,rows}=surfaceMatrix(source,level);
    const v=source.scheme==='mercator'?(1-Math.log(Math.tan(Math.PI/4+clamp(latitude,-1.4835,1.4835)/2))/Math.PI)/2:.5-latitude/Math.PI;
    const centerX=Math.min(columns-1,Math.floor(u*columns)),centerY=clamp(Math.floor(v*rows),0,rows-1);
    const tileSpan=Math.PI*radius/rows*Math.max(.12,Math.cos(latitude));
    const halfView=altitude*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))*Math.max(1,this.camera.aspect);
    const reach=clamp(Math.ceil(halfView/tileSpan),1,3);
    const signature=`${source.id}/${level}/${centerX}/${centerY}/${reach}`;
    if(signature===this.signature&&now<this.retryAt)return;
    this.retryAt=Infinity;this.signature=signature;this.activeBody=id;
    this.generation++;const generation=this.generation;
    if(this.pending)this.disposeTiles(this.pending.loaded.filter(tile=>!this.tiles.includes(tile)));
    const coords=[];
    for(let dy=-reach;dy<=reach;dy++)for(let dx=-reach;dx<=reach;dx++){
      const y=centerY+dy;if(y<0||y>=rows)continue;const x=(centerX+dx+columns)%columns;
      if(source.bounds){const west=x/columns*360-180,east=(x+1)/columns*360-180,north=90-y/rows*180,south=90-(y+1)/rows*180;if(east<source.bounds[0]||west>source.bounds[2]||north<source.bounds[1]||south>source.bounds[3])continue;}
      coords.push({x,y,priority:Math.abs(dx)+Math.abs(dy),key:`${source.id}/${level}/${x}/${y}`});
    }
    coords.sort((a,b)=>a.priority-b.priority);
    const wanted=new Set(coords.map(row=>row.key)),retained=this.tiles.filter(tile=>wanted.has(tile.userData.tileKey));
    const retainedKeys=new Set(retained.map(tile=>tile.userData.tileKey));
    const missing=coords.filter(row=>!retainedKeys.has(row.key));
    this.textureCache.setWanted(wanted,new Set([...wanted,...this.tiles.map(tile=>tile.userData.tileKey)]));
    const centralKey=`${source.id}/${level}/${centerX}/${centerY}`;
    const batch={generation,loaded:retained.slice(),settled:retained.length,total:coords.length,central:retainedKeys.has(centralKey),committed:false,failed:false};this.pending=batch;
    const commit=()=>{
      if(generation!==this.generation)return;
      if(!batch.committed&&batch.central&&(batch.loaded.length>=Math.ceil(batch.total*.7)||batch.settled===batch.total)){
        this.disposeTiles(this.tiles.filter(tile=>!batch.loaded.includes(tile)));this.tiles=batch.loaded;
        for(const tile of this.tiles)if(tile.parent!==mesh)mesh.add(tile);
        batch.committed=true;this.currentSource=source;
      }
      if(batch.settled===batch.total){
        this.pending=null;
        if(batch.failed)this.retryAt=now+20000;
        if(!batch.central){this.disposeTiles(batch.loaded.filter(tile=>!this.tiles.includes(tile)));this.retryAt=now+20000;this.sourceCooldown.set(source.id,now+30000);this.signature='';}
        this.textureCache.setWanted(this.tiles.map(tile=>tile.userData.tileKey));
      }
      this.state(source,{level,loading:batch.settled<batch.total,unavailable:batch.settled===batch.total&&!batch.central,retained:this.tiles.length>0});
    };
    if(!missing.length){commit();return;}
    this.state(source,{level,loading:true,retained:this.tiles.length>0});
    for(const row of missing){
      this.textureCache.request(row.key,source.url(level,row.x,row.y),row.priority).then(texture=>{
        if(generation!==this.generation)return;
        const material=new THREE.MeshStandardMaterial({map:texture,emissive:0xffffff,emissiveMap:texture,emissiveIntensity:.12,roughness:1,metalness:0,alphaTest:source.local ? .01 : 0,polygonOffset:true,polygonOffsetFactor:-2});
        const tile=new THREE.Mesh(tileGeometry(source,radius*1.00000008,level,row.x,row.y),material);tile.userData.tileKey=row.key;tile.frustumCulled=true;
        batch.loaded.push(tile);if(batch.committed)mesh.add(tile);if(row.key===centralKey)batch.central=true;
      }).catch(error=>{if(generation===this.generation&&error.name!=='AbortError')batch.failed=true;}).finally(()=>{
        if(generation!==this.generation)return;batch.settled++;commit();
      });
    }
  }
}
