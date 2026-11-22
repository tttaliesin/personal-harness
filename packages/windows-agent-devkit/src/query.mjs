import { mkdtemp, rm, readFile, realpath, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChildEnvironment, runBounded, verifyExecutable, decodeOutput, isEnvironmentInjection, selectCommandCandidate } from './windows.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SAFE_ROOT_VARIABLES = ['MISE_DATA_DIR', 'MISE_CONFIG_DIR', 'MISE_CACHE_DIR', 'RUSTUP_HOME', 'CARGO_HOME', 'DOTNET_ROOT', 'DOTNET_ROOT_X64', 'DOTNET_ROOT_X86', 'DOCKER_CONFIG', 'VSCODE_PORTABLE'];
const QUERY_ENVIRONMENT = {
  MISE_OFFLINE: '1',
  MISE_AUTO_INSTALL: '0',
  MISE_TASK_RUN_AUTO_INSTALL: '0',
  MISE_NO_HOOKS: '1',
  MISE_NO_ENV: '1',
  COREPACK_ENABLE_NETWORK: '0',
  COREPACK_ENABLE_AUTO_PIN: '0',
};

function forceEnvironment(environment, values) {
  const names = new Set(Object.keys(values).map((name) => name.toUpperCase()));
  for (const name of Object.keys(environment)) if (names.has(name.toUpperCase())) delete environment[name];
  return Object.assign(environment, values);
}

function envGet(environment, name) {
  return Object.entries(environment).find(([key]) => key.toUpperCase() === name)?.[1];
}

export function queryEnvironment(environment) {
  const child = createChildEnvironment(environment);
  for (const name of SAFE_ROOT_VARIABLES) {
    const value = envGet(environment, name);
    if (typeof value === 'string' && isAbsolute(value) && !/[\r\n\0]/.test(value)) child[name] = value;
  }
  return Object.assign(child, QUERY_ENVIRONMENT, {
    PNPM_PACKAGE_MANAGER_STRICT: 'false',
    DOTNET_GENERATE_ASPNET_CERTIFICATE: 'false',
    DOTNET_ADD_GLOBAL_TOOLS_TO_PATH: 'false',
  });
}

function matches(args, ...expected) {
  return args.length === expected.length && expected.every((value, index) => args[index] === value);
}

export function isReadOnlyQuery(tool, args) {
  if (!Array.isArray(args) || args.length > 80 || args.some((arg) => typeof arg !== 'string' || /[\0\r\n]/.test(arg))) return false;
  if (['node', 'python', 'rustc', 'cargo', 'rg', 'gh', 'winget', 'code', 'codex', 'task', 'just', 'make'].includes(tool) && matches(args, '--version')) return true;
  if (tool === 'zig') return matches(args, 'version');
  if (tool === 'git') {
    const words = args[0] === '-c' && args[1] === 'core.fsmonitor=false' ? args.slice(2) : args;
    return matches(words, '--version') || matches(words, 'rev-parse', '--show-toplevel')
      || matches(words, 'ls-files', '--eol', '-z') || matches(words, 'config', '--list')
      || (words.length === 3 && words[0] === 'config' && ['--get', '--get-all', '--get-regexp'].includes(words[1])
        && typeof words[2] === 'string' && words[2] !== '' && !words[2].startsWith('-'));
  }
  if (tool === 'mise') return matches(args, '--version') || (args.length === 3 && args[0] === 'ls' && args.includes('--installed') && args.includes('--json'))
    || (args.length === 2 && args[0] === 'which' && ['node', 'python', 'go', 'rustc', 'cargo', 'zig', 'dotnet', 'uv', 'lazydocker', 'process-compose'].includes(args[1]));
  if (tool === 'dotnet') return args.length === 1 && ['--list-sdks', '--list-runtimes', '--version', '--info'].includes(args[0]);
  if (tool === 'docker') {
    // Compose version is queried through the verified docker-compose executable.
    return matches(args, '--version') || matches(args, 'context', 'show') || matches(args, 'context', 'ls')
      || (args.length === 3 && args[0] === 'context' && args[1] === 'inspect'
        && typeof args[2] === 'string' && /^[\w.][\w.-]{0,119}$/.test(args[2]));
  }
  if (tool === 'docker-compose') return matches(args, 'version') || matches(args, 'version', '--short') || matches(args, 'version', '--format', 'json');
  if (tool === 'wsl') return matches(args, '--version') || matches(args, '--status') || matches(args, '--list', '--verbose') || matches(args, '--list', '--quiet');
  if (tool === 'vswhere') return args.includes('-format') && args.includes('json');
  if (tool === 'fsutil') return args[0] === 'devdrv' && args[1] === 'query';
  if (tool === 'codex') return matches(args, 'plugin', 'list') || matches(args, 'plugin', 'list', '--json')
    || matches(args, 'plugin', 'list', '--marketplace', 'windows-agent-devkit-local', '--json')
    || matches(args, 'plugin', 'marketplace', 'list') || matches(args, 'plugin', 'marketplace', 'list', '--json');
  if (tool === 'gh') return matches(args, 'auth', 'status', '--active', '--hostname', 'github.com');
  if (tool === 'pwsh' || tool === 'powershell') {
    if (args[0] !== '-NoProfile' || args[1] !== '-NonInteractive' || args[2] !== '-File') return false;
    if (args[3] === resolve(ROOT, 'scripts', 'collect-host.ps1')) return args.length === 4 || args.length === 6 && args[4] === '-ProjectPath' && typeof args[5] === 'string' && isAbsolute(args[5]);
    return args.length === 6 && args[3] === resolve(ROOT, 'scripts', 'collect-advanced.ps1') && args[4] === '-TargetPath' && typeof args[5] === 'string' && isAbsolute(args[5]);
  }
  return false;
}

