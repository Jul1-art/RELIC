const ENDPOINT = './api/live/atlas';
const LABELS = {
  fr:{ title:'Données', distance:'Distance au Soleil', speed:'Vitesse orbitale', wind:'Vent solaire · Terre', calculated:'Position calculée pour', measured:'Mesure du', source:'Source', unavailable:'Indisponible', stale:'Dernière mesure disponible', other:'', loading:'Chargement…' },
  en:{ title:'Data', distance:'Distance from Sun', speed:'Orbital speed', wind:'Solar wind · Earth', calculated:'Position calculated for', measured:'Measured', source:'Source', unavailable:'Unavailable', stale:'Latest available reading', other:'', loading:'Loading…' },
};

let language = 'en';
try { language = localStorage.getItem('nasa-atlas-language') === 'fr' ? 'fr' : 'en'; } catch {}
const languageListeners = new Set();
document.documentElement.lang = language;

export function getLanguage() { return language; }
export function setLanguage(next) {
  if (next !== 'fr' && next !== 'en') return;
  language = next;
  try { localStorage.setItem('nasa-atlas-language', next); } catch {}
  document.documentElement.lang = next;
  for (const listener of languageListeners) listener(next);
}
export function onLanguageChange(listener) {
  languageListeners.add(listener);
  listener(language);
  return () => languageListeners.delete(listener);
}

for (const button of document.querySelectorAll('[data-language-toggle]')) {
  const french = document.createElement('span');
  const english = document.createElement('span');
  french.textContent = 'FR';
  english.textContent = 'EN';
  button.replaceChildren(french, english);
  button.addEventListener('click', () => setLanguage(language === 'fr' ? 'en' : 'fr'));
  onLanguageChange(next => {
    button.dataset.activeLanguage = next;
    button.setAttribute('aria-pressed', String(next === 'en'));
    button.setAttribute('aria-label', next === 'fr' ? 'Switch to English' : 'Passer en français');
    button.title = next === 'fr' ? 'English' : 'Français';
  });
}

function timeLabel(stamp) {
  if (!stamp || !Number.isFinite(Date.parse(stamp))) return '';
  return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle:'medium', timeStyle:'short', timeZone:'UTC',
  }).format(new Date(stamp)) + ' UTC';
}

export function startLiveData(element, getBody, onPositions = () => {}) {
  if (!element) return;
  const title = document.createElement('div'); title.className = 'live-title';
  const titleText = document.createElement('strong');
  title.append(titleText);
  const body = document.createElement('div'); body.className = 'live-body';
  element.replaceChildren(title, body);
  let data = null;

  function metric(label, value) {
    const row = document.createElement('div'); row.className = 'live-metric';
    const name = document.createElement('span'); name.textContent = label;
    const number = document.createElement('strong'); number.textContent = value;
    row.append(name, number);
    body.append(row);
  }

  function source(value, stamp, state) {
    const caption = document.createElement('p'); caption.className = 'live-source';
    if (state === 'stale') {
      const warning = document.createElement('span'); warning.className = 'live-warning';
      warning.textContent = LABELS[language].stale;
      caption.append(warning, document.createElement('br'));
    }
    const link = document.createElement('a');
    link.href = value.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.textContent = `${LABELS[language].source}: ${value.source}`;
    caption.append(link, document.createTextNode(` · ${timeLabel(stamp)}`));
    body.append(caption);
  }

  function render() {
    const t = LABELS[language];
    titleText.textContent = t.title;
    body.replaceChildren();
    if (!data) { body.textContent = t.loading; element.hidden = false; return; }
    const id = getBody();
    const position = data.positions?.[id];
    if (position?.state === 'current' || position?.state === 'stale') {
      const formatter = new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits:0 });
      metric(t.distance, `${formatter.format(position.distanceFromSunKm)} km`);
      metric(t.speed, `${position.speedKmS.toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits:2 })} km/s`);
      source(position, position.validAt, position.state);
    } else if (id !== 'sun' && id !== 'moon') {
      metric(t.distance, '—');
      const note = document.createElement('p'); note.className = 'live-warning'; note.textContent = t.unavailable;
      body.append(note);
    }
    if (id === 'earth') {
      const wind = data.solarWind;
      if (wind?.state === 'current' || wind?.state === 'stale') {
        metric(t.wind, `${wind.speedKmS.toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits:1 })} km/s`);
        source(wind, wind.measuredAt, wind.state);
      } else {
        metric(t.wind, '—');
        const note = document.createElement('p'); note.className = 'live-warning'; note.textContent = t.unavailable;
        body.append(note);
      }
    }
    element.hidden = !body.textContent.trim();
  }

  async function refresh() {
    try {
      const response = await fetch(ENDPOINT, { cache:'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const next = await response.json();
      if (!next.positions || !next.solarWind) throw new Error('Invalid live data');
      data = next;
      onPositions(next.positions);
    } catch {
      if (!data) data = { positions:{}, solarWind:{ state:'unavailable' } };
    }
    render();
  }

  onLanguageChange(render);
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 120000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  return { render, refresh };
}
