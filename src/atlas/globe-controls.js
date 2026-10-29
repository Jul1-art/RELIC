const SVG={up:'M12 19V5m-6 6 6-6 6 6',down:'M12 5v14m-6-6 6 6 6-6',left:'M19 12H5m6-6-6 6 6 6',right:'M5 12h14m-6-6 6 6-6 6',in:'M12 5v14M5 12h14',out:'M5 12h14',turnLeft:'M4 9a8 8 0 1 1 0 7M4 4v5h5',turnRight:'M20 9a8 8 0 1 0 0 7m0-12v5h-5',nadir:'M5 5h14v14H5ZM12 8v8M8 12h8',reset:'M5 10a8 8 0 1 1-1 6M5 4v6h6'};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${SVG[name]}"/></svg>`;

/** Compact inspector controls shared by Three globes and the Cesium adapter. */
export function createGlobeControls({host,getNavigation,getLanguage=()=> 'en',isActive=()=>true,eventTarget=window}){
  const root=document.createElement('section');root.className='globe-controls';host?.append(root);
  const heading=document.createElement('h3');
  const source=document.createElement('p');source.className='globe-source-status';
  const angleRow=document.createElement('label');angleRow.className='globe-tilt-label';
  const angleLabel=document.createElement('span'),angleValue=document.createElement('output');angleValue.htmlFor='globe-tilt';angleRow.append(angleLabel,angleValue);
  const slider=document.createElement('input');slider.type='range';slider.id='globe-tilt';slider.min='0';slider.max='85';slider.step='1';slider.value='0';
  const row=document.createElement('div');row.className='globe-navigation-row';
  const pad=document.createElement('div');pad.className='globe-navigation-pad';
  const auxiliary=document.createElement('div');auxiliary.className='globe-navigation-aux';
  const buttons=[];let localTilt=0;
  const perform=(method,...args)=>{const navigation=getNavigation?.();if(!navigation)return;navigation[method]?.(...args);refresh();};
  function button(iconName,labelFr,labelEn,callback,className=''){
    const node=document.createElement('button');node.type='button';node.className=className;node.innerHTML=icon(iconName);node.addEventListener('click',callback);buttons.push({node,labelFr,labelEn});return node;
  }
  for(const [direction,fr,en] of [['up','Avancer','Move forward'],['left','Aller à gauche','Move left'],['right','Aller à droite','Move right'],['down','Reculer','Move backward']]){
    pad.append(button(direction,fr,en,()=>perform('move',direction),`globe-move-${direction}`));
  }
  pad.append(button('nadir','Vue du dessus · Nord en haut','Top down · north up',()=>perform('topDown'),'globe-nadir'));
  auxiliary.append(button('in','Se rapprocher','Zoom in',()=>perform('zoom',.7)),button('out','S’éloigner','Zoom out',()=>perform('zoom',1/.7)),button('turnLeft','Tourner à gauche','Turn left',()=>perform('turn',-15)),button('turnRight','Tourner à droite','Turn right',()=>perform('turn',15)));
  row.append(pad,auxiliary);
  const reset=button('reset','Revoir le globe entier','Frame the whole globe',()=>perform('resetView'),'globe-reset-view');
  const resetLabel=document.createElement('span');reset.append(resetLabel);
  const help=document.createElement('details');help.className='globe-controls-help';const summary=document.createElement('summary'),instructions=document.createElement('p');help.append(summary,instructions);
  root.append(heading,source,angleRow,slider,row,reset,help);
  slider.addEventListener('input',()=>{
    const nav=getNavigation?.(),value=Number(slider.value);if(!nav)return;
    if(nav.setTilt)nav.setTilt(value);else nav.tilt?.(value-localTilt);
    localTilt=value;angleValue.textContent=`${Math.round(value)}°`;
  });
  const keyActions={ArrowUp:['move','up'],ArrowDown:['move','down'],ArrowLeft:['move','left'],ArrowRight:['move','right'],q:['turn',-5],e:['turn',5],'+':['zoom',.85],'=':['zoom',.85],'-':['zoom',1/.85],Home:['topDown'],r:['resetView']};
  function keydown(event){
    if(!isActive()||event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.target?.closest?.('input,textarea,select,button,[contenteditable=true],dialog'))return;
    if(event.shiftKey&&['ArrowUp','ArrowDown'].includes(event.key)){perform('tilt',event.key==='ArrowUp'?5:-5);event.preventDefault();return;}
    const action=keyActions[event.key]||keyActions[event.key?.toLowerCase()];if(!action)return;
    perform(...action);event.preventDefault();
  }
  eventTarget.addEventListener('keydown',keydown);
  function refresh(){
    const active=Boolean(isActive());root.hidden=!active;if(!active)return;
    const fr=getLanguage()==='fr';heading.textContent=fr?'Vue et navigation':'View and navigation';
    angleLabel.textContent=fr?'Inclinaison':'Tilt';slider.setAttribute('aria-label',angleLabel.textContent);
    const state=getNavigation?.()?.getViewState?.();if(state&&Number.isFinite(state.tiltDeg)){localTilt=state.tiltDeg;if(document.activeElement!==slider)slider.value=String(Math.round(localTilt));}
    source.textContent=state?.sourceLabel||'';source.hidden=!source.textContent;
    angleValue.textContent=`${Math.round(localTilt)}°`;
    for(const {node,labelFr,labelEn} of buttons){const label=fr?labelFr:labelEn;node.title=label;node.setAttribute('aria-label',label);}
    resetLabel.textContent=fr?'Globe entier':'Whole globe';summary.textContent=fr?'Gestes et raccourcis':'Gestures and shortcuts';
    instructions.textContent=fr?'Glisser : parcourir. Clic droit ou Maj + glisser : incliner et tourner. Deux doigts : incliner, pincer pour zoomer, pivoter pour tourner. Flèches : se déplacer. Maj + ↑/↓ : incliner. Q/E : tourner. +/− : zoom. Début : vue du dessus.':'Drag to move. Right drag or Shift + drag to tilt and turn. Two fingers: drag to tilt, pinch to zoom, twist to turn. Arrows: move. Shift + ↑/↓: tilt. Q/E: turn. +/−: zoom. Home: top down.';
  }
  refresh();return {element:root,refresh,dispose(){root.remove();eventTarget.removeEventListener('keydown',keydown);}};
}
