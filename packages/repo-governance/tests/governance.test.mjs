import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { evaluateNativeCall } from '../plugin/skills/repo-governance/scripts/tool-call.mjs';
import extension from '../plugin/.pi/extensions/repo-governance.ts';

const root = fileURLToPath(new URL('../plugin/', import.meta.url));
const bundle = join(root, 'skills/repo-governance/assets/bundle.json');
const goodReadme = '# 제품 도구\n\n자료를 검사한다.\n\n## 시작\n\n도구를 실행한다.\n';
const badReadme = '# 제품 도구\n\n## 빈 절\n';
const hash = value => createHash('sha256').update(value).digest('hex');

function git(repository, args, env = {}) {
  return spawnSync('git', ['-C', repository, ...args], { encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...env } });
}

function okGit(repository, args, env) {
  const result = git(repository, args, env);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  return result.stdout;
}

async function fixture() {
  const repository = await mkdtemp(join(tmpdir(), 'repo-governance-native-'));
  okGit(repository, ['init', '-q']);
  okGit(repository, ['config', 'user.email', 'fixture@example.invalid']);
  okGit(repository, ['config', 'user.name', 'Fixture']);
  okGit(repository, ['config', 'commit.gpgsign', 'false']);
  await mkdir(join(repository, 'local'));
  await writeFile(join(repository, 'local/output.txt'), 'old output\n');
  await writeFile(join(repository, 'source.txt'), 'old source\n');
  await writeFile(join(repository, 'README.md'), goodReadme);
  await writeFile(join(repository, '.gitignore'), 'local/\n');
  okGit(repository, ['add', 'source.txt', 'README.md', '.gitignore']);
  okGit(repository, ['add', '-f', 'local/output.txt']);
  okGit(repository, ['-c', 'core.hooksPath=', 'commit', '-q', '-m', 'test: 검증 자료를 만든다']);
  okGit(repository, ['-c', 'core.hooksPath=', 'commit', '--allow-empty', '-q', '-m', 'test: 과거 출력과 현행 기준을 구분한다']);
  const productPath = join(repository, 'governance.product.json');
  await writeFile(productPath, JSON.stringify({
    schemaVersion: 1, bundle: { version: '0.2.0', sha256: hash(await readFile(bundle)) },
    baseRef: 'HEAD', sources: ['README.md'], outputBoundaries: [{ path: 'local', purpose: '재생성 가능한 시험 출력', lifetime: '시험 종료까지' }]
  }));
  return { repository, productPath, options: { repository, productPath } };
}

function hook(harness, payload, args = []) {
  const child = spawnSync(process.execPath, [join(root, 'hooks/run.mjs'), '--harness', harness, ...args], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload), encoding: 'utf8', windowsHide: true, timeout: 15000
  });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim().split(/\r?\n/).length, 1);
  return JSON.parse(child.stdout);
}

test('README drafts pass the path check regardless of how the editor saves them', async () => {
  const f = await fixture();
  try {
    for (const [tool, input] of [
      ['Write', { file_path: 'README.md', content: badReadme }],
      ['write', { path: 'README.md', content: badReadme }],
      ['Edit', { file_path: 'README.md', old_string: '## 시작\n\n도구를 실행한다.', new_string: '## 빈 절' }],
      ['edit', { path: 'README.md', oldText: '## 시작\n\n도구를 실행한다.', newText: '## 빈 절' }],
      ['apply_patch', { command: '*** Begin Patch\n*** Update File: README.md\n@@\n-## 시작\n+## 빈 절\n \n-도구를 실행한다.\n*** End Patch' }]
    ]) {
      const before = await readFile(join(f.repository, 'README.md'));
      const result = await evaluateNativeCall(tool, input, f.options);
      assert.equal(result.decision, 'allow', tool + ': ' + JSON.stringify(result));
      assert.deepEqual(result.checks.map(check => check.check), ['file-scope']);
      assert.deepEqual(await readFile(join(f.repository, 'README.md')), before);
    }
    const allowed = await evaluateNativeCall('Write', { file_path: 'README.md', content: goodReadme }, f.options);
    assert.equal(allowed.decision, 'allow', JSON.stringify(allowed));
    const patch = await evaluateNativeCall('apply_patch', { command: '*** Begin Patch\n*** Add File: docs/README.md\n+# 문서\n+\n+설명을 제공한다.\n*** End Patch' }, f.options);
    assert.equal(patch.decision, 'allow', JSON.stringify(patch));
    const draft = await evaluateNativeCall('apply_patch', { command: '*** Begin Patch\n*** Add File: docs/README.md\n+# 문서\n+\n+## 빈 절\n*** End Patch' }, f.options);
    assert.equal(draft.decision, 'allow');
    const ambiguous = await evaluateNativeCall('Edit', { file_path: 'README.md', old_string: '없음', new_string: '변경' }, f.options);
    assert.equal(ambiguous.decision, 'allow');
    const repeated = await evaluateNativeCall('apply_patch', { command: '*** Begin Patch\n*** Add File: repeated.txt\n+first\n*** Add File: repeated.txt\n+second\n*** End Patch' }, f.options);
    assert.equal(repeated.decision, 'needs-context');
  } finally { await rm(f.repository, { recursive: true, force: true }); }
});

