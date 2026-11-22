import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, readdir, realpath, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { diagnose } from '../src/doctor.mjs';
import { parseOptions, formatReport } from '../src/cli.mjs';
import { analyzeProject } from '../src/project.mjs';
import { collectInfrastructure } from '../src/infrastructure.mjs';
import { isReadOnlyQuery } from '../src/query.mjs';

const NOW = '2026-11-17T12:00:00Z';
const SECRET = 'INTEGRATION_PRIVATE_SENTINEL';
const IDS = ['ENV-01', 'ENV-02', 'SH-01', 'PATH-01', 'REQ-01', 'PKG-01', 'GIT-01', 'GIT-02', 'NODE-01', 'NODE-02', 'PY-01', 'PY-02', 'GO-01', 'RUST-01', 'ZIG-01', 'DOTNET-01', 'TOOLS-01', 'WSL-01', 'CTR-01', 'LD-01', 'PC-01', 'RCM-01', 'RUST-02', 'WSL-02', 'CTR-02', 'PC-02', 'IDE-01', 'CODEX-01', 'AUX-01', 'STORE-01'];
const success = (data = '') => ({ state: 'succeeded', exitCode: 0, stdout: typeof data === 'string' ? data : JSON.stringify(data), stderr: '' });
const candidate = (tool, executable) => ({ name: `${tool}.exe`, commandType: 'Application', path: executable });

async function fixture(t, files = {}) {
  const parent = await realpath(tmpdir());
  const base = await realpath(await mkdtemp(path.join(parent, 'windows-agent-integration-')));
  const identity = await lstat(base);
  const root = path.join(base, 'project');
  await mkdir(path.join(root, '.git'), { recursive: true });
  t.after(async () => {
    assert.equal(path.dirname(base), parent);
    assert.ok(path.basename(base).startsWith('windows-agent-integration-'));
    assert.equal(await realpath(base), base);
    const current = await lstat(base);
    assert.equal(current.ino, identity.ino);
    assert.equal(current.dev, identity.dev);
    await rm(base, { recursive: true });
  });
  for (const [name, content] of Object.entries(files)) {
    const target = path.resolve(root, name);
    const relative = path.relative(root, target);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, typeof content === 'object' ? JSON.stringify(content) : content);
  }
  const host = {
    context: { platform: 'win32', processArchitecture: 'x64', cwd: root,
      os: { name: 'Microsoft Windows 11 Pro', build: '26100', architecture: '64-bit' },
      diagnosticShell: { name: 'pwsh', version: '7.6.0', profileApplied: false } },
    commands: {}, probes: {}, environment: {},
  };
  const calls = [], inspections = [];
  const query = async (tool, args, options = {}) => {
    calls.push({ tool, args, options });
    return { state: 'not_found', exitCode: null, stdout: '', stderr: '', reason: 'fixture_tool_absent' };
  };
  const options = { projectPath: root, stateDir: path.join(base, 'state'), now: NOW, query,
    inspect: async (input) => { inspections.push(input); return host; } };
  return { base, root, host, calls, inspections, options };
}

function check(report, id) {
  const found = report.checks.find((item) => item.checkId === id);
  assert.ok(found, id);
  return found;
}

