import { parseCoordinateQuery } from './coordinateParser.js';
import { backendJSON, publicRequests } from '../core/atlas-services.js';
import { worldIcon } from '../ui/world-icons.js';

const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();

export function normalizePhotonFeature(feature) {
  const coordinates = feature?.geometry?.coordinates;
  if (feature?.geometry?.type !== 'Point' || !Array.isArray(coordinates)) return null;
  const [lon,lat] = coordinates.map(Number), p = feature.properties || {};
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) return null;
  const name = String(p.name || p.street || '').trim().slice(0,120);
  if (!name) return null;
  const detail = [...new Set(['housenumber','street','district','city','state','country'].map(key=>String(p[key]||'').trim()).filter(value=>value && value!==name))].join(', ').slice(0,180);
  const extent = p.extent;
  let range = ({country:1500000,state:300000,city:35000,town:22000,village:9000,district:9000,suburb:8000,street:5000,aerodrome:6000,airport:6000,park:6000})[String(p.osm_value||p.type||'').toLowerCase()] || 2600;
  if (Array.isArray(extent) && extent.length===4 && extent.every(Number.isFinite)) {
    const [west,north,east,south] = extent;
    if (west>=-180 && east<=180 && east>=west && south>=-90 && north<=90 && north>=south) range=Math.round(Math.max(1800,Math.min(4000000,Math.max((north-south)*111000,(east-west)*111000*Math.max(.02,Math.cos(lat*Math.PI/180)))*2.2)));
  }
  return { id:`${p.osm_type||''}:${p.osm_id||''}:${lat.toFixed(5)}:${lon.toFixed(5)}`, name, detail, lat,lon,range,source:'photon' };
}

export async function searchPlaces(query, { language = 'en', bias, signal } = {}) {
  const term = String(query||'').trim();
  if (term.length<3 || term.length>120) return [];
  const params = new URLSearchParams({ q:term,lang:language==='fr'?'fr':'en' });
  if (Number.isFinite(bias?.lat) && Number.isFinite(bias?.lon) && Math.abs(bias.lat)<=90 && Math.abs(bias.lon)<=180) { params.set('lat',bias.lat.toFixed(2));params.set('lon',bias.lon.toFixed(2)); }
  try {
    const backend = await backendJSON(`./api/places?${params}`, { ttl:900000,timeout:3500,signal });
    if (Array.isArray(backend.places)) return backend.places.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180).map(p=>({...p,source:'photon'}));
  } catch (error) { if (error.name==='AbortError') throw error; }
  const photon = new URL('https://photon.komoot.io/api/');
  for (const [key,value] of params) photon.searchParams.set(key,value);
  photon.searchParams.set('limit','6');
  try {
    const data = await publicRequests.json(photon.href, { ttl:900000,timeout:6500,signal,group:'photon-search' });
    if (!Array.isArray(data.features)) throw new Error('Invalid place response');
    return data.features.map(normalizePhotonFeature).filter(Boolean).slice(0,6);
  } catch (error) { if (error.name==='AbortError') throw error; }
  // GeoNames via Open-Meteo offers city names if the address service is paused.
  const cityURL = new URL('https://geocoding-api.open-meteo.com/v1/search');
  cityURL.search = new URLSearchParams({ name:term,count:'6',language:language==='fr'?'fr':'en',format:'json' }).toString();
  const data = await publicRequests.json(cityURL.href, { ttl:900000,timeout:6500,signal,group:'geonames-search' });
  if (data.error) throw new Error('City source not ready');
  return (Array.isArray(data.results)?data.results:[]).filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180).map(p=>({id:`geonames:${p.id}`,name:String(p.name||term).slice(0,120),detail:[p.admin1,p.country].filter(Boolean).join(', '),lat:p.latitude,lon:p.longitude,range:35000,source:'geocoder',provider:'GeoNames via Open-Meteo',sourceUrl:'https://open-meteo.com/en/docs/geocoding-api'}));
}

