/** RELIC has one appearance: pure black chrome and white controls. */
const root=document.documentElement;

function applyMonochromeTheme(){
  root.dataset.theme='night';
  root.dataset.accent='mono';
  root.style.colorScheme='dark';
  const color=document.querySelector('meta[name="theme-color"]');
  if(color)color.content='#000000';
  for(const button of document.querySelectorAll('[data-theme-toggle]'))button.remove();
}

// Migrate only appearance preferences. API credentials and saved films remain
// separate browser records and are never read or changed here.
try{
  localStorage.setItem('nasa-atlas-theme','night');
  const saved=JSON.parse(localStorage.getItem('relic.preferences.v1')||'null');
  if(saved&&typeof saved==='object'&&!Array.isArray(saved)){
    saved.theme='night';saved.accent='mono';
    localStorage.setItem('relic.preferences.v1',JSON.stringify(saved));
  }
}catch{/* The fixed appearance also works without browser storage. */}

applyMonochromeTheme();
window.addEventListener('relic-preferences-change',applyMonochromeTheme);
window.addEventListener('storage',event=>{
  if(event.key==='nasa-atlas-theme'||event.key==='relic.preferences.v1')applyMonochromeTheme();
});
