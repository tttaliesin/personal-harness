import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectAdvanced } from '../src/advanced.mjs';
import { analyzeProject } from '../src/project.mjs';

const IDS = ['TOOLS-01', 'DOTNET-01', 'GIT-01', 'GIT-02', 'IDE-01', 'AUX-01', 'STORE-01'];
const token = 'private-token-do-not-emit';
const ok = (stdout = '', executable = 'C:/trusted/tool.exe') => ({ state: 'succeeded', stdout, stderr: '', exitCode: 0, executable });
const denied = (state = 'not_run') => ({ state, stdout: '', stderr: '', exitCode: null, executable: null, reason: 'unsupported or permission denied' });

async function fixture(t, declarations = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'advanced-'));
  const root = join(directory, 'repo');
  await mkdir(root);
  for (const [name, content] of Object.entries(declarations)) { await mkdir(join(root, name, '..'), { recursive: true }); await writeFile(join(root, name), content); }
  t.after(() => rm(directory, { recursive: true, force: true }));
  const project = { root, files: Object.keys(declarations), requirements: Object.fromEntries(['node', 'python', 'go', 'rust', 'zig', 'dotnet'].map((language) => [language, { state: 'not_required', metadata: {}, versionRequests: [] }])), metadata: {} };
  const host = { context: { processArchitecture: 'x64' }, commands: {}, probes: {}, environment: {} };
  return { root, directory, project, host };
}
function requireLanguage(f, name) { f.project.requirements[name].state = 'required'; }
function runner(f, custom = () => undefined) {
  const calls = [];
  const query = async (tool, args, options) => {
    calls.push({ tool, args, options });
    const result = await custom(tool, args, options);
    if (result !== undefined) return { arguments: args, ...result };
    if (tool === 'git' && args[0] === '--version') return ok('git version 2.52.0.windows.1', 'C:/Git/cmd/git.exe');
    if (tool === 'git' && args[0] === 'rev-parse') return ok(f.root);
    if (tool === 'git' && args[0] === 'config') return ok('manager');
    if (tool === 'git' && args.includes('ls-files')) return ok('');
    return denied('not_found');
  };
  return { calls, query };
}
async function check(f, id, query) { return (await collectAdvanced({ projectPath: f.root, project: f.project, host: f.host, query })).checks.find((c) => c.checkId === id); }
function sdkRunner(f, sdks, selected, runtimes = 'Microsoft.NETCore.App 10.0.1 [C:/dotnet/shared/Microsoft.NETCore.App]') {
  return runner(f, (tool, args) => tool === 'dotnet' ? args[0] === '--list-sdks' ? ok(sdks.map((v) => `${v} [C:/dotnet/sdk]`).join('\n'), 'C:/dotnet/dotnet.exe') : args[0] === '--list-runtimes' ? ok(runtimes, 'C:/dotnet/dotnet.exe') : typeof selected === 'string' ? ok(selected, 'C:/dotnet/dotnet.exe') : selected ?? denied() : undefined);
}

test('stable report fields and outcome separation are preserved for all seven IDs', async (t) => {
  const f = await fixture(t), q = runner(f);
  const report = await collectAdvanced({ projectPath: f.root, project: f.project, host: f.host, query: q.query });
  assert.deepEqual(report.checks.map((c) => c.checkId), IDS);
  for (const c of report.checks) {
    for (const field of ['status', 'reason', 'message', 'applicability', 'resolution', 'execution', 'compatibility', 'support', 'recommendation', 'observed', 'nextAction']) assert.ok(Object.hasOwn(c, field), `${c.checkId}.${field}`);
    assert.equal(c.support.status, 'unknown');
    assert.equal(report.observations[c.checkId], c.observed);
  }
  assert.equal(report.checks.find((c) => c.checkId === 'GIT-01').status, 'pass');
  assert.equal(report.checks.find((c) => c.checkId === 'GIT-02').status, 'pass');
  assert.equal(report.checks.find((c) => c.checkId === 'TOOLS-01').status, 'skipped');
  assert.equal(report.checks.find((c) => c.checkId === 'STORE-01').status, 'skipped');
  assert.ok(q.calls.every(({ options }) => options.execute === false));
});

