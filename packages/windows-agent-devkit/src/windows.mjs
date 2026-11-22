import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

export const INVENTORY_NAMES = Object.freeze([
  'pwsh', 'powershell', 'git', 'winget', 'mise', 'node', 'npm', 'pnpm', 'yarn',
  'python', 'py', 'uv', 'go', 'rustup', 'rustc', 'cargo', 'zig', 'dotnet', 'wsl',
  'docker', 'lazydocker', 'process-compose', 'code', 'gh', 'rg', 'nu',
  'fnm', 'nvm', 'pyenv', 'conda', 'choco', 'scoop', 'wt', 'codex', 'vswhere', 'fsutil',
  'task', 'just', 'make',
]);

const COLLECTOR = fileURLToPath(new URL('../scripts/collect-host.ps1', import.meta.url));
const OUTPUT_LIMIT = 64 * 1024;
const PYTHON_QUERY = 'import json,sys; print(json.dumps({"version":".".join(map(str,sys.version_info[:3])),"executable":sys.executable,"prefix":sys.prefix,"basePrefix":sys.base_prefix}))';
const VERSION_TOKEN = String.raw`\d+(?:\.[0-9A-Za-z]+){1,5}(?:[-+][0-9A-Za-z.+-]+)?`;
const VERSION = new RegExp(`^v?${VERSION_TOKEN}$`);
const QUERIES = Object.freeze({
  git: [['--version']],
  node: [['--version']],
  python: [['-B', '-I', '-S', '-c', PYTHON_QUERY]],
  rustc: [['--version']],
  cargo: [['--version']],
  zig: [['version']],
  // These are native host queries; managed SDK --version can run first-use setup.
  dotnet: [['--list-sdks'], ['--list-runtimes']],
  wsl: [['--version'], ['--list', '--verbose']],
  docker: [['--version']],
  gh: [['--version']],
  rg: [['--version']],
  task: [['--version']],
  just: [['--version']],
  make: [['--version']],
});

const METADATA_ONLY_REASONS = {
  go: 'go version의 telemetry 파일 쓰기 여부를 검증하지 않아 메타데이터만 수집했습니다.',
  py: 'Python 실행 관리자는 설치나 인터프리터 선택을 유발할 수 있어 실행하지 않았습니다.',
  rustup: 'rustup의 도구 모음 동기화 가능성 때문에 실행하지 않았습니다.',
  mise: 'mise의 활성화·선택·설치 명령은 실행 범위에 포함하지 않았습니다.',
  lazydocker: 'TUI나 엔진 연결을 피하기 위해 메타데이터만 수집했습니다.',
  'process-compose': '공통 초기화의 로그·업데이트 확인을 검증하지 않아 실행하지 않았습니다.',
};

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

function envValue(environment, name) {
  const key = Object.keys(environment).find((key) => key.toUpperCase() === name.toUpperCase());
  return key === undefined ? undefined : environment[key];
}

export function isEnvironmentInjection(name) {
  return /^(?:NODE_OPTIONS|NODE_PATH|PYTHONSTARTUP|PYTHONPATH|PYTHONHOME|DOTNET_STARTUP_HOOKS|DOTNET_ADDITIONAL_DEPS|DOTNET_SHARED_STORE|GIT_CONFIG(?:_.*)?|GIT_SSH(?:_COMMAND)?|GIT_EXEC_PATH|BASH_ENV|ENV|SHELLOPTS|BASHOPTS|ZDOTDIR|PROMPT_COMMAND|PSModulePath|RUSTC_WRAPPER|RUSTC_WORKSPACE_WRAPPER|RUSTDOC|GOFLAGS|MAKEFLAGS|GNUMAKEFLAGS|MFLAGS|MAKEFILES|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_.*|RUBYOPT|PERL5OPT)$/i.test(name);
}

