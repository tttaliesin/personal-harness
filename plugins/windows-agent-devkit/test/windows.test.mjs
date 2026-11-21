import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
  INVENTORY_NAMES, assessExecutable, createChildEnvironment, createWindowsInspector,
  decodeOutput, parseVersionOutput, resolvePowerShell, runBounded, verifyExecutable,
} from '../src/windows.mjs';

const PROJECT = String.raw`C:\project [literal]; $(not-a-command)`;
const SHELL = String.raw`C:\Shell\pwsh.exe`;
const ENVIRONMENT = {
  Path: String.raw`C:\Tools;C:\Shell`, PATHEXT: '.COM;.EXE;.BAT;.CMD;.PS1',
  SystemRoot: String.raw`C:\Windows`,
};
const FACTS = {
  isFile: true, isPE: true, isSymbolicLink: false, rustToolchainVerified: true,
};

function candidate(name, path = `C:\\Tools\\${name}.exe`, commandType = 'Application') {
  return { name: `${name}.exe`, commandType, path, fileVersion: '1.2.3', productVersion: '1.2.3' };
}

function inventory() {
  return {
    context: {
      platform: 'win32',
      os: { name: 'Microsoft Windows 11 Pro', version: '10.0.26100', build: '26100', architecture: '64-bit' },
      processArchitecture: 'x64', cwd: PROJECT,
      diagnosticShell: { name: 'pwsh', path: SHELL, version: '7.6.0', profileApplied: false },
    },
    commands: Object.fromEntries(INVENTORY_NAMES.map((name) => [name, [candidate(name)]])),
  };
}

function harness({ host = inventory(), environment = ENVIRONMENT, reply, hostResult } = {}) {
  const calls = [];
  const inspect = createWindowsInspector({
    platform: 'win32', environment,
    resolveShell: async () => SHELL,
    verify: async (name, value, options) => {
      const reason = assessExecutable(name, value, { ...FACTS, realPath: value.path }, options);
      return { executable: reason ? null : value.path, reason };
    },
    run: async (executable, args, options) => {
      calls.push({ executable, args, options });
      if (args.includes('-File')) {
        return hostResult ?? { state: 'succeeded', exitCode: 0, stdout: Buffer.from(JSON.stringify(host)), reason: null };
      }
      return reply?.(executable, args, options)
        ?? { state: 'succeeded', exitCode: 0, stdout: 'unrecognized output', reason: null };
    },
  });
  return { inspect, calls };
}

test('default collection keeps the exact contract and literal project argument without launching tools', async () => {
  const host = inventory();
  host.context.environment = { SECRET: 'never-return-this' };
  host.commands.node[0].definition = 'never-return-this';
  const { inspect, calls } = harness({ host });
  const result = await inspect({ projectPath: PROJECT });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].executable, SHELL);
  const args = calls[0].args;
  assert.deepEqual(args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-File']);
  assert.match(args[3], /[\\/]scripts[\\/]collect-host\.ps1$/);
  assert.deepEqual(args.slice(4), ['-ProjectPath', PROJECT]);
  assert.equal(calls[0].options.cwd, PROJECT);
  assert.equal(calls[0].options.timeoutMs, 5000);
  assert.deepEqual(Object.keys(result), ['context', 'commands', 'probes']);
  assert.deepEqual(Object.keys(result.context), ['platform', 'os', 'processArchitecture', 'cwd', 'diagnosticShell']);
  assert.equal(result.context.diagnosticShell.profileApplied, false);
  assert.deepEqual(Object.keys(result.commands), [...INVENTORY_NAMES]);
  assert.equal(INVENTORY_NAMES.length, 39);
  for (const name of INVENTORY_NAMES) {
    assert.deepEqual(Object.keys(result.commands[name][0]), ['name', 'commandType', 'path', 'fileVersion', 'productVersion']);
    assert.deepEqual(Object.keys(result.probes[name]), ['state', 'executable', 'arguments', 'exitCode', 'version', 'data', 'reason']);
    assert.equal(result.probes[name].state, 'not_run');
    assert.match(result.probes[name].reason, /[가-힣]/);
  }
  assert.ok(!JSON.stringify(result).includes('never-return-this'));
});

