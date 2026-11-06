import assert from 'node:assert/strict';
import test from 'node:test';
import {createStyleTransition} from '../src/ui/visual-effects.js';

test('visual presets use the original 500 ms quadratic crossfade',()=>{
  let time=0;
  const fade=createStyleTransition({now:()=>time});
  fade.setStyle('noir');
  time=125;
  fade.update();
  assert.equal(fade.intensities.noir,.125);
  time=250;
  fade.update();
  assert.equal(fade.intensities.noir,.5);
  time=500;
  fade.update();
  assert.equal(fade.intensities.noir,1);
  assert.equal(fade.active,false);
});

test('reselecting a style mid-fade starts from the current shader intensities',()=>{
  let time=0;
  const fade=createStyleTransition({now:()=>time});
  fade.setStyle('nvg');
  time=250;
  fade.setStyle('crt');
  assert.equal(fade.intensities.nvg,.5);
  assert.equal(fade.intensities.crt,0);
  time=500;
  fade.setStyle('crt');
  fade.update();
  assert.equal(fade.intensities.nvg,.25);
  assert.equal(fade.intensities.crt,.5);
  time=750;
  fade.update();
  assert.equal(fade.intensities.nvg,0);
  assert.equal(fade.intensities.crt,1);
  assert.equal(fade.active,false);
});

test('reduced motion settles a running fade and switches styles immediately',()=>{
  let reduced=false;
  const fade=createStyleTransition({now:()=>0,reducedMotion:()=>reduced});
  fade.setStyle('anime');
  assert.equal(fade.active,true);
  reduced=true;
  fade.update();
  assert.equal(fade.active,false);
  assert.equal(fade.intensities.anime,1);
  fade.setStyle('normal');
  assert.equal(fade.intensities.anime,0);
  assert.equal(fade.active,false);
});