test('mise installed inventory and PATH selection pass with real user data roots retained', async (t) => {
  const f = await fixture(t, { 'mise.toml': '[tools]\nnode = "24.18.1"\ntask = "3.54.0"\n[tasks.check]\nrun = "never-execute-this-task"\n' });
  requireLanguage(f, 'node');
  f.host.environment = { MISE_DATA_DIR: 'D:/user/tools', MISE_INSTALLS_DIR: 'D:/user/installations', MISE_CACHE_DIR: 'D:/user/cache', MISE_NODE_VERSION: '24.18.1', RUSTUP_HOME: 'D:/user/rust', DOTNET_ROOT: 'D:/dotnet', GH_TOKEN: token, NODE_OPTIONS: '--require evil', DOTNET_STARTUP_HOOKS: 'evil.dll' };
  f.host.commands.node = [{ path: 'd:/USER/tools/installs/node/24.18.1/node.exe' }];
  const q = runner(f, (tool, args) => tool === 'mise' ? args[0] === '--version' ? ok('2026.9.4 windows-x64') : args[0] === 'ls' ? ok(JSON.stringify({ node: [{ version: '24.18.1', install_path: 'D:/user/tools/installs/node/24.18.1', source: token, active: true }] })) : ok('D:/user/tools/installs/node/24.18.1/node.exe') : undefined);
  const c = await check(f, 'TOOLS-01', q.query);
  assert.equal(c.status, 'pass');
  assert.equal(c.observed.selections[0].comparison, 'same');
  assert.equal(c.observed.installed[0].active, true);
  assert.equal(c.observed.activation, 'not_evaluated');
  for (const { tool, options } of q.calls.filter((c) => c.tool === 'mise')) {
    assert.equal(tool, 'mise');
    assert.equal(options.cwd, f.root);
    assert.equal(options.env.MISE_DATA_DIR, 'D:/user/tools');
    assert.equal(options.env.MISE_CACHE_DIR, 'D:/user/cache');
    assert.equal(options.env.MISE_INSTALLS_DIR, 'D:/user/installations');
    assert.equal(options.env.MISE_NODE_VERSION, '24.18.1');
    assert.equal(options.env.MISE_OFFLINE, '1');
    assert.equal(options.env.MISE_AUTO_INSTALL, '0');
    assert.equal(options.env.MISE_NO_HOOKS, '1');
    assert.equal(options.env.GH_TOKEN, undefined);
    assert.equal(options.env.NODE_OPTIONS, undefined);
    assert.equal(options.env.DOTNET_STARTUP_HOOKS, undefined);
  }
  assert.doesNotMatch(JSON.stringify(c), new RegExp(token));
});

test('mise compares actual PATH, warns on a different target, and does not guess shim activation', async (t) => {
  const f = await fixture(t, { 'mise.toml': '[tools]\nnode = "24"\n' }); requireLanguage(f, 'node');
  const q = runner(f, (tool, args) => tool === 'mise' ? args[0] === '--version' ? ok('mise 2026.11.0') : args[0] === 'ls' ? ok('{"node":[{"version":"24.18.1","install_path":"C:/mise/node/24"}]}') : ok('C:/mise/node/24/node.exe') : undefined);
  f.host.commands.node = [{ path: 'C:/other/node.exe' }];
  assert.equal((await check(f, 'TOOLS-01', q.query)).reason, 'path_selection_differs');
  f.host.commands.node = [{ path: 'C:/mise/shims/node.exe' }];
  assert.equal((await check(f, 'TOOLS-01', q.query)).status, 'unknown');
  f.host.probes.node = { state: 'not_run', executable: 'C:/mise/shims/node.exe' };
  assert.equal((await check(f, 'TOOLS-01', q.query)).status, 'unknown', 'metadata-only probe executable is not a verified shim target');
  f.host.probes.node = { state: 'succeeded', executable: 'C:/mise/node/24/node.exe' };
  assert.equal((await check(f, 'TOOLS-01', q.query)).status, 'pass');
});

