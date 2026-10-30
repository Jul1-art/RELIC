import { getLanguage, onLanguageChange } from '../atlas/atlas-live.js?v=3';
import { worldIcon } from './world-icons.js';

const COPY = {
  en: {navigation:'Exploration',worlds:'Worlds',search:'Search',information:'View information',reset:'Reset view',more:'More actions',close:'Close',menu:'Explore',view:'View controls',replay:'Watch the film',sources:'Sources and creators',settings:'Settings',language:'Language',searchTitle:'Find a place',worldsTitle:'Choose a world',closeInformation:'Close information'},
  fr: {navigation:'Exploration',worlds:'Mondes',search:'Rechercher',information:'Informations de la vue',reset:'Recentrer la vue',more:'Autres actions',close:'Fermer',menu:'Explorer',view:'Commandes de la vue',replay:'Revoir le film',sources:'Sources et créateurs',settings:'Réglages',language:'Langue',searchTitle:'Trouver un lieu',worldsTitle:'Choisir un monde',closeInformation:'Fermer les informations'},
};
let instance;
const element = (tag, className) => Object.assign(document.createElement(tag), {className});
const rootURL = new URL('../../index.html', import.meta.url);

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
  const rail = element('nav','relic-action-rail');
  rail.id = 'relic-action-rail';
  rail.dataset.compact = 'true';
  const primary = element('div','rail-primary');
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
  for (const button of [worldButton,searchButton,moreButton]) {
    button.setAttribute('aria-controls',panel.id);
    button.setAttribute('aria-expanded','false');
  }
  if (brand) { brand.classList.add('rail-brand'); rail.append(brand); }
  rail.append(primary);
  primary.append(worldButton,searchButton);
  information.classList.add('rail-button');
  information.dataset.railCopy = 'information';
  information.querySelector('svg')?.remove();
  information.insertAdjacentHTML('afterbegin',worldIcon('circle-info'));
  primary.append(information);
  const reset = dashboard.querySelector(atlas ? '#overview-button' : '#reset-view,#reset-button');
  if (reset && !atlas) {
    reset.classList.add('rail-button');
    reset.dataset.railCopy = 'reset';
    reset.querySelector('.world-icon,svg')?.remove();
    reset.insertAdjacentHTML('afterbegin',worldIcon('rotate'));
    view.append(reset);
  }
  // The brand and Worlds menu already return to the solar overview. Keep
  // only Worlds, Search, Information and More in the compact edge rail.
  primary.append(moreButton);
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
      if (active) { event.preventDefault(); show('',null,true); }
      else if (dashboard.dataset.panelOpen === 'true') { setInformation(false); information.focus({preventScroll:true}); }
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
      show(''); render();
    }
  }).observe(dashboard,{attributes:true,attributeFilter:['data-dashboard-body']});
  window.addEventListener('relic-film-state',()=>{
    if (filmActive()) show('');
    shell.inert = filmActive();
  });
  shell.inert = filmActive();
  document.body.classList.add('has-action-rail');
  setInformation(false);
  onLanguageChange(()=>{if(active)setInformation(false);render();});
  instance = {element:shell,show,close:()=>show('')};
  window.dispatchEvent(new CustomEvent('relic-action-rail-mounted'));
  requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
  return instance;

  function iconButton(id,icon,key) {
    const button = element('button','rail-button');
    button.type = 'button'; button.id = id; button.dataset.railCopy = key;
    button.innerHTML = worldIcon(icon)+'<span class="rail-button-label"></span>';
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
    rail.setAttribute('aria-label',copy.navigation);
    title.textContent = copy[active==='worlds'?'worldsTitle':active==='search'?'searchTitle':'menu'];
    for (const target of shell.querySelectorAll('[data-rail-copy]')) {
      const label = copy[target.dataset.railCopy];
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
    const name = picker.querySelector('.pd-picker-value')?.textContent;
    worldButton.title = name ? `${copy.worlds} · ${name}` : copy.worlds;
  }
}

// Module scripts run after the source markup. The dashboard may mount through
// either renderer; an explicit event also covers deferred renderer imports.
window.addEventListener('planet-dashboard-mounted',()=>queueMicrotask(initializeActionRail));
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',initializeActionRail,{once:true});
else initializeActionRail();
