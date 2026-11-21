import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { evaluateNativeCall } from '../plugin/skills/repo-governance/scripts/tool-call.mjs';

const root = fileURLToPath(new URL('../plugin/', import.meta.url));
const bundlePath = join(root, 'skills/repo-governance/assets/bundle.json');
const hookPath = join(root, 'skills/repo-governance/scripts/hook.mjs');
const content = '# 가격 도구\n\n제품 가격을 확인합니다.\n\n## 사용\n\n입력한 가격을 확인합니다.\n';
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_|^REPO_GOVERNANCE_PRODUCT$/i.test(key)));
function git(repository, ...args) {
  return execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8', windowsHide: true, env: cleanEnv });
}
async function product(path, overrides = {}) {
  const bytes = await readFile(bundlePath);
  await writeFile(path, JSON.stringify({ schemaVersion: 1, bundle: { version: '0.2.0', sha256: createHash('sha256').update(bytes).digest('hex') }, outputBoundaries: [], ...overrides }));
  return path;
}
function metadata(repository) {
  return resolve(git(repository, 'rev-parse', '--path-format=absolute', '--git-path', 'repo-governance/product.json').trim());
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'governance-binding-'));
  const repository = join(directory, 'product');
  await mkdir(join(repository, 'docs'), { recursive: true });
  git(repository, 'init', '--quiet');
  const productPath = await product(join(repository, 'input.json'));
  const options = { repository, bundlePath };
  const write = (input = {}, extra = {}) => evaluateNativeCall('Write', { file_path: 'README.md', content, ...input }, { ...options, ...extra });
  const boundPath = metadata(repository);
  const bind = async (overrides = {}) => {
    await mkdir(dirname(boundPath), { recursive: true });
    return product(boundPath, overrides);
  };
  const hook = (input = {}) => JSON.parse(execFileSync(process.execPath, [hookPath, '--harness', 'codex', '--bundle', bundlePath], {
    encoding: 'utf8', windowsHide: true, env: cleanEnv,
    input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: repository, tool_name: 'Write', tool_input: { file_path: 'README.md', content, ...input } })
  }));
  return { directory, repository, productPath, boundPath, options, write, bind, hook };
}
function products(result) {
  return result.checks.flatMap(check => check.observed.filter(item => item.kind === 'product').map(item => item.target));
}
async function withEnv(values, action) {
  const before = { ...process.env };
  for (const key of Object.keys(process.env)) if (/^GIT_|^REPO_GOVERNANCE_PRODUCT$/i.test(key)) delete process.env[key];
  Object.assign(process.env, values);
  try { return await action(); }
  finally {
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
  }
}

test('native API and hook use an explicit Git binding without a product environment variable', async () => withEnv({}, async () => {
  const f = await fixture();
  assert.equal((await f.write()).decision, 'allow');
  assert.equal(f.hook().hookSpecificOutput.permissionDecision, undefined);
  await f.bind();
  const result = await f.write();
  assert.equal(result.decision, 'allow', JSON.stringify(result));
  assert.deepEqual(result.checks.map(check => check.check), ['file-scope']);
  assert.deepEqual(products(result), [f.boundPath]);
  const output = f.hook().hookSpecificOutput;
  assert.equal(output.permissionDecision, undefined);
  assert.equal(JSON.parse(output.additionalContext).decision, 'allow');
  await f.bind({outputBoundaries: [{path: 'README.md', purpose: '시험용 출력', lifetime: '시험 종료까지'}]});
  assert.equal((await f.write()).decision, 'deny');
  assert.equal(f.hook().hookSpecificOutput.permissionDecision, 'deny');
  await assert.rejects(access(join(f.repository, 'README.md')), { code: 'ENOENT' });
}));

test('explicit options and environment win, and invalid selected inputs never fall back', async () => withEnv({}, async () => {
  const f = await fixture();
  await f.bind({ schemaVersion: 2 });
  await withEnv({ REPO_GOVERNANCE_PRODUCT: 'missing-env.json' }, async () => {
    assert.equal((await f.write({}, { productPath: f.productPath })).decision, 'allow');
    assert.equal((await f.write({}, { productPath: relative(process.cwd(), f.productPath) })).decision, 'allow');
  });
  await withEnv({ REPO_GOVERNANCE_PRODUCT: f.productPath }, async () => {
    assert.equal((await f.write()).decision, 'allow');
    assert.equal((await f.write({}, { productPath: 'missing-option.json' })).decision, 'needs-context');
    await assert.rejects(f.write({}, { productPath: '' }), /product/i);
    await assert.rejects(f.write({}, { productPath: null }), /product/i);
  });
  await f.bind();
  await withEnv({ REPO_GOVERNANCE_PRODUCT: '' }, () => assert.rejects(f.write(), /product/i));
  await withEnv({ REPO_GOVERNANCE_PRODUCT: 'missing-env.json' }, async () => {
    assert.equal((await f.write()).decision, 'needs-context');
  });
  await f.bind({ schemaVersion: 2 });

  assert.equal((await f.write()).decision, 'needs-context');
  assert.equal(f.hook().hookSpecificOutput.permissionDecision, 'deny');
}));

