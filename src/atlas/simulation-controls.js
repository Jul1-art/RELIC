const RATES=[1,3600,86400,604800,2592000];
const ICONS={play:'<path d="m8 5 11 7-11 7Z"/>',pause:'<path d="M8 5v14M16 5v14"/>',lock:'<rect x="6" y="10" width="12" height="10" rx="2"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

export function createSimulationControls({host,clock,getLanguage,onChange=()=>{},onOverview=()=>{}}){
  const root=document.createElement('section');root.className='solar-simulation';
  const heading=document.createElement('h3'),row=document.createElement('div');row.className='solar-simulation-row';
  const toggle=document.createElement('button');toggle.type='button';toggle.id='simulation-play';
  const speed=document.createElement('select');speed.id='simulation-speed';
  for(const rate of RATES){const option=document.createElement('option');option.value=rate;speed.append(option);}
  row.append(toggle,speed);
  const stamp=document.createElement('time');stamp.className='simulation-date';
  const status=document.createElement('p');status.className='simulation-status';status.setAttribute('aria-live','polite');
  const now=document.createElement('button');now.type='button';now.className='simulation-now';
  const overview=document.createElement('button');overview.type='button';overview.className='simulation-overview';
  root.append(heading,row,stamp,status,now,overview);host.append(root);
  const railToggle=document.createElement('button');railToggle.type='button';railToggle.id='rail-simulation-toggle';railToggle.className='rail-button';
  const railIcon=document.createElement('span');railIcon.className='world-icon';
  const railLabel=document.createElement('span');railLabel.className='rail-button-label';railToggle.append(railIcon,railLabel);
  function mountRail(){document.querySelector('.relic-action-rail .rail-primary')?.append(railToggle);}
  window.addEventListener('relic-action-rail-mounted',mountRail);mountRail();
  const fr=()=>getLanguage()==='fr';let lastKey='';
  const changed=()=>{refresh(true);onChange();};
  for(const button of [toggle,railToggle])button.addEventListener('click',()=>{clock.toggle();changed();});
  speed.addEventListener('change',()=>{clock.setRate(Number(speed.value));changed();});
  now.addEventListener('click',()=>{clock.now();changed();});
  overview.addEventListener('click',()=>{onOverview();clock.play();changed();});
  function refresh(force=false){
    const state=clock.state,key=[getLanguage(),Math.floor(state.time/1000),state.rate,state.running,state.inspection,state.atEnd].join(':');
    if(!force&&key===lastKey)return;lastKey=key;
    heading.textContent=fr()?'Temps et mouvement':'Time and motion';
    const rates=fr()?['Temps réel · 1×','1 heure / s · 3 600×','1 jour / s · 86 400×','1 semaine / s · 604 800×','1 mois / s · 2 592 000×']:['Real time · 1×','1 hour / s · 3,600×','1 day / s · 86,400×','1 week / s · 604,800×','1 month / s · 2,592,000×'];
    [...speed.options].forEach((option,index)=>option.textContent=rates[index]);speed.value=String(state.rate);speed.disabled=state.inspection;
    speed.setAttribute('aria-label',fr()?'Vitesse de la simulation':'Simulation speed');
    const label=state.inspection?(fr()?'Vue figée':'View held still'):state.running?(fr()?'Mettre en pause':'Pause animation'):(fr()?'Reprendre l’animation':'Resume animation');
    const glyph=state.inspection?'lock':state.running?'pause':'play';
    toggle.innerHTML=icon(glyph);toggle.disabled=state.inspection;toggle.setAttribute('aria-label',label);toggle.title=label;
    railIcon.innerHTML=icon(glyph);railLabel.textContent=label;railToggle.disabled=state.inspection;railToggle.setAttribute('aria-label',label);railToggle.title=label;
    const date=clock.date;stamp.dateTime=date.toISOString();stamp.textContent=date.toLocaleString(fr()?'fr-FR':'en-GB',{dateStyle:'medium',timeStyle:'medium',timeZone:'UTC'})+' UTC';
    status.textContent=state.inspection?(fr()?'Position et rotation figées pendant l’exploration.':'Position and rotation stay fixed while exploring.'):state.atEnd?(fr()?'Fin de la plage disponible. Revenez à maintenant.':'End of the available date range. Return to now.'):state.running?(state.live?(fr()?'Temps réel · vitesse physique réelle. Le mouvement orbital est très lent à cette échelle.':'Real time · actual physical speed. Orbital motion is very slow at this scale.'):(fr()?'Simulation accélérée · date affichée ci-dessus.':'Accelerated simulation · date shown above.')):(fr()?'Simulation en pause':'Simulation paused');
    now.textContent=fr()?'Maintenant · temps réel':'Now · real time';now.disabled=state.inspection;
    overview.textContent=fr()?'Animer le Système solaire':'Animate the solar system';overview.hidden=!state.inspection;
    document.body.dataset.simulationDate=date.toISOString();document.body.dataset.simulationRate=String(state.rate);document.body.dataset.simulationState=state.inspection?'inspection':state.running?'playing':'paused';
  }
  refresh();
  return {refresh,dispose(){root.remove();railToggle.remove();window.removeEventListener('relic-action-rail-mounted',mountRail);}};
}
