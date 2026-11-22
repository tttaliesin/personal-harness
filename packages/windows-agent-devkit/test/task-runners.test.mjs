import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, lstat, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { analyzeProject } from '../src/project.mjs';
import { analyzeTaskRunner, TASK_RUNNER_FILES, taskRunnerInvocation, taskRunnerTool } from '../src/task-runners.mjs';

const PREFIX = 'windows-agent-task-static-';
const PRIVATE = 'STATIC_PRIVATE_SENTINEL';
async function fixture(t, files = {}) {
  const base = await realpath(tmpdir());
  const root = await realpath(await mkdtemp(path.join(base, PREFIX))), created = await lstat(root);
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
const parse = (tool, text) => analyzeTaskRunner({ tool, source: 'fixture', text });
const find = (project, source) => project.metadata.taskRunners.find((entry) => entry.source === source);
const clean = (value) => assert.ok(!JSON.stringify(value).includes(PRIVATE), '명령·환경·파서 오류의 원문을 반환하지 않습니다.');
const simpleTask = `version: '3'\ntasks:\n  check:\n    cmds: ['echo ${PRIVATE}']\n`;

test('다섯 실행기의 정적 작업과 허용한 문맥만 프로젝트 메타데이터에 통합한다', async (t) => {
  const root = await fixture(t, {
    'mise.toml': `[tools]\nnode = '24.18.1'\n[env]\nROOT_KEY = '${PRIVATE}'\n[tasks.prepare]\nrun = 'echo ${PRIVATE}'\n[tasks.check]\nrun = ['echo ${PRIVATE}']\ndir = './app'\nshell = ['pwsh', '-NoProfile', '-Command']\ndepends = ['prepare']\n[tasks.check.env]\nTASK_KEY = '${PRIVATE}'\n`,
    'Taskfile.yml': `version: '3'\ndir: ./service\nenv: {ROOT_KEY: '${PRIVATE}'}\ntasks:\n  prepare: 'echo ${PRIVATE}'\n  check:\n    deps: [prepare]\n    env: {TASK_KEY: '${PRIVATE}'}\n    cmds:\n      - task: prepare\n      - cmd: echo ${PRIVATE}\n`,
    'Justfile': `prepare:\n    echo ${PRIVATE}\ncheck: prepare\n    echo ${PRIVATE}\n`,
    'Makefile': `.PHONY: prepare check\nprepare:\n\t@echo ${PRIVATE}\ncheck: prepare\n\t@echo ${PRIVATE}\n`,
    'package.json': { engines: { node: '>=24' }, scripts: { check: `echo ${PRIVATE}`, precheck: `echo ${PRIVATE}` } },
  });
  const project = await analyzeProject(root);
  assert.deepEqual(project.metadata.taskRunners.map((entry) => entry.tool).sort(), ['just', 'make', 'mise', 'npm', 'task']);
  for (const record of project.metadata.taskRunners) {
    assert.equal(record.state, 'declared', record.source);
    assert.ok(record.tasks.includes('check'), record.source);
    assert.ok(record.notes.every((entry) => typeof entry === 'string'));
    assert.ok(Object.keys(record).every((key) => ['tool', 'source', 'state', 'tasks', 'notes', 'taskDetails'].includes(key)));
  }
  assert.deepEqual(find(project, 'mise.toml').taskDetails.find((entry) => entry.name === 'check'), {
    name: 'check', directory: './app', shell: ['pwsh', '-NoProfile', '-Command'], environmentKeys: ['ROOT_KEY', 'TASK_KEY'], dependencies: ['prepare'],
  });
  assert.deepEqual(find(project, 'Taskfile.yml').taskDetails.find((entry) => entry.name === 'check'), {
    name: 'check', directory: './service', environmentKeys: ['ROOT_KEY', 'TASK_KEY'], dependencies: ['prepare'],
  });
  assert.deepEqual(find(project, 'Makefile').taskDetails, [{ name: 'check', dependencies: ['prepare'] }]);
  assert.equal(project.requirements.node.state, 'required');
  assert.deepEqual(project.requirements.node.versionRequests.map((entry) => entry.value), ['24.18.1', '>=24']);
  assert.deepEqual(project.metadata.taskRunnerCI, []);
  clean(project);
});

test('표준 이름과 dist 변형을 각각 탐지하며 도구용 mise 선언을 작업 실행기로 오인하지 않는다', async (t) => {
  for (const name of TASK_RUNNER_FILES.filter((entry) => !['mise.toml', '.mise.toml', 'package.json', 'mise-tasks'].includes(entry))) {
    const tool = taskRunnerTool(name);
    const root = await fixture(t, { [name]: tool === 'task' ? simpleTask : `check:\n${tool === 'make' ? '\t' : '    '}echo ${PRIVATE}\n` });
    const result = await analyzeProject(root);
    assert.deepEqual(find(result, name).tasks, ['check'], name);
    assert.equal(find(result, name).state, 'declared', name);
    clean(result);
  }
  const root = await fixture(t, { 'mise.toml': '[tools]\nnode = "24.18.1"\n', 'package.json': { engines: { node: '24' } } });
  const result = await analyzeProject(root);
  assert.deepEqual(result.metadata.taskRunners, []);
  assert.equal(result.requirements.node.state, 'required');
  assert.equal(taskRunnerTool('not-a-Taskfile.yml'), null);
  assert.equal(taskRunnerTool('Taskfile.dist.yml.dist'), null);
});

test('Task·Just·Make 전용 파일은 빈 파일이나 작업 없는 파일도 미확인으로 보존한다', async (t) => {
  for (const [name, text] of [['Taskfile.yml', ''], ['Taskfile.dist.yaml', 'version: 3\ntasks: {}'], ['justfile', '# comment\n'], ['GNUmakefile', '# comment\n']]) {
    const project = await analyzeProject(await fixture(t, { [name]: text }));
    const record = find(project, name);
    assert.equal(record.state, 'unknown', name);
    assert.deepEqual(record.tasks, []);
    assert.ok(record.notes.length > 0);
  }
});

test('mise 버전 우선순위에서 제외된 파일과 상위 선언의 작업도 별도로 보존한다', async (t) => {
  const root = await fixture(t, {
    'app/.mise.toml': '[tools]\nnode="24"\npython="3.13"\ngo="1.25"\nrust="stable"\nzig="0.15"\ndotnet="10"\n[tasks]\nlocal="echo local"\n',
    'app/mise.toml': '[tasks]\nsecondary="echo secondary"\n',
    'mise.toml': '[tools]\nnode="22"\n[tasks]\nparent="echo parent"\n',
  });
  const project = await analyzeProject(path.join(root, 'app'));
  assert.deepEqual(find(project, '.mise.toml').tasks, ['local']);
  assert.deepEqual(find(project, 'mise.toml').tasks, ['secondary']);
  assert.deepEqual(find(project, '../mise.toml').tasks, ['parent']);
  assert.deepEqual(project.requirements.node.versionRequests.map((entry) => entry.value), ['24']);
});

test('기존 workspace 구성원에서 실행기를 찾고 제외된 구성원과 소스 폴더는 탐색하지 않는다', async (t) => {
  const root = await fixture(t, {
    'package.json': { workspaces: ['packages/*', '!packages/ignored'] },
    'packages/app/package.json': { scripts: { check: `echo ${PRIVATE}` } },
    'packages/app/Taskfile.dist.yml': simpleTask,
    'packages/app/.justfile': 'check:\n    echo check\n',
    'packages/app/GNUmakefile': 'check:\n\t@echo check\n',
    'packages/app/.mise.toml': '[tasks]\ncheck = "echo check"\n',
    'packages/app/mise-tasks/check': `echo ${PRIVATE}`,
    'packages/ignored/package.json': { scripts: { excluded: 'echo excluded' } },
    'packages/ignored/Makefile': 'excluded:\n\t@echo excluded\n',
    'packages/app/src/Taskfile.yml': 'version: 3\ntasks: {excluded: echo excluded}',
    'src/justfile': 'excluded:\n    echo excluded\n',
  });
  const project = await analyzeProject(root);
  assert.equal(project.metadata.taskRunners.length, 6);
  assert.ok(project.metadata.taskRunners.every((entry) => entry.source.startsWith('packages/app/')));
  assert.deepEqual(project.metadata.workspaces[0].members, ['packages/app']);
  assert.ok(!project.files.some((entry) => entry.includes('/src/') || entry.startsWith('src/') || entry.includes('/ignored/')));
  assert.equal(find(project, 'packages/app/mise-tasks').state, 'unknown');
  clean(project);
});

test('하위 workspace 프로젝트에서는 적용되는 상위 실행기도 경계 안에서 수집한다', async (t) => {
  const root = await fixture(t, {
    'package.json': { workspaces: ['packages/*'], scripts: { root: 'echo root' } },
    'Taskfile.yml': simpleTask, 'Justfile': 'check:\n    echo check\n', 'Makefile': 'check:\n\t@echo check\n',
    'packages/app/package.json': { scripts: { local: 'echo local' } },
    'packages/other/package.json': { scripts: { excluded: 'echo excluded' } },
    'packages/other/Makefile': 'excluded:\n\t@echo excluded\n',
  });
  const project = await analyzeProject(path.join(root, 'packages/app'));
  for (const name of ['Taskfile.yml', 'Justfile', 'Makefile', 'package.json']) assert.ok(find(project, `../../${name}`), name);
  assert.deepEqual(find(project, 'package.json').tasks, ['local']);
  assert.ok(!project.files.some((entry) => entry.startsWith('../other/')));
});

test('실제 TOML 파서로 인용 키·다중 행 문자열·인라인 테이블을 읽고 문자열 안의 가짜 작업은 무시한다', () => {
  const result = parse('mise', `[tasks]\n"build:all" = {run = '''echo ${PRIVATE}\n[tasks.fake]\nrun = "never"''', depends = ['prepare']}\nprepare = 'echo prepare'\n`);
  assert.equal(result.state, 'declared');
  assert.deepEqual(result.tasks, ['build:all', 'prepare']);
  assert.deepEqual(result.taskDetails, [{ name: 'build:all', dependencies: ['prepare'] }]);
  clean(result);
});

test('안전한 Task YAML 별칭과 병합을 지원하며 사용자 태그·재귀·별칭 폭증은 거부한다', () => {
  const positive = parse('task', `version: 3\nx-base: &base\n  dir: ./app\n  cmds: [echo ${PRIVATE}]\ntasks:\n  check:\n    <<: *base\n`);
  assert.equal(positive.state, 'declared');
  assert.deepEqual(positive.tasks, ['check']);
  assert.deepEqual(positive.taskDetails, [{ name: 'check', directory: './app' }]);
  const cases = [
    `tasks: !include https://user:${PRIVATE}@example.invalid/tasks.yml`,
    'version: 3\ntasks: &cycle {check: *cycle}',
    'a: &a [1,2,3,4,5,6,7,8,9,10]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\ntasks: {check: {cmds: [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]}}',
    `version: 3\ntasks:\n  check: echo ${PRIVATE}\n  check: echo ${PRIVATE}\n`,
    `version: 3\ntasks: {__proto__: {cmds: [echo ${PRIVATE}]}}`,
  ];
  for (const source of cases) {
    const result = parse('task', source);
    assert.equal(result.state, 'unknown');
    assert.deepEqual(result.tasks, []);
    clean(result);
  }
  clean(positive);
});

test('포함·import·템플릿·셸 변수·동적 작업은 실행 없이 미확인 사유를 보존한다', () => {
  const cases = [
    ['mise', `include = ['https://user:${PRIVATE}@example.invalid/mise.toml']\n[tasks]\ncheck = 'echo check'\n`],
    ['mise', `task_config = {includes = ['${PRIVATE}']}\n[tasks]\ncheck = 'echo check'\n`],
    ['mise', `[tasks.check]\nrun = 'echo {{env.${PRIVATE}}}'\ndir = '{{env.${PRIVATE}}}'\ndepends = ['{{env.${PRIVATE}}}']\n`],
    ['task', `version: 3\nincludes: {external: 'https://user:${PRIVATE}@example.invalid/Taskfile.yml'}\ntasks: {check: {cmds: [echo check]}}`],
    ['task', `version: 3\nvars: {REVISION: {sh: 'echo ${PRIVATE}'}}\ntasks: {check: {cmds: [echo check]}}`],
    ['task', `version: 3\ntasks: {check: {cmds: ['echo {{.${PRIVATE}}}'], env: {TOKEN: {sh: 'echo ${PRIVATE}'}}}}`],
    ['just', `import '${PRIVATE}'\ncheck:\n    echo check\n`],
    ['just', `mod '${PRIVATE}'\ncheck:\n    echo check\n`],
    ['just', `TOKEN := \u0060${PRIVATE}\u0060\ncheck:\n    echo check\n`],
    ['make', `include ${PRIVATE}\ncheck:\n\t@echo check\n`],
    ['make', `VALUE := $(shell echo ${PRIVATE})\ncheck:\n\t@echo check\n`],
    ['npm', JSON.stringify({ scripts: { check: `echo ${'${'}${PRIVATE}}` } })],
  ];
  for (const [tool, source] of cases) {
    const result = parse(tool, source);
    assert.equal(result.state, 'unknown', tool);
    assert.ok(result.tasks.includes('check'), tool);
    assert.ok(result.notes.length > 0);
    clean(result);
  }
});

test('Taskfile include는 로컬·외부·원격 모두 따라가지 않고 원본 위치도 보고서에 복사하지 않는다', async (t) => {
  const root = await fixture(t, {
    'Taskfile.yml': `version: 3\nincludes:\n  local: ./${PRIVATE}/Taskfile.yml\n  external: ../${PRIVATE}/Taskfile.yml\n  remote: https://user:${PRIVATE}@example.invalid/Taskfile.yml\ntasks: {check: echo check}\n`,
    [`${PRIVATE}/Taskfile.yml`]: 'version: 3\ntasks: {excluded: echo excluded}',
  });
  const project = await analyzeProject(root);
  assert.equal(find(project, 'Taskfile.yml').state, 'unknown');
  assert.deepEqual(find(project, 'Taskfile.yml').tasks, ['check']);
  assert.deepEqual(project.files, ['Taskfile.yml']);
  clean(project);
});

test('잘못된 TOML·YAML·JSON과 비정적 작업 정의는 오류 원문 없이 미확인이다', async (t) => {
  const cases = [
    ['mise.toml', `[tasks\ncheck = '${PRIVATE}'`],
    ['mise.toml', `[tasks]\ncheck='${PRIVATE}'\ncheck='${PRIVATE}'`],
    ['mise.toml', `[tasks]\n__proto__.check='${PRIVATE}'`],
    ['mise.toml', `[tasks]\ncheck=${'['.repeat(40)}'${PRIVATE}'${']'.repeat(40)}`],
    ['Taskfile.yml', `version: 3\ntasks: [${PRIVATE}`],
    ['Taskfile.yml', `version: 3\ntasks: '${PRIVATE}'`],
    ['Taskfile.yml', `version: 3\ntasks: {check: {cmds: '${PRIVATE}'}}`],
    ['package.json', `{"scripts":{"check":"${PRIVATE}","check":"${PRIVATE}"}}`],
    ['package.json', { scripts: PRIVATE }],
    ['package.json', { scripts: { check: { command: PRIVATE } } }],
    ['Makefile', PRIVATE], ['Justfile', PRIVATE],
  ];
  for (const [name, value] of cases) {
    const project = await analyzeProject(await fixture(t, { [name]: value }));
    assert.equal(find(project, name).state, 'unknown', name);
    clean(project);
  }
});

test('256 KiB·UTF-8·NUL 한도를 기존 안전 읽기 경로로 적용한다', async (t) => {
  for (const name of ['mise.toml', 'Taskfile.yml', 'Justfile', 'Makefile', 'package.json']) {
    for (const value of [`${PRIVATE}${' '.repeat(256 * 1024)}`, Buffer.from([0xff, 0xfe, 0x61]), `# ${PRIVATE}\0`]) {
      const project = await analyzeProject(await fixture(t, { [name]: value }));
      assert.equal(find(project, name).state, 'unknown', name);
      assert.deepEqual(find(project, name).tasks, []);
      assert.ok(project.issues.some((entry) => entry.source === name));
      clean(project);
    }
  }
});

test('파서 객체·텍스트 줄 한도를 넘으면 원문 없이 미확인으로 반환한다', () => {
  for (const [tool, text] of [
    ['make', 'check:\n\t@echo check\n' + '\n'.repeat(4096)],
    ['just', 'check:\n    echo check\n' + '\n'.repeat(4096)],
    ['task', 'version: 3\nvars: [' + Array.from({ length: 4100 }, () => '0').join(',') + ']\ntasks: {}'],
    ['npm', JSON.stringify({ scripts: { check: PRIVATE }, unused: Array.from({ length: 4100 }, () => 0) })],
  ]) {
    const result = parse(tool, text);
    assert.equal(result.state, 'unknown');
    assert.deepEqual(result.tasks, []);
    clean(result);
  }
});

test('Make define·조건·줄 연속과 Just 문자열 안의 가짜 작업을 수집하지 않는다', () => {
  const make = parse('make', 'define MACRO\nfake:\nendef\nifdef FLAG\nconditional:\nendif\nVALUE = \\\ncontinued:\nreal:\n\t@echo real\n');
  assert.equal(make.state, 'unknown');
  assert.deepEqual(make.tasks, ['real']);
  const just = parse('just', 'text := """\nfake:\n"""\nvalue := `\ncomputed:\n`\nreal:\n    echo real\n');
  assert.equal(just.state, 'unknown');
  assert.deepEqual(just.tasks, ['real']);
  for (const quote of ['"', "'", '`']) {
    const result = parse('just', `value := ${quote}${PRIVATE}:\n${PRIVATE}:\n${quote}\nshort := \u0060x\u0060\nreal:\n    echo real\n`);
    assert.equal(result.state, 'unknown');
    assert.deepEqual(result.tasks, ['real']);
    clean(result);
  }
  const prefix = parse('make', '.RECIPEPREFIX := >\nreal:\n>fake: echo fake\n');
  assert.equal(prefix.state, 'unknown');
  assert.deepEqual(prefix.tasks, []);
});

test('Just literal windows-shell을 우선 적용하고 [windows] 탐지와 실행 지원은 구분한다', () => {
  for (const setting of [
    'set windows-shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]',
    '[windows]\nset shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]',
  ]) {
    const record = parse('just', `${setting}\nprepare:\n    echo prepare\ncheck: prepare\n    echo check\n`);
    assert.equal(record.state, 'declared');
    assert.deepEqual(record.taskDetails.find((entry) => entry.name === 'check'), {
      name: 'check', dependencies: ['prepare'], shell: ['pwsh', '-NoLogo', '-NoProfile', '-Command'],
    });
    if (setting.startsWith('[windows]')) assert.ok(record.notes.some((note) => /설치 버전/.test(note)));
  }
  const record = parse('just', 'set shell := ["sh", "-c"]\nset windows-shell := ["pwsh", "-Command"]\ncheck:\n    echo check\n');
  assert.deepEqual(record.taskDetails, [{ name: 'check', shell: ['pwsh', '-Command'] }]);
  for (const setting of [
    `set windows-shell := ["pwsh", "-Command", "${PRIVATE}"]`,
    `set windows-shell := [env_var("${PRIVATE}"), "-Command"]`,
    `set dotenv-filename := '${PRIVATE}'`,
    `[linux]\nset shell := ["sh", "-c"]`,
  ]) {
    const result = parse('just', `${setting}\ncheck:\n    echo check\n`);
    assert.equal(result.state, 'unknown');
    clean(result);
  }
});

test('허용한 셸 argv와 정적 경로·환경 키·의존 이름만 taskDetails에 남긴다', () => {
  const result = parse('mise', `[tasks.check]\nrun = 'echo ${PRIVATE}'\nshell = ['pwsh', '-Command', '${PRIVATE}']\ndir = '{{env.${PRIVATE}}}'\ndepends = ['prepare', '{{env.${PRIVATE}}}']\n[tasks.check.env]\nTOKEN = {value = '${PRIVATE}'}\n`);
  assert.equal(result.state, 'unknown');
  assert.deepEqual(result.taskDetails, [{ name: 'check', environmentKeys: ['TOKEN'], dependencies: ['prepare'] }]);
  clean(result);
});

test('mise-tasks는 폴더 존재만 미확인으로 기록하고 내부 파일을 읽지 않는다', async (t) => {
  const root = await fixture(t, { 'mise.toml': '[tools]\nnode="24"\n', 'mise-tasks/check': PRIVATE });
  const project = await analyzeProject(root);
  assert.deepEqual(project.metadata.taskRunners.map((entry) => [entry.tool, entry.source, entry.state, entry.tasks]), [['mise', 'mise-tasks', 'unknown', []]]);
  assert.ok(find(project, 'mise-tasks').notes.some((note) => /분석하지 않습니다/.test(note)));
  assert.ok(!project.files.includes('mise-tasks/check'));
  clean(project);
});

test('선언 파일 심볼릭 링크를 따라가지 않으며 모든 실행기의 미확인 항목을 남긴다', async (t) => {
  const outside = await fixture(t, { 'target': `check:\n    echo ${PRIVATE}\n` });
  const root = await fixture(t);
  try {
    for (const name of ['mise.toml', 'Taskfile.yml', 'Justfile', 'Makefile', 'package.json']) await symlink(path.join(outside, 'target'), path.join(root, name), 'file');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('파일 심볼릭 링크 생성 권한이 없습니다.'); return; }
    throw error;
  }
  const result = await analyzeProject(root);
  assert.equal(result.metadata.taskRunners.length, 5);
  assert.ok(result.metadata.taskRunners.every((entry) => entry.state === 'unknown' && !entry.tasks.length));
  clean(result);
});

