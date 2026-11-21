import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, cp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runCheck } from '../plugin/skills/repo-governance/scripts/check.mjs';

const root = fileURLToPath(new URL('../plugin/', import.meta.url));
const bundlePath = join(root, 'skills/repo-governance/assets/bundle.json');
const request = name => ({ schemaVersion: 3, operation: 'check', check: 'name', sources: [{ kind: 'text', text: name }], context: { bundlePath } });
const run = (input, args = [], cwd = root) => spawnSync(process.execPath, [join(root, 'skills/repo-governance/scripts/check.mjs'), ...args], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', cwd, timeout: 30000, windowsHide: true });

test('public stdin and function boundaries agree on one JSON line and four exit states', async () => {
  const absent = { ...request('product-inventory-api'), context: { bundlePath: join(root, 'absent-bundle.json') } };
  for (const [input, code, decision] of [[request('product-3d-inspection-api'), 0, 'pass'], [request('Bad_Name'), 2, 'violation'], [absent, 3, 'needs-context'], ['{', 1, 'error']]) {
    const text = typeof input === 'string' ? input : JSON.stringify(input);
    const exported = await runCheck(text);
    const result = run(text);
    assert.ifError(result.error);
    assert.equal(result.status, code, result.stderr + result.stdout);
    assert.equal(result.stdout, exported.line);
    assert.equal(result.stdout.trim().split(/\r?\n/).length, 1);
    const value = JSON.parse(result.stdout);
    assert.equal(value.schemaVersion, 3);
    assert.equal(value.scope, 'mechanical');
    assert.equal(value.decision, decision);
  }
});

test('mechanical pass leaves an incomplete shared resource name for the working agent to reject', async () => {
  const result = JSON.parse((await runCheck(JSON.stringify(request('shared-plugin')))).line);
  assert.equal(result.decision, 'pass');
  assert.equal(result.scope, 'mechanical');
  assert.deepEqual(result.findings, []);
  assert.ok(result.semanticChecks.length > 0);
  assert.ok(result.semanticChecks.every(item => item.ruleId && item.question && item.requiredEvidence.length));
  assert.ok(result.observed.some(item => item.digestOrOid));
  assert.equal(result.approved, undefined);
});

test('legacy, unknown keys and execution requests cannot become semantic approval', async () => {
  const invalid = [
    null, [], { schemaVersion: 2, operation: 'inspect-name', name: 'product-inventory-api' },
    ...['apply', 'merge', 'approve', 'create'].map(operation => ({ ...request('product-inventory-api'), operation })),
    ...['approved', 'organization', 'ownerTeam', 'reviewReceipt'].map(key => ({ ...request('product-inventory-api'), [key]: true })),
    { ...request('product-inventory-api'), context: { bundlePath, approved: true } },
    { ...request('product-inventory-api'), sources: [{ kind: 'text', text: 'product-inventory-api', approved: true }] },
    { ...request('product-inventory-api'), check: 'visibility' },
  ];
  for (const input of invalid) {
    const result = run(input);
    assert.equal(result.status, 1, result.stdout);
    assert.equal(JSON.parse(result.stdout).decision, 'error');
  }
  for (const args of [['--policy', 'old.json'], ['--bundle'], ['--bundle', bundlePath, '--bundle', bundlePath], ['--repository', root, '--repository', root], ['--product', 'a', '--product', 'b']]) {
    assert.equal(run(request('product-inventory-api'), args).status, 1, JSON.stringify(args));
  }
  assert.equal(run({}).status, 3, 'Missing required request fields need context.');
});

test('explicit CLI options cannot silently override request context', () => {
  const result = run(request('product-inventory-api'), ['--bundle', bundlePath]);
  assert.equal(result.status, 1, result.stdout);
  const input = request('product-inventory-api');
  delete input.context.bundlePath;
  const selected = run(input, ['--bundle', bundlePath]);
  assert.equal(selected.status, 0, selected.stdout);
});

test('a copied package checks from a spaced foreign cwd and detects changed rule bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'governance-boundary-'));
  const copied = join(directory, 'copied bundle 한글');
  await cp(root, copied, { recursive: true, filter: path => !path.split(/[\\/]/).includes('.git') });
  const input = { ...request('product-inventory-api'), context: { bundlePath: join(copied, 'skills/repo-governance/assets/bundle.json') } };
  const result = spawnSync(process.execPath, [join(copied, 'skills/repo-governance/scripts/check.mjs')], { input: JSON.stringify(input), encoding: 'utf8', cwd: directory, windowsHide: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const changed = join(copied, 'specs/naming.md');
  await writeFile(changed, await readFile(changed, 'utf8') + '\n바뀐 규칙.\n');
  const mismatch = spawnSync(process.execPath, [join(copied, 'skills/repo-governance/scripts/check.mjs')], { input: JSON.stringify(input), encoding: 'utf8', cwd: directory, windowsHide: true });
  assert.notEqual(mismatch.status, 0, mismatch.stdout);
  assert.notEqual(JSON.parse(mismatch.stdout).decision, 'pass');
});
