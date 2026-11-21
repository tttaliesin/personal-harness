import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeGitEnvironment } from '../plugin/skills/repo-governance/scripts/native-product.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestName = 'skills/repo-governance/assets/bundle.json';
function invoke(at, args, env = {}) {
  const run = spawnSync(process.execPath, args, { cwd: at, encoding: 'utf8', windowsHide: true, env: { ...process.env, ...env } });
  assert.ifError(run.error);
  return run;
}
function fixture(t, { sourcePath = 'source', checkoutPath } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'governance-package-task-'));
  t.after(() => { assert.equal(dirname(resolve(directory)), resolve(tmpdir())); rmSync(directory, { recursive: true, force: true }); });
  const source = join(directory, sourcePath);
  mkdirSync(source, { recursive: true });
  if (checkoutPath) {
    const init = spawnSync('git', ['init', '--quiet', '--template='], {
      cwd: join(directory, checkoutPath), encoding: 'utf8', windowsHide: true, env: nativeGitEnvironment()
    });
    assert.ifError(init.error);
    assert.equal(init.status, 0, init.stderr);
  }
  for (const name of ['plugin', 'scripts', 'Taskfile.yml'])
    cpSync(join(root, name), join(source, name), { recursive: true });
  mkdirSync(join(source, 'docs'), { recursive: true });
  writeFileSync(join(source, 'docs/verification.md'), '# Source-only synthetic verification result\n');
  mkdirSync(join(source, 'tests'), { recursive: true });
  writeFileSync(join(source, 'tests/example.test.mjs'), 'throw Error("Tests must not ship");\n');
  const build = invoke(source, ['scripts/bundle.mjs', 'build']);
  assert.equal(build.status, 0, build.stdout + build.stderr);
  return { directory, source, plugin: join(source, 'plugin') };
}

function filePaths(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(item => item.isFile())
    .map(item => relative(directory, join(item.parentPath, item.name)))
    .sort();
}

test('the package task prepares an exact runtime install source and preserves source records', t => {
  const { directory, source, plugin } = fixture(t);
  const destination = join(directory, '배포 with spaces');
  const before = readFileSync(join(plugin, manifestName));
  const blockedSource = invoke(plugin, ['scripts/bundle.mjs', 'assert-runtime'], { REPO_GOVERNANCE_INSTALL_SOURCE: source });
  assert.equal(blockedSource.status, 1, blockedSource.stdout + blockedSource.stderr);
  const home = join(directory, 'empty-codex-home');
  mkdirSync(home);
  const refused = spawnSync(process.platform === 'win32' ? 'task.exe' : 'task',
    ['--exit-code', 'update:codex', 'SOURCE=' + source],
    { cwd: plugin, encoding: 'utf8', windowsHide: true, env: { ...process.env, CODEX_HOME: home } });
  assert.ifError(refused.error);
  assert.notEqual(refused.status, 0);
  assert.equal(existsSync(join(home, 'config.toml')), false, 'An invalid install source must not change marketplace settings.');
  const run = spawnSync(process.platform === 'win32' ? 'task.exe' : 'task', ['--exit-code', 'package', 'DEST=' + destination],
    { cwd: source, encoding: 'utf8', windowsHide: true });
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.equal(JSON.parse(run.stdout).scope, 'runtime-files-only');
  assert.deepEqual(readFileSync(join(destination, manifestName)), before);
  assert.equal(existsSync(join(destination, 'docs')), false);
  assert.equal(existsSync(join(destination, 'tests')), false);
  assert.ok(existsSync(join(source, 'docs/verification.md')));
  const verified = invoke(destination, ['scripts/bundle.mjs', 'assert-runtime']);
  assert.equal(verified.status, 0, verified.stdout + verified.stderr);
  const paths = filePaths(plugin);
  assert.deepEqual(filePaths(destination), paths);
  for (const file of paths) assert.deepEqual(readFileSync(join(destination, file)), readFileSync(join(plugin, file)), file);
  writeFileSync(join(destination, 'private-session.log'), 'Synthetic local history.\n');
  const extra = invoke(destination, ['scripts/bundle.mjs', 'assert-runtime']);
  assert.equal(extra.status, 1);
  assert.match(extra.stdout, /prepared runtime folder|inventory differs/i);
});

