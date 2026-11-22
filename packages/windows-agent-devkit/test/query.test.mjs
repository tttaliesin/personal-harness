import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, realpath, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createQuery, queryEnvironment, isReadOnlyQuery } from '../src/query.mjs';
import { runBounded } from '../src/windows.mjs';

const WINDOWS = process.platform === 'win32' || '실제 Windows 경로의 PE 검증을 사용하는 정적 fixture';
const SECRET = 'QUERY_PRIVATE_SENTINEL';
const success = () => ({ state: 'succeeded', exitCode: 0, stdout: Buffer.from('v24.18.1\n'), stderr: Buffer.alloc(0) });

async function fixture(t, { inside = false, tool = 'node' } = {}) {
  const parent = await realpath(tmpdir());
  const base = await realpath(await mkdtemp(path.join(parent, 'windows-agent-query-')));
  const identity = await lstat(base);
  t.after(async () => {
    assert.equal(path.dirname(base), parent);
    assert.ok(path.basename(base).startsWith('windows-agent-query-'));
    assert.equal(await realpath(base), base);
    const current = await lstat(base);
    assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino);
    await rm(base, { recursive: true });
  });
  const projectPath = path.join(base, 'project');
  const directory = path.join(inside ? projectPath : base, 'tools');
  await mkdir(projectPath); await mkdir(directory);
  const executable = path.join(directory, `${tool}.exe`);
  const pe = Buffer.alloc(132); pe.write('MZ'); pe.writeUInt32LE(128, 60); pe.write('PE\0\0', 128, 'binary');
  await writeFile(executable, pe);
  const host = { commands: { [tool]: [{ name: `${tool}.exe`, path: executable, commandType: 'Application' }] } };
  const calls = [];
  const run = async (file, args, options) => { calls.push({ file, args, options }); return success(); };
  const environment = { PATH: directory, PATHEXT: '.EXE;.CMD', SystemRoot: 'C:\\Windows', GH_TOKEN: SECRET, NODE_OPTIONS: `--require ${SECRET}` };
  const options = { projectPath, host, run, environment, timeoutMs: 1234 };
  return { base, projectPath, directory, executable, host, calls, options, pe };
}

test('읽기 전용 정책은 고정 조회를 허용하고 설치·서비스·프로젝트 코드 실행을 거부한다', () => {
  const allowed = [
    ['node', ['--version']], ['rustc', ['--version']], ['task', ['--version']],
    ['git', ['--version']], ['git', ['rev-parse', '--show-toplevel']],
    ['git', ['config', '--get-all', 'credential.helper']],
    ['git', ['-c', 'core.fsmonitor=false', 'ls-files', '--eol', '-z']],
    ['mise', ['ls', '--installed', '--json']], ['mise', ['which', 'node']],
    ['dotnet', ['--list-sdks']], ['dotnet', ['--list-runtimes']], ['dotnet', ['--version']],
    ['docker', ['--version']], ['docker', ['context', 'show']], ['docker', ['context', 'inspect', 'desktop-linux']],
    ['docker-compose', ['version', '--format', 'json']],
    ['wsl', ['--version']], ['wsl', ['--status']], ['wsl', ['--list', '--verbose']], ['wsl', ['--list', '--quiet']],
    ['codex', ['--version']], ['codex', ['plugin', 'list', '--marketplace', 'windows-agent-devkit-local', '--json']],
    ['vswhere', ['-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-format', 'json', '-utf8']],
    ['fsutil', ['devdrv', 'query', 'D:']], ['gh', ['auth', 'status', '--active', '--hostname', 'github.com']],
  ];
  const forbidden = [
    ['node', ['-e', SECRET]], ['python', ['-c', SECRET]], ['npm', ['--version']], ['npm', ['install']],
    ['go', ['version']], ['mise', ['install', 'node@24.18.1']], ['task', ['test']],
    ['git', ['config', '--set', 'sample.key', 'example']], ['git', ['-c', 'core.fsmonitor=true', 'ls-files', '--eol', '-z']],
    ['docker', ['version']], ['docker', ['info']], ['docker', ['compose', 'up']], ['docker', ['compose', 'version']],
    ['docker', ['--host', 'example.test', 'context', 'show']], ['docker', ['context', 'use', 'local']],
    ['docker', ['context', 'inspect', '--format']], ['docker', ['start', 'existing']],
    ['process-compose', ['up']], ['wsl', ['--exec', 'sh']], ['wsl', ['--distribution', 'Ubuntu', '--exec', 'true']],
    ['codex', ['plugin', 'add', 'example']], ['codex', ['plugin', 'marketplace', 'add', 'example']],
    ['node', ['--version\n']], ['node', [null]],
  ];
  for (const [tool, args] of allowed) assert.equal(isReadOnlyQuery(tool, args), true, `${tool} ${args}`);
  for (const [tool, args] of forbidden) assert.equal(isReadOnlyQuery(tool, args), false, `${tool} ${args}`);
});

