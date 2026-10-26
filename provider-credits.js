/** Keep provider-owned attribution DOM visible in a reserved renderer footer. */
export function initializeProviderCredits({ viewport = document.querySelector('.pd-viewport'), elements = [] } = {}) {
  if (!viewport) return null;
  const entries = elements.filter(Boolean);
  if (!entries.length) return null;
  const document = viewport.ownerDocument;
  if (!document.querySelector('link[href*="provider-credits.css"]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet'; stylesheet.href = new URL('./provider-credits.css', import.meta.url).href;
    document.head.append(stylesheet);
  }
  let dock = viewport.querySelector(':scope > .provider-credit-dock');
  if (!dock) {
    dock = document.createElement('div');
    dock.className = 'provider-credit-dock';
    dock.setAttribute('role','region');
    dock.setAttribute('aria-label',document.documentElement.lang === 'fr' ? 'Crédits des données et images' : 'Data and imagery credits');
    viewport.append(dock);
  }
  for (const element of entries) dock.append(element);
  viewport.classList.add('has-provider-credit-dock');
  let frame = 0;
  function refresh() {
    frame = 0;
    dock.setAttribute('aria-label',document.documentElement.lang === 'fr' ? 'Crédits des données et images' : 'Data and imagery credits');
    dock.hidden = ![...dock.children].some(element => !element.hidden && (element.textContent.trim() || element.querySelector('img,svg')));
    const height = dock.hidden ? 0 : Math.ceil(dock.getBoundingClientRect().height);
    const value = `${height}px`;
    if (viewport.style.getPropertyValue('--provider-credits-height') !== value) {
      viewport.style.setProperty('--provider-credits-height',value);
      window.dispatchEvent(new Event('resize'));
    }
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(refresh); };
  const mutation = new MutationObserver(schedule);
  for (const element of entries) mutation.observe(element,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden','class','src']});
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  resize?.observe(dock);
  window.addEventListener('resize',schedule,{passive:true});
  const language = new MutationObserver(schedule);
  language.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  refresh();
  return { element:dock, refresh:schedule };
}
