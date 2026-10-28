/* One foreground loader for all 3D views. Imagery streaming is not foreground loading. */
const controllers = new WeakMap();
const COPY = {
  en:{ preparing:'Preparing the view', slow:'The view is taking longer to open.', failed:'The 3D view could not start.', interrupted:'The graphics view was interrupted.', help:'Reload the view or return to the solar system.', retry:'Reload view', back:'Solar system' },
  fr:{ preparing:'Préparation de la vue', slow:'La vue met plus de temps à s’ouvrir.', failed:'La vue 3D ne peut pas démarrer.', interrupted:'La vue graphique a été interrompue.', help:'Rechargez la vue ou revenez au système solaire.', retry:'Recharger la vue', back:'Système solaire' },
};

function ensureStyles(document) {
  if (document.querySelector('link[data-view-loading-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = new URL('./view-loading.css', import.meta.url).href;
  link.dataset.viewLoadingStyles = ''; document.head.append(link);
}

/** The view becomes ready only after its first rendered frame. A timeout changes
 *  the message rather than inventing success or locking the rest of the UI. */
export function createViewLoading({ element, errorElement = null, getLanguage = () => document.documentElement.lang, timeout = 20000 } = {}) {
  if (!element?.ownerDocument) return { ready(){}, fail(){}, pause(){}, resume(){}, refresh(){}, dispose(){}, get state(){ return 'absent'; } };
  if (controllers.has(element)) return controllers.get(element);
  const document = element.ownerDocument;
  const view = document.defaultView;
  ensureStyles(document);
  let state = 'loading', timer = null, disposed = false, suspended = document.hidden, failureReason = 'failed';
  const copy = () => COPY[getLanguage() === 'fr' ? 'fr' : 'en'];
  const card = document.createElement('div'); card.className = 'view-loading-card';
  const mark = document.createElement('span'); mark.className = 'view-loading-mark'; const logo = document.createElement('img'); logo.src = new URL('../../assets/relic-logo-v1.png', import.meta.url).href; logo.alt = ''; logo.width = 30; logo.height = 27; mark.append(logo); mark.setAttribute('aria-hidden','true');
  const message = document.createElement('span'); message.className = 'view-loading-message';
  const track = document.createElement('span'); track.className = 'view-loading-track'; track.setAttribute('aria-hidden','true'); track.append(document.createElement('span'));
  const retrySlow = document.createElement('button'); retrySlow.type = 'button'; retrySlow.className = 'view-loading-retry'; retrySlow.hidden = true;
  retrySlow.addEventListener('click', () => view.location.reload());
  card.append(mark,message,track,retrySlow);
  element.replaceChildren(card); element.classList.add('relic-view-loading');
  element.classList.remove('done'); element.hidden = false;
  element.setAttribute('role','status'); element.setAttribute('aria-live','polite'); element.setAttribute('aria-busy','true');
  if (errorElement) errorElement.hidden = true;

  function clear() { if (timer !== null) view.clearTimeout(timer); timer = null; }
  function render() {
    element.dataset.viewLoading = state;
    element.classList.toggle('is-slow', state === 'slow');
    message.textContent = state === 'slow' ? copy().slow : copy().preparing;
    retrySlow.hidden = state !== 'slow'; retrySlow.textContent = copy().retry;
  }
  function arm() {
    clear();
    if (disposed || suspended || state !== 'loading') return;
    timer = view.setTimeout(() => {
      timer = null;
      if (disposed || state !== 'loading') return;
      state = 'slow'; render();
    }, Math.max(1000, timeout));
  }
  function ready() {
    if (disposed || state === 'failed' || state === 'ready') return;
    clear(); state = 'ready'; render(); element.classList.add('done'); element.hidden = true;
    element.setAttribute('aria-busy','false');
  }
  function fail(reason = 'failed') {
    if (disposed) return;
    failureReason = reason;
    clear(); state = 'failed'; render(); element.classList.add('done'); element.hidden = true; element.setAttribute('aria-busy','false');
    if (!errorElement) return;
    errorElement.classList.add('relic-view-error'); errorElement.hidden = false; errorElement.setAttribute('role','alert');
    const content = document.createElement('div'); content.className = 'view-error-card';
    const heading = document.createElement('strong'); heading.textContent = reason === 'interrupted' ? copy().interrupted : copy().failed;
    const text = document.createElement('p'); text.textContent = copy().help;
    const actions = document.createElement('div'); actions.className = 'view-error-actions';
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = copy().retry; retry.addEventListener('click', () => view.location.reload());
    const back = document.createElement('a'); back.href = new URL('../../index.html', import.meta.url).href; back.textContent = copy().back;
    actions.append(retry,back); content.append(heading,text,actions); errorElement.replaceChildren(content);
  }
  function pause() { suspended = true; clear(); }
  function resume() { suspended = false; arm(); }
  function refresh() { if (!disposed) state === 'failed' ? fail(failureReason) : render(); }
  const visibility = () => document.hidden ? pause() : resume();
  document.addEventListener('visibilitychange', visibility);
  function dispose() {
    if (disposed) return;
    disposed = true; clear(); document.removeEventListener('visibilitychange',visibility); controllers.delete(element);
    element.hidden = true; element.setAttribute('aria-busy','false');
  }
  const controller = { ready, fail, pause, resume, refresh, dispose, get state(){ return state; } };
  controllers.set(element,controller); render(); arm();
  return controller;
}