test('workspace와 mise-tasks의 폴더 링크는 따라가지 않는다', async (t) => {
  const outside = await fixture(t, { 'package.json': { scripts: { excluded: PRIVATE } }, 'Taskfile.yml': simpleTask, check: PRIVATE });
  const root = await fixture(t, { 'package.json': { workspaces: ['packages/*'] }, packages: null });
  try {
    for (const name of ['packages/linked', 'mise-tasks']) await symlink(outside, path.join(root, name), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('폴더 링크 생성 권한이 없습니다.'); return; }
    throw error;
  }
  const project = await analyzeProject(root);
  assert.equal(project.metadata.workspaces[0].state, 'unknown');
  assert.equal(find(project, 'mise-tasks').state, 'unknown');
  assert.ok(!project.files.some((entry) => entry.startsWith('packages/linked/') || entry.startsWith('mise-tasks/')));
  clean(project);
});

test('CI 정적 선두 호출은 작업 이름과 실행 위치만 별도 수집하고 기존 버전 요구를 보존한다', async (t) => {
  const root = await fixture(t, {
    '.github/workflows/check.yml': `jobs:\n  host:\n    runs-on: windows-latest\n    strategy:\n      matrix:\n        node: [22, 24]\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: \u0024{{ matrix.node }}\n      - run: mise run check -- ${PRIVATE}\n      - run: task check\n      - run: just check\n      - run: make check\n      - run: npm run check -- --token=${PRIVATE}\n  container:\n    runs-on: ubuntu-latest\n    container: node:24\n    steps:\n      - run: npm test\n`,
  });
  const project = await analyzeProject(root);
  assert.deepEqual(project.metadata.taskRunners, []);
  assert.deepEqual(project.metadata.taskRunnerCI.map((entry) => [entry.job, entry.step, entry.tool, entry.state, entry.task, entry.executionLocation]), [
    ['host', 1, 'mise', 'declared', 'check', 'host'], ['host', 2, 'task', 'declared', 'check', 'host'],
    ['host', 3, 'just', 'declared', 'check', 'host'], ['host', 4, 'make', 'declared', 'check', 'host'],
    ['host', 5, 'npm', 'declared', 'check', 'host'], ['container', 0, 'npm', 'declared', 'test', 'container'],
  ]);
  assert.deepEqual(project.metadata.taskRunnerCI.map(({ atProjectRoot }) => atProjectRoot), [undefined, true, true, true, undefined, undefined]);
  assert.ok(project.metadata.taskRunnerCI.every((entry) => entry.source === '.github/workflows/check.yml'));
  assert.deepEqual(project.requirements.node.metadata.ciRequirements[0].versionRequests.map((entry) => entry.value), ['22', '24']);
  assert.deepEqual(project.requirements.node.versionRequests, []);
  assert.equal(project.metadata.execution.hostLanguages.node, 'not_required');
  clean(project);
});

