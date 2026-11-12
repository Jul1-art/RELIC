import { getLanguage, onLanguageChange } from '../atlas/atlas-live.js?v=3';
import { worldIcon } from './world-icons.js';
import { worldThumbnail } from './world-thumbnails.js';
import { parseCoordinateQuery } from '../search/coordinateParser.js';
import { searchPlaces } from '../search/place-search.js';
import { navigateTo } from './navigation.js';

const BODIES = ['overview','sun','mercury','venus','earth','moon','mars','jupiter','saturn','uranus','neptune','67p'];
const NAMES = {
  en:{overview:'Solar system',sun:'Sun',mercury:'Mercury',venus:'Venus',earth:'Earth',moon:'Moon',mars:'Mars',jupiter:'Jupiter',saturn:'Saturn',uranus:'Uranus',neptune:'Neptune','67p':'67P · Rosetta'},
  fr:{overview:'Système solaire',sun:'Soleil',mercury:'Mercure',venus:'Vénus',earth:'Terre',moon:'Lune',mars:'Mars',jupiter:'Jupiter',saturn:'Saturne',uranus:'Uranus',neptune:'Neptune','67p':'67P · Rosetta'},
};
let instance;
const language = () => getLanguage() === 'fr' ? 'fr' : 'en';
const text = (en,fr) => language() === 'fr' ? fr : en;
const node = (tag,className) => Object.assign(document.createElement(tag),{className});