test('통합 doctor는 30개 ID를 한 번씩 보고하고 지원 판정 이후의 상태를 집계한다', async (t) => {
  const f = await fixture(t, { 'package.json': { engines: { node: '>=24 <25' } } });
  f.host.commands.node = [candidate('node', path.join(f.base, 'node.exe'))];
  f.host.probes.node = { state: 'succeeded', exitCode: 0, version: '26.0.0', executable: f.host.commands.node[0].path, arguments: ['--version'] };
  const report = await diagnose(f.options);
  assert.deepEqual(report.checks.map((item) => item.checkId), IDS);
  assert.equal(new Set(report.checks.map((item) => item.checkId)).size, 30);
  assert.deepEqual(report.deferredChecks, []);
  const counts = { pass: 0, fail: 0, warn: 0, unknown: 0, skipped: 0 };
  for (const item of report.checks) { assert.ok(Object.hasOwn(counts, item.status)); counts[item.status]++; }
  assert.deepEqual(report.summary, counts);
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 30);
  assert.equal(check(report, 'NODE-01').reason, 'version_mismatch');
  assert.equal(check(report, 'ENV-01').support.status, 'out_of_support');
  assert.equal(check(report, 'ENV-01').status, 'warn');
  for (const id of ['RUST-02', 'WSL-02', 'CTR-02', 'PC-02']) assert.equal(check(report, id).execution, 'not_run');
  assert.ok(f.calls.every(({ tool, args, options }) => isReadOnlyQuery(tool, args) && options.execute !== true));
  const text = formatReport(report);
  for (const id of IDS) assert.equal(text.split('\n').filter((line) => line.includes(`] ${id}:`)).length, 1, id);
  assert.ok(text.includes(`요구 위반 ${counts.fail}`));
});

test('devcontainer와 단독 Compose의 호스트 언어 요구를 CLI 옵션까지 연결한다', async (t) => {
  const cases = [
    { name: '선택한 devcontainer', files: { '.devcontainer/devcontainer.json': { image: 'node:24' } }, flags: [], expected: 'skipped', hostState: 'not_required', node: false },
    { name: '단독 Compose', files: { 'compose.yaml': 'services: {db: {image: "postgres:17"}}\n' }, flags: [], expected: 'fail', hostState: 'required', node: true },
    { name: 'devcontainer의 native 재선택', files: { '.devcontainer/devcontainer.json': { image: 'node:24' } }, flags: ['--native'], expected: 'fail', hostState: 'not_required', node: true },
    { name: '해석하지 못한 devcontainer', files: { '.devcontainer/devcontainer.json': '{invalid' }, flags: [], expected: 'unknown', hostState: 'unknown', node: false },
  ];
  for (const scenario of cases) await t.test(scenario.name, async (st) => {
    const f = await fixture(st, { 'package.json': { engines: { node: '>=24 <25' } }, ...scenario.files });
    const options = parseOptions(['doctor', '--project', f.root, ...scenario.flags]);
    const report = await diagnose({ ...f.options, ...options, now: NOW, stateDir: f.options.stateDir });
    assert.equal(check(report, 'NODE-01').status, scenario.expected);
    assert.equal(report.project.execution.hostLanguages.node, scenario.hostState);
    assert.equal(f.inspections[0].tools.includes('node'), scenario.node);
    assert.equal(f.inspections[0].tools.includes('docker'), scenario.hostState !== 'unknown');
    assert.equal(check(report, 'CTR-02').execution, 'not_run');
  });
});

