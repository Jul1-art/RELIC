/** Reveal the existing mascot through a small floor portal, then release the tour. */
export function createMascotArrival({host,sprite,reducedMotion=()=>false}){
  const viewport=document.createElement('span');viewport.className='mascot-emergence';
  const portal=document.createElement('span');portal.className='mascot-portal';
  const lip=document.createElement('span');lip.className='mascot-portal-lip';
  for(const element of [portal,lip]){element.setAttribute('aria-hidden','true');element.hidden=true;}
  sprite.before(viewport);viewport.append(sprite);host.prepend(portal);host.append(lip);
  let generation=0,animations=[],disposed=false,previousTabIndex=host.tabIndex;
  function settle(){
    for(const animation of animations)animation.cancel();animations=[];
    portal.hidden=true;lip.hidden=true;
    host.dataset.arrival='ready';host.removeAttribute('aria-busy');host.tabIndex=previousTabIndex;
  }
  function cancel(){generation++;settle();}
  async function play(){
    cancel();if(disposed)return false;
    const current=generation;
    if(reducedMotion()||!sprite.animate)return true;
    previousTabIndex=host.tabIndex;host.tabIndex=-1;host.setAttribute('aria-busy','true');host.dataset.arrival='preparing';
    await Promise.allSettled([...sprite.querySelectorAll('img')].map(image=>image.decode()));
    if(current!==generation||disposed)return false;
    if(reducedMotion()){settle();return true;}
    host.dataset.arrival='entering';portal.hidden=false;lip.hidden=false;
    const duration=1700;
    const ringFrames=[
      {opacity:0,transform:'scale(.08,.2)',offset:0},
      {opacity:1,transform:'scale(1.05,1.1)',offset:.16},
      {opacity:1,transform:'scale(1,1)',offset:.28},
      {opacity:1,transform:'scale(1,1)',offset:.72},
      {opacity:.6,transform:'scale(.6,.8)',offset:.87},
      {opacity:0,transform:'scale(.04,.1)',offset:1},
    ];
    animations=[
      portal.animate(ringFrames,{duration,fill:'both',easing:'ease-in-out'}),
      lip.animate(ringFrames,{duration,fill:'both',easing:'ease-in-out'}),
      sprite.animate([
        {transform:'translateY(110%)',opacity:0,offset:0},
        {transform:'translateY(110%)',opacity:1,offset:.2,easing:'cubic-bezier(.18,.75,.25,1)'},
        {transform:'translateY(-3px)',opacity:1,offset:.64,easing:'ease-in-out'},
        {transform:'translateY(0)',opacity:1,offset:.76},
        {transform:'translateY(0)',opacity:1,offset:1},
      ],{duration,fill:'both'}),
    ];
    await Promise.allSettled(animations.map(animation=>animation.finished));
    if(current!==generation||disposed)return false;
    settle();return true;
  }
  function dispose(){if(disposed)return;disposed=true;cancel();portal.remove();lip.remove();viewport.replaceWith(sprite);}
  return {play,cancel,dispose};
}
