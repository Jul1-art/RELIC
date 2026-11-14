import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PROLOGUE_MEDIA } from '../intro/prologue-data-v8.js';

const readJSON = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const chronology = await readJSON('../tools/film/scripts/prologue-chronology-v9.json');
const production = await readJSON('../tools/film/scripts/prologue-edit-v13.json');
const narration = await readJSON('../tools/film/scripts/prologue-narration-v12.json');
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
  assert.equal(PROLOGUE_MEDIA.revision, '13.0-hd50');
  assert.equal(PROLOGUE_MEDIA.revision, production.revision);
  assert.equal(encoding.revision, production.revision);
  assert.equal(PROLOGUE_MEDIA.duration, 731);
  assert.equal(production.duration, 731);
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
  const departure = narration.lines.find(line=>line.id==='voyager2-departure');
  assert(departure);
  for (const name of ['Jupiter','Saturn','Uranus','Neptune']) assert(departure.text.en.includes(name));
  for (const name of ['Jupiter','Saturne','Uranus','Neptune']) assert(departure.text.fr.includes(name));
  for (const text of Object.values(departure.text)) assert(!/giant planets|planètes géantes/i.test(text));
});

test('the five added milestones occupy their historical periods', () => {
  const dates={tereshkova:'1963-06-16',leonov:'1965-03-18','apollo8-orbit':'1968-12-24','huygens-descent':'2005-01-14','change4-wide':'2019-01-03'};
  for (const [id,date] of Object.entries(dates)) assert.equal(production.shots.find(s=>s.id===id)?.eventDate,date);
  for (const [before,after] of [['kennedy','tereshkova'],['tereshkova','leonov'],['leonov','apollo8-orbit'],['apollo8-earthrise','saturn-v'],['iss-unity','huygens-descent'],['huygens-descent','europe'],['rosetta-descent','change4-wide'],['change4-site','falcon-launch']]) assert(scene(before).end<=scene(after).start);
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
  assert.equal(encoding.quality.sourcePreservation.passed,true);
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

test('Webb leads directly to one wide solar view and the RELIC card, without old replays', () => {
  const ending = production.shots.slice(production.shots.findIndex(shot=>shot.id==='webb'));
  assert.deepEqual(ending.map(shot=>shot.id),['webb','webb-deployment','webb-observatory','solar-system','relic']);
  assert.equal(ending.at(-1).source,'black');
  close(ending.at(-1).start,721);
  close(ending.at(-1).end,731);
  close(ending.at(-1).duration,10);
  const wide=ending.find(shot=>shot.id==='solar-system');
  close(wide.start,707);
  close(wide.end,721);
  close(wide.fadeOut,2);
  assert.equal(wide.source,'v9-0');
  assert(wide.sourceStart>=548,'Exclude the Mars close-up retained at the beginning of the old wide shot');
  assert(wide.sourceStart+wide.sourceDuration<=561);
  const reflection=narration.lines.find(row=>row.id==='journeys-leave-traces');
  assert.match(reflection.text.en,/Every mission leaves a trace.*RELIC.*Your journey starts here/);
  assert.match(reflection.text.fr,/Chaque mission laisse une trace.*RELIC/);
  for(const cues of Object.values(PROLOGUE_MEDIA.captions)) {
    const cards=cues.filter(cue=>cue.kind==='end');
    assert.equal(cards.length,1);
    close(cards[0].start,721,'The final caption must not turn the preceding wide shot into a brand card');
    close(cards[0].end,731);
  }
});

test('owner montage and soundtrack are retained without further cuts',()=>{
  assert.deepEqual(production.cutIntervals,[]);
  const proof=encoding.quality.sourcePreservation;
  assert.equal(proof.fullDecodePassed,true);
  assert.equal(proof.pictureFrames,36550);
  assert.equal(proof.duration,731);
  assert.equal(proof.downloadStreams.length,5);
  assert.equal(proof.deliveryStreams.length,3);
  for(const stream of [...proof.downloadStreams,...proof.deliveryStreams]) assert.equal(stream.encodedPacketsIdentical,true);
});

test('Sputnik introduces its genuine worldwide radio signal before playing it without music',()=>{
  const introduction=narration.lines.find(row=>row.id==='a-signal-around-earth');
  assert(introduction);
  close(introduction.start,123.1);
  close(introduction.end,131.4);
  assert.equal(introduction.text.en,'In 1957, Sputnik became the first artificial satellite.');
  assert(!/Écoutez|bips radio/.test(introduction.text.fr));
  const signal=production.archivalAudio.find(row=>row.id==='sputnik-original-signal');
  assert(signal);
  assert.equal(signal.source,'asset');
  assert.equal(signal.historicalVoiceSynthesized,false);
  assert.match(signal.file,/sputnik.*\.wav$/);
  close(signal.at,131.7);
  close(signal.at+signal.length,134.8);
  assert(signal.at>=introduction.end);
  assert(signal.at>=scene('sputnik').start && signal.at+signal.length<=scene('sputnik').end);
  for(const interval of production.silenceMusic) assert(interval.end>interval.start,'Music-silence windows must have a positive duration');
  assert(production.silenceMusic.some(interval=>interval.start<=signal.at&&interval.end>=signal.at+signal.length));
  for(const line of narration.lines) assert(!(line.start<signal.at+signal.length&&line.end>signal.at));
  for(const [language,cues] of Object.entries(PROLOGUE_MEDIA.captions)) {
    const cue=cues.find(row=>row.id==='sputnik-original-signal-identification');
    assert.equal(cue?.kind,'subtitle');
    close(cue.start,signal.at);
    close(cue.end,signal.at+signal.length);
    assert.match(cue.title[language],/Sputnik|Spoutnik/);
    assert.equal(encoding.languages[language].encodedPacketsIdentical,true);
  }
});


test('Titan is introduced through Saturn and Cassini before one continuous Huygens descent',()=>{
  for(const [before,after] of [['iss-unity','cassini-saturn'],['cassini-saturn','huygens-separation'],['huygens-separation','huygens-descent'],['huygens-descent','europe']]) assert(scene(before).end<=scene(after).start);
  const descents=production.shots.filter(shot=>shot.file?.endsWith('huygens-experience.mp4'));
  assert.equal(descents.length,1);
  assert.equal(descents[0].in,6);
  assert.equal(descents[0].sourceDuration,24);
  assert.match(narration.lines.find(line=>line.id==='cassini-arrives-saturn').text.en,/Cassini.*Saturn/);
  assert.match(narration.lines.find(line=>line.id==='a-shared-laboratory').text.en,/Earth orbit/);
});

test('Rosetta excludes introduction cards and does not replay its descent intervals',()=>{
  const shots=production.shots.filter(shot=>/rosetta|philae/.test(shot.id));
  assert.deepEqual(shots.map(shot=>shot.id),['rosetta-comet','rosetta-observation','philae-separation','philae-bounces','rosetta-descent']);
  for(const shot of shots) assert(shot.in>=4,'Exclude source introduction cards');
  const descent=shots.filter(shot=>shot.file.endsWith('rosetta-descent-original.mov'));
  assert.equal(descent.length,2);
  assert(descent[0].in+descent[0].sourceDuration<=descent[1].in);
  assert.match(narration.lines.find(line=>line.id==='rosetta-observes').text.en,/three months/);
  assert.match(narration.lines.find(line=>line.id==='philae-real-landing').text.en,/harpoons.*failed.*bounced twice/);
});

test('historical corrections distinguish the two Shuttle losses and identify the fifteen ISS partners',()=>{
  const text=id=>narration.lines.find(line=>line.id===id).text;
  assert.match(text('shuttle-first-orbit').en,/1981.*succeeded/);
  assert.match(text('challenger-date').en,/28 January 1986/);
  assert(scene('challenger-ascent').end<=scene('challenger').start);
  assert.match(text('retiring-the-shuttle').en,/Columbia.*2003/);
  assert.match(text('rivals-build-together').en,/Fifteen.*United States, Russia, Canada, Japan.*eleven European/);
  assert.match(text('von-braun-postwar').en,/Nazi.*von Braun.*V2/);
  assert(!narration.lines.some(row=>['falcon-ongoing','falcon-reuse','voyager-power'].includes(row.id)));
  assert(!production.shots.some(row=>row.id==='iss-life'));
});

test('scene kickers are absent and ISS is identified in the main subtitle track',()=>{
  for(const scene of PROLOGUE_MEDIA.scenes) for(const key of ['label','speaker','kicker']) assert(!Object.hasOwn(scene,key));
  for(const cues of Object.values(PROLOGUE_MEDIA.captions)) {
    for(const cue of cues) for(const key of ['label','speaker','kicker']) assert(!Object.hasOwn(cue,key));
    const name=cues.find(cue=>cue.id==='iss-name');
    assert.equal(name?.kind,'subtitle');
    assert(name.start>=scene('iss-whole').start && name.end<=scene('iss-whole').end);
    assert(Object.values(name.title).includes('International Space Station'));
  }
});


test('requested narration removals apply to both active captions and recorded script',()=>{
 const en=PROLOGUE_MEDIA.captions.en.map(c=>c.title?.en||'').join(' ');
 for(const phrase of ['Listen to its radio beeps','turned that promise','Nuclear generators provide electricity','The probe would descend','This reconstruction follows','descended under parachute and','After separating, the boosters','Recovering these stages','These flights from 2019','Falcon launches and booster recoveries'])assert(!en.includes(phrase),phrase);
 assert.match(en,/On 14 January 2005, Huygens landed on Titan/);
 assert.equal(encoding.quality.sourcePreservation.passed,true);
});
