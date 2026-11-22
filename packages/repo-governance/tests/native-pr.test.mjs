import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { evaluateNativeCall as inspectNativeCall } from '../plugin/skills/repo-governance/scripts/tool-call.mjs';

const bundlePath = fileURLToPath(new URL('../plugin/skills/repo-governance/assets/bundle.json', import.meta.url));
const evaluateNativeCall = (tool, input, options = {}) => inspectNativeCall(tool, input, { bundlePath, ...options });

const body = '## 배경\n문제다.\n## 변경 내용\n변경했다.\n## 검증\n계정이 없어 미실행했다.\n## 영향\n인증이 바뀐다.';
const current = { number: 4, headRefOid: 'a'.repeat(40), baseRefOid: 'b'.repeat(40), title: 'Prevent token reuse', body, url: 'https://github.com/owner/project/pull/4' };
const currentRetarget = { ...current, state: 'OPEN', isCrossRepository: false, headRefName: 'feature', baseRefName: 'staging' };
const newBaseOid = 'c'.repeat(40);
const nativeTool = 'mcp__codex_apps__github_update_pull_request';
const identity = { repository_full_name: 'owner/project', pr_number: 4 };
const digest = text => createHash('sha256').update(text).digest('hex');
const execute = promisify(execFile);
const native = (changes, options = {}) => evaluateNativeCall(nativeTool, { ...identity, ...changes }, { queryPullRequest: async () => current, ...options });

const baseRef = branch => ({
  ref: 'refs/heads/' + branch,
  url: 'https://api.github.com/repos/owner/project/git/refs/heads/' + branch.split('/').map(encodeURIComponent).join('/'),
  object: { type: 'commit', sha: newBaseOid, url: 'https://api.github.com/repos/owner/project/git/commits/' + newBaseOid }
});

function retargetOptions(branch) {
  return {
    queryPullRequest: async (repository, number) => {
      assert.equal(repository, identity.repository_full_name);
      assert.equal(number, identity.pr_number);
      return currentRetarget;
    },
    queryPrRef: async (repository, ref) => {
      assert.equal(repository, identity.repository_full_name);
      assert.equal(ref, 'refs/heads/' + branch);
      return baseRef(branch);
    }
  };
}

function assertRetargetCandidate(result, decision) {
  assert.equal(result.decision, decision);
  assert.equal(result.inspection, 'checked');
  assert.equal(result.checks.length, 1);
  const [check] = result.checks;
  assert.equal(check.check, 'pull-request');
  assert.equal(check.observed.find(item => item.kind === 'pr-head')?.digestOrOid, current.headRefOid);
  assert.equal(check.observed.find(item => item.kind === 'pr-base')?.digestOrOid, newBaseOid);
  return check;
}

test('지원하지 않는 호스트는 두 경로 모두 조회 전에 보류하고 지원 호스트는 검사한다', async () => {
  const hadHost = Object.hasOwn(process.env, 'GH_HOST');
  const originalHost = process.env.GH_HOST;
  try {
    for (const host of ['enterprise.example.invalid', undefined, '', 'github.com', 'GitHub.COM']) {
      if (host === undefined) delete process.env.GH_HOST;
      else process.env.GH_HOST = host;
      const unsupported = host === 'enterprise.example.invalid';
      for (const [tool, input] of [
        ['exec_command', { cmd: 'gh pr edit 4 -R owner/project -t "Repair inspection"' }],
        [nativeTool, { ...identity, title: 'Repair inspection' }]
      ]) {
        let queries = 0;
        const result = await evaluateNativeCall(tool, input, { queryPullRequest: async () => { queries++; return current; } });
        assert.equal(result.decision, unsupported ? 'needs-context' : 'allow', tool + ' ' + String(host));
        assert.equal(queries, unsupported ? 0 : 1);
        if (unsupported) {
          assert.equal(result.inspection, 'missing-input');
          assert.deepEqual(result.checks, []);
        } else assert.equal(result.checks[0].check, 'pull-request');
      }
    }
  } finally {
    if (hadHost) process.env.GH_HOST = originalHost;
    else delete process.env.GH_HOST;
  }
  assert.equal(Object.hasOwn(process.env, 'GH_HOST'), hadHost);
  assert.equal(process.env.GH_HOST, originalHost);
});