test('mise dynamic config, external backends, and parent config never get evaluated', async (t) => {
  for (const content of ['[env]\nSECRET = "{{ exec(command=\'bad\') }}"', '[hooks]\nenter = "bad"', '[tools]\n"asdf:node" = "24"', '[tools]\nnode = { version = "24", postinstall = "bad" }', 'include = ["outside.toml"]']) {
    const f = await fixture(t, { 'mise.toml': content }); requireLanguage(f, 'node');
    const q = runner(f);
    const c = await check(f, 'TOOLS-01', q.query);
    assert.equal(c.status, 'unknown', content);
    assert.ok(c.observed.configuration.issues.length);
    assert.equal(q.calls.filter((c) => c.tool === 'mise').length, 0);
    assert.doesNotMatch(JSON.stringify(c), /exec\(command|postinstall|SECRET/);
  }
  const f = await fixture(t); requireLanguage(f, 'node');
  await writeFile(join(f.directory, 'mise.toml'), '[env]\nVALUE = "secret"');
  const q = runner(f);
  assert.equal((await check(f, 'TOOLS-01', q.query)).reason, 'unsafe_dynamic_config');
  assert.equal(q.calls.some((c) => c.tool === 'mise'), false);
});

test('mise explicitly absent installation is a failure, unsupported JSON is unknown', async (t) => {
  const f = await fixture(t, { '.tool-versions': 'node 24.18.1\n' }); requireLanguage(f, 'node');
  const q = runner(f, (tool, args) => tool === 'mise' ? args[0] === '--version' ? ok('mise 2026.11.0') : args[0] === 'ls' ? ok('{}') : { state: 'failed', exitCode: 1, stdout: '', stderr: 'node is not installed' } : undefined);
  assert.equal((await check(f, 'TOOLS-01', q.query)).reason, 'managed_tool_missing');
  const broken = runner(f, (tool, args) => tool === 'mise' ? args[0] === '--version' ? ok('mise 2026.11.0') : ok('{broken') : undefined);
  assert.equal((await check(f, 'TOOLS-01', broken.query)).status, 'unknown');
});

test('mise global fragments are inspected and comment lookalikes are not evaluated as templates', async (t) => {
  const f = await fixture(t, { 'mise.toml': '# {{ exec(command="bad") }}\n[tools]\nnode="24.18.1"\n' }); requireLanguage(f, 'node');
  const config = join(f.directory, 'config');
  await mkdir(join(config, 'conf.d'), { recursive: true });
  f.host.environment.MISE_CONFIG_DIR = config;
  f.host.commands.node = [{ path: 'C:/mise/node.exe' }];
  const q = runner(f, (tool, args) => tool === 'mise' ? args[0] === '--version' ? ok('mise 2026.11.0') : args[0] === 'ls' ? ok('{"node":[{"version":"24.18.1","install_path":"C:/mise"}]}') : ok('C:/mise/node.exe') : undefined);
  assert.equal((await check(f, 'TOOLS-01', q.query)).status, 'pass');
  await writeFile(join(config, 'conf.d', 'private.toml'), '[env]\nSECRET="{{ exec(command=\'bad\') }}"\n');
  q.calls.length = 0;
  const c = await check(f, 'TOOLS-01', q.query);
  assert.equal(c.reason, 'unsafe_dynamic_config');
  assert.equal(q.calls.some((c) => c.tool === 'mise'), false);
  assert.doesNotMatch(JSON.stringify(c), /SECRET|command=/);
});

test('.NET-only management preserves the official SDK exception without requiring mise', async (t) => {
  const f = await fixture(t); requireLanguage(f, 'dotnet');
  const q = sdkRunner(f, ['10.0.100'], '10.0.100');
  const c = await check(f, 'TOOLS-01', q.query);
  assert.equal(c.reason, 'official_sdk_installation_exception');
  assert.equal(c.applicability, 'not_required');
  assert.equal(q.calls.some((c) => c.tool === 'mise'), false);
});

test('unknown host language applicability is not turned into a missing-tool failure', async (t) => {
  const f = await fixture(t); f.project.requirements.dotnet.state = 'unknown';
  const q = sdkRunner(f, [], denied());
  for (const id of ['DOTNET-01', 'TOOLS-01']) {
    const c = await check(f, id, q.query);
    assert.equal(c.status, 'unknown'); assert.equal(c.applicability, 'unknown');
    assert.equal(c.compatibility, 'unknown');
  }
  assert.equal(q.calls.some((c) => c.tool === 'dotnet' && c.args[0] === '--version'), false);
});

test('.NET SDK and runtimes are separate and actual project selection satisfies rollForward', async (t) => {
  const f = await fixture(t, { 'global.json': '{"sdk":{"version":"10.0.100","rollForward":"latestFeature","allowPrerelease":false}}' }); requireLanguage(f, 'dotnet');
  f.host.environment.DOTNET_ROOT = 'D:/sdk';
  const q = sdkRunner(f, ['10.0.100', '10.0.203', '11.0.100-preview.1'], '10.0.203');
  const c = await check(f, 'DOTNET-01', q.query);
  assert.equal(c.status, 'pass');
  assert.equal(c.observed.selectedSdk, '10.0.203');
  assert.equal(c.observed.runtimes[0].version, '10.0.1');
  assert.equal(c.observed.roots.DOTNET_ROOT, 'D:/sdk');
  assert.equal(c.support.status, 'unknown');
  for (const call of q.calls.filter((c) => c.tool === 'dotnet')) {
    assert.equal(call.options.cwd, f.root);
    assert.equal(call.options.env.DOTNET_GENERATE_ASPNET_CERTIFICATE, '0');
    assert.equal(call.options.env.DOTNET_ADD_GLOBAL_TOOLS_TO_PATH, '0');
    assert.equal(call.options.env.DOTNET_SKIP_FIRST_TIME_EXPERIENCE, undefined);
  }
  assert.deepEqual(q.calls.filter((c) => c.tool === 'dotnet').map((c) => c.args), [['--list-sdks'], ['--list-runtimes'], ['--version']]);
});

test('.NET nearest ancestor global.json overrides higher declarations', async (t) => {
  const f = await fixture(t); requireLanguage(f, 'dotnet');
  await writeFile(join(f.directory, 'global.json'), '{"sdk":{"version":"8.0.100","rollForward":"disable"}}');
  const q = sdkRunner(f, ['8.0.100', '10.0.100'], '8.0.100');
  let c = await check(f, 'DOTNET-01', q.query);
  assert.equal(c.status, 'pass'); assert.equal(c.observed.globalJson.ancestor, true);
  await writeFile(join(f.root, 'global.json'), '{"sdk":{"version":"10.0.100","rollForward":"disable"}}');
  c = await check(f, 'DOTNET-01', q.query);
  assert.equal(c.reason, 'sdk_selection_mismatch');
  assert.equal(c.observed.globalJson.ancestor, false);
});

test('.NET feature band rollForward rules choose exact or next band accurately', async (t) => {
  const f = await fixture(t); requireLanguage(f, 'dotnet');
  for (const [policy, expected] of [['disable', '8.0.100'], ['patch', '8.0.100'], ['latestPatch', '8.0.105'], ['feature', '8.0.105'], ['latestFeature', '8.0.302'], ['minor', '8.0.105'], ['latestMinor', '8.1.101'], ['major', '8.0.105'], ['latestMajor', '9.0.101']]) {
    await writeFile(join(f.root, 'global.json'), JSON.stringify({ sdk: { version: '8.0.100', rollForward: policy } }));
    const q = sdkRunner(f, ['8.0.100', '8.0.105', '8.0.302', '8.1.101', '9.0.101'], expected);
    const c = await check(f, 'DOTNET-01', q.query);
    assert.equal(c.status, 'pass', policy); assert.equal(c.observed.candidateSdk, expected, policy);
  }
  await writeFile(join(f.root, 'global.json'), '{"sdk":{"version":"8.0.200","rollForward":"feature"}}');
  assert.equal((await check(f, 'DOTNET-01', sdkRunner(f, ['8.0.105', '8.0.302', '8.0.405'], '8.0.302').query)).status, 'pass');
});

test('.NET runtime-only installations fail SDK requirements and selection denial stays unknown', async (t) => {
  const f = await fixture(t); requireLanguage(f, 'dotnet');
  let c = await check(f, 'DOTNET-01', sdkRunner(f, [], denied()).query);
  assert.equal(c.status, 'fail'); assert.equal(c.reason, 'sdk_absent'); assert.ok(c.observed.runtimes.length);
  c = await check(f, 'DOTNET-01', sdkRunner(f, ['10.0.100'], denied()).query);
  assert.equal(c.status, 'unknown'); assert.equal(c.observed.selectedSdk, null); assert.equal(c.observed.candidateSdk, '10.0.100');
  f.host.capabilities = { dotnetSdkSelection: false };
  const q = sdkRunner(f, ['10.0.100'], '10.0.100');
  await check(f, 'DOTNET-01', q.query);
  assert.equal(q.calls.some((c) => c.tool === 'dotnet' && c.args[0] === '--version'), false);
});

test('.NET unsafe sdk.paths and malformed nearest declarations prevent SDK code execution', async (t) => {
  const f = await fixture(t, { 'global.json': '{"sdk":{"version":"10.0.100","paths":["./untrusted-sdk","$host$"]}}' });
  f.project = await analyzeProject(f.root);
  let q = sdkRunner(f, ['10.0.100'], '10.0.100');
  assert.equal((await check(f, 'DOTNET-01', q.query)).reason, 'sdk_paths_require_verified_selection');
  assert.equal(q.calls.some((c) => c.tool === 'dotnet' && c.args[0] === '--version'), false);
  q = sdkRunner(f, [], '10.0.100');
  assert.equal((await check(f, 'DOTNET-01', q.query)).reason, 'sdk_paths_require_verified_selection', 'native inventory excludes custom SDK search paths');
  await writeFile(join(f.root, 'global.json'), '{"sdk":{"version":"10.0.100","paths":[]}}');
  q = sdkRunner(f, ['10.0.100'], '10.0.100');
  assert.equal((await check(f, 'DOTNET-01', q.query)).reason, 'sdk_paths_require_verified_selection');
  assert.ok(!q.calls.some((call) => call.tool === 'dotnet' && call.args[0] === '--version'));
  await writeFile(join(f.root, 'global.json'), '{broken');
  q = sdkRunner(f, ['10.0.100'], '10.0.100');
  assert.equal((await check(f, 'DOTNET-01', q.query)).status, 'unknown');
  assert.equal(q.calls.some((c) => c.tool === 'dotnet' && c.args[0] === '--version'), false);
});

test('.NET SDK selection checks ancestors outside the static project boundary before running an SDK', async (t) => {
  const f = await fixture(t, { 'App.csproj': '<Project/>' });
  await mkdir(join(f.root, '.git'));
  await writeFile(join(f.directory, 'global.json'), '{"sdk":{"paths":["./unverified-sdk","$host$"]}}');
  f.project = await analyzeProject(f.root);
  assert.equal(f.project.metadata.scope.boundaryKind, 'repository');
  assert.deepEqual(f.project.files, ['App.csproj']);

  const q = sdkRunner(f, ['10.0.100'], '10.0.100');
  const c = await check(f, 'DOTNET-01', q.query);
  assert.equal(c.observed.globalJson.ancestor, true);
  assert.equal(c.reason, 'sdk_paths_require_verified_selection');
  assert.ok(!q.calls.some((call) => call.tool === 'dotnet' && call.args[0] === '--version'));
});

test('.NET static analysis and SDK selection reject the same invalid global.json declarations', async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.directory, 'global.json'), '{"sdk":{"version":"10.0.100"}}');
  const cases = [
    ['escaped duplicate key', '{"sdk":{"version":"10.0.100", /* duplicate */ "\\u0076ersion":"10.0.200"}}'],
    ['trailing comma', '{"sdk":{"version":"10.0.100", /* invalid */ }}'],
    ['unterminated comment', '{"sdk":{"version":"10.0.100"}} /*'],
    ['invalid SDK version', '{"sdk":{"version":"10.0.0100"}}'],
    ['invalid UTF-8 in a comment', Buffer.concat([Buffer.from('/*'), Buffer.from([0xff]), Buffer.from('*/ {"sdk":{"version":"10.0.100"}}')]), 'unreadable'],
    ['invalid SDK path', JSON.stringify({ sdk: { version: '10.0.100', paths: [`https://example.invalid/${token}`] } })],
  ];
  for (const [name, contents, state = 'unsupported_json_or_sdk_options'] of cases) {
    await writeFile(join(f.root, 'global.json'), contents);
    f.project = await analyzeProject(f.root);
    const q = sdkRunner(f, ['10.0.100', '10.0.200'], '10.0.100');
    const c = await check(f, 'DOTNET-01', q.query);
    assert.equal(f.project.requirements.dotnet.state, 'unknown', name);
    assert.deepEqual(f.project.requirements.dotnet.versionRequests, [], name);
    assert.equal(c.status, 'unknown', name);
    assert.equal(c.observed.globalJson.state, state, name);
    assert.equal(c.observed.globalJson.ancestor, false, name);
    assert.ok(!q.calls.some((call) => call.tool === 'dotnet' && call.args[0] === '--version'), name);
    assert.ok(!JSON.stringify([f.project, c]).includes(token), name);
  }
});

