import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {sampleGlobalHeight,createGlobalTerrainProvider} from '../src/worlds/global-terrain.js';

const root=new URL('../assets/terrain/global/',import.meta.url);
const provenance=JSON.parse(await readFile(new URL('provenance.json',root),'utf8'));

test('measured global height grids match source checksums, dimensions and plausible NASA relief',async()=>{
  for(const body of ['moon','mars']){
    const metadata=provenance[body],compressed=await readFile(new URL(metadata.file,root));
    assert.equal(createHash('sha256').update(compressed).digest('hex'),metadata.outputSha256);
    const buffer=gunzipSync(compressed);assert.equal(buffer.length,metadata.width*metadata.height*2);
    const data=new Uint16Array(metadata.width*metadata.height);
    for(let i=0;i<data.length;i++)data[i]=buffer.readUInt16LE(i*2);
    const grid={...metadata,data};
    for(const latitude of [-90,-45,0,45,90]){
      const h=sampleGlobalHeight(grid,0,latitude);
      // Mars radial shape includes its ~20 km polar flattening relative to the
      // stated 3396 km sphere; this is not height above the Martian areoid.
      assert.ok(Number.isFinite(h)&&h>(body==='mars'?-30000:-15000)&&h<26000);
      assert.equal(h,sampleGlobalHeight(grid,360,latitude));
      assert.equal(h,sampleGlobalHeight(grid,-360,latitude));
    }
    assert.ok(metadata.nativeEquatorialSpacingMeters>3000,'Reduced raster must not claim metre precision');
    if(body==='mars')assert.ok(sampleGlobalHeight(grid,226.2,18.65)>15000,'Olympus Mons must rise above the MOLA datum');
  }
});

test('bilinear sampling wraps the antimeridian and remains finite at both poles',()=>{
  const grid={width:4,height:2,west:-180,scale:2,offset:-10,data:new Uint16Array([0,2,4,6,10,12,14,16])};
  assert.equal(sampleGlobalHeight(grid,-135,45),-10);
  assert.equal(sampleGlobalHeight(grid,-90,0),2);
  assert.equal(sampleGlobalHeight(grid,-180,45),sampleGlobalHeight(grid,180,45));
  assert.equal(sampleGlobalHeight(grid,0,95),sampleGlobalHeight(grid,0,90));
  assert.equal(sampleGlobalHeight(grid,0,-95),sampleGlobalHeight(grid,0,-90));
  assert.ok(Number.isNaN(sampleGlobalHeight(grid,NaN,0)));
});

test('Cesium heightmaps preserve the measured radial datum on a different reference ellipsoid',()=>{
  class GeographicTilingScheme{tileXYToRectangle(){return {west:-Math.PI,east:Math.PI,north:Math.PI/2,south:-Math.PI/2};}}
  class CustomHeightmapTerrainProvider{constructor(options){Object.assign(this,options);}}
  const grid={width:2,height:2,west:-180,scale:1,offset:0,referenceRadiusMeters:3396000,data:new Uint16Array([100,100,100,100])};
  const provider=createGlobalTerrainProvider({GeographicTilingScheme,CustomHeightmapTerrainProvider},{maximumRadius:3396190},grid);
  const heights=provider.callback(0,0,0);
  assert.equal(heights.length,65*65);assert.ok(heights.every(value=>value===-90));
});
