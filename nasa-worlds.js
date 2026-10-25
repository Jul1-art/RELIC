// Locations and imagery are drawn from the linked NASA mission catalogues.
export const EARTH_SITES = [
  {
    id:'manhattan', name:'Manhattan · Google 3D', tag:'VILLE EN 3D',
    lat:40.7484, lon:-73.9857, range:3200, terrainRange:2200, color:'#b8daf2',
    description:'Explorez Midtown avec les tuiles photoréalistes Google 3D via Cesium ion, si elles sont activées.',
    source:'https://eol.jsc.nasa.gov/SearchPhotos/photo.pl?frame=14524&mission=ISS007&roll=E',
  },
  {
    id:'paris', name:'Paris · Google 3D', tag:'VILLE EN 3D',
    lat:48.8606, lon:2.3376, range:3300, terrainRange:2200, color:'#e6d7b9',
    description:'Explorez le centre de Paris avec les tuiles photoréalistes Google 3D via Cesium ion, si elles sont activées.',
    source:'https://eol.jsc.nasa.gov/Collections/EarthObservatory/articles/ParisatNight.htm',
  },
  {
    id:'nice-airport', name:'Aéroport de Nice', tag:'PISTES · RELIEF CORRIGÉ',
    lat:43.6575, lon:7.2155, range:2600, terrainRange:1900, color:'#a4d7e8',
    description:'En mode NASA, les deux pistes sont raccordées au relief mesuré avec leurs altitudes publiées dans l’AIP français.',
    source:'https://www.sia.aviation-civile.gouv.fr/documents/download/f/d/15031542/',
    sourceLabel:'VOIR LES ALTITUDES OFFICIELLES ↗',
  },
  {
    id:'kennedy', name:'Kennedy Space Center', tag:'VUE DE L’ISS',
    lat:28.5, lon:-80.5, range:180000, color:'#80d8ff',
    description:'Le site de lancement de Floride vu depuis la Station spatiale internationale.',
    source:'https://eol.jsc.nasa.gov/SearchPhotos/photo.pl?frame=5399&mission=ISS002&roll=E',
  },
  {
    id:'grand-canyon', name:'Grand Canyon', tag:'PAYSAGE OBSERVÉ DE L’ISS',
    lat:36.4, lon:-112.2, range:120000, color:'#f1ac76',
    description:'Un paysage photographié depuis la Station spatiale internationale.',
    source:'https://eol.jsc.nasa.gov/SearchPhotos/photo.pl?frame=141613&mission=ISS062&roll=E',
  },
  {
    id:'nile', name:'Delta du Nil', tag:'VUE DE L’ISS',
    lat:30, lon:31, range:240000, color:'#d8d68d',
    description:'Le delta vert se détache du désert sur les observations orbitales.',
    source:'https://eol.jsc.nasa.gov/SearchPhotos/photo.pl?frame=10034&mission=ISS032&roll=E',
  },
];

export const PLANET_SITES = {
  mars:[
    { id:'jezero', name:'Cratère Jezero', tag:'PERSEVERANCE · HIRISE', lat:18.488, lon:77.403, altitude:.00065, local:true, terrainRange:6500,
      description:'À Jezero, le modèle stéréo HiRISE mesure le relief à 1 m par pixel dans sa zone de couverture.',
      source:'https://www.uahirise.org/dtm/ESP_045994_1985' },
    { id:'olympus', name:'Olympus Mons', tag:'VOLCAN GÉANT', lat:18, lon:-135, altitude:.12,
      description:'Le plus vaste volcan du système solaire se trouve dans la région de Tharsis.',
      source:'https://science.nasa.gov/photojournal/maps-of-mars-global-topography/' },
    { id:'hellas', name:'Hellas Planitia', tag:'BASSIN D’IMPACT', lat:-45, lon:70, altitude:.12,
      description:'Un grand bassin d’impact visible dans les cartes topographiques martiennes.',
      source:'https://science.nasa.gov/photojournal/maps-of-mars-global-topography/' },
  ],
  moon:[
    { id:'apollo11', name:'Apollo 11', tag:'SITE D’ALUNISSAGE · LROC', lat:.67416, lon:23.47314, altitude:.0006, local:true, terrainRange:2200,
      description:'Le module lunaire Eagle s’est posé ici le 20 juillet 1969. LROC couvre une petite zone autour du site.',
      source:'https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html' },
    { id:'tycho', name:'Cratère Tycho', tag:'CRATÈRE · LRO', lat:-43.37, lon:-11.32, altitude:.14, terrainRange:18000,
      description:'Sur son pic central, le relief stéréo LROC et l’orthophoto mesurent les détails à 2 m par pixel.',
      source:'https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_TYCHOPK' },
    { id:'surveyor7', name:'Surveyor 7', tag:'SONDE · 1968', lat:-40.97, lon:-11.44, altitude:.02,
      description:'La sonde Surveyor 7 s’est posée près du rebord nord de Tycho.',
      source:'https://science.nasa.gov/mission/surveyor-7/' },
  ],
};

export const NASA_IMAGERY = {
  earthBlueMarble:'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
  earthModis:date => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg`,
  gibsInfo:'https://data.nasa.gov/dataset/gibs-web-map-tile-service-wmts',
  marsTrek:'https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars',
  moonTrek:'https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon',
};