test('.NET comments, target frameworks and sanitized SDK metadata retain independent meanings', async (t) => {
  const f = await fixture(t, { 'global.json': '{\n// comment\n"sdk":{"version":"10.0.100", /* band */ "rollForward":"latestPatch"}, "errorMessage":"https://example.invalid/private-token-do-not-emit"\n}' });
  f.project = await analyzeProject(f.root);
  const requirement = f.project.requirements.dotnet;
  assert.equal(requirement.state, 'required');
  assert.deepEqual(requirement.versionRequests, [{ source: 'global.json', field: 'sdk.version', kind: 'sdk', value: '10.0.100' }]);
  f.project.requirements.dotnet.metadata.targetFrameworks = ['net8.0', 'net48'];
  const q = sdkRunner(f, ['10.0.100', '10.0.105'], '10.0.105');
  let c = await check(f, 'DOTNET-01', q.query);
  assert.equal(c.status, 'pass');
  assert.equal(c.observed.selectedSdk, '10.0.105');
  assert.deepEqual(c.observed.globalJson.sdk, requirement.metadata.sdk);
  assert.ok(q.calls.some((call) => call.tool === 'dotnet' && call.args[0] === '--version'));
  assert.deepEqual(c.observed.targetFrameworks, ['net8.0', 'net48']);
  assert.ok(!JSON.stringify([f.project, c]).includes(token));
  const metadata = await fixture(t); requireLanguage(metadata, 'dotnet');
  metadata.project.requirements.dotnet.metadata.sdk = { version: '10.0.100', rollForward: 'disable', customSecret: token };
  c = await check(metadata, 'DOTNET-01', sdkRunner(metadata, ['10.0.100'], '10.0.100').query);
  assert.equal(c.status, 'pass'); assert.doesNotMatch(JSON.stringify(c), new RegExp(token));
});

