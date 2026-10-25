import { worldIcon } from './world-icons.js';
import { getLanguage, onLanguageChange } from './atlas-live.js?v=3';

// Decorative icons are bundled SVG paths: no icon-font or CDN requests.
for (const node of document.querySelectorAll('[data-world-icon]')) {
  node.innerHTML = worldIcon(node.dataset.worldIcon);
}

const copy = {
  en: { imagery:'Imagery', settings:'Settings', showDetails:'Show view details', hideDetails:'Hide view details', currentView:'Current view', closeImagery:'Close imagery' },
  fr: { imagery:'Imagerie', settings:'Réglages', showDetails:'Afficher les détails de la vue', hideDetails:'Réduire les détails de la vue', currentView:'Vue actuelle', closeImagery:'Fermer l’imagerie' },
};
const strings = () => copy[getLanguage() === 'fr' ? 'fr' : 'en'];

function fold(panel, collapsed) {
  if (!panel) return;
  panel.classList.toggle('collapsed', collapsed);
  const button = panel.querySelector('[data-world-panel-toggle], #panel-toggle');
  if (!button) return;
  button.setAttribute('aria-expanded', String(!collapsed));
  button.setAttribute('aria-label', collapsed ? strings().showDetails : strings().hideDetails);
}

for (const button of document.querySelectorAll('[data-world-panel-toggle]')) {
  const panel = document.getElementById(button.dataset.worldPanelToggle);
  if (!panel) continue;
  button.addEventListener('click', () => fold(panel, !panel.classList.contains('collapsed')));
}

// Start with the globe visible on compact screens. Opening a panel is explicit.
if (matchMedia('(max-width: 760px), (max-height: 600px)').matches) {
  for (const panel of document.querySelectorAll('.explorer-panel, .site-panel')) fold(panel, true);
}

for (const button of document.querySelectorAll('[data-world-close]')) {
  button.addEventListener('click', () => {
    const drawer = document.getElementById(button.dataset.worldClose);
    if (!drawer) return;
    drawer.hidden = true;
    const trigger = document.querySelector(`[aria-controls="${CSS.escape(drawer.id)}"]`);
    trigger?.setAttribute('aria-expanded', 'false');
    trigger?.focus({ preventScroll:true });
  });
}

onLanguageChange(() => {
  for (const node of document.querySelectorAll('[data-world-copy]')) {
    const value = strings()[node.dataset.worldCopy];
    if (value) node.textContent = value;
  }
  for (const button of document.querySelectorAll('[data-app-settings]')) {
    button.title = strings().settings;
    button.setAttribute('aria-label', strings().settings);
  }
  for (const button of document.querySelectorAll('[data-world-panel-toggle]')) {
    button.setAttribute('aria-label', button.getAttribute('aria-expanded') === 'false' ? strings().showDetails : strings().hideDetails);
  }
  for (const button of document.querySelectorAll('[data-world-close="map-options"]')) button.setAttribute('aria-label', strings().closeImagery);
  const title = document.getElementById('site-title');
  if (title && ['Data','Données','Current view','Vue actuelle'].includes(title.textContent)) title.textContent = strings().currentView;
});
