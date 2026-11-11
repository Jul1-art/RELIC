import { getLanguage, onLanguageChange } from '../atlas/atlas-live.js?v=3';
import { worldIcon } from './world-icons.js';

const COPY = {
  en: {navigation:'Exploration',worlds:'Worlds',search:'Search',information:'View information',reset:'Reset view',more:'More actions',close:'Close',menu:'Controls',view:'View',replay:'Watch the film',sources:'Sources and creators',settings:'Settings',language:'Language',searchTitle:'Search',worldsTitle:'Worlds',closeInformation:'Close information',selectWorld:'Select a world to see its information',light:'Switch to light mode',dark:'Switch to dark mode',home:'Solar system',tiltAction:'Change viewing angle',heightAction:'Change terrain exaggeration',northAction:'North up',worldsDescription:'',searchPlaces:'Find a place on Earth, or enter coordinates.',searchCoordinates:'Enter coordinates to explore this world.',searchSites:'Find a NASA site or enter coordinates.',moreDescription:'Your view, time and preferences.',worldsShort:'Worlds',searchShort:'Search',informationShort:'Info',moreShort:'More',lightShort:'Light',darkShort:'Dark'},
  fr: {navigation:'Exploration',worlds:'Mondes',search:'Rechercher',information:'Informations de la vue',reset:'Recentrer la vue',more:'Autres actions',close:'Fermer',menu:'Commandes',view:'Vue',replay:'Revoir le film',sources:'Sources et créateurs',settings:'Réglages',language:'Langue',searchTitle:'Rechercher',worldsTitle:'Mondes',closeInformation:'Fermer les informations',selectWorld:'Sélectionner un monde pour voir ses informations',light:'Passer en mode clair',dark:'Passer en mode sombre',home:'Système solaire',tiltAction:'Changer l’angle de vue',heightAction:'Changer l’amplification du relief',northAction:'Orienter le nord en haut',worldsDescription:'',searchPlaces:'Trouvez un lieu sur Terre ou saisissez des coordonnées.',searchCoordinates:'Saisissez des coordonnées pour explorer ce monde.',searchSites:'Trouvez un site NASA ou saisissez des coordonnées.',moreDescription:'La vue, le temps et vos préférences.',worldsShort:'Mondes',searchShort:'Recherche',informationShort:'Infos',moreShort:'Plus',lightShort:'Clair',darkShort:'Sombre'},
};
let instance;
const element = (tag, className) => Object.assign(document.createElement(tag), {className});
const rootURL = new URL('../../index.html', import.meta.url);
const RAIL_GLYPHS={
  globe:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c4 4.6 4 12.4 0 17M12 3.5c-4 4.6-4 12.4 0 17"/>',
  'magnifying-glass':'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.4 15.4 4.8 4.8"/>',
  'circle-info':'<circle cx="12" cy="12" r="8.5"/><path d="M12 10.5v6M12 7.25v.1"/>',
  sliders:'<path d="M4 6h3m5 0h8M4 12h9m5 0h2M4 18h2m5 0h9"/><circle cx="9.5" cy="6" r="2.5"/><circle cx="15.5" cy="12" r="2.5"/><circle cx="8.5" cy="18" r="2.5"/>',
  xmark:'<path d="m6.5 6.5 11 11m0-11-11 11"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42m0-14.14-1.42 1.42m-11.3 11.3-1.42 1.42"/>',
  moon:'<path d="M20.2 15.1A8.7 8.7 0 0 1 8.9 3.8a8.7 8.7 0 1 0 11.3 11.3Z"/>',
};
const railGlyph=name=>RAIL_GLYPHS[name]?`<svg class="rail-glyph" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${RAIL_GLYPHS[name]}</svg>`:worldIcon(name);