test('제목만 수정할 때 조회한 본문과 전체 OID로 공통 검사를 실행한다', async () => {
  let queries = 0;
  const result = await evaluateNativeCall('exec_command', { cmd: 'gh pr edit 4 --repo owner/project --title "Repair metadata inspection"' }, {
    queryPullRequest: async () => { queries++; return current; }
  });
  assert.equal(result.decision, 'allow');
  assert.equal(queries, 1);
  assert.equal(result.checks[0].check, 'pull-request');
  assert.ok(result.checks[0].observed.some(item => item.kind === 'pr-head' && item.digestOrOid === current.headRefOid));
});

test('제목과 본문의 단독 및 동시 수정은 생략한 조회 원문을 보존한다', async () => {
  const original = { ...current, title: 'Original title', body: body.replaceAll('\n', '\r\n') + '\r\n' };
  for (const changes of [{ title: 'Repair inspection' }, { body: body + '\n검증을 보강했다.' }, { title: 'Repair inspection', body }]) {
    const result = await native(changes, { queryPullRequest: async (repository, number) => {
      assert.equal(repository, 'owner/project');
      assert.equal(number, 4);
      return original;
    } });
    assert.equal(result.decision, 'allow');
    for (const field of ['title', 'body']) {
      assert.ok(result.checks[0].observed.some(item => item.kind === 'pr-' + field && item.digestOrOid === digest(Object.hasOwn(changes, field) ? changes[field] : original[field])));
    }
    assert.ok(result.checks[0].semanticChecks.length > 0);
    assert.equal(Object.hasOwn(result, 'approved'), false);
  }
  for (const [tool, input] of [
    ['mcp__github__update_pull_request', { owner: 'owner', repo: 'project', pull_number: 4, title: 'Repair inspection' }],
    ['mcp__github__update_pull_request', { owner: 'owner', repo: 'project', pullNumber: 4, body }]
  ]) assert.equal((await evaluateNativeCall(tool, input, { queryPullRequest: async () => current })).decision, 'allow');
});

test('대상 브랜치 변경은 리터럴 CLI와 구조화 호출에서 실제 새 base OID를 검사한다', async () => {
  for (const [tool, input, branch, title] of [
    ['exec_command', { cmd: 'gh pr edit 4 --repo owner/project --base main' }, 'main', current.title],
    ['exec_command', { cmd: 'gh pr edit 4 -R owner/project -B release/next -t Retarget' }, 'release/next', 'Retarget'],
    [nativeTool, { ...identity, base_branch: 'main' }, 'main', current.title],
    ['mcp__github__update_pull_request', { owner: 'owner', repo: 'project', pullNumber: 4, base: 'release/next' }, 'release/next', current.title]
  ]) {
    const result = await evaluateNativeCall(tool, input, retargetOptions(branch));
    const check = assertRetargetCandidate(result, 'allow');
    assert.equal(check.observed.find(item => item.kind === 'pr-title')?.digestOrOid, digest(title));
    assert.equal(check.observed.find(item => item.kind === 'pr-body')?.digestOrOid, digest(body));
  }
});

test('대상과 함께 바꾼 본문 파일을 검사하고 잘못된 본문은 K6에서 거절한다', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'native-pr-retarget-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'body.md');
  const editedBody = body.replaceAll('\n', '\r\n') + '\r\n검증 근거를 보강했다.\r\n';
  await writeFile(path, editedBody);
  const edited = await evaluateNativeCall('exec_command', {
    cmd: 'gh pr edit 4 -R owner/project --base main --body-file body.md', workdir: directory
  }, retargetOptions('main'));
  const check = assertRetargetCandidate(edited, 'allow');
  assert.equal(check.observed.find(item => item.kind === 'pr-body')?.digestOrOid, digest(editedBody));
  assert.equal(await readFile(path, 'utf8'), editedBody);

  const invalid = await native({ base_branch: 'main', body: 'TODO' }, retargetOptions('main'));
  assertRetargetCandidate(invalid, 'deny');
  assert.ok(invalid.findings.some(item => item.ruleId === 'K6' && item.code === 'placeholder'));
});