test('PATHEXT is preserved for bare-name inventory while runtime hooks and credentials are absent', () => {
  const parent = {
    ...ENVIRONMENT, NODE_OPTIONS: '--require unsafe.cjs', NODE_PATH: 'unsafe',
    PYTHONPATH: 'unsafe', PYTHONSTARTUP: 'unsafe.py', GIT_CONFIG_COUNT: '1',
    DOTNET_STARTUP_HOOKS: 'unsafe.dll', COREHOST_TRACEFILE: 'trace.txt',
    RUSTC_WRAPPER: 'unsafe', RIPGREP_CONFIG_PATH: 'unsafe', PSModulePath: 'unsafe',
    DOCKER_HOST: 'tcp://example.invalid', GH_TOKEN: 'never-return-this',
    HTTP_PROXY: 'https://secret@example.invalid', GOTOOLCHAIN: 'auto',
  };
  const snapshot = { ...parent };
  const child = createChildEnvironment(parent);
  assert.equal(child.PATHEXT, parent.PATHEXT);
  assert.equal(child.PATH, parent.Path);
  assert.equal(child.SystemRoot, parent.SystemRoot);
  assert.equal(child.GOTOOLCHAIN, 'local');
  assert.equal(child.GOENV, 'off');
  assert.equal(child.DOTNET_CLI_TELEMETRY_OPTOUT, '1');
  assert.equal(child.DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE, 'true');
  for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'PYTHONPATH', 'PYTHONSTARTUP',
    'GIT_CONFIG_COUNT', 'DOTNET_STARTUP_HOOKS', 'COREHOST_TRACEFILE', 'RUSTC_WRAPPER',
    'RIPGREP_CONFIG_PATH', 'PSModulePath', 'DOCKER_HOST', 'GH_TOKEN', 'HTTP_PROXY']) {
    assert.equal(child[key], undefined, key);
  }
  assert.deepEqual(parent, snapshot);
  const mixedCase = createChildEnvironment({ Path: 'a', pAtHeXt: '.EXE' });
  assert.equal(mixedCase.PATHEXT, '.EXE');
  assert.equal(Object.keys(mixedCase).filter((key) => key.toUpperCase() === 'PATHEXT').length, 1);
});

