import { getLanguage, onLanguageChange } from '../atlas/atlas-live.js?v=3';
import { worldIcon } from './world-icons.js';

const COPY = {
  en: {navigation:'Exploration',worlds:'Worlds',search:'Search',information:'View information',reset:'Reset view',more:'More actions',close:'Close',menu:'Controls',view:'View',replay:'Watch the film',sources:'Sources and creators',settings:'Settings',language:'Language',searchTitle:'Search',worldsTitle:'Worlds',closeInformation:'Close information',selectWorld:'Select a world to see its information',light:'Switch to light mode',dark:'Switch to dark mode'},
  fr: {navigation:'Exploration',worlds:'Mondes',search:'Rechercher',information:'Informations de la vue',reset:'Recentrer la vue',more:'Autres actions',close:'Fermer',menu:'Commandes',view:'Vue',replay:'Revoir le film',sources:'Sources et créateurs',settings:'Réglages',language:'Langue',searchTitle:'Rechercher',worldsTitle:'Mondes',closeInformation:'Fermer les informations',selectWorld:'Sélectionner un monde pour voir ses informations',light:'Passer en mode clair',dark:'Passer en mode sombre'},
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
  const title = element('h2','rail-panel-title');
  title.id = 'rail-panel-title';
  panel.setAttribute('aria-labelledby',title.id);
  const close = iconButton('rail-close','xmark','close');
  heading.append(title,close);
  const worlds = element('div','rail-worlds');
  worlds.append(picker);
  const menu = element('div','rail-menu');
  const view = element('section','rail-view');
  const viewTitle = element('h3','rail-section-title');
  viewTitle.dataset.railCopy = 'view';
  view.append(viewTitle);
  const menuActions = element('div','rail-menu-actions');
  const menuViews = {worlds,search:command,more:menu};
  let active = '', opener, closeTimer=0, revealFrame=0;
  const worldButton = iconButton('rail-worlds','globe','worlds');
  const searchButton = iconButton('rail-search','magnifying-glass','search');
  const moreButton = iconButton('rail-more','sliders','more');
  const themeButton = element('button','rail-button rail-theme-action');
  themeButton.type = 'button';themeButton.id = 'rail-theme';themeButton.dataset.themeToggle = '';
  themeButton.innerHTML = railGlyph('sun')+railGlyph('moon')+'<span class="rail-button-label"></span>';
  for (const button of [worldButton,searchButton,moreButton]) {
    button.setAttribute('aria-controls',panel.id);
    button.setAttribute('aria-expanded','false');
  }
  if (brand) { brand.classList.add('rail-brand'); rail.append(brand); }
  rail.append(primary,utility);
  primary.append(worldButton,searchButton);
  information.classList.add('rail-button');
  information.dataset.railCopy = 'information';
  information.querySelector('svg')?.remove();
  information.insertAdjacentHTML('afterbegin',railGlyph('circle-info'));
  primary.append(information);
  const reset = dashboard.querySelector(atlas ? '#overview-button' : '#reset-view,#reset-button');
  if (reset && !atlas) {
    reset.classList.add('rail-button');
    reset.dataset.railCopy = 'reset';
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
  panel.append(heading,worlds,command,menu);
  shell.append(rail,panel);
  document.body.append(shell);
  const inspectorClose = iconButton('rail-inspector-close','xmark','closeInformation');
  inspectorClose.classList.add('rail-inspector-close');
  inspector.prepend(inspectorClose);
  inspectorClose.addEventListener('click',()=>{setInformation(false); information.focus({preventScroll:true});});
  const triggers = {worlds:worldButton,search:searchButton,more:moreButton};
  for (const [name,button] of Object.entries(triggers)) button.addEventListener('click',()=>show(active===name?'':name,button));
  close.addEventListener('click',()=>show('',null,true));
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
      else if (dashboard.dataset.panelOpen === 'true') { event.preventDefault(); event.stopPropagation(); setInformation(false); information.focus({preventScroll:true}); }
    } else if (event.key==='Tab' && active) {
      const targets=[...panel.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')]
        .filter(node=>node.tabIndex>=0&&!node.disabled&&!node.closest('[hidden],[inert]')&&node.getClientRects().length);
      if(!targets.length)return;
      const index=targets.indexOf(document.activeElement);
      if(index<0||!event.shiftKey&&index===targets.length-1||event.shiftKey&&index===0){
        event.preventDefault();targets[event.shiftKey?targets.length-1:0].focus({preventScroll:true});
      }
    } else if (((event.key === '/' && !event.ctrlKey && !event.altKey && !event.metaKey)
      || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'))
      && !event.target.closest('input,textarea,select,[contenteditable=true]')) {
      event.preventDefault(); event.stopPropagation(); show('search',searchButton);
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
  let currentBody = dashboard.dataset.dashboardBody;
  new MutationObserver(()=>{
    if (dashboard.dataset.dashboardBody !== currentBody) {
      currentBody = dashboard.dataset.dashboardBody;
      show('');
    }
    render();
  }).observe(dashboard,{attributes:true,attributeFilter:['data-dashboard-body','data-panel-open']});
  window.addEventListener('relic-film-state',()=>{
    if (filmActive()) show('');
    shell.inert = filmActive();
  });
  shell.inert = filmActive();
  document.body.classList.add('has-action-rail');
  setInformation(false);
  onLanguageChange(()=>{if(active)setInformation(false);render();});
  window.addEventListener('relic-preferences-change',render);
  render();
  instance = {element:shell,show,close:()=>show('')};
  window.dispatchEvent(new CustomEvent('relic-action-rail-mounted'));
  requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
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
  function setInformation(open) {
    window.dispatchEvent(new CustomEvent('planet-dashboard-panel',{detail:{open}}));
  }
  function show(name,trigger,restoreFocus=false) {
    if (name && filmActive()) return;
    if (name && active!==name) setInformation(false);
    if (active==='worlds' && name!=='worlds') {
      const pickerTrigger=picker.querySelector('.pd-world-trigger');
      if (pickerTrigger?.getAttribute('aria-expanded')==='true') pickerTrigger.click();
    }
    if (trigger) opener = trigger;
    clearTimeout(closeTimer);cancelAnimationFrame(revealFrame);
    active = name;
    shell.dataset.open = name || 'none';
    panel.inert = !name;
    if(name){
      const entering=panel.hidden||panel.dataset.phase==='closing';
      panel.hidden=false;panel.dataset.phase=entering?'entering':'open';
      for (const [key,region] of Object.entries(menuViews)) {region.hidden=key!==name;region.inert=key!==name;}
      if(entering){panel.getBoundingClientRect();revealFrame=requestAnimationFrame(()=>{if(active)panel.dataset.phase='open';});}
    }else{
      panel.dataset.phase='closing';
      const reduced=document.documentElement.dataset.motion==='reduced'
        ||(!document.documentElement.dataset.motion&&matchMedia('(prefers-reduced-motion:reduce)').matches);
      const finish=()=>{if(active)return;panel.hidden=true;delete panel.dataset.phase;for(const region of Object.values(menuViews)){region.hidden=true;region.inert=true;}};
      if(reduced)finish();else closeTimer=setTimeout(finish,180);
    }
    for (const [key,button] of Object.entries(triggers)) button.setAttribute('aria-expanded',String(key===name));
    if (name==='worlds') {
      const trigger = picker.querySelector('.pd-world-trigger');
      if (trigger?.getAttribute('aria-expanded')!=='true') trigger?.click();
    }
    render();
    if (name==='search') requestAnimationFrame(()=>command.querySelector('input')?.focus({preventScroll:true}));
    if (name==='more') requestAnimationFrame(()=>close.focus({preventScroll:true}));
    if (!name && restoreFocus) opener?.focus({preventScroll:true});
  }
  function render() {
    const copy = COPY[getLanguage()==='fr'?'fr':'en'];
    const informationOpen=dashboard.dataset.panelOpen==='true';
    const hasWorld=Boolean(dashboard.dataset.dashboardBody&&dashboard.dataset.dashboardBody!=='overview');
    rail.setAttribute('aria-label',copy.navigation);
    title.textContent = copy[active==='worlds'?'worldsTitle':active==='search'?'searchTitle':'menu'];
    for (const target of shell.querySelectorAll('[data-rail-copy]')) {
      const label = target===information?(hasWorld?(informationOpen?copy.closeInformation:copy.information):copy.selectWorld):copy[target.dataset.railCopy];
      target.dataset.railLabel = label;
      if (target.matches('button,a')) {target.setAttribute('aria-label',label);target.title=label;}
      const span = target.querySelector('.rail-button-label');
      if (span) span.textContent=label;
      if (target.matches('h3')) target.textContent=label;
      if (target.matches('.rail-menu-film')) target.querySelector('span').textContent=label;
    }
    const utilityLabels = [['#relic-replay','replay'],['#relic-credits','sources'],['[data-app-settings]','settings'],['[data-language-toggle]','language']];
    for (const [selector,key] of utilityLabels) {
      const button = menu.querySelector(selector);
      if (button) button.dataset.railLabel = copy[key];
    }
    inspectorClose.setAttribute('aria-label',copy.closeInformation);
    inspectorClose.title=copy.closeInformation;
    information.disabled=!hasWorld;
    information.setAttribute('aria-disabled',String(!hasWorld));
    information.setAttribute('aria-expanded',String(informationOpen));
    themeButton.dataset.themeState=document.documentElement.dataset.theme==='day'?'day':'night';
    const themeLabel=copy[themeButton.dataset.themeState==='day'?'dark':'light'];
    themeButton.dataset.railLabel=themeLabel;themeButton.setAttribute('aria-label',themeLabel);themeButton.title=themeLabel;
    themeButton.setAttribute('aria-pressed',String(themeButton.dataset.themeState==='day'));
    themeButton.querySelector('.rail-button-label').textContent=themeLabel;
    const name = picker.querySelector('.pd-picker-value')?.textContent;
    worldButton.title = name ? `${copy.worlds} · ${name}` : copy.worlds;
    worldButton.dataset.railLabel=worldButton.title;
  }
}

// Module scripts run after the source markup. The dashboard may mount through
// either renderer; an explicit event also covers deferred renderer imports.
window.addEventListener('planet-dashboard-mounted',()=>queueMicrotask(initializeActionRail));
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',initializeActionRail,{once:true});
else initializeActionRail();