test('file-scope observes declared ignored output and rejects tracked output collisions', async () => {
  const f = await fixture();
  try {
    const allowed = await evaluateNativeCall('write', { path: 'local/new.txt', content: '새 출력' }, f.options);
    assert.equal(allowed.decision, 'allow', JSON.stringify(allowed));
    const denied = await evaluateNativeCall('write', { path: 'local/output.txt', content: '겹친 출력' }, f.options);
    assert.equal(denied.decision, 'deny');
    assert.ok(denied.findings.some(finding => finding.code === 'tracked-output'));
    const ordinary = await evaluateNativeCall('write', { path: 'new-source.txt', content: '새 원본' }, { repository: f.repository, bundlePath: bundle });
    assert.equal(ordinary.decision, 'allow');
    const personal = await evaluateNativeCall('write', { path: 'local/personal.txt', content: '개인 작업 기록' }, { repository: f.repository, bundlePath: bundle });
    assert.equal(personal.decision, 'allow');
    const fresh = await evaluateNativeCall('write', { path: 'new-source.txt', content: '새 원본' }, f.options);
    assert.equal(fresh.decision, 'allow');
  } finally { await rm(f.repository, { recursive: true, force: true }); }
});

test('native literal branches and commit candidates use the current actual repository', async () => {
  const f = await fixture();
  try {
    for (const [command, expected, check] of [
      ['git branch repair-expiry HEAD', 'allow', 'branch'],
      ['git switch -c Bad_Branch HEAD', 'deny', 'branch'],
      ['git commit -m "fix: 만료 처리를 고친다"', 'allow', 'commit-message'],
      ['git commit -m "invalid message"', 'deny', 'commit-message']
    ]) {
      const result = await evaluateNativeCall('Bash', { command }, f.options);
      assert.equal(result.decision, expected, command + ': ' + JSON.stringify(result));
      assert.equal(result.checks[0].check, check);
    }
    const before = okGit(f.repository, ['ls-files', '--stage']);
    const current = await evaluateNativeCall('Bash', { command: 'git commit --amend --no-edit' }, f.options);
    assert.equal(current.decision, 'allow', JSON.stringify(current));
    assert.equal(okGit(f.repository, ['ls-files', '--stage']), before);
  } finally { await rm(f.repository, { recursive: true, force: true }); }
});