test('packaging refuses an existing or overlapping destination and altered source bytes', t => {
  const { directory, source, plugin } = fixture(t);
  const existing = join(directory, 'existing');
  mkdirSync(existing);
  writeFileSync(join(existing, 'keep.txt'), 'Existing user content.\n');
  for (const destination of [source, directory, join(source, 'runtime'), existing]) {
    const run = invoke(source, ['scripts/package.mjs'], { REPO_GOVERNANCE_DEST: destination });
    assert.equal(run.status, 1, destination + '\n' + run.stdout);
  }
  assert.equal(readFileSync(join(existing, 'keep.txt'), 'utf8'), 'Existing user content.\n');
  assert.equal(existsSync(join(source, 'runtime')), false);
  const destination = join(directory, 'new-runtime');
  const unexpected = join(plugin, 'unexpected.txt');
  writeFileSync(unexpected, 'Outside the verified inventory.\n');
  const inventory = invoke(source, ['scripts/package.mjs'], { REPO_GOVERNANCE_DEST: destination });
  assert.equal(inventory.status, 1);
  assert.match(inventory.stdout, /inventory differs/i);
  assert.equal(existsSync(destination), false);
  rmSync(unexpected);

  writeFileSync(join(plugin, 'specs/naming.md'), 'Unexpected rule change.\n');
  const changed = invoke(source, ['scripts/package.mjs'], { REPO_GOVERNANCE_DEST: destination });
  assert.equal(changed.status, 1);
  assert.match(changed.stdout, /Bundle bytes differ/);
  assert.equal(existsSync(destination), false);
});

test('source commands refuse Git-excluded files even when the manifest already lists them', async t => {
  const scenarios = [
    { name: 'standalone Git checkout', checkoutPath: 'source', ignorePath: 'source/.git/info/exclude' },
    { name: 'enclosing Git checkout', sourcePath: 'plugins/repo-governance', checkoutPath: '.', ignorePath: '.gitignore' },
    { name: 'source archive', ignorePath: 'source/.gitignore' }
  ];
  for (const scenario of scenarios) {
    await t.test(scenario.name, subtest => {
      const { directory, source, plugin } = fixture(subtest, scenario);
      mkdirSync(join(plugin, 'local-only'));
      writeFileSync(join(plugin, 'local-only/ignored.txt'), 'Synthetic local output.\n');
      const prepared = invoke(source, ['scripts/bundle.mjs', 'build']);
      assert.equal(prepared.status, 0, prepared.stdout + prepared.stderr);
      const manifest = join(plugin, manifestName);
      const before = readFileSync(manifest);
      const ignore = join(directory, scenario.ignorePath);
      mkdirSync(dirname(ignore), { recursive: true });
      const prefix = scenario.sourcePath ? scenario.sourcePath + '/' : '';
      writeFileSync(ignore, `/${prefix}plugin/local-only/\n`);

      const destination = join(directory, 'blocked-runtime');
      const operations = [
        ['scripts/bundle.mjs', 'build'],
        ['scripts/bundle.mjs', 'verify'],
        ['scripts/package.mjs']
      ];
      for (const args of operations) {
        const result = invoke(source, args, { REPO_GOVERNANCE_DEST: destination });
        assert.equal(result.status, 1, args.join(' ') + ': ' + result.stdout + result.stderr);
        assert.match(result.stdout, /Git excludes .*plugin\/local-only\/ignored\.txt/i);
      }
      assert.deepEqual(readFileSync(manifest), before);
      assert.equal(existsSync(destination), false);
    });
  }
});

