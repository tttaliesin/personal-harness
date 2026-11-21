import test from 'node:test';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseOptions, formatReport, main } from '../src/cli.mjs';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const run = promisify(execFile);
const retiredActions = ['plan', 'apply', 'rollback', 'exception', 'validate', 'wsl-enable', 'wsl-register', 'wsl-tasks', 'wsl-unregister'];
const retiredOptions = [
  'execute', 'output', 'roles', 'versions', 'profile', 'plan', 'journal', 'role', 'reason', 'scope',
  'distro', 'linux-cwd', 'linux-tools', 'docker-context', 'image', 'image-readiness', 'compose-file',
  'service-config', 'services', 'rust-targets', 'task-file', 'task-name', 'confirm',
];

async function fixture(t) {
  const parent = await realpath(tmpdir());
  const root = await realpath(await mkdtemp(join(parent, 'windows-agent-cli-')));
  t.after(async () => {
    assert.equal(dirname(root), parent);
    assert.equal(await realpath(root), root);
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

test('doctor를 기본으로 선택하고 읽기 전용 점검 옵션을 유지한다', () => {
  const options = parseOptions([
    '--project', 'a path; Write-Output sample', '--format', 'json', '--languages', 'node,python,node',
    '--native', '--wsl', '--containers', '--process-compose', '--app', '--codex-executable', 'codex.exe',
    '--ide', '--storage', 'volume', '--github-auth', '--state-dir', 'legacy-state', '--timeout-ms', '100',
  ]);
  assert.equal(options.action, 'doctor');
  assert.equal(options.format, 'json');
  assert.ok(options.projectPath.endsWith('a path; Write-Output sample'));
  assert.deepEqual(options.languages, ['node', 'python']);
  for (const key of ['native', 'wsl', 'containers', 'processCompose', 'app', 'ide', 'githubAuth']) {
    assert.equal(options[key], true, key);
  }
  assert.equal(options.codexExecutable, resolve('codex.exe'));
  assert.equal(options.storage, resolve('volume'));
  assert.equal(options.stateDir, resolve('legacy-state'));
  assert.equal(options.timeoutMs, 100);
  assert.deepEqual(parseOptions(['doctor', '--languages', 'auto']), parseOptions([]));
});

test('지원하지 않는 언어·형식·제한 시간과 임의 위치 인수를 거부한다', () => {
  for (const args of [['--languages', 'ruby'], ['--format', 'yaml'], ['--timeout-ms', '5s'], ['--timeout-ms', '0'], ['--timeout-ms', '30001'], ['arbitrary']]) assert.throws(() => parseOptions(args));
});

test('이전 명령과 실행·설정·출력 저장 옵션을 거부한다', () => {
  for (const action of retiredActions) {
    assert.throws(() => parseOptions([action, '--help']), /지원하지 않는 명령/, action);
  }
  for (const option of retiredOptions) {
    assert.throws(() => parseOptions(['doctor', `--${option}`]), /지원하지 않는 옵션/, option);
  }
});

test('CLI는 제거된 명령과 옵션에 종료 코드 2를 반환하고 출력 경로를 만들지 않는다', async (t) => {
  const root = await fixture(t);
  const outputDir = join(root, 'PRIVATE_OUTPUT_TARGET');
  const cases = [
    { args: ['wsl-register', '--project', root], message: /지원하지 않는 명령/ },
    { args: ['doctor', '--execute'], message: /지원하지 않는 옵션/ },
    { args: ['--output=' + join(outputDir, 'report.json')], message: /지원하지 않는 옵션/ },
    { args: ['--format', 'invalid'], message: /--format은 text 또는 json/ },
  ];
  await Promise.all(cases.map(({ args, message }) => assert.rejects(run(process.execPath, [cli, ...args]), (error) => {
    assert.equal(error.code, 2);
    assert.equal(error.stdout, '');
    assert.match(error.stderr, /진단을 완료하지 못했습니다/);
    assert.match(error.stderr, message);
    assert.doesNotMatch(error.stderr, /PRIVATE_OUTPUT_TARGET/);
    return true;
  })));
  await assert.rejects(lstat(outputDir), { code: 'ENOENT' });
});

test('도움말은 읽기 전용 옵션을 안내하고 CLI 버전은 0.3.5를 유지한다', async () => {
  const [help, version] = await Promise.all([
    run(process.execPath, [cli, 'doctor', '-h']),
    run(process.execPath, [cli, '--version']),
  ]);
  assert.match(help.stdout, /Windows Agent Devkit 0\.3\.5/);
  assert.match(help.stdout, /읽기 전용/);
  assert.match(help.stdout, /--state-dir .+ 유지 사유를 조회/);
  for (const option of retiredOptions) assert.ok(!help.stdout.includes(`--${option}`), option);
  for (const action of retiredActions) assert.ok(!help.stdout.includes(action), action);
  assert.equal(version.stdout.trim(), '0.3.5');
});

test('한국어 텍스트는 미확인과 요구 위반을 구분한다', () => {
  const text = formatReport({ pluginVersion: '0.1.0', project: { root: 'C:/example' }, context: { platform: 'win32' }, checks: [{ checkId: 'NODE-01', status: 'unknown', message: '조회 보류' }, { checkId: 'PY-01', status: 'fail', message: '요구 위반' }], summary: { pass: 0, fail: 1, warn: 0, unknown: 1, skipped: 0 } });
  assert.match(text, /\[미확인\] NODE-01/);
  assert.match(text, /\[요구 위반\] PY-01/);
});

test('텍스트 보고서에서 버전 위반의 선언 근거와 다음 조치를 읽을 수 있다', () => {
  const text = formatReport({
    pluginVersion: '0.3.1', project: { root: 'C:/example' }, context: { platform: 'win32' },
    checks: [{
      checkId: 'NODE-01', status: 'fail', message: '관찰한 버전이 요구 범위를 벗어납니다.', observed: '26.1.0',
      requirement: [{ source: 'package.json', field: 'engines.node', kind: 'range', value: '>=24 <25' }],
      nextAction: '프로젝트가 지정한 버전을 선택합니다.',
    }],
    summary: { pass: 0, fail: 1, warn: 0, unknown: 0, skipped: 0 },
  });
  assert.match(text, /관찰: 26\.1\.0/);
  assert.match(text, /요구: >=24 <25 \(package\.json \/ engines\.node\)/);
  assert.match(text, /다음 조치: 프로젝트가 지정한 버전을 선택합니다\./);
});

test('doctor는 수동 명령과 이전 유지 사유를 보고하고 상태 파일을 보존한다', async (t) => {
  const root = await fixture(t);
  const projectPath = join(root, 'project');
  const stateDir = join(root, 'legacy-state');
  await mkdir(projectPath);
  const exceptionsDir = join(stateDir, 'exceptions');
  await mkdir(exceptionsDir, { recursive: true });
  const projectKey = process.platform === 'win32' ? projectPath.toLowerCase() : projectPath;
  const savedName = `${createHash('sha256').update(projectKey).digest('hex')}.json`;
  const savedPath = join(exceptionsDir, savedName);
  const exceptions = [{ projectPath, role: 'runtime-version-manager', reason: '기존 버전 관리자 유지', scope: 'project' }];
  const saved = JSON.stringify({ projectPath, exceptions });
  await writeFile(savedPath, saved);
  const calls = [];
  const inspect = async () => ({
    context: { platform: 'win32', processArchitecture: 'x64', cwd: projectPath,
      os: { name: 'Windows 11', build: '26100', architecture: '64-bit' },
      diagnosticShell: { name: 'pwsh', version: '7.6.0', profileApplied: false } },
    commands: {}, probes: {}, environment: {},
  });
  const query = async (tool, args, options) => {
    calls.push({ tool, args, options });
    return { state: 'not_found', stdout: '', stderr: '', exitCode: null };
  };
  let output = '';
  const write = process.stdout.write.bind(process.stdout);
  const capture = t.mock.method(process.stdout, 'write', (chunk, ...rest) => {
    if (typeof chunk === 'string' && chunk.startsWith('{')) {
      output += chunk;
      return true;
    }
    return write(chunk, ...rest);
  });
  try {
    assert.equal(await main(
      ['doctor', '--project', projectPath, '--containers', '--state-dir', stateDir, '--format', 'json'],
      { inspect, query },
    ), 1);
  } finally {
    capture.mock.restore();
  }
  const report = JSON.parse(output);
  assert.equal(report.pluginVersion, '0.3.5');
  assert.equal(report.checks.length, 30);
  assert.deepEqual(report.exceptions, exceptions);
  const dockerCommands = report.commandGuidance.filter(({ tool }) => tool === 'docker');
  assert.ok(dockerCommands.some(({ args }) => args[0] === 'version'));
  const formatted = formatReport(report);
  assert.match(formatted, /직접 실행할 명령/);
  for (const { tool, args, description } of dockerCommands) {
    assert.ok(formatted.includes(`  ${[tool, ...args].join(' ')}\n    ${description}`));
    assert.ok(!calls.some((call) => call.tool === tool && call.args.join(' ') === args.join(' ')));
  }
  assert.ok(calls.every((call) => call.options?.execute !== true));
  assert.deepEqual(await readdir(stateDir), ['exceptions']);
  assert.deepEqual(await readdir(exceptionsDir), [savedName]);
  assert.equal(await readFile(savedPath, 'utf8'), saved);
});
