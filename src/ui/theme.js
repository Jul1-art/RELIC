import { getPreferences, setPreferences } from './app-settings.js';
import { getLanguage, onLanguageChange } from '../atlas/atlas-live.js?v=3';

/** One saved appearance drives the dock, panels and every planetary view. */
function renderTheme(){
  const day=getPreferences().theme==='day',fr=getLanguage()==='fr';
  const label=day?(fr?'Passer en mode sombre':'Switch to dark mode'):(fr?'Passer en mode clair':'Switch to light mode');
  const root=document.documentElement;
  root.dataset.theme=day?'day':'night';root.dataset.accent='mono';root.style.colorScheme=day?'light':'dark';
  const color=document.querySelector('meta[name="theme-color"]');
  if(color)color.content=day?'#f5f5f7':'#000000';
  for(const button of document.querySelectorAll('[data-theme-toggle]')){
    button.dataset.themeState=day?'day':'night';button.dataset.railLabel=label;
    button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(day));button.title=label;
    const text=button.querySelector('.rail-button-label');if(text)text.textContent=label;
  }
}

document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-theme-toggle]');
  if(event.defaultPrevented||!button||button.disabled||button.closest('[inert]'))return;
  event.preventDefault();setPreferences({theme:getPreferences().theme==='day'?'night':'day'});
});
window.addEventListener('relic-preferences-change',renderTheme);
window.addEventListener('relic-action-rail-mounted',renderTheme);
window.addEventListener('storage',event=>{
  if(event.key==='nasa-atlas-theme'&&['day','night'].includes(event.newValue)&&getPreferences().theme!==event.newValue)setPreferences({theme:event.newValue});
});
onLanguageChange(renderTheme);
renderTheme();
