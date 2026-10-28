import { getLanguage, onLanguageChange } from '../atlas/atlas-live.js?v=3';
import { worldIcon } from './world-icons.js';

const COPY = {
  en: {navigation:'Exploration',worlds:'Worlds',search:'Search',information:'View information',reset:'Reset view',system:'Solar system',more:'More actions',close:'Close',expand:'Expand navigation',collapse:'Collapse navigation',menu:'Explore',view:'View controls',replay:'Watch the film',sources:'Sources and creators',settings:'Settings',language:'Language',theme:'Appearance',searchTitle:'Find a place',worldsTitle:'Choose a world',closeInformation:'Close information'},
  fr: {navigation:'Exploration',worlds:'Mondes',search:'Rechercher',information:'Informations de la vue',reset:'Recentrer la vue',system:'Système solaire',more:'Autres actions',close:'Fermer',expand:'Déployer la navigation',collapse:'Réduire la navigation',menu:'Explorer',view:'Commandes de la vue',replay:'Revoir le film',sources:'Sources et créateurs',settings:'Réglages',language:'Langue',theme:'Apparence',searchTitle:'Trouver un lieu',worldsTitle:'Choisir un monde',closeInformation:'Fermer les informations'},
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
  rail.dataset.expanded = 'false';
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
  let active = '', opener, expanded = false;
  const worldButton = iconButton('rail-worlds','globe','worlds');
  const searchButton = iconButton('rail-search','magnifying-glass','search');
  const moreButton = iconButton('rail-more','sliders','more');
  const fold = iconButton('rail-expand','arrow-right','expand');
  for (const button of [worldButton,searchButton,moreButton]) {
    button.setAttribute('aria-controls',panel.id);
    button.setAttribute('aria-expanded','false');
  }
  fold.setAttribute('aria-controls',rail.id);
  fold.setAttribute('aria-expanded','false');
  if (brand) { brand.classList.add('rail-brand'); rail.append(brand); }
  rail.append(fold,primary,utility);
  primary.append(worldButton,searchButton);
  information.classList.add('rail-button');
  information.dataset.railCopy = 'information';
  information.querySelector('svg')?.remove();
  information.insertAdjacentHTML('afterbegin',worldIcon('circle-info'));
  primary.append(information);
  const reset = dashboard.querySelector(atlas ? '#overview-button' : '#reset-view,#reset-button');
  if (reset) {
    reset.classList.add('rail-button');
    reset.dataset.railCopy = atlas ? 'system' : 'reset';
    if (!atlas) {
      reset.querySelector('.world-icon,svg')?.remove();
      reset.insertAdjacentHTML('afterbegin',worldIcon('rotate'));
    }
    primary.append(reset);
  }
  if (!atlas) {
    const system = element('a','rail-button');
    system.href = rootURL.href;
    system.dataset.railCopy = 'system';
    system.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-25 12 12)"/></svg><span class="rail-button-label"></span>';
    primary.append(system);
  }
  utility.append(moreButton);
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
  fold.addEventListener('click',()=>{
    expanded = !expanded;
    rail.dataset.expanded = String(expanded);
    fold.setAttribute('aria-expanded',String(expanded));
    fold.dataset.railCopy = expanded ? 'collapse' : 'expand';
    render();
  });
  information.addEventListener('click',()=>show(''));
  reset?.addEventListener('click',()=>show(''));
  picker.addEventListener('click',event=>{
    if (event.target.closest('.pd-world-option')) show('',worldButton,true);
  });
  command.addEventListener('click',event=>{
    if (event.target.closest('.place-search-results [role=option],.pd-search-results [role=option]')) show('',searchButton,true);
  });
  menuActions.addEventListener('click',event=>{
    if (event.target.closest('#relic-replay,#relic-credits,[data-app-settings]')) show('');
  });
  document.addEventListener('pointerdown',event=>{
    if (active && !shell.contains(event.target)) show('');
  });
  document.addEventListener('keydown',event=>{
    if (event.defaultPrevented || document.querySelector('dialog[open]') || filmActive()) return;
    if (event.key === 'Escape') {
      if (active) { event.preventDefault(); show('',null,true); }
      else if (dashboard.dataset.panelOpen === 'true') { setInformation(false); information.focus({preventScroll:true}); }
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
      setInformation(false); show(''); render();
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
    active = name;
    shell.dataset.open = name || 'none';
    panel.hidden = !name; panel.inert = !name;
    for (const [key,region] of Object.entries(menuViews)) {region.hidden=key!==name;region.inert=key!==name;}
    for (const [key,button] of Object.entries(triggers)) button.setAttribute('aria-expanded',String(key===name));
    if (name==='worlds') {
      const trigger = picker.querySelector('.pd-world-trigger');
      if (trigger?.getAttribute('aria-expanded')!=='true') trigger?.click();
    }
    render();
    if (name==='search') requestAnimationFrame(()=>command.querySelector('input')?.focus({preventScroll:true}));
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
    const utilityLabels = [['#relic-replay','replay'],['#relic-credits','sources'],['[data-app-settings]','settings'],['[data-language-toggle]','language'],['[data-theme-toggle]','theme']];
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