test('version이라는 프로젝트 파일을 실행하는 argv를 버전 조회로 허용하지 않는다', () => {
  for (const tool of ['node', 'python']) assert.equal(isReadOnlyQuery(tool, ['version']), false, `${tool} version은 프로젝트 스크립트를 실행할 수 있습니다.`);
});

test('고정 PowerShell 수집기 경로를 덧붙여도 -Command 실행은 읽기 전용으로 허용하지 않는다', () => {
  const collector = fileURLToPath(new URL('../scripts/collect-host.ps1', import.meta.url));
  const advanced = fileURLToPath(new URL('../scripts/collect-advanced.ps1', import.meta.url));
  assert.equal(isReadOnlyQuery('pwsh', ['-NoProfile', '-NonInteractive', '-File', collector]), true);
  assert.equal(isReadOnlyQuery('pwsh', ['-NoProfile', '-NonInteractive', '-File', advanced, '-TargetPath', tmpdir()]), true);
  assert.equal(isReadOnlyQuery('pwsh', ['-NoProfile', '-Command', `Write-Output ${SECRET}`, '-File', collector]), false);
  assert.equal(isReadOnlyQuery('pwsh', ['-NoProfile', '-NonInteractive', '-File', advanced, '-TargetPath', 'relative']), false);
});

test('기본 조회 환경은 비밀·proxy·hook을 제거하고 원본 환경은 보존한다', () => {
  const projectSettings = { GOFLAGS: '-mod=vendor', RUSTC_WRAPPER: 'C:/Tools/sccache.exe', MAKEFLAGS: '-j2', MAKEFILES: 'C:/project/build-settings.mk', PSModulePath: 'C:/project/modules' };
  const environment = { Path: 'C:\\Tools', pAtHeXt: '.EXE;.CMD', SystemRoot: 'C:\\Windows', GH_TOKEN: SECRET, AWS_SECRET_ACCESS_KEY: SECRET, HTTP_PROXY: `https://${SECRET}@example.test`, node_options: SECRET, PYTHONPATH: SECRET, DOTNET_STARTUP_HOOKS: SECRET, GIT_CONFIG_KEY_0: SECRET, MISE_DATA_DIR: 'C:\\Tools\\mise', RUSTUP_HOME: 'relative', GOTOOLCHAIN: 'auto', ...projectSettings };
  const original = { ...environment };
  const env = queryEnvironment(environment);
  assert.equal(env.PATH, environment.Path);
  assert.equal(env.PATHEXT, environment.pAtHeXt);
  assert.equal(env.GOTOOLCHAIN, 'local');
  assert.equal(env.GOTELEMETRY, 'off');
  assert.equal(env.MISE_OFFLINE, '1');
  assert.equal(env.MISE_AUTO_INSTALL, '0');
  assert.equal(env.COREPACK_ENABLE_NETWORK, '0');
  assert.equal(env.RUSTUP_HOME, undefined);
  if (process.platform === 'win32') assert.equal(env.MISE_DATA_DIR, environment.MISE_DATA_DIR);
  assert.ok(!JSON.stringify(env).includes(SECRET));
  assert.deepEqual(environment, original);
  for (const key of Object.keys(projectSettings)) assert.equal(env[key], undefined, key);
});

test('execute:true는 읽기 전용 인수여도 실행 파일 조회와 runner 호출 전에 거부한다', async () => {
  const query = createQuery({
    host: { get commands() { assert.fail('실행 파일을 조회했습니다.'); } },
    run: () => assert.fail('runner를 호출했습니다.'),
  });
  const requests = [
    ['node', ['--version']], ['node', ['test.mjs']], ['npm', ['run', 'test']],
    ['mise', ['run', 'test']], ['docker', ['context', 'show']], ['docker', ['info']],
    ['wsl', ['--list', '--verbose']], ['wsl', ['--exec', 'sh']], ['winget', ['--version']],
  ];
  for (const [tool, args] of requests) {
    const result = await query(tool, args, { execute: true });
    assert.equal(result.state, 'not_run', tool);
    assert.match(result.reason, /읽기 전용/, tool);
    assert.equal(result.executable, null, tool);
  }
});

