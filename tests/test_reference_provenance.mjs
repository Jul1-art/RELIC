import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const root=new URL('../vendor/gods-eye-view/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('PROVENANCE.json',root),'utf8'));

test('the reused reference modules retain their exact pinned upstream bytes and license',async()=>{
  assert.equal(manifest.commit,'a33bc379cb32e2204cb3c88664dfe652fcc4fa5a');
  assert.equal(manifest.repository,'https://github.com/bilawalsidhu/gods-eye-view');
  assert.equal(manifest.license,'MIT');
  assert.ok(manifest.files.length>10);
  const paths=new Set();
  for(const file of manifest.files){
    assert.ok(!file.localPath.startsWith('/')&&!file.localPath.split('/').includes('..'));
    assert.ok(!paths.has(file.localPath));paths.add(file.localPath);
    const bytes=await readFile(new URL(file.localPath,root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.sourcePath);
    assert.match(file.gitBlob,/^[a-f0-9]{40}$/);
  }
  const license=await readFile(new URL('LICENSE',root),'utf8');
  assert.match(license,/MIT License/);
  assert.match(license,/Copyright \(c\) 2026 Bilawal Sidhu/);
});

test('the exact portable preset modules load without the upstream Vue application or its data',async()=>{
  const {STYLES,STYLE_STATUS_LABELS}=await import('../vendor/gods-eye-view/ui/visualPresets.js');
  assert.deepEqual(Object.keys(STYLES).sort(),['anime','noir','retro','surveillance','thermal']);
  assert.deepEqual(Object.values(STYLE_STATUS_LABELS),['NORMAL','CRT','NVG','FLIR','ANIME','NOIR']);
  for(const shader of Object.values(STYLES)){
    assert.match(shader.fragmentShader,/void main\(/);
    assert.match(shader.fragmentShader,/colorTexture/);
  }
  const disclosure=await import('../vendor/gods-eye-view/panelDisclosure.js');
  assert.equal(typeof disclosure.bindPanelDisclosure,'function');
  assert.equal(typeof disclosure.collapsePanelOnEscape,'function');
});