test('only explicit git/node/python queries run and Python disables bytecode, site and environment hooks', async () => {
  const python = {
    version: '3.13.1', executable: String.raw`C:\Tools\python.exe`,
    prefix: String.raw`C:\Python`, basePrefix: String.raw`C:\Python`, ignored: 'never-return-this',
  };
  const { inspect, calls } = harness({ reply: (executable) => ({
    state: 'succeeded', exitCode: 0, reason: null,
    stdout: executable.endsWith('git.exe') ? 'git version 2.49.0.windows.1\n'
      : executable.endsWith('node.exe') ? 'v24.10.0\n' : JSON.stringify(python),
  }) });
  const result = await inspect({ projectPath: PROJECT, tools: ['git', 'node', 'python', 'git'] });
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.slice(1, 3).map((call) => call.args), [['--version'], ['--version']]);
  assert.deepEqual(calls[3].args.slice(0, 4), ['-B', '-I', '-S', '-c']);
  assert.match(calls[3].args[4], /^import json,sys; print\(json\.dumps\(/);
  assert.ok(!calls[3].args[4].includes(PROJECT));
  assert.equal(result.probes.git.version, '2.49.0.windows.1');
  assert.equal(result.probes.node.version, '24.10.0');
  assert.equal(result.probes.python.version, '3.13.1');
  assert.equal(result.probes.python.data.executable, python.executable);
  assert.ok(!JSON.stringify(result).includes('never-return-this'));
  assert.equal(result.probes.docker.state, 'not_run');
});

test('managers, package wrappers, Go and TUIs stay metadata-only even when requested', async () => {
  const tools = ['pwsh', 'powershell', 'winget', 'mise', 'npm', 'pnpm', 'yarn', 'py',
    'uv', 'go', 'rustup', 'lazydocker', 'process-compose', 'code', 'nu',
    'fnm', 'nvm', 'pyenv', 'conda', 'choco', 'scoop'];
  const { inspect, calls } = harness();
  const result = await inspect({ projectPath: PROJECT, tools });
  assert.equal(calls.length, 1);
  for (const tool of tools) {
    assert.equal(result.probes[tool].state, 'not_run', tool);
    assert.equal(result.probes[tool].version, null, tool);
    assert.deepEqual(result.probes[tool].arguments, []);
    assert.match(result.probes[tool].reason, /[가-힣]/);
  }
  assert.match(result.probes.go.reason, /telemetry/);
});

test('missing requested commands are distinct from unrequested commands', async () => {
  const host = inventory();
  host.commands.git = [];
  host.commands.node = [];
  const { inspect, calls } = harness({ host });
  const result = await inspect({ projectPath: PROJECT, tools: ['git'] });
  assert.equal(result.probes.git.state, 'not_found');
  assert.equal(result.probes.node.state, 'not_run');
  assert.equal(calls.length, 1);
});

test('first wrapper shadows later native candidates without executing either', async () => {
  for (const extension of ['cmd', 'bat', 'ps1']) {
    const host = inventory();
    host.commands.node = [candidate('node', `C:\\Tools\\node.${extension}`), candidate('node')];
    const { inspect, calls } = harness({ host });
    const result = await inspect({ projectPath: PROJECT, tools: ['node'] });
    assert.equal(result.probes.node.state, 'not_run', extension);
    assert.equal(result.commands.node.length, 2);
    assert.equal(calls.length, 1);
  }
});

test('shim paths, WindowsApps aliases, non-applications and unverified Rust proxies are skipped', () => {
  const blocked = [
    candidate('node', String.raw`C:\scoop\shims\node.exe`),
    candidate('node', String.raw`C:\mise\shims\node.exe`),
    candidate('node', String.raw`C:\ProgramData\chocolatey\bin\node.exe`),
    candidate('node', String.raw`C:\Users\someone\AppData\Local\Microsoft\WindowsApps\node.exe`),
    candidate('node', String.raw`C:\Tools\node.exe`, 'Alias'),
    candidate('node', String.raw`C:\Tools\node.exe`, 'Function'),
    candidate('node', String.raw`\\server\share\node.exe`),
  ];
  for (const value of blocked) {
    assert.match(assessExecutable('node', value, { ...FACTS, realPath: value.path }), /[가-힣]/);
  }
  const node = candidate('node');
  for (const facts of [{ isPE: false }, { isSymbolicLink: true }, { hasShimSidecar: true }]) {
    assert.ok(assessExecutable('node', node, { ...FACTS, realPath: node.path, ...facts }));
  }
  const proxy = candidate('rustc', String.raw`C:\Users\someone\.cargo\bin\rustc.exe`);
  assert.match(assessExecutable('rustc', proxy, { ...FACTS, realPath: proxy.path }), /proxy/);
  const actual = candidate('rustc', String.raw`C:\Rust\toolchains\stable\bin\rustc.exe`);
  assert.ok(assessExecutable('rustc', actual, { ...FACTS, realPath: actual.path, rustToolchainVerified: false }));
  assert.ok(assessExecutable('rustc', actual, { ...FACTS, realPath: actual.path, isRustupProxy: true }));
  assert.equal(assessExecutable('rustc', actual, { ...FACTS, realPath: actual.path }), null);
});

test('relative PATH entries and files inside the target project are excluded before execution', async () => {
  const root = String.raw`C:\work\app`;
  const inside = candidate('node', String.raw`c:\WORK\APP\bin\node.exe`);
  assert.match(assessExecutable('node', inside, { ...FACTS, realPath: inside.path }, { projectPath: root }), /프로젝트/);
  const relative = candidate('node', String.raw`C:\work\tools\node.exe`);
  assert.match(assessExecutable('node', relative, { ...FACTS, realPath: relative.path }, {
    projectPath: root, environment: { PATH: String.raw`..\tools;C:\Tools` },
  }), /상대 PATH/);
  const linked = candidate('node');
  assert.match(assessExecutable('node', linked, {
    ...FACTS, realPath: String.raw`C:\real-project\bin\node.exe`, realProjectPath: String.raw`C:\real-project`,
  }, { projectPath: root }), /프로젝트/);
  const outside = candidate('node', String.raw`C:\work\app-tools\node.exe`);
  assert.equal(assessExecutable('node', outside, { ...FACTS, realPath: outside.path }, { projectPath: root }), null);
  const host = inventory();
  host.commands.node = [candidate('node', `${PROJECT}\\node.exe`)];
  const { inspect, calls } = harness({ host });
  assert.equal((await inspect({ projectPath: PROJECT, tools: ['node'] })).probes.node.state, 'not_run');
  assert.equal(calls.length, 1);
});

test('wrapper verification never reads a wrapper or invokes any executable', async () => {
  const io = new Proxy({}, { get() { throw new Error('filesystem must not be used for a known wrapper'); } });
  for (const path of [String.raw`C:\Tools\node.cmd`, String.raw`C:\scoop\shims\node.exe`]) {
    const result = await verifyExecutable('node', candidate('node', path), { projectPath: PROJECT }, io);
    assert.equal(result.executable, null);
    assert.match(result.reason, /[가-힣]/);
  }
});

test('pwsh bootstrap resolves absolute .exe paths without shell strings or relative PATH entries', async () => {
  const attempted = [];
  const result = await resolvePowerShell({ Path: String.raw`.;relative;"C:\Missing";"C:\Shell"` },
    { projectPath: PROJECT }, async (name, value) => {
      attempted.push({ name, path: value.path });
      return { executable: value.path === SHELL ? SHELL : null };
    });
  assert.equal(result, SHELL);
  assert.deepEqual(attempted, [
    { name: 'pwsh', path: String.raw`C:\Missing\pwsh.exe` },
    { name: 'pwsh', path: SHELL },
  ]);
  await assert.rejects(resolvePowerShell({ PATH: '.;relative' }, { projectPath: PROJECT }),
    (error) => error.code === 'POWERSHELL_NOT_FOUND' && /[가-힣]/.test(error.message));
});

test('Windows-only, absolute path, timeout and tool-name validation precede collection', async () => {
  let starts = 0;
  const unsupported = createWindowsInspector({ platform: 'linux', resolveShell: () => { starts++; } });
  await assert.rejects(unsupported({ projectPath: PROJECT }), { code: 'WINDOWS_ONLY' });
  const { inspect, calls } = harness();
  for (const tools of ['git', ['git --version'], ['docker version'], ['constructor'], ['node; whoami'], [null]]) {
    await assert.rejects(inspect({ projectPath: PROJECT, tools }), TypeError);
  }
  for (const projectPath of ['.', 'relative', 'C:relative', 'https://example.invalid/project']) {
    await assert.rejects(inspect({ projectPath }), TypeError);
  }
  for (const timeoutMs of [0, -1, NaN, Infinity, 1.5]) {
    await assert.rejects(inspect({ projectPath: PROJECT, timeoutMs }), TypeError);
  }
  assert.equal(calls.length, 0);
  assert.equal(starts, 0);
});

test('probe failures, timeouts and invalid output are observations without stderr disclosure', async () => {
  const replies = [
    { state: 'failed', exitCode: 3, stdout: 'never-return-this', reason: '조회 명령이 정상 종료하지 않았습니다.' },
    { state: 'timed_out', exitCode: null, stdout: 'never-return-this', reason: '조회 제한 시간을 초과했습니다.' },
    { state: 'succeeded', exitCode: 0, stdout: 'https://secret@example.invalid never-return-this', reason: null },
  ];
  for (const reply of replies) {
    const { inspect } = harness({ reply: () => reply });
    const result = await inspect({ projectPath: PROJECT, tools: ['node'] });
    assert.equal(result.probes.node.state, reply.state === 'succeeded' ? 'failed' : reply.state);
    assert.equal(result.probes.node.version, null);
    assert.equal(result.probes.node.exitCode, reply.exitCode);
    assert.ok(!JSON.stringify(result).includes('never-return-this'));
    assert.match(result.probes.node.reason, /[가-힣]/);
  }
});

test('host collection failure and polluted JSON fail explicitly without leaking output', async () => {
  for (const [state, code] of [['timed_out', 'HOST_COLLECTION_TIMED_OUT'], ['failed', 'HOST_COLLECTION_FAILED']]) {
    const { inspect } = harness({ hostResult: { state, exitCode: null, stdout: 'never-return-this' } });
    await assert.rejects(inspect({ projectPath: PROJECT }), (error) => error.code === code);
  }
  const { inspect } = harness({ hostResult: {
    state: 'succeeded', exitCode: 0, stdout: `profile output never-return-this\n${JSON.stringify(inventory())}`,
  } });
  await assert.rejects(inspect({ projectPath: PROJECT }),
    (error) => error.code === 'INVALID_HOST_INVENTORY' && !error.message.includes('never-return-this'));
});

test('version parsing retains selected fields and handles UTF-16 WSL output', () => {
  const output = '\uFEFFWSL 버전: 2.5.4.0\r\n커널 버전: 6.6.87.2\r\n';
  const encoded = Buffer.from(output, 'utf16le');
  assert.equal(decodeOutput(encoded), output.replace(/^\uFEFF/, '').trim());
  assert.equal(parseVersionOutput('wsl', ['--version'], encoded).version, '2.5.4.0');
  const list = Buffer.from('  NAME              STATE           VERSION\r\n* Ubuntu            Stopped         2\r\n  Debian            Running         1\r\n', 'utf16le');
  const parsed = parseVersionOutput('wsl', ['--list', '--verbose'], list);
  assert.deepEqual(parsed.data.distributions, [
    { name: 'Ubuntu', state: 'Stopped', generation: 2, default: true },
    { name: 'Debian', state: 'Running', generation: 1, default: false },
  ]);
  const bigEndian = Buffer.from('\uFEFFWSL version: 2.5.4.0', 'utf16le').swap16();
  assert.equal(parseVersionOutput('wsl', ['--version'], bigEndian).version, '2.5.4.0');
  assert.equal(parseVersionOutput('node', ['--version'], 'https://secret@example.invalid'), null);
  assert.equal(parseVersionOutput('python', [], '{"version":"3.13.1","executable":"https://example.invalid"}'), null);
  assert.equal(parseVersionOutput('rustc', [], 'rustc 1.85.0-nightly (hash 2025-01-01)').version, '1.85.0-nightly');
});

test('.NET lists do not claim selected SDK, WSL stays host-only, Docker never contacts engines or discovers plugins', async () => {
  const { inspect, calls } = harness({ reply: (executable, args) => {
    let stdout;
    if (executable.endsWith('dotnet.exe')) {
      stdout = args[0] === '--list-sdks' ? '9.0.100 [C:\\Program Files\\dotnet\\sdk]\n'
        : 'Microsoft.NETCore.App 9.0.0 [C:\\Program Files\\dotnet\\shared\\Microsoft.NETCore.App]\n';
    } else if (executable.endsWith('wsl.exe')) {
      stdout = args[0] === '--version' ? 'WSL version: 2.5.4.0\n'
        : '  NAME              STATE           VERSION\n* Ubuntu            Stopped         2\n';
    } else stdout = 'Docker version 28.0.1, build abcdef\n';
    return { state: 'succeeded', exitCode: 0, stdout, reason: null };
  } });
  const result = await inspect({ projectPath: PROJECT, tools: ['dotnet', 'wsl', 'docker'] });
  assert.equal(result.probes.dotnet.version, null);
  assert.equal(result.probes.dotnet.data.sdks[0].version, '9.0.100');
  assert.equal(result.probes.dotnet.data.runtimes[0].version, '9.0.0');
  assert.equal(result.probes.wsl.data.distributions[0].state, 'Stopped');
  assert.equal(result.probes.docker.data.engine, 'not_run');
  assert.equal(result.probes.docker.data.compose.state, 'not_run');
  assert.deepEqual(calls.slice(1).map((call) => [call.executable, call.args]), [
    [String.raw`C:\Tools\dotnet.exe`, ['--list-sdks']],
    [String.raw`C:\Tools\dotnet.exe`, ['--list-runtimes']],
    [String.raw`C:\Tools\wsl.exe`, ['--version']],
    [String.raw`C:\Tools\wsl.exe`, ['--list', '--verbose']],
    [String.raw`C:\Tools\docker.exe`, ['--version']],
  ]);
});

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killCount = 0;
  child.kill = () => { child.killCount++; return true; };
  child.unref = () => {};
  return child;
}