function denied(reason, executable = null, args = []) {
  return { state: 'not_run', stdout: '', stderr: '', exitCode: null, executable, arguments: args, reason };
}

async function shimTarget(candidate) {
  if (!candidate?.path || !/[\\/]shims[\\/]/i.test(candidate.path)) return candidate;
  try {
    const data = await readFile(candidate.path.replace(/\.(?:exe|cmd|ps1)$/i, '.shim'), 'utf8');
    if (data.length > 8192 || [...data.matchAll(/^args[ \t]*=[ \t]*(.*)$/gm)].some((match) => match[1].trim() !== '[]')) return candidate;
    const match = /^path\s*=\s*"([^"\r\n]+)"\s*$/m.exec(data);
    if (match && isAbsolute(match[1]) && !/[%$]/.test(match[1])) return { ...candidate, path: match[1], commandType: 'Application', shimSource: candidate.path };
  } catch { /* Only verified sidecars may redirect a query. */ }
  return candidate;
}

export function createQuery({ projectPath, host, timeoutMs = 5000, environment = process.env, run = runBounded } = {}) {
  return async function query(tool, args, options = {}) {
    if (options.execute === true) return denied('읽기 전용 메타데이터 조회만 지원합니다.', null, args);
    if (options.signal?.aborted) return denied('취소된 조회입니다.', null, args);
    if (!Array.isArray(args) || args.length > 128 || args.some((arg) => typeof arg !== 'string' || /[\0\r\n]/.test(arg))) return denied('문자열 인수 배열이 필요합니다.');
    if (!isReadOnlyQuery(tool, args)) return denied('허용한 메타데이터 조회가 아닙니다.', null, args);
    let candidate = options.executable ? { name: `${tool}.exe`, commandType: 'Application', path: options.executable } : selectCommandCandidate(tool, host?.commands?.[tool]);
    if (!candidate && ['vswhere', 'fsutil'].includes(tool)) {
      const root = envGet(environment, tool === 'vswhere' ? 'PROGRAMFILES(X86)' : 'SYSTEMROOT');
      if (root && isAbsolute(root)) candidate = { name: `${tool}.exe`, commandType: 'Application', path: tool === 'vswhere' ? join(root, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe') : join(root, 'System32', 'fsutil.exe') };
    }
    if (!candidate) {
      const extension = process.platform === 'win32' ? '.exe' : '';
      for (const directory of String(envGet(environment, 'PATH') ?? '').split(process.platform === 'win32' ? ';' : ':')) {
        if (!isAbsolute(directory)) continue;
        try {
          const path = join(directory, `${tool}${extension}`);
          if ((await stat(path)).isFile()) { candidate = { name: `${tool}${extension}`, commandType: 'Application', path }; break; }
        } catch { /* Continue absolute PATH metadata discovery. */ }
      }
    }
    candidate = await shimTarget(candidate);
    if (!candidate?.path) return { ...denied('현재 문맥에서 명령 후보를 찾지 못했습니다.', null, args), state: 'not_found' };
    const assessment = await verifyExecutable(tool, candidate, { projectPath, commands: host?.commands });
    if (!assessment.executable) return denied(assessment.reason, candidate.path, args);
    const cwd = options.cwd ?? projectPath;
    const env = forceEnvironment(queryEnvironment(environment), options.env ?? {});
    for (const name of Object.keys(env)) if (isEnvironmentInjection(name)) delete env[name];
    forceEnvironment(env, QUERY_ENVIRONMENT);
    let temporary;
    if (tool === 'dotnet' && ['--version', '--info'].includes(args[0])) {
      temporary = await mkdtemp(join(tmpdir(), 'windows-agent-devkit-dotnet-'));
      forceEnvironment(env, { DOTNET_CLI_HOME: temporary });
    }
    const actualArgs = tool === 'git' ? ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=NUL', ...args] : args;
    try {
      const response = await run(assessment.executable, actualArgs, {
        cwd, env, signal: options.signal, timeoutMs: options.timeoutMs ?? timeoutMs, maxOutputBytes: options.maxOutputBytes ?? 256 * 1024,
      });
      return {
        ...response,
        stdout: decodeOutput(response.stdout),
        stderr: decodeOutput(response.stderr),
        executable: assessment.executable,
        arguments: actualArgs,
        resolutionMethod: candidate.shimSource ? 'shim-target-metadata' : 'direct-executable',
      };
    } finally {
      if (temporary) {
        const absolute = await realpath(temporary);
        const parent = await realpath(tmpdir());
        const child = relative(parent, absolute);
        if (child && !child.startsWith('..') && !isAbsolute(child) && child.startsWith('windows-agent-devkit-dotnet-')) await rm(absolute, { recursive: true, force: true });
      }
    }
  };
}