test('검증한 버전 조회는 인수·제한·정제한 환경을 runner에 전달한다', { skip: WINDOWS !== true && WINDOWS }, async (t) => {
  const f = await fixture(t);
  const query = createQuery(f.options);
  const signal = new AbortController().signal;
  const result = await query('node', ['--version'], {
    execute: false, signal, timeoutMs: 321, maxOutputBytes: 4096,
    env: {
      nOdE_OpTiOnS: SECRET, PythonPath: SECRET, DOTNET_STARTUP_HOOKS: SECRET, GIT_CONFIG_VALUE_0: SECRET,
      corepack_enable_network: '1', mise_auto_install: '1', mise_no_hooks: '0', mise_no_env: '0',
    },
  });
  assert.equal(result.state, 'succeeded');
  assert.equal(result.stdout, 'v24.18.1');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].file, f.executable);
  assert.deepEqual(f.calls[0].args, ['--version']);
  assert.equal(f.calls[0].options.cwd, f.projectPath);
  assert.equal(f.calls[0].options.signal, signal);
  assert.equal(f.calls[0].options.timeoutMs, 321);
  assert.equal(f.calls[0].options.maxOutputBytes, 4096);
  const env = f.calls[0].options.env;
  assert.equal(env.COREPACK_ENABLE_NETWORK, '0');
  assert.equal(env.corepack_enable_network, undefined);
  assert.equal(env.MISE_AUTO_INSTALL, '0');
  assert.equal(env.MISE_NO_HOOKS, '1');
  assert.equal(env.MISE_NO_ENV, '1');
  assert.ok(!JSON.stringify(env).includes(SECRET));
});

test('WSL은 호스트 조회만 runner에 전달한다', { skip: WINDOWS !== true && WINDOWS }, async (t) => {
  const f = await fixture(t, { tool: 'wsl' });
  const query = createQuery(f.options);
  const guest = ['--distribution', 'FixtureLinux', '--exec', '/usr/bin/true'];
  assert.equal((await query('wsl', guest)).state, 'not_run');
  assert.equal((await query('wsl', guest, { execute: true })).state, 'not_run');
  assert.equal((await query('wsl', ['--list', '--verbose'])).state, 'succeeded');
  assert.deepEqual(f.calls.map(({ file, args }) => ({ file, args })), [
    { file: f.executable, args: ['--list', '--verbose'] },
  ]);
});

test('이전 작업 옵션을 전달해도 프로젝트 내부의 PE를 거부한다', { skip: WINDOWS !== true && WINDOWS }, async (t) => {
  const f = await fixture(t, { inside: true });
  const query = createQuery(f.options);
  for (const options of [{}, { projectTask: true }, { execute: true, projectTask: true }]) {
    assert.equal((await query('node', ['--version'], options)).state, 'not_run');
  }
  assert.equal(f.calls.length, 0);
});

test('Git 인덱스 조회는 fsmonitor와 hook을 비활성화한 인수를 전달한다', { skip: WINDOWS !== true && WINDOWS }, async (t) => {
  const f = await fixture(t, { tool: 'git' });
  const query = createQuery(f.options);
  const args = ['-c', 'core.fsmonitor=false', 'ls-files', '--eol', '-z'];
  assert.equal((await query('git', args)).state, 'succeeded');
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].args, ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=NUL', ...args]);
});

test('WinGet 실행 별칭을 메타데이터 조회 대상으로 사용하지 않는다', { skip: WINDOWS !== true && WINDOWS }, async (t) => {
  const f = await fixture(t, { tool: 'winget' });
  const local = path.join(f.base, 'LocalAppData');
  const alias = path.join(local, 'Microsoft', 'WindowsApps', 'winget.exe');
  await mkdir(path.dirname(alias), { recursive: true });
  await writeFile(alias, f.pe);
  const host = { commands: { winget: [{ name: 'winget.exe', commandType: 'Application', path: alias }] } };
  const query = createQuery({ ...f.options, host, environment: { ...f.options.environment, LOCALAPPDATA: local } });
  const denied = await query('winget', ['--version']);
  assert.equal(denied.state, 'not_run');
  assert.match(denied.reason, /별칭/);
  assert.equal(f.calls.length, 0);
});