test('Git helper names are whitelisted and scripts, arguments, stderr and tokens never leak', async (t) => {
  const f = await fixture(t);
  const q = runner(f, (tool, args) => tool === 'git' && args[0] === 'config' ? ok(`manager\ncache --timeout=600 --secret=${token}\n!echo ${token}\nC:/Git/git-credential-wincred.exe\nunknown ${token}`) : undefined);
  const c = await check(f, 'GIT-01', q.query);
  assert.equal(c.status, 'pass');
  assert.deepEqual(c.observed.credentialHelpers, ['manager', 'cache', 'custom_redacted', 'wincred']);
  assert.equal(c.observed.authentication.state, 'not_run');
  assert.doesNotMatch(JSON.stringify(c), /private-token|--timeout|echo|unknown /);
  assert.equal(q.calls.some((c) => c.args.some((a) => /push|fetch|credential fill/.test(a))), false);
});

test('Git no helper and missing repository differ from permissions or unsupported queries', async (t) => {
  const f = await fixture(t);
  const noHelper = runner(f, (tool, args) => tool === 'git' && args[0] === 'config' ? { state: 'failed', exitCode: 1, stdout: '', stderr: '' } : undefined);
  assert.equal((await check(f, 'GIT-01', noHelper.query)).status, 'pass');
  for (const [stderr, expected] of [['fatal: not a git repository', 'fail'], [`access denied ${token}`, 'unknown']]) {
    const q = runner(f, (tool, args) => tool === 'git' && args[0] === 'rev-parse' ? { state: 'failed', exitCode: 128, stdout: '', stderr } : undefined);
    const c = await check(f, 'GIT-01', q.query);
    assert.equal(c.status, expected); assert.doesNotMatch(JSON.stringify(c), new RegExp(token));
  }
});

test('Git empty helper values reset inherited names without evaluating custom helpers', async (t) => {
  const f = await fixture(t);
  const q = runner(f, (tool, args) => tool === 'git' && args[0] === 'config' ? ok(`store\n\nmanager\n!echo ${token}\n`) : undefined);
  const c = await check(f, 'GIT-01', q.query);
  assert.deepEqual(c.observed.credentialHelpers, ['manager', 'custom_redacted']);
  assert.doesNotMatch(JSON.stringify(c), new RegExp(token));
});