/** Search NASA sites, decimal coordinates and (on Earth) Photon places. */
export function createPlaceSearch({ world, places, onSelect, getBias, language }) {
  const form = document.querySelector('#place-form');
  const toggle = form.querySelector('#search-toggle');
  const content = form.querySelector('#search-content');
  const input = document.querySelector('#place-input');
  const list = document.querySelector('#suggestions');
  const status = document.querySelector('#search-state');
  const submit = form.querySelector('[type="submit"]');
  let candidates = [];
  let selected = -1;
  let timer = 0;
  let controller = null;
  let generation = 0;
  let statusKey = '';
  let currentQuery = '';
  let remoteReady = false;

  const en = () => language() === 'en';
  function message(key) {
    return ({
      searching:en() ? 'Searching places…' : 'Recherche de lieux…',
      missing:en() ? 'No place found. Try another name or coordinates.' : 'Aucun lieu trouvé. Essayez un autre nom ou des coordonnées.',
      error:en() ? 'Try a NASA destination or enter latitude, longitude.' : 'Essayez une destination NASA ou indiquez latitude, longitude.',
    })[key] || '';
  }
  function setStatus(key = '') { statusKey = key; status.textContent = message(key); }
  function stopRequest() {
    clearTimeout(timer);
    controller?.abort();
    controller = null;
  }
  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    selected = -1;
  }
  function setExpanded(expanded, focus = false) {
    if (!expanded) close();
    expanded = expanded || form.dataset.dashboardSearch === 'persistent';
    form.classList.toggle('expanded', expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', expanded
      ? (en() ? 'Close search' : 'Réduire la recherche')
      : (en() ? 'Search for a place' : 'Rechercher un lieu'));
    content.inert = !expanded;
    if (!expanded) {
      close();
      if (document.activeElement === input) input.blur();
    } else if (focus) {
      // Make the newly opened field focusable during the same user gesture.
      void content.offsetWidth;
      input.focus();
      input.select();
    }
  }
  toggle.addEventListener('click', () => setExpanded(!form.classList.contains('expanded'), true));
  function localMatches(query) {
    const term = fold(query);
    return places().filter(place => !term || fold(place.name).includes(term) || fold(place.id).includes(term))
      .slice(0, term ? 4 : 5).map(place => ({
        id:`nasa-${place.id}`, name:place.name, detail:place.tag || (en() ? 'NASA site' : 'Site NASA'),
        lat:place.lat, lon:place.lon, range:place.terrainRange || place.range,
        source:'nasa', site:place,
      }));
  }
  function coordinates(query) {
    const point = parseCoordinateQuery(query);
    return point ? [{ ...point, id:'coordinates', name:point.label,
      detail:en() ? 'Go to coordinates' : 'Aller aux coordonnées', source:'coordinates',
      range:world === 'earth' ? 3500 : 2500 }] : [];
  }
  function show(results) {
    candidates = results;
    selected = -1;
    list.replaceChildren(...results.map((place, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `place-option-${index}`;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', 'false');
      const icon = document.createElement('span');
      icon.className = 'place-icon';
      icon.innerHTML = worldIcon(place.source === 'coordinates' ? 'location-dot' : place.source === 'nasa' ? 'globe' : 'magnifying-glass');
      const copy = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = place.name;
      const detail = document.createElement('small');
      detail.textContent = place.detail || (en() ? 'Place' : 'Lieu');
      copy.append(title, detail);
      button.append(icon, copy);
      button.addEventListener('click', () => { void choose(place); });
      return button;
    }));
    list.hidden = !results.length;
    input.setAttribute('aria-expanded', String(Boolean(results.length)));
    input.removeAttribute('aria-activedescendant');
  }
  function highlight(index) {
    if (!candidates.length) return;
    selected = (index + candidates.length) % candidates.length;
    [...list.children].forEach((button, i) => button.setAttribute('aria-selected', String(i === selected)));
    const active = list.children[selected];
    input.setAttribute('aria-activedescendant', active.id);
    active.scrollIntoView({ block:'nearest' });
  }
  async function choose(place) {
    ++generation;
    stopRequest();
    close();
    setStatus();
    input.value = ['photon','geocoder'].includes(place.source) && place.detail ? `${place.name}, ${place.detail}` : place.name;
    try {
      await onSelect(place);
      setExpanded(false);
      if (window.innerWidth < 760) input.blur();
    } catch (error) {
      setStatus('error');
    }
  }
  async function remote(query, serial) {
    controller?.abort();
    controller = new AbortController();
    const found = await searchPlaces(query, { language:en()?'en':'fr', bias:getBias?.(), signal:controller.signal });
    return serial === generation ? found : [];
  }
  async function update(query, serial, chooseFirst = false) {
    const local = [...coordinates(query), ...localMatches(query)];
    if (world !== 'earth' || query.length < 3 || coordinates(query).length) {
      show(local);
      if (chooseFirst) local.length ? await choose(local[0]) : setStatus('missing');
      return;
    }
    setStatus('searching');
    submit.disabled = chooseFirst;
    try {
      const found = await remote(query, serial);
      if (serial !== generation) return;
      const seen = new Set(local.map(place => `${place.lat.toFixed(3)},${place.lon.toFixed(3)}`));
      const unique = found.filter(place => {
        const key = `${place.lat.toFixed(3)},${place.lon.toFixed(3)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const merged = [...local, ...unique].slice(0, 8);
      remoteReady = true;
      show(merged);
      setStatus(merged.length ? '' : 'missing');
      if (chooseFirst && merged.length) await choose(unique[0] || local[0]);
    } catch (error) {
      if (serial !== generation || error.name === 'AbortError') return;
      show(local);
      setStatus(local.length ? '' : 'error');
      if (chooseFirst && local.length) await choose(local[0]);
    } finally { submit.disabled = false; }
  }
  function onInput() {
    stopRequest();
    const serial = ++generation;
    const query = input.value.trim();
    currentQuery = query;
    remoteReady = false;
    setStatus();
    const local = [...coordinates(query), ...localMatches(query)];
    show(local);
    const hasExactSite = local.some(place => place.source === 'nasa' && fold(place.name.split(' · ')[0]) === fold(query));
    if (world === 'earth' && query.length >= 3 && !coordinates(query).length && !hasExactSite) {
      timer = setTimeout(() => { void update(query, serial); }, 450);
    }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) { input.focus(); show(localMatches('')); return; }
    if (selected >= 0 && !list.hidden) { void choose(candidates[selected]); return; }
    const point = coordinates(query)[0];
    if (point) { void choose(point); return; }
    const exact = localMatches(query).find(place => {
      const short = place.name.split(' · ')[0];
      return fold(place.name) === fold(query) || fold(short) === fold(query) || fold(place.id.slice(5)) === fold(query);
    });
    if (exact) { void choose(exact); return; }
    if (remoteReady && query === currentQuery && candidates.length && !list.hidden) {
      void choose(candidates.find(place => ['photon','geocoder'].includes(place.source)) || candidates[0]);
      return;
    }
    stopRequest();
    const serial = ++generation;
    currentQuery = query;
    void update(query, serial, true);
  });
  input.addEventListener('input', onInput);
  input.addEventListener('focus', () => {
    setExpanded(true);
    if (!input.value.trim()) show(localMatches(''));
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.hidden) show([...coordinates(input.value.trim()), ...localMatches(input.value.trim())]);
      highlight(selected + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); setExpanded(false);
      if (form.dataset.dashboardSearch !== 'persistent') toggle.focus();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!form.contains(event.target) && form.classList.contains('expanded')) setExpanded(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key !== '/' && !((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) return;
    if (event.target instanceof HTMLElement && (event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName))) return;
    event.preventDefault();
    setExpanded(true, true);
  });
  function setLanguage() {
    toggle.querySelector('.search-toggle-label').textContent = en() ? 'Search' : 'Rechercher';
    toggle.setAttribute('aria-label', form.classList.contains('expanded')
      ? (en() ? 'Close search' : 'Réduire la recherche')
      : (en() ? 'Search for a place' : 'Rechercher un lieu'));
    input.setAttribute('aria-label', en() ? 'Search for a place' : 'Rechercher un lieu');
    input.placeholder = world === 'earth'
      ? (en() ? 'City, address, landmark or coordinates…' : 'Ville, adresse, lieu ou coordonnées…')
      : (en() ? 'NASA site or coordinates…' : 'Site NASA ou coordonnées…');
    submit.textContent = en() ? 'Go' : 'Aller';
    form.querySelector('.place-search-credit').textContent = world === 'earth'
      ? (en() ? 'Places © OpenStreetMap contributors · Photon / GeoNames' : 'Lieux © contributeurs OpenStreetMap · Photon / GeoNames')
      : (en() ? 'NASA sites and coordinates' : 'Sites NASA et coordonnées');
    setStatus(statusKey);
    if (!list.hidden) show([...coordinates(currentQuery), ...localMatches(currentQuery)]);
  }
  setLanguage();
  setExpanded(false);
  return { setLanguage, close, setStatus };
}
