// Restore byte-identical documentary MP4s without external tools or downloads.
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MANIFEST = 'intro/assets/prologue/mp4-parts/manifest.json';
const DEFAULT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function checkedPath(root, name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || isAbsolute(name)
      || name.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Film manifest path must stay inside the project');
  }
  let candidate = root;
  const components = name.split('/');
  for (let index = 0; index < components.length; index++) {
    candidate = join(candidate, components[index]);
    try {
      const stat = await lstat(candidate);
      if (stat.isSymbolicLink()) throw new Error(`Film paths cannot use symbolic links: ${name}`);
      if (index === components.length - 1 && !stat.isFile()) throw new Error(`Film path is not a regular file: ${name}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return candidate;
}

function metadata(entry) {
  if (!Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[0-9a-f]{64}$/.test(entry.sha256 || '')) {
    throw new Error('Film manifest contains invalid integrity metadata');
  }
  return [entry.size, entry.sha256];
}

async function digestFile(path) {
  const digest = createHash('sha256');
  let size = 0;
  for await (const block of createReadStream(path)) { size += block.length; digest.update(block); }
  return [size, digest.digest('hex')];
}

export async function restoreFilms(projectRoot = DEFAULT_ROOT) {
  const root = resolve(projectRoot);
  const manifestPath = await checkedPath(root, MANIFEST);
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error('Unsupported film-parts manifest');
  const restored = [];
  for (const entry of manifest.files) {
    const target = await checkedPath(root, entry.path);
    const [expectedSize, expectedDigest] = metadata(entry);
    if (!Array.isArray(entry.parts) || entry.parts.length === 0) throw new Error('Film manifest must list at least one part');
    const parts = [];
    for (const part of entry.parts) parts.push({ path: await checkedPath(root, part.path), integrity: metadata(part) });
    if (parts.reduce((total, part) => total + part.integrity[0], 0) !== expectedSize) throw new Error(`Film part sizes do not match: ${entry.path}`);
    try {
      const [size, digest] = await digestFile(target);
      if (size === expectedSize && digest === expectedDigest) continue;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${randomBytes(8).toString('hex')}.restore`;
    let output;
    try {
      output = await open(temporary, 'wx', 0o600);
      const whole = createHash('sha256');
      let total = 0;
      for (const part of parts) {
        const digest = createHash('sha256');
        let size = 0;
        for await (const block of createReadStream(part.path)) {
          size += block.length; total += block.length; digest.update(block); whole.update(block);
          await output.writeFile(block);
        }
        if (size !== part.integrity[0] || digest.digest('hex') !== part.integrity[1]) throw new Error(`Film part failed its integrity check: ${part.path}`);
      }
      if (total !== expectedSize || whole.digest('hex') !== expectedDigest) throw new Error(`Restored film failed its integrity check: ${entry.path}`);
      await output.sync(); await output.close(); output = null;
      await rename(temporary, target);
      restored.push(entry.path);
    } finally {
      if (output) await output.close();
      await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  return restored;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.length && (argumentsList.length !== 2 || argumentsList[0] !== '--root')) throw new Error('Usage: node tools/restore_film.mjs [--root PROJECT]');
  const restored = await restoreFilms(argumentsList[1]);
  console.log(`Film MP4 files verified; restored ${restored.length} file(s).`);
}