test('Git attributes and EditorConfig drive read-only line ending evaluation', async (t) => {
  const f = await fixture(t, { '.gitattributes': '* text=auto eol=lf\n*.sln text eol=crlf\n', '.editorconfig': 'root = true\n[*]\nend_of_line = lf\ncharset = utf-8\n[*.sln]\nend_of_line = crlf\n', 'main.cs': 'class A {}\n', 'demo.sln': 'solution\r\n' });
  const before = await Promise.all(f.project.files.map((name) => readFile(join(f.root, name), 'utf8')));
  const q = runner(f, (tool, args) => tool === 'git' && args.includes('ls-files') ? ok('i/lf    w/lf    attr/text=auto eol=lf\tmain.cs\0i/lf    w/crlf  attr/text eol=crlf\tdemo.sln\0') : undefined);
  const c = await check(f, 'GIT-02', q.query);
  assert.equal(c.status, 'pass'); assert.equal(c.observed.trackedFiles, 2);
  assert.equal(c.observed.encodingVerification, 'not_run');
  assert.deepEqual(await Promise.all(f.project.files.map((name) => readFile(join(f.root, name), 'utf8'))), before);
  assert.deepEqual((await readdir(f.root)).sort(), [...f.project.files].sort());
  assert.ok(q.calls.find((c) => c.args.includes('ls-files')).args.includes('core.fsmonitor=false'));
});

test('Git policy violations, conflicting declarations and binary exclusions remain distinct', async (t) => {
  const f = await fixture(t, { '.editorconfig': 'root = true\n[*]\nend_of_line = crlf\n' });
  const run = async (output) => check(f, 'GIT-02', runner(f, (tool, args) => tool === 'git' && args.includes('ls-files') ? ok(output) : undefined).query);
  let c = await run('i/lf    w/lf    attr/text eol=lf\tx.cs\0');
  assert.equal(c.status, 'warn'); assert.equal(c.reason, 'conflicting_line_ending_policy');
  c = await run('i/lf    w/mixed attr/text eol=lf\tx.cs\0');
  assert.equal(c.status, 'fail'); assert.equal(c.compatibility, 'violated');
  c = await run('i/-text w/-text attr/-text\tx.bin\0');
  assert.equal(c.status, 'pass');
  c = await run('i/crlf  w/crlf attr/text eol=crlf\tx.sln\0');
  assert.equal(c.status, 'fail', 'text index should be normalized even for CRLF worktree policy');
});

test('nested EditorConfig, braces, unset and ancestor root scoping are honored', async (t) => {
  const f = await fixture(t, { '.editorconfig': 'root=true\n[*]\nend_of_line=lf\n', 'src/.editorconfig': '[*.{cs,csx}]\nend_of_line=crlf\n', 'src/code.cs': 'x\r\n' });
  await writeFile(join(f.directory, '.editorconfig'), '[*]\nend_of_line=cr\n');
  const q = runner(f, (tool, args) => tool === 'git' && args.includes('ls-files') ? ok('i/lf w/crlf attr/\tsrc/code.cs\0') : undefined);
  assert.equal((await check(f, 'GIT-02', q.query)).status, 'pass');
  await writeFile(join(f.root, 'src/.editorconfig'), '[*.{cs,csx}]\nend_of_line=unset\n');
  assert.equal((await check(f, 'GIT-02', q.query)).status, 'pass');
});

test('unsupported eol output and EditorConfig glob syntax stay specifically unknown', async (t) => {
  const f = await fixture(t, { '.editorconfig': 'root=true\n[file[0-9].cs]\nend_of_line=lf\n' });
  let q = runner(f, (tool, args) => tool === 'git' && args.includes('ls-files') ? ok('i/lf w/lf attr/\tfile1.cs\0') : undefined);
  assert.equal((await check(f, 'GIT-02', q.query)).reason, 'policy_not_fully_supported');
  q = runner(f, (tool, args) => tool === 'git' && args.includes('ls-files') ? ok('unexpected output') : undefined);
  assert.equal((await check(f, 'GIT-02', q.query)).reason, 'unsupported_eol_output');
});

test('VSCode install metadata works without code on PATH and never starts the editor', async (t) => {
  const f = await fixture(t), install = join(f.directory, 'VS Code');
  await mkdir(join(install, 'resources/app'), { recursive: true });
  await writeFile(join(install, 'resources/app/package.json'), '{"version":"1.106.0","secret":"private-token-do-not-emit"}');
  f.host.ide = { vscodeRoots: [install] }; f.project.metadata.ide = { required: true };
  const q = runner(f), c = await check(f, 'IDE-01', q.query);
  assert.equal(c.status, 'pass'); assert.equal(c.resolution, 'not_resolved');
  assert.equal(c.observed.vscode[0].version, '1.106.0');
  assert.equal(q.calls.some((c) => c.tool === 'code'), false);
  assert.doesNotMatch(JSON.stringify(c), new RegExp(token));
});

test('a code wrapper on PATH without readable installation metadata is not an editor pass', async (t) => {
  const f = await fixture(t);
  f.host.commands.code = [{ path: join(f.directory, 'missing-code/bin/code.cmd'), commandType: 'Application' }];
  const q = runner(f), c = await check(f, 'IDE-01', q.query);
  assert.equal(c.status, 'unknown'); assert.equal(c.reason, 'editor_installation_unverified');
  assert.equal(c.resolution, 'resolved'); assert.equal(c.execution, 'not_run');
  assert.equal(q.calls.some((c) => c.tool === 'code'), false);
});

