/** Mission observations accompany the measured landing coordinates. */
export function createCometInspector({host,getMission,getLanguage,onSelect}) {
  const root=document.createElement('section');root.className='solar-inspector comet-inspector';root.hidden=true;host.append(root);
  const fr=()=>getLanguage()==='fr';
  const number=(value,digits=3)=>Number(value).toLocaleString(fr()?'fr-FR':'en-GB',{maximumFractionDigits:digits});
  function render(id){
    root.replaceChildren();const detail=getMission()?.getBody(id);root.hidden=!detail;if(!detail)return;
    const text=document.createElement('p');text.className='solar-body-description';text.textContent=detail.description;root.append(text);
    const actions=document.createElement('div');actions.className='solar-system-actions';
    for(const target of ['67p','philae','rosetta'])if(target!==id){
      const button=document.createElement('button');button.type='button';button.textContent=target==='67p'?(fr()?'Revoir la comète':'View the comet'):target==='philae'?'Philae · Abydos':'Rosetta · Sais';button.addEventListener('click',()=>onSelect(target));actions.append(button);
    }
    root.append(actions);
    if(detail.observedImage){
      const observation=detail.observedImage,figure=document.createElement('figure');figure.className='comet-observation';
      const link=document.createElement('a');link.href=observation.sourcePage;link.target='_blank';link.rel='noopener noreferrer';
      const image=document.createElement('img');image.src=observation.src;image.alt=observation.caption;image.loading='lazy';link.append(image);
      const caption=document.createElement('figcaption');caption.textContent=observation.caption;
      const credit=document.createElement('small');credit.textContent=observation.credit;figure.append(link,caption,credit);root.append(figure);
    }
    const facts=document.createElement('dl');facts.className='solar-facts';
    const fact=(label,value)=>{const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);facts.append(row);};
    if(Number.isFinite(detail.distanceFromSunKm))fact(fr()?'Distance du Soleil':'Distance from Sun',number(detail.distanceFromSunKm/149597870.7)+' '+(fr()?'UA':'AU'));
    if(detail.validAt)fact(fr()?'Position évaluée le':'Position evaluated at',new Date(detail.validAt).toLocaleString(fr()?'fr-FR':'en-GB',{dateStyle:'medium',timeStyle:'short'}));
    if(detail.positionKm){
      fact(fr()?'Repère des coordonnées':'Coordinate frame','CHEOPS · km');
      for(const [index,axis] of ['X','Y','Z'].entries())fact(axis,number(detail.positionKm[index],4)+' km');
      fact(fr()?'Latitude / longitude est':'Latitude / east longitude',number(detail.latitudeDeg,2)+'° / '+number(detail.longitudeDeg,2)+'°');
    }
    root.append(facts);
    const note=document.createElement('p');note.className='solar-model-note';note.textContent=detail.modelNote;root.append(note);
    const source=document.createElement('a');source.className='solar-source';source.href=detail.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';source.textContent=id==='67p'?'NASA/JPL Horizons':'ESA SPICE · '+(fr()?'coordonnées source':'source coordinates');root.append(source);
  }
  return {render,element:root};
}