// Only mise's activation function may yield to an Application candidate.
// Wrappers and shims still pass through the ordinary executable verification.
export function selectCommandCandidate(name, candidates = []) {
  if (name === 'mise' && candidates[0]?.commandType === 'Function') {
    return candidates.find((candidate) => candidate.commandType === 'Application') ?? candidates[0];
  }
  return candidates[0];
}

// Inherit process essentials, not runtime hooks, credentials, config overrides or proxies.
export function createChildEnvironment(environment) {
  const child = {};
  for (const key of [
    'PATH', 'PATHEXT', 'SystemRoot', 'WINDIR', 'SystemDrive', 'TEMP', 'TMP', 'USERPROFILE',
    'APPDATA', 'LOCALAPPDATA', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432',
    'HOMEDRIVE', 'HOMEPATH',
  ]) {
    const value = envValue(environment, key);
    if (typeof value === 'string') child[key] = value;
  }
  return Object.assign(child, {
    POWERSHELL_TELEMETRY_OPTOUT: '1',
    POWERSHELL_UPDATECHECK: 'Off',
    PSModuleAnalysisCachePath: 'NUL',
    GOTOOLCHAIN: 'local',
    GOENV: 'off',
    GOTELEMETRY: 'off',
    GOPROXY: 'off',
    RUSTUP_AUTO_INSTALL: '0',
    CARGO_NET_OFFLINE: 'true',
    MISE_AUTO_INSTALL: '0',
    MISE_TASK_RUN_AUTO_INSTALL: '0',
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    DOTNET_NOLOGO: '1',
    DOTNET_ADD_GLOBAL_TOOLS_TO_PATH: '0',
    DOTNET_GENERATE_ASPNET_CERTIFICATE: '0',
    DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: 'true',
    DOTNET_SKIP_WORKLOAD_INTEGRITY_CHECK: '1',
    DOTNET_SDK_VULNERABILITY_CHECK_DISABLE: 'true',
    DOTNET_CLI_UI_LANGUAGE: 'en-US',
  });
}

function absoluteWindowsPath(value) {
  return typeof value === 'string' && /^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/.test(value)
    && !/[\0\r\n]/.test(value) && !value.includes('://');
}

function localPath(value) {
  return absoluteWindowsPath(value) && /^[A-Za-z]:[\\/]/.test(value);
}

function pathKey(value) {
  return win32.normalize(value).replace(/[\\/]+$/, '').toLowerCase();
}

function insideProject(candidatePath, projectPath) {
  if (!absoluteWindowsPath(projectPath)) return false;
  const relative = win32.relative(pathKey(projectPath), pathKey(candidatePath));
  return relative === '' || (relative !== '..' && !relative.startsWith('..\\') && !win32.isAbsolute(relative));
}

function pathEntries(value) {
  return String(value ?? '').split(';').map((entry) => entry.trim().replace(/^"(.*)"$/, '$1'));
}

function pathReason(name, candidatePath, projectPath) {
  if (!localPath(candidatePath)) return '로컬 절대 경로를 확인하지 못해 실행하지 않았습니다.';
  const normalized = win32.normalize(candidatePath);
  if (win32.basename(normalized).toLowerCase() !== `${name}.exe`) {
    return '이름이 일치하는 .exe가 아니거나 스크립트 래퍼여서 실행하지 않았습니다.';
  }
  if (/\\(?:shims?|proxies|volta\\bin|chocolatey\\bin)(?:\\|$)/i.test(normalized)
    || /\\Microsoft\\WindowsApps(?:\\|$)/i.test(normalized)
    || (/^(?:rustc|cargo)$/.test(name) && /\\\.cargo\\bin\\/i.test(normalized))) {
    return 'shim·proxy·Windows 실행 별칭의 자동 설치 가능성 때문에 실행하지 않았습니다.';
  }
  if (insideProject(candidatePath, projectPath)) return '대상 프로젝트 내부의 실행 파일은 실행하지 않았습니다.';
  return null;
}

