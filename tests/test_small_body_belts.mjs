import test from 'node:test';
import assert from 'node:assert/strict';
import { BELT_METADATA,KIRKWOOD_GAPS,generateBeltPopulation,beltSamplePosition } from '../src/atlas/small-body-belts.js';

test('belt samples are deterministic, bounded orbital populations with explicit illustrative provenance',()=>{
  assert.deepEqual(generateBeltPopulation('main',20),generateBeltPopulation('main',20));
  assert.notDeepEqual(generateBeltPopulation('main',20,1),generateBeltPopulation('main',20,2));
  assert.equal(BELT_METADATA.actualObjectEphemerides,false);
  assert.equal(BELT_METADATA.sizeToScale,false);
  for(const kind of ['main','kuiper']) {
    const bounds=BELT_METADATA[kind].semiMajorAxisAU;
    for(const body of generateBeltPopulation(kind,1000)) {
      assert(body.semimajorAxisAU>=bounds[0]&&body.semimajorAxisAU<=bounds[1]);
      assert(body.eccentricity>=0&&body.eccentricity<.5);
      assert(body.inclinationRad>=0&&body.inclinationRad<=Math.PI/6);
      assert(body.periodDays>0);
      assert(beltSamplePosition(body).every(Number.isFinite));
    }
  }
  assert.throws(()=>generateBeltPopulation('dust',4),TypeError);
  assert.throws(()=>generateBeltPopulation('main',-1),RangeError);
});

test('Jupiter resonances deplete semi-major-axis samples rather than paint empty radial rings',()=>{
  const samples=generateBeltPopulation('main',30000);
  const width=.012;
  for(const gap of KIRKWOOD_GAPS.slice(0,3)) {
    const near=samples.filter(s=>Math.abs(s.semimajorAxisAU-gap.semimajorAxisAU)<width).length;
    const adjacent=samples.filter(s=>Math.abs(s.semimajorAxisAU-(gap.semimajorAxisAU-.06))<width).length;
    assert(near<adjacent*.6,`${gap.resonance}: resonance should deplete the population`);
  }
  assert.equal(KIRKWOOD_GAPS.length,4);
});

test('sample motion follows its Kepler period and retains perihelion and aphelion distances',()=>{
  const sample={semimajorAxisAU:3,eccentricity:.2,inclinationRad:.1,nodeRad:1,argumentRad:.4,meanAnomalyRad:0,periodDays:365.256*3**1.5};
  const near=beltSamplePosition(sample),far=beltSamplePosition(sample,sample.periodDays/2),again=beltSamplePosition(sample,sample.periodDays);
  assert(Math.abs(Math.hypot(...near)-2.4)<1e-10);
  assert(Math.abs(Math.hypot(...far)-3.6)<1e-10);
  assert(again.every((v,i)=>Math.abs(v-near[i])<1e-10));
});

test('the Kuiper population includes a flat cold component and a thicker high-inclination component',()=>{
  const samples=generateBeltPopulation('kuiper',10000);
  assert(samples.filter(s=>s.semimajorAxisAU>=42&&s.semimajorAxisAU<=47.8).length>samples.length*.65);
  assert(samples.some(s=>s.inclinationRad>15*Math.PI/180));
  assert(samples.some(s=>s.inclinationRad<1*Math.PI/180));
  assert(samples.every(s=>s.semimajorAxisAU*(1-s.eccentricity)>=28.8-1e-9));
});
