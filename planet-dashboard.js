import { getLanguage, onLanguageChange } from './atlas-live.js?v=3';
import { worldIcon } from './world-icons.js';
import { parseCoordinateQuery } from './earth-search/coordinateParser.js';
import { searchPlaces } from './place-search.js';
import { navigateTo } from './navigation.js';

const BODIES = ['overview','sun','mercury','venus','earth','moon','mars','jupiter','saturn','uranus','neptune'];
const NAMES = {
  en:{overview:'Solar system',sun:'Sun',mercury:'Mercury',venus:'Venus',earth:'Earth',moon:'Moon',mars:'Mars',jupiter:'Jupiter',saturn:'Saturn',uranus:'Uranus',neptune:'Neptune'},
  fr:{overview:'Système solaire',sun:'Soleil',mercury:'Mercure',venus:'Vénus',earth:'Terre',moon:'Lune',mars:'Mars',jupiter:'Jupiter',saturn:'Saturne',uranus:'Uranus',neptune:'Neptune'},
};
let instance;
const language = () => getLanguage() === 'fr' ? 'fr' : 'en';
const text = (en,fr) => language() === 'fr' ? fr : en;
const node = (tag,className) => Object.assign(document.createElement(tag),{className});

export function dashboardDestination(body) {
  if (body === 'earth') return new URL('./earth.html',import.meta.url);
  if (['mars','moon'].includes(body)) { const url=new URL('./terrain.html',import.meta.url);url.searchParams.set('body',body);return url; }
  const url=new URL('./index.html',import.meta.url);
  if (body !== 'overview') url.searchParams.set('body',body);
  return url;
}

