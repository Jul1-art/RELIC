import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../intro/prologue-v8.js', import.meta.url), 'utf8');
const context = vm.createContext({ URL });
const module = new vm.SourceTextModule(source, {
  context,
  initializeImportMeta(meta) { meta.url = new URL('../intro/prologue-v8.js', import.meta.url).href; },
});
await module.link(specifier => {
  const exports = specifier.includes('film-stream') ? ['attachFilmSource']
    : specifier.includes('fontawesome') ? ['solidIcon']
    : specifier.includes('world-icons') ? ['worldIcon'] : ['createOpeningTyping'];
  return new vm.SyntheticModule(exports, function () {
    for (const name of exports) this.setExport(name, () => {});
  }, { context });
});
await module.evaluate();
const { resolveFilmEnding } = module.namespace;

// V10's final scene was correctly named, but its caption was `visual`. The
// player must identify the final card without relying on a publisher's cue kind.
const film = { duration:703, scenes:[
  { id:'solar-system', start:680, end:695 },
  { id:'relic', start:695, end:703 },
] };
const captions = [{ id:'picture-relic', kind:'visual', start:695, end:703, title:'' }];

test('the RELIC scene displays the brand even when the final caption is visual', () => {
  assert.equal(resolveFilmEnding(film, captions, 694.99), null);
  const ending = resolveFilmEnding(film, captions, 695);
  assert.equal(ending.start, 695);
  assert.equal(ending.scene.id, 'relic');
});

test('the brand persists at the exact final frame and after ended', () => {
  assert.equal(resolveFilmEnding(film, captions, 703).start, 695);
  assert.equal(resolveFilmEnding(film, captions, 703.04, true).start, 695);
  assert.equal(resolveFilmEnding(film, [], 703, true).scene.id, 'relic');
});

test('seeking back into the film leaves the ending and restores the story', () => {
  assert(resolveFilmEnding(film, captions, 701));
  assert.equal(resolveFilmEnding(film, captions, 684), null);
  assert.equal(resolveFilmEnding(film, captions, 0), null);
});

test('a new film length uses scene timing rather than the old runtime', () => {
  const longerFilm = { duration:918, scenes:[{ id:'relic', start:902, end:918 }] };
  assert.equal(resolveFilmEnding(longerFilm, captions, 703), null);
  assert.equal(resolveFilmEnding(longerFilm, captions, 902).start, 902);
  assert.equal(resolveFilmEnding(longerFilm, [], 918, true).start, 902);
});

test('an explicit ending cue supports film editions without scene metadata', () => {
  const cues = [{ id:'brand', kind:'end', start:42, end:56, title:{ en:'RELIC', fr:'RELIC' } }];
  assert.equal(resolveFilmEnding({}, cues, 41.99), null);
  assert.equal(resolveFilmEnding({}, cues, 42).start, 42);
  assert.equal(resolveFilmEnding({}, cues, 56, true).start, 42);
});

test('ended still offers a final card if caption metadata is absent', () => {
  assert.equal(resolveFilmEnding({ duration:92 }, [], 91.99), null);
  assert.equal(resolveFilmEnding({ duration:92 }, [], 92, true).start, 92);
});
