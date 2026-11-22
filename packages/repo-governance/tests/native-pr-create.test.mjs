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

const repository = 'owner/project';
const title = 'Inspect pull requests before creation';
const body = '## 배경\n생성 요청이 검사 전에 보류된다.\n## 변경 내용\n생성할 제목과 본문을 검사한다.\n## 검증\n원격 브랜치 조회 자료로 회귀 검사를 실행했다.\n## 영향\n기존 PR 수정 경로도 유지한다.';
const headOid = 'a'.repeat(40);
const baseOid = 'b'.repeat(40);
const nativeTool = 'mcp__codex_apps__github_create_pull_request';
const input = { repository_full_name: repository, head: 'feature', base: 'main', title, body, draft: false };
const digest = value => createHash('sha256').update(value).digest('hex');
const execute = promisify(execFile);
const ref = (branch, sha) => ({
  ref: 'refs/heads/' + branch,
  node_id: 'ref-' + branch,
  url: 'https://api.github.com/repos/' + repository + '/git/refs/heads/' + branch,
  object: { type: 'commit', sha, url: 'https://api.github.com/repos/' + repository + '/git/commits/' + sha }
});

function remoteRefs() {
  return { queryPrCreationRefs: async (requestedRepository, headRef, baseRef) => {
    assert.equal(requestedRepository, repository);
    assert.equal(headRef, 'refs/heads/feature');
    assert.equal(baseRef, 'refs/heads/main');
    return { head: ref('feature', headOid), base: ref('main', baseOid) };
  } };
}

