import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PROLOGUE_MEDIA} from '../intro/prologue-data-v8.js';
test('the desktop MP4 has both audio/subtitle languages and is separate from browser offline assets',async()=>{
 const config=JSON.parse(await readFile(new URL('../tools/film/scripts/prologue-download-v13.json',import.meta.url),'utf8'));
 const film=PROLOGUE_MEDIA.downloads.mp4;assert.deepEqual(film,config);assert.deepEqual(film.audioLanguages,['en','fr']);assert.deepEqual(film.subtitleLanguages,['en','fr']);
 assert.equal(new URL(film.url).hostname,'github.com');assert.ok(film.url.endsWith('/'+film.filename));assert.match(film.sha256,/^[a-f0-9]{64}$/);assert.ok(film.bytes>200000000);
 const encoding=JSON.parse(await readFile(new URL('../intro/assets/prologue/encoding-v9-hd50.json',import.meta.url),'utf8'));assert(!encoding.hls.files.some(file=>file.path.endsWith(film.filename)),'Browser offline saves must not redownload the full MP4');
});
