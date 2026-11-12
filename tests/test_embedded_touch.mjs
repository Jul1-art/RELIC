import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../src/worlds/embedded-globe.js',import.meta.url),'utf8');
const gestures=source.slice(source.indexOf('    const touchPoints=new Map();'),source.indexOf("    scene.canvas.addEventListener('pointerdown',interaction"));
function fixture(){
  const handlers=new Map(),updates=[],zooms=[],looks=[],captured=new Set(),controller={enableInputs:true};
  const canvas={clientWidth:800,clientHeight:600,
    addEventListener(type,fn){handlers.set(type,fn);},
    setPointerCapture(id){captured.add(id);},releasePointerCapture(id){captured.delete(id);}};
  const scene={canvas,requestRender(){},preUpdate:{addEventListener:fn=>updates.push(fn)}};
  new Function('scene','controller','viewer','interaction','lookAround','zoom',gestures)(
    scene,controller,{canvas},()=>{},(...values)=>looks.push(values),factor=>zooms.push(factor));
  function emit(type,id,x,y){
    handlers.get(type)({type,pointerId:id,pointerType:'touch',clientX:x,clientY:y,preventDefault(){}});
  }
  return {emit,controller,zooms,looks,captured,tick(){for(const fn of updates)fn();}};
}
test('detailed globe processes parallel finger movement once without accidental zoom',()=>{
  const f=fixture();
  f.emit('pointerdown',1,300,300);f.emit('pointerdown',2,500,300);
  assert.equal(f.controller.enableInputs,false);
  f.emit('pointermove',1,350,340);f.emit('pointermove',2,550,340);
  assert.equal(f.looks.length,0);f.tick();
  assert.equal(f.looks.length,1);assert.equal(f.zooms[0],1);
  f.tick();assert.equal(f.looks.length,1);
  f.emit('pointerup',1,350,340);f.emit('pointerup',2,550,340);
  assert.equal(f.controller.enableInputs,true);assert.equal(f.captured.size,0);
});
test('detailed globe flushes a final pinch on release and recovers after capture loss',()=>{
  const f=fixture();
  f.emit('pointerdown',1,300,300);f.emit('pointerdown',2,500,300);
  f.emit('pointermove',1,250,300);f.emit('pointermove',2,550,300);
  f.emit('pointerup',2,550,300);
  assert.ok(Math.abs(f.zooms[0]-2/3)<1e-12);assert.equal(f.controller.enableInputs,true);
  f.emit('lostpointercapture',1,250,300);assert.equal(f.captured.size,0);
});
test('detailed globe restores the existing input state after cancellation',()=>{
  const f=fixture();f.controller.enableInputs=false;
  f.emit('pointerdown',1,300,300);f.emit('pointerdown',2,500,300);
  f.emit('pointercancel',1,300,300);f.emit('pointercancel',2,500,300);
  assert.equal(f.controller.enableInputs,false);assert.equal(f.captured.size,0);
});
