import { build } from 'esbuild';
import { cp, lstat, mkdir, mkdtemp, realpath, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, MARKETPLACE_NAME, filesUnder, inside, productionNotices, runtimeScriptFiles, verifyDependencies, verifyManifest, verifyPackaged } from './check-package.mjs';
import { bundleOptions } from './lib/bundle.mjs';

// Fresh versioned releases avoid stale files without deleting installed copies.
// Publish the marketplace pointer only after verification of the real artifact.
async function directoryWithin(root, target) {
  const canonical = await realpath(root);
  if (!inside(root, target)) throw new Error('패키지 출력이 저장소 범위를 벗어납니다.');
  let cursor = root;
  for (const part of relative(root, target).split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    try {
      const info = await lstat(cursor);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('패키지 출력 경로의 링크·일반 파일은 사용할 수 없습니다.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await mkdir(cursor);
    }
    if (!inside(canonical, await realpath(cursor))) throw new Error('패키지 출력의 실제 경로가 저장소 범위를 벗어납니다.');
  }
  return target;
}
async function copyFile(source, target) {
  await filesUnder(source);
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { force: false, errorOnExist: true, dereference: false });
}
export async function packagePlugin(root = ROOT) {
  const { packageData, lock } = await verifyDependencies(root), manifest = await verifyManifest(root, packageData);
  const runtimeScripts = await runtimeScriptFiles(root);
  const marketplace = await directoryWithin(root, resolve(root, '.local', 'plugin-marketplace'));
  const releases = await directoryWithin(root, join(marketplace, 'plugins'));
  const destination = await mkdtemp(join(releases, `${manifest.name}-${manifest.version}-`));
  if (!inside(await realpath(releases), await realpath(destination))) throw new Error('새 패키지 디렉터리의 범위를 확인하지 못했습니다.');
  const options = bundleOptions(root, destination);
  await mkdir(dirname(options.outfile));
  await build(options);
  for (const directory of ['skills', 'docs', 'data']) for (const source of await filesUnder(join(root, directory), { optional: directory === 'data' })) {
    await copyFile(source, join(destination, directory, relative(join(root, directory), source)));
  }
  for (const source of runtimeScripts) await copyFile(source, join(destination, 'scripts', basename(source)));
  await copyFile(join(root, 'README.md'), join(destination, 'README.md'));
  for (const name of ['LICENSE', 'LICENSE.md', 'NOTICE']) {
    try { await lstat(join(root, name)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    await copyFile(join(root, name), join(destination, name));
  }
  await writeFile(join(destination, 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  const compatibility = { name: manifest.name, version: manifest.version, description: manifest.description, skills: './skills/', interface: manifest.extensions['com.openai'].interface };
  await mkdir(join(destination, '.codex-plugin'));
  await writeFile(join(destination, '.codex-plugin', 'plugin.json'), `${JSON.stringify(compatibility, null, 2)}\n`, { flag: 'wx' });
  const notices = await productionNotices(root, lock);
  await writeFile(join(destination, 'THIRD_PARTY_NOTICES.txt'), notices.text, { flag: 'wx' });
  await writeFile(join(destination, 'THIRD_PARTY_COMPONENTS.json'), `${JSON.stringify(notices.components, null, 2)}\n`, { flag: 'wx' });
  const verified = await verifyPackaged(destination, root);
  const listing = { name: MARKETPLACE_NAME, interface: { displayName: 'Windows Agent Devkit Local' }, plugins: [{ name: manifest.name, source: { source: 'local', path: `./plugins/${destination.split(/[\\/]/).at(-1)}` }, policy: { installation: 'AVAILABLE', authentication: 'ON_USE' }, category: 'Developer Tools' }] };
  const registry = await directoryWithin(root, join(marketplace, '.agents', 'plugins'));
  const listingPath = join(registry, 'marketplace.json');
  try { if ((await lstat(listingPath)).isSymbolicLink()) throw new Error('marketplace 파일 링크를 덮어쓰지 않습니다.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const pending = join(registry, `marketplace-${randomUUID()}.json`);
  await writeFile(pending, `${JSON.stringify(listing, null, 2)}\n`, { flag: 'wx' });
  await rename(pending, listingPath);
  return { plugin: manifest.name, version: manifest.version, marketplace, directory: destination, components: verified.components, smoke: verified.smoke };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) process.stdout.write(`${JSON.stringify(await packagePlugin())}\n`);
