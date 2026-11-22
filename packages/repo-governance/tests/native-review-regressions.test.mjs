import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, access, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { evaluateNativeCall } from '../plugin/skills/repo-governance/scripts/tool-call.mjs';

const root = fileURLToPath(new URL('../plugin/', import.meta.url));
const bundlePath = join(root, 'skills/repo-governance/assets/bundle.json');
const hookPath = join(root, 'skills/repo-governance/scripts/hook.mjs');
const cleanEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_|^REPO_GOVERNANCE_PRODUCT$/i.test(key)));
const content = '# 가격 도구\n\n제품 가격을 확인합니다.\n\n## 사용\n\n입력한 가격을 확인합니다.\n';

function git(repository, args, environment = {}) {
  return execFileSync('git', ['-C', repository, '-c', 'core.hooksPath=', '-c', 'commit.gpgSign=false', ...args], {
    encoding: 'utf8', windowsHide: true, env: { ...cleanEnvironment, ...environment }
  });
}

async function product(path, outputBoundaries = []) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ schemaVersion: 1, bundle: { version: '0.2.0', sha256: createHash('sha256').update(await readFile(bundlePath)).digest('hex') }, outputBoundaries }));
  return path;
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'governance-native-review-'));
  t.after(async () => {
    const target = await realpath(directory);
    const parent = await realpath(tmpdir());
    const key = path => process.platform === 'win32' ? path.toLowerCase() : path;
    assert.equal(key(dirname(target)), key(parent), 'Cleanup must stay in the fixture temporary root');
    assert.ok(basename(target).startsWith('governance-native-review-'), 'Cleanup must identify this test fixture');
    await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
  const repository = join(directory, 'product');
  await mkdir(join(repository, 'docs'), { recursive: true });
  git(repository, ['init', '--quiet']);
  await writeFile(join(repository, 'README.md'), content);
  git(repository, ['add', 'README.md']);
  git(repository, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'test: 검증 자료를 만든다']);
  const productPath = await product(join(directory, 'product.json'));
  return { directory, repository, options: { repository, productPath, bundlePath } };
}

function assertInspectedOrHeld(result, command) {
  assert.notEqual(result.decision, 'allow', command + ': ' + JSON.stringify(result));
  assert.ok(result.inspection === 'checked' || result.inspection === 'missing-input', command);
}

test('Git global options and attached branch creation spellings cannot hide governed mutations', async t => {
  const { options } = await fixture(t);
  for (const command of [
    'git --no-pager branch Bad_Global',
    'git -P branch Bad_Global',
    'git --paginate branch Bad_Global',
    'git --no-optional-locks branch Bad_Global',
    'git --literal-pathspecs branch Bad_Global',
    'git --no-pager commit --allow-empty -m invalid',
    'git --no-pager -c core.hooksPath=elsewhere commit --allow-empty -m invalid',
    'git --bare branch Bad_Global',
    'git switch --create=Bad_Equals',
    'git switch --force-create=Bad_Equals',
    'git switch -cBad_Compact',
    'git switch -CBad_Compact',
    'git checkout -bBad_Compact',
    'git checkout -BBad_Compact',
    'git checkout --orphan=Bad_Orphan'
  ]) assertInspectedOrHeld(await evaluateNativeCall('Bash', { command }, options), command);
});

test('abbreviated and combined branch creation options cannot escape inspection', async t => {
  const { repository, options } = await fixture(t);
  const base = git(repository, ['rev-parse', 'HEAD']).trim();
  for (const args of [
    ['switch', '--cre=Bad_Abbreviated'],
    ['checkout', '--orph=Bad_Orphan'],
    ['switch', '-qcBad_Combined'],
    ['checkout', '-qbBad_CombinedCheckout']
  ]) await t.test(args.join(' '), async () => {
    git(repository, ['checkout', '--detach', '--quiet', base]);
    const command = 'git ' + args.join(' ');
    const inspection = await evaluateNativeCall('Bash', { command }, options);
    git(repository, args);
    assert.match(git(repository, ['symbolic-ref', 'HEAD']).trim(), /^refs\/heads\/Bad_/);
    assertInspectedOrHeld(inspection, command);
  });
  for (const command of [
    'git switch --cre Bad_Separate',
    'git switch --force-c=Bad_Abbreviated',
    'git switch -qCBad_Combined',
    'git checkout -qBBad_Combined',
    'git switch --cre=repair-expiry'
  ]) assertInspectedOrHeld(await evaluateNativeCall('Bash', { command }, options), command);
});