test('닫힌 PR과 fork 및 현재 head를 대상으로 하는 변경은 보류한다', async () => {
  for (const replacement of [
    { state: 'CLOSED' }, { state: 'MERGED' }, { state: undefined }, { isCrossRepository: true },
    { isCrossRepository: undefined }, { headRefName: 'main' }, { headRefName: null }, { baseRefName: undefined }
  ]) {
    const result = await native({ base_branch: 'main' }, {
      ...retargetOptions('main'), queryPullRequest: async () => ({ ...currentRetarget, ...replacement })
    });
    assert.equal(result.decision, 'needs-context', JSON.stringify(replacement));
    assert.deepEqual(result.checks, []);
  }
});

test('새 대상 ref의 저장소와 이름 및 전체 commit OID를 확인할 수 없으면 보류한다', async () => {
  const target = baseRef('main');
  for (const response of [
    null, [], { ...target, ref: 'refs/heads/Main' }, { ...target, ref: 'refs/tags/main' },
    { ...target, url: target.url.replace('/owner/', '/other/') },
    { ...target, object: { ...target.object, type: 'tag' } }, { ...target, object: { ...target.object, sha: newBaseOid.slice(1) } },
    { ...target, object: { ...target.object, url: target.object.url.replace('/owner/', '/other/') } }
  ]) {
    const result = await native({ base_branch: 'main' }, { ...retargetOptions('main'), queryPrRef: async () => response });
    assert.equal(result.decision, 'needs-context');
    assert.deepEqual(result.checks, []);
  }
  for (const code of ['NOT_FOUND', 'ETIMEDOUT']) {
    const result = await native({ base_branch: 'main' }, {
      ...retargetOptions('main'), queryPrRef: async () => { throw Object.assign(new Error('private ref lookup detail'), { code }); }
    });
    assert.equal(result.decision, 'needs-context');
    assert.deepEqual(result.checks, []);
    assert.doesNotMatch(JSON.stringify(result), /private ref lookup detail|NOT_FOUND|ETIMEDOUT/);
  }
});

test('명시한 빈값과 규약을 어긴 본문은 공통 검사에서 거절한다', async () => {
  for (const changes of [{ title: '' }, { body: 'TODO' }, { title: 'Repair\nextra' }, { body: body.replace('변경했다.', '<실행한 확인과 실제 결과>') }]) {
    const result = await native(changes);
    assert.equal(result.decision, 'deny');
    assert.equal(result.checks[0].decision, 'violation');
    assert.equal(result.checks[0].check, 'pull-request');
  }
  for (const option of ['--title=""', '-t ""']) {
    const result = await evaluateNativeCall('exec_command', { cmd: 'gh pr edit 4 -R owner/project ' + option }, { queryPullRequest: async () => current });
    assert.equal(result.decision, 'deny');
    assert.equal(result.inspection, 'checked');
  }
  const concise = await native({ body: '입력 검사를 보강했다. 실패 후 재시도가 통과하는지 확인했다.' });
  assert.equal(concise.decision, 'allow', JSON.stringify(concise));
});

test('본문 파일은 BOM을 포함하는 원문을 검사하고 그대로 보존한다', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'native-pr-body-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'body.md');
  for (const prefix of ['', '\uFEFF']) {
    const bytes = prefix + body.replaceAll('\n', '\r\n') + '\r\n';
    await writeFile(path, bytes);
    for (const option of ['--body-file body.md', '-F body.md', '--body-file=body.md']) {
      const result = await evaluateNativeCall('exec_command', { cmd: 'gh pr edit 4 --repo owner/project -t "Repair inspection" ' + option, workdir: directory }, { queryPullRequest: async () => current });
      assert.equal(result.decision, 'allow', JSON.stringify(result));
      assert.ok(result.checks[0].observed.some(item => item.kind === 'pr-body' && item.digestOrOid === digest(bytes)));
      assert.equal(await readFile(path, 'utf8'), bytes);
    }
  }
  await writeFile(path, 'TODO');
  assert.equal((await evaluateNativeCall('exec_command', { cmd: 'gh pr edit 4 -R owner/project -F body.md', cwd: directory }, { queryPullRequest: async () => current })).decision, 'deny');
  await writeFile(join(directory, 'invalid.md'), Buffer.from([0xff]));
  for (const option of ['-F missing.md', '-F .', '-F invalid.md', '-F -', '--body-file=""']) {
    let queries = 0;
    const result = await evaluateNativeCall('exec_command', { cmd: 'gh pr edit 4 -R owner/project ' + option }, { repository: directory, queryPullRequest: async () => { queries++; return current; } });
    assert.equal(result.decision, 'needs-context', option);
    assert.equal(queries, 0, option);
    assert.deepEqual(result.checks, []);
  }
});

