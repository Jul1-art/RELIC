/** Public imagery endpoints verified against their service metadata, 2026-10-29.
 * Imagery is archival and resolution/coverage vary. No terrain is inferred.
 */
export const SURFACE_SOURCES = {
  earth:{id:'earth-blue-marble',scheme:'mercator',tileSize:256,maxLevel:8,
    credit:'NASA GIBS · Blue Marble',sourceUrl:'https://nasa-gibs.github.io/gibs-api-docs/access-basics/',
    url:(z,x,y)=>`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`},
  earthDetail:{id:'earth-world-imagery',scheme:'mercator',tileSize:256,maxLevel:19,
    credit:'Esri, Vantor, Earthstar Geographics, and the GIS User Community',sourceUrl:'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
    url:(z,x,y)=>`https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`},
  mars:{id:'mars-viking',scheme:'geographic',tileSize:256,maxLevel:7,
    credit:'NASA/JPL · Viking global mosaic',sourceUrl:'https://trek.nasa.gov/mars/',
    url:(z,x,y)=>`https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`},
  marsDetail:{id:'mars-ctx',scheme:'geographic',tileSize:512,maxLevel:12,bounds:[-180,-88,180,88],
    credit:'NASA/JPL/MSSS/Caltech Murray Lab/Esri · CTX 5 m mosaic (beta)',sourceUrl:'https://trek.nasa.gov/tiles/Mars/EQ/CTX_beta01_uncontrolled_5m_Caltech/1.0.0/WMTSCapabilities.xml',
    url:(z,x,y)=>`https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/${z}/${y}/${x}`},
  moon:{id:'moon-lroc-wac',scheme:'geographic',tileSize:256,maxLevel:8,
    credit:'NASA/GSFC/ASU · LROC WAC global mosaic',sourceUrl:'https://trek.nasa.gov/moon/',
    url:(z,x,y)=>`https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`},
  jezero:{id:'mars-jezero-hirise',scheme:'geographic',tileSize:256,maxLevel:17,bounds:[77.2229331,18.3067994,77.583964,18.669315],local:true,
    credit:'NASA/JPL/University of Arizona · Jezero HiRISE mosaic',sourceUrl:'https://trek.nasa.gov/mars/',
    url:(z,x,y)=>`https://trek.nasa.gov/tiles/Mars/EQ/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd/1.0.0/default/default028mm/${z}/${y}/${x}.png`},
  apollo11:{id:'moon-apollo11-nac',scheme:'geographic',tileSize:256,maxLevel:15,bounds:[23.4484963,.1464532,23.5396925,1.1149077],local:true,
    credit:'NASA/GSFC/ASU · Apollo 11 LROC NAC mosaic',sourceUrl:'https://trek.nasa.gov/moon/',
    url:(z,x,y)=>`https://trek.nasa.gov/tiles/Moon/EQ/apollo11_26cm_mosaic_byte_geo_1_2_highContrast/1.0.0/default/default028mm/${z}/${y}/${x}.png`}
};

export function insideSource(source,latitude,longitude){return !source.bounds||(longitude>=source.bounds[0]&&longitude<=source.bounds[2]&&latitude>=source.bounds[1]&&latitude<=source.bounds[3]);}
export function chooseSurfaceSource(id,{altitudeRatio,latitude,longitude}){
  const local=id==='mars'?SURFACE_SOURCES.jezero:id==='moon'?SURFACE_SOURCES.apollo11:null;
  if(local&&altitudeRatio<.025&&insideSource(local,latitude,longitude))return local;
  if(id==='earth'&&altitudeRatio<.18&&Math.abs(latitude)<84)return SURFACE_SOURCES.earthDetail;
  if(id==='mars'&&altitudeRatio<.12&&insideSource(SURFACE_SOURCES.marsDetail,latitude,longitude))return SURFACE_SOURCES.marsDetail;
  return SURFACE_SOURCES[id]||null;
}
export function surfaceMatrix(source,level){return source.scheme==='mercator'?{columns:2**level,rows:2**level}:{columns:2**(level+1),rows:2**level};}
export function surfaceLevel(source,{radius,altitude,latitude,fov=40,viewportHeight=800,pixelRatio=1}){
  const pixelSpan=2*Math.max(altitude,radius*.000005)*Math.tan(fov*Math.PI/360)/Math.max(1,viewportHeight*pixelRatio);
  const circumference=source.scheme==='mercator'?2*Math.PI*radius*Math.max(.08,Math.cos(latitude*Math.PI/180)):Math.PI*radius;
  return Math.max(3,Math.min(source.maxLevel,Math.ceil(Math.log2(circumference/(source.tileSize*pixelSpan)))));
}