test('workdir, nested cwd, and literal git -C select the target repository binding', async () => withEnv({}, async () => {
  const first = await fixture();
  const second = await fixture();
  await first.bind({ schemaVersion: 2 });
  await second.bind();
  const switched = await first.write({ workdir: second.repository });
  assert.equal(switched.decision, 'allow', JSON.stringify(switched));
  assert.deepEqual(products(switched), [second.boundPath]);
  const nested = await first.write({ file_path: '../README.md', cwd: join(second.repository, 'docs') });
  assert.equal(nested.decision, 'allow', JSON.stringify(nested));
  assert.deepEqual(products(nested), [second.boundPath]);
  const branch = await evaluateNativeCall('exec_command', { cmd: 'git -C "' + second.repository.replaceAll('\\', '/') + '" branch Fix_Login' }, first.options);
  assert.equal(branch.decision, 'deny', JSON.stringify(branch));
  assert.deepEqual(products(branch), [second.boundPath]);
  const child = await second.write({ file_path: 'docs/README.md', content: '# 안내\n\n[입력](input.md)을 읽습니다.\n' });
  assert.equal(child.decision, 'allow', JSON.stringify(child));
  assert.deepEqual(products(child), [second.boundPath]);
  assert.equal((await first.write()).decision, 'needs-context');
  const outside = await first.write({ file_path: join(first.directory, 'notes.md') });
  assert.equal(outside.inspection, 'outside-selected-product');
}));

test('inherited Git selectors and injected configuration cannot redirect the product binding', async () => withEnv({}, async () => {
  const f = await fixture();
  const other = await fixture();
  await other.bind({ schemaVersion: 2 });
  const globalConfig = join(f.directory, 'global.config');
  await writeFile(globalConfig, '[repoGovernance]\n\tproduct = ' + f.productPath.replaceAll('\\', '/') + '\n');
  git(f.repository, 'config', '--local', 'include.path', globalConfig);
  await withEnv({ GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'repoGovernance.product', GIT_CONFIG_VALUE_0: f.productPath }, async () => {
    const result = await f.write();
    assert.equal(result.decision, 'allow');
    assert.deepEqual(products(result), []);
  });
  await f.bind();
  await withEnv({ GIT_DIR: join(other.repository, '.git'), GIT_WORK_TREE: other.repository, GIT_CONFIG: globalConfig, GIT_CONFIG_PARAMETERS: "'repoGovernance.product=missing.json'" }, async () => {
    const result = await f.write();
    assert.deepEqual(products(result), [f.boundPath]);
  });
}));

test('malformed metadata files deny through the public API and native hook', async () => withEnv({}, async () => {
  const f = await fixture();
  await f.bind();
  for (const value of ['', 'not json', '{}']) {
    await writeFile(f.boundPath, value);
    assert.ok(['error', 'needs-context'].includes((await f.write()).decision));
    assert.equal(f.hook().hookSpecificOutput.permissionDecision, 'deny');
  }
  const directory = await fixture();
  await mkdir(directory.boundPath, { recursive: true });
  assert.equal((await directory.write()).decision, 'error');
  assert.equal(directory.hook().hookSpecificOutput.permissionDecision, 'deny');
}));

test('linked worktrees have independent metadata products without a shared fallback', async () => withEnv({}, async () => {
  const f = await fixture();
  git(f.repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false', 'commit', '--allow-empty', '-m', 'fixture');
  const linked = join(f.directory, 'linked');
  git(f.repository, 'worktree', 'add', '--quiet', '-b', 'linked', linked);
  await f.bind();
  const defaultResult = await f.write({ workdir: linked });
  assert.equal(defaultResult.decision, 'allow');
  assert.deepEqual(products(defaultResult), []);
  const linkedPath = metadata(linked);
  assert.notEqual(linkedPath, f.boundPath);
  await mkdir(dirname(linkedPath), { recursive: true });
  await product(linkedPath);
  const shared = await f.write({ workdir: linked });
  assert.equal(shared.decision, 'allow', JSON.stringify(shared));
  assert.deepEqual(products(shared), [linkedPath]);
  await f.bind({ schemaVersion: 2 });
  const chosen = await f.write({ workdir: linked });
  assert.equal(chosen.decision, 'allow', JSON.stringify(chosen));
  assert.deepEqual(products(chosen), [linkedPath]);
  assert.equal((await f.write()).decision, 'needs-context');
}));

test('a dangling metadata symlink is selected and denied rather than treated as absent', async t => withEnv({}, async () => {
  const f = await fixture();
  await mkdir(dirname(f.boundPath), { recursive: true });
  try { await symlink(join(f.directory, 'missing.json'), f.boundPath); }
  catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Host cannot create file symlinks'); return; }
    throw error;
  }
  const result = await f.write();
  assert.equal(result.decision, 'needs-context');
  assert.ok(result.findings.some(item => item.message.includes('missing.json')));
  assert.equal(f.hook().hookSpecificOutput.permissionDecision, 'deny');
}));