function assertChecked(result, decision) {
  assert.equal(result.decision, decision);
  assert.equal(result.inspection, 'checked');
  assert.equal(result.scope, 'mechanical');
  assert.equal(result.checks.length, 1);
  const check = result.checks[0];
  assert.equal(check.check, 'pull-request');
  assert.ok(check.observed.some(item => item.kind === 'pr-head' && item.digestOrOid === headOid));
  assert.ok(check.observed.some(item => item.kind === 'pr-base' && item.digestOrOid === baseOid));
  assert.doesNotMatch(JSON.stringify(result), /supplied PR #[0-9]+|\/pull\/[0-9]+/);
}

test('명시한 구조화 PR 생성은 조회한 전체 OID로 한 번 검사한다', async () => {
  const result = await evaluateNativeCall(nativeTool, input, remoteRefs());
  assertChecked(result, 'allow');
});

for (const bodyOption of ['--body', '-b']) {
  for (const baseOption of ['--base', '-B']) {
    test('리터럴 PR 생성은 ' + bodyOption + ' 본문과 ' + baseOption + ' 기준을 검사한다', async () => {
      const cmd = 'gh pr create --repo owner/project --head feature ' + baseOption + ' main --title "' + title + '" ' + bodyOption + ' "' + body + '"';
      const result = await evaluateNativeCall('exec_command', { cmd }, remoteRefs());
      assertChecked(result, 'allow');
    });
  }
}

test('PR 생성은 짧은 본문을 허용하고 남은 자리표시자는 K6에서 거절한다', async () => {
  const concise = await evaluateNativeCall(nativeTool, { ...input, body: '저장소 이름 검사를 보강했다. 새 분류와 기존 분류의 판정이 모두 기대대로 나오는지 확인했다.' }, remoteRefs());
  assertChecked(concise, 'allow');
  const result = await evaluateNativeCall(nativeTool, { ...input, body: 'TODO' }, remoteRefs());
  assertChecked(result, 'deny');
  assert.equal(result.checks[0].decision, 'violation');
  assert.ok(result.findings.some(item => item.ruleId === 'K6' && item.code === 'placeholder'));
});

test('별칭과 nullable 부가 필드는 의도를 보존하고 생략한 초안 단계는 false다', async () => {
  for (const aliases of [
    { head: 'feature', base: 'main', head_branch: null, base_branch: null },
    { head: null, base: null, head_branch: 'feature', base_branch: 'main' },
    { head: 'feature', base: null, base_branch: 'main' }
  ]) {
    for (const draft of [undefined, false, true]) {
      const selected = { ...input, ...aliases, issue: null, head_repo: null, maintainer_can_modify: null };
      if (draft === undefined) delete selected.draft;
      else selected.draft = draft;
      const result = await evaluateNativeCall(nativeTool, selected, remoteRefs());
      assertChecked(result, 'allow');
      assert.ok(result.checks[0].observed.some(item => item.kind === 'pr-draft' && item.digestOrOid === digest(JSON.stringify(draft ?? false))));
    }
  }
});

test('비어 있거나 여러 줄인 제목과 구조가 깨진 본문은 조회 뒤 K6에서 거절한다', async () => {
  for (const changes of [{ title: '' }, { body: '```js\nconst value = 1;' }, { title: 'Two\nlines' }, { body: body.replace('생성할 제목과 본문을 검사한다.', '<실행한 확인과 실제 결과>') }]) {
    let queries = 0;
    const options = remoteRefs();
    const result = await evaluateNativeCall(nativeTool, { ...input, ...changes }, { queryPrCreationRefs: async (...args) => {
      queries++;
      return options.queryPrCreationRefs(...args);
    } });
    assertChecked(result, 'deny');
    assert.equal(queries, 1);
    assert.ok(result.findings.every(item => item.ruleId === 'K6'));
  }
});

test('누락과 모호한 별칭 및 추가 효과와 잘못된 ref는 조회 전에 보류한다', async () => {
  let queries = 0;
  const options = { queryPrCreationRefs: async () => { queries++; throw new Error('조회하면 안 된다.'); } };
  const changes = [
    { repository_full_name: undefined }, { repository_full_name: 'owner/project/extra' }, { repository_full_name: 'owner/project;echo' },
    { head: null }, { base: '' }, { title: null }, { body: undefined }, { draft: null }, { draft: 'true' },
    { head_branch: 'feature' }, { base_branch: 'main' }, { issue: 4 }, { head_repo: repository }, { maintainer_can_modify: false },
    { headOid }, { baseOid }, { approved: true }, { source: {} }, { unknown: null }, { pr_number: 4 },
    { head: 'other:feature' }, { head: 'a..b' }, { head: 'a b' }, { head: '.hidden' }, { head: 'feature.lock' },
    { head: 'a@{b' }, { head: 'a\\b' }, { head: 'a/' }, { head: 'a.' }, { head: '-feature' }, { body: 'bad\0body' }
  ];
  for (const change of changes) {
    const result = await evaluateNativeCall(nativeTool, { ...input, ...change }, options);
    assert.equal(result.decision, 'needs-context', JSON.stringify(change));
    assert.deepEqual(result.checks, []);
    assert.equal(result.scope, 'none');
  }
  for (const key of ['repository_full_name', 'head', 'base', 'title', 'body']) {
    const selected = { ...input };
    delete selected[key];
    assert.equal((await evaluateNativeCall(nativeTool, selected, options)).decision, 'needs-context', key);
  }
  assert.equal((await evaluateNativeCall('mcp__github__create_pull_request', { owner: 'owner', repo: 'project', head: 'feature', base: 'main', title, body }, options)).decision, 'needs-context');
  assert.equal(queries, 0);
});

test('슬래시와 인코딩한 Unicode ref 및 같은 head/base도 식별값만 검사한다', async () => {
  for (const [head, base] of [['feature/한글#변경', 'release/next'], ['feature', 'feature']]) {
    const result = await evaluateNativeCall(nativeTool, { ...input, head, base }, { queryPrCreationRefs: async (requested, headRef, baseRef) => {
      assert.equal(requested, repository);
      assert.equal(headRef, 'refs/heads/' + head);
      assert.equal(baseRef, 'refs/heads/' + base);
      const headValue = ref(head, headOid), baseValue = ref(base, baseOid);
      headValue.url = 'https://api.github.com/repos/OWNER/PROJECT/git/refs/heads/' + encodeURIComponent(head);
      baseValue.url = 'https://api.github.com/repos/owner/project/git/refs/heads/' + base.split('/').map(encodeURIComponent).join('/');
      return { head: headValue, base: baseValue };
    } });
    assertChecked(result, 'allow');
    assert.ok(result.checks[0].observed.some(item => item.kind === 'pr-head' && item.target === repository + '@refs/heads/' + head));
  }
});

test('저장소와 정확한 ref 및 commit URL과 전체 OID가 다르면 후보를 만들지 않는다', async () => {
  for (const mutate of [
    value => { value.ref = 'refs/heads/Feature'; },
    value => { value.url = value.url.replace('/owner/', '/other/'); },
    value => { value.url += '?token=ghp_test-secret'; },
    value => { value.url += '#fragment'; },
    value => { value.url = value.url.replace('https://', 'http://'); },
    value => { value.url = value.url.replace('api.github.com', 'api.github.com.attacker.invalid'); },
    value => { value.url = value.url.replace('api.github.com', 'user:ghp_test-secret@api.github.com'); },
    value => { value.url = value.url.replace(/heads\/[^/]+$/, 'heads/Wrong'); },
    value => { value.url = value.url.replace(/heads\/[^/]+$/, 'heads/%ZZ'); },
    value => { value.object.type = 'tag'; },
    value => { value.object.sha = 'a'.repeat(39); },
    value => { value.object.sha = 'A'.repeat(40); },
    value => { value.object.url = value.object.url.replace('/owner/', '/other/'); },
    value => { value.object.url = value.object.url.replace(/\/commits\/.+$/, '/commits/' + 'c'.repeat(40)); },
    value => { value.object.url += '?token=ghp_test-secret'; },
    value => { delete value.object; }, value => { delete value.ref; }
  ]) {
    for (const key of ['head', 'base']) {
      const refs = { head: ref('feature', headOid), base: ref('main', baseOid) };
      mutate(refs[key]);
      const result = await evaluateNativeCall(nativeTool, input, { queryPrCreationRefs: async () => refs });
      assert.equal(result.decision, 'needs-context');
      assert.deepEqual(result.checks, []);
      assert.doesNotMatch(JSON.stringify(result), /ghp_test-secret/);
    }
  }
  for (const refs of [null, [], 'ghp_test-secret', {}, { head: ref('feature', headOid) }, { head: [], base: null }]) {
    const result = await evaluateNativeCall(nativeTool, input, { queryPrCreationRefs: async () => refs });
    assert.equal(result.decision, 'needs-context');
    assert.deepEqual(result.checks, []);
    assert.doesNotMatch(JSON.stringify(result), /ghp_test-secret/);
  }
  const sha256 = await evaluateNativeCall(nativeTool, input, { queryPrCreationRefs: async () => ({ head: ref('feature', 'a'.repeat(64)), base: ref('main', 'b'.repeat(64)) }) });
  assert.equal(sha256.decision, 'allow');
  const failed = await evaluateNativeCall(nativeTool, input, { queryPrCreationRefs: async () => { throw new Error('ghp_test-secret raw stderr'); } });
  assert.equal(failed.decision, 'needs-context');
  assert.deepEqual(failed.checks, []);
  assert.doesNotMatch(JSON.stringify(failed), /ghp_test-secret|raw stderr/);
});

test('리터럴 생성 옵션은 값의 help를 보존하고 부가 효과와 동적 입력을 조회 전에 보류한다', async () => {
  const prefix = 'gh pr create -R owner/project -H feature -B main';
  for (const [option, expected] of [['-t "--help"', '--help'], ['--title=-b', '-b']]) {
    const result = await evaluateNativeCall('exec_command', { cmd: prefix + ' ' + option + ' -b "' + body + '" -d' }, remoteRefs());
    assertChecked(result, 'allow');
    assert.ok(result.checks[0].observed.some(item => item.kind === 'pr-title' && item.digestOrOid === digest(expected)));
    assert.ok(result.checks[0].observed.some(item => item.kind === 'pr-draft' && item.digestOrOid === digest('true')));
  }
  assertChecked(await evaluateNativeCall('exec_command', { cmd: prefix + ' --title "" -b "' + body + '"' }, remoteRefs()), 'deny');
  const emptyBody = await evaluateNativeCall('exec_command', { cmd: prefix + ' -t Repair --body ""' }, remoteRefs());
  assertChecked(emptyBody, 'allow');
  assert.ok(emptyBody.checks[0].observed.some(item => item.kind === 'pr-body' && item.digestOrOid === digest('')));
  let queries = 0;
  const options = { queryPrCreationRefs: async () => { queries++; throw new Error('조회하면 안 된다.'); } };
  for (const suffix of [
    '-t Repair', '-t Repair -b body --body again', '-t Repair -b body -F body.md', '-t Repair -b body --base other',
    '-t Repair -b body --reviewer person', '-t Repair -b body --label bug', '-t Repair -b body --project p',
    '-t Repair -b body --assignee person', '-t Repair -b body --issue 4', '-t Repair -b body --fill',
    '-t Repair -b body --editor', '-t Repair -b body --web', '-t Repair -b body --template file',
    '-t Repair -b body --recover file', '-t Repair -b body --draft=false', '-t Repair -b body --draft -d',
    '-t "$TITLE" -b body', '-t "$(echo secret)" -b body', '-t Repair -b body; echo secret',
    '-t Repair -b body > log', '-t Repair -F -', '-t Repair -b body positional'
  ]) {
    const result = await evaluateNativeCall('exec_command', { cmd: prefix + ' ' + suffix }, options);
    assert.equal(result.decision, 'needs-context', suffix);
    assert.deepEqual(result.checks, []);
  }
  for (const cmd of ['env ' + prefix + ' -t Repair -b body', 'gh --repo owner/project pr create -H feature -B main -t Repair -b body'])
    assert.equal((await evaluateNativeCall('exec_command', { cmd }, options)).decision, 'needs-context');
  for (const cmd of ['gh pr create --help', 'gh pr create -h']) {
    const result = await evaluateNativeCall('exec_command', { cmd }, options);
    assert.equal(result.decision, 'allow');
    assert.equal(result.inspection, 'not-applicable');
  }
  assert.equal(queries, 0);
});

test('생성 본문 파일은 원문과 BOM 및 CRLF를 유지하고 잘못된 파일을 조회 전에 보류한다', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'native-pr-create-body-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const bom of ['', '\uFEFF']) {
    const bytes = bom + body.replaceAll('\n', '\r\n') + '\r\n';
    await writeFile(join(directory, 'body.md'), bytes);
    for (const option of ['-F body.md', '--body-file=body.md']) {
      const result = await evaluateNativeCall('exec_command', { cmd: 'gh pr create -R owner/project -H feature -B main -t Repair ' + option, cwd: directory }, remoteRefs());
      assertChecked(result, 'allow');
      assert.ok(result.checks[0].observed.some(item => item.kind === 'pr-body' && item.digestOrOid === digest(bytes)));
      assert.equal(await readFile(join(directory, 'body.md'), 'utf8'), bytes);
    }
  }
  await writeFile(join(directory, 'bad.md'), Buffer.from([0xff]));
  for (const option of ['-F missing.md', '-F .', '-F bad.md', '-F -', '--body-file=""']) {
    let queries = 0;
    const result = await evaluateNativeCall('exec_command', { cmd: 'gh pr create -R owner/project -H feature -B main -t Repair ' + option, cwd: directory }, {
      queryPrCreationRefs: async () => { queries++; return {}; }
    });
    assert.equal(result.decision, 'needs-context');
    assert.deepEqual(result.checks, []);
    assert.equal(queries, 0);
  }
});

