import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PROLOGUE_MEDIA } from '../intro/prologue-data-v8.js';

const readJSON = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const chronology = await readJSON('../tools/film/scripts/prologue-chronology-v9.json');
const production = await readJSON('../tools/film/scripts/prologue-edit-v10.json');
const narration = await readJSON('../tools/film/scripts/prologue-narration-v10.json');
const encoding = await readJSON('../intro/assets/prologue/encoding-v9-hd50.json');
const close = (actual, expected, message) => assert(Math.abs(actual - expected) < 0.000001, message ?? `${actual} != ${expected}`);

function continuous(items, duration, name) {
  const identifiers = new Set();
  let position = 0;
  for (const item of items) {
    assert.equal(typeof item.id, 'string', `${name}: missing identifier`);
    assert(item.id.length > 0, `${name}: empty identifier`);
    assert(!identifiers.has(item.id), `${name}: duplicate ${item.id}`);
    identifiers.add(item.id);
    assert(Number.isFinite(item.start) && Number.isFinite(item.end), `${name}: invalid clock for ${item.id}`);
    close(item.start, position, `${name}: gap or overlap before ${item.id}`);
    assert(item.end > item.start, `${name}: nonpositive duration for ${item.id}`);
    position = item.end;
  }
  close(position, duration, `${name}: incomplete runtime`);
}

const scene = id => {
  const item = PROLOGUE_MEDIA.scenes.find(item => item.id === id);
  assert(item, `Missing scene ${id}`);
  return item;
};

test('the chronological edit partitions every second of the existing film exactly once', () => {
  assert.equal(chronology.version, 1);
  assert.equal(chronology.revision, '9.1-hd50');
  assert.equal(chronology.duration, 569);
  continuous(chronology.blocks, 569, 'destination blocks');
  const source = chronology.blocks.map(block => ({ id:block.id, start:block.sourceStart, end:block.sourceEnd })).sort((a,b) => a.start-b.start);
  continuous(source, 569, 'source blocks');
  for (const block of chronology.blocks) close(block.end-block.start, block.sourceEnd-block.sourceStart, `${block.id}: changed duration`);
});

test('the active production plan and player scenes share the complete chronological timeline', () => {
  assert.equal(PROLOGUE_MEDIA.revision, '10.0-hd50');
  assert.equal(PROLOGUE_MEDIA.revision, production.revision);
  assert.equal(PROLOGUE_MEDIA.duration, 703);
  assert.equal(production.duration, 703);
  continuous(PROLOGUE_MEDIA.scenes, production.duration, 'player scenes');
  continuous(production.shots, production.duration, 'production shots');
  assert.deepEqual(PROLOGUE_MEDIA.scenes.map(item => item.id), production.shots.map(item => item.id));
  for (let index=0; index<production.shots.length; index++) {
    const shot=production.shots[index], picture=PROLOGUE_MEDIA.scenes[index];
    close(picture.start, shot.start, `${shot.id}: player/production start`);
    close(picture.end, shot.end, `${shot.id}: player/production end`);
    close(shot.end-shot.start, shot.duration, `${shot.id}: production duration`);
  }
});

test('both caption languages remain continuous with unique cue identifiers after rearrangement', () => {
  assert(PROLOGUE_MEDIA.captions.en && PROLOGUE_MEDIA.captions.fr);
  for (const [language,cues] of Object.entries(PROLOGUE_MEDIA.captions)) continuous(cues, production.duration, `${language} captions`);
});

test('both Voyager launches and the instruments precede Enterprise as requested', () => {
  assert(scene('voyager2-launch').end <= scene('voyager1-launch').start);
  assert(scene('voyager1-launch').end <= scene('voyager-instruments').start);
  assert(scene('voyager-instruments').end <= scene('voyager').start);
  assert(scene('voyager').end <= scene('shuttle-carrier').start);
  assert(scene('shuttle-carrier').end <= scene('sts1').start);
  assert(!narration.lines.some(line => /closer to home|plus près de nous/i.test(JSON.stringify(line.text))));
});

