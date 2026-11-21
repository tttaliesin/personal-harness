import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReport, diagnose, P0_IDS, P1_IDS } from '../src/doctor.mjs';

function fixture() {
  const requirements = Object.fromEntries(['node', 'python', 'go', 'rust', 'zig', 'dotnet'].map((name) => [name, { state: 'not_required', versionRequests: [], packageManagers: [], lockFiles: [], metadata: {}, notes: [] }]));
  const project = { root: 'C:/example/app', requirements, files: [], environment: { containers: 'not_required', processCompose: 'not_required' }, issues: [] };
  const host = { context: { platform: 'win32', os: { name: 'Microsoft Windows 11 Pro', version: '10.0', build: '26100', architecture: '64-bit' }, processArchitecture: 'x64', cwd: project.root, diagnosticShell: { name: 'pwsh', path: 'C:/example/pwsh.exe', version: '7.6.9', profileApplied: false } }, commands: {}, probes: {} };
  return { project, host };
}

function nodeRequirement(project, host, version = '24.18.1') {
  project.requirements.node.state = 'required';
  project.requirements.node.versionRequests.push({ source: 'package.json', field: 'engines.node', kind: 'range', value: '>=24 <25' });
  host.commands.node = [{ name: 'node', commandType: 'Application', path: 'C:/example/fnm/node.exe', fileVersion: null, productVersion: null }];
  host.probes.node = { state: 'succeeded', executable: host.commands.node[0].path, arguments: ['--version'], exitCode: 0, version, data: null, reason: null };
}

test('P0 22개와 후속 P1 8개를 분리하고 결과 상태를 모두 집계한다', () => {
  const { project, host } = fixture();
  const report = buildReport(project, host);
  assert.deepEqual(report.checks.map((check) => check.checkId), P0_IDS);
  assert.equal(new Set(report.checks.map((check) => check.checkId)).size, 22);
  assert.deepEqual(report.deferredChecks, P1_IDS);
  assert.equal(Object.values(report.summary).reduce((sum, count) => sum + count, 0), 22);
  assert.ok(report.checks.every((check) => check.support.status === 'unknown'));
});

test('작동하는 기존 Node 관리자와 mise 권장 차이를 기능 위반으로 섞지 않는다', () => {
  const { project, host } = fixture();
  nodeRequirement(project, host);
  const report = buildReport(project, host);
  assert.equal(report.checks.find((check) => check.checkId === 'NODE-01').status, 'pass');
  const recommendation = report.checks.find((check) => check.checkId === 'RCM-01');
  assert.equal(recommendation.status, 'warn');
  assert.equal(recommendation.recommendation.status, 'different');
  assert.ok(recommendation.proposal.preserve.includes('패키지 관리자와 잠금 파일'));
  assert.equal(report.checks.find((check) => check.checkId === 'NODE-01').support.status, 'unknown');
});

test('실제 실행 버전이 선언을 위반할 때만 버전 위반으로 보고한다', () => {
  const { project, host } = fixture();
  nodeRequirement(project, host, '26.13.1');
  const check = buildReport(project, host).checks.find((item) => item.checkId === 'NODE-01');
  assert.equal(check.status, 'fail');
  assert.equal(check.reason, 'version_mismatch');
  assert.equal(check.execution, 'succeeded');
});

test('조회 실패와 시간 초과를 버전 위반으로 바꾸지 않는다', () => {
  for (const state of ['failed', 'timed_out', 'not_run']) {
    const { project, host } = fixture();
    nodeRequirement(project, host);
    host.probes.node = { ...host.probes.node, state, version: null, reason: '조회 보류' };
    const check = buildReport(project, host).checks.find((item) => item.checkId === 'NODE-01');
    assert.equal(check.status, 'unknown');
    assert.equal(check.compatibility, 'unknown');
  }
});

test('명령 해석 실패를 컴퓨터 전체의 미설치로 단정하지 않는다', () => {
  const { project, host } = fixture();
  project.requirements.node.state = 'required';
  const check = buildReport(project, host).checks.find((item) => item.checkId === 'NODE-01');
  assert.equal(check.status, 'fail');
  assert.equal(check.reason, 'command_not_resolved');
  assert.equal(check.resolution, 'not_resolved');
  assert.doesNotMatch(check.message, /미설치/);
});

test('명시한 언어 옵션으로도 선언 오류를 요구 없음이나 통과로 덮지 않는다', () => {
  const { project, host } = fixture();
  project.requirements.node.state = 'unknown';
  const report = buildReport(project, host, { languages: ['node'] });
  assert.equal(report.checks.find((check) => check.checkId === 'NODE-01').status, 'unknown');
  assert.equal(project.requirements.node.state, 'unknown');
});