test('CI의 동적 작업·옵션·복합 셸은 미확인이며 비선두 호출과 실행 문자열은 내보내지 않는다', () => {
  for (const [command, tool] of [
    [`mise run \u0024{{ matrix.${PRIVATE} }}`, 'mise'], [`task --taskfile ${PRIVATE} check`, 'task'],
    [`just {{${PRIVATE}}}`, 'just'], [`make -C ${PRIVATE} check`, 'make'],
    [`npm run \u0024{{ matrix.${PRIVATE} }}`, 'npm'], [`npm run check && echo ${PRIVATE}`, 'npm'],
    [`npm --prefix ${PRIVATE} run check`, 'npm'], [`npm ci --token=${PRIVATE}`, 'npm'],
  ]) {
    const result = taskRunnerInvocation(command);
    assert.equal(result.tool, tool);
    assert.equal(result.state, 'unknown');
    clean(result);
  }
  for (const command of [`echo ${PRIVATE} && npm run check`, `env TOKEN=${PRIVATE} task check`, `\u0024{{ matrix.${PRIVATE} }} check`, 42, null]) assert.equal(taskRunnerInvocation(command), null);
  assert.deepEqual(taskRunnerInvocation('# comment\n\n npm.cmd run check -- --token=PRIVATE\n echo ignored'), { tool: 'npm', state: 'declared', task: 'check' });
  assert.deepEqual(taskRunnerInvocation('make'), { tool: 'make', state: 'declared' });
});