test('조회 저장소와 번호 및 전체 OID가 일치하지 않으면 검사 자료를 만들지 않는다', async () => {
  for (const replacement of [
    { url: 'https://github.com/other/project/pull/4' }, { url: 'https://github.com/owner/else/pull/4' },
    { url: 'https://github.com/owner/project/pull/5' }, { url: 'https://github.com.attacker.invalid/owner/project/pull/4' },
    { url: 'https://github.com/owner/project/pull/4?token=secret' }, { url: 'http://github.com/owner/project/pull/4' },
    { number: 5 }, { number: '4' }, { headRefOid: 'HEAD' }, { baseRefOid: 'b'.repeat(39) },
    { headRefOid: null }, { baseRefOid: 'z'.repeat(40) }, { title: null }, { body: null }, { body: 2 }, { title: 'bad\0title' }
  ]) {
    const result = await native({ title: 'Repair inspection' }, { queryPullRequest: async () => ({ ...current, ...replacement }) });
    assert.equal(result.decision, 'needs-context');
    assert.equal(result.scope, 'none');
    assert.deepEqual(result.checks, []);
  }
  const sha256 = await native({ title: 'Repair inspection' }, { queryPullRequest: async () => ({ ...current, headRefOid: 'a'.repeat(64), baseRefOid: 'b'.repeat(64) }) });
  assert.equal(sha256.decision, 'allow');
});

test('불완전한 조회와 조회 예외는 정제한 보류 사유만 반환한다', async () => {
  for (const field of Object.keys(current)) {
    const incomplete = { ...current };
    delete incomplete[field];
    const result = await native({ body }, { queryPullRequest: async () => incomplete });
    assert.equal(result.decision, 'needs-context', field);
    assert.deepEqual(result.checks, []);
  }
  for (const value of [null, [], 'raw secret response']) {
    const result = await native({ body }, { queryPullRequest: async () => value });
    assert.equal(result.decision, 'needs-context');
    assert.doesNotMatch(JSON.stringify(result), /raw secret/);
  }
  for (const code of ['ENOENT', 'ETIMEDOUT', 'AUTHENTICATION_FAILED']) {
    const result = await native({ body }, { queryPullRequest: async () => { throw Object.assign(new Error('ghp_private-token raw stderr'), { code, stderr: 'ghp_private-token' }); } });
    assert.equal(result.decision, 'needs-context');
    assert.deepEqual(result.checks, []);
    assert.doesNotMatch(JSON.stringify(result), /ghp_private-token|raw stderr|AUTHENTICATION_FAILED/);
  }
});

test('지원하지 않는 구조화 작업과 조작된 승인 자료는 조회 전에 보류한다', async () => {
  let queries = 0;
  const options = { queryPullRequest: async () => { queries++; return current; } };
  for (const changes of [
    {}, { title: null }, { body: 1 }, { title: 'bad\0title' }, { title: 'Repair', state: 'closed' },
    { base_branch: 'main', base: 'release/next' }, { base_branch: null }, { base: 1 }, { base: 'bad..ref' }, { body, maintainer_can_modify: true },
    { body, unknown: true }, { body, source: current }, { body, headOid: current.headRefOid },
    { body, approved: true }, { body, repository_full_name: undefined }, { body, repository_full_name: 'owner/project;echo' },
    { body, pr_number: '4' }, { body, pr_number: 0 }, { body, pr_number: Number.MAX_SAFE_INTEGER + 1 }
  ]) {
    const result = await native(changes, options);
    assert.equal(result.decision, 'needs-context');
    assert.deepEqual(result.checks, []);
  }
  for (const operation of ['create_pull_request', 'merge_pull_request', 'convert_pull_request_to_draft', 'mark_pull_request_ready_for_review']) {
    for (const prefix of ['mcp__github__', 'mcp__codex_apps__github_']) {
      assert.equal((await evaluateNativeCall(prefix + operation, { ...identity, title: 'Repair', body }, options)).decision, 'needs-context');
    }
  }
  assert.equal(queries, 0);
});