test('real hook processes and the Pi callback return host denials for non-pass decisions', async () => {
  const f = await fixture();
  try {
    const local = join(f.repository, '.git/repo-governance');
    await mkdir(local);
    await writeFile(join(local, 'product.json'), await readFile(f.productPath));
    await writeFile(join(local, 'adoption.json'), JSON.stringify({ schemaVersion: 1, mode: 'enforce' }));
    await writeFile(join(f.repository, 'README.md'), badReadme);
    okGit(f.repository, ['add', 'README.md']);
    const commit = { command: 'git commit -m "docs: 시작 절차를 보강한다"' };
    const draft = { file_path: 'README.md', content: badReadme };
    const handlers = new Map();
    extension({ on(event, handler) { assert.equal(handlers.has(event), false); handlers.set(event, handler); } });
    const callback = handlers.get('tool_call');
    assert.equal(typeof callback, 'function');
    assert.equal(await callback({ toolName: 'bash', input: { command: 'echo "gh repo create Bad_Name"' } }, { cwd: f.repository }), undefined);
    assert.equal((await callback({ toolName: 'bash', input: { command: 'gh repo rename Bad_Name' } }, { cwd: f.repository })).block, true);
    assert.equal(await callback({ toolName: 'write', input: { path: 'README.md', content: badReadme } }, { cwd: f.repository }), undefined);
    assert.match((await callback({ toolName: 'bash', input: commit }, { cwd: f.repository })).reason, /K3\/empty-section/);
    assert.equal((await callback({ toolName: 'bash', input: null }, { cwd: f.repository })).block, true);
    for (const harness of ['claude-code', 'codex']) {
      for (const payload of [
        { tool_name: 'Bash', tool_input: { command: 'gh repo rename Bad_Name' }, cwd: f.repository },
        { tool_name: 'Bash', tool_input: commit, cwd: f.repository },
        { tool_name: 'Bash', tool_input: { command: 'gh repo create $NAME' }, cwd: f.repository }
      ]) {
        const result = hook(harness, payload, ['--product', f.productPath]);
        assert.equal(result.hookSpecificOutput.permissionDecision, 'deny');
        assert.match(result.hookSpecificOutput.permissionDecisionReason, /mechanical inspection/);
      }
      const pass = hook(harness, { tool_name: 'Bash', tool_input: { command: 'gh repo rename product-inventory-api' }, cwd: f.repository });
      assert.equal(pass.hookSpecificOutput.permissionDecision, undefined);
      assert.equal(JSON.parse(pass.hookSpecificOutput.additionalContext).checks[0].decision, 'pass');
      const saved = hook(harness, { tool_name: 'Write', tool_input: draft, cwd: f.repository });
      assert.equal(saved.hookSpecificOutput.permissionDecision, undefined);
      const unavailable = hook(harness, { tool_name: 'Bash', tool_input: { command: 'gh repo rename product-inventory-api' } }, ['--bundle', join(f.repository, 'missing.json')]);
      assert.equal(unavailable.hookSpecificOutput.permissionDecision, 'deny');
      assert.deepEqual(hook(harness, { tool_name: 'Bash', tool_input: { command: 'gh repo view owner/old' } }, ['--bundle', join(f.repository, 'missing.json')]), {});
    }
  } finally { await rm(f.repository, { recursive: true, force: true }); }
});

test('hook protocol rejects malformed payloads, old selectors and duplicate options', () => {
  for (const harness of ['claude-code', 'codex']) {
    for (const payload of ['{', '{}', 'null', '[]', JSON.stringify({ tool_name: 'Bash', tool_input: { command: 7 } })]) {
      assert.match(hook(harness, payload).hookSpecificOutput.permissionDecisionReason, /CHECK-ERROR/);
    }
    for (const args of [['--policy', 'old.json'], ['--bundle', 'a', '--bundle', 'a'], ['--product'], ['--repository', 'a', '--repository', 'a']]) {
      assert.equal(hook(harness, { tool_name: 'Read', tool_input: {} }, args).hookSpecificOutput.permissionDecision, 'deny');
    }
  }
});

test('agent commit inspection leaves direct Git commits under Git control', async () => {
  const f = await fixture();
  try {
    const connection = join(f.repository, '.git', 'repo-governance');
    await mkdir(connection);
    await writeFile(join(connection, 'product.json'), await readFile(f.productPath));
    await writeFile(join(connection, 'adoption.json'), JSON.stringify({ schemaVersion: 1, mode: 'enforce' }));
    await writeFile(join(f.repository, 'source.txt'), 'new source\n');
    okGit(f.repository, ['add', 'source.txt']);
    const before = okGit(f.repository, ['rev-parse', 'HEAD']);
    const index = okGit(f.repository, ['ls-files', '--stage']);
    const options = { repository: f.repository };
    const invalid = await evaluateNativeCall('Bash', { command: 'git commit -m "invalid message"' }, options);
    assert.equal(invalid.decision, 'deny', JSON.stringify(invalid));
    assert.ok(invalid.findings.some(finding => finding.code === 'commit-title'));
    const valid = await evaluateNativeCall('Bash', { command: 'git commit -m "fix: 원본 처리를 고친다"' }, options);
    assert.equal(valid.decision, 'allow', JSON.stringify(valid));
    assert.equal(okGit(f.repository, ['rev-parse', 'HEAD']), before);
    assert.equal(okGit(f.repository, ['ls-files', '--stage']), index);

    okGit(f.repository, ['commit', '-qm', 'invalid message']);
    assert.notEqual(okGit(f.repository, ['rev-parse', 'HEAD']), before);
    assert.equal(okGit(f.repository, ['log', '-1', '--format=%s']).trim(), 'invalid message');
  } finally { await rm(f.repository, { recursive: true, force: true }); }
});
