/** Shared canvas palette. Surface imagery and physical lighting stay intact. */
const PALETTES={
  night:Object.freeze({light:false,background:'#000000',foreground:'#ffffff',orbit:'#79808c',orbitOpacity:.18}),
  day:Object.freeze({light:true,background:'#ffffff',foreground:'#111111',orbit:'#505661',orbitOpacity:.28}),
};
export function scenePalette(theme='night'){return theme==='day'?PALETTES.day:PALETTES.night;}

export function observeSceneTheme(callback,{root=document.documentElement}={}){
  let last;
  const update=()=>{const palette=scenePalette(root.dataset.theme);if(palette!==last){last=palette;callback(palette);}};
  const observer=new MutationObserver(update);observer.observe(root,{attributes:true,attributeFilter:['data-theme']});
  update();return()=>observer.disconnect();
}
