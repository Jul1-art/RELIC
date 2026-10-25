import { getLanguage, onLanguageChange } from './atlas-live.js?v=3';

const button = document.querySelector('[data-theme-toggle]');
const root = document.documentElement;
const themeColor = document.querySelector('meta[name="theme-color"]');

function render() {
  const night = root.dataset.theme !== 'day';
  const english = getLanguage() === 'en';
  const label = night
    ? (english ? 'Switch to day mode' : 'Passer en mode jour')
    : (english ? 'Switch to night mode' : 'Passer en mode nuit');
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', String(night));
  button.title = label;
  themeColor.content = night ? '#090e18' : '#eef2f8';
}

button.addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'night' ? 'day' : 'night';
  try { localStorage.setItem('nasa-atlas-theme', root.dataset.theme); } catch { /* Private mode. */ }
  render();
});
onLanguageChange(render);