function absolutePathEntryReason(candidatePath, environment, projectPath) {
  const directory = pathKey(win32.dirname(candidatePath));
  for (const entry of pathEntries(envValue(environment, 'PATH'))) {
    const resolved = absoluteWindowsPath(entry) ? entry : win32.resolve(projectPath, entry || '.');
    if (pathKey(resolved) !== directory) continue;
    return localPath(entry) ? null : '상대 PATH 항목에서 발견된 명령은 실행하지 않았습니다.';
  }
  return '절대 PATH 항목에서 출처를 확인하지 못해 실행하지 않았습니다.';
}

// A pure decision seam: tests never need to execute a candidate binary or wrapper.
export function assessExecutable(name, candidate, facts = {}, { projectPath, environment } = {}) {
  if (!candidate || candidate.commandType !== 'Application') {
    return '네이티브 응용 프로그램이 아닌 명령은 실행하지 않았습니다.';
  }
  let reason = pathReason(name, candidate.path, projectPath);
  if (reason) return reason;
  if (environment) {
    reason = absolutePathEntryReason(candidate.path, environment, projectPath);
    if (reason) return reason;
  }
  if (facts.isSymbolicLink || !facts.isFile || !facts.isPE) {
    return '일반 PE 실행 파일을 확인하지 못해 실행하지 않았습니다.';
  }
  reason = pathReason(name, facts.realPath, facts.realProjectPath ?? projectPath);
  if (reason) return reason;
  if (insideProject(facts.realPath, projectPath) || insideProject(candidate.path, facts.realProjectPath)) {
    return '대상 프로젝트 내부로 연결되는 실행 파일은 실행하지 않았습니다.';
  }
  if (facts.hasShimSidecar || facts.isRustupProxy) {
    return '실행 파일의 shim·rustup proxy 근거를 발견해 실행하지 않았습니다.';
  }
  if (/^(?:rustc|cargo)$/.test(name) && !facts.rustToolchainVerified) {
    return '실제 Rust 도구 모음 파일임을 확인하지 못해 실행하지 않았습니다.';
  }
  return null;
}

async function isPE(filePath, io) {
  const handle = await io.open(filePath, 'r');
  try {
    const header = Buffer.alloc(64);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead !== 64 || header.toString('ascii', 0, 2) !== 'MZ') return false;
    const offset = header.readUInt32LE(60);
    if (offset < 64 || offset > 4 * 1024 * 1024) return false;
    const signature = Buffer.alloc(4);
    const result = await handle.read(signature, 0, 4, offset);
    return result.bytesRead === 4 && signature.equals(Buffer.from('PE\0\0'));
  } finally {
    await handle.close();
  }
}

async function exists(filePath, io) {
  try { await io.lstat(filePath); return true; } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
}

async function rustFacts(name, realPath, info, commands, io) {
  if (!/^(?:rustc|cargo)$/.test(name)) return {};
  const bin = win32.dirname(realPath);
  const library = win32.join(bin, '..', 'lib', 'rustlib');
  // Both an installed compiler and its standard library must be present.
  let rustToolchainVerified = false;
  try {
    rustToolchainVerified = win32.basename(bin).toLowerCase() === 'bin'
      && (await io.stat(library)).isDirectory()
      && await isPE(win32.join(bin, 'rustc.exe'), io);
  } catch { /* An incomplete or unreadable layout remains unverified. */ }
  const references = new Set([
    win32.join(bin, 'rustup.exe'),
    ...(commands.rustup ?? []).map((candidate) => candidate.path).filter(localPath),
  ]);
  let candidateHash;
  for (const reference of references) {
    let referenceInfo;
    try { referenceInfo = await io.stat(reference); } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') continue;
      throw error;
    }
    if (!referenceInfo.isFile()) continue;
    if (info.ino && info.ino === referenceInfo.ino && info.dev === referenceInfo.dev) {
      return { rustToolchainVerified, isRustupProxy: true };
    }
    if (info.size !== referenceInfo.size) continue;
    if (info.size > 128 * 1024 * 1024) return { rustToolchainVerified: false };
    candidateHash ??= createHash('sha256').update(await io.readFile(realPath)).digest('hex');
    const referenceHash = createHash('sha256').update(await io.readFile(reference)).digest('hex');
    if (candidateHash === referenceHash) return { rustToolchainVerified, isRustupProxy: true };
  }
  return { rustToolchainVerified, isRustupProxy: false };
}

