/** Heliocentric distances use one linear scale, including the belts and 67P.
 * Body radii are enlarged display symbols; they do not share this distance scale.
 */
export const AU_KM = 149597870.7;
export const WORLD_UNITS_PER_AU = 160;
export const auToWorld = au => Math.max(0, au) * WORLD_UNITS_PER_AU;
export const kmToWorld = km => km / AU_KM * WORLD_UNITS_PER_AU;

/** A ruler in the plane through the view centre, perpendicular to the camera.
 * Its length is exact at that plane. Perspective changes scale with depth.
 */
export function scaleRuler({distance, fov, viewportHeight, kmPerWorldUnit, maxPixels=140,kmPerPixel:givenScale}) {
  if(!Number.isFinite(maxPixels)||maxPixels<=0)return null;
  if(!Number.isFinite(givenScale)&&(![distance,fov,viewportHeight,kmPerWorldUnit,maxPixels].every(Number.isFinite)
    || distance<=0 || viewportHeight<=0 || kmPerWorldUnit<=0 || maxPixels<=0)) return null;
  const kmPerPixel = givenScale||2*distance*Math.tan(fov*Math.PI/360)/viewportHeight*kmPerWorldUnit;
  if(!(kmPerPixel>0))return null;
  const useAU = kmPerPixel*maxPixels >= AU_KM*.1;
  const unitKm = useAU?AU_KM:1;
  const target = kmPerPixel*maxPixels/unitKm;
  const power = 10**Math.floor(Math.log10(target));
  const step = [1,2,5].filter(value=>value*power<=target).at(-1)||1;
  const value=step*power;
  return {value,unit:useAU?'AU':'km',pixels:value*unitKm/kmPerPixel,kmPerPixel};
}

export function createScaleReadout({host,camera,getContext,getLanguage}) {
  const root=document.createElement('div');root.className='solar-scale-note';
  const note=document.createElement('span'),reference=document.createElement('span'),bar=document.createElement('span'),label=document.createElement('span');
  note.className='solar-scale-description';bar.className='solar-scale-ruler';label.className='solar-scale-value';
  reference.className='solar-scale-reference';root.append(note,reference,label,bar);host.append(root);let last='';
  function update(){
    const context=getContext();if(!context)return;
    const fr=getLanguage()==='fr',overview=context.id==='overview';
    const ruler=context.hideRuler?null:scaleRuler({distance:context.distance,fov:camera.fov,viewportHeight:context.viewportHeight,kmPerWorldUnit:overview?AU_KM/WORLD_UNITS_PER_AU:context.radiusKm/context.radius,kmPerPixel:context.kmPerPixel});
    let description=overview?(fr?'Distances proportionnelles · planètes agrandies':'Proportional distances · enlarged planets'):(fr?'Échelle au centre de la vue':'Scale at the centre of the view');
    if(context.special)description=context.special;
    const text=ruler?`${new Intl.NumberFormat(fr?'fr-FR':'en-GB',{maximumSignificantDigits:3}).format(ruler.value)} ${fr&&ruler.unit==='AU'?'UA':ruler.unit}`:'';
    const key=`${description}:${text}:${Math.round((ruler?.pixels||0)*2)}`;
    if(key===last)return;last=key;
    note.textContent=description;label.textContent=text;bar.hidden=label.hidden=!ruler;
    reference.hidden=!overview;reference.textContent=fr?'1 UA = 149,6 millions de km':'1 AU = 149.6 million km';
    if(ruler)bar.style.width=`${ruler.pixels.toFixed(1)}px`;
    root.title=overview?(fr?'Distances linéaires : 1 UA = 149 597 870,7 km. Tailles des corps agrandies pour la sélection. La règle est mesurée dans le plan passant par le centre de la vue ; la perspective varie avec la profondeur.':'Linear distances: 1 AU = 149,597,870.7 km. Body sizes are enlarged for selection. The ruler is measured in the plane through the view centre; perspective varies with depth.'):description;
  }
  return {element:root,update,dispose(){root.remove();}};
}