test('단일 npm ci는 작업 이름 없이 의존성 설치로 분류한다', () => {
  for (const command of ['npm ci', 'npm ci --ignore-scripts', '  npm.cmd ci --ignore-scripts --no-audit --no-fund\r\n']) {
    assert.deepEqual(taskRunnerInvocation(command), { tool: 'npm', state: 'declared', kind: 'dependency_install' }, command);
  }
  for (const command of [
    'npm ci --prefix ./app', 'npm ci --workspace app', 'npm ci --ignore-scripts=false', 'npm ci -- --ignore-scripts',
    'npm ci --ignore-scripts \u0024{{ inputs.flags }}', 'npm ci --token=' + PRIVATE,
    'npm ci && npm test', 'npm ci\nnpm test', 'npm ci | npm test', 'npm ci > output', 'npm ci \\\n--ignore-scripts',
  ]) {
    assert.deepEqual(taskRunnerInvocation(command), { tool: 'npm', state: 'unknown' }, command);
  }
});

test('다섯 실행기의 루트 작업 근거는 이름만 주는 단일 호출에 붙인다', () => {
  for (const [tool, command] of [
    ['mise', 'mise.exe r check'], ['task', 'task.exe check'], ['just', 'just check'],
    ['make', 'make check'], ['npm', 'npm.cmd run check'],
  ]) {
    const expected = { tool, state: 'declared', task: 'check' };
    assert.deepEqual(taskRunnerInvocation(command), expected);
    assert.deepEqual(taskRunnerInvocation(command, { atProjectRoot: true }), { ...expected, atProjectRoot: true });
    for (const extra of [' other', '\n echo ignored', ' # comment']) {
      assert.deepEqual(taskRunnerInvocation(command + extra, { atProjectRoot: true }), expected);
    }
  }
});

