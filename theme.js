import { getLanguage, onLanguageChange } from './atlas-live.js?v=3';
import { getPreferences, setPreferences } from './app-settings.js';

const root = document.documentElement;
function render() {
  const night = root.dataset.theme !== 'day';
  const english = getLanguage() === 'en';
  const label = night ? (english ? 'Switch to day mode' : 'Passer en mode jour') : (english ? 'Switch to night mode' : 'Passer en mode nuit');
  for (const button of document.querySelectorAll('[data-theme-toggle]')) {
    button.setAttribute('aria-label',label); button.title = label;
    button.setAttribute('aria-pressed',String(night));
  }
  const color = document.querySelector('meta[name="theme-color"]');
  if (color) color.content = night ? '#050505' : '#f5f5f3';
}
for (const button of document.querySelectorAll('[data-theme-toggle]')) {
  button.addEventListener('click',() => setPreferences({ theme:getPreferences().theme === 'night' ? 'day' : 'night' }));
}
onLanguageChange(render);
window.addEventListener('relic-preferences-change',render);
render();
