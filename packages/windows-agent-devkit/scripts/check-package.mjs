import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { isBuiltin } from 'node:module';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { parse as parseYaml } from 'yaml';
import { BUNDLE_PATH, bundleOptions } from './lib/bundle.mjs';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const MARKETPLACE_NAME = 'windows-agent-devkit-local';
const RUNTIME_SCRIPTS = ['collect-advanced.ps1', 'collect-host.ps1'];
const DEPENDENCIES = { '@renovatebot/pep440': '6.0.0', semver: '7.8.6', 'smol-toml': '1.9.1', yaml: '2.9.1' };
const DEV_DEPENDENCIES = { esbuild: '0.28.2' };
const normalized = (value) => value.replaceAll('\\', '/');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));

export function inside(root, target) {
  const child = relative(root, target);
  return child === '' || !isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`);
}
export async function filesUnder(directory, { optional = false } = {}) {
  let info;
  try { info = await lstat(directory); }
  catch (error) { if (optional && error.code === 'ENOENT') return []; throw error; }
  assert.ok(!info.isSymbolicLink(), `링크는 패키지에 포함하지 않습니다: ${directory}`);
  if (info.isFile()) return [directory];
  assert.ok(info.isDirectory(), `일반 디렉터리가 필요합니다: ${directory}`);
  const files = [];
  for (const name of (await readdir(directory)).sort()) files.push(...await filesUnder(join(directory, name)));
  return files;
}
export function isRuntimeScript(name) {
  return RUNTIME_SCRIPTS.includes(name);
}
export async function runtimeScriptFiles(root) {
  const directory = join(root, 'scripts');
  assert.ok((await lstat(directory)).isDirectory(), '런타임 scripts 경로에는 일반 디렉터리가 필요합니다.');
  const entries = new Map((await readdir(directory, { withFileTypes: true })).map((entry) => [entry.name, entry]));
  return RUNTIME_SCRIPTS.map((name) => {
    assert.ok(entries.get(name)?.isFile(), `필수 런타임 스크립트가 일반 파일이어야 합니다: ${name}`);
    return join(directory, name);
  });
}
export async function verifyDependencies(root = ROOT) {
  const packageData = await json(join(root, 'package.json')), lock = await json(join(root, 'package-lock.json'));
  assert.deepEqual(packageData.dependencies, DEPENDENCIES, '프로덕션 의존성 네 개의 정확한 버전을 유지해야 합니다.');
  assert.deepEqual(packageData.devDependencies, DEV_DEPENDENCIES, 'esbuild의 정확한 버전을 유지해야 합니다.');
  assert.equal(lock.lockfileVersion, 3, 'npm lockfileVersion 3이 필요합니다.');
  assert.equal(lock.name, packageData.name, 'lock 이름');
  assert.equal(lock.version, packageData.version, 'lock 루트 버전');
  assert.equal(lock.packages?.['']?.name, packageData.name, 'lock packages 루트 이름');
  assert.equal(lock.packages[''].version, packageData.version, 'lock packages 루트 버전');
  assert.deepEqual(lock.packages[''].dependencies, packageData.dependencies, 'lock 프로덕션 선언');
  assert.deepEqual(lock.packages[''].devDependencies, packageData.devDependencies, 'lock 개발 선언');
  for (const [name, version] of Object.entries({ ...DEPENDENCIES, ...DEV_DEPENDENCIES })) {
    const location = `node_modules/${name}`, record = lock.packages[location];
    assert.equal(record?.version, version, `lock 고정 버전: ${name}`);
    assert.match(record.integrity ?? '', /^sha512-\S+$/, `lock 무결성: ${name}`);
    const installed = await json(join(root, location, 'package.json'));
    assert.equal(installed.name, name, `설치된 패키지 이름: ${name}`);
    assert.equal(installed.version, version, `설치된 패키지 버전: ${name}`);
  }
  for (const [location, record] of Object.entries(lock.packages)) {
    if (location.startsWith('node_modules/@esbuild/')) assert.equal(record.version, DEV_DEPENDENCIES.esbuild, `esbuild 선택 바이너리: ${location}`);
  }
  return { packageData, lock };
}
export async function verifyManifest(root, packageData) {
  const manifest = await json(join(root, 'plugin.json'));
  assert.equal(manifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.match(manifest.name, /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/);
  assert.ok(manifest.name.length <= 64 && !manifest.name.includes('--') && !manifest.name.includes('..'));
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.name, packageData.name);
  assert.equal(manifest.version, packageData.version);
  for (const field of ['skills', 'mcpServers', 'apps', 'interface']) assert.ok(!(field in manifest), `portable manifest: ${field}`);
  const pluginInterface = manifest.extensions?.['com.openai']?.interface;
  assert.ok(pluginInterface?.displayName);
  assert.deepEqual(pluginInterface.capabilities, ['Read'], '플러그인의 읽기 전용 범위');
  return manifest;
}

export function verifyBundleGraph(metafile, lock) {
  const outputs = Object.values(metafile.outputs);
  assert.equal(outputs.length, 1, '설치 CLI는 단일 번들이어야 합니다.');
  for (const item of outputs[0].imports) assert.ok(item.external && isBuiltin(item.path), `번들 밖의 패키지 의존성: ${item.path}`);
  const packages = Object.entries(lock.packages).filter(([location]) => location).map(([location, record]) => ({ location, ...record }));
  for (const input of Object.keys(metafile.inputs).filter((file) => normalized(file).startsWith('node_modules/'))) {
    const record = packages.filter((p) => normalized(input).startsWith(`${p.location}/`)).sort((a, b) => b.location.length - a.location.length)[0];
    assert.ok(record && !record.dev && !record.link, `lock에 없는 패키지 또는 개발 의존성 번들: ${input}`);
  }
}
async function verifyBundleMatchesSource(sourceRoot, artifactRoot, lock, message) {
  const expected = await build({ ...bundleOptions(sourceRoot), write: false });
  verifyBundleGraph(expected.metafile, lock);
  const actual = await readFile(join(artifactRoot, BUNDLE_PATH));
  assert.ok(actual.equals(expected.outputFiles[0].contents), message);
}
export async function productionNotices(root, lock) {
  const components = [], notices = ['Windows Agent Devkit: 포함된 프로덕션 패키지와 라이선스 원문\n'];
  // Include the production closure, including modules removed by tree shaking.
  for (const [location, record] of Object.entries(lock.packages).filter(([location, p]) => location && !p.dev).sort(([a], [b]) => a.localeCompare(b))) {
    assert.ok(/^node_modules\//.test(location) && !location.split('/').includes('..') && !record.link, '지원하지 않는 lock 패키지 경로');
    const directory = join(root, location), metadata = await json(join(directory, 'package.json'));
    assert.equal(metadata.version, record.version, `프로덕션 설치 버전: ${location}`);
    const licenses = [];
    for (const file of await filesUnder(directory)) {
      if (dirname(file) !== directory || !/^(?:licen[sc]e|notice|copying|copyright)(?:[._-]|$)/i.test(basename(file))) continue;
      const content = await readFile(file, 'utf8');
      if (content.trim()) licenses.push({ name: basename(file), content });
    }
    assert.ok(licenses.some((file) => /^(?:licen[sc]e|copying)(?:[._-]|$)/i.test(file.name)), `라이선스 원문 누락: ${metadata.name}`);
    components.push({ name: metadata.name, version: metadata.version, license: metadata.license ?? record.license ?? 'SEE LICENSE', files: licenses.map((file) => file.name) });
    notices.push(`${metadata.name}@${metadata.version}\nLicense: ${String(metadata.license ?? record.license ?? 'SEE LICENSE')}\n`);
    for (const file of licenses) notices.push(`----- ${metadata.name}@${metadata.version} / ${file.name} -----\n${file.content}\n`);
  }
  return { components, text: notices.join('\n') };
}

async function verifyTextFiles(root, files, { skills = false } = {}) {
  let links = 0, skillCount = 0;
  for (const file of files) {
    const label = normalized(relative(root, file));
    if (!/\.(?:go|md|mjs|ps1|json|ya?ml)$/.test(file)) continue;
    const content = await readFile(file, 'utf8');
    assert.ok(content.endsWith('\n'), `마지막 줄바꿈: ${label}`);
    assert.ok(!content.includes('\r'), `LF: ${label}`);
    assert.ok(!/[\u3040-\u30ff]|\u65e2\u5b58/.test(content), `의도하지 않은 문구: ${label}`);
    if (skills && label.startsWith('skills/') && basename(file) === 'SKILL.md') {
      const frontmatter = /^---\n([\s\S]+?)\n---(?:\n|$)/.exec(content);
      assert.ok(frontmatter, `Skill frontmatter: ${label}`);
      const metadata = parseYaml(frontmatter[1]);
      assert.equal(metadata.name, basename(dirname(file)), `Skill 이름: ${label}`);
      assert.match(metadata.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.ok(typeof metadata.description === 'string' && metadata.description.trim() && Buffer.byteLength(content) <= 1024 * 1024, `Skill 설명·크기: ${label}`);
      assert.ok(!/src[\\/]cli\.mjs/.test(content), `설치 Skill은 dist/cli.mjs를 사용해야 합니다: ${label}`);
      skillCount++;
    }
    if (!file.endsWith('.md')) continue;
    assert.equal((content.match(/^```/gm) ?? []).length % 2, 0, `코드 블록: ${label}`);
    const targets = [...content.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)].map((m) => m[1].replace(/^<|>$/g, ''));
    if (label.startsWith('skills/')) targets.push(...[...content.matchAll(/`((?:\.\.\/)+(?:docs|scripts|dist|data)\/[^`\r\n]+)`/g)].map((m) => m[1]));
    for (const target of targets) {
      if (/^[a-z][a-z0-9+.-]*:|^#/i.test(target)) continue;
      const name = decodeURIComponent(target.split(/[?#]/, 1)[0]);
      const resolved = name.startsWith('/') ? resolve(root, `.${name}`) : resolve(dirname(file), name);
      assert.ok(inside(root, resolved), `저장소 밖의 참조: ${label}`);
      const info = await lstat(resolved);
      assert.ok((info.isFile() || info.isDirectory()) && !info.isSymbolicLink(), `문서 참조: ${label}`);
      links++;
    }
    for (const match of content.matchAll(/^```json\n([\s\S]*?)^```/gm)) JSON.parse(match[1]);
  }
  return { links, skills: skillCount };
}

function childEnvironment() {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) if (/^(?:NODE_OPTIONS|NODE_PATH|DOTNET_STARTUP_HOOKS|DOTNET_ADDITIONAL_DEPS|DOTNET_SHARED_STORE|PYTHONSTARTUP)$/i.test(name)) delete environment[name];
  return environment;
}
async function runNode(args, cwd) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, { cwd, env: childEnvironment(), shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', count = 0, failed = false;
    const timer = setTimeout(() => { failed = true; child.kill(); reject(new Error('번들 실행 검사 제한 시간을 초과했습니다.')); }, 45000);
    child.stdout.on('data', (chunk) => { count += chunk.length; if (count <= 2 * 1024 * 1024) stdout += chunk; else { failed = true; child.kill(); reject(new Error('번들 검사 출력 한도를 초과했습니다.')); } });
    child.stderr.on('data', (chunk) => { count += chunk.length; if (count > 2 * 1024 * 1024) { failed = true; child.kill(); reject(new Error('번들 검사 출력 한도를 초과했습니다.')); } });
    child.on('error', () => { clearTimeout(timer); reject(new Error('번들 검사 프로세스를 실행하지 못했습니다.')); });
    child.on('close', (code) => { clearTimeout(timer); if (!failed) resolvePromise({ code, stdout }); });
  });
}
export async function smokeBundle(root, version) {
  const temporary = await mkdtemp(join(tmpdir(), 'windows-agent-devkit-bundle-'));
  const canonical = await realpath(temporary), parent = await realpath(tmpdir());
  assert.equal(dirname(canonical), parent);
  assert.ok(basename(canonical).startsWith('windows-agent-devkit-bundle-'));
  try {
    const isolated = join(temporary, 'plugin'), fixture = join(temporary, 'project'), state = join(temporary, 'state');
    const cli = join(isolated, BUNDLE_PATH);
    await mkdir(dirname(cli), { recursive: true }); await mkdir(fixture);
    await cp(join(root, BUNDLE_PATH), cli, { dereference: false });
    await mkdir(join(isolated, 'scripts'));
    for (const file of await runtimeScriptFiles(root)) await cp(file, join(isolated, 'scripts', basename(file)));
    for (const file of await filesUnder(join(root, 'data'), { optional: true })) { const target = join(isolated, 'data', relative(join(root, 'data'), file)); await mkdir(dirname(target), { recursive: true }); await cp(file, target); }
    assert.ok(!(await filesUnder(isolated)).some((file) => normalized(relative(isolated, file)).split('/').includes('node_modules')));
    await mkdir(join(fixture, '.git'));
    const declarations = {
      'package.json': '{"engines":{"node":">=24 <25"},"scripts":{"check":"never-execute-this-task"}}\n',
      'mise.toml': '[tools]\nnode="24.18.1"\npython="3.14.0"\n[tasks.check]\nrun="never-execute-this-task"\n',
      'Taskfile.yml': 'version: "3"\ntasks:\n  check:\n    cmds: [never-execute-this-task]\n',
      Justfile: 'check:\n    never-execute-this-task\n',
      Makefile: '.PHONY: check\ncheck:\n\tnever-execute-this-task\n',
      'pyproject.toml': '[project]\nname="bundle-fixture"\nversion="1.0.0"\nrequires-python=">=3.12"\n',
      'process-compose.yaml': 'version: "0.5"\nprocesses:\n  example:\n    command: "never-execute-this-service"\n',
      '.env': 'PRIVATE_SENTINEL=never-copy-this-value\n',
    };
    for (const [name, content] of Object.entries(declarations)) await writeFile(join(fixture, name), content);
    const observedVersion = await runNode([cli, '--version'], temporary);
    assert.equal(observedVersion.code, 0, '독립 번들 --version 종료 코드'); assert.equal(observedVersion.stdout.trim(), version);
    const help = await runNode([cli, '--help'], temporary);
    assert.equal(help.code, 0, '독립 번들 --help 종료 코드'); assert.match(help.stdout, /Windows Agent Devkit/);
    const harness = `import assert from 'node:assert/strict';
const {main}=await import(${JSON.stringify(pathToFileURL(cli).href)});
const host={context:{platform:'win32',cwd:${JSON.stringify(fixture)},processArchitecture:'x64',os:{name:'Microsoft Windows 11 Pro',build:'26200',architecture:'64-bit'},diagnosticShell:{name:'pwsh',version:'7.6.9',profileApplied:false}},commands:{},probes:{},environment:{}};
for(const [name,version] of [['node','24.18.1'],['python','3.14.0']]){host.commands[name]=[{path:'C:/bundle-fixture/'+name+'.exe',commandType:'Application'}];host.probes[name]={state:'succeeded',version,executable:'C:/bundle-fixture/'+name+'.exe'};}
const code=await main(['doctor','--project',${JSON.stringify(fixture)},'--native','--format','json','--state-dir',${JSON.stringify(state)}],{inspect:async()=>host,query:async()=>({state:'not_run',stdout:'',stderr:'',exitCode:null,reason:'smoke query disabled'})});
assert.ok(code===0||code===1);`;
    const tested = await runNode(['--input-type=module', '--eval', harness], temporary);
    assert.equal(tested.code, 0, '의존성 없는 번들 진단 검사');
    const report = JSON.parse(tested.stdout);
    assert.equal(report.pluginVersion, version); assert.ok(Array.isArray(report.checks) && report.checks.length > 0);
    assert.deepEqual(new Set(report.taskRunners.declarations.map((item) => item.tool)), new Set(['mise', 'task', 'just', 'make', 'npm']), '독립 번들의 작업 실행기 탐지');
    assert.equal(report.taskRunners.recommendation.action, 'keep', '독립 번들의 기존 작업 실행기 유지 판정');
    assert.equal(report.taskRunners.recommended, null, '독립 번들이 여러 실행기를 한 가지로 바꾸도록 제안하지 않습니다.');
    assert.ok(!Object.hasOwn(report, 'task') && !Object.hasOwn(report, 'validation'), '독립 번들에 작업 실행 결과가 없어야 합니다.');
    assert.ok(report.commandGuidance.some(({ tool, args }) => tool === 'node' && args[0] === '--version'));
    for (const id of ['RUST-02', 'WSL-02', 'CTR-02', 'PC-02']) {
      const check = report.checks.find((item) => item.checkId === id);
      assert.equal(check.status, 'skipped');
      assert.equal(check.execution, 'not_run');
    }
    const retired = await runNode([cli, 'validate', '--execute', '--docker-context', 'invalid-smoke', '--project', fixture], temporary);
    assert.equal(retired.code, 2, '설치 번들은 기존 기동 검증 진입점을 거부합니다.');
    assert.equal(retired.stdout, '');
    await assert.rejects(lstat(state), { code: 'ENOENT' }, '진단은 상태 디렉터리를 만들지 않습니다.');
    for (const id of ['NODE-01', 'PY-01']) assert.equal(report.checks.find((c) => c.checkId === id)?.compatibility, 'satisfied', `번들 파서·버전 검사: ${id}`);
    assert.ok(!tested.stdout.includes('never-copy-this-value'), '비밀 값 제외');
    let native = 'not_applicable';
    if (process.platform === 'win32') {
      const empty = join(temporary, 'empty'); await mkdir(empty); await mkdir(join(empty, '.git'));
      const live = await runNode([cli, 'doctor', '--project', empty, '--format', 'json', '--timeout-ms', '5000', '--state-dir', state], temporary);
      assert.ok([0, 1].includes(live.code), 'Windows 번들·PowerShell 자산 실제 실행');
      assert.ok(Array.isArray(JSON.parse(live.stdout).checks), 'Windows 진단 JSON');
      await assert.rejects(lstat(join(empty, '.codex')), { code: 'ENOENT' }, '진단은 프로젝트 권한 파일을 만들지 않습니다.');
      native = 'passed';
    }
    for (const [name, content] of Object.entries(declarations)) assert.equal(await readFile(join(fixture, name), 'utf8'), content, `진단 원본 보존: ${name}`);
    return { version, isolated: true, parsers: 'passed', native };
  } finally {
    // Only the fresh smoke directory is removable; check identity and all links.
    assert.equal(await realpath(temporary), canonical); assert.equal(dirname(canonical), parent);
    await filesUnder(temporary);
    await rm(temporary, { recursive: true, force: false });
  }
}

export async function checkRepository(root = ROOT) {
  const { packageData, lock } = await verifyDependencies(root);
  await verifyManifest(root, packageData);
  const files = ['README.md', 'package.json', 'package-lock.json', 'plugin.json'].map((file) => join(root, file));
  for (const directory of ['docs', 'skills', 'src', 'scripts', 'test']) files.push(...await filesUnder(join(root, directory)));
  for (const optionalPath of ['AGENTS.md', '.github/workflows', 'data']) files.push(...await filesUnder(join(root, optionalPath), { optional: true }));
  const text = await verifyTextFiles(root, files, { skills: true });
  assert.equal(text.skills, 1, '읽기 전용 진단 Skill만 포함합니다.');
  await verifyBundleMatchesSource(root, root, lock, 'dist/cli.mjs가 현재 소스의 빌드와 다릅니다. npm run build를 실행하세요.');
  const smoke = await smokeBundle(root, packageData.version);
  return { ...text, smoke };
}
export async function verifyPackaged(directory, sourceRoot = ROOT) {
  const { packageData, lock } = await verifyDependencies(sourceRoot), manifest = await verifyManifest(directory, packageData);
  const files = await filesUnder(directory);
  for (const file of files) {
    const label = normalized(relative(directory, file)), parts = label.split('/');
    assert.ok(!parts.some((p) => ['node_modules', 'src', 'tools', '.git', '.codegraph', 'test'].includes(p)), `설치에 불필요한 파일: ${label}`);
  }
  await runtimeScriptFiles(directory);
  assert.ok((await readdir(join(directory, 'scripts'))).every(isRuntimeScript), '설치 패키지의 scripts에는 지정한 런타임 파일만 포함해야 합니다.');
  for (const source of await runtimeScriptFiles(sourceRoot)) assert.deepEqual(await readFile(join(directory, 'scripts', basename(source))), await readFile(source), `런타임 스크립트: ${basename(source)}`);
  await verifyBundleMatchesSource(sourceRoot, directory, lock, '설치 패키지의 dist/cli.mjs가 현재 소스의 빌드와 다릅니다. npm run package를 실행하세요.');
  for (const file of await filesUnder(join(sourceRoot, 'data'), { optional: true })) assert.deepEqual(await readFile(join(directory, 'data', relative(join(sourceRoot, 'data'), file))), await readFile(file), '런타임 data 자산');
  const compatibility = await json(join(directory, '.codex-plugin', 'plugin.json'));
  assert.equal(compatibility.name, manifest.name); assert.equal(compatibility.version, manifest.version); assert.equal(compatibility.skills, './skills/');
  assert.deepEqual(compatibility.interface, manifest.extensions['com.openai'].interface);
  const notices = await productionNotices(sourceRoot, lock);
  assert.deepEqual(await json(join(directory, 'THIRD_PARTY_COMPONENTS.json')), notices.components, '프로덕션 전이 의존성 고지');
  assert.equal(await readFile(join(directory, 'THIRD_PARTY_NOTICES.txt'), 'utf8'), notices.text, 'LICENSE·NOTICE 원문');
  const text = await verifyTextFiles(directory, files, { skills: true });
  assert.equal(text.skills, 1, '설치 패키지는 읽기 전용 진단 Skill만 포함합니다.');
  return { directory, ...text, components: notices.components.length, smoke: await smokeBundle(directory, manifest.version) };
}
export async function checkMarketplace(root = ROOT) {
  const marketplace = join(root, '.local', 'plugin-marketplace'), listing = await json(join(marketplace, '.agents', 'plugins', 'marketplace.json'));
  assert.equal(listing.name, MARKETPLACE_NAME); assert.equal(listing.plugins.length, 1);
  const plugin = listing.plugins[0];
  assert.equal(plugin.source.source, 'local'); assert.match(plugin.source.path, /^\.\/plugins\/[a-z0-9.-]+$/i);
  const directory = resolve(marketplace, plugin.source.path);
  assert.ok(inside(await realpath(marketplace), await realpath(directory)), 'marketplace 경로 범위');
  const manifest = await json(join(directory, 'plugin.json')); assert.equal(plugin.name, manifest.name);
  return await verifyPackaged(directory, root);
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  assert.ok(process.argv.slice(2).every((arg) => arg === '--packaged'), '지원하는 옵션은 --packaged입니다.');
  const checked = process.argv.includes('--packaged') ? await checkMarketplace() : await checkRepository();
  process.stdout.write(`${JSON.stringify({ status: 'passed', ...checked })}\n`);
}
