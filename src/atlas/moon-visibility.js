/** Readability policy only. Catalogue dimensions and orbit coordinates are unchanged. */
export function displayedMoonRadius({baseRadius,distance,viewportHeight,fovDeg=40,major=false,selected=false,touch=false,overview=false,allOrbits=false}) {
  if(selected||!Number.isFinite(distance)||distance<=0)return baseRadius;
  const pixelRadius=major?(allOrbits?2.8:overview?3.5:touch?8:6):(allOrbits?1.1:touch?3:2);
  const unitsPerPixel=2*distance*Math.tan(fovDeg*Math.PI/360)/Math.max(1,viewportHeight);
  return Math.max(baseRadius,pixelRadius*unitsPerPixel);
}

export function moonOrbitOpacity({mode='auto',distance,planetRadius,closeMoon=false,count=1}) {
  if(closeMoon||!Number.isFinite(distance)||planetRadius<=0)return {inner:0,all:0};
  const t=Math.max(0,Math.min(1,(distance/planetRadius-5)/7));
  const fade=t*t*(3-2*t);
  // Full catalogues are opt-in. Zooming out must not create hundreds of lines.
  return mode==='all'
    ? {inner:0,all:.12*Math.min(1,Math.sqrt(20/Math.max(1,count)))*fade}
    : {inner:.22*fade,all:0};
}