test('runner passes an argument array with shell disabled and ignores stderr contents', async () => {
  const child = fakeChild();
  let received;
  const result = await runBounded(String.raw`C:\Tools\node.exe`, ['--version', 'literal; $(text)'], {
    cwd: PROJECT, env: { PATHEXT: '.EXE' }, timeoutMs: 1000,
    spawnImpl: (...args) => {
      received = args;
      queueMicrotask(() => {
        child.stdout.write('v24.10.0\n');
        child.stderr.write('never-return-this');
        child.emit('close', 0);
      });
      return child;
    },
  });
  assert.deepEqual(received[1], ['--version', 'literal; $(text)']);
  assert.equal(received[2].shell, false);
  assert.equal(received[2].windowsHide, true);
  assert.equal(received[2].cwd, PROJECT);
  assert.deepEqual(received[2].stdio, ['ignore', 'pipe', 'pipe']);
  assert.equal(result.state, 'succeeded');
  assert.equal(result.stdout.toString(), 'v24.10.0\n');
  assert.equal(child.killCount, 0);
});

test('runner timeout stops only its own fake child and returns bounded diagnostics', async () => {
  const child = fakeChild();
  const unrelated = fakeChild();
  const result = await runBounded('unused.exe', ['--version'], {
    timeoutMs: 5, spawnImpl: () => child,
  });
  assert.equal(result.state, 'timed_out');
  assert.equal(result.exitCode, null);
  assert.equal(result.stdout.length, 0);
  assert.equal(child.killCount, 1);
  assert.equal(unrelated.killCount, 0);
  assert.match(result.reason, /시간/);
  child.emit('close', 0);
  assert.equal(child.killCount, 1);
});