test('중복 옵션과 동적 및 복합 명령은 조회 전에 차단한다', async () => {
  let queries = 0;
  const options = { queryPullRequest: async () => { queries++; return current; } };
  for (const command of [
    'gh pr create --title Repair', 'gh pr merge 4 -R owner/project', 'gh pr ready 4 -R owner/project',
    'gh pr edit 4 --title Repair', 'gh pr edit --repo owner/project --title Repair',
    'gh pr edit branch --repo owner/project --title Repair', 'gh pr edit 4 -R owner/project',
    'gh pr edit 4 -R owner/project --base main -B release/next', 'gh pr edit 4 -R owner/project --base',
    'gh pr edit 4 -R owner/project --base ""', 'gh pr edit 4 -R owner/project --base "a b"',
    'gh pr edit 4 -R owner/project --base "$TARGET"', 'gh pr edit 4 -R owner/project --state closed',
    'gh pr edit 4 -R owner/project --maintainer-edit', 'gh pr edit 4 -R owner/project --unknown yes',
    'gh pr edit 4 -R owner/project -t Repair --title Again', 'gh pr edit 4 -R owner/project -R other/project -t Repair',
    'gh pr edit 4 -R owner/project -b body --body again', 'gh pr edit 4 -R owner/project -F body.md --body-file other.md',
    'gh pr edit 4 -R owner/project --body literal -F body.md',
    'gh pr edit 4 -R owner/project --title "$TITLE"', 'gh pr edit 4 -R owner/project --title "$(echo secret)"',
    'gh pr edit 4 -R owner/project --title Repair; echo secret', 'gh pr edit 4 -R owner/project --title Repair && echo secret',
    'echo secret | gh pr edit 4 -R owner/project --body-file -', 'gh pr edit 4 -R owner/project --title Repair > log',
    'env gh pr edit 4 -R owner/project --title Repair'
  ]) {
    const result = await evaluateNativeCall('exec_command', { cmd: command }, options);
    assert.equal(result.decision, 'needs-context', command);
    assert.deepEqual(result.checks, []);
  }
  assert.equal(queries, 0);
});

test('PR 별칭은 옵션 위치에서만 적용하고 대시로 시작하는 제목 값은 보존한다', async () => {
  for (const [option, title] of [['-t "-b"', '-b'], ['--title "-F"', '-F'], ['--title=-b', '-b'], ['-t=--body', '--body'], ['--title "--help"', '--help']]) {
    const result = await evaluateNativeCall('exec_command', { cmd: 'gh pr edit 4 -R owner/project ' + option }, { queryPullRequest: async () => current });
    assert.equal(result.decision, 'allow', option);
    assert.ok(result.checks[0].observed.some(item => item.kind === 'pr-title' && item.digestOrOid === digest(title)), option);
  }
});