export async function verifyExecutable(name, candidate, options = {}, io = fs) {
  if (!candidate || candidate.commandType !== 'Application') {
    return { executable: null, reason: '응용 프로그램 경로를 확인하지 못해 실행하지 않았습니다.' };
  }
  const earlyReason = pathReason(name, candidate.path, options.projectPath)
    ?? (options.environment && absolutePathEntryReason(candidate.path, options.environment, options.projectPath));
  if (earlyReason) return { executable: null, reason: earlyReason };
  try {
    const info = await io.lstat(candidate.path);
    // Do not follow executable aliases or symlinks just to inspect their contents.
    if (!info.isFile() || info.isSymbolicLink()) {
      return { executable: null, reason: '일반 파일이 아니거나 실행 별칭이어서 실행하지 않았습니다.' };
    }
    const realPath = await io.realpath(candidate.path);
    const realProjectPath = options.projectPath ? await io.realpath(options.projectPath) : undefined;
    const realReason = pathReason(name, realPath, realProjectPath);
    if (realReason) return { executable: null, reason: realReason };
    const facts = {
      isFile: true, isSymbolicLink: false, realPath, realProjectPath,
      isPE: await isPE(realPath, io),
      hasShimSidecar: await exists(candidate.path.replace(/\.exe$/i, '.shim'), io)
        || await exists(`${candidate.path}.shim`, io),
      ...await rustFacts(name, realPath, info, options.commands ?? {}, io),
    };
    const reason = assessExecutable(name, candidate, facts, options);
    return { executable: reason ? null : realPath, reason };
  } catch {
    return { executable: null, reason: '실행 파일의 출처·메타데이터에 접근하지 못해 실행하지 않았습니다.' };
  }
}

export async function resolvePowerShell(environment, options = {}, verify = verifyExecutable) {
  for (const entry of pathEntries(envValue(environment, 'PATH'))) {
    if (!localPath(entry)) continue;
    const candidate = { commandType: 'Application', path: win32.join(entry, 'pwsh.exe') };
    const checked = await verify('pwsh', candidate, { ...options, environment });
    if (checked.executable) return checked.executable;
  }
  throw failure('POWERSHELL_NOT_FOUND', '절대 PATH 항목에서 검증할 수 있는 pwsh.exe를 찾지 못했습니다.');
}

export function decodeOutput(value) {
  if (typeof value === 'string') return value.replace(/^\uFEFF/, '').trim();
  const buffer = Buffer.from(value ?? []);
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    return Buffer.from(buffer.subarray(2, buffer.length - buffer.length % 2)).swap16().toString('utf16le').trim();
  }
  const sample = buffer.subarray(0, 256);
  let oddZeros = 0;
  for (let index = 1; index < sample.length; index += 2) if (sample[index] === 0) oddZeros++;
  const utf16 = (buffer[0] === 0xff && buffer[1] === 0xfe) || oddZeros > sample.length / 8;
  return buffer.toString(utf16 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '').trim();
}