export function dashboardDestination(body) {
  if (body === 'earth') return new URL('../../pages/earth.html', import.meta.url);
  if (['mars','moon'].includes(body)) { const url=new URL('../../pages/terrain.html', import.meta.url);url.searchParams.set('body',body);return url; }
  const url=new URL('../../index.html', import.meta.url);
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
  const picker=node('div','pd-world-picker');
  const pickerLabel=node('span','pd-picker-label');
  const pickerValue=node('span','pd-picker-value');
  const pickerToggle=node('button','pd-world-trigger');pickerToggle.id='dashboard-world-trigger';pickerToggle.type='button';
  pickerToggle.setAttribute('aria-haspopup','listbox');pickerToggle.setAttribute('aria-controls','dashboard-world-list');pickerToggle.setAttribute('aria-expanded','false');
  const pickerIcon=node('span','pd-picker-icon');pickerIcon.innerHTML=worldIcon('globe');
  pickerToggle.append(pickerLabel,pickerValue,pickerIcon);
  const pickerList=node('div','pd-world-list');pickerList.id='dashboard-world-list';pickerList.setAttribute('role','listbox');pickerList.tabIndex=-1;pickerList.hidden=true;
  // Kept for host integrations; the user always sees the styled listbox above.
  const select=document.createElement('select');select.id='dashboard-world-select';select.name='world';select.hidden=true;select.tabIndex=-1;select.setAttribute('aria-hidden','true');
  picker.append(pickerToggle,pickerList,select);
  const worldOptions=new Map();
  for(const id of BODIES){
    const option=node('button','pd-world-option');option.type='button';option.id='dashboard-world-option-'+id;option.dataset.world=id;option.tabIndex=-1;option.setAttribute('role','option');
    const disc=node('span','pd-world-disc');disc.dataset.world=id;disc.setAttribute('aria-hidden','true');disc.innerHTML=worldThumbnail(id);
    const name=node('span','pd-world-name');const selected=node('span','pd-world-selected');selected.setAttribute('aria-hidden','true');
    option.append(disc,name,selected);pickerList.append(option);worldOptions.set(id,option);
  }
  const pickerNavigation=createWorldPickerNavigation({picker,toggle:pickerToggle,list:pickerList,options:worldOptions,
    getBody:()=>body,getNames:()=>NAMES[language()],onChoose:id=>{
      if(id===body)return;
      select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));
    },
  });
  const actions=originalHeader?.querySelector('.header-actions');
  if (actions) actions.before(picker);else header.append(picker);
  const scene=document.querySelector(atlas?'#scene':'#globe,#terrain-scene');
  if (scene) viewport.append(scene);
  if (atlas) {
    for (const element of document.querySelectorAll('#planet-labels,#imagery-credit,#gesture-hint')) viewport.append(element);
    const details=document.querySelector('#details');if(details)inspector.append(details);
    const dock=document.querySelector('.destinations');if(dock){dock.hidden=true;dock.dataset.dashboardLegacy='';header.append(dock);}
    // The world picker already returns to the solar system. Keep legacy nodes
    // connected for the atlas adapter, without retaining a second bottom rail.
    const toolbar=document.querySelector('.toolbar');
    if(toolbar){toolbar.hidden=true;toolbar.inert=true;toolbar.setAttribute('aria-hidden','true');header.append(toolbar);}
    footer.hidden=true;
  } else {
    for(const element of [...document.querySelectorAll('.vignette,.scene-vignette')])viewport.append(element);
    const panel=document.querySelector('.explorer-panel,.site-panel');if(panel)inspector.append(panel);
    const summary=document.querySelector('#site-summary');if(summary)inspector.append(summary);
    const drawer=document.querySelector('#map-options');if(drawer)inspector.append(drawer);
    const rail=document.querySelector('.earth-controls,.view-controls');if(rail)tools.append(rail);
    const move=document.querySelector('.move-pad');
    if(move){move.hidden=true;move.inert=true;move.setAttribute('aria-hidden','true');}
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
  if(atlas)command.append(panelButton);
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
    if(next==='overview')setPanel(false);else if(previous!==next&&!matchMedia('(max-width: 960px)').matches)setPanel(true);
    if(atlasSearch)atlasSearch.querySelector('input').placeholder=['overview','earth'].includes(next)?text('Search any location…','Rechercher un lieu…'):text('Enter latitude, longitude','Saisir latitude, longitude');
    render();
  }
  function render(){
    const selected=body;
    select.replaceChildren(...BODIES.map(id=>{const option=document.createElement('option');option.value=id;option.textContent=NAMES[language()][id];return option;}));select.value=selected;
    pickerLabel.textContent=text('WORLD','MONDE');pickerValue.textContent=NAMES[language()][selected];
    pickerToggle.setAttribute('aria-label',text('Choose a world: ','Choisir un monde : ')+NAMES[language()][selected]);
    pickerList.setAttribute('aria-label',text('Planets and moons','Planètes et lunes'));
    pickerNavigation.refresh();
    for(const [id,option] of worldOptions){option.querySelector('.pd-world-name').textContent=NAMES[language()][id];option.setAttribute('aria-selected',String(id===selected));}
    select.setAttribute('aria-label',text('Choose a planet or moon','Choisir une planète ou une lune'));
    panelButton.querySelector('span').textContent=text('View data','Données de la vue');
    panelButton.setAttribute('aria-label',open?text('Hide view data','Masquer les données'):text('Show view data','Afficher les données'));
    inspector.setAttribute('aria-label',text('World information and layers','Informations et couches du monde'));
    root.querySelector('[data-dashboard-copy=move]')?.replaceChildren(document.createTextNode(text('Move view','Déplacer la vue')));
    if(atlasSearch){atlasSearch.querySelector('[type=submit]').setAttribute('aria-label',text('Locate','Localiser'));atlasSearch.querySelector('input').setAttribute('aria-label',text('Search a place or coordinates','Rechercher un lieu ou des coordonnées'));}
  }
  select.addEventListener('change',()=>{
    const next=select.value;if(!BODIES.includes(next))return;pickerNavigation.close();
    const event=new CustomEvent('planet-dashboard-world',{detail:{body:next},cancelable:true});
    window.dispatchEvent(event);
    if(!event.defaultPrevented){select.value=body;navigateTo(dashboardDestination(next));}
  });
  panelButton.addEventListener('click',()=>{setPanel(!open);render();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&open&&matchMedia('(max-width: 960px)').matches&&!document.querySelector('dialog[open]')){setPanel(false);panelButton.focus();}});
  window.addEventListener('relic-world-selected',event=>setBody(event.detail?.body||event.detail?.id));
  window.addEventListener('planet-dashboard-panel',event=>{setPanel(event.detail?.open!==false);render();});
  onLanguageChange(()=>{setBody(body);render();});
  instance={element:root,viewport,inspector,search,select,setBody,setPanel,closePicker:pickerNavigation.close,setPickerInline:pickerNavigation.setInline,focusPicker:pickerNavigation.open};
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
    const input=document.createElement('input');input.type='search';input.maxLength=120;input.setAttribute('aria-label',text('Search a place or coordinates','Rechercher un lieu ou des coordonnées'));
    const submit=node('button','pd-locate');submit.type='submit';submit.textContent='🔎';submit.setAttribute('aria-label',text('Go to location','Aller au lieu'));
    const state=node('p','pd-search-state');state.setAttribute('role','status');
    const field=node('div','pd-atlas-field');field.append(submit,input);form.append(field,state);
    let request;
    function dismiss(){request?.abort();}
    function choose(place){
      const targetBody=body==='overview'?'earth':body;
      const event=new CustomEvent('planet-dashboard-location',{detail:{body:targetBody,...place},cancelable:true});window.dispatchEvent(event);
      dismiss();state.textContent='';
      if(!event.defaultPrevented&&['earth','mars','moon'].includes(targetBody)){
        const url=new URL('../../pages/terrain.html', import.meta.url);url.search=new URLSearchParams({body:targetBody,lat:String(place.lat),lon:String(place.lon)});navigateTo(url);
      }else if(!event.defaultPrevented){state.textContent=text('Coordinates selected','Coordonnées sélectionnées');}
    }
    form.addEventListener('submit',async event=>{
      event.preventDefault();request?.abort();request=new AbortController();const attempt=request;const term=input.value.trim();const coordinate=parseCoordinateQuery(term);
      if(coordinate){choose({...coordinate,range:3000,name:coordinate.label});return;}
      if(!['overview','earth'].includes(body)){state.textContent=text('Enter a latitude and longitude.','Saisissez une latitude et une longitude.');return;}
      if(term.length<3){state.textContent=text('Enter a place or coordinates.','Saisissez un lieu ou des coordonnées.');return;}
      state.textContent='';form.setAttribute('aria-busy','true');
      try{
        const searchBody=body;const places=await searchPlaces(term,{language:language(),signal:request.signal});
        if(request!==attempt||attempt.signal.aborted||body!==searchBody)return;
        if(places.length)choose(places[0]);else state.textContent=text('No matching place. Try coordinates.','Aucun lieu correspondant. Essayez des coordonnées.');
      }catch(error){if(error.name!=='AbortError')state.textContent=text('Try another place or coordinates.','Essayez un autre lieu ou des coordonnées.');}finally{if(request===attempt)form.removeAttribute('aria-busy');}
    });
    input.addEventListener('input',()=>{request?.abort();dismiss();state.textContent='';});
    form.addEventListener('dashboard-context-change',()=>{request?.abort();dismiss();state.textContent='';});
    document.addEventListener('pointerdown',event=>{if(!form.contains(event.target))dismiss();});
    return form;
  }
}