test('이전 실행 옵션을 API에 전달해도 Compose는 메타데이터와 확인 명령만 보고한다', async (t) => {
  const f = await fixture(t, { 'compose.yaml': 'services: {db: {image: "postgres:17"}}\n' });
  const docker = path.join(f.base, 'Docker', 'Docker', 'resources', 'bin', 'docker.exe');
  const compose = path.join(f.base, 'Docker', 'Docker', 'resources', 'cli-plugins', 'docker-compose.exe');
  f.host.commands.docker = [candidate('docker', docker)];
  f.host.probes.docker = { state: 'succeeded', version: '29.0.0', exitCode: 0 };
  const calls = [];
  const query = async (tool, args, options = {}) => {
    calls.push({ tool, args, options });
    if (tool === 'docker-compose') {
      assert.equal(options.executable, compose);
      assert.deepEqual(args, ['version', '--format', 'json']);
      return success({ version: 'v2.40.0', private: SECRET });
    }
    if (tool !== 'docker') return f.options.query(tool, args, options);
    if (args[0] === 'context' && args[1] === 'show') return success('local');
    if (args[0] === 'context' && args[1] === 'inspect') return success([{ Endpoints: { docker: { Host: `ssh://user:${SECRET}@example.test` } } }]);
    assert.fail(`기본 진단에 허용하지 않은 호출: ${tool} ${args.join(' ')}`);
  };
  const report = await diagnose({ ...f.options, query, execute: true, distro: 'Ubuntu', linuxCwd: '/work', dockerContext: 'local', image: 'local:test', serviceConfig: 'process-compose.yaml', services: ['web'] });
  for (const id of ['RUST-02', 'WSL-02', 'CTR-02', 'PC-02']) {
    assert.equal(check(report, id).reason, 'manual_confirmation');
    assert.equal(check(report, id).execution, 'not_run');
  }
  assert.ok(!Object.hasOwn(report, 'validation') && !Object.hasOwn(report, 'task'));
  assert.equal(check(report, 'CTR-01').observed.engine, 'not_contacted');
  assert.equal(check(report, 'CTR-01').observed.context.endpointKind, 'remote-ssh');
  assert.equal(check(report, 'CTR-01').observed.compose.method, 'verified_direct_plugin');
  assert.equal(check(report, 'CTR-01').status, 'pass');
  assert.deepEqual(calls.filter((call) => call.tool === 'docker').map((call) => call.args), [['context', 'show'], ['context', 'inspect', 'local']]);
  assert.equal(calls.filter((call) => call.tool === 'docker-compose').length, 1);
  assert.ok(calls.every((call) => call.options.execute !== true));
  assert.deepEqual(report.commandGuidance.filter((item) => item.tool === 'docker').map((item) => item.args), [['version'], ['compose', 'ps']]);
  assert.ok(!JSON.stringify(report).includes(SECRET));
});

test('Docker context는 성공한 조회와 알려진 endpoint가 모두 있어야 통과한다', async (t) => {
  const f = await fixture(t, { 'compose.yaml': 'services: {db: {image: "postgres:17"}}\n' });
  f.host.commands.docker = [candidate('docker', path.join(f.base, 'docker.exe'))];
  f.host.probes.docker = { state: 'succeeded', version: '29.0.0', exitCode: 0 };
  const project = await analyzeProject(f.root);
  const failed = { state: 'failed', exitCode: 1, stdout: '', stderr: SECRET };
  for (const [name, selected, inspected, expected] of [
    ['show 실패', failed, success([{ Endpoints: { docker: { Host: 'npipe:////./pipe/docker_engine' } } }]), 'unknown'],
    ['inspect 실패의 JSON', success('local'), { ...success([{ Endpoints: { docker: { Host: 'npipe:////./pipe/docker_engine' } } }]), state: 'failed', exitCode: 1 }, 'unknown'],
    ['알 수 없는 endpoint', success('local'), success([{ Endpoints: { docker: { Host: 'unknown://endpoint' } } }]), 'unknown'],
    ['성공한 알려진 endpoint', success('local'), success([{ Endpoints: { docker: { Host: 'npipe:////./pipe/docker_engine' } } }]), 'pass'],
  ]) await t.test(name, async () => {
    const report = await collectInfrastructure({ project, host: f.host, query: async (tool, args) => {
      if (tool === 'docker-compose') return success({ version: 'v2.40.0' });
      return args[1] === 'show' ? selected : inspected;
    } });
    assert.equal(check(report, 'CTR-01').observed.compose.version, '2.40.0');
    assert.equal(check(report, 'CTR-01').status, expected);
    assert.ok(!JSON.stringify(report).includes(SECRET));
  });
});