// Kill only the child created here, never a process tree, engine or existing user process.
export function runBounded(executable, args, {
  cwd, env, timeoutMs = 5000, maxOutputBytes = OUTPUT_LIMIT, spawnImpl = spawn, signal,
} = {}) {
  return new Promise((resolve) => {
    let child;
    let settled = false;
    let timer;
    let total = 0;
    const chunks = [];
    const finish = (state, exitCode, reason, stop = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (stop) {
        try { child?.kill(); } catch { /* Only our child is eligible for termination. */ }
        child?.stdout?.destroy();
        child?.stderr?.destroy();
        child?.unref();
      }
      resolve({ state, exitCode, stdout: stop ? Buffer.alloc(0) : Buffer.concat(chunks), reason });
    };
    const abort = () => finish('timed_out', null, '조회가 취소되었습니다.', true);
    if (signal?.aborted) { abort(); return; }
    try {
      child = spawnImpl(executable, args, {
        cwd, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      finish('failed', null, '조회용 자식 프로세스를 시작하지 못했습니다.');
      return;
    }
    const receive = (value, stdout) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
      total += buffer.length;
      if (total > maxOutputBytes) {
        finish('failed', null, '조회 출력이 허용한 크기를 초과했습니다.', true);
      } else if (stdout) chunks.push(buffer);
    };
    child.stdout.on('data', (value) => receive(value, true));
    child.stderr.on('data', (value) => receive(value, false));
    child.on('error', () => finish('failed', null, '조회용 자식 프로세스를 실행하지 못했습니다.'));
    child.on('close', (code) => finish(code === 0 ? 'succeeded' : 'failed', code,
      code === 0 ? null : '조회 명령이 정상 종료하지 않았습니다.'));
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish('timed_out', null, '조회 제한 시간을 초과했습니다.', true), timeoutMs);
  });
}

function safePath(value) {
  return absoluteWindowsPath(value) && value.length <= 32767 ? value : null;
}

function safeLabel(value) {
  return typeof value === 'string' && /^[\p{L}\p{N} ._()+-]{1,160}$/u.test(value) ? value : null;
}

function metadataVersion(value) {
  return typeof value === 'string' && /^[0-9][0-9A-Za-z ._()+-]{0,160}$/.test(value) ? value : null;
}

export function parseVersionOutput(name, args, output) {
  const text = decodeOutput(output);
  const firstLine = text.split(/\r?\n/, 1)[0];
  if (name === 'python') {
    try {
      const value = JSON.parse(text);
      if (!/^\d+\.\d+\.\d+$/.test(value.version)
        || ![value.executable, value.prefix, value.basePrefix].every(safePath)) return null;
      return { version: value.version, data: {
        executable: value.executable, prefix: value.prefix, basePrefix: value.basePrefix,
      } };
    } catch { return null; }
  }
  if (name === 'dotnet') {
    const rows = text ? text.split(/\r?\n/) : [];
    const entries = [];
    for (const row of rows) {
      const expression = args[0] === '--list-sdks'
        ? new RegExp(`^(${VERSION_TOKEN}) \\[(.+)\\]$`)
        : new RegExp(`^([A-Za-z0-9.]+) (${VERSION_TOKEN}) \\[(.+)\\]$`);
      const match = expression.exec(row.trim());
      if (!match || !safePath(match.at(-1))) return null;
      entries.push(args[0] === '--list-sdks'
        ? { version: match[1], path: match[2] }
        : { name: match[1], version: match[2], path: match[3] });
    }
    return { version: null, data: { [args[0] === '--list-sdks' ? 'sdks' : 'runtimes']: entries } };
  }
  if (name === 'wsl' && args[0] === '--list') {
    const distributions = [];
    for (const row of text.split(/\r?\n/)) {
      const match = /^\s*(\*)?\s*(.+?)\s{2,}(.+?)\s+([12])\s*$/.exec(row);
      if (!match) continue;
      const label = safeLabel(match[2]);
      const state = safeLabel(match[3]);
      if (!label || !state) return null;
      distributions.push({ name: label, state, generation: Number(match[4]), default: Boolean(match[1]) });
    }
    return distributions.length ? { version: null, data: { distributions } } : null;
  }
  const patterns = {
    git: new RegExp(`^git version (${VERSION_TOKEN})(?:\\s|$)`),
    node: new RegExp(`^v(${VERSION_TOKEN})$`),
    rustc: new RegExp(`^rustc (${VERSION_TOKEN})(?:\\s|$)`),
    cargo: new RegExp(`^cargo (${VERSION_TOKEN})(?:\\s|$)`),
    zig: new RegExp(`^(${VERSION_TOKEN})$`),
    docker: new RegExp(`^Docker version (${VERSION_TOKEN})(?:,|\\s|$)`),
    gh: new RegExp(`^gh version (${VERSION_TOKEN})(?:\\s|$)`),
    rg: new RegExp(`^ripgrep (${VERSION_TOKEN})(?:\\s|$)`),
    task: new RegExp(`^(?:Task version:\\s+)?v?(${VERSION_TOKEN})(?:\\s|$)`, 'i'),
    just: new RegExp(`^just (${VERSION_TOKEN})(?:\\s|$)`),
    make: new RegExp(`^GNU Make (${VERSION_TOKEN})(?:\\s|$)`),
    wsl: new RegExp(`^WSL[^:\\r\\n]*:\\s*(${VERSION_TOKEN})\\s*$`, 'im'),
  };
  const match = patterns[name]?.exec(name === 'wsl' ? text : firstLine);
  if (!match || !VERSION.test(match[1])) return null;
  const data = name === 'docker' ? {
    engine: 'not_run',
    compose: { state: 'not_run', version: null, reason: '검증된 Compose 플러그인 경로가 없어 실행하지 않았습니다.' },
  } : null;
  return { version: match[1], data };
}

