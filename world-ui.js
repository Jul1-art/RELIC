import { hydrateWorldIcons } from './world-icons.js';
import { getLanguage, onLanguageChange } from './atlas-live.js?v=3';
import { initializePlanetDashboard } from './planet-dashboard.js';

const dashboard = initializePlanetDashboard();
hydrateWorldIcons();

const copy = {
  en:{imagery:'Imagery',settings:'Settings',currentView:'Current view',closeImagery:'Close imagery'},
  fr:{imagery:'Imagerie',settings:'Réglages',currentView:'Vue actuelle',closeImagery:'Fermer l’imagerie'},
};
const strings=()=>copy[getLanguage()==='fr'?'fr':'en'];
for(const button of document.querySelectorAll('[data-world-close]')){
  button.addEventListener('click',()=>{
    const drawer=document.getElementById(button.dataset.worldClose);
    if(!drawer)return;
    drawer.hidden=true;
    const trigger=document.querySelector(`[aria-controls="${CSS.escape(drawer.id)}"]`);
    trigger?.setAttribute('aria-expanded','false');trigger?.focus({preventScroll:true});
  });
}
if(dashboard){
  for(const selector of ['#map-options','#site-summary']){
    const panel=document.querySelector(selector);if(!panel)continue;
    const observer=new MutationObserver(()=>{if(!panel.hidden)dashboard.setPanel(true);});
    observer.observe(panel,{attributes:true,attributeFilter:['hidden']});
  }
}
onLanguageChange(()=>{
  for(const item of document.querySelectorAll('[data-world-copy]')){const value=strings()[item.dataset.worldCopy];if(value)item.textContent=value;}
  for(const button of document.querySelectorAll('[data-app-settings]')){button.title=strings().settings;button.setAttribute('aria-label',strings().settings);}
  for(const button of document.querySelectorAll('[data-world-close="map-options"]'))button.setAttribute('aria-label',strings().closeImagery);
  const title=document.getElementById('site-title');if(title&&['Data','Données','Current view','Vue actuelle'].includes(title.textContent))title.textContent=strings().currentView;
});