/** Rehouse the working dashboard controls without replacing their adapters. */
export function initializeActionRail() {
  if (instance) return instance;
  const dashboard = document.querySelector('.planet-dashboard');
  if (!dashboard) return null;
  const atlas = document.body.classList.contains('atlas-page');
  const picker = dashboard.querySelector('.pd-world-picker');
  const command = dashboard.querySelector('.pd-command');
  const inspector = dashboard.querySelector('.pd-inspector');
  const actions = dashboard.querySelector('.header-actions');
  const brand = dashboard.querySelector('.identity,.back-link');
  const information = dashboard.querySelector('.pd-inspector-toggle');
  if (!picker || !command || !inspector || !information) return null;
  const shell = element('div','relic-action-shell');
  shell.dataset.open = 'none';
  const rail = element('nav','relic-action-rail');
  rail.id = 'relic-action-rail';
  rail.dataset.compact = 'true';
  const primary = element('div','rail-primary');
  const utility = element('div','rail-utility');
  const panel = element('section','relic-action-panel');
  panel.id = 'relic-action-panel';
  panel.hidden = true;
  panel.inert = true;
  const heading = element('div','rail-panel-heading');
  const handle=element('div','rail-sheet-handle');handle.setAttribute('aria-hidden','true');
  const headingCopy=element('div','rail-panel-heading-copy');
  const title = element('h2','rail-panel-title');
  title.id = 'rail-panel-title';
  panel.setAttribute('aria-labelledby',title.id);
  const description=element('p','rail-panel-description');description.id='rail-panel-description';
  panel.setAttribute('aria-describedby',description.id);
  const shortcut=element('kbd','rail-shortcut');shortcut.textContent='esc';shortcut.setAttribute('aria-hidden','true');
  headingCopy.append(title,description);heading.append(handle,headingCopy,shortcut);
  const worlds = element('div','rail-worlds');
  worlds.append(picker);
  const menu = element('div','rail-menu');
  const view = element('section','rail-view');
  const viewTitle = element('h3','rail-section-title');
  viewTitle.dataset.railCopy = 'view';
  view.append(viewTitle);
  const menuActions = element('div','rail-menu-actions');
  const menuViews = {worlds,search:command,more:menu};
  let active = '', opener, closeTimer=0, revealFrame=0, focusFrame=0, disclosureMotion;
  let inspection=null,inspectionPromise=null;
  const worldButton = iconButton('rail-worlds','globe','worlds');
  const searchButton = iconButton('rail-search','magnifying-glass','search');
  const moreButton = iconButton('rail-more','gear','settings');
  moreButton.dataset.appSettings='';
  moreButton.setAttribute('aria-haspopup','dialog');
  moreButton.setAttribute('aria-controls','relic-app-settings');
  moreButton.addEventListener('click',()=>show(''));
  const themeButton = element('button','rail-button rail-theme-action');
  themeButton.type = 'button';themeButton.id = 'rail-theme';themeButton.dataset.themeToggle = '';
  themeButton.innerHTML = railGlyph('sun')+railGlyph('moon')+'<span class="rail-button-label"></span>';
  for (const button of [worldButton,searchButton]) {
    button.setAttribute('aria-controls',panel.id);
    button.setAttribute('aria-expanded','false');
  }
  if (brand) { brand.classList.add('rail-brand'); brand.dataset.railLabel=COPY[getLanguage()==='fr'?'fr':'en'].home;rail.append(brand); }
  rail.append(primary,utility);
  primary.append(worldButton);
  information.classList.add('rail-button');
  information.dataset.railCopy = 'information';
  information.querySelector('span:not(.world-icon)')?.classList.add('rail-button-label');
  information.querySelector('svg')?.remove();
  information.insertAdjacentHTML('afterbegin',railGlyph('circle-info'));
  information.hidden=true;
  const reset = dashboard.querySelector(atlas ? '#overview-button' : '#reset-view,#reset-button');
  if (reset) {
    reset.classList.add('rail-button');
    reset.dataset.railCopy = atlas?'home':'reset';
    reset.querySelector('span:not(.world-icon)')?.classList.add('rail-button-label');
    reset.hidden=false;
    reset.querySelector('.world-icon,svg')?.remove();
    reset.insertAdjacentHTML('afterbegin',worldIcon('rotate'));
    view.append(reset);
  }
  // Exploration and utility actions have separate visual groups. Appearance
  // stays directly accessible, including while inspecting a world.
  utility.append(moreButton,themeButton);
  const contextControls = dashboard.querySelector('.earth-controls,.view-controls');
  if (contextControls?.children.length) view.append(contextControls);
  const earth3D = dashboard.querySelector('.google3d-control');
  if (earth3D) view.append(earth3D);
  view.hidden=true;view.inert=true;
  if (view.children.length > 1) menu.append(view);
  if (actions) { menuActions.append(actions); menu.append(menuActions); }
  if (!atlas) {
    const replay = element('a','rail-menu-film');
    const url = new URL(rootURL); url.searchParams.set('film','1');
    replay.href = url.href;
    replay.dataset.railCopy = 'replay';
    replay.innerHTML = worldIcon('film')+'<span></span>';
    menuActions.prepend(replay);
  }
  let credits=document.getElementById('relic-credits');
  if(!credits){
    credits=iconButton('rail-credits','circle-info','sources');
    credits.addEventListener('click',()=>{void import('./app-sources.js').then(({openSources})=>openSources(credits));});
  }
  credits.classList.add('rail-button');credits.dataset.railCopy='sources';
  credits.innerHTML=worldIcon('circle-info')+'<span class="rail-button-label"></span>';
  credits.hidden=false;
  credits.addEventListener('click',()=>show(''));
  primary.append(credits);
  panel.append(heading,worlds,command,menu);
  shell.append(rail,panel);
  document.body.append(shell);
  const inspectorClose = iconButton('rail-inspector-close','xmark','closeInformation');
  inspectorClose.classList.add('rail-inspector-close');
  inspector.prepend(inspectorClose);
  inspectorClose.addEventListener('click',()=>{setInformation(false); information.focus({preventScroll:true});});
  const triggers = {worlds:worldButton,search:searchButton};
  for (const [name,button] of Object.entries(triggers)) button.addEventListener('click',()=>show(active===name?'':name,button));
  information.addEventListener('click',()=>show(''));
  reset?.addEventListener('click',()=>show(''));
  rail.addEventListener('keydown',event=>{
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const buttons=[...rail.querySelectorAll('button,a[href]')].filter(node=>!node.disabled&&!node.hidden&&node.getClientRects().length);
    const index=buttons.indexOf(document.activeElement);if(index<0)return;
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(['ArrowUp','ArrowLeft'].includes(event.key)?-1:1)+buttons.length)%buttons.length;
    event.preventDefault();event.stopPropagation();buttons[next].focus({preventScroll:true});
  });
  picker.addEventListener('click',event=>{
    if (event.target.closest('.pd-world-option')) show('',worldButton,true);
  });
  command.addEventListener('click',event=>{
    if (event.target.closest('.place-search-results [role=option],.pd-search-results [role=option]')) show('',searchButton,true);
  });
  menuActions.addEventListener('click',event=>{
    // Let document-level settings handlers open their dialog before the menu
    // becomes inert. Otherwise delegation treats the clicked button as inert.
    if (event.target.closest('#relic-replay,#relic-credits,[data-app-settings]')) setTimeout(()=>show(''),0);
  });
  document.addEventListener('pointerdown',event=>{
    if (active && !shell.contains(event.target)) show('');
  });
  document.addEventListener('keydown',event=>{
    if (event.defaultPrevented || document.querySelector('dialog[open]') || filmActive()) return;
    if (event.key === 'Escape') {
      if (active) { event.preventDefault(); event.stopPropagation(); show('',null,true); }
      else if (!inspectionActive() && dashboard.dataset.panelOpen === 'true') { event.preventDefault(); event.stopPropagation(); setInformation(false); information.focus({preventScroll:true}); }
    } else if (((event.key === '/' && !event.ctrlKey && !event.altKey && !event.metaKey)
      || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'))
      && !event.target.closest('input,textarea,select,[contenteditable=true]')) {
      event.preventDefault(); event.stopPropagation();
      if(inspectionActive())inspection.openLocation(searchButton);else show('search',searchButton);
    }
  },{capture:true});
  const replay = document.getElementById('relic-replay');
  if (atlas && replay) {
    // The atlas adapter hides its old header shortcut in close views. The
    // unified menu offers the film from every world, using the same listener.
    replay.hidden = false;
    new MutationObserver(()=>{if (replay.hidden) replay.hidden=false;})
      .observe(replay,{attributes:true,attributeFilter:['hidden']});
  }
  for(const type of ['planet-dashboard-location','relic-place-selected'])window.addEventListener(type,()=>queueMicrotask(()=>{if(active==='search')show('',searchButton,true);}));
  // Dialog actions are delegated by their own modules. Restore the dock only
  // when that dialog has left focus without a usable return target.
  document.addEventListener('close',event=>{
    if(event.target.tagName!=='DIALOG')return;
    requestAnimationFrame(()=>{
      const focused=document.activeElement;
      if(!filmActive()&&!shell.inert&&(focused===document.body||!focused?.isConnected||focused.closest?.('[inert]')))(opener||moreButton).focus({preventScroll:true});
    });
  },true);
  const updateViewport=()=>{
    const viewport=window.visualViewport,visibleHeight=viewport?.height||window.innerHeight;
    const offset=Math.max(0,window.innerHeight-visibleHeight-(viewport?.offsetTop||0));
    shell.style.setProperty('--rail-viewport-height',`${visibleHeight}px`);
    shell.style.setProperty('--rail-keyboard-offset',`${offset}px`);
    shell.dataset.keyboard=String(offset>120&&Boolean(command.querySelector('input:focus')));
  };
  window.visualViewport?.addEventListener('resize',updateViewport);
  window.visualViewport?.addEventListener('scroll',updateViewport);
  window.addEventListener('resize',updateViewport);
  command.addEventListener('focusin',updateViewport);command.addEventListener('focusout',()=>requestAnimationFrame(updateViewport));
  updateViewport();
  let sheetDrag;
  heading.addEventListener('pointerdown',event=>{
    if(panel.dataset.attached==='true'||event.pointerType!=='touch'||event.target.closest('button')||!matchMedia('(max-width:700px) and (min-height:521px)').matches)return;
    sheetDrag={id:event.pointerId,x:event.clientX,y:event.clientY};heading.setPointerCapture?.(event.pointerId);
  });
  heading.addEventListener('pointermove',event=>{
    if(sheetDrag?.id!==event.pointerId)return;
    const delta=Math.max(0,event.clientY-sheetDrag.y);
    panel.dataset.dragging='true';panel.style.setProperty('--rail-drag-y',`${Math.min(150,delta)}px`);
  });
  const endSheetDrag=event=>{
    if(sheetDrag?.id!==event.pointerId)return;
    const dismiss=event.type!=='pointercancel'&&event.clientY-sheetDrag.y>72&&Math.abs(event.clientX-sheetDrag.x)<90;
    sheetDrag=null;delete panel.dataset.dragging;panel.style.removeProperty('--rail-drag-y');
    if(dismiss)show('',null,true);
  };
  heading.addEventListener('pointerup',endSheetDrag);heading.addEventListener('pointercancel',endSheetDrag);
  let currentBody = dashboard.dataset.dashboardBody;
  new MutationObserver(()=>{
    if (dashboard.dataset.dashboardBody !== currentBody) {
      currentBody = dashboard.dataset.dashboardBody;
      show('');
      void mountInspection();
    }
    render();
  }).observe(dashboard,{attributes:true,attributeFilter:['data-dashboard-body','data-panel-open']});
  window.addEventListener('relic-film-state',()=>{
    if (filmActive()) show('');
    shell.inert = filmActive();
    if(!filmActive())void mountInspection();
  });
  shell.inert = filmActive();
  new ResizeObserver(alignPanel).observe(rail);
  window.addEventListener('resize',alignPanel);
  document.body.classList.add('has-action-rail');
  setInformation(false);
  onLanguageChange(()=>{if(active)setInformation(false);render();});
  new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  window.addEventListener('relic-preferences-change',render);
  render();
  instance = {element:shell,show,close:()=>show('')};
  window.dispatchEvent(new CustomEvent('relic-action-rail-mounted'));
  requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
  void mountInspection();
  return instance;

  function iconButton(id,icon,key) {
    const button = element('button','rail-button');
    button.type = 'button'; button.id = id; button.dataset.railCopy = key;
    button.innerHTML = railGlyph(icon)+'<span class="rail-button-label"></span>';
    return button;
  }
  function filmActive() {
    return window.__relicFilmActive === true || document.documentElement.dataset.relicFilm === 'active';
  }
  function inspectionActive(){return Boolean(inspection&&!inspection.element.hidden&&!filmActive());}
  function mountInspection(){
    if(inspection||inspectionPromise||filmActive()||!currentBody||currentBody==='sun')return inspectionPromise;
    inspectionPromise=import('./inspection-shell.js').then(({createInspectionShell})=>{
      if(filmActive()||currentBody==='sun')return;
      const searchWasOpen=active==='search';
      if(searchWasOpen)show('');
      inspection=createInspectionShell({dashboard,command,inspector,getLanguage,onLanguageChange});
      if(!inspection)return;
      const locationToggle=inspection.element.querySelector('#inspection-location .inspection-tray-toggle');
      const syncSearch=()=>{
        searchButton.setAttribute('aria-controls',inspectionActive()?'inspection-location-popover':panel.id);
        if(inspectionActive())searchButton.setAttribute('aria-expanded',locationToggle?.getAttribute('aria-expanded')||'false');
      };
      const observer=new MutationObserver(syncSearch);
      observer.observe(inspection.element,{attributes:true,attributeFilter:['hidden']});
      if(locationToggle)observer.observe(locationToggle,{attributes:true,attributeFilter:['aria-expanded']});
      inspection.element.addEventListener('click',event=>{
        if(active&&event.target.closest('.inspection-module-toggle,.inspection-tray-toggle'))show('');
      });
      syncSearch();
      if(searchWasOpen)inspection.openLocation(searchButton);
    }).catch(()=>{}).finally(()=>{inspectionPromise=null;});
    return inspectionPromise;
  }
  function setInformation(open) {
    window.dispatchEvent(new CustomEvent('planet-dashboard-panel',{detail:{open}}));
  }
  function show(name,trigger,restoreFocus=false) {
    if (name && filmActive()) return;
    if(name&&!Object.hasOwn(menuViews,name))return;
    if(name==='search'&&inspectionActive()){
      if(active)show('');
      const toggle=inspection.element.querySelector('#inspection-location .inspection-tray-toggle');
      if(toggle?.getAttribute('aria-expanded')==='true')inspection.close('location',true);else inspection.openLocation(searchButton);
      return;
    }
    if(name&&inspectionActive())for(const key of ['location','presets','display','data'])inspection.close(key);
    if (name && active!==name) setInformation(false);
    if (trigger) opener = trigger;
    const wasHidden=panel.hidden;
    const interrupted=disclosureMotion?.playState==='running';
    const previousClip=interrupted?getComputedStyle(panel).clipPath:null;
    const previousOpacity=interrupted?getComputedStyle(panel).opacity:null;
    disclosureMotion?.cancel();
    clearTimeout(closeTimer);cancelAnimationFrame(revealFrame);cancelAnimationFrame(focusFrame);
    panel.scrollTop=0;
    active = name;
    shell.dataset.open = name || 'none';
    panel.dataset.panelKind=name||'none';
    panel.inert = !name;
    if(name){
      const entering=panel.hidden||panel.dataset.phase==='closing';
      panel.hidden=false;alignPanel();panel.dataset.phase=entering?'entering':'open';
      for (const [key,region] of Object.entries(menuViews)) if(panel.contains(region)){region.hidden=key!==name;region.inert=key!==name;}
      if(entering){panel.getBoundingClientRect();animateDisclosure(true,wasHidden,previousClip,previousOpacity);revealFrame=requestAnimationFrame(()=>{if(active)panel.dataset.phase='open';});}
    }else{
      panel.dataset.phase='closing';
      const reduced=document.documentElement.dataset.motion==='reduced'
        ||(!document.documentElement.dataset.motion&&matchMedia('(prefers-reduced-motion:reduce)').matches);
      const finish=()=>{if(active)return;panel.hidden=true;delete panel.dataset.phase;for(const region of Object.values(menuViews))if(panel.contains(region)){region.hidden=true;region.inert=true;}};
      if(reduced)finish();else{animateDisclosure(false,false,previousClip,previousOpacity);closeTimer=setTimeout(finish,panel.dataset.attached==='true'?430:320);}
    }
    for (const [key,button] of Object.entries(triggers)) button.setAttribute('aria-expanded',String(key===name));
    if (name==='worlds') {
      picker.dispatchEvent(new CustomEvent('planet-dashboard-picker',{detail:{inline:true}}));
    }
    render();
    if(name)focusFrame=requestAnimationFrame(()=>{
      if(active!==name||filmActive()||panel.inert||panel.hidden)return;
      if(name==='worlds')picker.dispatchEvent(new CustomEvent('planet-dashboard-picker',{detail:{inline:true,focus:true}}));
      else if(name==='search')command.querySelector('input')?.focus({preventScroll:true});
      else (triggers[name]||worldButton).focus({preventScroll:true});
    });
    if (!name && restoreFocus) opener?.focus({preventScroll:true});
  }
  function animateDisclosure(open,wasHidden,previousClip,previousOpacity){
    const reduced=document.documentElement.dataset.motion==='reduced'||(!document.documentElement.dataset.motion&&matchMedia('(prefers-reduced-motion:reduce)').matches);
    if(reduced||panel.dataset.attached!=='true'||!panel.animate)return;
    const full=getComputedStyle(panel).clipPath;
    const height=panel.getBoundingClientRect().height,radius=parseFloat(panel.style.getPropertyValue('--attached-radius'))+1;
    const edge=radius,corner=Math.min(14,edge/2);
    const closed=`path("M0 0H${edge-corner}Q${edge} 0 ${edge} ${corner}V${height-corner}Q${edge} ${height} ${edge-corner} ${height}H0Q${radius} ${height} ${radius} ${height-radius+1}V${radius-1}Q${radius} 0 0 0Z")`;
    const motion=panel.animate([
      {clipPath:previousClip||(open&&wasHidden?closed:full),opacity:previousOpacity||(open&&wasHidden?0:1)},
      {clipPath:open?full:closed,opacity:open?1:0},
    ],{duration:open?420:360,easing:open?'cubic-bezier(.16,1,.3,1)':'cubic-bezier(.4,0,.6,1)',fill:'both'});
    disclosureMotion=motion;
    motion.onfinish=()=>{if(disclosureMotion===motion&&open&&active){motion.cancel();disclosureMotion=undefined;}};
  }
  function alignPanel(){
    const box=rail.getBoundingClientRect();
    if(box.height<=box.width||shell.dataset.keyboard==='true'){delete panel.dataset.attached;return;}
    const radius=Math.min(parseFloat(getComputedStyle(rail).borderTopRightRadius)||0,box.height/2,box.width/2);
    const left=box.right-radius-1,height=box.height,width=Math.min(368+radius,innerWidth-left-12);
    const outline=`M0 0H${width-14}Q${width} 0 ${width} 14V${height-14}Q${width} ${height} ${width-14} ${height}H0Q${radius+1} ${height} ${radius+1} ${height-radius}V${radius}Q${radius+1} 0 0 0Z`;
    panel.dataset.attached='true';
    for(const [key,value] of Object.entries({top:box.top,left,height,width,radius}))panel.style.setProperty(`--attached-${key}`,`${value}px`);
    panel.style.setProperty('--attached-outline',`"${outline}"`);
  }
  function render() {
    requestAnimationFrame(alignPanel);

    const copy = COPY[getLanguage()==='fr'?'fr':'en'];
    const informationOpen=dashboard.dataset.panelOpen==='true';
    const hasWorld=Boolean(dashboard.dataset.dashboardBody&&dashboard.dataset.dashboardBody!=='overview');
    rail.setAttribute('aria-label',copy.navigation);
    title.textContent = copy[active==='worlds'?'worldsTitle':active==='search'?'searchTitle':'menu'];
    description.textContent=copy[active==='worlds'?'worldsDescription':active==='search'?(['overview','earth'].includes(currentBody)?'searchPlaces':atlas?'searchCoordinates':'searchSites'):'moreDescription'];
    for (const target of shell.querySelectorAll('[data-rail-copy]')) {
      const label = target===information?(hasWorld?(informationOpen?copy.closeInformation:copy.information):copy.selectWorld):copy[target.dataset.railCopy];
      target.dataset.railLabel = label;
      if (target.matches('button,a')) {target.setAttribute('aria-label',label);target.removeAttribute('title');}
      const span = target.querySelector('.rail-button-label');
      if (span) {const short=copy[target.dataset.railCopy+'Short']||label;span.textContent=short;target.dataset.shortLabel=short;}
      if (target.matches('h3')) target.textContent=label;
      if (target.matches('.rail-menu-film')) target.querySelector('span').textContent=label;
    }
    const utilityLabels = [['#relic-replay','replay'],['#relic-credits','sources'],['[data-app-settings]','settings'],['[data-language-toggle]','language']];
    for (const [selector,key] of utilityLabels) {
      const button = menu.querySelector(selector);
      if (button) button.dataset.railLabel = copy[key];
    }
    for(const [selector,key] of [['#tilt-button','tiltAction'],['#height-button','heightAction'],['#north-button','northAction']]){
      const button=menu.querySelector(selector);if(button){button.setAttribute('aria-label',copy[key]);button.removeAttribute('title');}
    }
    inspectorClose.setAttribute('aria-label',copy.closeInformation);
    inspectorClose.removeAttribute('title');
    if(atlas&&reset)reset.hidden=!hasWorld;
    information.hidden=true;
    information.disabled=!hasWorld;
    information.setAttribute('aria-disabled',String(!hasWorld));
    information.setAttribute('aria-expanded',String(informationOpen));
    themeButton.dataset.themeState=document.documentElement.dataset.theme==='day'?'day':'night';
    const themeLabel=copy[themeButton.dataset.themeState==='day'?'dark':'light'];
    themeButton.dataset.railLabel=themeLabel;themeButton.setAttribute('aria-label',themeLabel);themeButton.removeAttribute('title');
    themeButton.setAttribute('aria-pressed',String(themeButton.dataset.themeState==='day'));
    themeButton.dataset.shortLabel=copy[themeButton.dataset.themeState==='day'?'darkShort':'lightShort'];
    themeButton.querySelector('.rail-button-label').textContent=themeButton.dataset.shortLabel;
    const name = picker.querySelector('.pd-picker-value')?.textContent;
    worldButton.dataset.railLabel=name?`${copy.worlds} · ${name}`:copy.worlds;
    searchButton.setAttribute('aria-keyshortcuts','Control+k Meta+k /');
    if(brand){brand.dataset.railLabel=copy.home;brand.setAttribute('aria-label',copy.home);if(!hasWorld)brand.setAttribute('aria-current','page');else brand.removeAttribute('aria-current');}
  }
}

// Module scripts run after the source markup. The dashboard may mount through
// either renderer; an explicit event also covers deferred renderer imports.
window.addEventListener('planet-dashboard-mounted',()=>queueMicrotask(initializeActionRail));
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',initializeActionRail,{once:true});
else initializeActionRail();