export function setDashboardBody(body){instance?.setBody(body);}

/** The dock owns the panel visibility; the ordinary header owns its dropdown.
 * Keeping these states separate avoids an empty Worlds panel after Tab. */
export function createWorldPickerNavigation({picker,toggle,list,options,getBody,getNames,onChoose,
  documentRef=document,frame=requestAnimationFrame}={}){
  const ids=[...options.keys()],listeners=[];
  let inline=false,open=false,active=0,find='',findTimer=0;
  const original={hidden:toggle.hidden,inert:toggle.inert,tabIndex:list.tabIndex};
  const listen=(target,type,handler)=>{target.addEventListener(type,handler);listeners.push([target,type,handler]);};
  function highlight(index){
    active=(index+ids.length)%ids.length;
    for(const [id,option] of options)option.classList.toggle('is-active',id===ids[active]);
    const option=options.get(ids[active]);
    if(option){list.setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'});}
  }
  function expose(value,returnFocus=false,focus=false){
    open=inline||Boolean(value);list.hidden=!open;toggle.setAttribute('aria-expanded',String(open));picker.dataset.open=String(open);
    if(open){
      highlight(Math.max(0,ids.indexOf(getBody())));
      if(focus)list.focus({preventScroll:true});
    }else{
      list.removeAttribute('aria-activedescendant');clearTimeout(findTimer);find='';
      if(returnFocus)toggle.focus({preventScroll:true});
    }
  }
  function setInline(value){
    inline=Boolean(value);picker.dataset.railInline=String(inline);
    toggle.hidden=inline||original.hidden;toggle.inert=inline||original.inert;
    list.tabIndex=inline?0:original.tabIndex;
    expose(inline);
  }
  function choose(id){expose(false,!inline);onChoose(id);}
  for(const [id,option] of options)listen(option,'click',()=>choose(id));
  listen(toggle,'click',()=>expose(!open,false,true));
  listen(toggle,'keydown',event=>{
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();expose(true,false,true);
    if(event.key==='Home')highlight(0);if(event.key==='End')highlight(ids.length-1);
  });
  listen(list,'keydown',event=>{
    if(event.key==='Escape'&&inline)return; // The dock handles Escape and restores its opener.
    if(['ArrowDown','ArrowUp','Home','End','Enter',' ','Escape'].includes(event.key)){
      event.preventDefault();event.stopPropagation();
      if(event.key==='Escape'){expose(false,true);return;}
      // A real click preserves adapter listeners and the dock's dismissal path,
      // including when the already selected world is chosen with the keyboard.
      if(event.key==='Enter'||event.key===' '){options.get(ids[active])?.click();return;}
      highlight(event.key==='Home'?0:event.key==='End'?ids.length-1:active+(event.key==='ArrowDown'?1:-1));
    }else if(event.key==='Tab'){if(!inline)expose(false);}
    else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      clearTimeout(findTimer);find+=event.key.toLocaleLowerCase();findTimer=setTimeout(()=>{find='';},550);
      const names=getNames(),start=active+1;
      for(let offset=0;offset<ids.length;offset++){
        const index=(start+offset)%ids.length;
        if(names[ids[index]].toLocaleLowerCase().startsWith(find)){highlight(index);break;}
      }
    }
  });
  listen(documentRef,'pointerdown',event=>{if(!inline&&open&&!picker.contains(event.target))expose(false);});
  listen(picker,'focusout',event=>{
    if(inline||event.relatedTarget&&picker.contains(event.relatedTarget))return;
    frame(()=>{if(!inline&&open&&!picker.contains(documentRef.activeElement))expose(false);});
  });
  listen(picker,'planet-dashboard-picker',event=>{
    if(typeof event.detail?.inline==='boolean')setInline(event.detail.inline);
    if(event.detail?.focus)expose(true,false,true);
  });
  return {setInline,open:()=>expose(true,false,true),close:()=>expose(false),
    refresh(){if(open)highlight(Math.max(0,ids.indexOf(getBody())));},
    dispose(){clearTimeout(findTimer);for(const [target,type,handler] of listeners)target.removeEventListener(type,handler);},
  };
}