test('the five added milestones occupy their historical periods', () => {
  const dates={tereshkova:'1963-06-16',leonov:'1965-03-18','apollo8-orbit':'1968-12-24','huygens-descent':'2005-01-14','change4-wide':'2019-01-03'};
  for (const [id,date] of Object.entries(dates)) assert.equal(production.shots.find(s=>s.id===id)?.eventDate,date);
  for (const [before,after] of [['kennedy','tereshkova'],['tereshkova','leonov'],['leonov','apollo8-orbit'],['apollo8-earthrise','saturn-v'],['iss-unity','huygens-descent'],['huygens-surface','europe'],['rosetta-descent','change4-wide'],['change4-site','falcon-launch']]) assert(scene(before).end<=scene(after).start);
  assert(scene('falcon-launch').end <= scene('falcon-dual-return').start);
  assert(scene('falcon-dual-return').end <= scene('falcon-return').start);
  assert(scene('falcon-return').end <= scene('mars-approach').start);
  assert(scene('perseverance-down').end <= scene('webb').start);
});

test('the V2 reading pause and von Braun caption still align with his first appearance', () => {
  close(scene('von-braun').start, 113);
  for (const [language,cues] of Object.entries(PROLOGUE_MEDIA.captions)) {
    const pause=cues.find(cue => cue.id === 'v2-to-von-braun-pause');
    assert(pause, `${language}: missing V2 pause`);
    close(pause.start, 111.5);
    close(pause.end, 113);
    assert.equal(pause.kind, 'visual');
    assert(Object.values(pause.title ?? {}).every(value => value === ''));
    const clause=cues.find(cue => cue.id === 'von-braun-postwar-1');
    assert(clause, `${language}: missing von Braun clause`);
    close(clause.start, scene('von-braun').start);
    assert.match(clause.title[language], /Wernher von Braun/);
  }
  assert.equal(chronology.archiveContext['von-braun'].eventDate, '1945-09');
  assert.equal(chronology.archiveContext['von-braun'].archiveYear, 1962);
  close(narration.lines.find(line=>line.id==='von-braun-postwar').start,113);
  const measured=encoding.quality.narrationAlignment;
  assert.equal(measured.passed,true);
  for (const language of ['en','fr']) {
    const waveform=measured.paragraphs.find(row=>row.id==='von-braun-postwar'&&row.language===language);
    assert(waveform,`${language}: missing actual delivered-waveform verification`);
    close(waveform.at,113);
    assert(Math.abs(waveform.lagSeconds)<=.005);
    assert(waveform.waveformCorrelation>.8);
  }
});

test('the flag planting has only music before the astronauts-returned narration', () => {
  const flag=scene('moon-flag');
  close(flag.end-flag.start,8);
  const returned=narration.lines.find(line=>line.id==='the-first-machines-left-behind');
  assert(returned.start>=flag.end);
  for (const line of [...narration.lines,...production.archivalAudio.map(row=>({start:row.at,end:row.at+row.length}))]) assert(!(line.start<flag.end&&line.end>flag.start));
  for (const cues of Object.values(PROLOGUE_MEDIA.captions)) {
    const cue=cues.find(cue=>cue.id==='flag-music-only');
    close(cue.start,flag.start);close(cue.end,flag.end);assert.equal(cue.kind,'visual');
  }
});

test('the closing reflection uses a spoken picture transition and includes objects beyond the Moon and Mars', () => {
  assert(scene('webb').end===scene('webb-legacy-transition').start);
  assert(scene('webb-legacy-transition').end===scene('lunar-orbiter').start);
  const bridge=narration.lines.find(row=>row.id==='journeys-leave-traces');
  assert(bridge.start>scene('webb-legacy-transition').start);
  for(const row of PROLOGUE_MEDIA.scenes) assert(!/epilogue/i.test(JSON.stringify(row.label??{}).normalize('NFD').replace(/[\u0300-\u036f]/g,'')));
  const beyond=narration.lines.find(row=>row.id==='traces-beyond-moon-and-mars');
  assert.match(beyond.text.en,/Titan.*comet.*orbit.*interstellar/);
  assert.match(beyond.text.fr,/Titan.*comète.*orbite.*interstellaire/);
});