test('호스트 CI에서 루트의 단일 npm 작업 호출에만 루트 근거를 남긴다', async (t) => {
  const host = { 'runs-on': 'windows-latest' };
  const testStep = { run: 'npm test' };
  const checkout = { uses: 'actions/checkout@v7' };
  const root = await fixture(t, {
    '.github/workflows/default.yml': { jobs: { implicit: { ...host, steps: [testStep] } } },
    '.github/workflows/scoped.yml': {
      defaults: { run: { 'working-directory': './', shell: 'pwsh' } },
      jobs: {
        root: { ...host, steps: [
          { ...checkout, with: { path: '.' } },
          { run: 'npm.cmd run-script check' },
          { run: 'npm ci --ignore-scripts' },
          { run: 'npm run check -- ' + PRIVATE },
          { run: 'npm test\n echo ' + PRIVATE },
          { run: 'npm test && echo ' + PRIVATE },
          { ...testStep, 'working-directory': './' + PRIVATE },
          { ...testStep, 'working-directory': '\u0024{{ inputs.' + PRIVATE + ' }}' },
          { ...testStep, shell: 'wsl bash {0}' },
        ] },
        nonroot: { ...host, defaults: { run: { 'working-directory': './app' } }, steps: [
          testStep,
          { run: 'npm.exe run check', 'working-directory': '.' },
        ] },
        container: { 'runs-on': 'ubuntu-latest', container: 'node:24', steps: [testStep] },
        relocated: { ...host, steps: [{ ...checkout, with: { path: PRIVATE } }, testStep] },
        dynamic: { ...host, steps: [{ ...checkout, with: { path: '\u0024{{ inputs.path }}' } }, testStep] },
        external: { ...host, steps: [{ ...checkout, with: { repository: 'example/other' } }, testStep] },
      },
    },
    '.github/workflows/overrides.yml': {
      defaults: { run: { 'working-directory': './' + PRIVATE } },
      jobs: {
        inherited: { ...host, steps: [testStep] },
        overridden: { ...host, defaults: { run: { 'working-directory': '.' } }, steps: [checkout, testStep] },
      },
    },
    app: null,
  });
  const project = await analyzeProject(root);
  const { ci, taskRunnerCI } = project.metadata;
  const scopedWorkflow = ci.find((entry) => entry.source === '.github/workflows/scoped.yml');
  assert.deepEqual(scopedWorkflow.jobs.find((job) => job.id === 'nonroot').workingDirectory, { state: 'required', value: './app' });
  assert.deepEqual(taskRunnerCI.map(({ job, step, atProjectRoot }) => [job, step, atProjectRoot]), [
    ['implicit', 0, true],
    ['inherited', 0, undefined], ['overridden', 1, true],
    ['root', 1, true], ['root', 2, undefined], ['root', 3, undefined], ['root', 4, undefined], ['root', 5, undefined],
    ['root', 6, undefined], ['root', 7, undefined], ['root', 8, undefined],
    ['nonroot', 0, undefined], ['nonroot', 1, true],
    ['container', 0, undefined], ['relocated', 1, undefined], ['dynamic', 1, undefined], ['external', 1, undefined],
  ]);
  assert.deepEqual(taskRunnerCI.find(({ kind }) => kind === 'dependency_install'), {
    source: '.github/workflows/scoped.yml', job: 'root', step: 2, tool: 'npm',
    state: 'declared', kind: 'dependency_install', executionLocation: 'host',
  });
  assert.deepEqual(taskRunnerCI.find(({ job, step }) => job === 'nonroot' && step === 0), {
    source: '.github/workflows/scoped.yml', job: 'nonroot', step: 0, tool: 'npm',
    state: 'declared', task: 'test', executionLocation: 'host',
  });
  for (const step of [3, 4, 5]) {
    const entry = taskRunnerCI.find((entry) => entry.job === 'root' && entry.step === step);
    assert.equal(entry.state, step === 5 ? 'unknown' : 'declared');
    assert.equal(entry.task, step === 3 ? 'check' : 'test');
  }
  clean(project);
  const nested = await analyzeProject(path.join(root, 'app'));
  assert.equal(nested.metadata.taskRunnerCI.length, taskRunnerCI.length);
  assert.ok(nested.metadata.taskRunnerCI.every((entry) => !Object.hasOwn(entry, 'atProjectRoot')));
});

