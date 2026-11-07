import { createMascotSprite } from './mascot-sprite.js';

const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
const KEY_TARGETS = 'input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=tablist],[role=listbox],[role=menu],[role=slider]';
const FACINGS = [
  ['back_left', 'back', 'back_right'],
  ['left_profile', 'front', 'right_profile'],
  ['front_left', 'front', 'front_right'],
];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createExplorationMascot({loading, getLanguage, onLanguageChange}) {
  const sprite = createMascotSprite();
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'relic-exploration-mascot';
  button.hidden = true;
  button.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown');
  button.append(sprite.element);
  const styles = document.createElement('link');
  styles.rel = 'stylesheet';
  styles.href = new URL('./exploration-mascot.css', import.meta.url).href;

  const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const held = new Set();
  let styled = false, suspended = false, paused = false, disposed = false;
  let x = 0, y = 0, frame = 0, timer, previous, phase = 0;
  let facing = 'front', stance, autoTarget = null, limits;

  function pose(direction, state) {
    if (direction === facing && state === stance) return;
    facing = direction;
    stance = state;
    sprite.setPose(direction, state);
  }

  function motionAllowed() {
    const preference = document.documentElement.dataset.motion;
    return preference !== 'reduced' && (preference === 'full' || !systemMotion.matches);
  }

  function interactive() {
    return !button.hidden && !document.querySelector('dialog[open]') &&
      getComputedStyle(button).visibility !== 'hidden';
  }

  function measure() {
    const box = button.getBoundingClientRect();
    const minX = x + 8 - box.left;
    limits = {
      minX,
      maxX: Math.max(minX, x + innerWidth - 8 - box.right),
      minY: Math.min(0, y + 68 - box.top),
      height: box.height,
    };
  }

  function place(nextX, nextY) {
    x = clamp(nextX, limits.minX, limits.maxX);
    y = clamp(nextY, limits.minY, 0);
    button.style.translate = `${x}px ${y}px`;
  }

  function cancelMotion() {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    frame = 0;
    previous = undefined;
    autoTarget = null;
  }

  function settle() {
    cancelMotion();
    pose(facing, paused || !motionAllowed() ? 'resting' : 'idle');
    if (!button.hidden && !paused && motionAllowed()) {
      timer = setTimeout(() => pose(facing, 'resting'), 4500);
    }
  }

  function intent() {
    if (held.size) {
      const dx = Number(held.has('ArrowRight')) - Number(held.has('ArrowLeft'));
      const dy = Number(held.has('ArrowDown')) - Number(held.has('ArrowUp'));
      return {dx, dy};
    }
    return {dx: autoTarget === null ? 0 : Math.sign(autoTarget - x), dy: 0};
  }

  function move(dx, dy, distance) {
    const magnitude = Math.hypot(dx, dy);
    if (!magnitude) return 0;
    const oldX = x, oldY = y;
    place(x + dx * distance / magnitude, y + dy * distance / magnitude);
    return Math.hypot(x - oldX, y - oldY);
  }

  function tick(time) {
    frame = 0;
    if (!interactive() || !motionAllowed()) {
      held.clear();
      settle();
      return;
    }
    const {dx, dy} = intent();
    if (!dx && !dy) { settle(); return; }
    const direction = FACINGS[dy + 1][dx + 1];
    const elapsed = Math.min(.04, (time - (previous ?? time)) / 1000);
    previous = time;
    const speed = limits.height * (autoTarget === null ? 1.5 : .72);
    const distance = autoTarget === null ? elapsed * speed : Math.min(elapsed * speed, Math.abs(autoTarget - x));
    const moved = move(dx, dy, distance);
    if (distance > 0 && moved < .001) { settle(); return; }
    pose(direction, 'walking');
    phase += moved / (limits.height * .60);
    sprite.drawWalk(phase);
    frame = requestAnimationFrame(tick);
  }

  function startMotion() {
    if (frame) return;
    clearTimeout(timer);
    phase = 0;
    previous = undefined;
    frame = requestAnimationFrame(tick);
  }

  function explore(body) {
    held.clear();
    cancelMotion();
    if (!interactive() || paused || !motionAllowed()) { settle(); return; }
    pose(body === 'overview' ? 'back' : 'back_right', 'idle');
    timer = setTimeout(() => {
      if (!interactive()) { settle(); return; }
      measure();
      const distance = limits.height * .50;
      autoTarget = x + distance <= limits.maxX ? x + distance : Math.max(limits.minX, x - distance);
      startMotion();
    }, 950);
  }

  function refresh() {
    if (disposed) return;
    held.clear();
    button.hidden = !styled || suspended || loading.dataset.viewLoading !== 'ready';
    if (!button.hidden) { measure(); place(x, y); }
    settle();
  }

  function arrow(key, pressed) {
    if (!ARROWS.has(key)) return false;
    if (!pressed) {
      if (!held.delete(key)) return false;
      if (!held.size) settle();
      else if (motionAllowed()) startMotion();
      return true;
    }
    if (!interactive()) return false;
    const fresh = !held.has(key);
    if (!held.size) {
      cancelMotion();
      measure();
    }
    held.add(key);
    const {dx, dy} = intent();
    if (!motionAllowed()) {
      move(dx, dy, 10);
      if (dx || dy) pose(FACINGS[dy + 1][dx + 1], 'resting');
    } else if (fresh) {
      move(dx, dy, 5);
      startMotion();
    }
    return true;
  }

  function releaseKeys() {
    if (!held.size) return;
    held.clear();
    settle();
  }
  function keydown(event) {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey ||
        event.metaKey || event.shiftKey || event.target?.closest?.(KEY_TARGETS)) return;
    if (arrow(event.key, true)) event.preventDefault();
  }
  function keyup(event) {
    if (arrow(event.key, false)) event.preventDefault();
  }
  function focusin(event) {
    if (event.target?.closest?.(KEY_TARGETS)) releaseKeys();
  }
  function receiveFrameKey(event) {
    if (event.origin !== location.origin || event.data?.channel !== 'relic-detailed-globe-v15' ||
        event.source !== document.querySelector('.detailed-globe-frame.is-ready')?.contentWindow) return;
    if (event.data.type === 'mascot-key-reset') releaseKeys();
    else if (event.data.type === 'mascot-key' && typeof event.data.pressed === 'boolean') {
      arrow(event.data.key, event.data.pressed);
    }
  }
  function resize() {
    if (button.hidden) return;
    measure();
    place(x, y);
  }
  function updateLabel() {
    const fr = getLanguage() === 'fr';
    button.setAttribute('aria-label', fr ? 'Pause de la mascotte' : 'Pause mascot');
    button.setAttribute('aria-pressed', String(paused));
    button.title = (paused ? (fr ? 'Réveiller la mascotte' : 'Wake the mascot') :
      (fr ? 'Laisser la mascotte se reposer' : 'Let the mascot rest')) + ' · ← ↑ ↓ →';
  }
  button.addEventListener('click', () => {
    paused = !paused;
    updateLabel();
    refresh();
  });

  styles.addEventListener('load', () => { styled = true; refresh(); }, {once: true});
  document.head.append(styles);
  document.body.append(button);
  const observer = new MutationObserver(refresh);
  observer.observe(loading, {attributes: true, attributeFilter: ['data-view-loading']});
  observer.observe(document.documentElement, {attributes: true, attributeFilter: ['data-motion']});
  systemMotion.addEventListener('change', refresh);
  const listeners = [['keydown', keydown], ['keyup', keyup], ['focusin', focusin], ['blur', releaseKeys], ['message', receiveFrameKey], ['resize', resize]];
  for (const [type, listener] of listeners) window.addEventListener(type, listener);
  const unsubscribe = onLanguageChange(updateLabel);

  return {
    explore,
    setSuspended(value) {
      if (suspended === value) return;
      suspended = value;
      refresh();
    },
    dispose() {
      disposed = true;
      cancelMotion();
      observer.disconnect();
      for (const [type, listener] of listeners) window.removeEventListener(type, listener);
      systemMotion.removeEventListener('change', refresh);
      unsubscribe();
      button.remove();
      styles.remove();
    },
  };
}