function inventoryFrom(output) {
  try {
    const value = JSON.parse(decodeOutput(output));
    const context = value.context;
    if (context.platform !== 'win32' || !safePath(context.cwd)
      || !safePath(context.diagnosticShell.path) || context.diagnosticShell.profileApplied !== false
      || !context.os || !safeLabel(context.processArchitecture)) throw new Error();
    const commands = {};
    for (const name of INVENTORY_NAMES) {
      const candidates = value.commands?.[name];
      if (!Array.isArray(candidates)) throw new Error();
      commands[name] = candidates.map((candidate) => ({
        name: safeLabel(candidate.name), commandType: safeLabel(candidate.commandType),
        path: safePath(candidate.path), fileVersion: metadataVersion(candidate.fileVersion),
        productVersion: metadataVersion(candidate.productVersion),
      }));
    }
    return {
      context: {
        platform: 'win32',
        ...(safeLabel(context.metadataSource) ? { metadataSource: safeLabel(context.metadataSource) } : {}),
        os: {
          name: safeLabel(context.os.name), version: metadataVersion(context.os.version),
          build: metadataVersion(context.os.build), architecture: safeLabel(context.os.architecture),
        },
        processArchitecture: safeLabel(context.processArchitecture), cwd: safePath(context.cwd),
        diagnosticShell: {
          name: safeLabel(context.diagnosticShell.name), path: safePath(context.diagnosticShell.path),
          version: metadataVersion(context.diagnosticShell.version), profileApplied: false,
        },
      }, commands,
    };
  } catch {
    throw failure('INVALID_HOST_INVENTORY', 'Windows 수집기가 올바른 JSON 메타데이터를 반환하지 않았습니다.');
  }
}

function emptyProbe(state, reason, executable = null) {
  return { state, executable, arguments: [], exitCode: null, version: null, data: null, reason };
}