test('combined stdout/stderr cap and spawn errors are finite and disclose no raw output', async () => {
  for (const stream of ['stdout', 'stderr']) {
    const child = fakeChild();
    const result = await runBounded('unused.exe', [], {
      timeoutMs: 1000, maxOutputBytes: 8,
      spawnImpl: () => {
        queueMicrotask(() => { child.stdout.write('1234'); child[stream].write('never-return-this'); });
        return child;
      },
    });
    assert.equal(result.state, 'failed');
    assert.equal(result.stdout.length, 0);
    assert.equal(child.killCount, 1);
    assert.match(result.reason, /크기/);
  }
  const error = await runBounded('unused.exe', [], {
    spawnImpl: () => { throw new Error('never-return-this'); },
  });
  assert.equal(error.state, 'failed');
  assert.ok(!JSON.stringify(error).includes('never-return-this'));
});

test('collector uses fixed metadata commands and all edited files use LF', async () => {
  const script = await readFile(new URL('../scripts/collect-host.ps1', import.meta.url), 'utf8');
  assert.match(script, /Get-Command -Name \$name -All/);
  assert.match(script, /Set-Location -LiteralPath \$ProjectPath/);
  assert.match(script, /Get-CimInstance -ClassName Win32_OperatingSystem/);
  assert.match(script, /Get-CimInstance -ClassName Win32_Process/);
  assert.match(script, /\$PSModuleAutoLoadingPreference = 'None'/);
  assert.ok(!/Invoke-Expression|Start-Process|Invoke-Command|Get-ChildItem\s+Env:/.test(script));
  for (const name of INVENTORY_NAMES) assert.ok(script.includes(`'${name}'`), name);
  for (const relative of ['../src/windows.mjs', '../scripts/collect-host.ps1', './windows.test.mjs']) {
    assert.ok(!(await readFile(new URL(relative, import.meta.url), 'utf8')).includes('\r'), relative);
  }
});