test('PR 생성 조회는 두 명시적 GET과 정제 환경 및 동시 4초 제한을 사용한다', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'native-pr-create-subprocess-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fake = join(directory, 'fake-gh.mjs'), runner = join(directory, 'runner.mjs');
  const moduleUrl = new URL('../plugin/skills/repo-governance/scripts/tool-call.mjs', import.meta.url).href;
  const hookUrl = new URL('../plugin/hooks/run.mjs', import.meta.url).href;
  await writeFile(fake, `
import { writeFileSync, existsSync } from 'node:fs';
const [mode, record, ...argv] = process.argv.slice(2);
const branch = decodeURIComponent(argv.at(-1).split('/git/ref/heads/')[1]);
const key = branch === 'feature/a' ? 'head' : 'base';
writeFileSync(record + '.' + key, JSON.stringify({ argv, debugKeys: Object.keys(process.env).filter(key => /debug|trace|^NODE_OPTIONS$/i.test(key)), host: process.env.GH_HOST, prompt: process.env.GH_PROMPT_DISABLED, pager: process.env.GH_PAGER }));
if (mode === 'timeout') setTimeout(() => process.stdout.write('after-timeout'), 10000);
else if (mode === 'failure' && key === 'head') { process.stderr.write('ghp_test-secret raw stderr'); process.exitCode = 1; }
else if (mode === 'json' && key === 'head') process.stdout.write('ghp_test-secret invalid JSON');
else {
  const deadline = Date.now() + 3000;
  const timer = setInterval(() => {
    if (!existsSync(record + '.head') || !existsSync(record + '.base')) {
      if (Date.now() > deadline) { clearInterval(timer); process.exitCode = 1; }
      return;
    }
    clearInterval(timer);
    setTimeout(() => {
      const sha = (key === 'head' ? 'a' : 'b').repeat(40);
      const prefix = 'https://api.github.com/repos/owner/project';
      writeFileSync(record + '.' + key + '.settled', 'settled');
      process.stdout.write(JSON.stringify({ ref: 'refs/heads/' + branch, url: prefix + '/git/refs/heads/' + branch, object: { type: 'commit', sha, url: prefix + '/git/commits/' + sha } }));
    }, key === 'base' ? 150 : 0);
  }, 10);
}
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
  if (file === 'git' && (args[0] === 'check-ref-format' || JSON.stringify(args) === JSON.stringify(scopeProbe)))
    return original(file, args, options, callback);
  if (file !== 'gh') throw new Error('조회 외 subprocess는 허용하지 않는다.');
  calls.push({ file, args, timeout: options.timeout, windowsHide: options.windowsHide, shell: options.shell, maxBuffer: options.maxBuffer });
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
if (surface === 'hook' || surface === 'hook-invalid') {
  process.argv = [process.execPath, 'hook', '--harness', 'codex', '--bundle', ${JSON.stringify(bundlePath)}];
  const write = process.stdout.write, chunks = [];
  process.stdout.write = chunk => { chunks.push(String(chunk)); return true; };
  await import(${JSON.stringify(hookUrl)});
  process.stdout.write = write;
  process.stdout.write(JSON.stringify({ hook: JSON.parse(chunks.join('')), calls }));
} else {
  const { evaluateNativeCall } = await import(${JSON.stringify(moduleUrl)});
  const result = surface === 'shell'
    ? await evaluateNativeCall('exec_command', { cmd: ${JSON.stringify('gh pr create -R owner/project -H feature/a -B main -t Repair -b "' + body + '"')} }, { bundlePath: ${JSON.stringify(bundlePath)} })
    : await evaluateNativeCall(${JSON.stringify(nativeTool)}, { ...${JSON.stringify(input)}, head: 'feature/a' }, { bundlePath: ${JSON.stringify(bundlePath)} });
  process.stdout.write(JSON.stringify({ result, calls }));
}
`);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^REPO_GOVERNANCE_PRODUCT$|^NODE_OPTIONS$/i.test(key)));
  Object.assign(env, { GH_HOST: 'github.com', GH_DEBUG: 'api', DEBUG: '*', NODE_DEBUG: 'http', GIT_TRACE: '1', GH_TRACE: '1', GH_TOKEN: 'ghp_test-secret' });
  for (const [index, [mode, surface]] of [['success', 'native'], ['success', 'shell'], ['success', 'hook'], ['success', 'hook-invalid'], ['failure', 'native'], ['json', 'native'], ['timeout', 'native'], ['timeout', 'hook']].entries()) {
    const record = join(directory, 'record-' + index);
    const started = performance.now();
    const pending = execute(process.execPath, [runner, fake, mode, record, surface], { cwd: directory, env, timeout: 10000, windowsHide: true, maxBuffer: 1024 * 1024 });
    pending.child.stdin.end(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: nativeTool,
      tool_input: { ...input, head: 'feature/a', ...(surface === 'hook-invalid' ? { body: 'TODO' } : {}) } }));
    const { stdout, stderr } = await pending;
    assert.equal(stderr, '');
    assert.doesNotMatch(stdout, /ghp_test-secret|raw stderr|after-timeout/);
    const { result, hook, calls } = JSON.parse(stdout);
    if (surface.startsWith('hook')) {
      if (mode === 'success' && surface === 'hook') assert.equal(JSON.parse(hook.hookSpecificOutput.additionalContext).decision, 'allow');
      else assert.equal(hook.hookSpecificOutput.permissionDecision, 'deny');
      if (surface === 'hook-invalid') assert.match(hook.hookSpecificOutput.permissionDecisionReason, /K6\/placeholder/);
    } else {
      assert.equal(result.decision, mode === 'success' ? 'allow' : 'needs-context', JSON.stringify(result));
      if (mode !== 'success') assert.deepEqual(result.checks, []);
    }
    assert.deepEqual(calls, ['feature/a', 'main'].map(branch => ({ file: 'gh', args: ['api', '--method', 'GET', 'repos/owner/project/git/ref/heads/' + branch], timeout: 4000, windowsHide: true, shell: false, maxBuffer: 4 * 1024 * 1024 })));
    for (const [offset, key] of ['head', 'base'].entries()) {
      assert.deepEqual(JSON.parse(await readFile(record + '.' + key, 'utf8')), { argv: calls[offset].args, debugKeys: [], host: 'github.com', prompt: '1', pager: 'cat' });
    }
    if (mode === 'failure' || mode === 'json') assert.equal(await readFile(record + '.base.settled', 'utf8'), 'settled');
    if (mode === 'timeout') assert.ok(performance.now() - started >= 3500 && performance.now() - started < 7500, '두 조회의 4초 제한은 같은 시점에 시작해야 한다.');
  }
});