test('vswhere MSVC and Windows SDK file discovery passes without Developer Shell on PATH', async (t) => {
  const f = await fixture(t), install = join(f.directory, 'VS'), sdk = join(f.directory, 'SDK');
  for (const file of [join(install, 'VC/Tools/MSVC/14.44.35207/bin/Hostx64/x64/cl.exe'), join(sdk, 'Include/10.0.26100.0/um/Windows.h'), join(sdk, 'Lib/10.0.26100.0/um/x64/kernel32.lib')]) { await mkdir(join(file, '..'), { recursive: true }); await writeFile(file, 'fixture only'); }
  f.host.ide = { windowsSdkRoots: [sdk] }; f.project.metadata.nativeBuild = { msvc: true, windowsSdk: true };
  const q = runner(f, (tool) => tool === 'vswhere' ? ok(JSON.stringify([{ installationPath: install, isComplete: true, properties: { secret: token } }])) : undefined);
  const c = await check(f, 'IDE-01', q.query);
  assert.equal(c.status, 'pass'); assert.equal(c.observed.msvc.length, 1); assert.equal(c.observed.windowsSdks.length, 1);
  assert.equal(c.observed.developerShellRequired, true);
  assert.equal(q.calls.some((c) => ['cl', 'vcvarsall', 'VsDevCmd'].includes(c.tool)), false);
  assert.doesNotMatch(JSON.stringify(c), new RegExp(token));
});

test('native discovery absence and explicit negative component inventory differ', async (t) => {
  const f = await fixture(t); f.project.metadata.nativeBuild = { msvc: true };
  assert.equal((await check(f, 'IDE-01', runner(f).query)).status, 'unknown');
  f.host.ide = { windowsSdkRoots: [join(f.directory, 'empty-sdk')] };
  const q = runner(f, (tool) => tool === 'vswhere' ? ok('[]') : undefined);
  assert.equal((await check(f, 'IDE-01', q.query)).status, 'fail');
  delete f.host.ide;
  assert.equal((await check(f, 'IDE-01', q.query)).status, 'fail', 'known missing MSVC survives unknown SDK discovery');
  f.host.context.processArchitecture = 'arm64';
  assert.equal((await check(f, 'IDE-01', q.query)).reason, 'unsupported_native_architecture');
});

test('auxiliary local success does not assert authentication and explicit auth never copies output', async (t) => {
  const f = await fixture(t); f.project.metadata.auxiliary = { search: true, github: true };
  f.host.commands.rg = [{ path: 'C:/rg/rg.exe' }]; f.host.commands.gh = [{ path: 'C:/gh/gh.exe' }];
  const q = runner(f, (tool, args) => tool === 'rg' ? ok('ripgrep 14.1.1\nfeatures:+pcre2', 'C:/rg/rg.exe') : tool === 'gh' ? ok(args[0] === 'auth' ? `Logged in token ${token}` : 'gh version 2.83.0 (2026-11-01)', 'C:/gh/gh.exe') : undefined);
  let c = await check(f, 'AUX-01', q.query);
  assert.equal(c.status, 'pass'); assert.equal(c.observed.authentication.state, 'not_run');
  assert.equal(q.calls.some((c) => c.args[0] === 'auth'), false);
  f.project.metadata.auxiliary.authentication = true;
  c = await check(f, 'AUX-01', q.query);
  assert.equal(c.observed.authentication.state, 'authenticated');
  assert.doesNotMatch(JSON.stringify(c), new RegExp(token));
  assert.deepEqual(q.calls.find((c) => c.args[0] === 'auth').args, ['auth', 'status', '--active', '--hostname', 'github.com']);
});

test('auxiliary absence, wrapper refusal and auth metadata preserve separate outcomes', async (t) => {
  const f = await fixture(t); f.project.metadata.auxiliary = { search: true };
  assert.equal((await check(f, 'AUX-01', runner(f).query)).status, 'fail');
  const q = runner(f, (tool) => tool === 'rg' ? denied() : undefined);
  assert.equal((await check(f, 'AUX-01', q.query)).status, 'unknown');
  f.host.authentication = { github: { state: 'authenticated', token } };
  const local = runner(f, (tool) => tool === 'rg' ? ok('ripgrep 14.1.1', 'C:/rg/rg.exe') : undefined);
  const c = await check(f, 'AUX-01', local.query);
  assert.equal(c.observed.authentication.source, 'metadata');
  assert.equal(c.observed.authentication.remoteVerification, 'not_run');
  assert.doesNotMatch(JSON.stringify(c), new RegExp(token));
});

test('auxiliary version queries record the actual resolved binary and diagnose differing PATH evidence', async (t) => {
  const f = await fixture(t); f.project.metadata.auxiliary = { search: true };
  f.host.commands.rg = [{ path: 'C:/old/rg.exe' }];
  const q = runner(f, (tool) => tool === 'rg' ? ok(Buffer.from('ripgrep 14.1.1\n'), 'C:/new/rg.exe') : undefined);
  const c = await check(f, 'AUX-01', q.query);
  assert.equal(c.status, 'warn'); assert.equal(c.reason, 'auxiliary_path_differs');
  assert.equal(c.execution, 'succeeded'); assert.equal(c.compatibility, 'unknown');
  assert.equal(c.observed.tools.rg.executable, 'C:/new/rg.exe');
});

