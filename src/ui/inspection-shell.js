import {getLanguage as defaultLanguage,setLanguage,onLanguageChange as defaultLanguageChange} from '../atlas/atlas-live.js?v=3';
import {PLANET_SITES} from '../atlas/nasa-worlds.js';
import {VISUAL_SETTINGS,VISUAL_PRESETS,STYLE_PARAMETERS} from './visual-effects.js';
import {collapsePanelOnEscape} from '../../vendor/gods-eye-view/panelDisclosure.js';
import {vRangeValue} from '../../vendor/gods-eye-view/ui/rail/rangeValue.js';
import {bindInspectionMotion,setInspectionPanelExpanded} from './inspection-motion.js';

/* Adapted from God's Eye View (MIT), a33bc37: GlobeActions.vue,
 * CommandDockView.vue and DisplayPanel.vue. Original sources and license are
 * retained in vendor/gods-eye-view. Renderers remain owned by RELIC. */
const COPY={
 en:{actions:'Planet view actions',share:'Copy view link',tilt:'Switch vertical / oblique view',north:'North up',reset:'Recenter this world',home:'Return to the solar system',location:'Location',presets:'Visual presets',display:'Display',data:'World data',close:'Close',pin:'Keep this tray open',overview:'Overview',moons:'Moons & orbits',missions:'Sites & missions',satellites:'Satellites',scene:'Scene',image:'Image',style:'Style parameters',labels:'Labels',orbits:'Moon orbits',moonsSetting:'Natural moons',noMoons:'The moon catalogue is available in the solar system view.',noSites:'No landing-site catalogue is available for this world yet.',coordinates:'Explore latitude and longitude on this world.',siteHelp:'Choose a destination, or use the search field.',planetData:'Measured properties, current position and exploration sites.',unsupported:'Unavailable in this view',shareHint:'Copy this view link',copy:'Copy',copied:'View link copied',language:'Switch language',styleSimulated:'Simulated sensor styles.'},
 fr:{actions:'Actions de la vue planétaire',share:'Copier le lien de la vue',tilt:'Basculer entre vue verticale et oblique',north:'Nord en haut',reset:'Recentrer ce monde',home:'Revenir au système solaire',location:'Localisation',presets:'Préréglages visuels',display:'Affichage',data:'Données du monde',close:'Fermer',pin:'Garder ce panneau ouvert',overview:'Vue générale',moons:'Lunes et orbites',missions:'Sites et missions',satellites:'Satellites',scene:'Scène',image:'Image',style:'Paramètres du style',labels:'Noms des objets',orbits:'Orbites des lunes',moonsSetting:'Lunes naturelles',noMoons:'Le catalogue des lunes est disponible dans la vue du système solaire.',noSites:'Aucun catalogue de sites d’atterrissage n’est encore disponible pour ce monde.',coordinates:'Explorez la latitude et la longitude de ce monde.',siteHelp:'Choisissez une destination ou utilisez la recherche.',planetData:'Dimensions mesurées, position et sites d’exploration.',unsupported:'Indisponible dans cette vue',shareHint:'Copiez le lien de cette vue',copy:'Copier',copied:'Lien de la vue copié',language:'Changer la langue',styleSimulated:'Simulation du rendu des capteurs.'},
};
const GLYPHS={
 share:'<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" aria-hidden="true"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>',
 tilt:'<svg viewBox="0 0 48 48" fill="none" width="48" height="48" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17V12H17 M31 12H36V17 M12 31V36H17 M31 36H36V31" stroke-width="3"/><path d="M24 16L32 20.5V29.5L24 34L16 29.5V20.5Z M24 16V34 M24 25L32 20.5 M24 25L16 20.5" stroke-width="2.5"/></svg>',
 north:'<path d="m12 3 7 17-7-4-7 4Z"/>',
 reset:'<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>',
 location:'<path d="M19 10c0 6-7 11-7 11S5 16 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
 presets:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m4 14 6-5 10 8M4 8l4-3 12 9"/>',
 close:'<path d="m7 7 10 10M7 17 17 7"/>',
 pin:'<path d="m9 3 6 0-1 6 3 4H7l3-4Zm3 10v8"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>',
};
const glyph=type=>GLYPHS[type]?.startsWith('<svg')?GLYPHS[type]:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[type]||''}</svg>`;
const node=(tag,className)=>Object.assign(document.createElement(tag),{className});
const DEFAULTS=Object.fromEntries(Object.entries(VISUAL_SETTINGS).map(([key,value])=>[key,value.default]));
const CITIES=[['Austin',30.2672,-97.7431],['San Francisco',37.7749,-122.4194],['New York',40.7128,-74.006],['Tokyo',35.6762,139.6503],['London',51.5074,-.1278]];
const SYMBOLS={normal:'◯',crt:'▦',nvg:'🌙',flir:'🌡️',anime:'✦',noir:'◐'};
const PERCENT_SETTINGS=new Set(['bloomIntensity','sharpenIntensity','scopeFeather']);
const AVAILABILITY={
 en:{loading:'Waiting for the renderer',lighting:'Sunlight is baked into these tiles',labels:'This view has no object labels',moons:'This view has no natural moon layer',orbits:'This view has no moon orbit layer'},
 fr:{loading:'Chargement du moteur de rendu',lighting:'L’éclairage est intégré à ces tuiles',labels:'Cette vue n’affiche aucun nom d’objet',moons:'Cette vue n’affiche aucune couche de lunes',orbits:'Cette vue n’affiche aucune couche d’orbites lunaires'},
};

export function inspectionActive({body,film=false}={}){return Boolean(body&&body!=='sun'&&!film);}

/** One focus-only shell; moving existing nodes retains their adapters/listeners. */
export function createInspectionShell({dashboard=document.querySelector('.planet-dashboard'),command,inspector,
 getLanguage=defaultLanguage,onLanguageChange=defaultLanguageChange,events=window}={}){
 if(!dashboard)return null;
 command ||= document.querySelector('.pd-command');inspector ||= dashboard.querySelector('.pd-inspector');
 if(!command||!inspector)return null;
 if(!document.querySelector('link[href*="inspection-shell.css"]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./inspection-shell.css?v=24',import.meta.url).href;document.head.append(link);}
 const markers=new Map();
 for(const item of [command,inspector].filter(Boolean)){const marker=document.createComment('RELIC inspection return slot');item.before(marker);markers.set(item,marker);}
 const root=node('div','relic-inspection-shell');root.id='relic-inspection-shell';root.hidden=true;root.inert=true;
 const top=node('nav','inspection-top-actions');top.id='inspection-top-actions';
 const actions=new Map();
 for(const key of ['share','tilt','north','reset']){
  const button=node('button','inspection-round');button.type='button';button.dataset.inspectionAction=key;button.innerHTML=glyph(key);
  if(key==='north'){const n=node('span','inspection-compass-n');n.textContent='N';n.setAttribute('aria-hidden','true');button.prepend(n);}
  const icon=button.querySelector('svg');
  let press;
  button.addEventListener('click',()=>{
   press?.cancel();
   const motion=document.documentElement.dataset.motion;
   if(icon.animate&&motion!=='reduced'&&(motion==='full'||!matchMedia('(prefers-reduced-motion: reduce)').matches)){
    // Use the press and hover scales from God's Eye View's status.css.
    press=icon.animate([{scale:.95},{scale:1.1,offset:.42},{scale:1}],{duration:220,easing:'cubic-bezier(.4,0,.2,1)'});
   }
   emit(key);
  });
  top.append(button);actions.set(key,button);
 }
 const modules=node('aside','inspection-modules');
 const display=makeModule('display'),data=makeModule('data');modules.append(display.element,data.element);
 const settingsForm=node('div','inspection-display-controls');display.body.append(settingsForm);
 const controls=new Map(),styleControls=new Map();
 const sceneGroup=makeGroup('scene'),satelliteGroup=makeGroup('satellites'),imageGroup=makeGroup('image'),styleGroup=makeGroup('style');
 const satelliteSlot=node('div','inspection-satellite-controls');satelliteSlot.id='inspection-satellite-controls';
 controls.set('detection',makeSetting('detection',VISUAL_SETTINGS.detection,satelliteGroup.body));
 satelliteGroup.body.append(satelliteSlot);
 settingsForm.append(satelliteGroup.element,sceneGroup.element,imageGroup.element,styleGroup.element);
 for(const key of ['stars','lighting','labels','moons','orbits']){
  const descriptor=VISUAL_SETTINGS[key]||{type:'boolean',default:true,label:COPY.en[key==='moons'?'moonsSetting':key]||key,fr:COPY.fr[key==='moons'?'moonsSetting':key]||key};
  controls.set(key,makeSetting(key,descriptor,sceneGroup.body));
 }
 for(const key of ['bloom','bloomIntensity','sharpen','sharpenIntensity','scope','scopeFeather','exposure','contrast'])if(VISUAL_SETTINGS[key])controls.set(key,makeSetting(key,VISUAL_SETTINGS[key],imageGroup.body));
 const dataTabs=node('div','inspection-data-tabs');dataTabs.setAttribute('role','tablist');
 const tabButtons=new Map();let dataTab='overview';
 for(const key of ['overview','moons','missions']){const button=node('button','inspection-data-tab');button.type='button';button.id=`inspection-tab-${key}`;button.setAttribute('role','tab');button.setAttribute('aria-controls','inspection-data-content');button.addEventListener('click',()=>selectDataTab(key));dataTabs.append(button);tabButtons.set(key,button);}
 const dataContent=node('div','inspection-data-content');dataContent.id='inspection-data-content';dataContent.setAttribute('role','tabpanel');
 const missionContent=node('div','inspection-mission-content');
 const moonFallback=node('div','inspection-data-empty');
 data.body.append(dataTabs,dataContent,moonFallback,missionContent);
 const dock=node('nav','inspection-command-dock');
 const location=makeTray('location'),presets=makeTray('presets');
 const home=node('button','inspection-home');home.type='button';home.innerHTML=`<img src="${new URL('../../assets/relic-logo-v1.png',import.meta.url).href}" alt="" width="40" height="35"><span>RELIC</span>`;home.addEventListener('click',()=>emit('home'));
 dock.append(location.element,home,presets.element);
 const locationSearch=node('div','inspection-location-search relic-action-panel');
 const locationPills=node('div','location-pills inspection-location-pills');
 const locationRow=node('div','location-city-row inspection-location-row');
 locationRow.append(locationSearch,locationPills);location.body.append(locationRow);
 const presetGrid=node('div','button-grid inspection-preset-grid'),presetButtons=new Map();
 for(const [index,preset] of VISUAL_PRESETS.entries()){
  const button=node('button','style-btn inspection-preset');button.type='button';button.dataset.style=preset.id;button.innerHTML=`<span class="btn-icon" aria-hidden="true">${SYMBOLS[preset.id]||'◯'}</span><span class="btn-label"></span><kbd class="btn-key">${index+1}</kbd>`;button.querySelector('.btn-label').textContent=preset.label;button.addEventListener('click',()=>emit('preset',preset.id));presetGrid.append(button);presetButtons.set(preset.id,button);
 }
 const treatmentNote=node('p','inspection-treatment-note');presets.body.append(presetGrid,treatmentNote);
 const locale=node('details','locale-picker inspection-locale');
 const localeToggle=node('summary','locale-picker-button');
 const localeCode=node('span','locale-picker-code');
 const caret=node('i','inspection-language-caret');caret.innerHTML=glyph('chevron');caret.setAttribute('aria-hidden','true');
 localeToggle.append(localeCode,caret);
 const localeOptions=node('div','inspection-language-options');
 for(const [code,name] of [['en','English'],['fr','Français']]){
  const option=node('button','inspection-language-option');option.type='button';
  const badge=node('span','inspection-language-badge');badge.textContent=code.toUpperCase();badge.setAttribute('aria-hidden','true');
  const title=node('span','inspection-language-name');title.textContent=name;
  option.append(badge,title);
  option.lang=code;option.dataset.language=code;
  option.addEventListener('click',()=>{setLanguage(code);locale.open=false;localeToggle.focus();});
  localeOptions.append(option);
 }
 locale.append(localeToggle,localeOptions);
 const feedback=node('div','inspection-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');feedback.hidden=true;
 root.append(top,modules,dock,locale,feedback);document.body.append(root);
 let dashboardBody=dashboard.dataset.dashboardBody,publishedBody;
 let state={body:dashboardBody,settings:{...DEFAULTS,style:'normal'},capabilities:{}};
 let active=false,disposed=false,focusFrame=0,feedbackTimer=0;
 let compassBody,compassHeading=0,cameraState={};
 const panelOpeners=new Map();
 const disclosures=[],openPanels=new Set(),pinned=new Set(),removers=[];
 const compact=matchMedia('(max-width:700px)');
 const narrow=matchMedia('(max-width:1180px)');
 const panels={location,presets,display,data};
 for(const [key,panel] of Object.entries(panels)){
  const tray=key==='location'||key==='presets';
  disclosures.push(bindInspectionMotion({panel,isActive:()=>active&&!disposed,
   onToggle:(collapsed,options)=>collapsed?close(key,options?.explicit):show(key,panel.toggle,{focus:!tray}),
   onEscape:event=>collapsePanelOnEscape(event,{panel:panel.element,onChange:()=>close(key),returnFocusTo:()=>panel.toggle}),
   focusTarget:()=>key==='location'?command.querySelector('input'):presetButtons.get(state.settings.style),
  }));
  panel.close.addEventListener('click',()=>close(key,true));
  panel.pin?.addEventListener('click',()=>{if(pinned.has(key))pinned.delete(key);else pinned.add(key);panel.pin.setAttribute('aria-pressed',String(pinned.has(key)));panel.element.classList.toggle('dock-pinned',pinned.has(key));});
 }
 const listen=(target,type,handler,options)=>{target.addEventListener(type,handler,options);removers.push(()=>target.removeEventListener(type,handler,options));};
 listen(events,'relic-inspection-state',event=>update(event.detail||{}));
 listen(events,'relic-inspection-camera',event=>{
  if(event.detail?.body!==state.body)return;
  cameraState=event.detail;
  syncCamera();
 });
 listen(events,'relic-film-state',refresh);
 listen(narrow,'change',()=>{
  if(!narrow.matches||openPanels.size<2)return;
  const mostRecent=[...openPanels].at(-1);
  for(const key of [...openPanels])if(key!==mostRecent)close(key);
 });
 const viewport=window.visualViewport;
 const syncKeyboard=()=>root.style.setProperty('--inspection-keyboard',`${viewport?Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop):0}px`);
 if(viewport){listen(viewport,'resize',syncKeyboard);listen(viewport,'scroll',syncKeyboard);}
 listen(events,'relic-inspection-feedback',event=>showFeedback(event.detail||{}));
 listen(events,'planet-dashboard-location',()=>{if(active&&!pinned.has('location'))close('location');});
 listen(events,'relic-place-selected',()=>{if(active&&!pinned.has('location'))close('location');});
 listen(document,'pointerdown',event=>{
  if(!active)return;
  if(!locale.contains(event.target))locale.open=false;
  if(root.contains(event.target))return;
  for(const key of ['location','presets'])if(openPanels.has(key)&&!pinned.has(key))close(key);
 });
 listen(document,'keydown',event=>{
  if(!active||document.querySelector('dialog[open]')||event.defaultPrevented)return;
  if(event.key==='Escape'){
   if(locale.open){event.preventDefault();locale.open=false;localeToggle.focus();return;}
   const key=[...openPanels].reverse().find(key=>!pinned.has(key));if(key){event.preventDefault();event.stopPropagation();close(key,true);}return;
  }
  if(event.ctrlKey||event.metaKey||event.altKey||event.target.closest?.('input,textarea,select,[contenteditable=true]'))return;
  if(/^[1-6]$/.test(event.key)){event.preventDefault();emit('preset',VISUAL_PRESETS[Number(event.key)-1].id);}
 });
 listen(dataTabs,'keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const keys=[...tabButtons.keys()],index=keys.indexOf(dataTab),next=event.key==='Home'?0:event.key==='End'?keys.length-1:(index+(event.key==='ArrowLeft'?-1:1)+keys.length)%keys.length;
  event.preventDefault();selectDataTab(keys[next]);tabButtons.get(keys[next]).focus();
 });
 const observer=new MutationObserver(()=>{
  const nextBody=dashboard.dataset.dashboardBody;
  if(nextBody!==dashboardBody){
   // The dashboard can identify a parent world while the renderer is locked
   // on a named moon or spacecraft. Prefer the renderer's actual selection.
   if(state.body===dashboardBody||nextBody==='overview')state.body=nextBody;
   dashboardBody=nextBody;dataTab='overview';renderDestinations();
  }
  refresh();
 });observer.observe(dashboard,{attributes:true,attributeFilter:['data-dashboard-body','data-panel-open']});
 const contentObserver=new MutationObserver(()=>{if(active)organizeData();});contentObserver.observe(inspector,{childList:true,subtree:true});
 const themeObserver=new MutationObserver(render);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
 const formObserver=new MutationObserver(()=>{if(active&&openPanels.has('location')){if(command.hidden)command.hidden=false;if(command.inert)command.inert=false;}});formObserver.observe(command,{attributes:true,attributeFilter:['hidden','inert']});
 const unsubscribe=onLanguageChange(()=>{render();renderDestinations();});
 refresh();render();
 events.dispatchEvent(new CustomEvent('relic-inspection-mounted'));
 return {element:root,get active(){return active;},refresh,update,show,close,openLocation:opener=>show('location',opener),openData:opener=>show('data',opener),
  dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(focusFrame);clearTimeout(feedbackTimer);for(const remove of removers)remove();for(const controller of disclosures)controller.destroy();observer.disconnect();contentObserver.disconnect();themeObserver.disconnect();formObserver.disconnect();unsubscribe?.();restore();for(const marker of markers.values())marker.remove();root.remove();document.body.classList.remove('has-inspection-shell');},
 };

 function emit(action,value){if(disposed)return;events.dispatchEvent(new CustomEvent('relic-inspection-command',{detail:{action,value}}));}
 function copy(){return COPY[getLanguage()==='fr'?'fr':'en'];}
 function button(key,className='inspection-icon-button'){const result=node('button',className);result.type='button';result.dataset.inspectionCopy=key;return result;}
 function makeGroup(key){const element=node('section','pp-toggle-group inspection-setting-group'),heading=node('h3','inspection-group-title'),body=node('div','inspection-setting-group-body');heading.dataset.inspectionCopy=key;element.append(heading,body);return {element,body};}
 function makeModule(key){
  const element=node('section','panel-collapsible collapsed inspection-module');element.id=`inspection-${key}`;
  const toggle=button(key,'inspection-module-toggle');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',`inspection-${key}-body`);toggle.innerHTML='<span class="inspection-module-label"></span><span class="panel-divider"></span>'+glyph('chevron');
  const body=node('div','inspection-module-body');body.id=`inspection-${key}-body`;body.hidden=true;body.inert=true;
  const close=button('close');close.innerHTML=glyph('close');close.classList.add('inspection-module-close');body.append(close);
  element.append(toggle,body);return {element,toggle,body,close};
 }
 function makeTray(key){
  const element=node('section','panel-collapsible collapsed inspection-tray');element.id=`inspection-${key}`;
  const toggle=button(key,'dock-tray-toggle inspection-tray-toggle');
  toggle.setAttribute('aria-controls',`inspection-${key}-popover`);toggle.setAttribute('aria-expanded','false');
  const label=node('span',key==='location'?'location-toolbar-label':'panel-title');
  const icon=node('i',`dock-label-icon dock-label-icon-${key}`);icon.setAttribute('aria-hidden','true');
  const text=node('span','inspection-tray-label');label.append(icon,text);toggle.append(label);
  const body=node('div','dock-popover-content inspection-tray-popover');body.id=`inspection-${key}-popover`;body.hidden=true;body.inert=true;
  const header=node('div','inspection-popover-heading'),title=node('h2','inspection-popover-title');title.dataset.inspectionCopy=key;
  const close=button('close');close.innerHTML=glyph('close');const pin=button('pin','inspection-icon-button dock-pin-btn');
  pin.innerHTML=`<img src="${new URL('../../vendor/gods-eye-view/icons/pin.svg',import.meta.url).href}" alt="">`;pin.setAttribute('aria-pressed','false');
  header.append(title,pin,close);body.append(header);element.append(toggle,body);return {element,toggle,body,close,pin};
 }
 function makeSetting(key,descriptor,host){
  const range=descriptor.type==='range';
  const row=node('label',`inspection-setting ${range?'inspection-range pp-slider-row visible':'inspection-switch pp-toggle-btn'}`);row.dataset.setting=key;
  const label=node('span',`inspection-setting-label ${range?'pp-slider-mini-label':'pp-label'}`);
  const input=document.createElement('input');input.type=range?'range':'checkbox';input.id=`inspection-setting-${key}`;
  const output=node('output','inspection-setting-value pp-slider-value');output.htmlFor=input.id;output.setAttribute('aria-live','off');
  const reason=node('small','inspection-setting-reason');reason.id=`${input.id}-reason`;reason.hidden=true;
  if(range){
   input.className='gev-quantitative-slider pp-slider';
   input.min=descriptor.min;input.max=descriptor.max;input.step=descriptor.step||1;input.value=descriptor.default;
   row.append(label,output,input);
  }else{input.checked=Boolean(descriptor.default);row.append(label,input);}
  row.append(reason);
  input.addEventListener(range?'input':'change',()=>{
   const value=range?input.valueAsNumber:input.checked;
   if(key.startsWith('style:'))emit('styleParams',{[key.slice(6)]:value});
   else emit(key,value);
  });
  host.append(row);return {row,label,input,output,reason,descriptor};
 }
 function restore(){
  for(const [item,marker] of markers)if(marker.parentNode)marker.after(item);
  locale.open=false;
 }
 function refresh(){
  if(disposed)return;
  const next=inspectionActive({body:dashboard.dataset.dashboardBody,film:events.__relicFilmActive===true||document.documentElement.dataset.relicFilm==='active'});
  if(next!==active){active=next;root.hidden=!active;root.inert=!active;document.body.classList.toggle('has-inspection-shell',active);
   if(active){
    locationSearch.append(command);dataContent.prepend(inspector);
    if(compact.matches&&dashboard.dataset.panelOpen==='true'){
     events.dispatchEvent(new CustomEvent('planet-dashboard-panel',{detail:{open:false}}));
    }
    renderDestinations();
   }
   else{for(const key of [...openPanels])close(key);restore();command.hidden=true;command.inert=true;}
  }
  if(!active)return;
  if(dashboard.dataset.panelOpen==='true'&&!openPanels.has('data')){
   close('display');
   if(narrow.matches){close('location');close('presets');}
   openPanel('data');
  }else if(dashboard.dataset.panelOpen!=='true')close('data');
  root.dataset.world=dashboard.dataset.dashboardBody;root.classList.toggle('is-solar-overview',dashboard.dataset.dashboardBody==='overview');organizeData();syncCamera();syncSettings();
 }
 function update(next){
  publishedBody=next.body;
  cameraState=next;
  const previousBody=state.body;state={...state,...next,settings:{...state.settings,...next.settings},capabilities:next.capabilities||state.capabilities};
  if(previousBody!==state.body){selectDataTab('overview');renderDestinations();}
  refresh();
 }
 function openPanel(key){const panel=panels[key];if(!panel||openPanels.has(key))return;openPanels.add(key);setInspectionPanelExpanded(panel,true);}
 function show(name,opener,{focus=true}={}){
  if(!active||!panels[name])return;
  if(name==='location'&&dashboard.dataset.dashboardBody==='overview'){document.querySelector('#rail-worlds')?.click();return;}
  if(opener)panelOpeners.set(name,opener);
  // The trays share one popover position, including when one is pinned.
  if(name==='location'||name==='presets')for(const key of ['location','presets'])if(key!==name)close(key);
  if(narrow.matches)for(const key of [...openPanels])if(key!==name)close(key);
  if(name==='display'||name==='data')for(const key of ['display','data'])if(key!==name)close(key);
  openPanel(name);
  if(name==='data')events.dispatchEvent(new CustomEvent('planet-dashboard-panel',{detail:{open:true}}));
  if(name==='location'){command.hidden=false;command.inert=false;}
  cancelAnimationFrame(focusFrame);
  if(!focus)return;
  focusFrame=requestAnimationFrame(()=>{
   if(!active||!openPanels.has(name))return;
   const target=name==='location'?command.querySelector('input'):name==='data'?tabButtons.get(dataTab):name==='presets'?presetButtons.get(state.settings.style):panels[name].body.querySelector('input:not(:disabled)');
   (target||panels[name].toggle).focus({preventScroll:true});
  });
 }
 function close(key,returnFocus=false){
  if(!key){for(const opened of [...openPanels])close(opened);return;}
  if(!panels[key]||!openPanels.has(key))return;cancelAnimationFrame(focusFrame);const panel=panels[key];openPanels.delete(key);setInspectionPanelExpanded(panel,false);
  if(key==='data'&&dashboard.dataset.panelOpen==='true')events.dispatchEvent(new CustomEvent('planet-dashboard-panel',{detail:{open:false}}));
  const opener=panelOpeners.get(key);panelOpeners.delete(key);
  if(returnFocus&&active)(opener?.isConnected&&opener.getClientRects().length?opener:panel.toggle).focus({preventScroll:true});
 }
 function render(){
  if(disposed)return;const words=copy();top.setAttribute('aria-label',words.actions);dock.setAttribute('aria-label',words.location+' · '+words.presets);home.setAttribute('aria-label',words.home);
  for(const [key,action] of actions){action.setAttribute('aria-label',words[key]);action.title=words[key];}
  syncCamera();
  for(const element of root.querySelectorAll('[data-inspection-copy]')){const text=words[element.dataset.inspectionCopy];element.setAttribute('aria-label',text);element.title=text;if(element.matches('h2,h3'))element.textContent=text;else if(element.matches('.inspection-module-toggle'))element.querySelector('.inspection-module-label').textContent=text;else if(element.matches('.inspection-tray-toggle'))element.querySelector('.inspection-tray-label').textContent=text;}
  const language=getLanguage();
  localeCode.textContent=language.toUpperCase();
  localeToggle.setAttribute('aria-label',language==='fr'?'Langue · Français':'Language · English');
  for(const option of localeOptions.children)option.setAttribute('aria-pressed',String(option.dataset.language===language));
  for(const [key,button] of tabButtons){button.textContent=words[key];button.setAttribute('aria-selected',String(dataTab===key));button.tabIndex=dataTab===key?0:-1;}
  treatmentNote.textContent=words.styleSimulated;
  moonFallback.replaceChildren();const p=node('p','');p.textContent=words.noMoons;const go=button('home','inspection-text-button');go.textContent=words.home;go.addEventListener('click',()=>emit('home'));moonFallback.append(p,go);
  syncSettings();selectDataTab(dataTab);
 }
 function syncCamera(){
  const camera=cameraState.body===state.body?cameraState:{};
  const tilt=Number(camera.orientationTargetTiltDeg??camera.tiltDeg)>30;
  const tiltButton=actions.get('tilt');
  tiltButton.setAttribute('aria-pressed',String(tilt));
  const fr=getLanguage()==='fr';
  tiltButton.setAttribute('aria-label',tilt?(fr?'Revenir à la vue verticale':'Return to vertical view'):(fr?'Incliner la vue':'Tilt to oblique view'));
  const north=actions.get('north');
  const heading=Number(camera.headingDeg)||0;
  if(compassBody!==state.body){compassBody=state.body;compassHeading=heading;}
  else compassHeading+=((heading-compassHeading)%360+540)%360-180;
  north.style.setProperty('--camera-heading',`${compassHeading}deg`);
  const bearing=Math.round((heading%360+360)%360)%360;
  const label=copy().north;
  north.setAttribute('aria-label',Number.isFinite(camera.headingDeg)?`${label}. ${fr?'Cap':'Heading'} ${bearing}°`:label);
  north.dataset.northUp=String(bearing===0);
  top.dataset.cameraMotion=String(Boolean(camera.cameraMotion));
  for(const [key,control] of actions){
   control.disabled=state.capabilities[key]===false;
   control.setAttribute('aria-busy',String(Boolean(camera.cameraMotion&&camera.cameraAction===key)));
  }
 }
 function syncSettings(){
  satelliteGroup.element.hidden=state.body!=='earth';
  const style=state.settings.style||'normal',language=getLanguage()==='fr'?'fr':'en';
  const ready=publishedBody===state.body;
  for(const [id,button] of presetButtons){const selected=id===style;button.disabled=!ready;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));}
  for(const [key,control] of controls){
   const toggle={bloomIntensity:'bloom',sharpenIntensity:'sharpen',scopeFeather:'scope'}[key];
   control.row.hidden=Boolean(toggle&&!state.settings[toggle]);
   syncSetting(key,control,state.settings[key],ready&&(state.capabilities[key]!==false));
  }
  if(styleGroup.element.dataset.style!==style){
   styleGroup.element.dataset.style=style;styleGroup.body.replaceChildren();styleControls.clear();
   for(const descriptor of STYLE_PARAMETERS[style]||[])styleControls.set(descriptor.key,makeSetting('style:'+descriptor.key,{...descriptor,type:'range'},styleGroup.body));
  }
  styleGroup.element.hidden=!styleControls.size;
  for(const [key,control] of styleControls)syncSetting(key,control,state.settings.styleParams?.[key],ready);

  function syncSetting(key,{input,label,output,reason,descriptor,row},value=descriptor.default,supported){
   input.disabled=!supported;row.dataset.available=String(supported);
   reason.hidden=supported;
   if(supported){input.removeAttribute('aria-describedby');}
   else{
    reason.textContent=AVAILABILITY[language][ready?key:'loading']||copy().unsupported;
    input.setAttribute('aria-describedby',reason.id);
   }
   label.textContent=(language==='fr'?descriptor.fr:descriptor.label)||key;
   input.setAttribute('aria-label',label.textContent);
   if(input.type==='checkbox'){
    input.checked=Boolean(value);row.classList.toggle('active',input.checked&&supported);
   }else{
    vRangeValue.updated(input,{value});
    const digits=(input.step.split('.')[1]||'').length;
    const number=input.valueAsNumber.toLocaleString(language,{minimumFractionDigits:digits,maximumFractionDigits:digits,useGrouping:false});
    output.value=PERCENT_SETTINGS.has(key)?`${number}%`:number;
   }
  }
 }
 function selectDataTab(key){
  dataTab=key;dataContent.dataset.tab=key;dataContent.setAttribute('aria-labelledby',`inspection-tab-${key}`);
  for(const [name,button] of tabButtons){button.setAttribute('aria-selected',String(name===key));button.tabIndex=name===key?0:-1;}
  organizeData();

 }
 function organizeData(){
  inspector.dataset.inspectionTab=dataTab;
  for(const button of inspector.querySelectorAll('.solar-system-actions > button')){
   const text=button.textContent.toLocaleLowerCase();button.dataset.inspectionPurpose=/moon|lune|satellite|orbite|back to|retour/.test(text)?'moons':/surface|apollo|jezero|tycho|survey|cratère/.test(text)?'missions':'general';
  }
  const moons=Boolean(inspector.querySelector('.solar-moon-catalogue'));moonFallback.hidden=dataTab!=='moons'||moons;
  missionContent.hidden=dataTab!=='missions';
 }
 function renderDestinations(){
  const body=state.body||dashboardBody,sites=PLANET_SITES[body]||[],destinations=body==='earth'?CITIES.map(([name,lat,lon])=>({name,lat,lon,range:35000})):sites.map(site=>({...site,range:site.terrainRange||(site.local?3000:250000)}));
  locationPills.replaceChildren();missionContent.replaceChildren();
  const heading=node('h3','inspection-group-title');heading.textContent=copy().missions;missionContent.append(heading);
  for(const destination of destinations){
   const make=className=>{
    const button=node('button',className);button.type='button';
    const name=getLanguage()==='en'?({jezero:'Jezero Crater',tycho:'Tycho Crater'}[destination.id]||destination.name):destination.name;
    button.textContent=name;
    button.addEventListener('click',()=>{
     emit('locate',{body,lat:destination.lat,lon:destination.lon,range:destination.range});
     if(!pinned.has('location'))close('location',true);
    });
    return button;
   };
   locationPills.append(make('location-pill inspection-location-pill'));
   if(body!=='earth')missionContent.append(make('inspection-mission-destination'));
  }
  if(!sites.length&&!['earth','67p','philae','rosetta'].includes(body)){const p=node('p','inspection-data-empty');p.textContent=copy().noSites;missionContent.append(p);}
  if(body==='earth'){for(const name of ['Moon','Mars','67P · Rosetta']){const id=name==='Moon'?'moon':name==='Mars'?'mars':'67p';const button=node('button','inspection-mission-destination');button.type='button';button.textContent=getLanguage()==='fr'&&name==='Moon'?'Lune':name;button.addEventListener('click',()=>{const event=new CustomEvent('planet-dashboard-world',{detail:{body:id},cancelable:true});events.dispatchEvent(event);});missionContent.append(button);}}
  if(!destinations.length){const p=node('p','inspection-location-note');p.textContent=copy().coordinates;locationPills.append(p);}
 }
 function showFeedback(detail){
  if(!active||!detail.message&&!detail.url)return;clearTimeout(feedbackTimer);feedback.replaceChildren();const text=node('span','');text.textContent=detail.message||copy().shareHint;feedback.append(text);
  feedback.hidden=false;
  if(detail.url){const input=document.createElement('input');input.type='url';input.readOnly=true;input.value=detail.url;input.setAttribute('aria-label',copy().shareHint);feedback.append(input);input.focus({preventScroll:true});input.select();}feedbackTimer=setTimeout(()=>{feedback.hidden=true;},detail.url?16000:4000);
 }
}
