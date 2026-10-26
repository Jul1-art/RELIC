import { attachFilmSource } from './film-stream-v7.js';
import { solidIcon } from './assets/vendor/fontawesome-solid.js';

const COPY = {
  en: {
    skip: 'Explore the solar system', play: 'Play with sound', enter: 'Explore the solar system', watchSound: 'Watch with sound',
    pause: 'Pause film', resume: 'Resume film', mute: 'Turn sound off', unmute: 'Turn sound on',
    position: 'Film position', introduction: 'RELIC introduction', preview: 'Preview', offline: 'Save film offline', offlineReady: 'Film available offline',
    clean: 'Hide controls (H)', show: 'Show controls (H)', captions: 'Show story captions (C)', hideCaptions: 'Hide story captions (C)',
    fullscreen: 'Full screen (F)', exitFullscreen: 'Exit full screen (F)',
    reduced: 'Play the film, or explore at your own pace.',
    blocked: 'Start the film with sound.',
    loading: 'Loading the film…',
    unavailable: 'The film is unavailable. Your journey can still begin.',
  },
  fr: {
    skip: 'Explorer le système solaire', play: 'Voir avec le son', enter: 'Explorer le système solaire', watchSound: 'Activer le son',
    pause: 'Mettre le film en pause', resume: 'Reprendre le film', mute: 'Couper le son', unmute: 'Activer le son',
    position: 'Position dans le film', introduction: 'Introduction de RELIC', preview: 'Aperçu', offline: 'Garder le film hors ligne', offlineReady: 'Film disponible hors ligne',
    clean: 'Masquer les commandes (H)', show: 'Afficher les commandes (H)', captions: 'Afficher les textes (C)', hideCaptions: 'Masquer les textes (C)',
    fullscreen: 'Plein écran (F)', exitFullscreen: 'Quitter le plein écran (F)',
    reduced: 'Lancez le film, ou explorez à votre rythme.',
    blocked: 'Lancez le film avec le son.',
    loading: 'Chargement du film…',
    unavailable: 'Le film est indisponible. Votre voyage peut commencer.',
  },
};
const ICONS = Object.freeze({
  play: 'play', pause: 'pause', muted: 'volume-xmark',
  clean: 'eye-slash', captions: 'closed-captioning', fullscreen: 'expand',
  exitFullscreen: 'compress', sound: 'volume-high', download: 'download',
  complete: 'check', close: 'xmark',
});
const icon = name => solidIcon(ICONS[name] || name);
const clock = seconds => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

// Segment visible letters rather than UTF-16 units: accents and joined glyphs
// appear together. The media clock owns every keystroke, pause and soft reveal.
const graphemes = (value, language) => typeof Intl.Segmenter === 'function'
  ? Array.from(new Intl.Segmenter(language, { granularity:'grapheme' }).segment(value), part => part.segment)
  : Array.from(value.normalize('NFC'));

