import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildPackage } from '../scripts/build-package.mjs';
import { checkPackage } from '../scripts/check-package.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const localRoot = path.join(repositoryRoot, '.local');
const sources = ['package.json', 'plugin', 'docs', 'scripts', 'src', 'workflows'];
const readJSON = async filename => JSON.parse(await readFile(filename, 'utf8'));
const run = (cwd, executable, ...args) =>
  execFileSync(executable, args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
const git = (root, ...args) => run(root, 'git', ...args);
const gitIdentity = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid'];
const commit = (root, message) => git(root, ...gitIdentity,
  '-c', 'commit.gpgSign=false', 'commit', '--allow-empty', '-qm', message);
const tagHead = (root, tag) => git(root, '-c', 'tag.gpgSign=false', 'tag', tag, 'HEAD');

async function copySources(root) {
  await Promise.all(sources.map(relative =>
    cp(path.join(repositoryRoot, relative), path.join(root, relative), { recursive: true })));
}

async function gitFixture(t) {
  await mkdir(localRoot, { recursive: true });
  const root = await mkdtemp(path.join(localRoot, 'tagged-version-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await copySources(root);
  git(root, 'init', '-q');
  git(root, '-c', 'core.autocrlf=false', 'add', '--', ...sources);
  commit(root, 'Fixture base commit');
  return root;
}

async function assertPackagedVersion(built, version) {
  const { packageRoot, marketplaceRoot } = built;
  const [portable, compatibility, manifest] = await Promise.all(
    ['plugin.json', '.codex-plugin/plugin.json', 'package-manifest.json'].map(relative =>
      readJSON(path.join(packageRoot, relative))));
  assert.equal(built.version, version);
  assert.equal(portable.version, version);
  assert.equal(compatibility.version, version);
  assert.equal(manifest.version, version);
  assert.equal(Object.hasOwn(manifest, 'releaseTag'), false);
  const installed = JSON.parse(run(packageRoot, process.execPath, 'dist/cli.mjs', '--version'));
  assert.equal(installed.version, version);
  const checked = await checkPackage({ root: packageRoot, marketplaceRoot, smoke: false });
  assert.equal(checked.version, version);
  assert.equal(checked.marketplaceChecked, true);
}

test('tagged HEAD builds the package.json version and records the Git revision', async t => {
  const repoRoot = await gitFixture(t);
  tagHead(repoRoot, 'v8.2.3');
  const metadata = await readJSON(path.join(repoRoot, 'package.json'));
  assert.notEqual(metadata.version, '8.2.3');
  const built = JSON.parse(run(repoRoot, process.execPath, 'scripts/build-package.mjs'));
  const revision = git(repoRoot, 'rev-parse', 'HEAD');
  assert.equal(built.revision, revision);
  const manifest = await readJSON(path.join(built.packageRoot, 'package-manifest.json'));
  assert.equal(manifest.revision, revision);
  await assertPackagedVersion(built, metadata.version);
});

test('an exported source directory does not inherit its parent Git revision', async t => {
  const parent = await gitFixture(t);
  const repoRoot = path.join(parent, 'exported source');
  await mkdir(repoRoot);
  await copySources(repoRoot);
  const built = await buildPackage({ repoRoot });
  assert.equal(built.revision, null);
  const metadata = await readJSON(path.join(repoRoot, 'package.json'));
  await assertPackagedVersion(built, metadata.version);
});

test('the checker smoke test rejects a CLI version that disagrees with the manifests', async t => {
  const repoRoot = await gitFixture(t);
  const { packageRoot, version } = await buildPackage({ repoRoot });
  const relative = 'dist/cli.mjs';
  const entry = path.join(packageRoot, relative);
  const source = await readFile(entry, 'utf8');
  const modified = source.replace(JSON.stringify(version), '"99.0.0"');
  assert.notEqual(modified, source);
  await writeFile(entry, modified);
  const manifestPath = path.join(packageRoot, 'package-manifest.json');
  const manifest = await readJSON(manifestPath);
  manifest.files[relative] = { bytes: Buffer.byteLength(modified), sha256: createHash('sha256').update(modified).digest('hex') };
  await writeFile(manifestPath, JSON.stringify(manifest));
  assert.equal((await checkPackage({ root: packageRoot, smoke: false })).ok, true);
  await assert.rejects(checkPackage({ root: packageRoot, stateDir: path.join(repoRoot, '.local', 'state') }),
    /Installed CLI version must match the manifest/);
});