test('valid ordinary Git queries and checkout paths still avoid governance inspection', async t => {
  const { repository } = await fixture(t);
  const base = git(repository, ['rev-parse', 'HEAD']).trim();
  const branch = git(repository, ['branch', '--show-current']).trim();
  for (const args of [
    ['branch', '--list'], ['branch', '--show-current'], ['branch', '--contains', 'HEAD'],
    ['switch', '--quiet', branch], ['switch', '--detach', '--quiet', 'HEAD'],
    ['checkout', '--detach', '--quiet', 'HEAD'],
    ['checkout', '-q', '--', 'README.md'],
    ['checkout', '--conflict=merge', '--', 'README.md']
  ]) {
    git(repository, args);
    const command = 'git ' + args.join(' ');
    const inspection = await evaluateNativeCall('Bash', { command }, {
      repository, get bundlePath() { throw Error('ordinary Git operation must not load bundle'); }
    });
    assert.equal(inspection.decision, 'allow', command);
    assert.equal(inspection.scope, 'none', command);
    assert.deepEqual(inspection.checks, [], command);
    assert.equal(git(repository, ['rev-parse', 'HEAD']).trim(), base);
  }
});

test('commit cleanup that can remove a valid title holds for literal and file messages', async t => {
  const { directory, repository, options } = await fixture(t);
  const message = 'fix: 처리를 수정한다\n\ninvalid';
  const messagePath = join(directory, 'message.txt');
  await writeFile(messagePath, message);
  git(repository, ['config', '--local', 'core.commentChar', 'f']);
  for (const source of ['literal', 'file']) await t.test(source, async () => {
    git(repository, ['config', '--local', 'commit.cleanup', 'whitespace']);
    const command = 'git commit --allow-empty --cleanup=strip ' + (source === 'literal'
      ? "-m '" + message + "'" : "--file '" + messagePath + "'");
    const inspection = await evaluateNativeCall('Bash', { command }, options);
    git(repository, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '--quiet', '--allow-empty', '--cleanup=strip', ...(source === 'literal' ? ['-m', message] : ['--file', messagePath])]);
    assert.equal(git(repository, ['log', '-1', '--format=%B']), 'invalid\n\n');
    assertInspectedOrHeld(inspection, command);
  });
});

test('effective commit cleanup config holds unsafe modes and permits explicit safe overrides', async t => {
  const { repository, options } = await fixture(t);
  git(repository, ['config', '--local', 'core.commentChar', 'f']);
  const command = "git commit --allow-empty -m 'fix: 처리를 수정한다\n\ninvalid'";
  for (const cleanup of ['strip', 'scissors', 'invalid-mode']) await t.test(cleanup, async () => {
    git(repository, ['config', '--local', 'commit.cleanup', cleanup]);
    assertInspectedOrHeld(await evaluateNativeCall('Bash', { command }, options), command + ' with commit.cleanup=' + cleanup);
    for (const safe of ['default', 'whitespace', 'verbatim']) {
      const result = await evaluateNativeCall('Bash', { command: command + ' --cleanup=' + safe }, options);
      assert.equal(result.decision, 'allow', safe + ': ' + JSON.stringify(result));
      assert.equal(result.inspection, 'checked');
    }
  });
  for (const cleanup of ['default', 'whitespace', 'verbatim']) {
    git(repository, ['config', '--local', 'commit.cleanup', cleanup]);
    const result = await evaluateNativeCall('Bash', { command }, options);
    assert.equal(result.decision, 'allow', cleanup + ': ' + JSON.stringify(result));
    assert.equal(result.inspection, 'checked');
  }
});

