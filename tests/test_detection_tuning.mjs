import test from 'node:test';
import assert from 'node:assert/strict';
import {labelBudgetFor,canonicalizeDensity} from '../vendor/gods-eye-view/detection/detectionPolicy.js';
import {allocateLayerQuotas} from '../vendor/gods-eye-view/detection/labelArbiter.js';
import {setKeyholeFadeTuning,getKeyholeGeometry,keyholeLabelAlphaFromGeometry} from '../vendor/gods-eye-view/detection/keyhole.js';
import {normalizeVisualSettings} from '../src/ui/visual-effects.js';
test('detection defaults and commands retain the requested ranges and allocation',()=>{
 const defaults=normalizeVisualSettings();assert.equal(defaults.detectionDensity,100);assert.equal(defaults.detectionFade,40);assert.equal(defaults.detectionOutside,100);assert.equal(defaults.detectionAllocation,'ELASTIC');
 const settings=normalizeVisualSettings({detectionDensity:25,detectionOutside:-20,detectionFade:100,detectionAllocation:'WEIGHTED'},defaults);
 assert.equal(settings.detectionDensity,25);assert.equal(settings.detectionOutside,0);assert.equal(settings.detectionFade,40);assert.equal(settings.detectionAllocation,'WEIGHTED');assert.equal(normalizeVisualSettings({detectionAllocation:'invalid'},settings).detectionAllocation,'WEIGHTED');
});
test('original GEV density budgets and allocation alter the collective name budget',()=>{
 assert.equal(canonicalizeDensity(25),25);assert.ok(labelBudgetFor(1e6,100)>labelBudgetFor(1e6,25));
 const demand={starlink:100,stations:10};const elastic=allocateLayerQuotas(demand,20,'ELASTIC'),weighted=allocateLayerQuotas(demand,20,'WEIGHTED');
 assert.notDeepEqual([...elastic],[...weighted]);assert.equal([...weighted.values()].reduce((a,b)=>a+b),20);
});
test('GEV Fade is a radial distance and Outside controls the opacity floor',()=>{
 setKeyholeFadeTuning({fadeRatio:.4,outsideOpacity:.1});const geometry=getKeyholeGeometry(1000,600),{centerX:x,centerY:y,radius:r,featherPx:f}=geometry;
 assert.equal(keyholeLabelAlphaFromGeometry(x,y,geometry),1);assert.ok(Math.abs(keyholeLabelAlphaFromGeometry(x+r+f/2,y,geometry)-.55)<1e-9);assert.equal(keyholeLabelAlphaFromGeometry(2000,y,geometry),.1);
 setKeyholeFadeTuning({fadeRatio:.4,outsideOpacity:1});assert.equal(keyholeLabelAlphaFromGeometry(2000,y,geometry),1);
});
