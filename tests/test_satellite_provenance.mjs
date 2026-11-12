import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../vendor/gods-eye-view/satellites/',import.meta.url);
test('satellite reference files retain pinned source hashes and the MIT notice',async()=>{
 const manifest=JSON.parse(await readFile(new URL('PROVENANCE.json',root),'utf8'));
 assert.equal(manifest.commit,'10a788db78f0657e2eb5f8cdd830e6417aed354d');
 for(const item of manifest.files){const bytes=await readFile(new URL(item.file,root));assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,item.file);if(item.gitBlob&&!item.modified)assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),item.gitBlob,item.file);}
 assert.match(await readFile(new URL('LICENSE',root),'utf8'),/Copyright \(c\) 2026 Bilawal Sidhu/);
 assert.match(await readFile(new URL('../vendor/satellite/LICENSE.md',import.meta.url),'utf8'),/MIT/);
});