test('a help token consumed as a commit message or repository option value remains a candidate', async t => {
  const { options } = await fixture(t);
  for (const command of [
    'git commit --allow-empty -m --help',
    'git commit --allow-empty -m -h',
    'git commit --allow-empty --message --help',
    'gh repo create Bad_Name --description --help',
    'gh repo create -- --help'
  ]) assertInspectedOrHeld(await evaluateNativeCall('Bash', { command }, options), command);
  const description = await evaluateNativeCall('Bash', { command: 'gh repo edit owner/example-api --description --help' }, options);
  assert.equal(description.inspection, 'checked');
  assert.equal(description.checks[0].check, 'description');
  assert.equal(description.checks[0].observed.find(item => item.kind === 'text')?.digestOrOid,
    createHash('sha256').update('--help').digest('hex'));
});

test('escaped governance command words hold while literal mentions and ordinary queries remain outside coverage', async () => {
  for (const [tool, command] of [
    ['powershell', 'gh repo cr`eate Bad_Name'],
    ['powershell', 'git com`mit --allow-empty -m invalid'],
    ['Bash', 'gh repo cr\\eate Bad_Name'],
    ['Bash', 'git com\\mit --allow-empty -m invalid']
  ]) {
    const result = await evaluateNativeCall(tool, { command }, { bundlePath: 'missing-bundle.json' });
    assert.equal(result.decision, 'needs-context', command + ': ' + JSON.stringify(result));
    assert.deepEqual(result.checks, [], command);
  }
  for (const command of [
    'Write-Output "gh repo cr`eate Bad_Name"',
    'echo "gh repo cr\\eate Bad_Name"',
    'git --no-pager log --grep commit',
    'git --no-pager branch --list',
    'git --no-pager branch --show-current',
    'git --no-pager branch -d old-branch',
    'git commit --help', 'git commit -h',
    'gh repo create --help', 'gh repo edit --help',
    'gh repo rename inventory-api --help'
  ]) {
    const result = await evaluateNativeCall('Bash', { command }, { get bundlePath() { throw Error('query must not load bundle'); } });
    assert.equal(result.decision, 'allow', command);
    assert.equal(result.scope, 'none', command);
    assert.deepEqual(result.checks, [], command);
  }
});

test('native hook protocols deny the ordinary spellings that formerly escaped inspection', async t => {
  const { repository, options } = await fixture(t);
  for (const harness of ['codex', 'claude-code']) {
    for (const command of [
      'git --no-pager branch Bad_Global',
      'git switch --create=Bad_Equals',
      'git checkout -bBad_Compact',
      'git switch --cre=Bad_Abbreviated',
      'git checkout --orph=Bad_Orphan',
      'git switch -qcBad_Combined',
      'git checkout -qbBad_CombinedCheckout',
      'git commit --allow-empty -m --help'
    ]) {
      const response = JSON.parse(execFileSync(process.execPath, [hookPath, '--harness', harness, '--bundle', bundlePath, '--product', options.productPath], {
        encoding: 'utf8', windowsHide: true, env: cleanEnvironment,
        input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: repository, tool_name: 'Bash', tool_input: { command } })
      }));
      assert.equal(response.hookSpecificOutput?.permissionDecision, 'deny', harness + ': ' + command + ': ' + JSON.stringify(response));
    }
  }
});

test('editing a README and its link target together runs only the path check', async t => {
  const { repository, options } = await fixture(t);
  const guide = join(repository, 'docs/guide.md');
  await writeFile(guide, '# 안내\n\n사용 방법입니다.\n');
  const update = '*** Update File: README.md\n@@\n-입력한 가격을 확인합니다.\n+[사용 방법](docs/guide.md#안내)을 확인합니다.\n';
  const deleteTarget = await evaluateNativeCall('apply_patch', { patch: '*** Begin Patch\n' + update + '*** Delete File: docs/guide.md\n*** End Patch' }, options);
  assert.equal(deleteTarget.decision, 'allow', JSON.stringify(deleteTarget));
  assert.deepEqual(deleteTarget.checks.map(check => check.check), ['file-scope']);
  const changeAnchor = await evaluateNativeCall('apply_patch', { patch: '*** Begin Patch\n*** Update File: docs/guide.md\n@@\n-# 안내\n+# 변경\n' + update + '*** End Patch' }, options);
  assert.equal(changeAnchor.decision, 'allow', JSON.stringify(changeAnchor));
  const movedTarget = await evaluateNativeCall('apply_patch', { patch: '*** Begin Patch\n*** Update File: docs/guide.md\n*** Move to: docs/moved.md\n@@\n-사용 방법입니다.\n+현재 사용 방법입니다.\n' + update + '*** End Patch' }, options);
  assert.equal(movedTarget.decision, 'allow', JSON.stringify(movedTarget));
  const addTarget = await evaluateNativeCall('apply_patch', { patch: '*** Begin Patch\n*** Add File: docs/new.md\n+# 안내\n+\n+사용 방법입니다.\n' + update.replace('docs/guide.md', 'docs/new.md') + '*** End Patch' }, options);
  assert.equal(addTarget.decision, 'allow', JSON.stringify(addTarget));
  const unrelated = await evaluateNativeCall('apply_patch', { patch: '*** Begin Patch\n' + update + '*** Add File: source.mjs\n+export const price = 1;\n*** End Patch' }, options);
  assert.equal(unrelated.decision, 'allow', JSON.stringify(unrelated));
  assert.equal(await readFile(join(repository, 'README.md'), 'utf8'), content);
  assert.equal(await readFile(guide, 'utf8'), '# 안내\n\n사용 방법입니다.\n');
  await assert.rejects(access(join(repository, 'docs/new.md')), { code: 'ENOENT' });
  await assert.rejects(access(join(repository, 'docs/moved.md')), { code: 'ENOENT' });
  await assert.rejects(access(join(repository, 'source.mjs')), { code: 'ENOENT' });
});