test('Codex setup, update and recovery install the selected bundle without granting hook trust', t => {
  const available = spawnSync('codex', ['--version'], { encoding: 'utf8', windowsHide: true });
  if (available.error?.code === 'ENOENT') { t.skip('Codex CLI is not installed.'); return; }
  assert.ifError(available.error);
  assert.equal(available.status, 0, available.stderr);

  const { directory, source, plugin } = fixture(t);
  const runtime = join(directory, '이전 설치 원본 #1 & release');
  const prepared = invoke(source, ['scripts/package.mjs'], { REPO_GOVERNANCE_DEST: runtime });
  assert.equal(prepared.status, 0, prepared.stdout + prepared.stderr);
  const priorDigest = JSON.parse(prepared.stdout).sha256;
  writeFileSync(join(plugin, 'README.md'), readFileSync(join(plugin, 'README.md'), 'utf8') + '\nUpdated fixture.\n');
  const rebuilt = invoke(source, ['scripts/bundle.mjs', 'build']);
  assert.equal(rebuilt.status, 0, rebuilt.stdout + rebuilt.stderr);
  const newDigest = JSON.parse(rebuilt.stdout).sha256;
  assert.notEqual(newDigest, priorDigest);

  const codexHome = join(directory, 'codex-home');
  mkdirSync(codexHome);
  const config = join(codexHome, 'config.toml');
  const oldTrust = 'sha256:' + 'a'.repeat(64);
  const existingConfig = '[plugins."unrelated@other-marketplace"]\nenabled = true\n'
    + '[hooks.state."repo-governance@repo-governance-local:hooks/codex.json:pre_tool_use:0:0"]\n'
    + 'trusted_hash = "' + oldTrust + '"\n'
    + 'trusted_content_hash = "' + oldTrust + '"\n';
  writeFileSync(config, existingConfig);
  const env = { ...process.env, CODEX_HOME: codexHome };
  const taskExe = process.platform === 'win32' ? 'task.exe' : 'task';
  const cli = args => spawnSync('codex', ['plugin', ...args], { cwd: runtime, encoding: 'utf8', windowsHide: true, env });
  const task = args => spawnSync(taskExe, ['--exit-code', ...args], { cwd: runtime, encoding: 'utf8', windowsHide: true, env });

  for (const [args, expected, digest, replaced] of [
    [['setup:codex'], runtime, priorDigest, false],
    [['update:codex'], runtime, priorDigest, false],
    [['update:codex', 'SOURCE=' + plugin], plugin, newDigest, true],
    [['update:codex', 'SOURCE=' + runtime], runtime, priorDigest, true],
  ]) {
    const run = task(args);
    assert.ifError(run.error);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const report = JSON.parse(run.stdout);
    assert.equal(report.operation, 'install-codex');
    assert.equal(report.scope, 'verified-installed-files');
    assert.equal(report.desktopState, 'verify-hook-in-desktop');
    assert.equal(report.bundleSha256, digest);
    assert.equal(report.replacedMarketplace, replaced);
    assert.deepEqual(readFileSync(join(report.installedPath, manifestName)), readFileSync(join(expected, manifestName)));
    const catalogues = cli(['marketplace', 'list', '--json']);
    assert.equal(catalogues.status, 0, catalogues.stdout + catalogues.stderr);
    const selected = JSON.parse(catalogues.stdout).marketplaces.find(item => item.name === 'repo-governance-local');
    assert.equal(relative(realpathSync(expected), realpathSync(selected.root)), '');
    const saved = readFileSync(config, 'utf8');
    assert.match(saved, /\[plugins\."unrelated@other-marketplace"\]\r?\nenabled = true/);
    assert.ok(saved.includes(oldTrust));
  }

  const marketplaceFile = join(plugin, '.agents', 'plugins', 'marketplace.json');
  const marketplace = JSON.parse(readFileSync(marketplaceFile, 'utf8'));
  marketplace.plugins[0].source.path = './missing-plugin';
  writeFileSync(marketplaceFile, JSON.stringify(marketplace));
  const invalidRebuilt = invoke(source, ['scripts/bundle.mjs', 'build']);
  assert.equal(invalidRebuilt.status, 0, invalidRebuilt.stdout + invalidRebuilt.stderr);
  const failed = task(['update:codex', 'SOURCE=' + plugin]);
  assert.ifError(failed.error);
  assert.notEqual(failed.status, 0);
  const afterFailure = cli(['marketplace', 'list', '--json']);
  assert.equal(afterFailure.status, 0, afterFailure.stdout + afterFailure.stderr);
  const restored = JSON.parse(afterFailure.stdout).marketplaces.find(item => item.name === 'repo-governance-local');
  assert.ok(restored, failed.stdout + failed.stderr + afterFailure.stdout);
  assert.equal(relative(realpathSync(runtime), realpathSync(restored.root)), '');
  const cache = join(codexHome, 'plugins', 'cache', 'repo-governance-local', 'repo-governance', JSON.parse(prepared.stdout).version);
  assert.deepEqual(readFileSync(join(cache, manifestName)), readFileSync(join(runtime, manifestName)));
});
