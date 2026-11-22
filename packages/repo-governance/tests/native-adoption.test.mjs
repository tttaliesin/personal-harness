import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, rmdirSync, existsSync, symlinkSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { evaluateNativeCall } from '../plugin/skills/repo-governance/scripts/tool-call.mjs';
import { runCheck } from '../plugin/skills/repo-governance/scripts/check.mjs';
import { localNativeScope } from '../plugin/skills/repo-governance/scripts/native-product.mjs';

const root = fileURLToPath(new URL('../plugin/', import.meta.url));
const bundlePath = join(root, 'skills/repo-governance/assets/bundle.json');
const hookPath = join(root, 'hooks/run.mjs');
const goodReadme = '# 제품 안내\n\n제품의 사용 방법을 설명합니다.\n';
const outputBoundaries = [{path: 'README.md', purpose: '시험용 출력', lifetime: '시험 종료까지'}];
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_|^REPO_GOVERNANCE_/i.test(key)));
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'governance-adoption-'));
  t.after(() => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('governance-adoption-'));
    rmSync(directory, {recursive: true, force: true});
  });
  const repository = join(directory, 'product');
  mkdirSync(repository);
  const git = (...args) => execFileSync('git', ['-C', repository, '-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', ...args], {encoding: 'utf8', windowsHide: true, env: cleanEnv}).trim();
  git('init', '--quiet');
  const metadata = resolve(git('rev-parse', '--path-format=absolute', '--git-path', 'repo-governance/product.json'));
  const marker = join(dirname(metadata), 'adoption.json');
  const selected = join(directory, 'selected-product.json');
  const product = {schemaVersion: 1, bundle: {version: '0.2.0', sha256: createHash('sha256').update(readFileSync(bundlePath)).digest('hex')}, outputBoundaries: []};
  writeFileSync(selected, JSON.stringify(product));
  const mark = () => { mkdirSync(dirname(marker), {recursive: true}); writeFileSync(marker, JSON.stringify({schemaVersion: 1, mode: 'enforce'})); };
  const bind = (changes = {}, adopted = true) => {
    mkdirSync(dirname(metadata), {recursive: true});
    writeFileSync(metadata, JSON.stringify({...product, ...changes}));
    if (adopted) mark();
  };
  const inspect = (tool, input, options = {}) => evaluateNativeCall(tool, input, {repository, ...options});
  const write = (text = goodReadme, options = {}) => inspect('Write', {file_path: 'README.md', content: text}, options);
  const hook = (tool, input) => {
    const child = spawnSync(process.execPath, [hookPath, '--harness', 'codex'], {cwd: repository, encoding: 'utf8', windowsHide: true, env: cleanEnv,
      input: JSON.stringify({hook_event_name: 'PreToolUse', cwd: repository, tool_name: tool, tool_input: input}), timeout: 20000});
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout);
  };
  return {directory, repository, metadata, marker, selected, product, git, mark, bind, inspect, write, hook};
}
async function withoutProductEnvironment(action) {
  const before = process.env.REPO_GOVERNANCE_PRODUCT;
  delete process.env.REPO_GOVERNANCE_PRODUCT;
  try { return await action(); }
  finally { if (before === undefined) delete process.env.REPO_GOVERNANCE_PRODUCT; else process.env.REPO_GOVERNANCE_PRODUCT = before; }
}

test('an unadopted worktree leaves ordinary writes and commits outside governance', t => withoutProductEnvironment(async () => {
  const f = fixture(t);
  const write = await f.write();
  assert.equal(write.decision, 'allow');
  assert.equal(write.inspection, 'not-adopted');
  assert.equal(write.scope, 'none');
  assert.deepEqual(write.checks, []);
  assert.equal(write.adoption[0].source, 'none');
  writeFileSync(join(f.repository, 'source.txt'), 'ordinary project source\n');
  f.git('add', 'source.txt');
  const commit = await f.inspect('exec_command', {cmd: 'git commit -m "Local source update"'});
  assert.equal(commit.inspection, 'not-adopted');
  f.git('commit', '--quiet', '-m', 'Local source update');
  assert.ok(f.git('rev-parse', 'HEAD'));
  assert.equal((await localNativeScope(f.repository)).adopted, false);
  assert.equal(existsSync(f.metadata), false);
  assert.equal(existsSync(f.marker), false);
}));

test('unadopted compound Git calls pass while an adopted compound remains held', t => withoutProductEnvironment(async () => {
  const f = fixture(t);
  const command = 'git diff --check && git commit -m "fix: 제품 동작을 고친다"';
  assert.equal((await f.inspect('exec_command', {cmd: command})).inspection, 'not-adopted');
  f.bind();
  const adopted = await f.inspect('exec_command', {cmd: command});
  assert.equal(adopted.decision, 'needs-context');
  assert.equal(adopted.findings[0].code, 'NATIVE_INPUT');
}));

