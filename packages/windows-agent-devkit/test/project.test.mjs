import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, realpath, lstat, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { analyzeProject } from '../src/project.mjs';

const LANGUAGES = ['node', 'python', 'go', 'rust', 'zig', 'dotnet'];
const PREFIX = 'windows-agent-devkit-project-';

async function fixture(t, entries = {}) {
  const base = await realpath(tmpdir());
  const root = await realpath(await mkdtemp(path.join(base, PREFIX)));
  const created = await lstat(root);
  t.after(async () => {
    // Only remove the exact directory created by this test, after checking its identity and parent.
    assert.equal(path.dirname(root), base, '테스트 임시 폴더의 상위 경로를 확인해야 합니다.');
    assert.ok(path.basename(root).startsWith(PREFIX), '테스트 임시 폴더의 접두사를 확인해야 합니다.');
    const info = await lstat(root);
    assert.equal(info.ino, created.ino, '정리 대상의 파일 식별자가 생성 당시와 같아야 합니다.');
    assert.equal(info.dev, created.dev, '정리 대상의 볼륨이 생성 당시와 같아야 합니다.');
    assert.ok(info.isDirectory() && !info.isSymbolicLink(), '테스트 임시 폴더는 실제 디렉터리여야 합니다.');
    assert.equal(await realpath(root), root, '정리 대상은 생성한 임시 폴더여야 합니다.');
    await rm(root, { recursive: true });
  });
  for (const [name, value] of Object.entries(entries)) {
    const target = path.resolve(root, name), relative = path.relative(root, target);
    assert.ok(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
    await mkdir(path.dirname(target), { recursive: true });
    if (value === null) await mkdir(target);
    else await writeFile(target, typeof value === 'object' && !Buffer.isBuffer(value) ? JSON.stringify(value) : value);
  }
  return root;
}

const managerNames = (requirement) => [...new Set(requirement.packageManagers.map((entry) => entry.name))].sort();
const requests = (requirement) => requirement.versionRequests.map(({ source, field, kind, value }) => ({ source, field, kind, value }));
const request = (source, field, kind, value) => ({ source, field, kind, value });

test('빈 루트와 정책 파일은 여섯 언어의 요구 없음과 절대 경로를 반환한다', async (t) => {
  const root = await fixture(t, { '.gitattributes': '* text=auto', '.editorconfig': 'root=true', '.env': 'PASSWORD=노출금지' });
  const result = await analyzeProject(root);
  assert.equal(result.root, root);
  assert.deepEqual(Object.keys(result.requirements), LANGUAGES);
  for (const requirement of Object.values(result.requirements)) {
    assert.deepEqual(requirement, { state: 'not_required', versionRequests: [], packageManagers: [], lockFiles: [], metadata: {}, notes: [] });
  }
  assert.deepEqual(result.environment, { containers: 'not_required', processCompose: 'not_required' });
  assert.deepEqual(result.files, ['.editorconfig', '.gitattributes']);
  assert.deepEqual(result.issues, []);
  assert.ok(!JSON.stringify(result).includes('노출금지'));
});

test('Node 버전과 패키지 관리자 버전 및 devEngines 정책을 구분한다', async (t) => {
  const root = await fixture(t, {
    'package.json': {
      engines: { node: '>=22 <25', pnpm: '^10.0.0' },
      packageManager: 'pnpm@10.20.0+sha512.abcd',
      devEngines: { runtime: [{ name: 'node', version: '^24.0.0', onFail: 'warn' }], packageManager: { name: 'pnpm', version: '10.20.0' } },
      config: { password: '메타데이터비밀' }, scripts: { install: '실행금지' },
    },
    '.nvmrc': 'v24.10.0\n', '.node-version': '24.10.0 # 주석\n', 'pnpm-lock.yaml': '읽을 필요 없는 잠금 내용',
  });
  const { requirements, issues } = await analyzeProject(root), node = requirements.node;
  assert.equal(node.state, 'required');
  assert.deepEqual(requests(node), [
    request('.node-version', 'version', 'exact', '24.10.0'), request('.nvmrc', 'version', 'exact', 'v24.10.0'),
    request('package.json', 'engines.node', 'range', '>=22 <25'), request('package.json', 'devEngines.runtime[0].version', 'range', '^24.0.0'),
  ]);
  assert.deepEqual(managerNames(node), ['pnpm']);
  assert.ok(node.packageManagers.some((entry) => entry.name === 'pnpm' && entry.source === 'package.json' && entry.version === '10.20.0'));
  assert.deepEqual(node.lockFiles, ['pnpm-lock.yaml']);
  assert.equal(node.metadata.packageManagerRequests.length, 3);
  assert.equal(node.metadata.devEngines[0].onFail, 'warn');
  assert.ok(!JSON.stringify(node).includes('메타데이터비밀'));
  assert.ok(!JSON.stringify(node).includes('실행금지'));
  assert.deepEqual(issues, []);
});

test('Node 잠금 파일만 있어도 버전을 발명하지 않고 요구와 관리자들을 찾는다', async (t) => {
  const names = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'];
  const root = await fixture(t, Object.fromEntries(names.map((name) => [name, Buffer.alloc(300_000, 255)])));
  const result = await analyzeProject(root), node = result.requirements.node;
  assert.equal(node.state, 'required');
  assert.deepEqual(node.versionRequests, []);
  assert.deepEqual(node.lockFiles, names.sort());
  assert.deepEqual(managerNames(node), ['bun', 'npm', 'pnpm', 'yarn']);
  assert.ok(result.issues.some((entry) => /관리자/.test(entry.message)));
});

test('Python의 PEP 621과 Poetry 및 uv 선언을 정적으로 읽는다', async (t) => {
  const root = await fixture(t, {
    'pyproject.toml': `[project]\nname = "sample"\nrequires-python = ">=3.11, <3.14"\n[tool.poetry.dependencies]\npython = "^3.11"\n[tool.uv]\nrequired-version = ">=0.8.0"\n[build-system]\nbuild-backend = "hatchling.build"\n`,
    '.python-version': '3.12.7\n', 'uv.lock': '비밀 잠금 내용', 'poetry.lock': '', 'requirements-dev.txt': '--index-url https://user:비밀@example.test/simple',
  });
  const result = await analyzeProject(root), python = result.requirements.python;
  assert.equal(python.state, 'required');
  assert.deepEqual(requests(python), [
    request('.python-version', 'version', 'exact', '3.12.7'), request('pyproject.toml', 'project.requires-python', 'range', '>=3.11, <3.14'),
    request('pyproject.toml', 'tool.poetry.dependencies.python', 'range', '^3.11'),
  ]);
  assert.deepEqual(managerNames(python), ['pip', 'poetry', 'uv']);
  assert.deepEqual(python.lockFiles, ['poetry.lock', 'uv.lock']);
  assert.equal(python.metadata.buildBackend, 'hatchling.build');
  assert.deepEqual(python.metadata.tools, ['uv', 'poetry']);
  assert.ok(!JSON.stringify(result).includes('비밀'));
});

test('Python 버전 파일의 여러 인터프리터와 Conda의 Python 요구를 보존한다', async (t) => {
  const root = await fixture(t, { '.python-version': '3.12.7\n3.13.0\n', 'environment.yml': 'name: demo\nchannels:\n  - private\ndependencies:\n  - python=3.12\n  - pip:\n    - private-token==1\n' });
  const result = await analyzeProject(root), python = result.requirements.python;
  assert.equal(python.state, 'required');
  assert.deepEqual(python.versionRequests.map((entry) => entry.value), ['3.12.7', '3.13.0', '3.12']);
  assert.deepEqual(managerNames(python), ['conda']);
  assert.ok(!JSON.stringify(result).includes('private'));
});

test('Go 최소 요구와 선호 도구 모음을 구분하고 go.sum을 무결성 파일로만 기록한다', async (t) => {
  const root = await fixture(t, {
    'go.mod': 'module example.test/demo\n\ngo 1.24.0\ntoolchain go1.25.3\nrequire (\n example.test/dependency v1.0.0\n)\n',
    'go.work': 'go 1.24.0\ntoolchain default\nuse (\n ./child\n)\n',
    'go.sum': 'example.test/private v1.0.0 h1:기록금지', 'go.work.sum': '무결성 전용',
    '.go-version': '1.25.3\n',
  });
  const result = await analyzeProject(root), go = result.requirements.go;
  assert.equal(go.state, 'required');
  assert.deepEqual(requests(go), [
    request('.go-version', 'version', 'exact', '1.25.3'), request('go.mod', 'go', 'minimum', '1.24.0'),
    request('go.mod', 'toolchain', 'preferred', 'go1.25.3'), request('go.work', 'go', 'minimum', '1.24.0'),
  ]);
  assert.deepEqual(go.lockFiles, []);
  assert.deepEqual(go.metadata.integrityFiles, ['go.sum', 'go.work.sum']);
  assert.equal(go.metadata.toolchainDefault, true);
  assert.ok(!JSON.stringify(result).includes('기록금지'));
  assert.deepEqual(result.issues, []);
});

test('go.sum 부재를 오류로 만들지 않으며 go.sum만으로 Go 버전을 추론하지 않는다', async (t) => {
  const root = await fixture(t, { 'go.mod': 'module example.test/no-dependencies\ngo 1.23\n' });
  const result = await analyzeProject(root);
  assert.equal(result.requirements.go.state, 'required');
  assert.deepEqual(result.requirements.go.lockFiles, []);
  assert.deepEqual(result.issues, []);
  const sumOnly = await fixture(t, { 'go.sum': '해시가 컴파일러 버전은 아니다' });
  const other = await analyzeProject(sumOnly);
  assert.equal(other.requirements.go.state, 'required');
  assert.deepEqual(other.requirements.go.versionRequests, []);
  assert.deepEqual(other.requirements.go.lockFiles, []);
});

test('Cargo 최소 Rust 버전과 rustup 채널·구성 요소를 구분한다', async (t) => {
  const root = await fixture(t, {
    'Cargo.toml': '[package]\nname = "demo"\nrust-version = "1.82"\n',
    'rust-toolchain.toml': '[toolchain]\nchannel = "nightly-2026-10-01"\ncomponents = ["rustfmt", "clippy"]\ntargets = ["x86_64-pc-windows-msvc"]\nprofile = "minimal"\n',
    'Cargo.lock': 'version = 4\n',
  });
  const result = await analyzeProject(root), rust = result.requirements.rust;
  assert.equal(rust.state, 'required');
  assert.deepEqual(requests(rust), [request('Cargo.toml', 'package.rust-version', 'minimum', '1.82'), request('rust-toolchain.toml', 'toolchain.channel', 'channel', 'nightly-2026-10-01')]);
  assert.deepEqual(managerNames(rust), ['cargo']);
  assert.deepEqual(rust.lockFiles, ['Cargo.lock']);
  assert.deepEqual(rust.metadata.components, ['rustfmt', 'clippy']);
  assert.equal(rust.metadata.profile, 'minimal');
});

test('Cargo 작업 공간 상속과 기존 rust-toolchain 형식을 지원한다', async (t) => {
  const root = await fixture(t, {
    'Cargo.toml': '[workspace.package]\nrust-version = "1.85.0"\n[package]\nrust-version.workspace = true\n', 'rust-toolchain': '1.86.0\n',
  });
  const result = await analyzeProject(root), rust = result.requirements.rust;
  assert.equal(rust.state, 'required');
  assert.deepEqual(requests(rust), [request('Cargo.toml', 'workspace.package.rust-version', 'minimum', '1.85.0'), request('rust-toolchain', 'version', 'exact', '1.86.0')]);
  assert.equal(rust.metadata.workspaceRustVersion, true);
  const external = await fixture(t, { 'Cargo.toml': '[package]\nrust-version = { workspace = true }\n' });
  assert.equal((await analyzeProject(external)).requirements.rust.state, 'unknown');
});

test('Zig 고정 버전과 ZON 최상위 최소 버전을 구분하고 중첩 문자열을 무시한다', async (t) => {
  const root = await fixture(t, {
    '.zig-version': '0.15.2\n', 'build.zig': '실행하면 안 되는 Zig 빌드 코드',
    'build.zig.zon': '.{\n .name = .demo,\n .minimum_zig_version = "0.15.1",\n .dependencies = .{ .demo = .{ .minimum_zig_version = "99.0.0", .url = "https://user:비밀@example.test/a" } },\n}\n',
  });
  const result = await analyzeProject(root), zig = result.requirements.zig;
  assert.equal(zig.state, 'required');
  assert.deepEqual(requests(zig), [request('.zig-version', 'version', 'exact', '0.15.2'), request('build.zig.zon', 'minimum_zig_version', 'minimum', '0.15.1')]);
  assert.ok(!JSON.stringify(result).includes('99.0.0'));
  assert.ok(!JSON.stringify(result).includes('비밀'));
});

test('.NET SDK 선택 옵션과 프로젝트·솔루션 표식을 수집한다', async (t) => {
  const root = await fixture(t, {
    'global.json': { sdk: { version: '10.0.100', rollForward: 'latestFeature', allowPrerelease: false, paths: ['.dotnet', '$host$'], errorMessage: '비밀문구' }, secret: '비밀문구' },
    'Demo.csproj': '<Project Sdk="Microsoft.NET.Sdk"><TargetFramework>net10.0</TargetFramework></Project>', 'Demo.sln': '', 'Other.slnx': '',
  });
  const result = await analyzeProject(root), dotnet = result.requirements.dotnet;
  assert.equal(dotnet.state, 'required');
  assert.deepEqual(requests(dotnet), [request('global.json', 'sdk.version', 'sdk', '10.0.100')]);
  assert.deepEqual(dotnet.metadata.sdk, { version: '10.0.100', rollForward: 'latestFeature', allowPrerelease: false, paths: ['.dotnet', '$host$'] });
  assert.deepEqual(managerNames(dotnet), ['nuget']);
  assert.ok(!JSON.stringify(result).includes('비밀문구'));
  assert.ok(!dotnet.versionRequests.some((entry) => /TargetFramework/.test(entry.field)));
});

test('mise와 .tool-versions에서 여섯 언어 버전만 읽고 환경변수와 작업은 반환하지 않는다', async (t) => {
  const root = await fixture(t, {
    'mise.toml': `[tools]\nnode = "24.10.0"\npython = ["3.13.2"]\ngo = { version = "1.25.3" }\nrust = "stable"\nzig = "0.15.2"\ndotnet = "10.0.100"\nruby = "4.0"\n[env]\nTOKEN = "mise비밀"\n[tasks.build]\nrun = "실행금지"\n`,
    '.tool-versions': 'nodejs 24.10.0\npython 3.13.2\ngolang 1.25.3\nrust stable\nzig 0.15.2\ndotnet 10.0.100\nruby 4.0\n',
  });
  const result = await analyzeProject(root);
  for (const language of LANGUAGES) {
    const requirement = result.requirements[language];
    assert.equal(requirement.state, 'required', language);
    assert.equal(requirement.versionRequests.length, 2, language);
    assert.deepEqual(requirement.metadata.versionManagers, ['asdf', 'mise']);
  }
  assert.ok(!JSON.stringify(result).includes('mise비밀'));
  assert.ok(!JSON.stringify(result).includes('실행금지'));
  assert.deepEqual(result.issues, []);
});

test('TOML의 주석·인용 키·다중 행 배열과 내부 선언처럼 보이는 문자열을 안전하게 처리한다', async (t) => {
  const root = await fixture(t, {
    'mise.toml': `[env]\nTEXT = '''\n[tools]\nnode = "99.0.0"\n'''\n[tools]\n"python" = [\n "3.13.2", # 주석\n]\n[tools.go]\nversion = '1.25.3'\n`,
    'pyproject.toml': 'project.requires-python = ">=3.12" # 주석\n',
  });
  const result = await analyzeProject(root);
  assert.equal(result.requirements.node.state, 'not_required');
  assert.ok(!JSON.stringify(result).includes('99.0.0'));
  assert.equal(result.requirements.python.versionRequests.length, 2);
  assert.equal(result.requirements.go.versionRequests[0].value, '1.25.3');
});

test('표식 파일만 있는 각 언어에는 버전 요청을 만들지 않는다', async (t) => {
  for (const [language, name, content] of [
    ['node', 'package.json', '{}'], ['python', 'requirements.txt', 'a==1'], ['go', 'go.sum', ''],
    ['rust', 'Cargo.lock', ''], ['zig', 'build.zig', ''], ['dotnet', 'Only.csproj', '<Project/>'],
  ]) {
    const root = await fixture(t, { [name]: content });
    const result = await analyzeProject(root);
    assert.equal(result.requirements[language].state, 'required', name);
    assert.deepEqual(result.requirements[language].versionRequests, [], name);
    for (const other of LANGUAGES.filter((entry) => entry !== language)) assert.equal(result.requirements[other].state, 'not_required', `${name}:${other}`);
  }
});

test('실행 문맥이 없는 컨테이너 표식은 미확인이며 Process Compose는 설정 존재로 적용한다', async (t) => {
  const root = await fixture(t, {
    'Dockerfile': 'RUN 비밀명령', 'compose.yaml': 'services: {}', '.devcontainer/devcontainer.json': '{잘못된 JSON}',
    'process-compose.yaml': 'processes:\n  demo:\n    command: 비밀실행\n', 'process-compose.override.yml': '',
  });
  const result = await analyzeProject(root);
  assert.deepEqual(result.environment, { containers: 'unknown', processCompose: 'required' });
  assert.ok(result.files.includes('.devcontainer/devcontainer.json'));
  assert.ok(!JSON.stringify(result).includes('비밀'));
  assert.ok(Object.values(result.requirements).every((entry) => entry.state === 'not_required'));
});

test('선언의 읽기 실패와 크기·인코딩 오류는 관련 요구를 unknown으로 유지한다', async (t) => {
  const root = await fixture(t, {
    'package.json': null, '.nvmrc': '24.10.0', 'pyproject.toml': Buffer.alloc(256 * 1024 + 1, 32),
    '.zig-version': Buffer.from([0xff, 0xfe]), 'global.json': Buffer.from([0, 0]), 'process-compose.yaml': null,
  });
  const result = await analyzeProject(root);
  for (const language of ['node', 'python', 'zig', 'dotnet']) assert.equal(result.requirements[language].state, 'unknown', language);
  assert.equal(result.requirements.node.versionRequests[0].value, '24.10.0');
  assert.equal(result.environment.processCompose, 'unknown');
  assert.ok(result.issues.every((entry) => /[가-힣]/.test(entry.message)));
});

test('존재하지 않거나 디렉터리가 아닌 루트는 요구 없음으로 보고하지 않는다', async (t) => {
  const root = await fixture(t, { file: '내용' });
  for (const target of [path.join(root, 'missing'), path.join(root, 'file')]) {
    const result = await analyzeProject(target);
    assert.equal(result.root, target);
    assert.ok(Object.values(result.requirements).every((entry) => entry.state === 'unknown'));
    assert.deepEqual(result.environment, { containers: 'unknown', processCompose: 'unknown' });
    assert.ok(result.issues.length > 0);
  }
});

test('잘못되거나 지원하지 않는 선언은 관련 언어를 미확인으로 남기고 비밀 값을 반환하지 않는다', async (t) => {
  const cases = [
    ['node', 'package.json', '{"engines":{"node":"24"},'],
    ['node', 'package.json', { engines: { node: 'https://user:선언비밀@example.test/node' } }],
    ['node', 'package.json', { packageManager: 'npm@https://user:선언비밀@example.test/npm' }],
    ['node', 'package.json', { devEngines: { runtime: { name: 'node', version: '${선언비밀}' } } }],
    ['node', 'package.json', '{"engines":{"node":"22"},"engines":{"node":"24"}}'],
    ['python', 'pyproject.toml', '[project]\nrequires-python = "${선언비밀}"\n'],
    ['python', 'pyproject.toml', '[project]\nrequires-python = [\n'],
    ['python', 'pyproject.toml', '[project]\nname = bare_invalid\n'],
    ['python', 'pyproject.toml', '[project]\nname = \'bad\'junk\n'],
    ['python', 'pyproject.toml', '[project]\ndynamic = ["requires-python"]\n'],
    ['go', 'go.mod', 'module example.test/demo\ngo invalid\n'],
    ['go', 'go.mod', 'module example.test/demo\ngo 1.24\n/* 未完了'],
    ['go', 'go.mod', 'go 1.24\n'],
    ['go', 'go.work', 'go 1.24\ntoolchain https://user:선언비밀@example.test/go\n'],
    ['rust', 'Cargo.toml', '[package]\nrust-version = 1.82\n'],
    ['rust', 'rust-toolchain.toml', '[toolchain]\nchannel = "${선언비밀}"\n'],
    ['rust', 'rust-toolchain.toml', '[toolchain]\n'],
    ['zig', 'build.zig.zon', '.{ .minimum_zig_version = @import("선언비밀"), }'],
    ['zig', 'build.zig.zon', '.{ .minimum_zig_version = "0.15.0", .other = [{]}, }'],
    ['dotnet', 'global.json', { sdk: { version: '10.0.x' } }],
    ['dotnet', 'global.json', { sdk: { version: '10.0.100', paths: ['https://user:선언비밀@example.test/sdk'] } }],
    ['dotnet', 'global.json', { sdk: { rollForward: 'latestFeature' } }],
    ['node', 'mise.toml', '[tools]\nnode = "{{ env.선언비밀 }}"\n'],
    ['python', 'mise.toml', '[tools]\npython = { version = "3.13", postinstall = "선언비밀" }\n'],
    ['node', 'mise.toml', '[tools.node]\n'],
    ['python', 'environment.yml', 'dependencies: "${선언비밀}"\n'],
    ['python', 'environment.yml', 'dependencies:\n  - "python=3.13\n'],
    ['rust', '.tool-versions', 'rust ref:선언비밀\n'],
  ];
  for (const [language, name, value] of cases) {
    const root = await fixture(t, { [name]: value });
    const result = await analyzeProject(root);
    assert.equal(result.requirements[language].state, 'unknown', `${language}:${name}:${JSON.stringify(value)}`);
    assert.ok(result.issues.length > 0, name);
    assert.ok(!JSON.stringify(result).includes('선언비밀'), name);
  }
});

test('충돌하는 고정 버전과 다중 관리자 선언을 조용히 선택하지 않는다', async (t) => {
  const root = await fixture(t, { '.nvmrc': '22.0.0', '.node-version': '24.0.0', 'package-lock.json': '', 'yarn.lock': '' });
  const result = await analyzeProject(root);
  assert.equal(result.requirements.node.state, 'unknown');
  assert.equal(result.requirements.node.versionRequests.length, 2);
  assert.ok(result.issues.some((entry) => /충돌/.test(entry.message)));
  assert.ok(result.issues.some((entry) => /관리자/.test(entry.message)));
});

test('mise 전체 문법 오류와 외부 include는 추가 언어 요구를 없다고 단정하지 않는다', async (t) => {
  for (const text of ['[tools\nnode = "24"', 'include = ["https://user:외부비밀@example.test/config"]\n']) {
    const root = await fixture(t, { 'mise.toml': text });
    const result = await analyzeProject(root);
    assert.ok(Object.values(result.requirements).every((entry) => entry.state === 'unknown'));
    assert.ok(!JSON.stringify(result).includes('외부비밀'));
  }
});

test('하위 소스·의존성은 탐색하지 않으며 상위 SDK 선언은 경계 안에서 찾는다', async (t) => {
  const root = await fixture(t, {
    'global.json': { sdk: { version: '10.0.100' } }, 'child/README.md': '문서',
    'child/src/package.json': { engines: { node: '24' } }, 'child/node_modules/python/pyproject.toml': '[project]\nrequires-python=">=3.13"',
    'child/.env': 'TOKEN=루트비밀',
  });
  const result = await analyzeProject(path.join(root, 'child'));
  assert.deepEqual(result.files, ['../global.json']);
  assert.deepEqual(result.requirements.dotnet.versionRequests, [request('../global.json', 'sdk.version', 'sdk', '10.0.100')]);
  assert.ok(Object.entries(result.requirements).filter(([language]) => language !== 'dotnet').every(([, entry]) => entry.state === 'not_required'));
});

test('Go의 주석·경로 문자열과 의존성 블록에서 가짜 버전 지시문을 추출하지 않는다', async (t) => {
  const root = await fixture(t, {
    'go.mod': 'module "example.test/go"\n// go 99.0.0\n/*\n toolchain go99.0.0\n*/\ngo 1.24.0 // 최소 버전\nrequire (\n go 99.0.0\n)\n',
  });
  const result = await analyzeProject(root);
  assert.equal(result.requirements.go.state, 'required');
  assert.deepEqual(requests(result.requirements.go), [request('go.mod', 'go', 'minimum', '1.24.0')]);
  assert.ok(!JSON.stringify(result).includes('99.0.0'));
});

test('다른 도구 이름과 중첩 pip 의존성을 언어 버전으로 오인하지 않는다', async (t) => {
  const root = await fixture(t, {
    '.tool-versions': 'constructor 1.0.0\ntoString 2.0.0\nruby 3.4\n',
    'environment.yml': 'dependencies:\n  - pip:\n    - python==99.0.0\n# 주석\n  - python=3.12\n',
  });
  const result = await analyzeProject(root);
  assert.equal(result.requirements.node.state, 'not_required');
  assert.equal(result.requirements.python.state, 'required');
  assert.deepEqual(requests(result.requirements.python), [request('environment.yml', 'dependencies.python', 'range', '3.12')]);
  assert.ok(!JSON.stringify(result).includes('99.0.0'));
});

test('선언 파일 수 한도를 넘으면 이미 확인한 요구도 미확인으로 남긴다', async (t) => {
  const entries = Object.fromEntries(Array.from({ length: 129 }, (_, index) => [`requirements-${String(index).padStart(3, '0')}.txt`, 'package==1.0']));
  const root = await fixture(t, entries);
  const result = await analyzeProject(root);
  assert.equal(result.files.length, 129);
  assert.equal(result.requirements.python.state, 'unknown');
  assert.equal(result.requirements.node.state, 'not_required');
  assert.ok(result.issues.some((entry) => /파일 수/.test(entry.message)));
});

test('두 Rust 도구 모음 파일이 함께 있으면 선언을 보존하고 선택을 미확인으로 남긴다', async (t) => {
  const root = await fixture(t, { 'rust-toolchain': 'stable', 'rust-toolchain.toml': '[toolchain]\nchannel = "nightly"\n' });
  const result = await analyzeProject(root);
  assert.equal(result.requirements.rust.state, 'unknown');
  assert.equal(result.requirements.rust.versionRequests.length, 2);
});

test('컨테이너 설정 폴더의 링크는 따라가지 않는다', async (t) => {
  const outside = await fixture(t, { 'devcontainer.json': '{"secret":"컨테이너비밀"}' });
  const root = await fixture(t);
  try { await symlink(outside, path.join(root, '.devcontainer'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('이 실행 문맥에서는 폴더 링크 생성 권한이 없습니다.'); return; }
    throw error;
  }
  const result = await analyzeProject(root);
  assert.equal(result.environment.containers, 'unknown');
  assert.ok(!result.files.includes('.devcontainer/devcontainer.json'));
  assert.ok(!JSON.stringify(result).includes('컨테이너비밀'));
});

test('프로젝트 명령을 실행하지 않고 두 번 분석해도 파일과 내용이 보존된다', async (t) => {
  const payload = 'require("node:fs").writeFileSync("실행됨", "부작용")';
  const root = await fixture(t, {
    'package.json': { engines: { node: '>=24' }, scripts: { preinstall: `node -e '${payload}'`, test: `node -e '${payload}'` } },
    'mise.toml': `[tools]\nnode = "24.10.0"\n[tasks.start]\nrun = "${payload.replaceAll('"', '\\"')}"\n`,
    'build.zig': '@compileError("실행되면 실패");', '.env': 'TOKEN=읽기금지',
    'process-compose.yaml': `processes:\n  malicious:\n    command: node -e '${payload}'\n`,
  });
  const names = (await readdir(root)).sort();
  const before = await Promise.all(names.map((name) => readFile(path.join(root, name))));
  const first = await analyzeProject(root), second = await analyzeProject(root);
  assert.deepEqual(second, first);
  assert.deepEqual((await readdir(root)).sort(), names);
  assert.deepEqual(await Promise.all(names.map((name) => readFile(path.join(root, name)))), before);
  assert.ok(!JSON.stringify(first).includes('읽기금지'));
});

test('선언 파일 링크를 따라가서 프로젝트 밖의 내용을 읽지 않는다', async (t) => {
  const outside = await fixture(t, { 'secret.json': { engines: { node: '99.0.0' } } });
  const root = await fixture(t);
  try { await symlink(path.join(outside, 'secret.json'), path.join(root, 'package.json'), 'file'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('이 실행 문맥에서는 파일 심볼릭 링크 생성 권한이 없습니다.'); return; }
    throw error;
  }
  const result = await analyzeProject(root);
  assert.equal(result.requirements.node.state, 'unknown');
  assert.deepEqual(result.requirements.node.versionRequests, []);
  assert.ok(!JSON.stringify(result).includes('99.0.0'));
});