test('staged nested README and link targets use final index bytes and paths', async t => {
  const { repository, options } = await fixture(t);
  const nested = join(repository, 'docs/README.md');
  const guide = join(repository, 'docs/guide.md');
  const linked = '# 안내\n\n실제 안내입니다.\n';
  const draft = '# 다음 안내\n\n## 작업 중\n';
  const committed = content + '\n[사용 방법](guide.md#안내)을 확인합니다.\n';
  const check = () => evaluateNativeCall('Bash', { command: 'git commit -m "docs: 사용 방법을 덧붙인다"' }, options);
  await writeFile(nested, committed);
  await writeFile(guide, linked);
  await writeFile(join(repository, 'guide.md'), linked);
  git(repository, ['add', '--', 'docs/README.md', 'guide.md']);

  const unstaged = await check();
  assert.equal(unstaged.decision, 'deny', JSON.stringify(unstaged));
  assert.ok(unstaged.findings.some(item => item.ruleId === 'K3' && item.code === 'link-missing'));

  git(repository, ['add', '-N', '--', 'docs/guide.md']);
  const intent = await check();
  assert.equal(intent.decision, 'deny', JSON.stringify(intent));
  assert.ok(intent.findings.some(item => item.ruleId === 'K3' && item.code === 'link-missing'));

  git(repository, ['add', '--', 'docs/guide.md']);
  await writeFile(nested, draft);
  await writeFile(guide, '# 변경\n\n다음 변경입니다.\n');
  const originalIndex = git(repository, ['ls-files', '--stage']);
  const staged = await check();
  assert.equal(staged.decision, 'allow', JSON.stringify(staged));
  assert.deepEqual(staged.checks.map(item => item.check), ['commit-message', 'file-scope', 'readme']);
  assert.deepEqual(staged.checks[1].observed.find(item => item.kind === 'index'), staged.checks[2].observed.find(item => item.kind === 'index'));
  assert.equal(git(repository, ['ls-files', '--stage']), originalIndex);
  assert.equal(await readFile(nested, 'utf8'), draft);

  git(repository, ['add', '--', 'docs/guide.md']);
  await writeFile(guide, linked);
  const wrongAnchor = await check();
  assert.equal(wrongAnchor.decision, 'deny', JSON.stringify(wrongAnchor));
  assert.ok(wrongAnchor.findings.some(item => item.ruleId === 'K3' && item.code === 'linked-anchor'));

  git(repository, ['rm', '--force', '--cached', '--', 'docs/guide.md']);
  const removed = await check();
  assert.equal(removed.decision, 'deny', JSON.stringify(removed));
  assert.ok(removed.findings.some(item => item.ruleId === 'K3' && item.code === 'link-missing'));
  assert.equal(await readFile(guide, 'utf8'), linked);
});

