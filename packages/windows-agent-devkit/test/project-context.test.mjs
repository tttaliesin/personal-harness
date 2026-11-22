import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, realpath, lstat, rm, symlink, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectInfrastructure } from '../src/infrastructure.mjs';
import { analyzeProject } from '../src/project.mjs';

const LANGUAGES = ['node', 'python', 'go', 'rust', 'zig', 'dotnet'];
const PREFIX = 'windows-agent-devkit-context-';
async function fixture(t, files = {}) {
  const base = await realpath(tmpdir());
  const root = await realpath(await mkdtemp(path.join(base, PREFIX)));
  const created = await lstat(root);
  t.after(async () => {
    assert.equal(path.dirname(root), base);
    assert.ok(path.basename(root).startsWith(PREFIX));
    const info = await lstat(root);
    assert.equal(info.dev, created.dev);
    assert.equal(info.ino, created.ino);
    assert.ok(info.isDirectory() && !info.isSymbolicLink());
    assert.equal(await realpath(root), root);
    await rm(root, { recursive: true });
  });
  for (const [name, value] of Object.entries({ '.git': null, ...files })) {
    const target = path.resolve(root, name), relative = path.relative(root, target);
    assert.ok(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
    await mkdir(path.dirname(target), { recursive: true });
    if (value === null) await mkdir(target);
    else await writeFile(target, typeof value === 'object' && !Buffer.isBuffer(value) ? JSON.stringify(value) : value);
  }
  return root;
}
const values = (project, language) => project.requirements[language].versionRequests.map((entry) => entry.value);

test('표준 TOML의 다중 행 문자열·날짜·배열 테이블은 허용하되 알려진 필드만 반환한다', async (t) => {
  const root = await fixture(t, {
    'pyproject.toml': 'project.requires-python = """>=3.12"""\n[tool.private]\ndate = 2026-11-17T12:30:00Z\n[[tool.private.sources]]\nurl = "https://user:보안비밀@example.test"\n',
    'mise.toml': '[tools]\nnode = """24.10.0"""\n[env]\nTOKEN = "보안비밀"\n',
  });
  const project = await analyzeProject(root);
  assert.deepEqual(values(project, 'python'), ['>=3.12']);
  assert.deepEqual(values(project, 'node'), ['24.10.0']);
  assert.deepEqual(project.issues, []);
  assert.ok(!JSON.stringify(project).includes('보안비밀'));
});

test('TOML의 위험한 키·과도한 중첩·중복 키는 원문 없이 미확인으로 남긴다', async (t) => {
  for (const text of ['[tools]\nnode="24"\n__proto__.x="보안비밀"', '[tools]\nnode="24"\nnode="22"', `private=${'['.repeat(40)}"보안비밀"${']'.repeat(40)}\n`]) {
    const root = await fixture(t, { 'mise.toml': text });
    const project = await analyzeProject(root);
    assert.ok(Object.values(project.requirements).every((entry) => entry.state === 'unknown'));
    assert.ok(!JSON.stringify(project).includes('보안비밀'));
  }
});

test('가장 가까운 global.json과 버전 파일을 선택하고 저장소 경계 밖은 무시한다', async (t) => {
  const root = await fixture(t, {
    'global.json': { sdk: { version: '9.0.100' } }, '.node-version': '22.0.0', '.python-version': '3.12.1',
    'repo/.git': null, 'repo/global.json': { sdk: { version: '10.0.100' } },
    'repo/.node-version': '24.10.0', 'repo/.python-version': '3.13.2',
    'repo/packages/global.json': { sdk: { version: '10.0.200' } },
    'repo/packages/app/.node-version': '24.11.0', 'repo/packages/app/Demo.csproj': '<Project/>',
  });
  const project = await analyzeProject(path.join(root, 'repo/packages/app'));
  assert.deepEqual(values(project, 'dotnet'), ['10.0.200']);
  assert.deepEqual(values(project, 'node'), ['24.11.0']);
  assert.deepEqual(values(project, 'python'), ['3.13.2']);
  assert.equal(project.metadata.scope.boundary, '../..');
  assert.equal(project.metadata.scope.boundaryKind, 'repository');
  assert.ok(!project.files.some((source) => source.startsWith('../../../')));
  assert.deepEqual(project.metadata.declarations.find((entry) => entry.source === '../../global.json').selectedLanguages, []);
});

test('mise와 .tool-versions는 가까운 파일의 언어만 덮어쓰고 나머지 언어를 상속한다', async (t) => {
  const root = await fixture(t, {
    'mise.toml': '[tools]\nnode="22.0.0"\npython="3.13.2"\ngo="1.25.3"\n',
    '.tool-versions': 'nodejs 22.0.0\npython 3.13.2\n',
    'app/mise.toml': '[tools]\nnode="24.10.0"\n', 'app/.tool-versions': 'nodejs 24.10.0\n',
  });
  const project = await analyzeProject(path.join(root, 'app'));
  assert.deepEqual(values(project, 'node'), ['24.10.0', '24.10.0']);
  assert.deepEqual(values(project, 'python'), ['3.13.2', '3.13.2']);
  assert.deepEqual(values(project, 'go'), ['1.25.3']);
  assert.equal(project.requirements.node.state, 'required');
  assert.deepEqual(project.issues, []);
});

test('잘못된 가까운 SDK 선언은 유효한 상위 선언으로 조용히 대체하지 않는다', async (t) => {
  const root = await fixture(t, { 'global.json': { sdk: { version: '10.0.100' } }, 'app/global.json': '{보안비밀' });
  const project = await analyzeProject(path.join(root, 'app'));
  assert.equal(project.requirements.dotnet.state, 'unknown');
  assert.deepEqual(values(project, 'dotnet'), []);
  assert.ok(!JSON.stringify(project).includes('보안비밀'));
});

test('같은 디렉터리의 .mise.toml 우선순위와 상위 오류의 언어별 적용을 유지한다', async (t) => {
  const root = await fixture(t, {
    'mise.toml': '[tools\npython="3.12"',
    'app/.mise.toml': '[tools]\nnode="24.10.0"\n',
    'app/mise.toml': '[tools]\nnode="22.0.0"\npython="3.13.2"\n',
  });
  const project = await analyzeProject(path.join(root, 'app'));
  assert.deepEqual(values(project, 'node'), ['24.10.0']);
  assert.deepEqual(values(project, 'python'), ['3.13.2']);
  assert.equal(project.requirements.node.state, 'required');
  assert.equal(project.requirements.python.state, 'required');
  assert.equal(project.requirements.go.state, 'unknown');
});

test('문법 오류가 있는 가까운 mise 파일은 상위 버전으로 대체하지 않는다', async (t) => {
  const root = await fixture(t, { 'mise.toml': '[tools]\nnode="22.0.0"\n', 'app/mise.toml': '[tools\nnode="보안비밀"' });
  const project = await analyzeProject(path.join(root, 'app'));
  assert.equal(project.requirements.node.state, 'unknown');
  assert.deepEqual(values(project, 'node'), []);
  assert.ok(!JSON.stringify(project).includes('보안비밀'));
});

test('명시적 npm 작업 공간 구성원과 제외 패턴만 분석하고 소스·의존성은 탐색하지 않는다', async (t) => {
  const root = await fixture(t, {
    'package.json': { private: true, workspaces: ['packages/*', '!packages/ignored'], engines: { node: '>=24' } },
    'packages/a/package.json': { engines: { node: '^24.0.0' } }, 'packages/a/package-lock.json': '',
    'packages/ignored/package.json': { engines: { node: '99.0.0' } },
    'packages/a/src/package.json': { engines: { node: '98.0.0' } },
    'packages/node_modules/package.json': { engines: { node: '97.0.0' } },
    'src/package.json': { engines: { node: '96.0.0' } },
  });
  const project = await analyzeProject(root);
  assert.deepEqual(project.metadata.workspaces[0].members, ['packages/a']);
  assert.deepEqual(values(project, 'node'), ['>=24', '^24.0.0']);
  assert.deepEqual(project.requirements.node.lockFiles, ['packages/a/package-lock.json']);
  assert.ok(!JSON.stringify(project).match(/9[6-9]\.0\.0/));
});

test('하위 pnpm 패키지는 적용되는 상위 작업 공간 관리자와 잠금 파일을 상속한다', async (t) => {
  const root = await fixture(t, {
    'package.json': { packageManager: 'pnpm@10.20.0', engines: { node: '>=24' } },
    'pnpm-workspace.yaml': 'packages: ["packages/*"]\n', 'pnpm-lock.yaml': '',
    'packages/app/package.json': { engines: { node: '^24.0.0' } },
    'packages/other/package.json': { engines: { node: '99.0.0' } },
  });
  const project = await analyzeProject(path.join(root, 'packages/app'));
  assert.deepEqual(values(project, 'node'), ['^24.0.0', '>=24']);
  assert.deepEqual(project.requirements.node.lockFiles, ['../../pnpm-lock.yaml']);
  assert.equal(project.requirements.node.packageManagers[0].name, 'pnpm');
  assert.ok(!project.files.includes('../other/package.json'));
  assert.ok(project.metadata.workspaces.some((entry) => entry.members.includes('.')));
});

test('지원하지 않는 작업 공간 패턴은 해당 근거만 미확인으로 남긴다', async (t) => {
  const root = await fixture(t, {
    'package.json': { workspaces: ['packages/{a,b}', '../보안비밀'], engines: { node: '>=24' } },
    'pyproject.toml': '[project]\nrequires-python=">=3.12"\n',
  });
  const project = await analyzeProject(root);
  assert.equal(project.metadata.workspaces[0].state, 'unknown');
  assert.deepEqual(values(project, 'node'), ['>=24']);
  assert.equal(project.requirements.python.state, 'required');
  assert.ok(!JSON.stringify(project).includes('보안비밀'));
});

test('CI의 정적 버전 행렬은 별도 근거이며 로컬 버전 요구를 대체하지 않는다', async (t) => {
  const root = await fixture(t, {
    '.node-version': '24.10.0',
    '.github/workflows/check.yml': 'jobs:\n  check:\n    runs-on: windows-latest\n    strategy:\n      matrix:\n        node: [22, 24]\n    services:\n      db:\n        image: postgres:17\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: ${{ matrix.node }}\n      - run: echo 보안비밀\n',
  });
  const project = await analyzeProject(root);
  assert.deepEqual(values(project, 'node'), ['24.10.0']);
  const job = project.metadata.ci[0].jobs[0];
  assert.equal(job.executionLocation, 'host');
  assert.deepEqual(job.requirements[0].versionRequests.map((entry) => entry.value), ['22', '24']);
  assert.equal(project.metadata.execution.hostLanguages.node, 'required');
  assert.ok(!JSON.stringify(project).includes('보안비밀'));
});

test('CI 전용 언어 요구와 컨테이너 작업은 호스트 설치 요구로 일반화하지 않는다', async (t) => {
  const root = await fixture(t, {
    '.github/workflows/check.yaml': 'jobs:\n  check:\n    runs-on: ubuntu-latest\n    container: python:3.13\n    steps:\n      - uses: actions/setup-python@v5\n        with: {python-version: "3.13"}\n',
  });
  const project = await analyzeProject(root);
  assert.equal(project.requirements.python.state, 'required');
  assert.deepEqual(values(project, 'python'), []);
  assert.equal(project.metadata.execution.hostLanguages.python, 'not_required');
  assert.equal(project.metadata.ci[0].jobs[0].executionLocation, 'container');
});

test('동적 CI 버전과 재사용 워크플로는 원문 없이 구체적 미확인 사유를 남긴다', async (t) => {
  const root = await fixture(t, {
    '.github/workflows/check.yml': 'jobs:\n  call:\n    uses: example/private/.github/workflows/보안비밀.yml@main\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/setup-node@v4\n        with: {node-version: "${{ inputs.보안비밀 }}"}\n      - uses: actions/setup-python@v5\n        with: {python-version: "3.13"}\n',
  });
  const project = await analyzeProject(root);
  assert.equal(project.metadata.ci[0].state, 'unknown');
  const job = project.metadata.ci[0].jobs.find((entry) => entry.id === 'check');
  assert.equal(job.requirements[0].state, 'unknown');
  assert.deepEqual(job.requirements[1].versionRequests.map((entry) => entry.value), ['3.13']);
  assert.ok(project.issues.some((entry) => /再使用|재사용/.test(entry.message)));
  assert.ok(!JSON.stringify(project).includes('보안비밀'));
});

test('가상환경 버전과 시스템 패키지 설정은 관찰이며 프로젝트 버전 요구가 아니다', async (t) => {
  const root = await fixture(t, {
    '.python-version': '3.13.2',
    '.venv/pyvenv.cfg': 'home = C:\\Users\\보안비밀\\Python312\nversion = 3.12.8\ninclude-system-site-packages = false\nexecutable = C:\\보안비밀\\python.exe\ncommand = python -m venv 보안비밀\nprompt = 보안비밀\n',
  });
  const project = await analyzeProject(root);
  assert.deepEqual(values(project, 'python'), ['3.13.2']);
  const environment = project.metadata.pythonVenv.environments[0];
  assert.equal(environment.version, '3.12.8');
  assert.equal(environment.includeSystemSitePackages, false);
  assert.equal(environment.homePresent, true);
  assert.equal(environment.executablePresent, true);
  assert.ok(!JSON.stringify(project).includes('보안비밀'));
});

test('불완전한 가상환경은 정상 인터프리터로 판정하지 않는다', async (t) => {
  const root = await fixture(t, { '.venv': null });
  const project = await analyzeProject(root);
  assert.equal(project.requirements.python.state, 'required');
  assert.equal(project.metadata.pythonVenv.environments[0].state, 'unknown');
  assert.deepEqual(values(project, 'python'), []);
  const check = await pythonCheck(project, { prefix: path.join(root, '.venv'), basePrefix: path.join(root, 'python') });
  assert.equal(check.status, 'unknown');
  assert.equal(check.reason, 'virtual_environment_metadata_unknown');
});

async function pythonCheck(project, data, state = 'succeeded') {
  const host = { probes: { python: { state, data } } };
  const { checks } = await collectInfrastructure({ project, host, query: () => assert.fail('PY-02는 추가 조회를 실행하지 않습니다.') });
  return checks.find((check) => check.checkId === 'PY-02');
}

test('PY-02는 중첩 작업 공간의 현재 루트에 있는 가상환경과 Windows prefix를 비교한다', async (t) => {
  const root = await fixture(t, {
    'package.json': { workspaces: ['packages/*'] },
    '.venv/pyvenv.cfg': 'version = 3.12.8',
    'packages/app/package.json': {},
    'packages/app/.venv/pyvenv.cfg': 'version = 3.13.2',
  });
  const project = await analyzeProject(path.join(root, 'packages/app'));
  assert.deepEqual(project.metadata.workspaces[0].members, ['.']);
  assert.deepEqual(project.requirements.python.metadata.virtualEnvironments.map((entry) => entry.source), ['.venv/pyvenv.cfg']);
  const windowsProject = process.platform === 'win32' ? project : { ...project, root: 'C:\\Workspace\\packages\\app' };
  const workspaceRoot = path.win32.resolve(windowsProject.root, '..', '..');
  const member = path.win32.join(workspaceRoot, 'PACKAGES', 'APP').replaceAll('\\', '/');
  const basePrefix = 'C:\\Python';

  const match = await pythonCheck(windowsProject, { prefix: member + '/./.VENV/', basePrefix });
  assert.equal(match.status, 'pass');
  assert.equal(match.reason, 'project_environment_selected');
  assert.equal(match.observed.selected.isolated, true);

  for (const prefix of [path.win32.join(workspaceRoot, '.venv'), member + '/.venv-other']) {
    const other = await pythonCheck(windowsProject, { prefix, basePrefix });
    assert.equal(other.status, 'warn');
    assert.equal(other.reason, 'different_virtual_environment_selected');
    assert.equal(other.compatibility, 'unknown');
  }

  const base = await pythonCheck(windowsProject, { prefix: 'c:/PYTHON/.', basePrefix });
  assert.equal(base.status, 'warn');
  assert.equal(base.reason, 'declared_environment_not_selected');
  assert.equal(base.observed.selected.isolated, false);

  const conflict = await pythonCheck(windowsProject, { prefix: member + '/.venv', basePrefix: member + '/.VENV/' });
  assert.equal(conflict.status, 'unknown');
  assert.equal(conflict.reason, 'project_environment_prefix_conflict');

  const invalid = structuredClone(windowsProject);
  invalid.requirements.python.metadata.virtualEnvironments[0].directory = '../보안비밀';
  const invalidCheck = await pythonCheck(invalid, { prefix: member + '/.venv', basePrefix });
  assert.equal(invalidCheck.status, 'unknown');
  assert.equal(invalidCheck.reason, 'virtual_environment_metadata_unknown');
  assert.ok(!JSON.stringify(invalidCheck).includes('보안비밀'));
});

test('PY-02는 프로젝트 환경 근거가 없는 외부 관리자와 잘못된 관찰을 미확인으로 남긴다', async (t) => {
  const root = await fixture(t, { 'environment.yml': 'dependencies: [python=3.13]\n' });
  const project = { ...await analyzeProject(root), root: 'C:/Workspace' };
  assert.ok(project.requirements.python.packageManagers.some((entry) => entry.name === 'conda'));

  const external = 'C:/Conda/envs/project';
  for (const [basePrefix, reason] of [['C:/Conda', 'external_virtual_environment_unverified'], [external, 'project_environment_not_observed']]) {
    const check = await pythonCheck(project, { prefix: external, basePrefix });
    assert.equal(check.status, 'unknown');
    assert.equal(check.reason, reason);
  }

  for (const prefix of ['C:drive-relative', 'https://example.invalid/보안비밀', 42]) {
    const invalid = await pythonCheck(project, { prefix, basePrefix: 'C:/Conda' });
    assert.equal(invalid.status, 'unknown');
    assert.equal(invalid.reason, 'interpreter_environment_path_invalid');
    assert.equal(invalid.observed.selected, null);
    assert.ok(!JSON.stringify(invalid).includes('보안비밀'));
  }
  assert.equal((await pythonCheck(project, undefined, 'not_run')).reason, 'interpreter_environment_unknown');
});

test('Process Compose의 셸·경로·의존·상태 검사·포트를 값 평가 없이 수집한다', async (t) => {
  const root = await fixture(t, {
    'process-compose.yaml': 'version: "0.5"\nshell: {shell_command: pwsh, shell_argument: "-Command"}\nprocesses:\n  db:\n    command: 보안비밀\n  app:\n    command: 보안비밀\n    working_dir: ./app\n    environment: [TOKEN=보안비밀]\n    env_file: .env\n    depends_on:\n      db: {condition: process_healthy}\n    readiness_probe:\n      http_get: {host: localhost, path: /보안비밀, port: 3000}\n      period_seconds: 5\n    liveness_probe:\n      exec: {command: 보안비밀}\n    ports: ["127.0.0.1:8080:3000", 9090]\n    availability: {restart: on_failure, max_restarts: 3}\n',
    '.env': 'TOKEN=보안비밀',
  });
  const project = await analyzeProject(root), compose = project.metadata.processCompose;
  assert.equal(project.environment.processCompose, 'required');
  assert.deepEqual(compose.shell, { command: 'pwsh', argument: '-Command' });
  const app = compose.services.find((entry) => entry.name === 'app');
  assert.equal(app.workingDir, './app');
  assert.deepEqual(app.dependencies, ['db']);
  assert.deepEqual(app.healthCheck, { defined: true, type: 'http', port: 3000 });
  const details = compose.configurations[0].processes.find((entry) => entry.name === 'app');
  assert.deepEqual(details.ports, [{ state: 'required', target: 3000, published: 8080, protocol: 'tcp' }, { state: 'required', target: 9090, protocol: 'tcp' }]);
  assert.equal(details.availability.max_restarts, 3);
  assert.equal(compose.dynamicEnvironment, true);
  assert.ok(!JSON.stringify(project).includes('보안비밀'));
});

test('Process Compose의 동적 경로·외부 include는 독립적인 정적 필드를 없애지 않는다', async (t) => {
  const root = await fixture(t, {
    'process-compose.yaml': 'include: [https://user:보안비밀@example.test/process.yml]\nshell: {shell_command: bash, shell_argument: -c}\nprocesses:\n  app:\n    command: echo 보안비밀\n    working_dir: "${보안비밀}"\n    depends_on: {db: {condition: process_started}}\n    readiness_probe: {http_get: {port: 8080}}\n',
  });
  const project = await analyzeProject(root), config = project.metadata.processCompose.configurations[0];
  assert.equal(config.state, 'unknown');
  assert.equal(config.shell.executable, 'bash');
  assert.equal(config.processes[0].workingDirectory.state, 'unknown');
  assert.equal(config.processes[0].health.readiness.port, 8080);
  assert.deepEqual(project.metadata.processCompose.services[0].dependencies, ['db']);
  assert.ok(!JSON.stringify(project).includes('보안비밀'));
});

test('YAML 별칭·병합은 정적으로 처리하고 재귀·폭증·사용자 태그는 거부한다', async (t) => {
  const root = await fixture(t, {
    'process-compose.yaml': 'x-defaults: &defaults\n  working_dir: ./app\nprocesses:\n  app:\n    <<: *defaults\n    command: 보안비밀\n',
  });
  assert.equal((await analyzeProject(root)).metadata.processCompose.services[0].workingDir, './app');
  for (const value of [
    'processes: &cycle {app: *cycle}',
    'processes: !include https://user:보안비밀@example.test/a',
    'a: &a [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nprocesses: {app: {environment: [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]}}',
  ]) {
    const target = await fixture(t, { 'process-compose.yaml': value });
    const project = await analyzeProject(target);
    assert.equal(project.environment.processCompose, 'unknown');
    assert.ok(!JSON.stringify(project).includes('보안비밀'));
  }
});

test('Compose의 DB 서비스만으로 앱을 컨테이너 실행으로 바꾸지 않는다', async (t) => {
  const root = await fixture(t, {
    'package.json': { engines: { node: '>=24' } },
    'compose.yaml': 'services:\n  db:\n    image: postgres:17\n    environment: {POSTGRES_PASSWORD: 보안비밀}\n    ports: ["5432:5432"]\n',
  });
  const project = await analyzeProject(root);
  assert.equal(project.environment.containers, 'required');
  assert.equal(project.metadata.execution.hostLanguages.node, 'required');
  assert.equal(project.metadata.execution.location, 'host');
  assert.equal(project.metadata.compose.services[0].image, 'postgres:17');
  assert.equal(project.metadata.compose.dynamicEnvironment, true);
  assert.ok(project.metadata.execution.evidence.some((entry) => entry.kind === 'compose' && entry.location === 'unknown'));
  assert.ok(!JSON.stringify(project).includes('보안비밀'));
});

test('Compose의 build·작업 경로·의존·건강 확인은 외부 include와 별개로 보존한다', async (t) => {
  const root = await fixture(t, {
    'compose.yaml': 'include: [https://user:보안비밀@example.test/a.yml]\nservices:\n  app:\n    build: {context: ., dockerfile: Dockerfile}\n    working_dir: /app\n    profiles: [dev]\n    command: 보안비밀\n    depends_on: {db: {condition: service_healthy}}\n    healthcheck: {test: [CMD-SHELL, 보안비밀], interval: 10s, retries: 3}\n    ports: [{target: 3000, published: "${보안비밀}"}]\n',
  });
  const project = await analyzeProject(root), config = project.metadata.compose.configurations[0];
  assert.equal(config.state, 'unknown');
  assert.deepEqual(project.metadata.compose.services[0], { name: 'app', source: 'compose.yaml', build: true, profiles: ['dev'] });
  assert.equal(config.services[0].workingDirectory.value, '/app');
  assert.equal(config.services[0].dependencies[0].condition, 'service_healthy');
  assert.equal(config.services[0].health.timing.interval, '10s');
  assert.equal(config.services[0].ports[0].state, 'unknown');
  assert.ok(!JSON.stringify(project).includes('보안비밀'));
});

test('JSONC devcontainer는 컨테이너 작업 문맥과 정적 Compose 참조를 명시한다', async (t) => {
  const root = await fixture(t, {
    'package.json': { engines: { node: '>=24' } },
    '.devcontainer/devcontainer.json': '{ // 작업 문맥\n "dockerComposeFile": ["../compose.yaml"], "service": "app", "workspaceFolder": "/workspace", "forwardPorts": [3000], "postCreateCommand": "보안비밀", "remoteEnv": {"TOKEN":"보안비밀"},\n}',
    'compose.yaml': 'services:\n  app:\n    build: .\n  db:\n    image: postgres:17\n',
  });
  const project = await analyzeProject(root);
  assert.equal(project.metadata.devcontainer.runtimeLocation, 'container');
  assert.deepEqual(project.metadata.devcontainer.composeFiles, ['compose.yaml']);
  assert.equal(project.metadata.devcontainer.configurations[0].workspaceFolder.value, '/workspace');
  assert.equal(project.metadata.execution.hostLanguages.node, 'not_required');
  assert.equal(project.metadata.execution.location, 'container');
  assert.ok(!JSON.stringify(project).includes('보안비밀'));
});

test('devcontainer의 동적 workspaceFolder만 미확인이며 실행 위치는 보존한다', async (t) => {
  const root = await fixture(t, {
    'pyproject.toml': '[project]\nrequires-python=">=3.13"',
    '.devcontainer.json': { image: 'python:3.13', workspaceFolder: '/workspaces/${보안비밀}' },
  });
  const project = await analyzeProject(root), config = project.metadata.devcontainer.configurations[0];
  assert.equal(config.state, 'unknown');
  assert.equal(config.workspaceFolder.state, 'unknown');
  assert.equal(project.metadata.devcontainer.runtimeLocation, 'container');
  assert.equal(project.metadata.execution.hostLanguages.python, 'not_required');
  assert.ok(!JSON.stringify(project).includes('보안비밀'));
});

test('프로젝트 밖 Compose 참조와 없는 devcontainer 대상 서비스는 실행 위치 미확인이다', async (t) => {
  for (const config of [
    { dockerComposeFile: '../../보안비밀.yml', service: 'app' },
    { dockerComposeFile: '../compose.yaml', service: 'missing' },
  ]) {
    const root = await fixture(t, { '.devcontainer/devcontainer.json': config, 'compose.yaml': 'services: {db: {image: "postgres:17"}}', 'package.json': {} });
    const project = await analyzeProject(root);
    assert.equal(project.metadata.devcontainer.runtimeLocation, 'unknown');
    assert.equal(project.metadata.execution.hostLanguages.node, 'unknown');
    assert.ok(!project.files.some((source) => source.includes('보안비밀')));
  }
});

test('읽을 수 없는 devcontainer와 충돌하는 추가 설정은 호스트 적용을 확정하지 않는다', async (t) => {
  for (const files of [
    { '.devcontainer.json': null },
    { '.devcontainer.json': { image: 'node:24' }, '.devcontainer/devcontainer.json': '{보안비밀' },
  ]) {
    const root = await fixture(t, { 'package.json': { engines: { node: '24' } }, ...files });
    const project = await analyzeProject(root);
    assert.equal(project.metadata.devcontainer.runtimeLocation, 'unknown');
    assert.equal(project.metadata.execution.hostLanguages.node, 'unknown');
    assert.ok(!JSON.stringify(project).includes('보안비밀'));
  }
});

test('작업 공간·CI·가상환경·Compose 참조의 폴더 링크를 따라가지 않는다', async (t) => {
  const outside = await fixture(t, { 'package.json': { engines: { node: '99.0.0' } }, 'pyvenv.cfg': 'version=9.9.9', 'ci.yml': 'jobs: {}', 'compose.yaml': 'services: {app: {image: "private:99"}}' });
  const root = await fixture(t, {
    'package.json': { workspaces: ['packages/*'] }, 'packages': null, '.github': null,
    '.devcontainer.json': { dockerComposeFile: 'linked/compose.yaml', service: 'app' },
  });
  try {
    for (const name of ['packages/escape', '.github/workflows', '.venv', 'linked']) await symlink(outside, path.join(root, name), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('폴더 링크 생성 권한이 없습니다.'); return; }
    throw error;
  }
  const project = await analyzeProject(root);
  assert.ok(!JSON.stringify(project).match(/99\.0\.0|9\.9\.9|private:99/));
  assert.equal(project.metadata.workspaces[0].state, 'unknown');
  assert.equal(project.metadata.execution.location, 'unknown');
  assert.ok(project.issues.some((entry) => /링크/.test(entry.message)));
});

test('모든 추가 선언은 반복 분석해도 실행·파일 변경·비밀 값 반환을 하지 않는다', async (t) => {
  const root = await fixture(t, {
    'package.json': { scripts: { test: 'node -e 보안비밀' }, engines: { node: '24' } },
    'process-compose.yaml': 'processes: {app: {command: "node -e 보안비밀", environment: [TOKEN=보안비밀]}}',
    'compose.yaml': 'services: {db: {image: "postgres:17", command: 보안비밀}}',
    '.devcontainer.json': { image: 'node:24', initializeCommand: 'node -e 보안비밀' },
    '.env': 'TOKEN=보안비밀', 'pyvenv.cfg': 'version = 3.13.2\ncommand = node -e 보안비밀',
  });
  const names = (await readdir(root)).filter((name) => name !== '.git').sort();
  const before = await Promise.all(names.map((name) => readFile(path.join(root, name))));
  const first = await analyzeProject(root);
  assert.deepEqual(await analyzeProject(root), first);
  assert.deepEqual(await Promise.all(names.map((name) => readFile(path.join(root, name)))), before);
  assert.deepEqual((await readdir(root)).filter((name) => name !== '.git').sort(), names);
  assert.ok(!JSON.stringify(first).includes('보안비밀'));
  for (const language of LANGUAGES) assert.deepEqual(Object.keys(first.requirements[language]), ['state', 'versionRequests', 'packageManagers', 'lockFiles', 'metadata', 'notes']);
});

test('Process Compose의 shell_argument를 여러 argv로 나누어 정상 판정하지 않는다', async (t) => {
  const root = await fixture(t, {
    'process-compose.yaml': 'shell: {shell_command: pwsh, shell_argument: "-NoProfile -Command"}\nprocesses:\n  app:\n    command: do-not-run\n',
  });
  const project = await analyzeProject(root);
  const shell = project.metadata.processCompose.configurations[0].shell;
  assert.equal(shell.state, 'unknown');
  assert.equal(shell.arguments, undefined);
  assert.ok(project.issues.some((entry) => /단일 인수/.test(entry.message)));
});
