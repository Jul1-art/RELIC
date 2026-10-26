/** Opening cards composed from the media clock, without animation timers. */
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const x = clamp(value); return x * x * (3 - 2 * x); };

function letters(value, language) {
  if (typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(language, {granularity:'grapheme'}).segment(value), part => part.segment);
  }
  return Array.from(value.normalize('NFC'));
}

// Each interval represents one deliberate keystroke. A line break is a breath;
// spaces are quick, while punctuation briefly lets the preceding thought land.
function keystrokes(characters) {
  let elapsed = 0;
  const stops = characters.map((character, index) => {
    const previous = characters[index - 1] || '';
    const cadence = ((index * 13 + character.codePointAt(0) * 3) % 11) / 32;
    let interval = character === '\n' ? 3.8 : character === ' ' ? .26 : .88 + cadence;
    if (!index) interval = .35;
    if (/[.!?]/u.test(previous)) interval += 2.7;
    else if (/[,;:]/u.test(previous)) interval += 1.4;
    elapsed += interval;
    return elapsed;
  });
  return stops.map(value => value / Math.max(1, elapsed));
}

function ensureStyles(document) {
  const href = new URL('./prologue-typing.css', import.meta.url).href;
  if ([...document.querySelectorAll('link[rel=stylesheet]')].some(link => link.href === href)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = href; link.dataset.relicOpeningTyping = '';
  document.head.append(link);
}

/**
 * setCue(cue, text), then render({position, gated}) from the player's media loop.
 * clear() restores the ordinary caption heading. dispose() releases observers.
 */
export function createOpeningTyping({element, getLanguage = () => 'en', reducedMotion = () => false} = {}) {
  if (!element?.ownerDocument) throw new TypeError('An opening heading is required.');
  const document = element.ownerDocument, view = document.defaultView;
  ensureStyles(document);
  let cue = null, root = null, caret = null, lines = [], entries = [], schedule = [];
  let text = '', lastPosition = 0, lastGated = true, count = -1;
  let disposed = false, dirty = true, layoutFrame = null, fontSize = 0;

  function clear() {
    cue = null; root = null; caret = null; lines = []; entries = []; schedule = [];
    text = ''; count = -1; fontSize = 0; dirty = true;
    element.classList.remove('relic-opening-title');
    element.style.removeProperty('--opening-type-size');
    element.removeAttribute('data-typed-count'); element.removeAttribute('data-visible-text');
    element.replaceChildren();
  }

  function setCue(nextCue, value) {
    if (disposed) return;
    clear(); cue = nextCue;
    text = String(value || '').replace(/\r\n?/gu, '\n');
    const characters = letters(text, getLanguage());
    schedule = keystrokes(characters);
    element.classList.add('relic-opening-title');
    element.setAttribute('aria-label', text);
    root = document.createElement('span'); root.className = 'relic-opening-typing'; root.setAttribute('aria-hidden','true');
    let currentLine;
    const appendLine = () => {
      const line = document.createElement('span'); line.className = 'relic-type-line';
      const track = document.createElement('span'); track.className = 'relic-type-track';
      line.append(track); root.append(line); lines.push({element:line, track});
      currentLine = lines.length - 1;
    };
    appendLine();
    for (const character of characters) {
      if (character === '\n') {
        entries.push({character, line:currentLine, node:null, opacity:0}); appendLine();
        continue;
      }
      const glyph = document.createElement('span'); glyph.className = 'relic-type-letter'; glyph.textContent = character;
      glyph.style.opacity = '0'; lines[currentLine].track.append(glyph);
      entries.push({character, line:currentLine, node:glyph, opacity:0});
    }
    caret = document.createElement('span'); caret.className = 'relic-type-cursor';
    root.append(caret); element.append(root); dirty = true;
    render({position:Number(cue?.start) || 0, gated:true});
  }

  function layout() {
    if (!root?.isConnected || !element.getClientRects().length) return false;
    const available = Math.max(1, element.clientWidth || element.parentElement?.clientWidth || view.innerWidth - 48);
    const landscape = view.innerWidth > view.innerHeight && view.innerHeight <= 550;
    const preferred = Math.max(20, Math.min(52, view.innerWidth * .059, landscape ? view.innerHeight * .085 : 52));
    if (fontSize !== preferred) { fontSize = preferred; element.style.setProperty('--opening-type-size', `${fontSize}px`); }
    const natural = Math.max(1, ...lines.map(line => line.track.getBoundingClientRect().width));
    const fitted = Math.max(16, Math.min(preferred, preferred * (available - 12) / natural));
    if (Math.abs(fitted - fontSize) > .05) { fontSize = fitted; element.style.setProperty('--opening-type-size', `${fontSize.toFixed(3)}px`); }
    dirty = false;
    return true;
  }

  function positionCaret(visibleCount) {
    if (!root || !caret || !lines.length || !element.getClientRects().length) return;
    const previous = visibleCount > 0 ? entries[visibleCount - 1] : null;
    const lineIndex = previous?.character === '\n' ? Math.min(previous.line + 1, lines.length - 1) : previous?.line || 0;
    const line = lines[lineIndex], rootBox = root.getBoundingClientRect(), lineBox = line.element.getBoundingClientRect();
    const edge = previous?.node && previous.line === lineIndex ? previous.node.getBoundingClientRect().right : line.track.getBoundingClientRect().left;
    caret.style.transform = `translate3d(${(edge - rootBox.left + Math.max(2,fontSize*.06)).toFixed(2)}px,${(lineBox.top - rootBox.top + (lineBox.height - fontSize * 1.03)/2).toFixed(2)}px,0)`;
    caret.style.height = `${(fontSize * 1.03).toFixed(2)}px`;
  }

  function render({position = lastPosition, gated = false} = {}) {
    if (disposed || !cue || !root) return;
    lastPosition = Number.isFinite(position) ? position : 0; lastGated = Boolean(gated);
    const measured = dirty ? layout() : false;
    const start = (Number(cue.start) || 0) + Math.max(0, Number(cue.typingStart ?? .35));
    const duration = Math.max(.2, Number(cue.typingDuration ?? 4.5));
    const span = Math.max(.1, duration - .09), elapsed = lastPosition - start;
    const staticCard = Boolean(reducedMotion());
    let nextCount = 0;
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index], appearance = schedule[index] * span;
      const revealed = !lastGated && elapsed >= appearance;
      const opacity = !lastGated && staticCard && elapsed >= 0 ? 1 : revealed ? ease((elapsed - appearance) / .09) : 0;
      if (revealed || staticCard && !lastGated && elapsed >= 0) nextCount = index + 1;
      if (entry.node && Math.abs(opacity - entry.opacity) > .001) {
        entry.opacity = opacity; entry.node.style.opacity = opacity.toFixed(3);
      }
    }
    if (nextCount !== count || measured) {
      count = nextCount;
      const visibleText = entries.slice(0,count).map(entry => entry.character).join('');
      root.dataset.typedCount = String(count); root.dataset.visibleText = visibleText;
      element.dataset.typedCount = String(count); element.dataset.visibleText = visibleText;
      positionCaret(count);
    }
    const finished = elapsed >= duration, blinking = !finished || Math.floor((elapsed-duration)*2) % 2 === 0;
    const departure = Number.isFinite(cue.end) ? ease((cue.end-lastPosition)/.45) : 1;
    caret.style.opacity = !lastGated && !staticCard && blinking ? String(departure) : '0';
  }

  function requestLayout() {
    dirty = true;
    if (layoutFrame !== null || disposed || !root) return;
    layoutFrame = view.requestAnimationFrame(() => {
      layoutFrame = null; if (!disposed) render({position:lastPosition,gated:lastGated});
    });
  }
  const observer = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(requestLayout) : null;
  if (element.parentElement) observer?.observe(element.parentElement);
  view.addEventListener('resize', requestLayout, {passive:true});
  function dispose() {
    if (disposed) return;
    disposed = true; observer?.disconnect(); view.removeEventListener('resize',requestLayout);
    if (layoutFrame !== null) view.cancelAnimationFrame(layoutFrame);
    layoutFrame = null; clear();
  }
  return {setCue, render, clear, dispose};
}