test('commit and amend check changed staged README content before the working copy', async t => {
  const { repository, options } = await fixture(t);
  const path = join(repository, 'README.md');
  const draft = '# 가격 도구\n\n## 빈 절\n';
  const message = 'docs: 시작 절차를 보강한다';
  await writeFile(path, draft);
  git(repository, ['add', '--', 'README.md']);
  await writeFile(path, content);
  const normal = await evaluateNativeCall('Bash', { command: `git commit -m "${message}"` }, options);
  assert.equal(normal.decision, 'deny', JSON.stringify(normal));
  assert.ok(normal.findings.some(item => item.ruleId === 'K3' && item.code === 'empty-section'));

  git(repository, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', message]);
  const current = await evaluateNativeCall('Bash', { command: 'git commit --amend --no-edit' }, options);
  assert.equal(current.decision, 'deny', JSON.stringify(current));
  assert.ok(current.findings.some(item => item.ruleId === 'K3' && item.code === 'empty-section'));
  const unrelated = await evaluateNativeCall('Bash', { command: `git commit --allow-empty -m "${message}"` }, options);
  assert.equal(unrelated.decision, 'allow', JSON.stringify(unrelated));
  assert.deepEqual(unrelated.checks.map(item => item.check), ['commit-message', 'file-scope']);

  git(repository, ['rm', '--cached', '--', 'README.md']);
  const deletion = await evaluateNativeCall('Bash', { command: `git commit -m "${message}"` }, options);
  assert.equal(deletion.decision, 'allow', JSON.stringify(deletion));
  assert.deepEqual(deletion.checks.map(item => item.check), ['commit-message', 'file-scope']);

  await writeFile(path, content + '\n## 예시\n\n입력 예를 확인합니다.\n');
  git(repository, ['add', '--', 'README.md']);
  await writeFile(path, draft);
  const fixed = await evaluateNativeCall('Bash', { command: 'git commit --amend --no-edit' }, options);
  assert.equal(fixed.decision, 'allow', JSON.stringify(fixed));
});

test('deleting a redundant README checks its removal without inventing empty future contents', async t => {
  const { repository, options } = await fixture(t);
  const nested = join(repository, 'docs/README.md');
  const original = '# 추가 안내\n\n루트 안내로 통합했습니다.\n';
  await writeFile(nested, original);
  const result = await evaluateNativeCall('apply_patch', { patch: '*** Begin Patch\n*** Delete File: docs/README.md\n*** End Patch' }, options);
  assert.equal(result.decision, 'allow', JSON.stringify(result));
  assert.deepEqual(result.checks.map(check => check.check), ['file-scope']);
  assert.ok(result.checks[0].semanticChecks.length);
  assert.equal(result.findings.some(item => item.code === 'readme-title'), false);
  assert.equal(await readFile(nested, 'utf8'), original);
  assert.equal(await readFile(join(repository, 'README.md'), 'utf8'), content);
});

test('direct GitHub README publication validates the named remote commit and incoming text', async t => {
  const { repository, options } = await fixture(t);
  const repositoryFullName = 'owner/project';
  const branch = 'feature/docs';
  const guide = join(repository, 'docs/guide.md');
  git(repository, ['remote', 'add', 'origin', 'https://github.com/' + repositoryFullName + '.git']);
  await writeFile(guide, '# 안내\n\n공유하는 사용 방법입니다.\n');
  git(repository, ['add', '--', 'docs/guide.md']);
  git(repository, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'docs: 공유 사용 방법을 적는다']);
  const remoteHead = git(repository, ['rev-parse', 'HEAD']).trim();
  const currentBlob = git(repository, ['rev-parse', 'HEAD:README.md']).trim();
  const baseUrl = 'https://api.github.com/repos/' + repositoryFullName + '/git/';
  const inspectOptions = {
    ...options,
    queryPrRef: async (repository, ref) => {
      assert.equal(repository, repositoryFullName);
      assert.equal(ref, 'refs/heads/' + branch);
      return { ref, url: baseUrl + ref, object: { type: 'commit', sha: remoteHead, url: baseUrl + 'commits/' + remoteHead } };
    },
    queryDefaultBranch: async repository => {
      assert.equal(repository, repositoryFullName);
      return { nameWithOwner: repositoryFullName, defaultBranchRef: { name: branch } };
    }
  };
  const create = input => evaluateNativeCall('mcp__codex_apps__github_create_file', { repository_full_name: repositoryFullName,
    path: 'docs/README.md', content: content + '\n[현재 안내](README.md#사용)와 [자세한 사용 방법](guide.md#안내)을 확인합니다.\n',
    message: 'docs: 사용 방법을 보강한다', branch, ...input }, inspectOptions);
  await writeFile(guide, '# 다음 수정\n\n아직 보내지 않은 작업입니다.\n');
  git(repository, ['add', '--', 'docs/guide.md']);
  git(repository, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'docs: 로컬에서 안내를 다듬는다']);
  const localHead = git(repository, ['rev-parse', 'HEAD']).trim();
  assert.notEqual(localHead, remoteHead);
  const valid = await create({ branch: null });
  assert.equal(valid.decision, 'allow', JSON.stringify(valid));
  assert.deepEqual(valid.checks.map(item => item.check), ['commit-message', 'file-scope', 'readme']);

  await writeFile(join(repository, 'docs/draft-only.md'), '# 임시 안내\n\n아직 보내지 않은 작업입니다.\n');
  const broken = await create({ content: content + '\n[임시 안내](draft-only.md)을 확인합니다.\n' });
  assert.equal(broken.decision, 'deny', JSON.stringify(broken));
  assert.ok(broken.findings.some(item => item.ruleId === 'K3' && item.code === 'link-missing'));
  const malformed = await create({ content: '# 새 안내\n\n## 빈 절\n' });
  assert.equal(malformed.decision, 'deny', JSON.stringify(malformed));
  assert.ok(malformed.findings.some(item => item.ruleId === 'K3' && item.code === 'empty-section'));
  const invalidCommit = await create({ message: 'updated' });
  assert.equal(invalidCommit.decision, 'deny', JSON.stringify(invalidCommit));
  assert.ok(invalidCommit.findings.some(item => item.ruleId === 'K4'));

  const update = sha => evaluateNativeCall('mcp__codex_apps__github_update_file', {
    repository_full_name: repositoryFullName, path: 'README.md', content, message: 'docs: 기존 안내를 갱신한다', branch, sha
  }, inspectOptions);
  assert.equal((await update(currentBlob)).decision, 'allow');
  assert.equal((await update('0'.repeat(currentBlob.length))).decision, 'needs-context');
  assert.equal((await create({ path: 'README.md' })).decision, 'needs-context');
  const wrongRepo = await create({ repository_full_name: 'other/project' });
  assert.equal(wrongRepo.decision, 'needs-context', JSON.stringify(wrongRepo));
  assert.deepEqual(wrongRepo.checks, []);
  await product(options.productPath, [{ path: 'docs/README.md', purpose: '개인 시험용 출력', lifetime: '작업 종료까지' }]);
  const outputBoundary = await create({});
  assert.equal(outputBoundary.decision, 'deny', JSON.stringify(outputBoundary));
  assert.ok(outputBoundary.findings.some(item => item.ruleId === 'K7'));

  assert.equal(git(repository, ['rev-parse', 'HEAD']).trim(), localHead);
  await assert.rejects(access(join(repository, 'docs/README.md')), { code: 'ENOENT' });
});

