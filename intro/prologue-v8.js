import { attachFilmSource } from './film-stream-v7.js';
import { solidIcon } from './assets/vendor/fontawesome-solid.js';
import { worldIcon } from '../world-icons.js';
import { createOpeningTyping } from './prologue-typing.js';

const COPY = {
  en: {
    skip: 'Explore the solar system', play: 'Play', enter: 'Explore the solar system', watchSound: 'Watch with sound',
    pause: 'Pause film', resume: 'Resume film', mute: 'Turn sound off', unmute: 'Turn sound on',
    position: 'Film position', introduction: 'RELIC introduction', preview: 'Preview', offline: 'Save film offline', offlineReady: 'Film available offline',
    show: 'Show controls', captions: 'Show story captions (C)', hideCaptions: 'Hide story captions (C)', narrationLanguage:'Narration language', switchLanguage:'Switch narration to French',
    fullscreen: 'Full screen (F)', exitFullscreen: 'Exit full screen (F)',
    reduced: 'Play the film, or explore at your own pace.',
    blocked: 'Start the film with sound.',
    loading: 'Loading the film…',
    unavailable: 'The film is unavailable. Your journey can still begin.',
    ready:'Press play when you are ready.', volume:'Volume', settings:'Playback settings', speed:'Playback speed', shortcuts:'Keyboard shortcuts (?)', help:'Shortcuts', restart:'Replay film',
  },
  fr: {
    skip: 'Explorer le système solaire', play: 'Lire', enter: 'Explorer le système solaire', watchSound: 'Activer le son',
    pause: 'Mettre le film en pause', resume: 'Reprendre le film', mute: 'Couper le son', unmute: 'Activer le son',
    position: 'Position dans le film', introduction: 'Introduction de RELIC', preview: 'Aperçu', offline: 'Garder le film hors ligne', offlineReady: 'Film disponible hors ligne',
    show: 'Afficher les commandes', captions: 'Afficher les textes (C)', hideCaptions: 'Masquer les textes (C)', narrationLanguage:'Langue de narration', switchLanguage:'Passer la narration en anglais',
    fullscreen: 'Plein écran (F)', exitFullscreen: 'Quitter le plein écran (F)',
    reduced: 'Lancez le film, ou explorez à votre rythme.',
    blocked: 'Lancez le film avec le son.',
    loading: 'Chargement du film…',
    unavailable: 'Le film est indisponible. Votre voyage peut commencer.',
    ready:'Lancez le film quand vous le souhaitez.', volume:'Volume', settings:'Réglages du lecteur', speed:'Vitesse de lecture', shortcuts:'Raccourcis clavier (?)', help:'Raccourcis', restart:'Revoir le film',
  },
};
const BRAND_ASSET = new URL('../assets/relic-logo-v1.png', import.meta.url).href;
const ICONS = Object.freeze({
  play: 'play', pause: 'pause', muted: 'volume-xmark',
  captions: 'closed-captioning', fullscreen: 'expand',
  exitFullscreen: 'compress', sound: 'volume-high', download: 'download',
  complete: 'check', close: 'xmark',
});
const icon = name => solidIcon(ICONS[name] || name);
const clock = seconds => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** A film-led opening. Editorial cues always follow the video's media clock. */
export function createPrologue({
  element,
  timeline = [],
  media = {},
  getLanguage = () => 'en',
  reducedMotion = () => false,
  onOpen = () => {},
  onClose = () => {},
  onOffline = null,
  onLanguageChange = null,
  canPlayOffline = async () => false,
}) {
  if (!element?.ownerDocument) throw new TypeError('A prologue element is required.');
  const document = element.ownerDocument;
  const view = document.defaultView;
  if(!document.querySelector('link[data-prologue-player],link[href*="prologue-player.css"]')){const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href=new URL('./prologue-player.css',import.meta.url).href;sheet.dataset.prologuePlayer='';document.head.append(sheet);}
  const defaultCues = [...timeline].sort((a, b) => a.start - b.start);
  let session = null;
  let closing = null;
  let exitTimer = null;
  let disposed = false;
  let keyboard = false;
  let narrationLanguage = getLanguage() === 'fr' ? 'fr' : 'en';

  const language = () => narrationLanguage;
  const localize = value => typeof value === 'string' ? value : value?.[language()] ?? value?.en ?? '';
  const trackKeyboard = event => { if (!event.metaKey && !event.ctrlKey && !event.altKey) keyboard = true; };
  const trackPointer = () => { keyboard = false; };
  document.addEventListener('keydown', trackKeyboard, true);
  document.addEventListener('pointerdown', trackPointer, true);

  async function switchLanguage(value) {
    const next = value === 'fr' ? 'fr' : 'en';
    if (next === narrationLanguage) return false;
    narrationLanguage = next;
    const change = session?.changeLanguage?.(next) ?? true;
    try { onLanguageChange?.(next); } catch { /* The local player still changes when preference storage is unavailable. */ }
    return await change;
  }

  function releaseVideo(active) {
    active.stream?.destroy();
    active.stream = null;
    active.video.pause();
    active.video.muted = true;
    active.video.removeAttribute('src');
    active.video.load();
    // Release the small mobile backdrop bitmap with the media session.
    if (active.backdrop) { active.backdrop.width = 0; active.backdrop.height = 0; }
    if (active.languageFrame) { active.languageFrame.width = 0; active.languageFrame.height = 0; }
    element.classList.remove('prologue-backdrop-ready');
  }

  function completeExit(active) {
    if (closing !== active) return;
    if (exitTimer !== null) view.clearTimeout(exitTimer);
    exitTimer = null;
    closing = null;
    releaseVideo(active);
    element.classList.remove('leaving', 'prologue-gated', 'prologue-failed', 'prologue-language-switching');
    element.classList.add('hidden');
    delete element.dataset.scene;
    delete element.dataset.chapter;
    delete element.dataset.cueKind;
  }

  function finish() {
    const active = session;
    if (!active) return;
    session = null;
    active.cancelLanguageSwitch();
    active.controller.abort();
    active.cancelFrame();
    active.cancelLoading();
    active.cancelChrome();
    active.cancelFeedback();
    active.typing.dispose();
    if (document.fullscreenElement === element) document.exitFullscreen?.().catch(() => {});
    active.video.pause();
    active.video.muted = true;
    for (const animation of active.caption.getAnimations?.() ?? []) animation.cancel();
    element.classList.add('leaving');
    element.setAttribute('aria-hidden', 'true');
    closing = active;
    const instant = Boolean(reducedMotion());
    if (!instant) exitTimer = view.setTimeout(() => completeExit(active), 600);
    onClose();
    if (instant) completeExit(active);
  }

  function start() {
    if (disposed || session) return;
    // A replay may begin while the previous opening is still fading away.
    if (closing) completeExit(closing);
    narrationLanguage = getLanguage() === 'fr' ? 'fr' : 'en';
    const controller = new view.AbortController();
    const signal = controller.signal;
    const copy = () => COPY[language()];
    // A replay selects the current language's complete source when supplied.
    // media.narration remains metadata for the separately owned audio adapter.
    let filmMedia = { ...media, ...(media.languages?.[language()] ?? {}) };
    let cues = [...(media.captions?.[language()] ?? defaultCues)].sort((a,b)=>a.start-b.start);
    element.classList.add('prologue');
    element.classList.remove('hidden', 'leaving', 'prologue-failed', 'prologue-backdrop-ready');
    for (const name of ['--end-blur', '--end-brightness', '--end-scale', '--end-progress', '--end-picture-opacity', '--end-mark-opacity', '--end-word-opacity', '--end-rule-progress']) element.style.removeProperty(name);
    element.classList.toggle('prologue-reduced', Boolean(reducedMotion()));
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-modal', 'true');
    element.setAttribute('aria-label', copy().introduction);
    element.removeAttribute('aria-hidden');
    element.tabIndex = -1;
    element.classList.remove('prologue-chrome-hidden', 'prologue-caption-off');
    // Only static interface markup uses HTML. Every supplied cue uses textContent.
    element.innerHTML = `<canvas class="prologue-backdrop" width="0" height="0" aria-hidden="true"></canvas><video id="intro-video" class="prologue-film" playsinline preload="none" aria-hidden="true" tabindex="-1"></video><canvas class="prologue-language-frame" width="0" height="0" aria-hidden="true" hidden></canvas>
      <div class="prologue-shade" aria-hidden="true"></div>
      <header class="prologue-header"><span class="prologue-brand" aria-hidden="true"><img src="${BRAND_ASSET}" alt="" width="32" height="28">RELIC</span><span class="prologue-preview" hidden></span><button id="skip-intro" class="prologue-skip"><span></span></button></header>
      <button class="prologue-reveal prologue-visually-hidden" type="button" hidden></button>
      <div class="prologue-caption"><img class="prologue-endmark" src="${BRAND_ASSET}" alt="" width="128" height="112" aria-hidden="true"><div class="prologue-context"><p id="intro-kicker"></p><p id="intro-speaker"></p></div><h1 id="intro-line"></h1><span class="prologue-visually-hidden" id="intro-transcript" aria-live="polite" aria-atomic="true"></span><p id="intro-source" hidden></p>
        <div class="prologue-gate" hidden><p id="intro-status" role="status"></p><div class="prologue-gate-actions"><button class="prologue-play-film" type="button">${icon('play')}</button><button class="prologue-enter"><span></span></button></div></div>
      </div>
      <p class="prologue-loading" role="status" hidden></p>
      <p class="prologue-feedback" role="status" aria-live="polite" hidden></p>
      <footer class="prologue-controls">
        <label class="prologue-scrubber"><span class="prologue-visually-hidden"></span><input type="range" min="0" max="1" step="0.01" value="0" disabled></label>
        <div class="prologue-transport">
          <div class="prologue-main-controls"><button class="prologue-pause" type="button"></button><div class="prologue-volume-group"><button class="prologue-audio" type="button" aria-pressed="false"></button><label class="prologue-inline-volume"><span class="prologue-visually-hidden"></span><input class="prologue-volume-input" data-player-volume type="range" min="0" max="100" step="1" value="100"><output class="prologue-volume-value">100%</output></label></div><time class="prologue-time">0:00 / 8:49</time></div>
          <div class="prologue-extra-controls"><button class="prologue-language" type="button"><span></span></button><button class="prologue-captions" type="button" aria-pressed="true">${icon('captions')}</button><button class="prologue-settings" type="button" aria-controls="prologue-player-menu" aria-expanded="false">${worldIcon('gear')}</button><button class="prologue-fullscreen" type="button">${icon('fullscreen')}</button></div>
        </div>
        <section class="prologue-player-menu" id="prologue-player-menu" role="dialog" aria-modal="false" aria-labelledby="prologue-player-menu-title" hidden>
          <header><h2 id="prologue-player-menu-title"></h2><button class="prologue-menu-close" type="button">${icon('close')}</button></header>
          <div class="prologue-menu-volume-row"><label><span data-player-copy="volume"></span><input class="prologue-menu-volume" data-player-volume type="range" min="0" max="100" step="1" value="100"></label><label class="prologue-volume-number-wrap"><input class="prologue-volume-number" type="number" min="0" max="100" step="1" value="100" inputmode="numeric"><span aria-hidden="true">%</span></label></div>
          <fieldset class="prologue-speed"><legend data-player-copy="speed"></legend><div>${[.25,.5,.75,1,1.25,1.5,1.75,2].map(rate=>`<button type="button" data-player-rate="${rate}" aria-pressed="${rate===1}">${rate}×</button>`).join('')}</div></fieldset>
          <div class="prologue-menu-actions"><button class="prologue-download" type="button" hidden>${icon('download')}<span></span></button><button class="prologue-shortcut-toggle" type="button" aria-expanded="false"><span aria-hidden="true">?</span><span data-player-copy="help"></span></button></div>
          <div class="prologue-shortcuts" hidden></div>
        </section>
      </footer>`;
    const video = element.querySelector('#intro-video');
    const languageFrame = element.querySelector('.prologue-language-frame');
    const backdrop = element.querySelector('.prologue-backdrop');
    const backdropContext = backdrop.getContext('2d', { alpha: false });
    const fittedScreen = view.matchMedia('(orientation: portrait), (max-height: 500px) and (pointer: coarse)');
    const caption = element.querySelector('.prologue-caption');
    const kicker = element.querySelector('#intro-kicker');
    const title = element.querySelector('#intro-line');
    const source = element.querySelector('#intro-source');
    const speaker = element.querySelector('#intro-speaker');
    const skip = element.querySelector('#skip-intro');
    const gate = element.querySelector('.prologue-gate');
    const status = element.querySelector('#intro-status');
    const play = element.querySelector('.prologue-play-film');
    const enter = element.querySelector('.prologue-enter');
    const controls = element.querySelector('.prologue-controls');
    const pause = element.querySelector('.prologue-pause');
    const audio = element.querySelector('.prologue-audio');
    const range = element.querySelector('.prologue-scrubber input');
    const time = element.querySelector('.prologue-time');
    const loading = element.querySelector('.prologue-loading');
    const header = element.querySelector('.prologue-header');
    const preview = element.querySelector('.prologue-preview');
    const languageButton = element.querySelector('.prologue-language');
    const captions = element.querySelector('.prologue-captions');
    const fullscreen = element.querySelector('.prologue-fullscreen');
    const transcript = element.querySelector('#intro-transcript');
    const download = element.querySelector('.prologue-download');
    const volumeInputs = [...element.querySelectorAll('[data-player-volume]')];
    const volumeNumber = element.querySelector('.prologue-volume-number');
    const volumeOutput = element.querySelector('.prologue-volume-value');
    const settings = element.querySelector('.prologue-settings');
    const menu = element.querySelector('.prologue-player-menu');
    const menuClose = element.querySelector('.prologue-menu-close');
    const helpToggle = element.querySelector('.prologue-shortcut-toggle');
    const shortcuts = element.querySelector('.prologue-shortcuts');
    const feedback = element.querySelector('.prologue-feedback');
    const typing = createOpeningTyping({element:title,getLanguage:language,reducedMotion});
    download.hidden = typeof onOffline !== 'function';
    const reveal = element.querySelector('.prologue-reveal');
    const canFullscreen = Boolean(document.fullscreenEnabled && element.requestFullscreen);
    fullscreen.hidden = !canFullscreen;
    video.defaultMuted = false;
    video.muted = false;
    video.playsInline = true;
    if (filmMedia.poster) video.poster = filmMedia.poster;
    let frame = null;
    let frameKind = null;
    let cueIndex = -2;
    let cueLanguage = '';
    let explicitPlaybackIntent = false;
    let gateReason = null;
    let failed = false;
    let attempt = 0;
    let hasSource = false;
    let loadingTimer = null;
    let transportState = '';
    let soundChoice = true;
    let chromeTimer = null;
    let chromeVisible = true;
    let captionsVisible = true;
    let lastPointer = null;
    let screenPress = null;
    let screenDragged = false;
    let dismissingPlayerMenu = false;
    let typedValue = '';
    let menuOpen = false;
    let lastAudibleVolume = 1;
    let feedbackTimer = null;
    let offlineReady = false;
    let offlineCheck = null;
    let backdropPainted = false;
    let backdropDisabled = !backdropContext;
    let backdropPaintAt = -Infinity;
    let backdropPosition = -Infinity;
    let backdropScene = '';
    let sourceSwitch = null;
    let preferredRate = 1;
    const active = { controller, video, backdrop, languageFrame, caption, cancelFrame, cancelLoading, cancelChrome, typing, cancelFeedback, cancelLanguageSwitch, stream: null, changeLanguage };
    session = active;
    const current = () => session === active && !signal.aborted;
    const duration = () => Number.isFinite(video.duration) && video.duration > 0
      ? video.duration : Number(filmMedia.duration) || Number(cues.at(-1)?.end) || 1;

    function cancelChrome() {
      if (chromeTimer !== null) view.clearTimeout(chromeTimer);
      chromeTimer = null;
    }
    function canHideChrome() {
      return !sourceSwitch && !video.paused && !video.ended && !gateReason && !failed && loading.hidden && !menuOpen;
    }
    function scheduleChrome() {
      cancelChrome();
      if (!chromeVisible || !canHideChrome()) return;
      chromeTimer = view.setTimeout(() => {
        chromeTimer = null;
        if (!current() || !canHideChrome()) return;
        // Keep keyboard-focused commands discoverable during playback.
        if (keyboard && (header.contains(document.activeElement) || controls.contains(document.activeElement))) return;
        setChrome(false);
      }, soundChoice ? 2600 : 4200);
    }
    function setChrome(visible, schedule = true) {
      if (!current()) return;
      if (!visible && !canHideChrome()) return;
      cancelChrome();
      chromeVisible = Boolean(visible);
      element.classList.toggle('prologue-chrome-hidden', !chromeVisible);
      if (!chromeVisible && (header.contains(document.activeElement) || controls.contains(document.activeElement))) element.focus({ preventScroll: true });
      for (const node of [header, controls]) {
        node.inert = !chromeVisible;
        if (chromeVisible) node.removeAttribute('aria-hidden');
        else node.setAttribute('aria-hidden', 'true');
      }
      reveal.hidden = chromeVisible;
      reveal.setAttribute('aria-label', copy().show);
      if (chromeVisible && schedule) scheduleChrome();
    }
    function toggleCaptions() {
      captionsVisible = !captionsVisible;
      element.classList.toggle('prologue-caption-off', !captionsVisible);
      transportState = '';
      render();
      setChrome(true);
    }
    async function toggleFullscreen() {
      if (!canFullscreen) return;
      setChrome(true);
      try {
        if (document.fullscreenElement === element) await document.exitFullscreen();
        else await element.requestFullscreen();
      } catch { /* The viewport-sized player remains usable when full screen is unavailable. */ }
      render();
    }
    function cancelFeedback(){if(feedbackTimer!==null)view.clearTimeout(feedbackTimer);feedbackTimer=null;}
    function showFeedback(text, glyph = null) {
      cancelFeedback();
      feedback.replaceChildren();
      feedback.classList.toggle('prologue-playback-feedback', Boolean(glyph));
      if (glyph) {
        feedback.innerHTML = icon(glyph);
        const label = document.createElement('span');
        label.className = 'prologue-visually-hidden';
        label.textContent = text;
        feedback.append(label);
      } else feedback.textContent = text;
      feedback.hidden = false;
      feedbackTimer = view.setTimeout(() => { feedback.hidden = true; feedbackTimer = null; }, glyph ? 650 : 1000);
    }
    function showPlaybackFeedback(playing) {
      const text = language() === 'fr' ? playing ? 'Lecture' : 'En pause' : playing ? 'Playing' : 'Paused';
      showFeedback(text, playing ? 'pause' : 'play');
    }
    function syncVolume(){
      const amount=Math.round((video.muted?0:video.volume)*100);
      for(const input of volumeInputs){if(document.activeElement!==input)input.value=String(amount);input.style.setProperty('--volume-progress',`${amount}%`);input.setAttribute('aria-valuetext',`${amount}%`);}
      if(document.activeElement!==volumeNumber)volumeNumber.value=String(amount);
      volumeOutput.textContent=`${amount}%`;
    }
    function setVolume(amount){
      const volume=Math.round(Math.max(0,Math.min(1,Number(amount)||0))*100)/100;
      if(volume>0)lastAudibleVolume=volume;
      video.volume=volume;video.muted=volume===0;soundChoice=true;render();setChrome(true);showFeedback(`${copy().volume} ${Math.round(volume*100)}%`);
    }
    function toggleMute(){
      soundChoice=true;
      if(video.muted||video.volume===0){video.volume=lastAudibleVolume||1;video.muted=false;}
      else{lastAudibleVolume=video.volume;video.muted=true;}
      render();setChrome(true);showFeedback(`${copy().volume} ${Math.round((video.muted?0:video.volume)*100)}%`);
    }
    function setRate(value){preferredRate=Math.max(.25,Math.min(2,Math.round(Number(value)*4)/4));video.defaultPlaybackRate=preferredRate;video.playbackRate=preferredRate;render();setChrome(true);showFeedback(`${video.playbackRate}×`);}
    function seekTo(value){
      if(!hasSource||failed||sourceSwitch||video.readyState<1)return;
      try{video.currentTime=Math.max(0,Math.min(duration(),Number(value)||0));}catch{}
      render();setChrome(true);
    }
    function setMenu(open,help=false){
      menuOpen=Boolean(open);menu.hidden=!menuOpen;settings.setAttribute('aria-expanded',String(menuOpen));
      if(help){shortcuts.hidden=false;helpToggle.setAttribute('aria-expanded','true');}
      if(menuOpen){setChrome(true,false);menuClose.focus({preventScroll:true});}
      else{settings.focus({preventScroll:true});scheduleChrome();}
    }
    function renderShortcuts(){
      const fr=language()==='fr';
      const items=[['Space / K',fr?'Lecture / pause':'Play / pause'],['F',fr?'Plein écran':'Full screen'],['M',fr?'Couper / activer le son':'Mute / unmute'],['C',fr?'Sous-titres':'Captions'],['J / L',fr?'Reculer / avancer de 10 s':'Back / forward 10 seconds'],['← / →',fr?'Reculer / avancer de 5 s':'Back / forward 5 seconds'],['↑ / ↓',fr?'Volume ±5 %':'Volume ±5%'],['0–9',fr?'Position 0–90 %':'Seek 0–90%'],['Home / End',fr?'Début / fin':'Beginning / end'],[', / .',fr?'Image précédente / suivante en pause':'Previous / next frame while paused'],['< / >',fr?'Vitesse ±0,25×':'Speed ±0.25×'],['?',fr?'Raccourcis clavier':'Keyboard shortcuts']];
      shortcuts.replaceChildren(...items.map(([key,label])=>{const row=document.createElement('p');const code=document.createElement('kbd');code.textContent=key;const text=document.createElement('span');text.textContent=label;row.append(code,text);return row;}));
      helpToggle.setAttribute('aria-label',copy().shortcuts);
    }
    function cancelFrame() {
      if (frame !== null) {
        if (frameKind === 'video') video.cancelVideoFrameCallback?.(frame);
        else view.cancelAnimationFrame(frame);
      }
      frame = null;
      frameKind = null;
    }
    function cancelLoading() {
      if (loadingTimer !== null) view.clearTimeout(loadingTimer);
      loadingTimer = null;
      loading.hidden = true;
      scheduleChrome();
    }
    function waiting() {
      if (loadingTimer !== null || video.paused || failed) return;
      loadingTimer = view.setTimeout(() => {
        loadingTimer = null;
        if (!current() || video.paused || video.readyState >= 3 || failed) return;
        loading.textContent = copy().loading;
        loading.hidden = false;
        setChrome(true, false);
      }, 3000);
    }
    function queueFrame() {
      if (!current() || video.paused || video.ended || frame !== null) return;
      const next = () => { frame = null; frameKind = null; if (current()) { render(); queueFrame(); } };
      // Some mobile compositors do not present new callbacks while the opening
      // picture is solid black. Typography must keep following the media clock
      // even then; only the short opening and time-bridge cards need this loop.
      if (!['typing', 'bridge'].includes(element.dataset.cueKind) && typeof video.requestVideoFrameCallback === 'function') {
        frameKind = 'video'; frame = video.requestVideoFrameCallback(next);
      } else {
        frameKind = 'raf'; frame = view.requestAnimationFrame(next);
      }
    }
    function updateBackdrop(position, cue) {
      // Reuse the decoded foreground frame. There is no second video, stream or
      // animation timer; this follows the player's existing media-frame loop.
      const visible = fittedScreen.matches && !gateReason && !failed && !['typing', 'bridge'].includes(cue?.kind);
      if (!visible || backdropDisabled || video.readyState < 2 || !video.videoWidth || video.seeking) {
        element.classList.toggle('prologue-backdrop-ready', visible && backdropPainted && !backdropDisabled);
        return;
      }
      const width = 192;
      const height = Math.min(480, Math.max(96, Math.round(width * view.innerHeight / Math.max(1, view.innerWidth))));
      const resized = backdrop.width !== width || backdrop.height !== height;
      const now = view.performance.now();
      const scene = element.dataset.scene || '';
      const jumped = Math.abs(position - backdropPosition) > .7 || (video.paused && position !== backdropPosition);
      if (!resized && !jumped && scene === backdropScene && now - backdropPaintAt < 250) return;
      if (resized) { backdrop.width = width; backdrop.height = height; }
      const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
      const drawWidth = video.videoWidth * scale, drawHeight = video.videoHeight * scale;
      try {
        backdropContext.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
        backdropPainted = true;
        backdropPaintAt = now;
        backdropPosition = position;
        backdropScene = scene;
        element.classList.add('prologue-backdrop-ready');
      } catch {
        // Native-media restrictions may prevent canvas access. The full image
        // remains readable against black instead of failing the film.
        backdropDisabled = true;
        element.classList.remove('prologue-backdrop-ready');
      }
    }
    function setCaption(index, position) {
      const lang = language();
      const cue = cues[index];
      if (index !== cueIndex || lang !== cueLanguage) {
        cueIndex = index; cueLanguage = lang;
        if (cue) element.dataset.chapter = String(cue.id ?? index);
        else delete element.dataset.chapter;
        if (['quote', 'typing', 'bridge', 'visual', 'end', 'narration'].includes(cue?.kind)) element.dataset.cueKind = cue.kind;
        else delete element.dataset.cueKind;
        // A timeupdate can enter a black card while a compositor callback is
        // still pending. Switch that pending loop as well, so the card's fade
        // does not fall back to the slower timeupdate cadence on a phone.
        if (frameKind === 'video' && ['typing', 'bridge'].includes(cue?.kind)) {
          cancelFrame();
          queueFrame();
        }
        element.dataset.framing = cue?.framing === 'wide' ? 'wide' : 'immersive';
        kicker.textContent = localize(cue?.kicker);
        typedValue = localize(cue?.title);
        title.setAttribute('aria-label', typedValue);
        title.dataset.fullTitle = typedValue;
        transcript.textContent = cue?.kind === 'visual' ? '' : typedValue;
        title.hidden = !typedValue;
        if (cue?.kind === 'typing') typing.setCue(cue,typedValue);
        else { typing.clear(); title.textContent = typedValue; }
        speaker.textContent = localize(cue?.speaker);
        // Source and rights attribution lives in the app's Sources space.
        source.textContent = '';
        kicker.hidden = !kicker.textContent;
        speaker.hidden = !speaker.textContent;
        source.hidden = true;
        caption.classList.toggle('has-cue', Boolean(cue));
      }
      const scene = filmMedia.scenes?.find(item=>position>=item.start && position<item.end);
      if(scene)element.dataset.scene=scene.id;else delete element.dataset.scene;
      // A location can be identified inside a long picture montage without
      // changing the narration cue or labelling the preceding images. Offsets
      // belong to the scene's media clock, so pause and seek preserve the label.
      const scenePosition = scene ? position - scene.start : 0;
      const timedLabel = scene?.labelTimeline?.find(item=>scenePosition>=item.at && scenePosition<item.end);
      const showPictureLabel = !gateReason && !['typing', 'bridge', 'end'].includes(cue?.kind);
      const pictureLabel = showPictureLabel ? localize(timedLabel?.label ?? scene?.label) : '';
      const kickerText = showPictureLabel ? pictureLabel || localize(cue?.kicker) : '';
      if (kicker.textContent !== kickerText) kicker.textContent = kickerText;
      kicker.hidden = !kickerText;
      element.classList.toggle('prologue-timed-label', Boolean(timedLabel) && Boolean(pictureLabel));
      element.classList.toggle('prologue-earth-label', showPictureLabel && scene?.id === 'origins' && Boolean(timedLabel));
      caption.classList.toggle('prologue-label-only', Boolean(pictureLabel) && !typedValue);
      const composition=scene ?? cue;
      const focusFrames = composition?.focusTimeline ?? [];
      const focusFrame = focusFrames.findLast?.(point => position - composition.start >= point.at) ?? focusFrames.filter(point => position - composition.start >= point.at).at(-1);
      const focus = view.innerWidth <= 650 ? focusFrame?.mobile ?? composition?.focus?.mobile ?? composition?.focus?.desktop : focusFrame?.desktop ?? composition?.focus?.desktop;
      const objectPosition = typeof focus === 'string' ? focus : '50% 50%';
      if (video.style.objectPosition !== objectPosition) video.style.objectPosition = objectPosition;
      updateBackdrop(position, cue);

      // A cue's reveal and departure use the media clock, never wall-clock
      // animations. A seek lands at exactly the same visual state as playback.
      const clamp = value => Math.max(0, Math.min(1, value));
      const smooth = value => { const x = clamp(value); return x*x*(3-2*x); };
      const staticCaption = Boolean(gateReason) || Boolean(reducedMotion());
      const labelOpacity = timedLabel && pictureLabel && !staticCaption
        ? Math.min(smooth((scenePosition - timedLabel.at) / .6), smooth((timedLabel.end - scenePosition) / .6)) : 1;
      kicker.style.opacity = labelOpacity.toFixed(4);
      // Opening titles, the time bridge and the final brand are film cards,
      // rather than dialogue subtitles. Switching captions off preserves them.
      const titleCard = ['typing', 'bridge', 'end'].includes(cue?.kind);
      caption.classList.toggle('prologue-caption-hidden', !gateReason && ((cue?.kind === 'visual' && !pictureLabel) || (!captionsVisible && !titleCard)));
      if (cue?.kind === 'typing') typing.render({position,gated:Boolean(gateReason)});
      const ending = cue?.kind === 'end';
      const endTime = ending ? position - cue.start : 0;
      const endProgress = ending ? smooth(endTime / 3) : 0;
      const staticEnding = ending && Boolean(reducedMotion());
      element.style.setProperty('--end-progress', endProgress.toFixed(4));
      element.style.setProperty('--end-picture-opacity', (ending ? staticEnding ? 0 : 1 - smooth(endTime / 1.4) : 1).toFixed(4));
      element.style.setProperty('--end-mark-opacity', (staticEnding ? 1 : ending ? smooth((endTime - .8) / 1.4) : 0).toFixed(4));
      element.style.setProperty('--end-word-opacity', (staticEnding ? 1 : ending ? smooth((endTime - 1.4) / 1.4) : 0).toFixed(4));
      element.style.setProperty('--end-rule-progress', (staticEnding ? 1 : ending ? smooth((endTime - 1.8) / 1.2) : 0).toFixed(4));
      // Archive captions follow every spoken word, including short radio calls.
      // Keep the entire clause visible for its complete cue instead of spending
      // most of a brief quotation on an entrance/exit animation.
      const archiveCaption = cue?.kind === 'quote';
      const bridgeCaption = cue?.kind === 'bridge';
      const fixedPictureLabel = Boolean(pictureLabel) && cue?.kind === 'visual';
      const entering = !cue || staticCaption || archiveCaption || fixedPictureLabel || cue.kind === 'typing' ? 1 : smooth((position - cue.start) / (bridgeCaption ? .45 : cue.kind === 'narration' ? .18 : .9));
      const leaving = !cue || staticCaption || archiveCaption || fixedPictureLabel || (cue.id === 'relic' || cue.kind === 'end') ? 1 : smooth((cue.end - position) / (bridgeCaption ? .45 : cue.kind === 'narration' ? .15 : .7));
      const opacity = entering * leaving;
      caption.style.setProperty('--caption-opacity', opacity.toFixed(4));
      caption.style.setProperty('--caption-lift', `${(bridgeCaption ? 0 : (1-entering)*(cue?.kind==='narration'?3:14) - (1-leaving)*3).toFixed(2)}px`);
      title.style.setProperty('--caption-reveal', `${(archiveCaption || titleCard || cue?.kind==='narration'?0:(1-entering)*100).toFixed(2)}%`);
    }
    function render() {
      if (!current()) return;
      const position = sourceSwitch?.position ?? (Number.isFinite(video.currentTime) ? video.currentTime : 0);
      let index = cues.findIndex(cue => position >= Number(cue.start) && position < Number(cue.end));
      // The final decoded frame can report duration exactly before `ended`.
      // Retain the end card through that frame and the exit fade, without a
      // one-frame flash of the sharp background or disappearance of RELIC.
      if (index < 0 && cues.at(-1)?.kind === 'end' && position >= Number(cues.at(-1).start) && position <= Number(cues.at(-1).end) + .05) index = cues.length - 1;
      if (gateReason && index < 0 && cues.length) index = 0;
      setCaption(index, position);
      const length = duration();
      range.disabled = !hasSource || failed || Boolean(sourceSwitch) || video.readyState < 1;
      range.max = String(length);
      range.value = String(Math.min(position, length));
      range.style.setProperty('--prologue-progress', `${Math.max(0, Math.min(100, position / length * 100))}%`);
      const clockText = `${clock(position)} / ${clock(length)}`;
      if (time.textContent !== clockText) {
        time.textContent = clockText;
        range.setAttribute('aria-valuetext', clockText);
      }
      syncVolume();
      const paused = sourceSwitch ? !sourceSwitch.resume : video.paused;
      const nextTransport = `${language()}|${paused}|${video.ended}|${video.muted}|${gateReason}|${soundChoice}|${captionsVisible}|${video.playbackRate}|${document.fullscreenElement === element}|${Boolean(sourceSwitch)}`;
      if (transportState !== nextTransport) {
        transportState = nextTransport;
        range.setAttribute('aria-label', copy().position);
        preview.hidden = !filmMedia.preview;
        preview.textContent = filmMedia.preview ? copy().preview : '';
        download.setAttribute('aria-label', copy().offline);
        download.title = copy().offline;
        skip.querySelector('span').textContent = copy().skip;
        play.setAttribute('aria-label', copy().play);
        play.title = copy().play;
        enter.querySelector('span').textContent = copy().enter;
        pause.innerHTML = icon(paused ? 'play' : 'pause');
        pause.setAttribute('aria-label', video.ended ? copy().restart : paused ? copy().resume : copy().pause);
        pause.title = `${video.ended ? copy().restart : paused ? copy().resume : copy().pause} (Space / K)`;
        pause.setAttribute('aria-keyshortcuts','Space k');
        const silent = video.muted || video.volume === 0;
        audio.innerHTML = icon(silent ? 'muted' : 'sound');
        audio.setAttribute('aria-label', silent ? copy().unmute : copy().mute);
        audio.setAttribute('aria-pressed', String(!silent));
        audio.title = `${silent ? copy().unmute : copy().mute} (M)`;
        captions.setAttribute('aria-label', captionsVisible ? copy().hideCaptions : copy().captions);
        captions.setAttribute('aria-pressed', String(captionsVisible));
        languageButton.querySelector('span').textContent=language().toUpperCase();
        languageButton.setAttribute('aria-label',copy().switchLanguage);
        languageButton.title=copy().switchLanguage;
        languageButton.setAttribute('aria-busy',String(Boolean(sourceSwitch)));
        settings.setAttribute('aria-label',copy().settings); settings.title=copy().settings;
        menu.querySelector('h2').textContent=copy().settings;
        menuClose.setAttribute('aria-label',language()==='fr'?'Fermer les réglages':'Close settings');
        for(const node of element.querySelectorAll('[data-player-copy]'))node.textContent=copy()[node.dataset.playerCopy];
        for(const node of volumeInputs){node.setAttribute('aria-label',copy().volume);node.title=copy().volume;}
        volumeNumber.setAttribute('aria-label',`${copy().volume} (%)`);
        captions.title=captionsVisible?copy().hideCaptions:copy().captions;
        download.querySelector('span').textContent=copy().offline;
        for(const button of menu.querySelectorAll('[data-player-rate]'))button.setAttribute('aria-pressed',String(Number(button.dataset.playerRate)===video.playbackRate));
        renderShortcuts();
        fullscreen.innerHTML = icon(document.fullscreenElement === element ? 'exitFullscreen' : 'fullscreen');
        fullscreen.setAttribute('aria-label', document.fullscreenElement === element ? copy().exitFullscreen : copy().fullscreen);
        fullscreen.title=fullscreen.getAttribute('aria-label');
      }
    }
    function showGate(reason) {
      if (!current()) return;
      gateReason = reason;
      gate.hidden = false;
      controls.hidden = reason === 'unavailable';
      play.hidden = reason === 'unavailable';
      status.textContent = copy()[reason];
      status.hidden = reason === 'ready';
      element.classList.add('prologue-gated');
      element.classList.toggle('prologue-failed', reason === 'unavailable');
      render();
      setChrome(true, false);
    }
    function hideGate() {
      gateReason = null;
      gate.hidden = true;
      controls.hidden = false;
      element.classList.remove('prologue-gated', 'prologue-failed');
    }
    async function offlinePlayable() {
      if (offlineReady) return true;
      if (!offlineCheck) {
        offlineCheck = Promise.resolve().then(() => canPlayOffline(filmMedia)).then(Boolean, () => false);
      }
      const ready = await offlineCheck;
      offlineCheck = null;
      if (current()) offlineReady = ready;
      return ready;
    }
    function clearLanguageFrame() {
      languageFrame.hidden = true;
      languageFrame.width = 0; languageFrame.height = 0;
      element.classList.remove('prologue-language-switching');
    }
    function cancelLanguageSwitch(keepFrame = false) {
      const operation = sourceSwitch;
      sourceSwitch = null;
      operation?.controller.abort();
      if (!keepFrame) clearLanguageFrame();
    }
    function waitForMedia(operation, events, predicate) {
      return new Promise((resolve, reject) => {
        let timer;
        const cleanup = () => {
          view.clearTimeout(timer);
          for (const event of events) video.removeEventListener(event, check);
          video.removeEventListener('error', error);
          operation.controller.signal.removeEventListener('abort', aborted);
        };
        const check = () => { if (predicate()) { cleanup(); resolve(); } };
        const error = () => { cleanup(); reject(new Error('The narration track could not load.')); };
        const aborted = () => { cleanup(); reject(new view.DOMException('The narration change was superseded.', 'AbortError')); };
        for (const event of events) video.addEventListener(event, check);
        video.addEventListener('error', error);
        operation.controller.signal.addEventListener('abort', aborted, {once:true});
        timer = view.setTimeout(() => { cleanup(); reject(new Error('The narration change timed out.')); }, 30000);
        check();
      });
    }
    async function changeLanguage(next) {
      const previous = sourceSwitch;
      const position = previous?.position ?? (Number.isFinite(video.currentTime) ? video.currentTime : 0);
      const resume = previous ? previous.resume && explicitPlaybackIntent : !video.paused && !video.ended && explicitPlaybackIntent;
      cancelLanguageSwitch(Boolean(previous));
      filmMedia = { ...media, ...(media.languages?.[next] ?? {}) };
      cues = [...(media.captions?.[next] ?? defaultCues)].sort((a,b)=>a.start-b.start);
      cueIndex = -2; cueLanguage = ''; transportState = '';
      offlineReady = false; offlineCheck = null;
      if (filmMedia.poster) video.poster = filmMedia.poster;
      // Choosing a voice on the ready screen must not load the film.
      if (!hasSource) { render(); if (gateReason) showGate(gateReason); return true; }
      const operation = { position, resume, controller:new view.AbortController() };
      sourceSwitch = operation;
      if (!previous && video.readyState >= 2 && video.videoWidth) {
        try {
          languageFrame.width = video.videoWidth; languageFrame.height = video.videoHeight;
          languageFrame.getContext('2d', {alpha:false}).drawImage(video,0,0);
          languageFrame.style.objectPosition = fittedScreen.matches ? '50% 50%' : video.style.objectPosition || '50% 50%';
          languageFrame.hidden = false;
        } catch { clearLanguageFrame(); }
      }
      element.classList.add('prologue-language-switching');
      attempt += 1; cancelFrame(); cancelLoading();
      video.pause(); explicitPlaybackIntent = Boolean(resume);
      active.stream?.destroy(); active.stream = null;
      video.removeAttribute('src'); video.load();
      video.defaultPlaybackRate = preferredRate; video.playbackRate = preferredRate;
      failed = false; hideGate(); render(); setChrome(true,false);
      try {
        const metadata = waitForMedia(operation,['loadedmetadata','durationchange'],()=>video.readyState>=1);
        try { active.stream = attachFilmSource(video,filmMedia,{shouldResume:()=>current()&&!sourceSwitch&&explicitPlaybackIntent&&!document.hidden&&!element.inert}); }
        catch (error) { operation.controller.abort(); await metadata.catch(()=>{}); throw error; }
        await metadata;
        if (!current() || sourceSwitch !== operation) return false;
        const target = Math.max(0,Math.min(position,duration()-.01));
        if (Math.abs(video.currentTime-target)>.005) video.currentTime=target;
        await waitForMedia(operation,['seeked','loadeddata','canplay'],()=>!video.seeking&&video.readyState>=2&&Math.abs(video.currentTime-target)<.06);
        if (!current() || sourceSwitch !== operation) return false;
        const continuePlaying = operation.resume && explicitPlaybackIntent && !document.hidden && !element.inert;
        sourceSwitch = null;
        operation.controller.abort();
        clearLanguageFrame();
        video.playbackRate = preferredRate;
        explicitPlaybackIntent = Boolean(continuePlaying);
        render(); setChrome(true);
        if (continuePlaying) await playFilm(false);
        return true;
      } catch (error) {
        if (error?.name === 'AbortError' || !current() || sourceSwitch !== operation) return false;
        cancelLanguageSwitch(); fail(); return false;
      }
    }
    async function playFilm(withFeedback = true) {
      if (!current() || failed || document.hidden || element.inert) return;
      explicitPlaybackIntent = true;
      if (sourceSwitch) { sourceSwitch.resume=true; render(); return; }
      if (video.ended) { try { video.currentTime=0; } catch {} }
      const request = ++attempt;
      if (view.navigator.onLine === false && !await offlinePlayable()) {
        if (current() && request === attempt) fail();
        return;
      }
      if (!current() || failed || request !== attempt) return;
      if (!filmMedia.src && !filmMedia.hls) { fail(); return; }
      if (!hasSource) {
        hasSource = true;
        video.preload = 'auto';
        try { active.stream = attachFilmSource(video, filmMedia, {shouldResume:()=>current()&&explicitPlaybackIntent&&!document.hidden&&!element.inert}); }
        catch { fail(); return; }
      }
      if (document.hidden || element.inert) { explicitPlaybackIntent = false; return; }
      hideGate();
      try {
        await video.play();
        if (!current() || request !== attempt) return;
        render(); queueFrame(); scheduleChrome();
        if (withFeedback) showPlaybackFeedback(true);
      } catch {
        if (!current() || request !== attempt || failed || document.hidden) return;
        showGate('blocked');
      }
    }
    function pauseFilm() {
      attempt += 1;
      explicitPlaybackIntent = false;
      if (sourceSwitch) sourceSwitch.resume=false;
      video.pause();
      render();
      showPlaybackFeedback(false);
    }
    function togglePlayback() {
      (sourceSwitch ? sourceSwitch.resume : !video.paused) ? pauseFilm() : playFilm();
    }
    function fail() {
      if (!current() || failed) return;
      failed = true;
      cancelLanguageSwitch();
      attempt += 1;
      explicitPlaybackIntent = false;
      cancelFrame();
      cancelLoading();
      active.stream?.destroy();
      active.stream = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
      showGate('unavailable');
    }
    function visibilityChanged() {
      if (!current() || !document.hidden) return;
      explicitPlaybackIntent=false;if(sourceSwitch)sourceSwitch.resume=false;attempt+=1;video.pause();setChrome(true,false);
    }
    function trapFocus(event) {
      if (!current() || element.inert) return;
      if (event.key === 'Tab') setChrome(true);
      if (event.key !== 'Tab') return;
      const targets = [...element.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href]')]
        .filter(node => node.getClientRects().length && !node.closest('[hidden], [inert]'));
      const first = targets[0], last = targets.at(-1);
      if (!first) return;
      if (document.activeElement === element || !element.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    function keyboardControls(event) {
      if (!current() || element.inert || event.metaKey || event.ctrlKey || event.altKey || document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape' && menuOpen) {event.preventDefault();event.stopPropagation();setMenu(false);return;}
      if (event.key === 'Escape' && document.fullscreenElement === element) {event.preventDefault();event.stopPropagation();document.exitFullscreen?.().catch(()=>{});setChrome(true);return;}
      const target=event.target;
      if(target?.closest?.('input,textarea,select,[contenteditable=true],.prologue-player-menu'))return;
      const key=event.key.toLowerCase();
      const handled=[' ','k','f','m','c','j','l','arrowleft','arrowright','arrowup','arrowdown','home','end',',','.','<','>','?'].includes(key)||/^[0-9]$/.test(key);
      if(!handled)return;
      // Space on a focused button keeps the browser's one native activation.
      if(key===' '&&target?.closest?.('button'))return;
      event.preventDefault();event.stopPropagation();
      setChrome(true);
      if(event.repeat&&[' ','k','f','m','c','?'].includes(key))return;
      if(key===' '||key==='k'){togglePlayback();return;}
      if(key==='f'){toggleFullscreen();return;}
      if(key==='m'){toggleMute();return;}
      if(key==='c'){toggleCaptions();return;}
      if(key==='?'){setMenu(true,true);return;}
      if(key==='arrowup'||key==='arrowdown'){setVolume((video.muted?0:video.volume)+(key==='arrowup'?.05:-.05));return;}
      if(key==='>'||key==='<'){setRate(video.playbackRate+(key==='>'?.25:-.25));return;}
      if(key===','||key==='.'){const fps=Math.max(1,Number(filmMedia.fps)||24);if(video.paused)seekTo(video.currentTime+(key==='.'?1/fps:-1/fps));return;}
      if(key==='home'||key==='end'){seekTo(key==='home'?0:Math.max(0,duration()-.01));return;}
      if(/^[0-9]$/.test(key)){seekTo(duration()*Number(key)/10);return;}
      seekTo(video.currentTime+(['j','arrowleft'].includes(key)?-1:1)*(['j','l'].includes(key)?10:5));
    }
    const isPlayerControl = target => Boolean(target.closest('button, input, label, a, .prologue-header, .prologue-controls, .prologue-gate, .prologue-player-menu'));
    element.addEventListener('pointerdown', event => {
      lastPointer = { x: event.clientX, y: event.clientY };
      screenPress = { x: event.clientX, y: event.clientY };
      screenDragged = false;
      dismissingPlayerMenu = menuOpen;
      if (isPlayerControl(event.target)) setChrome(true);
    }, { signal });
    element.addEventListener('pointercancel', () => { screenPress = null; screenDragged = true; }, { signal });
    // A single click or tap on the picture is a playback action. Pointerdown
    // only records the gesture so dragging a control never toggles playback.
    element.addEventListener('click', event => {
      if (!current() || element.inert || isPlayerControl(event.target) || screenDragged || dismissingPlayerMenu) return;
      setChrome(true);
      togglePlayback();
    }, { signal });
    element.addEventListener('pointermove', event => {
      if (screenPress && Math.hypot(event.clientX - screenPress.x, event.clientY - screenPress.y) > 10) screenDragged = true;
      if (event.pointerType === 'touch') return;
      if (lastPointer && Math.hypot(event.clientX - lastPointer.x, event.clientY - lastPointer.y) < 7) return;
      lastPointer = { x: event.clientX, y: event.clientY };
      setChrome(true);
    }, { signal });
    element.addEventListener('focusin', event => { if (event.target !== element) setChrome(true); }, { signal });
    reveal.addEventListener('click', () => setChrome(true), { signal });
    captions.addEventListener('click', toggleCaptions, { signal });
    languageButton.addEventListener('click', () => { switchLanguage(language() === 'en' ? 'fr' : 'en'); }, {signal});
    fullscreen.addEventListener('click', toggleFullscreen, { signal });
    download.addEventListener('click', () => {
      setChrome(true, false);
      onOffline?.({ language: language(), media: filmMedia, element, trigger: download, signal });
    }, { signal });
    for(const input of volumeInputs)input.addEventListener('input',()=>setVolume(Number(input.value)/100),{signal});
    volumeNumber.addEventListener('input',()=>{if(volumeNumber.value!==''&&volumeNumber.validity.valid)setVolume(Number(volumeNumber.value)/100);},{signal});
    volumeNumber.addEventListener('change',()=>{volumeNumber.value=String(Math.round((video.muted?0:video.volume)*100));},{signal});
    settings.addEventListener('click',()=>setMenu(!menuOpen),{signal});
    menuClose.addEventListener('click',()=>setMenu(false),{signal});
    helpToggle.addEventListener('click',()=>{shortcuts.hidden=!shortcuts.hidden;helpToggle.setAttribute('aria-expanded',String(!shortcuts.hidden));},{signal});
    for(const button of menu.querySelectorAll('[data-player-rate]'))button.addEventListener('click',()=>setRate(Number(button.dataset.playerRate)),{signal});
    document.addEventListener('pointerdown',event=>{if(menuOpen&&!menu.contains(event.target)&&!settings.contains(event.target))setMenu(false);},{signal});
    document.addEventListener('fullscreenchange', render, { signal });
    document.addEventListener('keydown', keyboardControls, { signal, capture: true });
    skip.addEventListener('click', finish, { signal });
    enter.addEventListener('click', finish, { signal });
    play.addEventListener('click', () => { soundChoice = true; playFilm(); }, { signal });
    pause.addEventListener('click', () => togglePlayback(), { signal });
    audio.addEventListener('click', toggleMute, { signal });
    range.addEventListener('input', () => {
      if (!hasSource || failed) return;
      seekTo(Number(range.value));
      render();
    }, { signal });
    video.addEventListener('play', () => {
      if (document.hidden || element.inert || !explicitPlaybackIntent) { explicitPlaybackIntent=false; video.pause(); return; }
      hideGate(); render(); queueFrame(); scheduleChrome();
    }, { signal });
    video.addEventListener('pause', () => { if(!sourceSwitch)explicitPlaybackIntent=false; cancelFrame(); cancelLoading(); render(); setChrome(true, false); }, { signal });
    video.addEventListener('playing', cancelLoading, { signal });
    video.addEventListener('waiting', waiting, { signal });
    video.addEventListener('stalled', waiting, { signal });
    for (const event of ['timeupdate', 'seeked', 'durationchange', 'loadedmetadata', 'loadeddata', 'volumechange', 'ratechange']) {
      video.addEventListener(event, render, { signal });
    }
    video.addEventListener('ended', () => {explicitPlaybackIntent=false;cancelFrame();render();setChrome(true,false);}, { signal });
    video.addEventListener('error', () => {
      try { if (active.stream?.recover()) return; } catch { /* Fall back to the readable error state. */ }
      fail();
    }, { signal });
    document.addEventListener('visibilitychange', visibilityChanged, { signal });
    // A Sources/offline dialog can open and close while a voice is loading.
    // Remember its pause immediately, even if the new track finishes later.
    const inertObserver = new view.MutationObserver(() => {
      if (!current() || !element.inert) return;
      explicitPlaybackIntent = false;
      if (sourceSwitch) sourceSwitch.resume = false;
      video.pause();
      render();
    });
    inertObserver.observe(element,{attributes:true,attributeFilter:['inert']});
    signal.addEventListener('abort',()=>inertObserver.disconnect(),{once:true});
    document.addEventListener('keydown', trapFocus, { signal });
    view.addEventListener('offline', async () => {
      if (!await offlinePlayable() && current()) fail();
    }, { signal });
    view.addEventListener('online', () => { offlineReady = false; offlineCheck = null; }, { signal });
    view.addEventListener('resize', render, { signal });
    render();
    onOpen();
    // Opening is a ready state, never an autoplay attempt or a media download.
    showGate('ready');
    if (keyboard) play.focus({ preventScroll: true });

  }

  return {
    start,
    finish,
    switchLanguage,
    get phase() {
      if (!session) return closing ? 'leaving' : 'closed';
      if (element.classList.contains('prologue-failed')) return 'unavailable';
      if (element.classList.contains('prologue-gated')) return 'poster';
      return session.video.paused ? 'paused' : 'playing';
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      finish();
      if (closing) completeExit(closing);
      document.removeEventListener('keydown', trackKeyboard, true);
      document.removeEventListener('pointerdown', trackPointer, true);
    },
  };
}
