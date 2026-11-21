import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../plugin/', import.meta.url));
const bundle = join(root, 'skills/repo-governance/assets/bundle.json');
const command = process.platform === 'win32' ? 'task.exe' : 'task';
function task(args, env = {}, at = root) {
  const result = spawnSync(command, ['--taskfile', join(at, 'Taskfile.yml'), '--exit-code', ...args], { cwd: at, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', ...env }, timeout: 60000, windowsHide: true });
  assert.ifError(result.error);
  return result;
}
const req = text => ({ schemaVersion: 3, operation: 'check', check: 'name', sources: [{ kind: 'text', text }], context: {} });

test('short Task commands expose actual checker scope and reject retired variables', async () => {
  const demo = task(['demo']);
  assert.equal(demo.status, 0, demo.stdout + demo.stderr);
  assert.equal(JSON.parse(demo.stdout).decision, 'violation');
  const directory = await mkdtemp(join(tmpdir(), 'governance-task-'));
  const path = join(directory, '요청 with spaces.json');
  await writeFile(path, JSON.stringify(req('product-inventory-api')));
  for (const [args, code] of [[[], 0], [['CATALOG=old.json'], 1], [['POLICY=old.json'], 1], [['BUNDLE=' + join(directory, 'absent.json')], 3]]) {
    const result = task(['check', 'REQUEST=' + path, ...args]);
    assert.equal(result.status, code, result.stdout + result.stderr);
    assert.equal(result.stdout.trim().split(/\r?\n/).length, 1);
  }
  const explicit = task(['check', 'REQUEST=' + path], { REPO_GOVERNANCE_REQUEST: 'absent.json' });
  assert.equal(explicit.status, 0, explicit.stdout);
  await writeFile(path, '{');
  assert.equal(task(['check', 'REQUEST=' + path]).status, 1);
});

test('doctor does not turn configured resources into observed native enforcement', () => {
  const result = task(['doctor']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.checker.scope, 'mechanical');
  assert.equal(report.checker.decision, 'pass');
  assert.deepEqual(report.connections.map(item => item.harness), ['codex', 'claude-code', 'pi', 'ci']);
  assert.ok(report.connections.every(item => item.execution === 'not-observed'));
});

test('product command emits the optional product example without changing the manifest', async () => {
  const before = await readFile(bundle);
  const result = task(['show:product']);
  assert.equal(result.status, 0, result.stderr);
  const product = JSON.parse(result.stdout);
  assert.deepEqual(product, {schemaVersion: 1, sources: [], outputBoundaries: []});
  assert.deepEqual(await readFile(bundle), before);
});

test('native launch tasks forward explicit product inputs without starting a model session', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'governance-launch-'));
  const product = join(directory, 'selected product.json');
  for (const command of ['run:claude', 'run:pi']) {
    const result = task(['--dry', command, 'TARGET=' + directory, 'PRODUCT=' + product], { REPO_GOVERNANCE_PRODUCT: 'wrong-product.json' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok((result.stdout + result.stderr).includes(product), result.stdout + result.stderr);
    assert.ok(!(result.stdout + result.stderr).includes('wrong-product.json'));
  }
});

test('local Git hook setup has no task or runtime command', () => {
  const tasks = task(['--list-all']);
  assert.equal(tasks.status, 0, tasks.stderr);
  assert.doesNotMatch(tasks.stdout + tasks.stderr, /\bsetup:git\b/);
  assert.notEqual(task(['setup:git']).status, 0);

  const direct = spawnSync(process.execPath, ['scripts/task-cli.mjs', 'setup-git'], {
    cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, REPO_GOVERNANCE_TARGET: '' }
  });
  assert.equal(direct.status, 1, direct.stderr);
  assert.equal(JSON.parse(direct.stdout).findings[0].message, 'Unsupported task: setup-git');
});

test('bundle checks validate packaged resources and refuse altered bytes', async () => {
  const verified = task(['verify:bundle']);
  assert.equal(verified.status, 0, verified.stdout + verified.stderr);
  assert.ok(JSON.parse(verified.stdout).packedFiles > 0);
  const directory = await mkdtemp(join(tmpdir(), 'governance-package-'));
  const copied = join(directory, 'bundle');
  await cp(root, copied, { recursive: true });
  await writeFile(join(copied, 'templates/README.md'), 'unexpected template');
  const changed = task(['verify:bundle'], {}, copied);
  assert.notEqual(changed.status, 0, changed.stdout);
});