test('raw GitHub file and tree updates hold when an actual publication candidate is unavailable', async t => {
  const { options } = await fixture(t);
  for (const operation of ['push_files', 'create_blob', 'create_tree', 'create_commit', 'update_ref', 'delete_file']) {
    const result = await evaluateNativeCall('mcp__codex_apps__github_' + operation, { repository_full_name: 'owner/project' }, options);
    assert.equal(result.decision, 'needs-context', operation);
    assert.deepEqual(result.checks, []);
  }
  for (const command of ['gh api --method=PUT repos/owner/project/contents/README.md', 'gh api -XPATCH repos/owner/project/git/refs/heads/main',
    'gh api repos/owner/project/contents/README.md --input payload.json']) {
    const result = await evaluateNativeCall('Bash', { command }, options);
    assert.equal(result.decision, 'needs-context', command);
    assert.deepEqual(result.checks, []);
  }
});

function childInspection(repository, input, environment, inspectIndex = false, directProductPath) {
  const source = `
    import { readFileSync } from 'node:fs';
    const payload = JSON.parse(readFileSync(0, 'utf8'));
    const { evaluateNativeCall } = await import(payload.adapter);
    const before = JSON.stringify(process.env);
    const result = await evaluateNativeCall('Write', payload.input, payload.options);
    let direct;
    if (payload.inspectIndex) {
      const { runCheck } = await import(payload.checker);
      direct = JSON.parse((await runCheck(JSON.stringify({schemaVersion:3,operation:'check',check:'file-scope',sources:[{kind:'index'}],context:{...payload.options,productPath:payload.directProductPath}}))).line);
    }
    process.stdout.write(JSON.stringify({result, direct, environmentPreserved:JSON.stringify(process.env) === before}));
  `;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', source], {
    encoding: 'utf8', windowsHide: true, env: { ...cleanEnvironment, ...environment },
    input: JSON.stringify({
      adapter: pathToFileURL(join(root, 'skills/repo-governance/scripts/tool-call.mjs')).href,
      checker: pathToFileURL(join(root, 'skills/repo-governance/scripts/check.mjs')).href,
      input, options: { repository, bundlePath }, inspectIndex, directProductPath
    })
  }));
}

