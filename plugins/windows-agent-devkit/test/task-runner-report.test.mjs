import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { diagnose, P0_IDS, P1_IDS } from '../src/doctor.mjs';
import { analyzeProject } from '../src/project.mjs';
import { summarizeTaskRunners, collectTaskRunnerTools } from '../src/task-runner-checks.mjs';
import { formatReport } from '../src/cli.mjs';

const SECRET = 'TASK_RUNNER_PRIVATE_OUTPUT';
const outputs = { mise: 'mise 2026.11.9 windows-x64', task: 'Task version: v3.54.0', just: 'just 1.52.0', make: 'GNU Make 4.4.1' };
const workflowSource = '.github/workflows/check.yml';
const nodePackage = { name: 'example', version: '1.0.0' };
const npmManifest = JSON.stringify(nodePackage);
const npmLock = JSON.stringify({
  ...nodePackage, lockfileVersion: 3, packages: { '': nodePackage },
});
const goModule = 'module example.com/project\n\ngo 1.25.0\n';
const npmInstall = { run: 'npm ci' };
const nodeSteps = [{ run: 'node --test' }, { run: 'node --check a.js' }];
const goSteps = [{ run: 'go test ./...' }, { run: 'go build ./...' }];
const nativeSteps = [{ run: 'cc -c src/main.c -o main.o' }, { run: 'cc main.o -o app' }];
const taskSetup = { uses: 'go-task/setup-task@v1' };
const justSetup = { uses: 'extractions/setup-just@v3' };
const makeSetup = { run: 'choco install make -y' };
const runnerConfigs = [
  { tool: 'mise', source: 'mise.toml', definition: '[tasks]\ncheck = "node --test"\n', command: 'mise run check' },
  { tool: 'task', source: 'Taskfile.yml', definition: 'version: "3"\ntasks:\n  check:\n    cmds: [node --test]\n', command: 'task check' },
  { tool: 'just', source: 'Justfile', definition: 'check:\n    node --test\n', command: 'just check' },
  { tool: 'make', source: 'Makefile', definition: '.PHONY: check\ncheck:\n\tnode --test\n', command: 'make check' },
  { tool: 'npm', source: 'package.json', definition: '{"scripts":{"check":"node --test"}}', command: 'npm run check' },
];

function assertRecommendation(summary, action, tools = []) {
  const { recommendation } = summary;
  assert.equal(recommendation.action, action, recommendation.reason);
  assert.equal(recommendation.status, { keep: 'aligned', suggest: 'different', defer: 'unknown' }[action]);
  assert.equal(summary.recommended, tools.length === 1 ? tools[0] : null);
  assert.ok(Array.isArray(recommendation.tools));
  assert.deepEqual([...recommendation.tools].sort(), [...tools].sort());
  assert.ok(typeof recommendation.reason === 'string' && recommendation.reason.length > 0);
  assert.ok(recommendation.evidence && typeof recommendation.evidence === 'object');
}

function hostJob(steps, overrides = {}) {
  return { 'runs-on': 'windows-latest', steps: [{ uses: 'actions/checkout@v4' }, ...steps], ...overrides };
}

function workflow(jobs) {
  return JSON.stringify({ on: 'push', jobs });
}

function repeatedWorkflow(steps) {
  return workflow({ build: hostJob(steps), verify: hostJob(steps) });
}

test('CI의 mise 실행만으로 로컬 작업 채택이나 권장 차이를 확정하지 않는다', () => {
  const summary = summarizeTaskRunners({ metadata: { taskRunners: [], taskRunnerCI: [{ tool: 'mise', source: '.github/workflows/test.yml', state: 'declared', task: 'check' }] } });
  assertRecommendation(summary, 'defer');
  assert.deepEqual(summary.recommendation.observed, ['mise']);
  assert.equal(summary.recommendation.reason, 'ci_task_scope_unverified');
  const empty = summarizeTaskRunners({ metadata: { taskRunners: [{ tool: 'mise', state: 'declared', tasks: [] }] } });
  assertRecommendation(empty, 'defer');
});