test('unadopted cwd cannot skip mutations that change the worktree through shell context', t => withoutProductEnvironment(async () => {
  const first = fixture(t), second = fixture(t);
  second.mark();
  const target = second.repository.replaceAll('\\', '/');
  for (const cmd of [
    'cd "' + target + '" && git commit -m "invalid"',
    'Set-Location "' + target + '"; git commit -m "invalid"',
    "bash -c 'cd \"" + target + "\" && git commit -m \"invalid\"'",
    'env GIT_DIR="' + target + '/.git" GIT_WORK_TREE="' + target + '" git commit -m "invalid"',
    '$env:GIT_WORK_TREE="' + target + '"; git commit -m "invalid"'
  ]) {
    const result = await first.inspect('exec_command', {cmd});
    assert.equal(result.decision, 'needs-context', cmd);
    assert.equal(result.inspection, 'missing-input', cmd);
    assert.equal(result.findings[0].code, 'NATIVE_INPUT', cmd);
  }
  assert.equal((await first.inspect('exec_command', {cmd: 'git commit -m "GIT_DIR=value"'})).inspection, 'not-adopted');
  assert.equal((await first.inspect('exec_command', {cmd: 'cd "' + target + '" && git status --short'})).scope, 'none');
  assert.equal(existsSync(first.metadata), false);
  assert.equal(existsSync(second.metadata), false);
}));

test('an adoption marker requires its product even after that product is deleted', t => withoutProductEnvironment(async () => {
  const f = fixture(t);
  f.mark();
  const missing = await f.write();
  assert.equal(missing.decision, 'needs-context');
  assert.ok(missing.findings.some(finding => finding.ruleId === 'K7'));
  assert.equal((await f.write(goodReadme, {bundlePath})).decision, 'needs-context');
  assert.equal((await f.inspect('exec_command', {cmd: 'gh repo create product-inventory-api'}, {bundlePath})).decision, 'needs-context');
  assert.equal(f.hook('Write', {file_path: 'README.md', content: goodReadme}).hookSpecificOutput.permissionDecision, 'deny');
  f.bind();
  assert.equal((await f.write()).decision, 'allow');
  rmSync(f.metadata);
  assert.equal((await f.write()).decision, 'needs-context');
  assert.equal((await localNativeScope(f.repository)).adoption, 'marker');
  assert.equal(existsSync(join(f.repository, 'README.md')), false);
}));

test('shell blocks cannot borrow an unadopted cwd for a different adopted worktree', t => withoutProductEnvironment(async () => {
  const first = fixture(t), second = fixture(t);
  second.bind();
  second.git('commit', '--allow-empty', '--quiet', '-m', 'test: 대상 저장소 기준을 만든다');
  const target = second.repository.replaceAll('\\', '/');
  const commands = [
    `& { Set-Location '${target}'; git branch Bad_Scriptblock HEAD }`,
    `if ($true) { Set-Location '${target}' }; git branch Bad_Conditional HEAD`,
    `powershell -NoProfile -Command "& { Set-Location '${target}'; git branch Bad_Nested HEAD }"`,
    `bash -c 'if true; then cd "${target}"; fi; git branch Bad_Conditional HEAD'`
  ];
  const before = second.git('for-each-ref', '--format=%(refname) %(objectname)');
  for (const cmd of commands) {
    const result = await first.inspect('exec_command', {cmd});
    assert.equal(result.decision, 'needs-context', cmd);
    assert.equal(result.inspection, 'missing-input', cmd);
    assert.equal(result.findings[0].code, 'NATIVE_INPUT', cmd);
    const hook = first.hook('exec_command', {cmd});
    assert.equal(hook.hookSpecificOutput.permissionDecision, 'deny', cmd);
  }
  assert.equal(second.git('for-each-ref', '--format=%(refname) %(objectname)'), before);
  assert.equal((await first.inspect('exec_command', {cmd: 'git diff --check && git commit -m "Local update"'})).inspection, 'not-adopted');
  assert.equal((await first.inspect('exec_command', {cmd: `git -C '${target}' status --short && git branch Local_Branch HEAD`})).inspection, 'not-adopted');
  assert.equal((await first.inspect('exec_command', {cmd: `bash -c 'git diff --check && git commit -m "Local update"'`})).inspection, 'not-adopted');
  assert.equal((await first.inspect('exec_command', {cmd: 'git commit -m "literal { block }; text"'})).inspection, 'not-adopted');
  assert.equal((await first.inspect('exec_command', {cmd: 'echo "if ($true) { git branch Example }"'})).scope, 'none');
}));

