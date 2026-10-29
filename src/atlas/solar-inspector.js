/** One selected world, its measured dimensions and its complete satellite list. */
export function createSolarInspector({host,getLanguage,getBody,getSystems,onSelect,onFrame,onSurface,onLocation,sitesByBody={}}) {
  const root=document.createElement('section');root.className='solar-inspector';host.append(root);
  const fr=()=>getLanguage()==='fr';
  const number=(value,digits=1)=>Number(value).toLocaleString(fr()?'fr-FR':'en-GB',{maximumFractionDigits:digits});
  let current='overview';
  const button=(text,callback)=>{const node=document.createElement('button');node.type='button';node.textContent=text;node.addEventListener('click',callback);return node;};
  function render(id=current){
    current=id;root.replaceChildren();root.hidden=id==='overview';if(root.hidden)return;
    const detail=getBody(id);if(!detail)return;
    const description=document.createElement('p');description.className='solar-body-description';description.textContent=detail.description||'';root.append(description);
    const facts=document.createElement('dl');facts.className='solar-facts';
    const fact=(label,value)=>{const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);facts.append(row);};
    if(Number.isFinite(detail.radiusKm))fact(fr()?'Diamètre':'Diameter',number(detail.radiusKm*2)+' km');
    if(Number.isFinite(detail.aKm))fact(fr()?'Demi-grand axe':'Semi-major axis',number(detail.aKm,0)+' km');
    if(Number.isFinite(detail.periodDays))fact(fr()?'Période orbitale':'Orbital period',number(Math.abs(detail.periodDays),3)+(fr()?' jours':' days'));
    if(Number.isFinite(detail.inclinationDeg))fact(fr()?'Inclinaison orbitale':'Orbital inclination',number(detail.inclinationDeg,3)+'°');
    if(Number.isFinite(detail.e))fact(fr()?'Excentricité':'Eccentricity',number(detail.e,5));
    root.append(facts);
    const systems=getSystems();const parent=systems?.getParent(id)||id;
    const actions=document.createElement('div');actions.className='solar-system-actions';
    if(parent!==id)actions.append(button((fr()?'Retour à ':'Back to ')+(getBody(parent)?.name||parent),()=>onSelect(parent)));
    if(['earth','moon','mars'].includes(id))actions.append(button(fr()?'Explorer la surface':'Explore the surface',()=>onSurface(id)));
    const rows=systems?.getSatellites(parent)||[];
    if(rows.length){
      actions.append(button(fr()?'Lunes proches':'Inner moons',()=>onFrame(parent,true)),button(fr()?'Toutes les orbites':'All satellite orbits',()=>onFrame(parent,false)));
    }
    for(const site of sitesByBody[id]||[]){
      const label=site.id==='jezero'?'Jezero · HiRISE':site.id==='apollo11'?'Apollo 11 · LROC':site.name;
      actions.append(button(label,()=>onLocation?.(id,site.lat,site.lon,site.local?2:250)));
    }
    root.append(actions);
    const scale=document.createElement('p');scale.className='solar-model-note';
    scale.textContent=fr()?'Distances solaires proportionnelles ; corps agrandis pour rester repérables. Chaque système de lunes utilise sa propre échelle locale et les éléments orbitaux moyens JPL.':'Proportional solar distances; bodies enlarged for visibility. Each moon system uses its own local scale and JPL mean orbital elements.';
    root.append(scale);
    if(detail.modelNote){const p=document.createElement('p');p.className='solar-model-note';p.textContent=detail.modelNote;root.append(p);}
    const source=document.createElement('a');source.className='solar-source';source.href='https://ssd.jpl.nasa.gov/sats/elem/';source.target='_blank';source.rel='noopener noreferrer';source.textContent=fr()?'Éléments orbitaux · NASA/JPL':'Orbital elements · NASA/JPL';root.append(source);
    if(!systems){const loading=document.createElement('p');loading.textContent=fr()?'Chargement des satellites…':'Loading satellites…';root.append(loading);return;}
    if(id==='sun')return;
    const section=document.createElement('section');section.className='solar-moon-catalogue';
    const heading=document.createElement('h3');heading.textContent=fr()?`Satellites naturels · ${rows.length}`:`Natural satellites · ${rows.length}`;section.append(heading);
    if(!rows.length){const none=document.createElement('p');none.textContent=fr()?'Aucun satellite naturel connu.':'No known natural satellites.';section.append(none);root.append(section);return;}
    const input=document.createElement('input');input.type='search';input.placeholder=fr()?'Nom ou désignation…':'Name or designation…';input.setAttribute('aria-label',fr()?'Rechercher un satellite naturel':'Find a natural satellite');section.append(input);
    const count=document.createElement('p');count.className='solar-moon-count';count.setAttribute('aria-live','polite');section.append(count);
    const list=document.createElement('ul');list.className='solar-moon-list';section.append(list);
    let shown=24;const more=button(fr()?'Afficher davantage':'Show more',()=>{shown+=40;populate();});more.className='solar-show-more';section.append(more);
    function populate(){
      const query=input.value.trim().toLocaleLowerCase();
      const filtered=rows.filter(row=>[row.name,row.id,...(row.aliases||[])].join(' ').toLocaleLowerCase().includes(query));
      list.replaceChildren();
      for(const row of filtered.slice(0,shown)){
        const li=document.createElement('li');const entry=button(row.name,()=>onSelect(row.id));entry.setAttribute('aria-label',(fr()?'Explorer ':'Explore ')+row.name);entry.className='solar-moon-entry';
        const body=getBody(row.id)||row;const meta=document.createElement('span');meta.className='solar-moon-meta';
        meta.textContent=Number.isFinite(body.radiusKm)?`Ø ${number(body.radiusKm*2)} km`:fr()?'Dimensions non mesurées':'Dimensions unmeasured';entry.append(meta);li.append(entry);list.append(li);
      }
      count.textContent=fr()?`${filtered.length} satellite${filtered.length>1?'s':''}`:`${filtered.length} satellite${filtered.length===1?'':'s'}`;
      more.hidden=shown>=filtered.length;
    }
    input.addEventListener('input',()=>{shown=24;populate();});populate();root.append(section);
  }
  return {render,element:root};
}
