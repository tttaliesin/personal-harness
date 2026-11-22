import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isSemVer, withBuildOutputLock } from './check-package.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portableSchema = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';

function assertNode() {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Build requires Node.js 24 or newer.');
}

async function ensureDirectory(directory) {
  const absolute = path.resolve(directory);
  const parent = path.dirname(absolute);
  if (parent !== absolute) await ensureDirectory(parent);
  let stat;
  try {
    stat = await lstat(absolute);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    try {
      await mkdir(absolute);
    } catch (mkdirError) {
      if (mkdirError.code !== 'EEXIST') throw mkdirError;
    }
    stat = await lstat(absolute);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Refusing non-directory or symlink: ${absolute}`);
}

async function readTree(directory, prefix) {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Refusing source directory: ${directory}`);
  const files = [];
  for (const entry of (await readdir(directory)).sort()) {
    const filename = path.join(directory, entry);
    const target = `${prefix}/${entry}`;
    const info = await lstat(filename);
    if (info.isSymbolicLink()) throw new Error(`Package sources cannot contain symlinks: ${filename}`);
    if (info.isDirectory()) files.push(...await readTree(filename, target));
    else if (info.isFile()) files.push([target, await readFile(filename)]);
    else throw new Error(`Package sources must be regular files: ${filename}`);
  }
  return files;
}

async function readRegular(filename) {
  const stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected a regular source file: ${filename}`);
  return readFile(filename);
}

async function ownedTarget(root, relative) {
  const target = path.resolve(root, relative);
  const scope = path.relative(root, target);
  if (!scope || scope.startsWith(`..${path.sep}`) || scope === '..' || path.isAbsolute(scope)) throw new Error(`Output escapes package root: ${relative}`);
  await ensureDirectory(path.dirname(target));
  try {
    const stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Refusing to overwrite non-regular output: ${target}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return target;
}

async function publishFiles(outputRoot, files, manifest) {
  const stage = await mkdtemp(path.join(outputRoot, '.worker-orchestrator-stage-'));
  const staged = [];
  let published = 0;
  try {
    for (const [relative, data] of [...files, manifest]) {
      const target = await ownedTarget(outputRoot, relative);
      const source = path.join(stage, String(staged.length));
      const handle = await open(source, 'wx');
      staged.push({ source, target });
      try {
        await handle.writeFile(data);
      } finally {
        await handle.close();
      }
    }

    // All targets and bytes are ready. A failed publish must leave no valid-looking old manifest.
    await rm(staged.at(-1).target, { force: true });
    for (const { source, target } of staged) {
      await rename(source, target);
      published++;
    }
  } finally {
    for (const { source } of staged.slice(published)) await rm(source, { force: true });
    await rmdir(stage);
  }
}

function gitAt(root, args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
}

function revisionFor(root) {
  const git = gitAt(root, ['rev-parse', '--show-prefix', '--verify', 'HEAD']);
  if (git.status !== 0) return null;
  const [prefix, revision] = git.stdout.split(/\r?\n/);
  return prefix === '' && /^[a-f0-9]{40,64}$/.test(revision) ? revision : null;
}

const json = value => `${JSON.stringify(value, null, 2)}\n`;

/** Builds files only; never registers, installs, uploads, or invokes Desktop tools. */
export async function buildPackage({ repoRoot = repositoryRoot, outputRoot = path.join(repoRoot, 'dist/codex') } = {}) {
  assertNode();
  repoRoot = path.resolve(repoRoot);
  outputRoot = path.resolve(outputRoot);
  const packageRoot = path.join(outputRoot, 'worker-orchestrator');
  const relativeOutput = path.relative(repoRoot, outputRoot);
  if (!relativeOutput || relativeOutput === '..' || relativeOutput.startsWith(`..${path.sep}`) || path.isAbsolute(relativeOutput)) {
    throw new Error('Build output must be a child of the selected repository root.');
  }
  if (['src', 'workflows', 'plugin', 'scripts', 'docs', 'tests'].includes(relativeOutput.split(path.sep)[0])) {
    throw new Error('Build output cannot overwrite source directories.');
  }

  const metadata = JSON.parse(await readRegular(path.join(repoRoot, 'package.json')));
  const portable = JSON.parse(await readRegular(path.join(repoRoot, 'plugin/plugin.json')));
  if (portable.$schema !== portableSchema || portable.name !== metadata.name) {
    throw new Error('Portable plugin identity must match package.json.');
  }
  const revision = revisionFor(repoRoot);
  const version = metadata.version;
  if (!isSemVer(version)) throw new Error('Build version must be valid SemVer.');
  portable.version = version;
  const compatibility = {
    name: portable.name,
    version: portable.version,
    description: portable.description,
    skills: './skills/',
    interface: portable.extensions['com.openai'].interface,
  };
  const files = new Map([
    ...await readTree(path.join(repoRoot, 'src'), 'lib'),
    ...await readTree(path.join(repoRoot, 'workflows'), 'workflows'),
    ...await readTree(path.join(repoRoot, 'plugin/skills'), 'skills'),
    ['plugin.json', Buffer.from(json(portable))],
    ['.codex-plugin/plugin.json', Buffer.from(json(compatibility))],
    ['dist/cli.mjs', Buffer.from(`#!/usr/bin/env node\nimport { main } from '../lib/cli/main.mjs';\nprocess.exitCode = main(undefined, ${JSON.stringify(version)});\n`)],
    ['README.md', await readRegular(path.join(repoRoot, 'plugin/README.package.md'))],
    ['scripts/check-package.mjs', await readRegular(path.join(repoRoot, 'scripts/check-package.mjs'))],
  ]);
  for (const name of ['architecture.md', 'usage.md', 'packaging.md']) {
    files.set(`docs/${name}`, await readRegular(path.join(repoRoot, 'docs', name)));
  }
  if (!files.has('lib/cli/main.mjs')) throw new Error('src/cli/main.mjs is required before building.');

  const outputFiles = new Map();
  const hashes = {};
  for (const [relative, data] of [...files].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    outputFiles.set(`worker-orchestrator/${relative}`, data);
    hashes[relative] = { sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length };
  }
  const manifest = {
    formatVersion: 1,
    name: portable.name,
    version: portable.version,
    revision,
    runtime: { name: 'node', range: metadata.engines.node, builtWith: process.versions.node },
    files: hashes,
  };

  const marketplace = {
    name: 'worker-orchestrator-local',
    interface: { displayName: 'Worker Orchestrator Local' },
    plugins: [{
      name: portable.name,
      source: { source: 'local', path: './worker-orchestrator' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    }],
  };
  outputFiles.set('marketplace.json', json(marketplace));
  // Official directory registration discovers this conventional location beneath outputRoot.
  outputFiles.set('.agents/plugins/marketplace.json', json(marketplace));

  // Overwrite only known build files; leave stale or foreign files for the checker to report.
  await ensureDirectory(outputRoot);
  await withBuildOutputLock(outputRoot, () => publishFiles(outputRoot, outputFiles, ['worker-orchestrator/package-manifest.json', json(manifest)]));
  return { ok: true, packageRoot, marketplaceRoot: outputRoot, files: files.size, version: manifest.version, revision: manifest.revision };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 2) {
      throw new Error('Usage: node scripts/build-package.mjs');
    }
    console.log(json(await buildPackage()).trimEnd());
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 1;
  }
}