/** One layout and one set of regions, shared by every planetary renderer. */
export function initializePlanetDashboard(options = {}) {
  if (instance) return instance;
  const atlas = options.view === 'atlas' || document.body.classList.contains('atlas-page');
  const surface = document.body.classList.contains('relic-world');
  if (!atlas && !surface) return null;
  const query=new URL(location.href).searchParams;
  let body=options.body || (atlas ? query.get('body') || 'overview' : document.body.classList.contains('earth-page') ? 'earth' : query.get('body') || 'earth');
  if (!BODIES.includes(body)) body=atlas?'overview':'earth';
  const root=node('div','planet-dashboard');root.dataset.dashboardView=atlas?'atlas':'surface';
  const header=node('div','pd-header');header.dataset.dashboardRegion='header';
  const command=node('div','pd-command');command.dataset.dashboardRegion='search';
  const workspace=node('main','pd-workspace');
  const viewport=node('div','pd-viewport');viewport.dataset.dashboardRegion='viewport';
  const inspector=node('aside','pd-inspector');inspector.id='planet-dashboard-inspector';inspector.dataset.dashboardRegion='inspector';
  const footer=node('div','pd-footer');footer.dataset.dashboardRegion='controls';
  const tools=node('div','pd-tools');
  const panelButton=node('button','pd-inspector-toggle');panelButton.type='button';panelButton.setAttribute('aria-controls',inspector.id);
  panelButton.innerHTML=worldIcon('sliders')+'<span></span>';
  footer.append(tools,panelButton);workspace.append(viewport,inspector);root.append(header,command,workspace,footer);
  const originalHeader=document.querySelector(atlas?'.topbar':'.earth-topbar,.topbar');
  const originalNavigation=originalHeader?.querySelector('.world-nav');
  if (originalNavigation) { originalNavigation.hidden=true;originalNavigation.dataset.dashboardLegacy=''; }
  if (originalHeader) header.append(originalHeader);
  const picker=node('label','pd-world-picker');
  const pickerLabel=node('span','pd-picker-label');
  const select=document.createElement('select');select.id='dashboard-world-select';select.name='world';
  const pickerIcon=node('span','pd-picker-icon');pickerIcon.innerHTML=worldIcon('chevron-down');
  picker.append(pickerLabel,select,pickerIcon);
  const actions=originalHeader?.querySelector('.header-actions');
  if (actions) actions.before(picker);else header.append(picker);
  const scene=document.querySelector(atlas?'#scene':'#globe,#terrain-scene');
  if (scene) viewport.append(scene);
  if (atlas) {
    for (const element of document.querySelectorAll('#planet-labels,#imagery-credit,#gesture-hint')) viewport.append(element);
    const details=document.querySelector('#details');if(details)inspector.append(details);
    const dock=document.querySelector('.destinations');if(dock){dock.hidden=true;dock.dataset.dashboardLegacy='';header.append(dock);}
    const toolbar=document.querySelector('.toolbar');if(toolbar)tools.append(toolbar);
  } else {
    for(const element of [...document.querySelectorAll('.vignette,.scene-vignette')])viewport.append(element);
    const panel=document.querySelector('.explorer-panel,.site-panel');if(panel)inspector.append(panel);
    const summary=document.querySelector('#site-summary');if(summary)inspector.append(summary);
    const drawer=document.querySelector('#map-options');if(drawer)inspector.append(drawer);
    const rail=document.querySelector('.earth-controls,.view-controls');if(rail)tools.append(rail);
    const move=document.querySelector('.move-pad');
    if(move){const section=node('section','pd-movement');const title=node('h2','pd-section-title');title.dataset.dashboardCopy='move';section.append(title,move);inspector.append(section);}
  }
  // Loading and provider credits stay attached to the viewport they describe.
  for(const element of [...document.querySelectorAll('#earth-loading,#loading,#earth-error,#error,#error-screen,.earth-attribution,.scene-credit,.esri-attribution,#cesium-credits')]) {
    if(element.closest('#intro'))continue;
    viewport.append(element);
  }
  let search=document.querySelector('#place-form');
  let atlasSearch;
  if(!search && atlas){search=createAtlasSearch();atlasSearch=search;}
  if(search){search.dataset.dashboardSearch='persistent';command.append(search);const content=search.querySelector('#search-content');if(content)content.inert=false;search.classList.add('expanded');}
  const commandLabel=node('p','pd-command-context');commandLabel.dataset.dashboardCopy='context';command.append(commandLabel);
  for(const oldMain of [...document.body.children].filter(element=>element.tagName==='MAIN')){
    for(const hint of oldMain.querySelectorAll('.nav-hint'))viewport.append(hint);
    if(!oldMain.children.length)oldMain.remove();
  }
  document.body.prepend(root);document.body.classList.add('has-planet-dashboard');
  let open=!matchMedia('(max-width: 960px)').matches;
  function setPanel(value){open=Boolean(value)&&body!=='overview';root.dataset.panelOpen=String(open);panelButton.setAttribute('aria-expanded',String(open));panelButton.setAttribute('aria-label',open?text('Hide view data','Masquer les données'):text('Show view data','Afficher les données'));inspector.inert=!open;}
  function setBody(next){
    if(!BODIES.includes(next))return;
    const previous=body;body=next;if(previous!==next)atlasSearch?.dispatchEvent(new Event('dashboard-context-change'));document.body.dataset.dashboardBody=next;root.dataset.dashboardBody=next;select.value=next;
    commandLabel.textContent=atlas&&next==='overview'?text('Choose a world to explore','Choisissez un monde à explorer'):text('Explore your current world','Explorez votre monde');
    panelButton.hidden=next==='overview';
    if(next==='overview')setPanel(false);else if(!matchMedia('(max-width: 960px)').matches)setPanel(true);
    if(atlasSearch)atlasSearch.querySelector('input').placeholder=['overview','earth'].includes(next)?text('Search a place or enter coordinates','Rechercher un lieu ou saisir des coordonnées'):text('Enter latitude, longitude','Saisir latitude, longitude');
    render();
  }
  function render(){
    const selected=body;
    select.replaceChildren(...BODIES.map(id=>{const option=document.createElement('option');option.value=id;option.textContent=NAMES[language()][id];return option;}));select.value=selected;
    pickerLabel.textContent=text('WORLD','MONDE');
    select.setAttribute('aria-label',text('Choose a planet or moon','Choisir une planète ou une lune'));
    panelButton.querySelector('span').textContent=text('View data','Données de la vue');
    panelButton.setAttribute('aria-label',open?text('Hide view data','Masquer les données'):text('Show view data','Afficher les données'));
    inspector.setAttribute('aria-label',text('World information and layers','Informations et couches du monde'));
    root.querySelector('[data-dashboard-copy=move]')?.replaceChildren(document.createTextNode(text('Move view','Déplacer la vue')));
    if(atlasSearch){atlasSearch.querySelector('[type=submit]').setAttribute('aria-label',text('Locate','Localiser'));atlasSearch.querySelector('input').setAttribute('aria-label',text('Search a place or coordinates','Rechercher un lieu ou des coordonnées'));}
  }
  select.addEventListener('change',()=>{
    const next=select.value;
    const event=new CustomEvent('planet-dashboard-world',{detail:{body:next},cancelable:true});
    window.dispatchEvent(event);
    if(!event.defaultPrevented)navigateTo(dashboardDestination(next));
  });
  panelButton.addEventListener('click',()=>{setPanel(!open);render();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&open&&matchMedia('(max-width: 960px)').matches&&!document.querySelector('dialog[open]')){setPanel(false);panelButton.focus();}});
  window.addEventListener('relic-world-selected',event=>setBody(event.detail?.body||event.detail?.id));
  window.addEventListener('planet-dashboard-panel',event=>{setPanel(event.detail?.open!==false);render();});
  onLanguageChange(()=>{setBody(body);render();});
  instance={element:root,viewport,inspector,search,select,setBody,setPanel};
  setBody(body);setPanel(open);render();
  window.dispatchEvent(new CustomEvent('planet-dashboard-mounted',{detail:{view:atlas?'atlas':'surface',body}}));
  let resizeFrame=0;
  if(typeof ResizeObserver==='function'){
    let width=-1,height=-1;
    const observer=new ResizeObserver(()=>{
      if(viewport.clientWidth===width&&viewport.clientHeight===height)return;
      width=viewport.clientWidth;height=viewport.clientHeight;cancelAnimationFrame(resizeFrame);
      resizeFrame=requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
    });
    observer.observe(viewport);
  }
  requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
  return instance;

  function createAtlasSearch(){
    const form=node('form','pd-atlas-search');form.setAttribute('role','search');form.autocomplete='off';
    const glyph=node('span','pd-search-icon');glyph.innerHTML=worldIcon('magnifying-glass');
    const input=document.createElement('input');input.type='search';input.maxLength=120;input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');input.setAttribute('aria-controls','dashboard-search-results');input.setAttribute('aria-label',text('Search a place or coordinates','Rechercher un lieu ou des coordonnées'));
    const submit=node('button','pd-locate');submit.type='submit';submit.innerHTML=worldIcon('arrow-right');
    const state=node('p','pd-search-state');state.setAttribute('role','status');
    const results=node('div','pd-search-results');results.id='dashboard-search-results';results.setAttribute('role','listbox');results.hidden=true;
    form.append(glyph,input,submit,state,results);
    let request,active=-1;
    function dismiss(){results.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
    function choose(place){
      const targetBody=body==='overview'?'earth':body;
      const event=new CustomEvent('planet-dashboard-location',{detail:{body:targetBody,...place},cancelable:true});window.dispatchEvent(event);
      dismiss();state.textContent='';
      if(!event.defaultPrevented&&['earth','mars','moon'].includes(targetBody)){
        const url=new URL('./terrain.html',import.meta.url);url.search=new URLSearchParams({body:targetBody,lat:String(place.lat),lon:String(place.lon)});navigateTo(url);
      }else if(!event.defaultPrevented){state.textContent=text('Coordinates selected','Coordonnées sélectionnées');}
    }
    form.addEventListener('submit',async event=>{
      event.preventDefault();request?.abort();request=new AbortController();const attempt=request;const term=input.value.trim();const coordinate=parseCoordinateQuery(term);
      if(coordinate){choose({...coordinate,range:3000,name:coordinate.label});return;}
      if(!['overview','earth'].includes(body)){state.textContent=text('Enter a latitude and longitude.','Saisissez une latitude et une longitude.');return;}
      if(term.length<3){state.textContent=text('Enter a place or coordinates.','Saisissez un lieu ou des coordonnées.');return;}
      state.textContent=text('Searching…','Recherche…');
      try{
        const searchBody=body;const places=await searchPlaces(term,{language:language(),signal:request.signal});
        if(request!==attempt||attempt.signal.aborted||body!==searchBody)return;
        results.replaceChildren();
        for(const place of places){const button=document.createElement('button');button.type='button';button.id='dashboard-place-'+results.children.length;button.setAttribute('role','option');button.setAttribute('aria-selected','false');button.textContent=place.name+(place.detail?' · '+place.detail:'');button.addEventListener('click',()=>choose(place));results.append(button);}
        active=-1;results.hidden=!places.length;input.setAttribute('aria-expanded',String(Boolean(places.length)));input.removeAttribute('aria-activedescendant');state.textContent=places.length?'':text('No matching place. Try coordinates.','Aucun lieu correspondant. Essayez des coordonnées.');
      }catch(error){if(error.name!=='AbortError')state.textContent=text('Try another place or coordinates.','Essayez un autre lieu ou des coordonnées.');}
    });
    form.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismiss();state.textContent='';}
      if(event.target!==input||results.hidden)return;
      const items=[...results.querySelectorAll('button')];if(!items.length)return;
      if(['ArrowDown','ArrowUp'].includes(event.key)){
        event.preventDefault();active=(active+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
        items.forEach((item,index)=>item.setAttribute('aria-selected',String(index===active)));
        input.setAttribute('aria-activedescendant',items[active].id);items[active].scrollIntoView({block:'nearest'});
      }else if(event.key==='Enter'&&active>=0){event.preventDefault();items[active].click();}
    });
    input.addEventListener('input',()=>{request?.abort();dismiss();state.textContent='';});
    form.addEventListener('dashboard-context-change',()=>{request?.abort();dismiss();state.textContent='';});
    document.addEventListener('pointerdown',event=>{if(!form.contains(event.target))dismiss();});
    return form;
  }
}

export function setDashboardBody(body){instance?.setBody(body);}
