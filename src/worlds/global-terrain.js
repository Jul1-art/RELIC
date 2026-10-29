/** Static-host fallback: measured NASA LOLA/MOLA, with actual native sampling.
 * Preferred ion datasets are finer; these sources keep real global relief
 * available even without an ion account or a private terrain backend.
 */
export function sampleGlobalHeight(grid,longitude,latitude){
  const {data,width,height,west,scale,offset}=grid;
  if(!data||width<2||height<2||!Number.isFinite(longitude)||!Number.isFinite(latitude))return NaN;
  const x=(((longitude-west)%360+360)%360)/360*width-.5;
  const y=Math.max(0,Math.min(height-1,(90-Math.max(-90,Math.min(90,latitude)))/180*height-.5));
  const ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy;
  const x0=(ix+width)%width,x1=(ix+1+width)%width,y1=Math.min(height-1,iy+1);
  const a=data[iy*width+x0]*(1-tx)+data[iy*width+x1]*tx;
  const b=data[y1*width+x0]*(1-tx)+data[y1*width+x1]*tx;
  return (a*(1-ty)+b*ty)*scale+offset;
}

export async function loadGlobalHeightGrid(body,{fetcher=fetch}={}){
  if(!['moon','mars'].includes(body))throw new Error('No packaged global DEM for this body');
  const root=new URL('../../assets/terrain/global/',import.meta.url);
  const metaResponse=await fetcher(new URL('provenance.json',root));
  if(!metaResponse.ok)throw new Error('Global relief metadata unavailable');
  const metadata=(await metaResponse.json())[body];
  if(!metadata||metadata.width!==2880||metadata.height!==1440||!metadata.file?.match(/^(moon|mars)-8ppd\.u16\.gz$/))throw new Error('Invalid global relief metadata');
  const response=await fetcher(new URL(metadata.file,root));
  if(!response.ok||!response.body)throw new Error('Global relief unavailable');
  const decoded=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  if(decoded.byteLength!==metadata.width*metadata.height*2)throw new Error('Invalid global relief grid');
  // Decode explicitly rather than relying on native endianness.
  const view=new DataView(decoded),data=new Uint16Array(metadata.width*metadata.height);
  for(let i=0;i<data.length;i++)data[i]=view.getUint16(i*2,true);
  return {...metadata,data};
}

/** Cesium computes a quadtree over the native raster; no finer measurements
 * are claimed when the same raster is interpolated at close zoom.
 */
export function createGlobalTerrainProvider(Cesium,ellipsoid,grid){
  const tilingScheme=new Cesium.GeographicTilingScheme({ellipsoid,numberOfLevelZeroTilesX:2,numberOfLevelZeroTilesY:1});
  const size=65;
  const terrain=new Cesium.CustomHeightmapTerrainProvider({width:size,height:size,tilingScheme,
    callback:(x,y,level)=>{
      const rectangle=tilingScheme.tileXYToRectangle(x,y,level),heights=new Float32Array(size*size);
      for(let row=0;row<size;row++)for(let col=0;col<size;col++){
        const lon=(rectangle.west+(rectangle.east-rectangle.west)*col/(size-1))*180/Math.PI;
        const lat=(rectangle.north-(rectangle.north-rectangle.south)*row/(size-1))*180/Math.PI;
        // MOLA is referenced to a 3396 km sphere, while the Mars shape/tiles
        // reference ellipsoid is supplied by the caller; preserve absolute radius.
        heights[row*size+col]=sampleGlobalHeight(grid,lon,lat)+grid.referenceRadiusMeters-ellipsoid.maximumRadius;
      }
      return heights;
    }});
  terrain.errorEvent?.addEventListener(()=>{});
  return terrain;
}