test('지원하지 않는 GH_HOST는 생성 조회 전에 보류한다', async () => {
  const previous = process.env.GH_HOST;
  let queries = 0;
  try {
    process.env.GH_HOST = 'enterprise.example.invalid';
    const result = await evaluateNativeCall(nativeTool, input, { queryPrCreationRefs: async () => { queries++; return {}; } });
    assert.equal(result.decision, 'needs-context');
    assert.deepEqual(result.checks, []);
    assert.equal(queries, 0);
  } finally {
    if (previous === undefined) delete process.env.GH_HOST;
    else process.env.GH_HOST = previous;
  }
});

test('공식 gh pr new 별칭도 같은 생성 검사와 지원 경계를 적용한다', async () => {
  const command = content => 'gh pr new -R owner/project -H feature -B main -t Repair -b "' + content + '"';
  assertChecked(await evaluateNativeCall('exec_command', {cmd: command(body)}, remoteRefs()), 'allow');
  assertChecked(await evaluateNativeCall('exec_command', {cmd: command('TODO')}, remoteRefs()), 'deny');
  for (const cmd of [command(body) + ' --fill', command(body) + ' && echo done']) {
    const result = await evaluateNativeCall('exec_command', {cmd}, remoteRefs());
    assert.equal(result.decision, 'needs-context');
    assert.equal(result.checks.length, 0);
  }
});