test('native file checks keep nested product policy and Git paths on the same selected repository', async t => {
  const { directory, repository } = await fixture(t);
  git(directory, ['init', '--quiet']);
  await mkdir(join(repository, 'local'));
  await writeFile(join(repository, '.gitignore'), 'local/\n');
  const file = join(repository, 'local/output.txt');
  await writeFile(file, 'tracked output\n');
  git(repository, ['add', '-f', 'local/output.txt']);
  const boundPath = resolve(git(repository, ['rev-parse', '--path-format=absolute', '--git-path', 'repo-governance/product.json']).trim());
  await product(boundPath, [{ path: 'local', purpose: '검사 출력', lifetime: '작업 종료까지' }]);
  const oid = git(directory, ['hash-object', '-w', file]).trim();
  git(directory, ['update-index', '--add', '--cacheinfo', '100644,' + oid + ',product/local/output.txt']);
  const input = { file_path: 'local/output.txt', content: 'replacement' };
  for (const environment of [{}, { GIT_DIR: join(directory, '.git'), GIT_WORK_TREE: directory }]) {
    const response = childInspection(repository, input, environment);
    assert.equal(response.result.decision, 'deny', JSON.stringify(response));
    assert.ok(response.result.findings.some(item => item.code === 'tracked-output'));
    assert.deepEqual(response.result.checks[0].observed.filter(item => item.kind === 'product').map(item => item.target), [boundPath]);
    assert.equal(response.environmentPreserved, true);
  }
  assert.equal(git(repository, ['ls-files', '--', 'local/output.txt']), 'local/output.txt\n');
  assert.equal(await readFile(file, 'utf8'), 'tracked output\n');
});

test('native file inspection ignores an inherited alternate index without changing direct checker index selection', async t => {
  const { directory, repository } = await fixture(t);
  await mkdir(join(repository, 'local'));
  await writeFile(join(repository, '.gitignore'), 'local/\n');
  await writeFile(join(repository, 'local/output.txt'), 'tracked output\n');
  git(repository, ['add', '-f', 'local/output.txt']);
  const boundPath = resolve(git(repository, ['rev-parse', '--path-format=absolute', '--git-path', 'repo-governance/product.json']).trim());
  await product(boundPath, [{ path: 'local', purpose: '검사 출력', lifetime: '작업 종료까지' }]);
  const alternateIndex = join(directory, 'alternate.index');
  const environment = { GIT_INDEX_FILE: alternateIndex };
  git(repository, ['read-tree', 'HEAD'], environment);
  const response = childInspection(repository, { file_path: 'local/output.txt', content: 'replacement' }, environment, true, boundPath);
  assert.equal(response.result.decision, 'deny', JSON.stringify(response));
  assert.ok(response.result.findings.some(item => item.code === 'tracked-output'));
  assert.equal(response.direct.decision, 'pass', JSON.stringify(response.direct));
  assert.deepEqual(response.direct.observed.filter(item => item.kind === 'index').map(item => item.target), [await realpath(alternateIndex)]);
  assert.equal(response.environmentPreserved, true);
  assert.equal(git(repository, ['ls-files', '--', 'local/output.txt']), 'local/output.txt\n');
});
