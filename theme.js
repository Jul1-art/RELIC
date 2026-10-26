import { getLanguage, onLanguageChange } from './atlas-live.js?v=3';
import { getPreferences, setPreferences } from './app-settings.js';

const root = document.documentElement;
function render() {
  const night = root.dataset.theme !== 'day';
  const english = getLanguage() === 'en';
  const label = night ? (english ? 'Switch to day mode' : 'Passer en mode jour') : (english ? 'Switch to night mode' : 'Passer en mode nuit');
  for (const button of document.querySelectorAll('[data-theme-toggle]')) {
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(night));
    button.title = label;
  }
  const color = document.querySelector('meta[name="theme-color"]');
  if (color) color.content = night ? '#050505' : '#f5f5f3';
}

// Delegation also supports controls moved into the shared world dashboard.
document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-theme-toggle]');
  if (!button || button.disabled || button.closest('[inert]')) return;
  setPreferences({ theme:getPreferences().theme === 'night' ? 'day' : 'night' });
});
onLanguageChange(render);
window.addEventListener('relic-preferences-change', render);
render();