test('adopted worktrees pass valid candidates and reject output, message and product errors', t => withoutProductEnvironment(async () => {
  const f = fixture(t);
  f.bind();
  const allowed = await f.write();
  assert.equal(allowed.decision, 'allow');
  assert.equal(allowed.adoption[0].source, 'marker');
  assert.equal((await f.inspect('exec_command', {cmd: 'gh repo create product-inventory-api --private'})).decision, 'allow');
  f.bind({outputBoundaries});
  const invalid = await f.write();
  assert.equal(invalid.decision, 'deny');
  assert.ok(invalid.findings.some(finding => finding.ruleId === 'K7'));
  f.git('commit', '--allow-empty', '--quiet', '-m', 'test: 검사 기준을 만든다');
  const message = await f.inspect('exec_command', {cmd: 'git commit -m "invalid"'});
  assert.equal(message.decision, 'deny');
  assert.ok(message.findings.some(finding => finding.ruleId === 'K4'));
  f.bind({bundle: {version: '0.1.0', sha256: '0'.repeat(64)}});
  assert.equal((await f.write()).decision, 'allow');
  assert.equal((await f.inspect('exec_command', {cmd: 'gh repo create product-inventory-api --private'})).decision, 'allow');
  f.bind({schemaVersion: 2});
  assert.equal((await f.write()).decision, 'needs-context');
  assert.equal((await f.inspect('exec_command', {cmd: 'gh repo create product-inventory-api --private'})).decision, 'needs-context');
  writeFileSync(f.metadata, '{');
  assert.equal((await f.write()).decision, 'error');
}));

test('unquoted argument expressions cannot redirect a skipped native mutation', t => withoutProductEnvironment(async () => {
  const first = fixture(t), second = fixture(t);
  second.bind();
  const target = second.repository.replaceAll('\\', '/');
  const cmd = `git branch Bad_Parenthesized (Set-Location '${target}')`;
  const result = await first.inspect('exec_command', {cmd});
  assert.equal(result.decision, 'needs-context');
  assert.equal(result.findings[0].code, 'NATIVE_INPUT');
  assert.equal(first.hook('exec_command', {cmd}).hookSpecificOutput.permissionDecision, 'deny');
  for (const message of ['fix(api): 괄호를 보존한다', 'literal (block)']) {
    assert.equal((await first.inspect('exec_command', {cmd: `git commit -m "${message}"`})).inspection, 'not-adopted');
  }
}));

test('malformed adoption is held without hiding queries or changing the selected files', t => withoutProductEnvironment(async () => {
  const f = fixture(t);
  f.bind();
  const productBefore = readFileSync(f.metadata);
  for (const marker of ['{', '{}', '{"schemaVersion":1,"mode":"off"}', '{"schemaVersion":1,"mode":"enforce","approved":true}']) {
    writeFileSync(f.marker, marker);
    const result = await f.write();
    assert.equal(result.decision, 'needs-context');
    assert.equal(result.inspection, 'adoption-error');
    assert.equal(result.findings[0].code, 'ADOPTION_INPUT');
    assert.equal(f.hook('Write', {file_path: 'README.md', content: goodReadme}).hookSpecificOutput.permissionDecision, 'deny');
    for (const cmd of ['git status --short', 'gh pr merge --help']) assert.equal((await f.inspect('exec_command', {cmd})).scope, 'none');
    assert.deepEqual(readFileSync(f.metadata), productBefore);
    assert.equal(readFileSync(f.marker, 'utf8'), marker);
  }
}));