test('Node 관리자는 래퍼 실행 없이 설치 패키지 메타데이터로 버전 일치·불일치·미확인을 구분한다', async (t) => {
  for (const [version, expected] of [['10.5.0', 'pass'], ['9.15.0', 'fail'], [null, 'unknown']]) await t.test(String(version), async (st) => {
    const f = await fixture(st, { 'package.json': { packageManager: 'pnpm@10.5.0' }, 'pnpm-lock.yaml': 'lockfileVersion: "9.0"\n' });
    const directory = path.join(f.base, 'tools');
    await mkdir(directory);
    await writeFile(path.join(directory, 'pnpm.cmd'), `@echo ${SECRET}\n`);
    f.host.commands.pnpm = [candidate('pnpm', path.join(directory, 'pnpm.cmd'))];
    if (version) {
      await mkdir(path.join(directory, 'node_modules', 'pnpm'), { recursive: true });
      await writeFile(path.join(directory, 'node_modules', 'pnpm', 'package.json'), JSON.stringify({ name: 'pnpm', version, scripts: { preinstall: SECRET } }));
    }
    const project = await analyzeProject(f.root);
    assert.equal(project.requirements.node.metadata.packageManagerRequests[0].value, '10.5.0');
    const report = await collectInfrastructure({ project, host: f.host, query: f.options.query });
    const manager = check(report, 'NODE-02');
    assert.equal(manager.status, expected);
    assert.equal(manager.execution, 'not_run');
    assert.equal(manager.observed.selected[0].version, version);
    assert.equal(manager.observed.selected[0].method, 'installed_package_metadata');
    assert.deepEqual(f.calls, []);
    assert.ok(!JSON.stringify(report).includes(SECRET));
  });
});

test('Go PE build metadata는 go 프로세스를 실행하지 않고 통합 런타임 판정에 반영한다', { skip: process.platform !== 'win32' && '실제 Windows 절대 경로 검증을 사용하는 정적 PE fixture' }, async (t) => {
  const f = await fixture(t, { 'go.mod': 'module example.test/app\n\ngo 1.27.0\n' });
  const binary = Buffer.alloc(512);
  binary.write('MZ'); binary.writeUInt32LE(128, 60); binary.write('PE\0\0', 128, 'binary');
  Buffer.from([0xff, 0x20, ...Buffer.from('Go buildinf:')]).copy(binary, 256);
  binary[271] = 2;
  const version = 'go1.27.3'; binary[288] = version.length; binary.write(version, 289);
  binary.write(SECRET, 400);
  const executable = path.join(f.base, 'go.exe');
  await writeFile(executable, binary);
  f.host.commands.go = [candidate('go', executable)];
  f.host.probes.go = { state: 'not_run', version: null };
  const report = await diagnose(f.options);
  const runtime = check(report, 'GO-01');
  assert.equal(runtime.status, 'pass');
  assert.equal(runtime.observed, version);
  assert.equal(runtime.method, 'pe_go_buildinfo');
  assert.equal(runtime.execution, 'not_run');
  assert.equal(runtime.compatibility, 'satisfied');
  assert.equal(runtime.support.status, 'in_support');
  assert.ok(f.calls.every((call) => call.tool !== 'go'));
  assert.ok(!JSON.stringify(report).includes(SECRET));
});

test('통합 보고서는 선언의 비밀 값과 조회 원문을 노출하지 않고 프로젝트를 보존한다', async (t) => {
  const manifest = JSON.stringify({ engines: { node: '>=24 <25' }, scripts: { test: `echo ${SECRET}` } });
  const f = await fixture(t, { 'package.json': manifest, '.env': `TOKEN=${SECRET}\n`, 'process-compose.yaml': `processes:\n  web:\n    command: echo ${SECRET}\n    environment:\n      TOKEN: ${SECRET}\n` });
  const before = (await readdir(f.root, { recursive: true })).sort();
  const report = await diagnose({ ...f.options, query: async (tool, args) => {
    if (tool === 'git' && args[0] === '--version') return success(`git version 2.52.0\n${SECRET}`);
    return { state: 'failed', exitCode: 1, stdout: SECRET, stderr: SECRET, reason: SECRET };
  } });
  assert.ok(!JSON.stringify(report).includes(SECRET));
  assert.ok(!formatReport(report).includes(SECRET));
  assert.deepEqual((await readdir(f.root, { recursive: true })).sort(), before);
  assert.equal(await readFile(path.join(f.root, 'package.json'), 'utf8'), manifest);
  assert.equal(await readFile(path.join(f.root, '.env'), 'utf8'), `TOKEN=${SECRET}\n`);
});