// A short pause between lines and at punctuation gives the opening a deliberate
// rhythm. The deterministic schedule also restores exactly after a scrub.
const typingStops = characters => {
  let total = 0;
  const stops = characters.map((character, index) => {
    const previous = characters[index - 1] || '';
    const variation = ((character.codePointAt(0) * 11 + index * 7) % 9) / 28;
    let weight = character === '\n' ? .04 : character === ' ' ? .38 : .8 + variation;
    if (!index) weight = .28;
    if (previous === '\n') weight += 3.4;
    else if (/[.!?]/.test(previous)) weight += 2.8;
    else if (/[,;:]/.test(previous)) weight += 1.9;
    else if (previous === ' ') weight += .28;
    total += weight;
    return total;
  });
  return stops.map(stop => stop / Math.max(1, total));
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
  canPlayOffline = async () => false,
}) {
  if (!element?.ownerDocument) throw new TypeError('A prologue element is required.');
  const document = element.ownerDocument;
  const view = document.defaultView;
  const defaultCues = [...timeline].sort((a, b) => a.start - b.start);
  let session = null;
  let closing = null;
  let exitTimer = null;
  let disposed = false;
  let keyboard = false;

  const language = () => getLanguage() === 'fr' ? 'fr' : 'en';
  const localize = value => typeof value === 'string' ? value : value?.[language()] ?? value?.en ?? '';
  const trackKeyboard = event => { if (!event.metaKey && !event.ctrlKey && !event.altKey) keyboard = true; };
  const trackPointer = () => { keyboard = false; };
  document.addEventListener('keydown', trackKeyboard, true);
  document.addEventListener('pointerdown', trackPointer, true);

  function releaseVideo(active) {
    active.stream?.destroy();
    active.stream = null;
    active.video.pause();
    active.video.muted = true;
    active.video.removeAttribute('src');
    active.video.load();
    // Release the small mobile backdrop bitmap with the media session.
    if (active.backdrop) { active.backdrop.width = 0; active.backdrop.height = 0; }
    element.classList.remove('prologue-backdrop-ready');
  }

  function completeExit(active) {
    if (closing !== active) return;
    if (exitTimer !== null) view.clearTimeout(exitTimer);
    exitTimer = null;
    closing = null;
    releaseVideo(active);
    element.classList.remove('leaving', 'prologue-gated', 'prologue-failed');
    element.classList.add('hidden');
    delete element.dataset.scene;
    delete element.dataset.chapter;
    delete element.dataset.cueKind;
  }

  function finish() {
    const active = session;
    if (!active) return;
    session = null;
    active.controller.abort();
    active.cancelFrame();
    active.cancelLoading();
    active.cancelChrome();
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
    const controller = new view.AbortController();
    const signal = controller.signal;
    const copy = () => COPY[language()];
    // A replay selects the current language's complete source when supplied.
    // media.narration remains metadata for the separately owned audio adapter.
    const filmMedia = { ...media, ...(media.languages?.[language()] ?? {}) };
    const cues = [...(media.captions?.[language()] ?? defaultCues)].sort((a,b)=>a.start-b.start);
    element.classList.add('prologue');
    element.classList.remove('hidden', 'leaving', 'prologue-failed', 'prologue-backdrop-ready');
    for (const name of ['--end-blur', '--end-brightness', '--end-scale', '--end-progress']) element.style.removeProperty(name);
    element.classList.toggle('prologue-reduced', Boolean(reducedMotion()));
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-modal', 'true');
    element.setAttribute('aria-label', copy().introduction);
    element.removeAttribute('aria-hidden');
    element.tabIndex = -1;
    element.classList.remove('prologue-chrome-hidden', 'prologue-caption-off');
    // Only static interface markup uses HTML. Every supplied cue uses textContent.
    element.innerHTML = `<canvas class="prologue-backdrop" width="0" height="0" aria-hidden="true"></canvas><video id="intro-video" class="prologue-film" playsinline preload="none" aria-hidden="true" tabindex="-1"></video>
      <div class="prologue-shade" aria-hidden="true"></div>
      <header class="prologue-header"><span class="prologue-brand" aria-hidden="true">RELIC</span><span class="prologue-preview" hidden></span><button id="skip-intro" class="prologue-skip"><span></span></button></header>
      <button class="prologue-reveal prologue-visually-hidden" type="button" hidden></button>
      <div class="prologue-caption"><svg class="prologue-endmark" viewBox="0 0 100 100" aria-hidden="true"><path d="M35 75V29h20c11 0 17 6 17 15 0 9-7 15-18 15H35m19 0 20 18"/><path class="prologue-orbit" d="M20 63C10 37 32 12 59 16c14 2 24 8 30 19"/><circle cx="89" cy="35" r="2"/></svg><div class="prologue-context"><p id="intro-kicker"></p><p id="intro-speaker"></p></div><h1 id="intro-line"></h1><span class="prologue-visually-hidden" id="intro-transcript" aria-live="polite" aria-atomic="true"></span><p id="intro-source" hidden></p>
        <div class="prologue-gate" hidden><p id="intro-status" role="status"></p><div class="prologue-gate-actions"><button class="prologue-play-film">${icon('play')}<span></span></button><button class="prologue-enter"><span></span></button></div></div>
      </div>
      <p class="prologue-loading" role="status" hidden></p>
      <footer class="prologue-controls"><time class="prologue-time" aria-hidden="true">0:00</time><label class="prologue-scrubber"><span class="prologue-visually-hidden"></span><input type="range" min="0" max="1" step="0.01" value="0"></label><div class="prologue-transport"><button class="prologue-pause" type="button"></button><button class="prologue-sound-cta" type="button">${icon('sound')}<span></span></button><button class="prologue-audio" type="button" aria-pressed="false"></button><button class="prologue-captions" type="button" aria-pressed="true">${icon('captions')}</button><button class="prologue-clean" type="button">${icon('clean')}</button><button class="prologue-fullscreen" type="button">${icon('fullscreen')}</button><button class="prologue-download" type="button" hidden>${icon('download')}</button></div></footer>`;
    const video = element.querySelector('#intro-video');
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
    const soundCTA = element.querySelector('.prologue-sound-cta');
    const range = element.querySelector('input[type="range"]');
    const time = element.querySelector('.prologue-time');
    const loading = element.querySelector('.prologue-loading');
    const header = element.querySelector('.prologue-header');
    const preview = element.querySelector('.prologue-preview');
    const clean = element.querySelector('.prologue-clean');
    const captions = element.querySelector('.prologue-captions');
    const fullscreen = element.querySelector('.prologue-fullscreen');
    const transcript = element.querySelector('#intro-transcript');
    const download = element.querySelector('.prologue-download');
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
    let resumeWhenVisible = false;
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
    let typedNode = null;
    let typedValue = '';
    let typedCharacters = [];
    let typedGlyphs = [];
    let typedCadence = [];
    let typedCount = -1;
    let typedCaret = null;
    let typingViewport = '';
    let offlineReady = false;
    let offlineCheck = null;
    let backdropPainted = false;
    let backdropDisabled = !backdropContext;
    let backdropPaintAt = -Infinity;
    let backdropPosition = -Infinity;
    let backdropScene = '';
    const active = { controller, video, backdrop, caption, cancelFrame, cancelLoading, cancelChrome, stream: null };
    session = active;
    const current = () => session === active && !signal.aborted;
    const duration = () => Number.isFinite(video.duration) && video.duration > 0
      ? video.duration : Number(filmMedia.duration) || Number(cues.at(-1)?.end) || 1;

    function cancelChrome() {
      if (chromeTimer !== null) view.clearTimeout(chromeTimer);
      chromeTimer = null;
    }
    function canHideChrome() {
      return !video.paused && !video.ended && !gateReason && !failed && loading.hidden;
    }
    function scheduleChrome() {
      cancelChrome();
      if (!chromeVisible || !canHideChrome()) return;
      chromeTimer = view.setTimeout(() => {
        chromeTimer = null;
        if (!current() || !canHideChrome()) return;
        // Keyboard focus remains discoverable until the user chooses clean view.
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
      clean.setAttribute('aria-label', chromeVisible ? copy().clean : copy().show);
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
        typedCharacters = graphemes(typedValue, lang);
        title.setAttribute('aria-label', typedValue);
        title.dataset.fullTitle = typedValue;
        transcript.textContent = cue?.kind === 'visual' ? '' : typedValue;
        typedNode = null;
        typedCaret = null;
        typedGlyphs = [];
        typedCount = -1;
        typingViewport = '';
        title.hidden = !typedValue;
        if (cue?.kind === 'typing') {
          typedNode = document.createElement('span');
          typedNode.className = 'prologue-type-text';
          typedNode.setAttribute('aria-hidden', 'true');
          typedNode.dataset.visibleText = '';
          typedNode.dataset.typedCount = '0';
          typedCadence = typingStops(typedCharacters);
          // Hidden glyphs reserve their final line boxes. Revealing a character
          // never recentres an unfinished word or moves the preceding letters.
          typedGlyphs = typedCharacters.map(character => {
            const glyph = document.createElement('span');
            glyph.className = 'prologue-type-glyph';
            glyph.textContent = character;
            glyph.style.opacity = '0';
            typedNode.append(glyph);
            return glyph;
          });
          typedCaret = document.createElement('span');
          typedCaret.className = 'prologue-type-caret';
          typedNode.append(typedCaret);
          title.replaceChildren(typedNode);
        } else title.textContent = typedValue;
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
      if (typedNode && cue) {
        const delay = Number(cue.typingStart ?? .35);
        const span = Math.max(.1, Number(cue.typingDuration ?? Math.min(4.5, cue.end - cue.start - 1.5)));
        // Both the irregular keystrokes and caret use the media clock, never
        // wall-clock time. A pause holds the exact glyphs and a seek restores them.
        const progress = clamp((position - cue.start - delay) / span);
        // A static glyph reveal does not move the image or text layout. Keep it
        // after explicit Play even with reduced motion; do not replace it with
        // an instantly visible sentence on phones with that preference enabled.
        const count = gateReason ? 0 : typedCadence.filter(stop => stop <= progress).length;
        const changed = count !== typedCount;
        if (changed) {
          for (let i = Math.min(Math.max(typedCount, 0), count); i < Math.max(typedCount, count); i += 1) {
            if (typedGlyphs[i]) {
              typedGlyphs[i].style.visibility = i < count ? 'visible' : 'hidden';
              if (i >= count) typedGlyphs[i].style.opacity = '0';
            }
          }
          typedNode.dataset.visibleText = typedCharacters.slice(0, count).join('');
          typedNode.dataset.typedCount = String(count);
          typedCount = count;
        }
        // The very short letter entrance is sampled from video time, rather
        // than a CSS transition. Pausing freezes it; rewinding reverses it.
        // Reduced motion retains readable keystrokes without the extra fade.
        const inkDuration = reducedMotion() ? 0 : Math.min(.085, span / Math.max(1, typedCharacters.length) * .72);
        for (let i = 0; i < count; i += 1) {
          const ink = inkDuration ? smooth((position - cue.start - delay - typedCadence[i] * span) / inkDuration) : 1;
          const opacity = String(Math.round(ink * 1000) / 1000);
          if (typedGlyphs[i].style.opacity !== opacity) typedGlyphs[i].style.opacity = opacity;
        }
        // The play gate hides the heading with display:none. Re-measure when
        // it closes, even if no character has appeared yet.
        const viewport = `${view.innerWidth}:${view.innerHeight}:${Boolean(gateReason)}`;
        if (typedCaret && (changed || viewport !== typingViewport)) {
          let index = count ? count - 1 : 0;
          let beginsLine = !count || typedCharacters[index] === '\n';
          if (beginsLine) {
            if (count) index = count;
            while (typedCharacters[index] === '\n' && index < typedGlyphs.length - 1) index += 1;
          }
          const glyph = typedGlyphs[Math.min(index, typedGlyphs.length - 1)];
          if (glyph) {
            const fontSize = parseFloat(view.getComputedStyle(title).fontSize) || 30;
            let bounds = glyph.getBoundingClientRect();
            // A collapsed space at an automatic line wrap can have a zero-size
            // box. Anchor the caret before the next glyph on that line instead
            // of briefly jumping to the heading's origin.
            if (!beginsLine && /\s/.test(typedCharacters[index])) {
              let next = count;
              while (typedCharacters[next] === '\n' && next < typedGlyphs.length - 1) next += 1;
              const nextBounds = typedGlyphs[next]?.getBoundingClientRect();
              if (nextBounds && (bounds.width < .01 || nextBounds.top > bounds.top + fontSize * .5)) {
                bounds = nextBounds;
                beginsLine = true;
              }
            }
            const box = typedNode.getBoundingClientRect();
            typedCaret.style.left = `${((beginsLine ? bounds.left : bounds.right) - box.left + 2).toFixed(2)}px`;
            typedCaret.style.top = `${(bounds.top - box.top + fontSize * .04).toFixed(2)}px`;
            typedCaret.style.height = `${(fontSize * .92).toFixed(2)}px`;
          }
          typingViewport = viewport;
        }
        const cursor = !gateReason && position < cue.start + delay + span + .8;
        const typing = progress > 0 && progress < 1;
        title.style.setProperty('--cursor-opacity', cursor && (typing || reducedMotion() || Math.floor(Math.max(0, position - cue.start) * 2.4) % 2 === 0) ? '1' : '0');
      }
      const endProgress = cue?.kind === 'end' ? smooth((position - cue.start) / 1.8) : 0;
      // Inherit the ending treatment on both picture layers. The portrait
      // backdrop otherwise stays clear while only the small contained film blurs.
      element.style.setProperty('--end-progress', endProgress.toFixed(4));
      element.style.setProperty('--end-blur', `${(endProgress * 22).toFixed(2)}px`);
      element.style.setProperty('--end-brightness', (1 - endProgress * .42).toFixed(3));
      element.style.setProperty('--end-scale', (1 + endProgress * .055).toFixed(4));
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
      const position = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      let index = cues.findIndex(cue => position >= Number(cue.start) && position < Number(cue.end));
      // The final decoded frame can report duration exactly before `ended`.
      // Retain the end card through that frame and the exit fade, without a
      // one-frame flash of the sharp background or disappearance of RELIC.
      if (index < 0 && cues.at(-1)?.kind === 'end' && position >= Number(cues.at(-1).start) && position <= Number(cues.at(-1).end) + .05) index = cues.length - 1;
      if (gateReason && index < 0 && cues.length) index = 0;
      setCaption(index, position);
      const length = duration();
      range.max = String(length);
      range.value = String(Math.min(position, length));
      range.style.setProperty('--prologue-progress', `${Math.max(0, Math.min(100, position / length * 100))}%`);
      const clockText = `${clock(position)} / ${clock(length)}`;
      if (time.textContent !== clockText) {
        time.textContent = clockText;
        range.setAttribute('aria-valuetext', clockText);
      }
      const nextTransport = `${language()}|${video.paused}|${video.muted}|${gateReason}|${soundChoice}|${captionsVisible}|${document.fullscreenElement === element}`;
      if (transportState !== nextTransport) {
        transportState = nextTransport;
        range.setAttribute('aria-label', copy().position);
        preview.hidden = !filmMedia.preview;
        preview.textContent = filmMedia.preview ? copy().preview : '';
        download.setAttribute('aria-label', copy().offline);
        download.title = copy().offline;
        skip.querySelector('span').textContent = copy().skip;
        play.querySelector('span').textContent = copy().play;
        enter.querySelector('span').textContent = copy().enter;
        pause.innerHTML = icon(video.paused ? 'play' : 'pause');
        pause.setAttribute('aria-label', video.paused ? copy().resume : copy().pause);
        audio.innerHTML = icon(video.muted ? 'muted' : 'sound');
        audio.setAttribute('aria-label', video.muted ? copy().unmute : copy().mute);
        audio.setAttribute('aria-pressed', String(!video.muted));
        soundCTA.querySelector('span').textContent = copy().watchSound;
        soundCTA.setAttribute('aria-label', copy().watchSound);
        soundCTA.hidden = !video.muted || soundChoice || Boolean(gateReason) || failed;
        captions.setAttribute('aria-label', captionsVisible ? copy().hideCaptions : copy().captions);
        captions.setAttribute('aria-pressed', String(captionsVisible));
        clean.setAttribute('aria-label', copy().clean);
        clean.disabled = video.paused || Boolean(gateReason) || failed;
        fullscreen.innerHTML = icon(document.fullscreenElement === element ? 'exitFullscreen' : 'fullscreen');
        fullscreen.setAttribute('aria-label', document.fullscreenElement === element ? copy().exitFullscreen : copy().fullscreen);
      }
    }
    function showGate(reason) {
      if (!current()) return;
      gateReason = reason;
      gate.hidden = false;
      controls.hidden = true;
      play.hidden = reason === 'unavailable';
      status.textContent = copy()[reason];
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
    async function playFilm() {
      if (!current() || failed) return;
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
        try { active.stream = attachFilmSource(video, filmMedia); }
        catch { fail(); return; }
      }
      if (document.hidden) { resumeWhenVisible = true; return; }
      hideGate();
      try {
        await video.play();
        if (!current() || request !== attempt) return;
        render(); queueFrame(); scheduleChrome();
      } catch {
        if (!current() || request !== attempt || failed || document.hidden) return;
        showGate('blocked');
      }
    }
    function pauseFilm() {
      attempt += 1;
      resumeWhenVisible = false;
      video.pause();
      render();
    }
    function fail() {
      if (!current() || failed) return;
      failed = true;
      attempt += 1;
      resumeWhenVisible = false;
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
      if (!current()) return;
      if (document.hidden) {
        resumeWhenVisible = !video.paused && !video.ended;
        attempt += 1;
        video.pause();
      } else if (resumeWhenVisible && !failed) {
        resumeWhenVisible = false;
        playFilm();
      }
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
      if (!current() || element.inert || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape' && document.fullscreenElement === element) {
        event.preventDefault(); event.stopPropagation();
        document.exitFullscreen?.().catch(() => {});
        setChrome(true); return;
      }
      const target = event.target;
      if (target?.matches?.('input, textarea, select') || target?.isContentEditable) { setChrome(true); return; }
      const key = event.key.toLowerCase();
      if (key === 'h') { event.preventDefault(); event.stopPropagation(); setChrome(!chromeVisible); return; }
      setChrome(true);
      if (key === 'c' && !gateReason) { event.preventDefault(); event.stopPropagation(); toggleCaptions(); }
      else if (key === 'f' && canFullscreen) { event.preventDefault(); event.stopPropagation(); toggleFullscreen(); }
      else if (key === 'm' && !gateReason) { event.preventDefault(); event.stopPropagation(); soundChoice = true; video.muted = !video.muted; render(); scheduleChrome(); }
      else if ((key === 'k' || key === ' ') && !target?.closest?.('button') && !gateReason) { event.preventDefault(); event.stopPropagation(); video.paused ? playFilm() : pauseFilm(); }
    }
    element.addEventListener('pointerdown', event => {
      lastPointer = { x: event.clientX, y: event.clientY };
      if (event.target.closest('button, input, label, a, .prologue-gate')) { setChrome(true); return; }
      setChrome(!chromeVisible);
    }, { signal });
    element.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;
      if (lastPointer && Math.hypot(event.clientX - lastPointer.x, event.clientY - lastPointer.y) < 7) return;
      lastPointer = { x: event.clientX, y: event.clientY };
      setChrome(true);
    }, { signal });
    element.addEventListener('focusin', event => { if (event.target !== element) setChrome(true); }, { signal });
    reveal.addEventListener('click', () => setChrome(true), { signal });
    clean.addEventListener('click', () => setChrome(false), { signal });
    captions.addEventListener('click', toggleCaptions, { signal });
    fullscreen.addEventListener('click', toggleFullscreen, { signal });
    download.addEventListener('click', () => {
      setChrome(true, false);
      onOffline?.({ language: language(), media: filmMedia, element, trigger: download, signal });
    }, { signal });
    document.addEventListener('fullscreenchange', render, { signal });
    document.addEventListener('keydown', keyboardControls, { signal, capture: true });
    skip.addEventListener('click', finish, { signal });
    enter.addEventListener('click', finish, { signal });
    play.addEventListener('click', () => { soundChoice = true; video.muted = false; playFilm(); }, { signal });
    pause.addEventListener('click', () => video.paused ? playFilm() : pauseFilm(), { signal });
    audio.addEventListener('click', () => { soundChoice = true; video.muted = !video.muted; render(); setChrome(true); }, { signal });
    soundCTA.addEventListener('click', () => {
      soundChoice = true; video.muted = false;
      if (video.paused && !failed) playFilm();
      render();
      setChrome(true);
    }, { signal });
    range.addEventListener('input', () => {
      if (!hasSource || failed) return;
      try { video.currentTime = Number(range.value); } catch { /* Metadata may still be arriving. */ }
      render();
    }, { signal });
    video.addEventListener('play', () => {
      if (document.hidden) { resumeWhenVisible = true; video.pause(); return; }
      hideGate(); render(); queueFrame(); scheduleChrome();
    }, { signal });
    video.addEventListener('pause', () => { cancelFrame(); cancelLoading(); render(); setChrome(true, false); }, { signal });
    video.addEventListener('playing', cancelLoading, { signal });
    video.addEventListener('waiting', waiting, { signal });
    video.addEventListener('stalled', waiting, { signal });
    for (const event of ['timeupdate', 'seeked', 'durationchange', 'loadedmetadata', 'loadeddata', 'volumechange']) {
      video.addEventListener(event, render, { signal });
    }
    video.addEventListener('ended', finish, { signal });
    video.addEventListener('error', () => {
      try { if (active.stream?.recover()) return; } catch { /* Fall back to the readable error state. */ }
      fail();
    }, { signal });
    document.addEventListener('visibilitychange', visibilityChanged, { signal });
    document.addEventListener('keydown', trapFocus, { signal });
    view.addEventListener('offline', async () => {
      if (!await offlinePlayable() && current()) fail();
    }, { signal });
    view.addEventListener('online', () => { offlineReady = false; offlineCheck = null; }, { signal });
    view.addEventListener('resize', render, { signal });
    render();
    onOpen();
    if (keyboard) skip.focus({ preventScroll: true });
    // Cache readiness is asynchronous; a closed session must never attach media.
    (async () => {
      if (view.navigator.onLine === false && !await offlinePlayable()) {
        if (current()) fail();
        return;
      }
      if (!current()) return;
      if (reducedMotion()) showGate('reduced');
      else playFilm();
    })();
  }

  return {
    start,
    finish,
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