const checkout = { uses: 'actions/checkout@v4' };
const hostJob = (steps, context = {}) => ({ 'runs-on': 'windows-latest', steps, ...context });
const runSteps = (...commands) => commands.map((run) => ({ run }));

test('동일한 직접 명령의 최대 공통 구간과 실행기 준비 위치만 CI 근거로 남긴다', async (t) => {
  const first = '.github/workflows/first.yml', second = '.github/workflows/second.yaml';
  const commands = [
    'node --check "' + PRIVATE + ' path.mjs"', 'python -m unittest discover', 'go test ./...',
    'cargo check --locked', 'zig build test', 'dotnet build App.sln --no-restore',
  ];
  const root = await fixture(t, {
    [first]: { jobs: { verify: hostJob([
      { uses: 'go-task/setup-task@v1', with: { 'github-token': PRIVATE } },
      { ...checkout, with: { path: './' } },
      { uses: 'extractions/setup-just@v3' },
      { run: 'choco install make --yes', env: { API_TOKEN: PRIVATE } },
      { run: 'cargo build' },
      ...runSteps(...commands),
      { run: 'go build ./...' },
    ]) } },
    [second]: { defaults: { run: { 'working-directory': './app' } }, jobs: { verify: hostJob([
      checkout, { run: 'scoop install make' }, { run: 'go vet ./...' },
      ...runSteps(...commands.map((command) => '  ' + command + '\r\n')),
      { uses: 'go-task/setup-task@v1' },
    ], { defaults: { run: { 'working-directory': '.', shell: 'pwsh' } } }) } },
  });
  const project = await analyzeProject(root);
  assert.deepEqual(project.metadata.taskRunnerWorkflows, [{
    jobs: [
      { source: first, job: 'verify', steps: [5, 6, 7, 8, 9, 10] },
      { source: second, job: 'verify', steps: [3, 4, 5, 6, 7, 8] },
    ],
    operations: [
      { language: 'node', operation: 'check' }, { language: 'python', operation: 'test' },
      { language: 'go', operation: 'test' }, { language: 'rust', operation: 'check' },
      { language: 'zig', operation: 'test' }, { language: 'dotnet', operation: 'build' },
    ],
    prepared: [
      { tool: 'task', source: first, job: 'verify', step: 0 },
      { tool: 'just', source: first, job: 'verify', step: 2 },
      { tool: 'make', source: first, job: 'verify', step: 3 },
      { tool: 'make', source: second, job: 'verify', step: 1 },
    ],
  }]);
  clean(project);
});