test('WSL 호스트 버전만 조회되면 WSL-01은 배포판 확인을 완료하지 않는다', async (t) => {
  const f = await fixture(t);
  const version = { state: 'succeeded', exitCode: 0, arguments: ['--version'], version: '2.7.3.0' };
  const list = { state: 'failed', exitCode: 4294967295, arguments: ['--list', '--verbose'] };
  f.host.probes.wsl = { ...version, data: { queries: [version, list] } };
  const options = { ...f.options, wsl: true };
  const partial = check(await diagnose(options), 'WSL-01');
  assert.equal(partial.status, 'unknown');
  assert.equal(partial.reason, 'wsl_host_metadata_incomplete');
  assert.equal(partial.observed.queries[1].state, 'failed');

  f.host.probes.wsl.data = { distributions: [{ name: 'FixtureLinux', generation: 2 }],
    queries: [version, { ...list, state: 'succeeded', exitCode: 0 }] };
  assert.equal(check(await diagnose(options), 'WSL-01').status, 'pass');
});

test('앱 설치 목록의 installed·available을 구분하고 --app 선택에만 미설치 실패를 반영한다', async (t) => {
  const f = await fixture(t);
  const entry = { name: 'windows-agent-devkit', version: '0.2.0' };
  for (const [name, app, response, expected] of [
    ['미선택', false, success({ installed: [], available: [entry] }), 'skipped'],
    ['설치 목록 비어 있음', true, success({ installed: [], available: [] }), 'fail'],
    ['available만 존재', true, success({ installed: [], available: [entry] }), 'fail'],
    ['installed에 존재', true, success({ installed: [entry], available: [] }), 'pass'],
    ['조회 실패', true, { state: 'failed', exitCode: 1, stdout: SECRET, stderr: SECRET }, 'unknown'],
    ['잘못된 JSON', true, success(SECRET), 'unknown'],
  ]) await t.test(name, async () => {
    const calls = [];
    const report = await diagnose({ ...f.options, app, query: async (tool, args, options = {}) => {
      if (tool !== 'codex') return f.options.query(tool, args, options);
      calls.push({ args, options }); return response;
    } });
    const appCheck = check(report, 'CODEX-01');
    assert.equal(appCheck.status, expected);
    assert.equal(calls.length, app ? 1 : 0);
    if (app) assert.deepEqual(calls[0].args, ['plugin', 'list', '--marketplace', 'windows-agent-devkit-local', '--json']);
    if (expected === 'fail') assert.equal(appCheck.reason, 'local_plugin_not_installed');
    if (expected === 'pass') assert.equal(appCheck.observed.skillInvocation, 'separate_app_evidence_required');
    assert.ok(!JSON.stringify(report).includes(SECRET));
  });
});

test('이전 버전의 프로젝트 유지 사유를 파일 변경 없이 보고한다', async (t) => {
  const f = await fixture(t);
  const projectPath = await realpath(f.root);
  const projectKey = process.platform === 'win32' ? projectPath.toLowerCase() : projectPath;
  const key = createHash('sha256').update(projectKey).digest('hex');
  const folder = path.join(f.options.stateDir, 'exceptions');
  await mkdir(folder, { recursive: true });
  const saved = path.join(folder, `${key}.json`);
  const exceptions = [{ projectPath, role: 'runtime-version-manager', reason: '기존 버전 관리자 유지', scope: 'project' }];
  const contents = JSON.stringify({ projectPath, exceptions });
  await writeFile(saved, contents);
  const report = await diagnose(f.options);
  assert.deepEqual(report.exceptions, exceptions);
  assert.deepEqual(check(report, 'RCM-01').exceptions, exceptions);
  assert.deepEqual(await readdir(folder), [path.basename(saved)]);
  assert.equal(await readFile(saved, 'utf8'), contents);
});