test('an adoption directory or symlink cannot turn enforcement into an absent configuration', t => withoutProductEnvironment(async () => {
  const f = fixture(t);
  f.bind();
  rmSync(f.marker);
  mkdirSync(f.marker);
  assert.equal((await f.write()).inspection, 'adoption-error');
  rmdirSync(f.marker);
  try { symlinkSync(join(f.directory, 'missing-marker.json'), f.marker); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Host cannot create file symlinks'); return; } throw error; }
  assert.equal((await f.write()).inspection, 'adoption-error');
}));

test('legacy product bindings enforce without creating an adoption marker during inspection', t => withoutProductEnvironment(async () => {
  const f = fixture(t);
  f.bind({outputBoundaries}, false);
  assert.equal((await localNativeScope(f.repository)).adoption, 'legacy-product');
  const before = readFileSync(f.metadata);
  assert.equal((await f.write()).decision, 'deny');
  assert.deepEqual(readFileSync(f.metadata), before);
  assert.equal(existsSync(f.marker), false);
}));

test('literal git -C uses the actual target adoption and linked worktrees remain independent', t => withoutProductEnvironment(async () => {
  const first = fixture(t), second = fixture(t);
  first.bind();
  first.git('commit', '--allow-empty', '--quiet', '-m', 'test: 기준을 만든다');
  second.git('commit', '--allow-empty', '--quiet', '-m', 'test: 기준을 만든다');
  const target = second.repository.replaceAll('\\', '/');
  assert.equal((await first.inspect('exec_command', {cmd: 'git -C "' + target + '" branch Bad_Branch'})).inspection, 'not-adopted');
  const adopted = first.repository.replaceAll('\\', '/');
  assert.equal((await second.inspect('exec_command', {cmd: 'git -C "' + adopted + '" branch Bad_Branch'})).decision, 'deny');
  const linked = join(first.directory, 'linked');
  first.git('worktree', 'add', '--quiet', '-b', 'linked', linked);
  const linkedScope = await localNativeScope(linked);
  assert.equal(linkedScope.adopted, false);
  assert.notEqual(linkedScope.productPath, first.metadata);
  assert.equal((await first.inspect('Write', {workdir: linked, file_path: 'README.md', content: goodReadme})).inspection, 'not-adopted');
  mkdirSync(dirname(linkedScope.adoptionPath), {recursive: true});
  writeFileSync(linkedScope.adoptionPath, JSON.stringify({schemaVersion: 1, mode: 'enforce'}));
  assert.equal((await first.inspect('Write', {workdir: linked, file_path: 'README.md', content: goodReadme})).decision, 'needs-context');
}));

test('clone-wide adoption applies shared defaults to linked worktrees and keeps local overrides', t => withoutProductEnvironment(async () => {
  const f = fixture(t), other = fixture(t);
  f.git('commit', '--allow-empty', '--quiet', '-m', 'test: 기준을 만든다');
  const linked = join(f.directory, 'linked');
  f.git('worktree', 'add', '--quiet', '-b', 'linked', linked);
  const initial = await localNativeScope(linked);
  mkdirSync(dirname(initial.cloneAdoptionPath), {recursive: true});
  writeFileSync(initial.cloneAdoptionPath, JSON.stringify({schemaVersion: 2, mode: 'enforce'}));
  for (const repository of [f.repository, linked]) {
    const scope = await localNativeScope(repository);
    assert.equal(scope.adoptionPath, initial.cloneAdoptionPath);
    assert.equal(scope.productPath, undefined);
    const write = text => f.inspect('Write', {workdir: repository, file_path: 'README.md', content: text});
    const result = await write(goodReadme);
    assert.equal(result.decision, 'allow');
    assert.equal(result.adoption[0].source, 'clone-marker');
    assert.ok(result.checks.some(check => check.check === 'file-scope'));
    const bad = await f.inspect('exec_command', {cmd: 'git branch Bad_Branch', workdir: repository});
    assert.equal(bad.decision, 'deny');
    assert.ok(bad.findings.some(finding => finding.ruleId === 'K5'));
  }
  assert.equal((await other.write()).inspection, 'not-adopted');
  assert.equal((await f.write(goodReadme, {bundlePath})).decision, 'allow');
  f.mark();
  assert.equal((await f.write()).decision, 'needs-context');
  f.bind({outputBoundaries});
  const local = await f.write();
  assert.equal(local.adoption[0].source, 'marker');
  assert.equal(local.decision, 'deny');
  assert.equal((await localNativeScope(linked)).adoption, 'clone-marker');
  writeFileSync(initial.cloneAdoptionPath, '{}');
  const invalid = await f.inspect('Write', {workdir: linked, file_path: 'README.md', content: goodReadme});
  assert.equal(invalid.inspection, 'adoption-error');
}));

test('explicit inspection can opt in for a call with defaults or a selected input', t => withoutProductEnvironment(async () => {
  const f = fixture(t);
  assert.equal((await f.write(goodReadme, {bundlePath})).decision, 'allow');
  assert.equal((await f.write(goodReadme, {productPath: f.selected})).decision, 'allow');
  writeFileSync(f.selected, JSON.stringify({...f.product, outputBoundaries}));
  assert.equal((await f.write(goodReadme, {productPath: f.selected})).decision, 'deny');
  const direct = await runCheck(JSON.stringify({schemaVersion: 3, operation: 'check', check: 'file-scope', sources: [{kind: 'file', path: 'source.mjs'}], context: {repository: f.repository, bundlePath}}));
  assert.equal(JSON.parse(direct.line).decision, 'pass');
}));

test('native launch tasks leave automatic scope selection available when no product was supplied', t => {
  const f = fixture(t);
  for (const launch of ['run:claude', 'run:pi']) {
    const result = spawnSync(process.platform === 'win32' ? 'task.exe' : 'task', ['--dry', launch, 'TARGET=' + f.repository], {
      cwd: root, encoding: 'utf8', windowsHide: true, env: {...cleanEnv, NO_COLOR: '1'}, timeout: 10000
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /REPO_GOVERNANCE_PRODUCT=/);
  }
});