test('순서·명령 인수가 다르거나 단계 사이에 다른 명령이 있으면 같은 절차로 세지 않는다', async (t) => {
  const step = { run: 'node --check first.mjs' }, next = { run: 'go test ./...' };
  const jobs = {
    once: hostJob([checkout, step, next, { run: 'npm ci' }, step, next]),
    reversed: hostJob([checkout, next, step]),
    different: hostJob([checkout, { run: 'node --check second.mjs' }, next]),
    whitespace: hostJob([checkout, { run: 'node  --check first.mjs' }, next]),
  };
  for (const [index, intervening] of [
    { run: 'npm ci' }, { run: 'make check' }, { run: 'cargo install just' },
    { run: 'node --test && go test ./...' }, { run: 'go build ./...\nnode --test' },
    { run: 'python -c "print(123)"' }, { run: 'node --test --eval=123' },
    { run: 'dotnet test \u0024{{ inputs.path }}' }, { run: 'go test ./...', if: 'success()' },
  ].entries()) {
    for (const suffix of ['a', 'b']) jobs['interrupted' + index + suffix] = hostJob([checkout, step, intervening, next]);
  }
  const root = await fixture(t, { '.github/workflows/near.yml': { jobs } });
  assert.deepEqual((await analyzeProject(root)).metadata.taskRunnerWorkflows, []);
});

test('반복 절차는 저장소 루트에서 선행 기본 checkout과 정적인 호스트 작업 문맥을 요구한다', async (t) => {
  const steps = runSteps('node --test', 'go test ./...');
  const checkedOut = [checkout, ...steps];
  const root = await fixture(t, {
    '.github/workflows/contexts.yml': { jobs: {
      eligible: hostJob(checkedOut),
      omitted: hostJob(steps),
      late: hostJob([...steps, checkout]),
      conditional: hostJob([{ ...checkout, if: 'success()' }, ...steps]),
      nonliteral: hostJob([{ uses: 'actions/checkout@\u0024{{ inputs.checkout }}' }, ...steps]),
      relocated: hostJob([{ ...checkout, with: { path: './app' } }, ...steps]),
      external: hostJob([{ ...checkout, with: { repository: 'elsewhere/project' } }, ...steps]),
      dynamic: hostJob(checkedOut, { 'runs-on': '\u0024{{ matrix.os }}' }),
      container: hostJob(checkedOut, { container: 'node:24' }),
      reusable: hostJob(checkedOut, { uses: 'elsewhere/project/.github/workflows/check.yml@v1' }),
      directory: hostJob(checkedOut, { defaults: { run: { 'working-directory': './app' } } }),
      shell: hostJob(checkedOut, { defaults: { run: { shell: 'wsl bash {0}' } } }),
    } },
    'app/package.json': { workspaces: ['packages/*'] },
    'app/.github/workflows/misplaced.yml': { jobs: { one: hostJob(checkedOut), two: hostJob(checkedOut) } },
  });
  for (const target of [root, path.join(root, 'app')]) {
    assert.deepEqual((await analyzeProject(target)).metadata.taskRunnerWorkflows, []);
  }
});

