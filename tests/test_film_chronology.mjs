import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PROLOGUE_MEDIA } from '../intro/prologue-data-v8.js';

const readJSON = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const chronology = await readJSON('../tools/film/scripts/prologue-chronology-v9.json');
const production = await readJSON('../tools/film/scripts/prologue-edit-v9.json');
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
  assert.equal(PROLOGUE_MEDIA.revision, chronology.revision);
  assert.equal(PROLOGUE_MEDIA.duration, 569);
  assert.equal(production.duration, 569);
  continuous(PROLOGUE_MEDIA.scenes, 569, 'player scenes');
  continuous(production.shots, 569, 'production shots');
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
  for (const [language,cues] of Object.entries(PROLOGUE_MEDIA.captions)) continuous(cues, 569, `${language} captions`);
});

test('Enterprise precedes Voyager and the 2019/2020 Falcon sequence precedes the 2021 missions', () => {
  assert(scene('shuttle-carrier').end <= scene('voyager').start);
  assert(scene('falcon-launch').end <= scene('falcon-dual-return').start);
  assert(scene('falcon-dual-return').end <= scene('falcon-return').start);
  assert(scene('falcon-return').end <= scene('mars-approach').start);
  assert(scene('perseverance-down').end <= scene('webb').start);
  const events = [...chronology.events].sort((a,b) => scene(a.shot).start-scene(b.shot).start);
  for (let index=1; index<events.length; index++) assert(events[index-1].date <= events[index].date, `${events[index].shot}: date reversal`);
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
    const clause=cues.find(cue => cue.id === 'from-war-to-a-race-2');
    assert(clause, `${language}: missing von Braun clause`);
    close(clause.start, scene('von-braun').start);
    assert.match(clause.title[language], /Wernher von Braun/);
  }
  assert.equal(chronology.archiveContext['von-braun'].eventDate, '1945-09');
  assert.equal(chronology.archiveContext['von-braun'].archiveYear, 1962);
});

test('the legacy montage is explicitly identified as an epilogue rather than another dated milestone', () => {
  assert.equal(chronology.epilogue.start, 507);
  assert.equal(chronology.epilogue.end, 569);
  assert.equal(chronology.epilogue.firstShot, 'lunar-orbiter');
  close(scene('lunar-orbiter').start, chronology.epilogue.start);
  for (const language of ['en','fr']) {
    const label=scene('lunar-orbiter').label?.[language];
    assert.equal(typeof label, 'string', `${language}: missing epilogue label`);
    assert.match(label.normalize('NFD').replace(/[\u0300-\u036f]/g,''), /\bepilogue\b/i);
  }
});
