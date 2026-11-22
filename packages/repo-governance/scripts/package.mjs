import { readFile, writeFile, mkdir, lstat, realpath, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root as pluginRoot, bundlePath, manifestName, sha256, verifyBundle } from '../plugin/scripts/bundle.mjs';
import { verifySourceBundle } from './bundle.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const inside = (parent, child) => {
  const path = relative(parent, child);
  return path === '' || path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
};

export async function packageRuntime(destination) {
  if (typeof destination !== 'string' || !destination.trim()) throw new Error('Specify DEST=<new-external-folder>.');
  const repository = await realpath(repositoryRoot);
  const source = await realpath(pluginRoot);
  const selected = resolve(destination);
  const parent = await realpath(dirname(selected));
  const target = join(parent, basename(selected));
  if (inside(repository, target) || inside(target, repository)) throw new Error('DEST must be outside the source folder and must not contain it.');
  try { await lstat(target); throw new Error('DEST already exists. Choose a new folder and keep the previous runtime for recovery.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  const original = await verifySourceBundle({ pack: false });
  const bytes = await readFile(bundlePath);
  if (sha256(bytes) !== original.sha256) throw new Error('Plugin manifest changed during packaging.');
  const manifest = JSON.parse(bytes);
  let created = false;
  try {
    await mkdir(target);
    created = true;
    for (const item of manifest.files) {
      const contents = await readFile(join(source, item.path));
      if (sha256(contents) !== item.sha256) throw new Error('Plugin file changed during packaging: ' + item.path);
      const path = join(target, item.path);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents, { flag: 'wx' });
    }
    await writeFile(join(target, manifestName), bytes, { flag: 'wx' });
    const packaged = await verifyBundle({ pack: false, directory: target });
    const finalSource = await verifySourceBundle({ pack: false });
    if (packaged.sha256 !== original.sha256 || finalSource.sha256 !== original.sha256)
      throw new Error('The prepared runtime and plugin source differ.');
    return { operation: 'package-runtime', decision: 'pass', destination: target, files: manifest.files.length + 1,
      version: manifest.version, sha256: packaged.sha256, scope: 'runtime-files-only' };
  } catch (error) {
    if (created && await realpath(target) === target && dirname(target) === parent && !inside(repository, target))
      await rm(target, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('Use task package DEST=<new-external-folder>.');
    process.stdout.write(JSON.stringify(await packageRuntime(process.env.REPO_GOVERNANCE_DEST)) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ operation: 'package-runtime', decision: 'error', message: error.message }) + '\n');
    process.exitCode = 1;
  }
}