async function fixture(t, files) {
  const root = await mkdtemp(path.join(tmpdir(), 'windows-agent-task-report-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, '.git'));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), content);
  }
  const host = { context: { platform: 'win32', cwd: root, processArchitecture: 'x64', os: { name: 'Microsoft Windows 11 Pro', build: '26300' }, diagnosticShell: { name: 'pwsh', version: '7.6.9', profileApplied: false } }, commands: {}, probes: {} };
  const calls = [];
  const query = async (tool, args, options = {}) => {
    calls.push({ tool, args, options });
    return outputs[tool] && args.length === 1 && args[0] === '--version'
      ? { state: 'succeeded', exitCode: 0, executable: `C:/tools/${tool}.exe`, stdout: `${outputs[tool]}\n${SECRET}`, stderr: SECRET }
      : { state: 'not_found', exitCode: null, stdout: '', stderr: '' };
  };
  return { root, host, calls, query, options: { projectPath: root, stateDir: path.join(root, '.state'), now: '2026-11-17T00:00:00Z', inspect: async () => host, query } };
}

async function summarizeFixture(t, files) {
  const { root } = await fixture(t, files);
  return summarizeTaskRunners(await analyzeProject(root));
}

test('다섯 실행기는 로컬 작업 정의가 있고 모든 루트 CI 호출이 일치하면 유지한다', async (t) => {
  for (const { tool, source, definition, command } of runnerConfigs) {
    await t.test(tool, async (t) => {
      const local = await summarizeFixture(t, { [source]: definition });
      assertRecommendation(local, 'keep', [tool]);
      assert.ok(local.proposal.preserve.includes('CI와 배포 경로'));
      assert.ok(local.proposal.preserve.includes('기존 작업 정의와 빌드·테스트 명령'));
      assert.deepEqual(local.tools, []);

      const matched = await summarizeFixture(t, {
        [source]: definition,
        [workflowSource]: workflow({ verify: hostJob([
          { run: `${tool} --version` },
          ...(tool === 'mise' ? [{ run: 'mise install' }] : []),
          ...(tool === 'npm' ? [{ run: 'npm install --no-audit' }] : []),
          { run: command },
        ]) }),
      });
      assertRecommendation(matched, 'keep', [tool]);
      assert.ok(JSON.stringify(matched.recommendation.evidence).includes(workflowSource));
      assert.equal(matched.recommendation.evidence.ci.length, 1);

      const mismatched = await summarizeFixture(t, {
        [source]: definition,
        [workflowSource]: workflow({
          build: hostJob([{ run: command }]),
          verify: hostJob([{ run: command.replace(/check$/, 'missing') }]),
        }),
      });
      assertRecommendation(mismatched, 'defer');
    });
  }
});

test('여러 실행기의 정의와 CI 호출이 일치하면 확인한 실행기를 모두 유지한다', async (t) => {
  const files = Object.fromEntries(runnerConfigs.map(({ source, definition }) => [source, definition]));
  const steps = runnerConfigs.map(({ command }) => ({ run: command }));
  const ci = workflow({ verify: hostJob(steps) });
  const summary = await summarizeFixture(t, { ...files, [workflowSource]: ci });
  assertRecommendation(summary, 'keep', runnerConfigs.map(({ tool }) => tool));

  const differentRunner = await summarizeFixture(t, {
    ...files,
    Makefile: '.PHONY: build\nbuild:\n\tnode --check a.js\n',
    [workflowSource]: ci,
  });
  assertRecommendation(differentRunner, 'defer');
});

test('루트의 npm 스크립트가 CI에도 연결된 경우 유지 권장과 확인 근거를 반환한다', async (t) => {
  const f = await fixture(t, {
    'package.json': JSON.stringify({ scripts: { build: 'node build.mjs', test: 'node --test', deploy: 'node deploy.mjs' } }),
    [workflowSource]: workflow({
      verify: hostJob([{ run: 'npm ci --ignore-scripts' }, { run: 'npm run build' }, { run: 'npm test' }, { run: 'npm run deploy' }]),
    }),
  });
  const report = await diagnose(f.options);
  assertRecommendation(report.taskRunners, 'keep', ['npm']);
  const { recommendation, ci } = report.taskRunners;
  assert.equal(recommendation.reason, 'ci_uses_root_npm_scripts');
  assert.deepEqual(recommendation.matchedTasks, ['build', 'test', 'deploy']);
  assert.equal(ci[0].kind, 'dependency_install');
  assert.equal(ci[0].task, undefined);
  assert.equal(report.checks.find((item) => item.checkId === 'REQ-01').status, 'pass');
  assert.deepEqual(report.commandGuidance.filter((item) => item.tool === 'npm').map((item) => item.args), [['run', 'build'], ['run', 'test']]);
  assert.match(formatReport(report), /npm run test/);
  assert.ok(!f.calls.some((item) => item.tool === 'npm' && item.args[0] === 'run'));
});

test('npm CI 호출은 명령 종류와 작업 디렉터리로 판정한다', async (t) => {
  const files = { 'package-lock.json': npmLock, [workflowSource]: workflow({ verify: hostJob([npmInstall]) }) };
  const summary = await summarizeFixture(t, { ...files, 'package.json': npmManifest });
  assertRecommendation(summary, 'defer');
  assert.deepEqual(summary.recommendation.observed, []);

  const manifest = JSON.stringify({ ...nodePackage, scripts: { test: 'node --test' } });
  const local = await summarizeFixture(t, { ...files, 'package.json': manifest });
  assertRecommendation(local, 'keep', ['npm']);
  assert.equal(local.recommendation.reason, 'existing_task_declarations');
  assert.equal(local.recommendation.matchedTasks, undefined);

  const unverified = await summarizeFixture(t, {
    ...files,
    'package.json': manifest,
    'app/package.json': npmManifest,
    [workflowSource]: workflow({
      verify: hostJob([npmInstall, { run: 'npm test', 'working-directory': './app' }]),
    }),
  });
  assertRecommendation(unverified, 'defer');
  assert.equal(unverified.recommendation.matchedTasks, undefined);
});

test('루트 npm 잠금 파일이나 고정 버전과 반복 Node.js CI가 있으면 npm scripts를 제안한다', async (t) => {
  await t.test('npm 잠금 파일과 같은 워크플로의 서로 다른 작업', async (t) => {
    const summary = await summarizeFixture(t, {
      'package.json': npmManifest,
      'package-lock.json': npmLock,
      [workflowSource]: repeatedWorkflow([npmInstall, ...nodeSteps]),
    });
    assertRecommendation(summary, 'suggest', ['npm']);
    assert.deepEqual(summary.ci.map(({ kind }) => kind), ['dependency_install', 'dependency_install']);
    assert.deepEqual(summary.recommendation.observed, []);
    assert.ok(JSON.stringify(summary.recommendation.evidence).includes(workflowSource));
  });

  await t.test('npm 고정 버전과 다른 워크플로의 이름이 같은 작업', async (t) => {
    const sameJob = workflow({ verify: hostJob(nodeSteps) });
    const summary = await summarizeFixture(t, {
      'package.json': JSON.stringify({ ...nodePackage, packageManager: 'npm@11.12.1' }),
      [workflowSource]: sameJob,
      '.github/workflows/another.yml': sameJob,
    });
    assertRecommendation(summary, 'suggest', ['npm']);
  });
});

test('루트 매니페스트와 npm 잠금 파일 또는 고정 버전이 함께 있어야 npm scripts를 제안한다', async (t) => {
  const cases = [
    ['매니페스트만 있음', { 'package.json': npmManifest }],
    ['잠금 파일만 있음', { 'package-lock.json': npmLock }],
    ['npm 호환 버전 범위만 있음', { 'package.json': JSON.stringify({ ...nodePackage, engines: { npm: '>=11' } }) }],
  ];
  for (const [label, files] of cases) {
    await t.test(label, async (t) => {
      const summary = await summarizeFixture(t, {
        ...files,
        [workflowSource]: repeatedWorkflow(nodeSteps),
      });
      assertRecommendation(summary, 'defer');
    });
  }
});

test('반복 CI가 다중언어 도구 또는 mise로 관리하는 언어 도구를 사용하면 mise를 제안한다', async (t) => {
  await t.test('로컬에 선언한 두 언어', async (t) => {
    const ci = repeatedWorkflow([
      { uses: 'actions/setup-go@v5', with: { 'go-version': '1.25.0' } },
      nodeSteps[0],
      goSteps[0],
    ]);
    const files = { 'package.json': npmManifest, [workflowSource]: ci };
    const ciOnlyGo = await summarizeFixture(t, files);
    assertRecommendation(ciOnlyGo, 'defer');

    const f = await fixture(t, { ...files, 'go.mod': goModule });
    const report = await diagnose(f.options);
    assertRecommendation(report.taskRunners, 'suggest', ['mise']);
    assert.ok(JSON.stringify(report.taskRunners.recommendation.evidence).includes(workflowSource));
    assert.ok(f.calls.every(({ options }) => options.execute !== true));
    assert.match(formatReport(report), /\bmise\b/i);
  });

  await t.test('mise로 고정한 Go 버전', async (t) => {
    const files = { 'go.mod': goModule, [workflowSource]: repeatedWorkflow(goSteps) };
    const withoutPin = await summarizeFixture(t, files);
    assertRecommendation(withoutPin, 'defer');

    const withPin = await summarizeFixture(t, { ...files, 'mise.toml': "[tools]\ngo = '1.25.0'\n" });
    assertRecommendation(withPin, 'suggest', ['mise']);
    assert.equal(withPin.recommendation.reason, 'mise_manages_workflow_tools');
  });
});

test('프로젝트의 고정 버전이나 모든 반복 작업의 준비 단계로 Task, just, Make를 선택한다', async (t) => {
  const candidates = [
    { tool: 'task', pin: ['mise.toml', '[tools]\ntask = "3.54.0"\n'], setup: taskSetup, steps: goSteps, files: { 'go.mod': goModule } },
    { tool: 'just', pin: ['.tool-versions', 'just 1.52.0\n'], setup: justSetup, steps: goSteps, files: { 'go.mod': goModule } },
    { tool: 'make', pin: ['mise.toml', '[tools]\nmake = "4.4.1"\n'], setup: makeSetup, steps: nativeSteps, files: { 'src/main.c': 'int main(void) { return 0; }\n' } },
  ];
  for (const { tool, pin: [source, contents], setup, steps, files } of candidates) {
    await t.test(`${tool} 루트 고정 버전`, async (t) => {
      const summary = await summarizeFixture(t, {
        ...files,
        [source]: contents,
        [workflowSource]: repeatedWorkflow(steps),
      });
      assertRecommendation(summary, 'suggest', [tool]);
      assert.ok(JSON.stringify(summary.recommendation.evidence).includes(source));
    });

    await t.test(`${tool} CI 준비`, async (t) => {
      const participating = [setup, ...steps];
      const f = await fixture(t, {
        ...files,
        [workflowSource]: workflow({
          build: hostJob(participating),
          verify: hostJob(participating),
          unrelated: hostJob([taskSetup, justSetup, nodeSteps[0]]),
        }),
      });
      const project = await analyzeProject(f.root);
      const summary = summarizeTaskRunners(project);
      assertRecommendation(summary, 'suggest', [tool]);
      const [repeated] = project.metadata.taskRunnerWorkflows;
      assert.deepEqual(repeated.jobs, [
        { source: workflowSource, job: 'build', steps: [2, 3] },
        { source: workflowSource, job: 'verify', steps: [2, 3] },
      ]);
      assert.deepEqual(repeated.prepared, [
        { tool, source: workflowSource, job: 'build', step: 1 },
        { tool, source: workflowSource, job: 'verify', step: 1 },
      ]);
      if (tool === 'make') {
        assert.equal(repeated.fileDependency, true);
        assert.deepEqual(repeated.operations, [
          { language: 'native', operation: 'compile' },
          { language: 'native', operation: 'link' },
        ]);
      }
    });
  }
});

test('Make 선택에 컴파일과 링크의 연결 근거가 없으면 반복 Node.js와 Go 절차에서도 보류한다', async (t) => {
  const summary = await summarizeFixture(t, {
    'package.json': npmManifest,
    'go.mod': goModule,
    [workflowSource]: repeatedWorkflow([makeSetup, nodeSteps[0], ...goSteps]),
  });
  assertRecommendation(summary, 'defer');
  assert.equal(summary.recommendation.reason, 'make_file_dependency_unverified');
});

test('Make를 준비해도 링크가 반복 절차의 컴파일 산출물을 사용하지 않으면 보류한다', async (t) => {
  const summary = await summarizeFixture(t, {
    [workflowSource]: repeatedWorkflow([makeSetup, nativeSteps[0], { run: 'cc other.o -o app' }]),
  });
  assertRecommendation(summary, 'defer');
  assert.equal(summary.recommendation.reason, 'make_file_dependency_unverified');
});

test('반복 작업 일부만 실행기를 준비하거나 CI와 프로젝트의 선택이 충돌하면 보류한다', async (t) => {
  const cases = [
    ['한 작업에서만 준비', {}, workflow({
      build: hostJob([taskSetup, ...goSteps]),
      verify: hostJob(goSteps),
    })],
    ['프로젝트 고정 버전과 CI가 다름', { '.tool-versions': 'just 1.52.0\n' }, repeatedWorkflow([taskSetup, ...goSteps])],
    ['CI가 서로 다른 실행기를 준비', { 'package.json': npmManifest }, workflow({
      build: hostJob([taskSetup, nodeSteps[0], ...goSteps]),
      verify: hostJob([justSetup, nodeSteps[0], ...goSteps]),
    })],
  ];
  for (const [label, files, ci] of cases) {
    await t.test(label, async (t) => {
      const summary = await summarizeFixture(t, { 'go.mod': goModule, ...files, [workflowSource]: ci });
      assertRecommendation(summary, 'defer');
    });
  }
});

test('두 개 이상의 같은 순서의 리터럴 명령이 서로 다른 루트 호스트 작업에 있어야 제안한다', async (t) => {
  const cases = [
    ['설치와 검사 한 개', repeatedWorkflow([npmInstall, nodeSteps[0]])],
    ['한 매트릭스 작업', workflow({
      verify: hostJob([...nodeSteps, ...nodeSteps], { strategy: { matrix: { node: [22, 24] } } }),
    })],
    ['역순', workflow({ build: hostJob(nodeSteps), verify: hostJob([...nodeSteps].reverse()) })],
    ['다른 명령 인수', workflow({
      build: hostJob(nodeSteps),
      verify: hostJob([nodeSteps[0], { run: 'node --check b.js' }]),
    })],
    ['동적 명령', repeatedWorkflow([nodeSteps[0], { run: 'node --check ${{ inputs.file }}' }])],
    ['다른 작업 디렉터리', workflow({
      build: hostJob(nodeSteps),
      verify: hostJob(nodeSteps, { defaults: { run: { 'working-directory': './app' } } }),
    })],
    ['컨테이너 작업', workflow({
      build: hostJob(nodeSteps),
      verify: hostJob(nodeSteps, { 'runs-on': 'ubuntu-latest', container: 'node:24' }),
    })],
  ];
  for (const [label, ci] of cases) {
    await t.test(label, async (t) => {
      const summary = await summarizeFixture(t, {
        'package.json': npmManifest,
        'package-lock.json': npmLock,
        [workflowSource]: ci,
      });
      assertRecommendation(summary, 'defer');
    });
  }
});

test('반복 CI가 있어도 기존 선언을 유지하고 확인되지 않은 호출은 보류한다', async (t) => {
  const files = { 'package.json': npmManifest, 'package-lock.json': npmLock };
  const local = await summarizeFixture(t, {
    ...files,
    Justfile: 'check:\n    node --test\n',
    [workflowSource]: repeatedWorkflow(nodeSteps),
  });
  assertRecommendation(local, 'keep', ['just']);

  const unverified = await summarizeFixture(t, {
    ...files,
    [workflowSource]: repeatedWorkflow([...nodeSteps, { run: 'just check' }]),
  });
  assertRecommendation(unverified, 'defer');
});

test('doctor가 실제 작업 파일을 탐지하고 버전만 조회하며 30개 계약과 소스를 보존한다', async (t) => {
  const source = 'version: "3"\ntasks:\n  check:\n    cmds:\n      - node marker.mjs\n';
  const f = await fixture(t, { 'Taskfile.yml': source, 'marker.mjs': 'throw new Error("must not execute");' });
  const report = await diagnose(f.options);
  assert.deepEqual(report.checks.map((item) => item.checkId), [...P0_IDS, ...P1_IDS]);
  assertRecommendation(report.taskRunners, 'keep', ['task']);
  assert.deepEqual(report.taskRunners.declarations.find((item) => item.tool === 'task')?.tasks, ['check']);
  assert.equal(report.taskRunners.tools.find((item) => item.tool === 'task')?.version, '3.54.0');
  assert.equal(report.taskRunners.tools[0].projectTaskExecution, 'not_run');
  assert.ok(f.calls.filter((item) => Object.hasOwn(outputs, item.tool)).every((item) => item.args.length === 1 && item.args[0] === '--version' && item.options.execute !== true));
  assert.ok(!Object.hasOwn(report, 'task'));
  assert.equal(await readFile(path.join(f.root, 'Taskfile.yml'), 'utf8'), source);
  assert.ok(!JSON.stringify(report).includes(SECRET));
  const text = formatReport(report);
  assert.match(text, /\btask\b/i);
  assert.match(text, /Taskfile.yml/);
  assert.match(text, /3\.54\.0/);
  assert.ok(!text.includes(SECRET));
});

test('동적 Taskfile이 있으면 반복 CI에도 판단을 보류한다', async (t) => {
  const f = await fixture(t, {
    'Taskfile.yml': 'version: "3"\nincludes:\n  shared: https://example.invalid/Taskfile.yml\ntasks:\n  check:\n    cmds: [echo check]\n',
    'package.json': npmManifest,
    'package-lock.json': npmLock,
    [workflowSource]: repeatedWorkflow(nodeSteps),
  });
  const report = await diagnose(f.options);
  assertRecommendation(report.taskRunners, 'defer');
  assert.equal(report.taskRunners.recommendation.reason, 'static_analysis_incomplete');
  assert.equal(report.checks.find((item) => item.checkId === 'REQ-01').status, 'unknown');
  assert.ok(f.calls.every((item) => item.options.execute !== true));
});

test('Makefile 선언만으로 Windows 필수 설치를 확정하지 않는다', async (t) => {
  const f = await fixture(t, { Makefile: '.PHONY: check\ncheck:\n\t@echo check\n' });
  const query = async () => ({ state: 'not_found', stdout: '', stderr: '', exitCode: null });
  const report = await diagnose({ ...f.options, query });
  assert.equal(report.taskRunners.tools.find((item) => item.tool === 'make')?.resolution, 'not_resolved');
  assert.equal(report.checks.find((item) => item.checkId === 'PATH-01').status, 'warn');
});

test('지원하지 않는 버전 출력과 조회 실패를 성공한 실행기로 바꾸지 않는다', async () => {
  for (const response of [{ state: 'succeeded', exitCode: 0, stdout: SECRET }, { state: 'failed', exitCode: 1, stdout: outputs.just }, { state: 'timed_out', exitCode: null }]) {
    const tools = await collectTaskRunnerTools({ summary: { declarations: [{ tool: 'just' }], ci: [] }, host: { commands: {} }, query: async () => response });
    assert.equal(tools[0].status, 'unknown');
    assert.equal(tools[0].version, null);
    assert.ok(!JSON.stringify(tools).includes(SECRET));
  }
});
