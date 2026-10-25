// Detail imagery for close Earth exploration. NASA elevation remains the terrain source.
export const ESRI_IMAGERY_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';
export const ESRI_IMAGERY_CREDIT = 'Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

export function createDetailedEarthImagery(Cesium) {
  return Cesium.ArcGisMapServerImageryProvider.fromUrl(ESRI_IMAGERY_URL, {
    credit:ESRI_IMAGERY_CREDIT,
    enablePickFeatures:false,
  });
}