test('PR 수정 조회는 명시적 인수와 정제 환경 및 4초 제한을 사용한다', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'native-pr-subprocess-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fake = join(directory, 'fake-gh.mjs');
  const runner = join(directory, 'runner.mjs');
  const record = join(directory, 'record.json');
  const moduleUrl = new URL('../plugin/skills/repo-governance/scripts/tool-call.mjs', import.meta.url).href;
  const hookUrl = new URL('../plugin/hooks/run.mjs', import.meta.url).href;
  await writeFile(fake, `
import { writeFileSync } from 'node:fs';
const [mode, record, ...argv] = process.argv.slice(2);
writeFileSync(record, JSON.stringify({ argv, debugKeys: Object.keys(process.env).filter(key => /debug|trace|^NODE_OPTIONS$/i.test(key)), host: process.env.GH_HOST, prompt: process.env.GH_PROMPT_DISABLED }));
if (mode === 'timeout') setTimeout(() => process.stdout.write('after-timeout'), 10000);
else if (mode === 'failure') { process.stderr.write('ghp_test-secret raw stderr'); process.exitCode = 1; }
else if (mode === 'json') process.stdout.write('ghp_test-secret invalid JSON');
else process.stdout.write(${JSON.stringify(JSON.stringify(current))});
`);
  await writeFile(runner, `
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { promisify } from 'node:util';
const original = childProcess.execFile;
const [fake, mode, record, surface] = process.argv.slice(2);
const calls = [];
const scopeProbe = ['-C', process.cwd(), '-c', 'core.fsmonitor=false', 'rev-parse', '--is-inside-work-tree',
  '--path-format=absolute', '--git-path', 'repo-governance/product.json', '--git-common-dir'];
const replacement = (file, args, options, callback) => {
  if (file === 'git' && JSON.stringify(args) === JSON.stringify(scopeProbe)) return original(file, args, options, callback);
  if (file !== 'gh') throw new Error('조회 외 subprocess는 허용하지 않는다.');
  calls.push({ file, args, timeout: options.timeout, windowsHide: options.windowsHide, shell: options.shell ?? false });
  return original(process.execPath, [fake, mode, record, ...args], options, callback);
};
replacement[promisify.custom] = (file, args, options) => new Promise((resolve, reject) => {
  replacement(file, args, options, (error, stdout, stderr) => {
    if (error) reject(Object.assign(error, { stdout, stderr }));
    else resolve({ stdout, stderr });
  });
});
childProcess.execFile = replacement;
syncBuiltinESMExports();
if (surface === 'hook') {
  process.argv = [process.execPath, 'hook', '--harness', 'codex', '--bundle', ${JSON.stringify(bundlePath)}];
  const write = process.stdout.write;
  const chunks = [];
  process.stdout.write = chunk => { chunks.push(String(chunk)); return true; };
  await import(${JSON.stringify(hookUrl)});
  process.stdout.write = write;
  process.stdout.write(JSON.stringify({ hook: JSON.parse(chunks.join('')), calls }));
} else {
  const { evaluateNativeCall } = await import(${JSON.stringify(moduleUrl)});
  const result = surface === 'shell'
    ? await evaluateNativeCall('exec_command', { cmd: 'gh pr edit 4 -R owner/project -t Repair' }, { bundlePath: ${JSON.stringify(bundlePath)} })
    : await evaluateNativeCall(${JSON.stringify(nativeTool)}, { ...${JSON.stringify(identity)}, title: 'Repair inspection' }, { bundlePath: ${JSON.stringify(bundlePath)} });
  process.stdout.write(JSON.stringify({ result, calls }));
}
`);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^REPO_GOVERNANCE_PRODUCT$|^NODE_OPTIONS$/i.test(key)));
  Object.assign(env, { GH_HOST: 'github.com', GH_DEBUG: 'api', DEBUG: '*', NODE_DEBUG: 'http', GIT_TRACE: '1', GH_TRACE: '1', GH_TOKEN: 'ghp_test-secret' });
  for (const [mode, surface] of [['success', 'native'], ['success', 'shell'], ['failure', 'native'], ['json', 'native'], ['timeout', 'native'], ['timeout', 'hook']]) {
    const started = performance.now();
    const pending = execute(process.execPath, [runner, fake, mode, record, surface], { cwd: directory, env, timeout: 10000, windowsHide: true, maxBuffer: 1024 * 1024 });
    pending.child.stdin.end(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: nativeTool, tool_input: { ...identity, title: 'Repair inspection' } }));
    const { stdout, stderr } = await pending;
    if (mode === 'timeout') {
      const elapsed = performance.now() - started;
      assert.ok(elapsed >= 3500 && elapsed < 10000, '지연 조회가 4초 제한으로 10초 안에 보류되어야 한다.');
    }
    assert.equal(stderr, '');
    assert.doesNotMatch(stdout, /ghp_test-secret|raw stderr|after-timeout/);
    const { result, hook, calls } = JSON.parse(stdout);
    if (surface === 'hook') {
      assert.equal(hook.hookSpecificOutput.permissionDecision, 'deny');
      assert.match(hook.hookSpecificOutput.permissionDecisionReason, /Read-only PR lookup failed or timed out/);
    } else assert.equal(result.decision, mode === 'success' ? 'allow' : 'needs-context', JSON.stringify(result));
    assert.deepEqual(calls, [{ file: 'gh', args: ['pr', 'view', '4', '--repo', 'owner/project', '--json', 'number,headRefOid,baseRefOid,title,body,url'], timeout: 4000, windowsHide: true, shell: false }]);
    assert.deepEqual(JSON.parse(await readFile(record, 'utf8')), { argv: calls[0].args, debugKeys: [], host: 'github.com', prompt: '1' });
    if (mode !== 'success' && result) assert.deepEqual(result.checks, []);
  }
});
