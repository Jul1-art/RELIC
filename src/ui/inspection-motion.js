import {
 bindPanelDisclosure,
 createHoverDisclosure,
} from '../../vendor/gods-eye-view/panelDisclosure.js';

const pendingCollapse=new WeakMap();

function isTray(panel){return panel.element.classList.contains('inspection-tray');}

function cancelPendingCollapse(panel){
 const timer=pendingCollapse.get(panel.body);
 if(timer===undefined)return;
 panel.body.ownerDocument.defaultView.clearTimeout(timer);
 pendingCollapse.delete(panel.body);
}

/** Adapt RELIC's markup to God's Eye View's unmodified disclosure controller. */
export function bindInspectionMotion({panel,onToggle,onEscape,focusTarget,isActive}){
 const document=panel.element.ownerDocument;
 const href=new URL('./inspection-motion.css',import.meta.url).href;
 if(!document.querySelector('link[data-inspection-motion]')){
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=href;
  link.dataset.inspectionMotion='';
  document.head.append(link);
 }

 const tray=isTray(panel);
 const toggle=()=>onToggle(!panel.element.classList.contains('collapsed'),{explicit:true});
 const controller=tray
  ?createHoverDisclosure({panel:panel.element,disclosure:panel.toggle,onChange:onToggle,onEscape,focusTarget,isActive,documentRef:document})
  :bindPanelDisclosure({panel:panel.element,onEscape});
 if(!tray)panel.toggle.addEventListener('click',toggle);
 return {destroy(){
  if(!tray)panel.toggle.removeEventListener('click',toggle);
  controller.destroy();
  cancelPendingCollapse(panel);
 }};
}

/** Keep dock trays mounted during the upstream CSS slide. A closed body is inert. */
export function setInspectionPanelExpanded(panel,expanded){
 const {element,body,toggle}=panel;
 const tray=isTray(panel);
 cancelPendingCollapse(panel);
 toggle.setAttribute('aria-expanded',String(expanded));
 if(expanded){
  if(body.hidden){
   body.hidden=false;
   // Give a newly mounted body its collapsed styles before the reveal.
   body.getBoundingClientRect();
  }
  element.classList.remove('collapsed','inspection-collapsing');
  body.inert=false;
  return;
 }

 if(body.contains(body.ownerDocument.activeElement))toggle.focus({preventScroll:true});
 body.inert=true;
 element.classList.add('collapsed');
 if(tray)return;

 const view=body.ownerDocument.defaultView;
 const {motion}=body.ownerDocument.documentElement.dataset;
 const reduced=motion==='reduced'||(!motion&&view.matchMedia('(prefers-reduced-motion: reduce)').matches);
 if(element.closest('[hidden]')||reduced){
  body.hidden=true;
  element.classList.remove('inspection-collapsing');
  return;
 }

 element.classList.add('inspection-collapsing');
 // Match the 300ms parameter-panel transition from God's Eye View foundation.css.
 const timer=view.setTimeout(()=>{
  pendingCollapse.delete(body);
  body.hidden=true;
  element.classList.remove('inspection-collapsing');
 },300);
 pendingCollapse.set(body,timer);
}
