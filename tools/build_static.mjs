import { access, cp, lstat, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { restoreFilms } from './restore_film.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputArgument = process.argv.indexOf('--output');
const explicitOutput = outputArgument >= 0;
if (explicitOutput && !process.argv[outputArgument + 1]) throw new Error('--output requires a directory');
const output = explicitOutput ? resolve(process.argv[outputArgument + 1]) : join(root, 'dist');
if (output === root || root.startsWith(output + sep)) throw new Error('Build output cannot replace the source directory or its parents');
const rootExtensions = new Set(['.html', '.css', '.js', '.json', '.webmanifest', '.svg', '.ico', '.png']);
const assetDirectories = ['assets', 'vendor', 'intro', 'src', 'pages'];

let hdRelease = '';
try {
  const encoding = JSON.parse(await readFile(join(root, 'intro/assets/prologue/encoding-v9-hd50.json'), 'utf8'));
  const match = encoding.hls.languages.en.match(/\/prologue\/(v[\w.-]+)\//);
  if (!match) throw new Error('Invalid current film release path');
  hdRelease = `intro/assets/prologue/${match[1]}/`;
} catch (error) { if (error.code !== 'ENOENT') throw error; }
let hasHdRelease = false;
try { await access(join(root,'intro/assets/prologue/encoding-v9-hd50.json')); hasHdRelease=true; }
catch { /* Older source snapshots still use their verified MP4 transport parts. */ }
if (!hasHdRelease) await restoreFilms(root);

function privateName(name) {
  const lower = name.toLowerCase();
  return lower.startsWith('.')
    || /^(?:certs?|certificates?|private|secrets|local[-_]?config)$/.test(lower)
    || /(?:^|[._-])local[._-]?(?:config|settings)(?:[._-]|$)|[._-]local(?:[._-]|$)/.test(lower)
    || /\.(?:pem|key|p12|pfx|crt|cer|env)$/.test(lower)
    || (extname(lower) === '.json' && /(?:config|settings|credentials?|secrets?|tokens?|api[-_]?keys?|service[-_]?account)/.test(lower));
}

async function publicAsset(source) {
  // The build already restored the ordinary MP4s; omit their duplicate parts.
  if (relative(root, source).split(sep).includes('mp4-parts')) return false;
  const name=relative(root,source).split(sep).join('/');
  // The current HD edition streams bounded HLS segments. Do not redeploy the
  // retired 720p films or large review-only MP4s beside the new release.
  if (hasHdRelease && name.startsWith('intro/assets/prologue/')) {
    const keep=['intro/assets/prologue/encoding-v9-hd50.json','intro/assets/prologue/poster-v9-hd50.jpg','intro/assets/prologue/sources-v9.json'];
    if (!name.startsWith(hdRelease) && !keep.includes(name)) {
      const stat=await lstat(source);
      if (!stat.isDirectory() || !hdRelease.startsWith(name+'/')) return false;
    }
  }
  if (relative(root, source).split(sep).some(privateName)) return false;
  // Do not carry a link to a developer's local configuration into dist/.
  return !(await lstat(source)).isSymbolicLink();
}

if (explicitOutput) {
  try { await access(output); throw new Error('Explicit build output must be a new directory'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
} else {
  if (output !== join(root, 'dist')) throw new Error('Unsafe build output');
  await rm(output, { recursive: true, force: true });
}
await mkdir(output, { recursive: true });

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile() && rootExtensions.has(extname(entry.name)) && !privateName(entry.name)) {
    await cp(join(root, entry.name), join(output, entry.name));
  }
}
for (const directory of assetDirectories) {
  try {
    await cp(join(root, directory), join(output, directory), { recursive: true, filter: publicAsset });
  } catch (error) {
    // The introduction may be added separately; the atlas also runs without it.
    if (directory !== 'intro' || error.code !== 'ENOENT') throw error;
  }
}

console.log(`Static build ready: ${(await readdir(output)).length} root entries`);
