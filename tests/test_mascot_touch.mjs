import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=(await readFile(new URL('../src/ui/exploration-mascot.js',import.meta.url),'utf8'))
  .replace(/^import .*;\r?\n/gm,'').replace('export function','function')
  .replace('import.meta.url',"'https://relic.test/src/ui/exploration-mascot.js'");

class Element {
  constructor(){this.listeners=new Map();this.style={};this.dataset={viewLoading:'ready'};this.hidden=false;this.classes=new Set();this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),toggle:(x,on)=>on?this.classes.add(x):this.classes.delete(x)};}
  addEventListener(type,fn){const rows=this.listeners.get(type)||[];rows.push(fn);this.listeners.set(type,rows);}
  removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(row=>row!==fn));}
  emit(type,values={}){const event={type,pointerId:1,pointerType:'touch',button:0,clientX:110,clientY:210,detail:1,preventDefault(){this.prevented=true;},stopPropagation(){},...values};for(const fn of this.listeners.get(type)||[])fn(event);return event;}
  append(){}setAttribute(){}remove(){}setPointerCapture(){}releasePointerCapture(){}
  getBoundingClientRect(){const [x=0,y=0]=(this.style.translate||'0px 0px').split(' ').map(parseFloat);return {left:100+x,top:200+y,width:70,height:88};}
}
async function fixture(){
  const button=new Element(),styles=new Element(),window=new Element();
  window.visualViewport=new Element();
  const document={createElement:type=>type==='button'?button:styles,head:new Element(),body:new Element(),documentElement:{dataset:{}}};
  let replays=0;
  const factory=new Function('document','window','matchMedia','MutationObserver','createMascotSprite','createSpaceyTour','createMascotArrival','innerWidth','innerHeight','cancelAnimationFrame','requestAnimationFrame',source+';return createExplorationMascot;');
  const mascot=factory(document,window,()=>({matches:false}),class{observe(){}disconnect(){}},
    ()=>({element:new Element(),setPose(){},drawWalk(){}}),
    ()=>({showInvite(){},suspend(){},dispose(){},replay(){replays++;}}),
    ()=>({play:()=>Promise.resolve(true),cancel(){},dispose(){}}),
    800,600,()=>{},()=>0)({loading:new Element(),getLanguage:()=>'fr',onLanguageChange:()=>()=>{}});
  styles.emit('load');await Promise.resolve();
  return {button,window,mascot,replays:()=>replays};
}
test('touch drag remains owned by the first finger and does not launch the tour',async()=>{
  const f=await fixture();
  f.button.emit('pointerdown');
  f.button.emit('pointerdown',{pointerId:2,clientX:300});
  f.button.emit('pointermove',{pointerId:2,clientX:400});
  assert.equal(f.button.style.translate,undefined);
  const move=f.button.emit('pointermove',{clientX:210,clientY:260});
  assert.equal(move.prevented,true);
  assert.equal(f.button.getBoundingClientRect().left,200);
  f.button.emit('pointerup',{clientX:210,clientY:260});
  assert.equal(f.button.emit('click').prevented,true);assert.equal(f.replays(),0);
  f.button.emit('click',{detail:0});assert.equal(f.replays(),1,'Keyboard activation remains available');
  f.mascot.dispose();
});
test('cancelled drag, lost capture and suspension release the finger cleanly',async()=>{
  for(const interruption of ['pointercancel','lostpointercapture','suspend','blur']){
    const f=await fixture();
    f.button.emit('pointerdown');f.button.emit('pointermove',{clientX:210});
    if(interruption==='suspend')f.mascot.setSuspended(true);
    else if(interruption==='blur')f.window.emit('blur');
    else f.button.emit(interruption);
    const position=f.button.style.translate;
    f.button.emit('pointermove',{clientX:300});assert.equal(f.button.style.translate,position);
    assert.equal(f.button.classes.has('mascot-dragging'),false);
    f.mascot.dispose();
  }
});
test('the mascot stays within the screen and a stationary tap opens the tour',async()=>{
  const f=await fixture();
  f.button.emit('pointerdown');f.button.emit('pointermove',{clientX:3000,clientY:-2000});
  const box=f.button.getBoundingClientRect();assert.equal(box.left,722);assert.equal(box.top,8);
  f.button.emit('pointerup');f.mascot.dispose();
  const tap=await fixture();tap.button.emit('pointerdown');tap.button.emit('pointerup');tap.button.emit('click');
  assert.equal(tap.replays(),1);tap.mascot.dispose();
});

test('the mascot remains inside the visual viewport when the mobile viewport shrinks',async()=>{
  const f=await fixture();
  Object.assign(f.window.visualViewport,{width:320,height:300,offsetLeft:20,offsetTop:30});
  f.button.emit('pointerdown');f.button.emit('pointermove',{clientX:3000,clientY:3000});
  assert.equal(f.button.getBoundingClientRect().left,262);
  assert.equal(f.button.getBoundingClientRect().top,234);
  f.button.emit('pointerup');f.mascot.dispose();
});