test('일반 파일을 PE 버전 조회 대상으로 사용하지 않는다', { skip: WINDOWS !== true && WINDOWS }, async (t) => {
  const f = await fixture(t);
  await writeFile(f.executable, 'plain text is not executable metadata');
  const result = await createQuery(f.options)('node', ['--version']);
  assert.equal(result.state, 'not_run');
  assert.equal(f.calls.length, 0);
});

test('.NET SDK 버전 조회의 임시 CLI 홈은 실행 후 제거한다', { skip: WINDOWS !== true && WINDOWS }, async (t) => {
  const f = await fixture(t, { tool: 'dotnet' });
  const result = await createQuery(f.options)('dotnet', ['--version'], { env: { dotnet_cli_home: f.projectPath } });
  assert.equal(result.state, 'succeeded');
  const env = f.calls[0].options.env;
  assert.equal(env.dotnet_cli_home, undefined);
  const home = env.DOTNET_CLI_HOME;
  assert.equal(path.dirname(home), tmpdir());
  assert.match(path.basename(home), /^windows-agent-devkit-dotnet-/);
  await assert.rejects(lstat(home), { code: 'ENOENT' });
});

test('직접 Compose 버전 조회도 명시 경로의 PE를 검증하고 docker 플러그인 탐색을 호출하지 않는다', { skip: WINDOWS !== true && WINDOWS }, async (t) => {
  const f = await fixture(t, { tool: 'docker-compose' });
  const query = createQuery(f.options);
  assert.equal((await query('docker-compose', ['version', '--format', 'json'], { executable: f.executable })).state, 'succeeded');
  assert.deepEqual(f.calls.map(({ file, args }) => ({ file, args })), [{ file: f.executable, args: ['version', '--format', 'json'] }]);
  await writeFile(f.executable, 'unverified plugin');
  assert.equal((await query('docker-compose', ['version', '--format', 'json'], { executable: f.executable })).state, 'not_run');
  assert.equal(f.calls.length, 1);
});

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kills = 0; child.kill = () => { child.kills++; return true; }; child.unref = () => {};
  return child;
}

test('query timeout은 runBounded에 전달되고 자기 자식만 중지하며 원문을 제거한다', { skip: WINDOWS !== true && WINDOWS }, async (t) => {
  const f = await fixture(t);
  const child = fakeChild(), unrelated = fakeChild();
  let spawnOptions;
  const query = createQuery({ ...f.options, run: (file, args, options) => runBounded(file, args, { ...options, spawnImpl: (_file, _args, input) => {
    spawnOptions = input;
    queueMicrotask(() => { child.stdout.write(SECRET); child.stderr.write(SECRET); });
    return child;
  } }) });
  const result = await query('node', ['--version'], { timeoutMs: 10 });
  assert.equal(result.state, 'timed_out');
  assert.equal(child.kills, 1); assert.equal(unrelated.kills, 0);
  assert.equal(spawnOptions.shell, false); assert.equal(spawnOptions.windowsHide, true);
  assert.deepEqual(spawnOptions.stdio, ['ignore', 'pipe', 'pipe']);
  assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
  assert.ok(!JSON.stringify(result).includes(SECRET));
  child.emit('close', 0); assert.equal(child.kills, 1);
});

test('미리 취소된 query는 runner를 호출하지 않고 실행 중 취소는 자기 자식만 중지한다', { skip: WINDOWS !== true && WINDOWS }, async (t) => {
  const f = await fixture(t);
  const preaborted = new AbortController(); preaborted.abort();
  assert.equal((await createQuery(f.options)('node', ['--version'], { signal: preaborted.signal })).state, 'not_run');
  assert.equal(f.calls.length, 0);
  const controller = new AbortController(), child = fakeChild();
  const query = createQuery({ ...f.options, run: (file, args, options) => {
    assert.equal(options.signal, controller.signal);
    return runBounded(file, args, { ...options, spawnImpl: () => { queueMicrotask(() => controller.abort()); return child; } });
  } });
  const result = await query('node', ['--version'], { signal: controller.signal });
  assert.equal(result.state, 'timed_out');
  assert.equal(child.kills, 1);
  assert.equal(child.stdout.destroyed, true); assert.equal(child.stderr.destroyed, true);
});