// Dependency injection is for host-independent tests; the public adapter uses real built-ins.
export function createWindowsInspector({
  platform = process.platform, environment = process.env, run = runBounded,
  resolveShell = resolvePowerShell, verify = verifyExecutable,
} = {}) {
  return async function ({ projectPath, timeoutMs = 5000, tools = [] } = {}) {
    if (platform !== 'win32') throw failure('WINDOWS_ONLY', 'Windows 호스트에서만 실행할 수 있습니다.');
    if (!absoluteWindowsPath(projectPath)) throw new TypeError('프로젝트의 Windows 절대 경로가 필요합니다.');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) {
      throw new TypeError('조회 제한 시간은 1 이상인 유효한 정수여야 합니다.');
    }
    if (!Array.isArray(tools) || tools.some((name) => !INVENTORY_NAMES.includes(name))) {
      throw new TypeError('도구는 고정 인벤토리의 이름만 포함하는 배열이어야 합니다.');
    }
    const options = { projectPath, environment };
    const shell = await resolveShell(environment, options);
    const env = createChildEnvironment(environment);
    const host = await run(shell, ['-NoProfile', '-NonInteractive', '-File', COLLECTOR, '-ProjectPath', projectPath],
      { cwd: projectPath, env, timeoutMs, maxOutputBytes: 1024 * 1024 });
    if (host.state !== 'succeeded') {
      throw failure(host.state === 'timed_out' ? 'HOST_COLLECTION_TIMED_OUT' : 'HOST_COLLECTION_FAILED',
        host.state === 'timed_out' ? 'Windows 메타데이터 수집 제한 시간을 초과했습니다.' : 'Windows 메타데이터를 수집하지 못했습니다.');
    }
    const inventory = inventoryFrom(host.stdout);
    const requested = new Set(tools);
    const probes = {};
    for (const name of INVENTORY_NAMES) {
      const candidates = inventory.commands[name];
      if (!requested.has(name)) {
        probes[name] = emptyProbe('not_run', '버전 조회를 요청하지 않아 실행하지 않았습니다.');
        continue;
      }
      if (!candidates.length) {
        probes[name] = emptyProbe('not_found', '진단 셸의 명령 탐색에서 후보를 찾지 못했습니다.');
        continue;
      }
      if (!Object.hasOwn(QUERIES, name)) {
        probes[name] = emptyProbe('not_run', METADATA_ONLY_REASONS[name]
          ?? '부작용을 검증한 고정 버전 조회가 없어 메타데이터만 수집했습니다.', candidates[0].path);
        continue;
      }
      const candidate = selectCommandCandidate(name, candidates);
      const checked = await verify(name, candidate, { ...options, commands: inventory.commands });
      if (!checked.executable) {
        probes[name] = emptyProbe('not_run', checked.reason, candidate.path);
        continue;
      }
      const queries = [];
      for (const fixedArgs of QUERIES[name]) {
        const args = [...fixedArgs];
        const result = await run(checked.executable, args, { cwd: projectPath, env: { ...env }, timeoutMs });
        const parsed = result.state === 'succeeded' ? parseVersionOutput(name, args, result.stdout) : null;
        queries.push({
          state: result.state === 'succeeded' && !parsed ? 'failed' : result.state,
          executable: checked.executable, arguments: args, exitCode: result.exitCode,
          version: parsed?.version ?? null, data: parsed?.data ?? null,
          reason: result.state === 'succeeded'
            ? (parsed ? '허용한 버전·설치 목록 조회만 확인했습니다.' : '조회 출력에서 예상한 버전 필드를 확인하지 못했습니다.')
            : result.reason,
        });
        if (result.state === 'timed_out') break;
      }
      const primary = { ...queries[0] };
      if (QUERIES[name].length > 1) {
        primary.data = Object.assign({}, ...queries.map((query) => query.data ?? {}), { queries });
        primary.reason = name === 'dotnet'
          ? '설치 목록 조회 결과입니다. 프로젝트에서 선택할 SDK는 확인하지 않았습니다.'
          : 'WSL 호스트 조회 결과입니다. 배포판 내부는 실행하지 않았습니다.';
      }
      probes[name] = primary;
    }
    return { ...inventory, probes };
  };
}

const inspect = createWindowsInspector();
export async function inspectWindows(options) {
  return inspect(options);
}