test('언어 요구가 없는 프로젝트는 런타임과 Nu 설치를 요구하지 않는다', () => {
  const { project, host } = fixture();
  const report = buildReport(project, host);
  for (const id of ['NODE-01', 'PY-01', 'GO-01', 'RUST-01', 'ZIG-01', 'DOTNET-01', 'TOOLS-01']) assert.equal(report.checks.find((check) => check.checkId === id).status, 'skipped');
  assert.ok(!report.checks.some((check) => /Nu 설치/.test(check.message)));
});

test('셸 버전 미확인을 권장 차이로 확정하지 않는다', () => {
  const { project, host } = fixture();
  host.context.diagnosticShell.version = null;
  const checks = buildReport(project, host).checks;
  for (const id of ['SH-01', 'RCM-01']) {
    const check = checks.find((item) => item.checkId === id);
    assert.equal(check.status, 'unknown');
    assert.equal(check.recommendation.status, 'unknown');
  }
});

test('서로 다른 잠금 파일은 런타임 실패와 분리해 경고한다', () => {
  const { project, host } = fixture();
  nodeRequirement(project, host);
  project.requirements.node.lockFiles = ['package-lock.json', 'yarn.lock'];
  const checks = buildReport(project, host).checks;
  assert.equal(checks.find((check) => check.checkId === 'NODE-01').status, 'pass');
  assert.equal(checks.find((check) => check.checkId === 'NODE-02').status, 'warn');
});

test('컨테이너·Process Compose 요구는 메타데이터와 실제 기동을 구분한다', () => {
  const { project, host } = fixture();
  project.environment.containers = 'required';
  project.environment.processCompose = 'required';
  project.files.push('compose.yaml', 'process-compose.yaml');
  const checks = buildReport(project, host).checks;
  for (const id of ['CTR-01', 'LD-01', 'PC-01']) {
    const check = checks.find((item) => item.checkId === id);
    assert.equal(check.status, 'unknown');
    assert.equal(check.execution, 'not_run');
  }
});

test('실행환경 선언의 미확인은 요구 없음으로 생략하지 않는다', () => {
  const { project, host } = fixture();
  project.environment.containers = 'unknown';
  project.environment.processCompose = 'unknown';
  const checks = buildReport(project, host).checks;
  for (const id of ['CTR-01', 'LD-01', 'PC-01']) {
    const check = checks.find((item) => item.checkId === id);
    assert.equal(check.status, 'unknown');
    assert.equal(check.applicability, 'unknown');
  }
});

test('컨테이너 프로젝트의 언어 요구를 호스트 설치 요구로 확정하지 않는다', () => {
  const { project, host } = fixture();
  nodeRequirement(project, host);
  host.commands.node = [];
  project.environment.containers = 'unknown';
  assert.equal(buildReport(project, host).checks.find((check) => check.checkId === 'NODE-01').status, 'unknown');
  assert.equal(buildReport(project, host, { native: true }).checks.find((check) => check.checkId === 'NODE-01').status, 'fail');
  assert.equal(buildReport(project, host, { languages: ['node'] }).checks.find((check) => check.checkId === 'NODE-01').status, 'fail');
});

test('프로젝트 파일을 보존하며 선언에서 요청 도구만 선택한다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'windows-agent-devkit-doctor-'));
  try {
    const manifest = JSON.stringify({ engines: { node: '>=24 <25' } });
    await writeFile(join(directory, 'package.json'), manifest);
    await writeFile(join(directory, '.env'), 'PRIVATE_SENTINEL=do-not-report\n');
    const before = (await readdir(directory)).sort();
    let requested;
    const { host } = fixture();
    host.commands.node = [{ name: 'node', commandType: 'Application', path: 'C:/example/node.exe' }];
    host.probes.node = { state: 'succeeded', executable: 'C:/example/node.exe', arguments: ['--version'], exitCode: 0, version: '24.18.1' };
    const report = await diagnose({ projectPath: directory, inspect: async (options) => { requested = options; return host; } });
    assert.deepEqual(requested.tools, ['git', 'node']);
    assert.deepEqual((await readdir(directory)).sort(), before);
    assert.equal(await readFile(join(directory, 'package.json'), 'utf8'), manifest);
    assert.equal(await readFile(join(directory, '.env'), 'utf8'), 'PRIVATE_SENTINEL=do-not-report\n');
    assert.doesNotMatch(JSON.stringify(report), /do-not-report|PRIVATE_SENTINEL/);
  } finally {
    assert.ok(directory.startsWith(join(tmpdir(), 'windows-agent-devkit-doctor-')));
    await rm(directory, { recursive: true, force: true });
  }
});