test('컴파일 산출물을 나중 링크에 넘기는 경우에만 파일 의존 근거를 표시한다', async (t) => {
  const compile = 'gcc -c "src/' + PRIVATE + ' input.c" -o "obj/' + PRIVATE + ' output.o"';
  const link = 'clang "./obj/' + PRIVATE + ' output.o" -o app';
  for (const [label, commands, expected] of [
    ['같은 산출물', [compile, 'node --test', link], true],
    ['다른 산출물', [compile, link.replace('output.o', 'other.o')], undefined],
    ['링크가 먼저인 절차', [link, compile], undefined],
  ]) {
    await t.test(label, async (t) => {
      const steps = [checkout, { run: 'choco install make -y' }, ...runSteps(...commands)];
      const root = await fixture(t, { '.github/workflows/native.yml': { jobs: { build: hostJob(steps), verify: hostJob(steps) } } });
      const project = await analyzeProject(root);
      const [record] = project.metadata.taskRunnerWorkflows;
      assert.deepEqual(record.operations.filter(({ language }) => language === 'native').map(({ operation }) => operation),
        label === '링크가 먼저인 절차' ? ['link', 'compile'] : ['compile', 'link']);
      assert.equal(record.fileDependency, expected);
      assert.equal(record.prepared.length, 2);
      clean(project);
    });
  }
});

test('루트의 정확한 도구 버전 선언과 확정한 로컬 언어만 정책 근거로 남긴다', async (t) => {
  const taskPin = '3.54.0+private-pin-marker';
  const root = await fixture(t, {
    '.mise.toml': '[tools]\n"aqua:go-task/task" = { version = "' + taskPin + '" }\nmake = "latest"\n',
    'mise.toml': '[tools]\n"aqua:casey/just" = ["1.52.0"]\nmake = "4.4.1"\n',
    '.tool-versions': 'just 1.52.0\njust system\nmake 4.4.1\ntask ref:' + PRIVATE + '\n',
    'package.json': { name: 'project' },
    'go.mod': 'module example.com/project\n\ngo 1.25.0\n',
    'pyproject.toml': '[project]\nrequires-python = "unrecognized"\n',
    '.github/workflows/setup.yml': { jobs: { onlyCI: hostJob([{ uses: 'mlugg/setup-zig@v2', with: { version: '0.15.2' } }]) } },
    app: null,
  });
  const project = await analyzeProject(root);
  assert.deepEqual(project.metadata.taskRunnerPreferences, [
    { tool: 'task', source: '.mise.toml' }, { tool: 'make', source: '.tool-versions' }, { tool: 'just', source: 'mise.toml' },
  ]);
  assert.ok(!JSON.stringify(project).includes(taskPin));
  assert.deepEqual(project.metadata.taskRunnerLanguages.toSorted(), ['go', 'node']);
  assert.equal(project.requirements.python.state, 'unknown');
  assert.equal(project.requirements.zig.state, 'required');
  const nested = await analyzeProject(path.join(root, 'app'));
  assert.deepEqual(nested.metadata.taskRunnerPreferences, []);
  clean(project);
  clean(nested);
});

test('작업·동적 계산·include·CI를 두 번 분석해도 실행과 파일 변경이 없다', async (t) => {
  const command = `node -e "require('node:fs').writeFileSync('EXECUTED', '${PRIVATE}')"`;
  const root = await fixture(t, {
    'package.json': { scripts: { check: command, preinstall: command } },
    'mise.toml': `[tasks]\ncheck = ${JSON.stringify(command)}\n[env]\nTOKEN = '${PRIVATE}'\n`,
    'Taskfile.yml': `version: 3\nvars: {EXEC: {sh: ${JSON.stringify(command)}}}\nincludes: {remote: 'https://example.invalid/${PRIVATE}'}\ntasks: {check: {cmds: [${JSON.stringify(command)}]}}`,
    'Justfile': `value := \u0060${command}\u0060\ncheck:\n    ${command}\n`,
    'Makefile': `VALUE := $(shell ${command})\ncheck:\n\t${command}\n`,
    'mise-tasks/check': command, '.env': `TOKEN=${PRIVATE}`,
    '.github/workflows/check.yml': `jobs: {check: {runs-on: windows-latest, steps: [{run: ${JSON.stringify(`npm run check -- ${PRIVATE}`)}}]}}`,
  });
  async function snapshot(directory, prefix = '') {
    const result = [];
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = `${prefix}${entry.name}`, target = path.join(directory, entry.name);
      assert.ok(!entry.isSymbolicLink());
      if (entry.isDirectory()) result.push(...await snapshot(target, `${name}/`));
      else result.push([name, await readFile(target)]);
    }
    return result;
  }
  const before = await snapshot(root), first = await analyzeProject(root);
  assert.deepEqual(await analyzeProject(root), first);
  assert.deepEqual(await snapshot(root), before);
  assert.ok(!(await readdir(root)).includes('EXECUTED'));
  assert.equal(first.metadata.taskRunners.length, 6);
  assert.equal(first.metadata.taskRunnerCI.length, 1);
  clean(first);
});
