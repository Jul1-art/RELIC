import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const exists = async url => { try { await stat(url); return true; } catch { return false; } };
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes:true });
  const found = await Promise.all(entries.map(entry => {
    const url = new URL(entry.name, directory);
    return entry.isDirectory() ? files(new URL(entry.name+'/', directory)) : url;
  }));
  return found.flat();
}

test('entry pages and browser modules resolve their local imports, styles and assets', async () => {
  const sources = [new URL('index.html', root), ...await files(new URL('pages/', root)), ...await files(new URL('src/', root))];
  for (const entry of await readdir(new URL('intro/',root))) {
    if (/\.(?:js|css)$/.test(entry)) sources.push(new URL('intro/'+entry,root));
  }
  const failures = [];
  for (const source of sources) {
    if (!/\.(?:js|css|html)$/.test(source.pathname)) continue;
    const text = await readFile(source,'utf8');
    const references = [];
    if (source.pathname.endsWith('.html')) {
      for (const match of text.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) references.push(match[1]);
      for (const match of text.matchAll(/<script type="importmap">(.*?)<\/script>/gs)) references.push(...Object.values(JSON.parse(match[1]).imports));
    } else if (source.pathname.endsWith('.js')) {
      for (const match of text.matchAll(/\b(?:from\s+|import\(\s*)["'](\.{1,2}\/[^"']+)["']/g)) references.push(match[1]);
      for (const match of text.matchAll(/new URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g)) references.push(match[1]);
    }
    for (const reference of references) {
      if (!reference.startsWith('./') && !reference.startsWith('../')) continue;
      const target = new URL(reference, source);target.search='';target.hash='';
      if (!await exists(target)) failures.push(`${fileURLToPath(source)} -> ${reference}`);
    }
  }
  assert.deepEqual(failures,[]);
});

test('offline shell resources all exist in the reorganized project',async()=>{
  const worker=await readFile(new URL('sw.js',root),'utf8');
  const scope='https://example.invalid/RELIC/';
  const urls=vm.runInNewContext(worker+'\n;[...CORE,...OFFLINE_CORE]',{URL,importScripts(){},self:{registration:{scope},addEventListener(){}}});
  const missing=[];
  for(const url of urls){
    if(!url.startsWith(scope))continue;
    if(!await exists(new URL(url.slice(scope.length),root)))missing.push(url);
  }
  assert.deepEqual(missing,[]);
  const cached=new Set(urls.map(url=>new URL(url).pathname));
  const uncachedImports=[];
  for(const url of urls){
    if(!url.startsWith(scope)||!url.endsWith('.js')||url.includes('/vendor/'))continue;
    const source=await readFile(new URL(url.slice(scope.length),root),'utf8');
    for(const match of source.matchAll(/\b(?:from\s+|import\(\s*)["'](\.{1,2}\/[^"']+)["']/g)){
      const dependency=new URL(match[1],url);
      if(!dependency.pathname.includes('/vendor/')&&!cached.has(dependency.pathname))uncachedImports.push(dependency.pathname);
    }
  }
  assert.deepEqual(uncachedImports,[],'Offline application modules must include their local dependencies');
});

test('page, asset and API URLs retain the deployment prefix from nested source folders',async()=>{
  const source=await readFile(new URL('src/core/paths.js',root),'utf8');
  for(const prefix of ['https://example.invalid/','https://example.invalid/RELIC/']){
    const paths=new vm.SourceTextModule(source,{context:vm.createContext({URL}),initializeImportMeta(meta){meta.url=prefix+'src/core/paths.js';}});
    await paths.link(()=>{throw new Error('Path helpers have no dependencies');});await paths.evaluate();
    for(const path of ['index.html','pages/earth.html','pages/terrain.html?body=moon','api/live/atlas','assets/relic-logo-v1.png'])assert.equal(paths.namespace.appURL(path).href,prefix+path);
  }
});