test('storage queries only the requested volume and separates ReFS from Dev Drive', async (t) => {
  const f = await fixture(t); f.project.metadata.storage = { requested: true, path: 'D:/work/repo' };
  const q = runner(f, (tool) => tool === 'pwsh' ? ok('{"fileSystem":"ReFS","volumePath":"D:","size":1000,"sizeRemaining":500}') : tool === 'fsutil' ? ok('This is a trusted developer volume.\nFilters: private-token-do-not-emit') : undefined);
  let c = await check(f, 'STORE-01', q.query);
  assert.equal(c.status, 'pass'); assert.equal(c.observed.devDrive, true); assert.equal(c.observed.trusted, true);
  assert.deepEqual(q.calls.find((c) => c.tool === 'fsutil').args, ['devdrv', 'query', 'D:']);
  const powershell = q.calls.find((c) => c.tool === 'pwsh');
  assert.equal(powershell.args.at(-1), 'D:/work/repo');
  assert.equal(powershell.args.includes('-NoProfile'), true);
  assert.doesNotMatch(JSON.stringify(c), new RegExp(token));
  const negative = runner(f, (tool) => tool === 'pwsh' ? ok('{"fileSystem":"ReFS","volumePath":"D:"}') : tool === 'fsutil' ? ok('This is not a developer volume.') : undefined);
  c = await check(f, 'STORE-01', negative.query);
  assert.equal(c.status, 'warn'); assert.equal(c.compatibility, 'satisfied'); assert.equal(c.observed.devDrive, false);
});

test('storage permissions, unsupported/localized output and UNC are unknown without false Dev Drive pass', async (t) => {
  const f = await fixture(t); f.project.metadata.storage = { requested: true, path: 'D:/repo' };
  for (const output of [denied('failed'), ok('unsupported localized query text')]) {
    const q = runner(f, (tool) => tool === 'pwsh' ? ok('{"fileSystem":"ReFS","volumePath":"D:"}') : tool === 'fsutil' ? output : undefined);
    assert.equal((await check(f, 'STORE-01', q.query)).status, 'unknown');
  }
  f.project.metadata.storage.path = '\\\\server\\share\\repo';
  const q = runner(f);
  assert.equal((await check(f, 'STORE-01', q.query)).reason, 'storage_path_unsupported');
  assert.equal(q.calls.some((c) => ['pwsh', 'fsutil'].includes(c.tool)), false);
});

test('UTF-16 native output and a mounted-volume GUID stay confined to the requested volume', async (t) => {
  const f = await fixture(t); f.project.metadata.storage = { requested: true, path: 'D:/mount/repo' };
  const volumePath = '\\\\?\\Volume{e056000d-1234-1234-1234-000000000000}\\';
  const q = runner(f, (tool) => tool === 'pwsh' ? ok(Buffer.from(JSON.stringify({ fileSystem: 'ReFS', volumePath }), 'utf8')) : tool === 'fsutil' ? ok(Buffer.from('\uFEFFThis is a trusted developer volume.\r\n', 'utf16le')) : tool === 'git' ? undefined : denied());
  const c = await check(f, 'STORE-01', q.query);
  assert.equal(c.status, 'pass');
  assert.deepEqual(q.calls.find((c) => c.tool === 'fsutil').args, ['devdrv', 'query', volumePath]);
});

test('query exceptions, bounded hangs and missing injection never start a fallback program', async (t) => {
  const f = await fixture(t); f.project.metadata.auxiliary = { search: true };
  let c = await check(f, 'AUX-01', async () => { throw new Error(token); });
  assert.equal(c.status, 'unknown'); assert.doesNotMatch(JSON.stringify(c), new RegExp(token));
  const report = await collectAdvanced({ projectPath: f.root, project: f.project, host: f.host, timeoutMs: 10, query: async () => new Promise(() => {}) });
  assert.equal(report.checks.find((c) => c.checkId === 'GIT-01').execution, 'timed_out');
  c = await check(f, 'AUX-01'); assert.equal(c.status, 'unknown');
  await assert.rejects(collectAdvanced({ projectPath: f.root, timeoutMs: 0 }), TypeError);
});

test('static query policy contains no service starts, arbitrary code evaluation or environment mutation', async () => {
  const source = await readFile(new URL('../src/advanced.mjs', import.meta.url), 'utf8');
  const ps = await readFile(new URL('../scripts/collect-advanced.ps1', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"]node:child_process|execSync\(|spawn\(|eval\(|new Function\(|process\.env\.[A-Z_]+\s*=/);
  assert.doesNotMatch(source, /ask\([^\n]*['"](?:activate|install|trust|setFiltersAllowed|fill|--show-token|--auth-token)['"]/);
  assert.doesNotMatch(ps, /Invoke-Expression|Start-Process|Start-Service|New-Volume|Format-Volume|Set-Volume|Set-Location|Out-File|Set-Content/);
  assert.match(ps, /Get-Volume -FilePath \$TargetPath/);
  assert.match(ps, /PSModuleAutoLoadingPreference = 'None'/);
});
