import { backendJSON, publicRequests } from '../core/atlas-services.js';
import { approximatePositions, parseSolarWind } from './orbital-data.js';

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

const LABELS = {
  fr:{ title:'Données', distance:'Distance au Soleil', speed:'Vitesse orbitale', wind:'Vent solaire · Terre', source:'Source', stale:'Dernière mesure disponible', model:'NASA/JPL · modèle orbital approché (1800–2050)' },
  en:{ title:'Data', distance:'Distance from Sun', speed:'Orbital speed', wind:'Solar wind · Earth', source:'Source', stale:'Latest available measurement', model:'NASA/JPL · approximate orbital model (1800–2050)' },
};
const WIND_URL = 'https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json';
const WIND_BACKUP = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json';
const WIND_STORAGE = 'relic:data:solar-wind-v1';
const subscribers = new Set();
let sharedData, request, refreshedAt = 0, interval;

function validWind(value) {
  const age = Date.now() - Date.parse(value?.measuredAt || '');
  return value && ['current','stale'].includes(value.state) && Number.isFinite(value.speedKmS)
    && value.speedKmS > 0 && value.speedKmS <= 3000 && age >= -300000 && age <= 6*3600000;
}
function storedWind() {
  try { const value = JSON.parse(localStorage.getItem(WIND_STORAGE) || 'null'); return validWind(value) ? { ...value, state:Date.now()-Date.parse(value.measuredAt)>30*60000?'stale':value.state } : null; } catch { return null; }
}
function saveWind(value) { try { localStorage.setItem(WIND_STORAGE, JSON.stringify(value)); } catch {} }
function broadcast() { for (const render of subscribers) render(); }
function initialData() { return { positions:approximatePositions(), solarWind:storedWind() }; }
function validPosition(value) { return value && ['current','stale','estimated','ephemeris'].includes(value.state) && Number.isFinite(value.distanceFromSunKm) && value.distanceFromSunKm>0 && Number.isFinite(value.speedKmS) && value.speedKmS>0; }

export async function refreshAtlasData({ force = false } = {}) {
  if (request) return request;
  if (!force && sharedData && Date.now() - refreshedAt < 120000) return sharedData;
  sharedData = { ...initialData(), solarWind:validWind(sharedData?.solarWind) ? sharedData.solarWind : storedWind() };
  broadcast();
  request = (async () => {
    let backend;
    try { backend = await backendJSON('./api/live/atlas', { ttl:120000, timeout:3500 }); } catch { /* Static hosts use documented public sources below. */ }
    if (backend?.positions && typeof backend.positions === 'object') {
      for (const [id,value] of Object.entries(backend.positions)) if (validPosition(value)) sharedData.positions[id] = value;
      if (validWind(backend.solarWind)) sharedData.solarWind = backend.solarWind;
      broadcast();
    }
    if (!validWind(backend?.solarWind)) {
      for (const [url,group] of [[WIND_URL,'noaa-summary'],[WIND_BACKUP,'noaa-rtsw']]) {
        try {
          const rows = await publicRequests.json(url, { ttl:120000, timeout:6500, group });
          const wind = parseSolarWind(rows);
          if (wind) { sharedData.solarWind = wind; saveWind(wind); break; }
        } catch (error) {
          // A provider rate limit is a pause, not a reason to try another endpoint.
          if ([429,'cooldown'].includes(error.code)) break;
        }
      }
    } else saveWind(backend.solarWind);
    if (!validWind(sharedData.solarWind)) sharedData.solarWind = null;
    refreshedAt = Date.now();
    broadcast();
    return sharedData;
  })().finally(() => { request = null; });
  return request;
}

export function startLiveData(element,getBody,onPositions=()=>{},{getModelDate,getModelPosition}={}) {
  if (!element) return;
  const title = document.createElement('div'); title.className = 'live-title';
  const titleText = document.createElement('strong'); title.append(titleText);
  const body = document.createElement('div'); body.className = 'live-body';
  element.replaceChildren(title, body);
  if (!sharedData) sharedData = initialData();
  let disposed = false;

  function metric(label, value) {
    const row = document.createElement('div'); row.className = 'live-metric';
    const name = document.createElement('span'); name.textContent = label;
    const number = document.createElement('strong'); number.textContent = value;
    row.append(name, number); body.append(row);
  }
  function source(value, stamp) {
    const caption = document.createElement('p'); caption.className = 'live-source';
    if (value.state === 'stale' || value.kind === 'measurement' && Date.now()-Date.parse(stamp)>30*60000) {
      const note = document.createElement('span'); note.className = 'live-warning';
      note.textContent = LABELS[language].stale; caption.append(note, document.createElement('br'));
    }
    const link = document.createElement('a'); link.href = value.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.textContent = value.kind === 'model' ? LABELS[language].model : `${LABELS[language].source}: ${value.source}`;
    caption.append(link, document.createTextNode(` · ${timeLabel(stamp)}`)); body.append(caption);
  }
  function render() {
    if (disposed) return;
    const t = LABELS[language]; titleText.textContent = t.title; body.replaceChildren();
    const id=getBody(),position=getModelPosition?getModelPosition(id,getModelDate?.()||new Date()):getModelDate?approximatePositions(getModelDate())[id]:sharedData.positions?.[id];
    if (validPosition(position)) {
      const estimated = position.state === 'estimated';
      const formatter = new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits:0 });
      const distance = estimated ? Math.round(position.distanceFromSunKm / 1000)*1000 : position.distanceFromSunKm;
      metric(t.distance, `${estimated?'≈ ':''}${formatter.format(distance)} km`);
      metric(t.speed, `${estimated?'≈ ':''}${position.speedKmS.toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits:estimated?1:2 })} km/s`);
      source(position, position.validAt);
    }
    const wind = sharedData.solarWind;
    if (id === 'earth' && validWind(wind)) {
      metric(t.wind, `${wind.speedKmS.toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits:1 })} km/s`);
      source(wind, wind.measuredAt);
    }
    element.hidden = !body.textContent.trim();
    onPositions(sharedData.positions);
  }
  const removeLanguage = onLanguageChange(render);
  subscribers.add(render);
  if (!interval) {
    interval = setInterval(() => { if (!document.hidden && subscribers.size) void refreshAtlasData(); }, 120000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && subscribers.size) void refreshAtlasData(); });
  }
  void refreshAtlasData();
  return { render, refresh:() => refreshAtlasData({ force:true }), destroy() { disposed = true; subscribers.delete(render); removeLanguage(); } };
}
