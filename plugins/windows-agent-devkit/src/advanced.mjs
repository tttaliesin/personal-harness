import { lstat, open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseToml } from 'smol-toml';
import semver from 'semver';
import { readDeclarationFile } from './project/files.mjs';
import { parseGlobalJson, validateSdkOptions } from './project/global-json.mjs';

// Only the injected, allowlisted query runner executes programs.
// The runner verifies binaries, bounds output, and isolates dotnet --version's CLI home.
// Query semantics checked 2026-11-17 against primary documentation:
// https://mise.jdx.dev/configuration/environment-variables.html (current mise; older options may be unsupported)
// https://learn.microsoft.com/dotnet/core/tools/global-json (.NET CLI SDK selection, not runtime selection)
// https://git-scm.com/docs/git-ls-files and https://github.com/microsoft/vswhere/wiki/Find-VC
// https://learn.microsoft.com/windows-server/administration/windows-commands/fsutil-devdrv (query only)
const COLLECTOR = fileURLToPath(new URL('../scripts/collect-advanced.ps1', import.meta.url));
const LIMIT = 256 * 1024;
const LANGUAGES = { node: 'node', python: 'python', go: 'go', rust: 'rustc', zig: 'zig', dotnet: 'dotnet' };
const TOOL_NAMES = { node: 'node', nodejs: 'node', python: 'python', go: 'go', golang: 'go', rust: 'rust', rustc: 'rust', zig: 'zig', dotnet: 'dotnet', task: 'task', just: 'just', make: 'make' };
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const ROOTS = ['PATH', 'PATHEXT', 'SystemRoot', 'WINDIR', 'SystemDrive', 'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'MISE_DATA_DIR', 'MISE_CONFIG_DIR', 'MISE_CACHE_DIR', 'MISE_STATE_DIR', 'MISE_TMP_DIR', 'MISE_INSTALLS_DIR', 'MISE_INSTALL_STORE_DIR', 'MISE_PLUGINS_DIR', 'MISE_SYSTEM_DATA_DIR', 'MISE_SYSTEM_CONFIG_DIR', 'MISE_SYSTEM_DIR', 'MISE_SYSTEM_CONFIG_FILE', 'MISE_GLOBAL_CONFIG_FILE', 'MISE_CONFIG_FILE', 'MISE_ENV', 'MISE_NODE_VERSION', 'MISE_PYTHON_VERSION', 'MISE_GO_VERSION', 'MISE_RUST_VERSION', 'MISE_ZIG_VERSION', 'MISE_DOTNET_VERSION', 'DOTNET_ROOT', 'DOTNET_ROOT_X64', 'DOTNET_ROOT_X86', 'DOTNET_ROOT_ARM64', 'DOTNET_ROOT(x86)', 'DOTNET_MULTILEVEL_LOOKUP', 'RUSTUP_HOME', 'CARGO_HOME', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GH_CONFIG_DIR', 'VSCODE_PORTABLE'];
const DOTNET_ENV = { DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1', DOTNET_GENERATE_ASPNET_CERTIFICATE: '0', DOTNET_ADD_GLOBAL_TOOLS_TO_PATH: '0', DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: 'true', DOTNET_SKIP_WORKLOAD_INTEGRITY_CHECK: '1', DOTNET_SDK_VULNERABILITY_CHECK_DISABLE: 'true', DOTNET_CLI_UI_LANGUAGE: 'en-US' };
const GIT_ENV = { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_NO_LAZY_FETCH: '1', GIT_LFS_SKIP_SMUDGE: '1', GIT_CONFIG_COUNT: '0' };
const MISE_ENV = { MISE_OFFLINE: '1', MISE_AUTO_INSTALL: '0', MISE_NO_HOOKS: '1', MISE_NO_ENV: '1', MISE_YES: '0' };

function text(value) {
  if (!Buffer.isBuffer(value)) return typeof value === 'string' ? value.replace(/^\uFEFF/, '') : '';
  if (value[0] === 0xfe && value[1] === 0xff) return Buffer.from(value.subarray(2, value.length - value.length % 2)).swap16().toString('utf16le');
  const sample = value.subarray(0, 256);
  let oddZeros = 0;
  for (let i = 1; i < sample.length; i += 2) if (sample[i] === 0) oddZeros++;
  return value.toString(value[0] === 0xff && value[1] === 0xfe || oddZeros > sample.length / 8 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
}
function absolute(value) { return typeof value === 'string' && value.length <= 32767 && !/[\x00-\x1f]|:\/\//.test(value) && (/^[A-Za-z]:[\\/]|^\\\\[^\\/]+[\\/][^\\/]+/.test(value) || process.platform !== 'win32' && path.isAbsolute(value)); }
function local(value) { return absolute(value) && !/^(?:\\\\|\/\/)/.test(value); }
function key(value) { return typeof value === 'string' ? (/^[a-z]:|\\/i.test(value) ? path.win32.normalize(value).toLowerCase() : path.normalize(value)).replace(/[\\/]+$/, '') : null; }
function pathsFor(value) { return /^[a-z]:|\\/i.test(value) ? path.win32 : path; }
function envRoots(environment) {
  const env = {};
  for (const name of ROOTS) {
    const found = Object.keys(environment).find((item) => item.toLowerCase() === name.toLowerCase());
    if (found && typeof environment[found] === 'string') env[name] = environment[found];
  }
  return env;
}
function command(host, name) { return host.commands?.[name]?.[0]; }
function probedPath(host, name) { const p = host.probes?.[name]; return ['succeeded', 'failed', 'timed_out'].includes(p?.state) ? p.executable : null; }
function actualPath(host, name) { return probedPath(host, name) ?? command(host, name)?.resolvedPath ?? command(host, name)?.path ?? null; }
function unresolvedWrapper(host, name) {
  const candidate = command(host, name);
  return !probedPath(host, name) && !candidate?.resolvedPath && (/[\\/](?:shims?|WindowsApps)[\\/]|\.(?:cmd|bat|ps1)$/i.test(candidate?.path ?? '') || name === 'rustc' && /[\\/]\.cargo[\\/]bin[\\/]/i.test(candidate?.path ?? ''));
}
function evidence(query) {
  return { state: query?.state ?? 'not_run', executable: absolute(query?.executable) ? query.executable : null, exitCode: Number.isInteger(query?.exitCode) ? query.exitCode : null };
}
function result(checkId, status, reason, message, extra = {}) {
  return { checkId, status, reason, message, applicability: 'required', resolution: 'unknown', execution: 'not_run', compatibility: status === 'pass' ? 'satisfied' : 'unknown', support: { status: 'unknown', source: null, checkedOn: null }, recommendation: { status: 'unknown' }, observed: {}, nextAction: status === 'pass' ? '실제 빌드·원격 인증·공식 지원 상태는 해당 작업에서 따로 확인합니다.' : '기록된 근거와 조회 제한을 해당 실행 문맥에서 확인합니다.', ...extra };
}
function skip(id, message) { return result(id, 'skipped', 'not_applicable', message, { applicability: 'not_required', compatibility: 'not_applicable' }); }
function failed(id, q, observed = {}, reason) {
  return result(id, 'unknown', reason ?? (q?.state === 'timed_out' ? 'query_timed_out' : q?.state === 'not_found' ? 'query_tool_absent' : q?.state === 'not_run' ? 'query_unsupported' : 'query_failed'), '읽기 전용 조회를 완료하지 못했습니다.', { observed, execution: ['succeeded', 'failed', 'timed_out'].includes(q?.state) ? q.state : 'not_run', resolution: q?.state === 'not_found' ? 'not_resolved' : absolute(q?.executable) ? 'resolved' : 'unknown' });
}
function successful(q) { return q?.state === 'succeeded' && (q.exitCode === 0 || q.exitCode == null); }
function json(q) { try { return JSON.parse(text(q.stdout)); } catch { return undefined; } }
function dynamic(value) {
  if (typeof value === 'string') return /\{\{|\{%/.test(value);
  return value && typeof value === 'object' && Object.values(value).some(dynamic);
}
async function read(file) {
  let handle;
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) return { state: 'unsupported_file' };
    if (info.size > LIMIT) return { state: 'file_too_large' };
    handle = await open(file, 'r');
    const buffer = Buffer.alloc(LIMIT + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return bytesRead > LIMIT ? { state: 'file_too_large' } : { state: 'read', text: buffer.subarray(0, bytesRead).toString('utf8').replace(/^\uFEFF/, '') };
  } catch (error) { return { state: ['ENOENT', 'ENOTDIR'].includes(error.code) ? 'absent' : 'unreadable' }; }
  finally { await handle?.close(); }
}
function ancestors(directory) {
  const api = pathsFor(directory), items = [];
  for (let cursor = directory; items.length < 128; cursor = api.dirname(cursor)) {
    items.push(cursor);
    if (api.dirname(cursor) === cursor) break;
  }
  return items;
}
async function entries(directory) {
  try { return { state: 'read', names: await readdir(directory) }; }
  catch (error) { return { state: ['ENOENT', 'ENOTDIR'].includes(error.code) ? 'absent' : 'unreadable', names: [] }; }
}

async function miseSafety(root, env, metadata = {}) {
  const files = new Set(), directories = new Set(), issues = [];
  if (metadata.unsafeDynamicConfig) issues.push('unsafe_dynamic_config');
  const add = (base, name) => { if (absolute(base)) files.add(pathsFor(base).join(base, name)); };
  for (const directory of ancestors(root)) {
    for (const name of ['mise.toml', '.mise.toml', 'mise.local.toml', '.mise.local.toml', '.tool-versions', '.miserc.toml']) add(directory, name);
    for (const folder of ['.mise', '.config/mise']) {
      const nested = pathsFor(directory).join(directory, folder);
      directories.add(nested);
      const listing = await entries(nested);
      if (listing.state === 'unreadable') issues.push('config_directory_unreadable');
      for (const name of listing.names) if (/\.toml$/i.test(name)) add(nested, name);
    }
    const listing = await entries(directory);
    if (listing.state === 'unreadable') issues.push('config_directory_unreadable');
    for (const name of listing.names) if (/^\.?mise\..*\.toml$/i.test(name)) add(directory, name);
  }
  for (const base of [env.HOME, env.USERPROFILE]) {
    add(base, '.tool-versions'); add(base, '.miserc.toml'); add(base, '.config/mise/config.toml');
    if (absolute(base)) directories.add(pathsFor(base).join(base, '.config/mise'));
  }
  if (absolute(env.XDG_CONFIG_HOME)) directories.add(pathsFor(env.XDG_CONFIG_HOME).join(env.XDG_CONFIG_HOME, 'mise'));
  for (const base of [env.MISE_CONFIG_DIR, env.MISE_SYSTEM_CONFIG_DIR, env.MISE_SYSTEM_DIR]) if (absolute(base)) directories.add(base);
  directories.add(pathsFor(root).join(pathsFor(root).parse(root).root, 'etc', 'mise'));
  for (const directory of directories) {
    add(directory, 'config.toml'); add(directory, 'miserc.toml');
    const listing = await entries(directory);
    if (listing.state === 'unreadable') issues.push('config_directory_unreadable');
    for (const name of listing.names) if (/\.toml$/i.test(name)) add(directory, name);
    const fragments = await entries(pathsFor(directory).join(directory, 'conf.d'));
    if (fragments.state === 'unreadable') issues.push('config_directory_unreadable');
    for (const name of fragments.names) if (/\.toml$/i.test(name)) add(directory, `conf.d/${name}`);
  }
  for (const file of [env.MISE_GLOBAL_CONFIG_FILE, env.MISE_CONFIG_FILE, env.MISE_SYSTEM_CONFIG_FILE, ...(Array.isArray(metadata.configFiles) ? metadata.configFiles : [])]) {
    if (file === undefined) continue;
    if (absolute(file)) files.add(file); else issues.push('config_path_unsupported');
  }
  if (env.MISE_ENV) issues.push('environment_specific_config');
  if (Object.entries(env).some(([name, value]) => /^MISE_(?:NODE|PYTHON|GO|RUST|ZIG|DOTNET)_VERSION$/.test(name) && !/^[\w.+ -]+$/.test(value))) issues.push('unsupported_version_override');
  const declarations = [], found = [];
  for (const file of files) {
    const content = await read(file);
    if (content.state === 'absent') continue;
    found.push({ path: file, state: content.state });
    if (content.state !== 'read') { issues.push(content.state); continue; }
    if (path.basename(file) === '.tool-versions') {
      for (const line of content.text.split(/\r?\n/)) {
        const [name, ...versions] = line.replace(/#.*/, '').trim().split(/\s+/);
        if (!name) continue;
        if (!Object.hasOwn(TOOL_NAMES, name) || !versions.length || versions.some((v) => !/^[\w.+-]+$/.test(v))) issues.push('unsupported_backend_or_version');
        else declarations.push({ tool: TOOL_NAMES[name], source: file });
      }
      continue;
    }
    let data;
    try { data = parseToml(content.text); } catch { issues.push('invalid_toml'); continue; }
    if (dynamic(data)) { issues.push('unsafe_dynamic_config'); continue; }
    if (['.miserc.toml', 'miserc.toml'].includes(pathsFor(file).basename(file)) && Object.keys(data).length) { issues.push('config_discovery_override'); continue; }
    if (Object.keys(data).some((name) => !['tools', 'settings', 'min_version', 'tasks'].includes(name))) issues.push('unsafe_dynamic_config');
    if (data.settings && (typeof data.settings !== 'object' || Object.keys(data.settings).some((name) => !['experimental', 'offline', 'auto_install', 'legacy_version_file', 'idiomatic_version_file_enable_tools', 'not_found_auto_install'].includes(name)))) issues.push('unsupported_settings');
    if (data.tools !== undefined && (!data.tools || typeof data.tools !== 'object' || Array.isArray(data.tools))) { issues.push('unsupported_tool_table'); continue; }
    for (const [name, values] of Object.entries(data.tools ?? {})) {
      if (!Object.hasOwn(TOOL_NAMES, name)) { issues.push('unsupported_backend'); continue; }
      const versions = Array.isArray(values) ? values : [values];
      if (!versions.length || versions.some((v) => typeof v === 'object' ? !v || Object.keys(v).some((k) => k !== 'version') || !/^[\w.+-]+$/.test(v.version ?? '') : typeof v !== 'string' || !/^[\w.+-]+$/.test(v))) issues.push('unsupported_tool_options');
      declarations.push({ tool: TOOL_NAMES[name], source: file });
    }
  }
  return { files: found, declarations, issues: [...new Set(issues)] };
}

async function toolsCheck(ctx) {
  const { project, host, env, ask, root } = ctx;
  const required = Object.entries(LANGUAGES).filter(([name]) => project.requirements?.[name]?.state === 'required');
  const uncertain = Object.values(project.requirements ?? {}).some((r) => r.state === 'unknown');
  if (!required.length && !uncertain) return skip('TOOLS-01', '언어 도구 관리 요구가 없습니다.');
  if (!required.length) return result('TOOLS-01', 'unknown', 'requirement_unknown', '도구 관리 요구를 확정할 수 없습니다.', { applicability: 'unknown' });
  if (required.length === 1 && required[0][0] === 'dotnet' && !uncertain) return { ...skip('TOOLS-01', '.NET SDK는 공식 설치 경로와 global.json으로 별도 점검합니다.'), reason: 'official_sdk_installation_exception', observed: { dotnetPolicy: 'official_sdk_installation_exception' }, recommendation: { status: 'aligned', expected: 'official .NET SDK installation' } };
  const safety = await miseSafety(root, env, project.metadata?.mise);
  const observed = { configuration: safety, installed: [], selections: [], dotnetPolicy: 'official_sdk_installation_exception', activation: 'not_evaluated' };
  if (safety.issues.length) return failed('TOOLS-01', null, observed, safety.issues.includes('unsafe_dynamic_config') ? 'unsafe_dynamic_config' : 'unsupported_mise_configuration');
  const version = await ask('mise', ['--version'], MISE_ENV);
  observed.versionQuery = evidence(version);
  if (!successful(version)) {
    if (version.state === 'not_found') return result('TOOLS-01', 'warn', 'mise_not_resolved', '현재 PATH에서 mise를 찾지 못했습니다.', { resolution: 'not_resolved', observed, recommendation: { status: 'different', expected: 'mise', exception: '.NET SDK는 공식 설치 경로를 유지합니다.' } });
    return failed('TOOLS-01', version, observed);
  }
  observed.version = /^(?:mise )?(\d+\.\d+\.\d+)(?:\s|$)/.exec(text(version.stdout).trim())?.[1] ?? null;
  if (!observed.version) return failed('TOOLS-01', version, observed, 'unsupported_version_output');
  const installed = await ask('mise', ['ls', '--installed', '--json'], MISE_ENV);
  observed.inventoryQuery = evidence(installed);
  if (!successful(installed)) return failed('TOOLS-01', installed, observed);
  const data = json(installed);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return failed('TOOLS-01', installed, observed, 'unsupported_inventory_output');
  for (const [name, versions] of Object.entries(data)) {
    if (!Object.hasOwn(TOOL_NAMES, name)) continue;
    if (!Array.isArray(versions)) return failed('TOOLS-01', installed, observed, 'unsupported_inventory_output');
    for (const item of versions) {
      if (!VERSION.test(item?.version ?? '') || !absolute(item.install_path ?? item.path)) return failed('TOOLS-01', installed, observed, 'unsupported_inventory_output');
      observed.installed.push({ tool: TOOL_NAMES[name], version: item.version, path: item.install_path ?? item.path, active: item.active === true });
    }
  }
  let missing = false, different = false, unknown = uncertain;
  for (const [language, binary] of required) {
    if (language === 'dotnet') continue;
    const selected = await ask('mise', ['which', binary], MISE_ENV);
    const selectedPath = text(selected.stdout).trim();
    const current = actualPath(host, binary);
    const item = { tool: language, query: evidence(selected), selectedPath: successful(selected) && absolute(selectedPath) ? selectedPath : null, pathResolution: absolute(current) ? current : null, comparison: 'unknown' };
    if (item.selectedPath && item.pathResolution) {
      const shim = unresolvedWrapper(host, binary);
      if (!shim) { item.comparison = key(current) === key(selectedPath) ? 'same' : 'different'; different ||= item.comparison === 'different'; }
      else unknown = true;
    } else if (!successful(selected) && !observed.installed.some((i) => i.tool === language) && safety.declarations.some((i) => i.tool === language) && selected.state === 'failed' && /not installed|not found|no version/i.test(text(selected.stderr) + text(selected.stdout))) { item.comparison = 'missing'; missing = true; }
    else unknown = true;
    observed.selections.push(item);
  }
  return result('TOOLS-01', missing ? 'fail' : different ? 'warn' : unknown ? 'unknown' : 'pass', missing ? 'managed_tool_missing' : different ? 'path_selection_differs' : unknown ? 'selection_not_verified' : 'tool_selection_observed', 'mise의 설치 목록과 현재 PATH의 실제 도구 선택을 대조했습니다.', { observed, resolution: 'resolved', execution: 'succeeded', compatibility: missing || different ? 'violated' : unknown ? 'unknown' : 'satisfied', recommendation: { status: 'aligned', expected: 'mise', exception: '.NET SDK는 공식 설치 경로를 유지합니다.' } });
}

async function globalJson(root, fallback) {
  const physicalRoot = await realpath(root).catch(() => undefined);
  // The native SDK resolver can see ancestors outside the static analysis boundary.
  for (const directory of ancestors(root)) {
    const file = pathsFor(directory).join(directory, 'global.json');
    const content = await readDeclarationFile(file, { anchor: directory, physicalAnchor: directory === root ? physicalRoot : undefined });
    if (content.state === 'absent') continue;
    const location = { path: file, ancestor: key(directory) !== key(root) };
    if (content.state !== 'read') return { state: content.state, ...location };
    try {
      return { state: 'read', ...location, sdk: parseGlobalJson(content.text) ?? {} };
    } catch { return { state: 'unsupported_json_or_sdk_options', ...location }; }
  }
  try { return { state: 'absent', path: null, ancestor: false, sdk: validateSdkOptions(fallback) }; }
  catch { return { state: 'unsupported_json_or_sdk_options', path: null, ancestor: false }; }
}
function sdkCandidate(sdks, options) {
  const requested = options.version ? semver.parse(options.version) : null;
  const policy = options.rollForward ?? (requested ? 'patch' : 'latestMajor');
  let candidates = sdks.map((i) => i.version).filter((v) => semver.valid(v) && (options.allowPrerelease !== false || !semver.prerelease(v)));
  if (requested) candidates = candidates.filter((v) => {
    const candidate = semver.parse(v), band = Math.floor(candidate.patch / 100), requestedBand = Math.floor(requested.patch / 100);
    if (policy === 'disable') return v === options.version;
    if (semver.lt(v, options.version)) return false;
    if (['patch', 'latestPatch'].includes(policy)) return candidate.major === requested.major && candidate.minor === requested.minor && band === requestedBand;
    if (['feature', 'latestFeature'].includes(policy)) return candidate.major === requested.major && candidate.minor === requested.minor;
    if (['minor', 'latestMinor'].includes(policy)) return candidate.major === requested.major;
    return true;
  });
  candidates.sort(semver.compare);
  if (policy === 'patch' && candidates.includes(options.version)) return options.version;
  if (['feature', 'minor', 'major'].includes(policy) && candidates.length) {
    const first = semver.parse(candidates[0]);
    candidates = candidates.filter((v) => { const s = semver.parse(v); return s.major === first.major && s.minor === first.minor && Math.floor(s.patch / 100) === Math.floor(first.patch / 100); });
  }
  return candidates.at(-1) ?? null;
}
function dotnetList(q, runtime) {
  if (!successful(q)) return null;
  const rows = text(q.stdout).trim();
  if (!rows) return [];
  const result = [];
  for (const line of rows.split(/\r?\n/)) {
    const match = (runtime ? /^([\w.]+) (\S+) \[(.+)\]$/ : /^(\S+) \[(.+)\]$/).exec(line.trim());
    if (!match || !VERSION.test(match[runtime ? 2 : 1]) || !absolute(match.at(-1))) return null;
    result.push(runtime ? { name: match[1], version: match[2], path: match[3] } : { version: match[1], path: match[2] });
  }
  return result;
}
async function dotnetCheck({ root, project, host, env, ask }) {
  const requirement = project.requirements?.dotnet;
  if (!requirement || requirement.state === 'not_required') return skip('DOTNET-01', 'C# SDK 요구가 없습니다.');
  const declaration = await globalJson(root, requirement.metadata?.sdk);
  const observed = { globalJson: declaration, architecture: host.context?.processArchitecture ?? null, roots: Object.fromEntries(Object.entries(env).filter(([name]) => /^DOTNET_ROOT/.test(name))), targetFrameworks: (requirement.metadata?.targetFrameworks ?? []).filter((v) => typeof v === 'string' && /^net[\w.+-]+$/.test(v)), sdkSelection: { state: 'not_run' }, selectedSdk: null };
  const sdkQuery = await ask('dotnet', ['--list-sdks'], DOTNET_ENV);
  const runtimeQuery = await ask('dotnet', ['--list-runtimes'], DOTNET_ENV);
  observed.sdkQuery = evidence(sdkQuery); observed.runtimeQuery = evidence(runtimeQuery);
  observed.sdks = dotnetList(sdkQuery, false); observed.runtimes = dotnetList(runtimeQuery, true);
  if (requirement.state === 'unknown') return { ...failed('DOTNET-01', sdkQuery, observed, 'requirement_unknown'), applicability: 'unknown' };
  if (sdkQuery.state === 'not_found') return result('DOTNET-01', 'fail', 'sdk_command_not_resolved', 'C# SDK 요구가 있으나 현재 PATH에서 dotnet 명령을 찾지 못했습니다.', { observed, resolution: 'not_resolved', compatibility: 'violated' });
  if (observed.sdks === null) return failed('DOTNET-01', sdkQuery, observed, successful(sdkQuery) ? 'unsupported_sdk_inventory' : undefined);
  if (!['read', 'absent'].includes(declaration.state)) return failed('DOTNET-01', sdkQuery, observed, declaration.state);
  if (declaration.sdk.paths?.length === 0 || declaration.sdk.paths?.some((p) => p !== '$host$')) {
    return failed('DOTNET-01', sdkQuery, observed, 'sdk_paths_require_verified_selection');
  }
  if (!observed.sdks.length) return result('DOTNET-01', 'fail', 'sdk_absent', '공유 런타임 목록과 별도로 SDK 설치 목록이 비어 있습니다.', { observed, resolution: 'resolved', execution: 'succeeded', compatibility: 'violated' });
  const expected = sdkCandidate(observed.sdks, declaration.sdk);
  observed.candidateSdk = expected ?? null;
  if (host.capabilities?.dotnetSdkSelection !== false) {
    // The parent runner provides temporary DOTNET_CLI_HOME and clears startup hooks.
    // DOTNET_SKIP_FIRST_TIME_EXPERIENCE is obsolete and is deliberately not used.
    const selected = await ask('dotnet', ['--version'], DOTNET_ENV);
    observed.sdkSelection = evidence(selected);
    const version = text(selected.stdout).trim();
    if (successful(selected) && VERSION.test(version)) observed.selectedSdk = version;
    else if (successful(selected)) return failed('DOTNET-01', selected, observed, 'unsupported_selected_sdk_output');
  }
  if (!expected || (observed.selectedSdk && observed.selectedSdk !== expected)) return result('DOTNET-01', 'fail', !expected ? 'sdk_requirement_unavailable' : 'sdk_selection_mismatch', 'SDK 목록 또는 실제 SDK 선택이 global.json 정책과 일치하지 않습니다.', { observed, resolution: 'resolved', execution: 'succeeded', compatibility: 'violated' });
  if (observed.runtimes === null || !observed.selectedSdk) return failed('DOTNET-01', { state: observed.sdkSelection.state, executable: sdkQuery.executable }, observed, observed.runtimes === null ? 'runtime_inventory_unverified' : 'sdk_selection_unverified');
  return result('DOTNET-01', 'pass', 'sdk_selection_satisfied', '프로젝트 작업 경로에서 실제 선택된 SDK가 global.json 정책을 충족합니다.', { observed, resolution: 'resolved', execution: 'succeeded', nextAction: '대상 프레임워크의 참조 팩과 실제 빌드·런타임 실행은 별도로 확인합니다.' });
}

function helpers(output) {
  const allowed = new Set(['manager', 'manager-core', 'wincred', 'cache', 'store', 'osxkeychain', 'libsecret']);
  const lines = text(output).split(/\r?\n|\0/), names = [];
  if (lines.at(-1) === '') lines.pop();
  for (const line of lines) {
    const value = line.trim();
    if (!value) { names.length = 0; continue; }
    if (value.startsWith('!')) { names.push('custom_redacted'); continue; }
    const bare = value.split(/\s/, 1)[0];
    if (allowed.has(bare)) { names.push(bare); continue; }
    const match = /^(?:"[^"]*[\\/]|[^\s]*[\\/])git-credential-(manager(?:-core)?|wincred|cache|store|osxkeychain|libsecret)(?:\.exe)?"?$/.exec(value);
    names.push(match && allowed.has(match[1]) ? match[1] : 'custom_redacted');
  }
  return [...new Set(names)];
}
async function gitChecks({ root, project, ask }) {
  if (project.metadata?.git?.required === false) return [skip('GIT-01', 'Git 작업 요구가 없습니다.'), skip('GIT-02', 'Git 저장소 정책 검토 요구가 없습니다.')];
  const version = await ask('git', ['--version'], GIT_ENV);
  const observed = { versionQuery: evidence(version), version: /^git version ([\w.+-]+)/.exec(text(version.stdout).trim())?.[1] ?? null, authentication: { state: 'not_run' } };
  if (!successful(version)) return [failed('GIT-01', version, observed), failed('GIT-02', version, {}, 'repository_unverified')];
  if (!observed.version || !/^\d+\.\d+/.test(observed.version)) return [failed('GIT-01', version, observed, 'unsupported_version_output'), failed('GIT-02', version, {}, 'repository_unverified')];
  const repository = await ask('git', ['rev-parse', '--show-toplevel'], GIT_ENV);
  observed.repositoryQuery = evidence(repository);
  const repositoryRoot = text(repository.stdout).trim();
  if (!successful(repository) || !absolute(repositoryRoot)) {
    const absent = /not a git repository/i.test(text(repository.stderr) + text(repository.stdout));
    return [absent ? result('GIT-01', 'fail', 'not_repository', '지정한 작업 경로가 Git 저장소에 속하지 않습니다.', { observed, resolution: 'resolved', execution: 'failed', compatibility: 'violated' }) : failed('GIT-01', repository, observed), failed('GIT-02', repository, {}, 'repository_unverified')];
  }
  observed.repositoryRoot = repositoryRoot;
  const helper = await ask('git', ['config', '--get-all', 'credential.helper'], GIT_ENV);
  observed.helperQuery = evidence(helper);
  observed.credentialHelpers = successful(helper) ? helpers(helper.stdout) : [];
  observed.helperState = successful(helper) ? 'read' : helper.exitCode === 1 && !text(helper.stdout).trim() && !text(helper.stderr).trim() ? 'absent' : 'unknown';
  const local = observed.helperState === 'unknown' ? failed('GIT-01', helper, observed, 'helper_metadata_unreadable') : result('GIT-01', 'pass', 'local_repository_accessible', 'Git 실행과 로컬 저장소 접근을 확인했습니다.', { observed, resolution: 'resolved', execution: 'succeeded', nextAction: 'push 가능 여부와 원격 인증은 명시한 원격 작업에서 따로 확인합니다.' });
  const eol = await ask('git', ['-c', 'core.fsmonitor=false', 'ls-files', '--eol', '-z'], GIT_ENV, repositoryRoot);
  return [local, await gitPolicy(repositoryRoot, eol)];
}

function glob(pattern, filename) {
  if (pattern.length > 512 || /[\\!]/.test(pattern)) return null;
  let expression = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') { i++; if (pattern[i + 1] === '/') { i++; expression += '(?:.*/)?'; } else expression += '.*'; }
      else expression += '[^/]*';
    } else if (c === '?') expression += '[^/]';
    else if (c === '{') {
      const end = pattern.indexOf('}', i), alternatives = pattern.slice(i + 1, end).split(',');
      if (end < 0 || !alternatives.every((v) => /^[\w.-]+$/.test(v))) return null;
      expression += `(?:${alternatives.map((v) => v.replace(/\./g, '\\.')).join('|')})`; i = end;
    } else if (c === '[') return null;
    else expression += c.replace(/[.+^$()|}]/g, '\\$&');
  }
  try { return new RegExp(`^${pattern.includes('/') ? '' : '(?:.*/)?'}${expression.replace(/^\//, '')}$`).test(filename); }
  catch { return null; }
}
function editorConfig(contents) {
  const result = { root: false, sections: [], unsupported: false }, knownCharsets = ['utf-8', 'utf-8-bom', 'latin1', 'utf-16be', 'utf-16le'];
  let current;
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^[#;]/.test(line)) continue;
    const section = /^\[(.+)\]$/.exec(line);
    if (section) { current = { pattern: section[1] }; result.sections.push(current); continue; }
    const property = /^([\w_]+)\s*[=:]\s*(.*?)\s*$/.exec(line);
    if (!property) { result.unsupported = true; continue; }
    const name = property[1].toLowerCase(), value = property[2].toLowerCase();
    if (!current && name === 'root') result.root = value === 'true';
    if (current && name === 'end_of_line') { if (!['lf', 'crlf', 'cr', 'unset'].includes(value)) result.unsupported = true; else current.eol = value; }
    if (current && name === 'charset') { if (!knownCharsets.includes(value) && value !== 'unset') result.unsupported = true; else current.charset = value; }
  }
  return result;
}
async function gitPolicy(root, query) {
  const observed = { query: evidence(query), policies: [], trackedFiles: 0, violations: [], conflicts: [], mixedWithoutPolicy: 0, encodingVerification: 'not_run' };
  if (!successful(query)) return failed('GIT-02', query, observed);
  const rows = text(query.stdout).split('\0').filter(Boolean), files = [];
  for (const row of rows) {
    const match = /^i\/(lf|crlf|mixed|none|-text|)\s+w\/(lf|crlf|mixed|none|-text|)\s+attr\/([^\t]*)\t([^\0]+)$/.exec(row);
    if (!match || /[\x00-\x1f]|\\/.test(match[4]) || path.posix.isAbsolute(match[4]) || match[4].split('/').includes('..')) return failed('GIT-02', query, observed, 'unsupported_eol_output');
    files.push({ index: match[1], worktree: match[2], attributes: match[3].trim(), file: match[4] });
  }
  observed.trackedFiles = files.length;
  const api = pathsFor(root), folders = new Set([root]);
  for (const entry of files) {
    let directory = api.dirname(api.join(root, entry.file));
    while (key(directory) !== key(root) && directory !== api.dirname(directory)) { folders.add(directory); directory = api.dirname(directory); }
  }
  if (folders.size > 512) return failed('GIT-02', query, observed, 'policy_scope_limit');
  const configs = new Map();
  let unsupported = false;
  for (const directory of folders) {
    for (const name of ['.gitattributes', '.editorconfig']) {
      const file = api.join(directory, name), content = await read(file);
      if (content.state === 'absent') continue;
      observed.policies.push({ path: file, state: content.state, kind: name });
      if (content.state !== 'read') { unsupported = true; continue; }
      if (name === '.editorconfig') {
        const config = editorConfig(content.text); configs.set(key(directory), config); unsupported ||= config.unsupported;
        Object.assign(observed.policies.at(-1), { root: config.root, sections: config.sections.length, endOfLine: [...new Set(config.sections.map((s) => s.eol).filter(Boolean))], charsets: [...new Set(config.sections.map((s) => s.charset).filter(Boolean))] });
      }
    }
  }
  // EditorConfig may govern the repository from an ancestor directory.
  if (!configs.get(key(root))?.root) {
    for (const directory of ancestors(root).slice(1)) {
      const file = api.join(directory, '.editorconfig'), content = await read(file);
      if (content.state === 'absent') continue;
      observed.policies.push({ path: file, state: content.state, kind: '.editorconfig' });
      if (content.state !== 'read') { unsupported = true; break; }
      const config = editorConfig(content.text); configs.set(key(directory), config); unsupported ||= config.unsupported;
      Object.assign(observed.policies.at(-1), { root: config.root, sections: config.sections.length, endOfLine: [...new Set(config.sections.map((s) => s.eol).filter(Boolean))], charsets: [...new Set(config.sections.map((s) => s.charset).filter(Boolean))] });
      if (config.root) break;
    }
  }
  for (const entry of files) {
    if (entry.index === '-text' || entry.worktree === '-text' || /(?:^|\s)-text(?:\s|$)/.test(entry.attributes)) continue;
    const filename = api.join(root, entry.file), chain = [];
    for (const directory of ancestors(api.dirname(filename))) { const config = configs.get(key(directory)); if (config) { chain.push({ directory, config }); if (config.root) break; } }
    let editorEol;
    for (const { directory, config } of chain.reverse()) for (const section of config.sections) {
      const match = glob(section.pattern, api.relative(directory, filename).replace(/\\/g, '/'));
      if (match === null) { unsupported = true; continue; }
      if (match && section.eol) editorEol = section.eol === 'unset' ? undefined : section.eol;
    }
    const gitEol = /(?:^|\s)eol=(lf|crlf)(?:\s|$)/.exec(entry.attributes)?.[1];
    if (gitEol && editorEol && gitEol !== editorEol) observed.conflicts.push({ file: entry.file, git: gitEol, editorconfig: editorEol });
    const expected = gitEol ?? editorEol;
    if ((expected && !['none', ''].includes(entry.worktree) && entry.worktree !== expected) || (/(?:^|\s)text(?:=auto)?(?:\s|$)/.test(entry.attributes) && ['crlf', 'mixed'].includes(entry.index))) observed.violations.push({ file: entry.file, index: entry.index, worktree: entry.worktree, expected: expected ?? 'normalized_index_lf' });
    else if (!expected && entry.worktree === 'mixed') observed.mixedWithoutPolicy++;
  }
  return result('GIT-02', observed.violations.length ? 'fail' : observed.conflicts.length || observed.mixedWithoutPolicy ? 'warn' : unsupported ? 'unknown' : 'pass', observed.violations.length ? 'line_ending_policy_violated' : observed.conflicts.length ? 'conflicting_line_ending_policy' : observed.mixedWithoutPolicy ? 'mixed_line_endings' : unsupported ? 'policy_not_fully_supported' : 'tracked_line_endings_observed', '저장소의 줄바꿈 정책과 추적 파일의 인덱스·작업 트리 줄바꿈을 대조했습니다.', { observed, resolution: 'resolved', execution: 'succeeded', compatibility: observed.violations.length ? 'violated' : unsupported || observed.conflicts.length ? 'unknown' : 'satisfied', nextAction: '저장소 정책을 기준으로 차이를 검토합니다. 전역 Git 설정 변경과 자동 정규화는 수행하지 않았습니다.' });
}

async function fileState(file) {
  try { const info = await lstat(file); return info.isFile() && !info.isSymbolicLink() ? 'present' : 'unsupported'; }
  catch (error) { return ['ENOENT', 'ENOTDIR'].includes(error.code) ? 'absent' : 'unreadable'; }
}
async function ideCheck({ root, project, host, env, ask }) {
  const native = project.metadata?.nativeBuild ?? {}, requested = project.metadata?.ide?.required === true;
  const observed = { vscode: [], onPath: absolute(actualPath(host, 'code')) ? actualPath(host, 'code') : null, msvc: [], windowsSdks: [], developerShellRequired: !command(host, 'cl') };
  const roots = new Set((host.ide?.vscodeRoots ?? []).filter(local));
  for (const base of [env.ProgramFiles, env['ProgramFiles(x86)']]) if (local(base)) for (const name of ['Microsoft VS Code', 'Microsoft VS Code Insiders']) roots.add(pathsFor(base).join(base, name));
  if (local(env.LOCALAPPDATA)) for (const name of ['Microsoft VS Code', 'Microsoft VS Code Insiders']) roots.add(pathsFor(env.LOCALAPPDATA).join(env.LOCALAPPDATA, 'Programs', name));
  if (observed.onPath) { const api = pathsFor(observed.onPath); roots.add(api.basename(api.dirname(observed.onPath)).toLowerCase() === 'bin' ? api.dirname(api.dirname(observed.onPath)) : api.dirname(observed.onPath)); }
  for (const installation of roots) {
    const content = await read(pathsFor(installation).join(installation, 'resources', 'app', 'package.json'));
    if (content.state !== 'read') continue;
    try { const data = JSON.parse(content.text); if (VERSION.test(data.version ?? '')) observed.vscode.push({ path: installation, version: data.version, source: 'installation_metadata' }); } catch { /* No executable is launched to repair metadata. */ }
  }
  const code = command(host, 'code');
  if (!observed.vscode.length && code && absolute(code.path) && /^\d+\.\d+/.test(code.productVersion ?? code.fileVersion ?? '')) observed.vscode.push({ path: code.path, version: /\d+\.\d+\.\d+/.exec(code.productVersion ?? code.fileVersion)?.[0] ?? null, source: 'file_version_metadata' });
  if (!requested && !native.msvc && !native.windowsSdk && !observed.vscode.length && !observed.onPath) return skip('IDE-01', '편집기 또는 네이티브 빌드 검토 요구가 없습니다.');
  let discoveryUnknown = false, missingMsvc = false, missingSdk = false;
  if ((native.msvc || native.windowsSdk) && host.context?.processArchitecture && host.context.processArchitecture !== 'x64') return failed('IDE-01', null, observed, 'unsupported_native_architecture');
  if (native.msvc) {
    const found = await ask('vswhere', ['-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-format', 'json', '-utf8']);
    observed.vswhere = evidence(found);
    const instances = json(found);
    let msvcUnknown = false;
    if (!successful(found) || !Array.isArray(instances)) msvcUnknown = true;
    else for (const instance of instances) {
      if (!local(instance.installationPath)) { msvcUnknown = true; continue; }
      if (instance.isComplete === false || instance.isLaunchable === false) continue;
      const api = pathsFor(instance.installationPath), directory = api.join(instance.installationPath, 'VC', 'Tools', 'MSVC'), versions = await entries(directory);
      if (versions.state === 'unreadable') msvcUnknown = true;
      for (const version of versions.names.filter((v) => /^\d+\.\d+\.\d+$/.test(v))) {
        const compiler = api.join(directory, version, 'bin', 'Hostx64', 'x64', 'cl.exe');
        const state = await fileState(compiler);
        if (state === 'present') observed.msvc.push({ installationPath: instance.installationPath, version, compiler, architecture: 'x64' });
        else if (state !== 'absent') msvcUnknown = true;
      }
    }
    missingMsvc = !msvcUnknown && !observed.msvc.length;
    discoveryUnknown ||= msvcUnknown;
  }
  if (native.windowsSdk || native.msvc) {
    const sdkRoots = new Set((host.ide?.windowsSdkRoots ?? []).filter(local));
    for (const base of [env['ProgramFiles(x86)'], env.ProgramFiles]) if (local(base)) sdkRoots.add(pathsFor(base).join(base, 'Windows Kits', '10'));
    let sdkUnknown = !sdkRoots.size;
    for (const sdkRoot of sdkRoots) {
      const api = pathsFor(sdkRoot), versions = await entries(api.join(sdkRoot, 'Include'));
      if (versions.state === 'unreadable') sdkUnknown = true;
      for (const version of versions.names.filter((v) => /^10\.0\.\d+\.\d+$/.test(v))) {
        const states = await Promise.all([fileState(api.join(sdkRoot, 'Include', version, 'um', 'Windows.h')), fileState(api.join(sdkRoot, 'Lib', version, 'um', 'x64', 'kernel32.lib'))]);
        if (states.every((s) => s === 'present')) observed.windowsSdks.push({ path: sdkRoot, version, architecture: 'x64' });
        else if (states.some((s) => !['present', 'absent'].includes(s))) sdkUnknown = true;
      }
    }
    missingSdk = !sdkUnknown && !observed.windowsSdks.length;
    discoveryUnknown ||= sdkUnknown;
  }
  const missingNative = missingMsvc || missingSdk;
  const missingEditor = requested && !observed.vscode.length, unverifiedEditor = observed.onPath && !observed.vscode.length;
  return result('IDE-01', missingNative ? 'fail' : discoveryUnknown || unverifiedEditor ? 'unknown' : missingEditor ? 'warn' : 'pass', missingNative ? 'native_build_components_missing' : discoveryUnknown ? 'native_metadata_unavailable' : missingEditor || unverifiedEditor ? 'editor_installation_unverified' : 'installation_metadata_observed', '편집기 설치 정보와 요청한 MSVC·Windows SDK의 로컬 파일을 확인했습니다.', { observed, resolution: observed.onPath ? 'resolved' : 'not_resolved', execution: observed.vswhere?.state === 'succeeded' ? 'succeeded' : 'not_run', compatibility: missingNative ? 'violated' : discoveryUnknown || missingEditor || unverifiedEditor ? 'unknown' : 'satisfied', nextAction: 'MSVC 환경 초기화와 실제 컴파일·링크는 해당 빌드 작업에서 확인합니다.' });
}

async function auxiliaryCheck({ project, host, ask }) {
  const requested = project.metadata?.auxiliary ?? {}, observed = { tools: {}, authentication: { state: 'not_run' } };
  let unknown = false, missing = false, different = false;
  for (const name of ['rg', 'gh']) {
    const required = name === 'rg' ? requested.search === true : requested.github === true || requested.authentication === true;
    if (!required && !command(host, name)) continue;
    const q = await ask(name, ['--version']);
    const version = (name === 'rg' ? /^ripgrep ([\d.]+)/ : /^gh version ([\d.]+)/).exec(text(q.stdout).trim())?.[1];
    observed.tools[name] = { ...evidence(q), version: successful(q) && VERSION.test(version ?? '') ? version : null, pathResolution: absolute(actualPath(host, name)) ? actualPath(host, name) : null, required };
    if (successful(q) && absolute(q.executable) && observed.tools[name].pathResolution) {
      const unresolvedShim = unresolvedWrapper(host, name);
      observed.tools[name].comparison = unresolvedShim ? 'shim_target_observed' : key(q.executable) === key(observed.tools[name].pathResolution) ? 'same' : 'different';
      different ||= observed.tools[name].comparison === 'different';
    }
    if (required && q.state === 'not_found') missing = true;
    else if (!successful(q) || !observed.tools[name].version || !absolute(q.executable)) unknown = true;
  }
  const metadata = host.authentication?.github;
  if (metadata && ['authenticated', 'not_authenticated', 'unknown'].includes(metadata.state)) observed.authentication = { state: metadata.state, source: 'metadata', remoteVerification: 'not_run' };
  if (requested.authentication === true && observed.tools.gh?.version) {
    const auth = await ask('gh', ['auth', 'status', '--active', '--hostname', 'github.com']);
    observed.authentication = { ...evidence(auth), state: successful(auth) ? 'authenticated' : 'unknown', source: 'explicit_query' };
    unknown ||= !successful(auth);
  }
  if (!Object.keys(observed.tools).length) return skip('AUX-01', '검색·GitHub 도구 검토 요구가 없습니다.');
  return result('AUX-01', missing ? 'fail' : unknown ? 'unknown' : different ? 'warn' : 'pass', missing ? 'required_auxiliary_not_resolved' : unknown ? 'auxiliary_query_unverified' : different ? 'auxiliary_path_differs' : 'auxiliary_local_queries_succeeded', '필요한 검색·GitHub CLI의 로컬 버전과 실제 실행 경로를 확인했습니다.', { observed, resolution: missing ? 'not_resolved' : unknown ? 'unknown' : 'resolved', execution: Object.values(observed.tools).some((v) => v.state === 'succeeded') ? 'succeeded' : 'not_run', compatibility: missing ? 'violated' : unknown || different ? 'unknown' : 'satisfied' });
}

async function storageCheck({ project, root, ask }) {
  const request = project.metadata?.storage;
  if (request?.requested !== true) return skip('STORE-01', 'Dev Drive 검토를 요청하지 않았습니다.');
  const target = request.path ?? root, observed = { requestedPath: local(target) ? target : null, volume: null, devDrive: null };
  if (!/^[A-Za-z]:[\\/]/.test(target ?? '') || !local(target)) return failed('STORE-01', null, observed, 'storage_path_unsupported');
  const q = await ask('pwsh', ['-NoProfile', '-NonInteractive', '-File', COLLECTOR, '-TargetPath', target]);
  observed.volumeQuery = evidence(q);
  if (!successful(q)) return failed('STORE-01', q, observed);
  const volume = json(q);
  if (!volume || !['NTFS', 'ReFS', 'FAT', 'FAT32', 'exFAT'].includes(volume.fileSystem) || typeof volume.volumePath !== 'string' || !/^(?:[A-Za-z]:\\?|\\\\\?\\Volume\{[0-9a-f-]+\}\\)$/i.test(volume.volumePath)) return failed('STORE-01', q, observed, 'unsupported_volume_metadata');
  observed.volume = { fileSystem: volume.fileSystem, volumePath: volume.volumePath, size: Number.isFinite(volume.size) ? volume.size : null, sizeRemaining: Number.isFinite(volume.sizeRemaining) ? volume.sizeRemaining : null };
  const drive = await ask('fsutil', ['devdrv', 'query', volume.volumePath]);
  observed.devDriveQuery = evidence(drive);
  const output = text(drive.stdout), negative = /\b(?:not a (?:developer volume|dev drive)|is not a dev drive)\b/i.test(output);
  const positive = /\bthis is (?:a |an )?(?:trusted |untrusted )?developer volume\b/i.test(output) && !negative;
  if ((!successful(drive) && !negative) || (!positive && !negative)) return failed('STORE-01', drive, observed, drive.state === 'timed_out' ? 'query_timed_out' : 'dev_drive_query_unverified');
  if (positive && volume.fileSystem !== 'ReFS') return failed('STORE-01', drive, observed, 'inconsistent_dev_drive_metadata');
  observed.devDrive = positive;
  observed.trusted = positive ? /\bthis is a trusted developer volume\b/i.test(output) : null;
  return result('STORE-01', positive ? 'pass' : 'warn', positive ? 'dev_drive_observed' : 'target_not_dev_drive', '요청한 경로의 볼륨과 Dev Drive 지정 여부를 별도로 조회했습니다.', { observed, resolution: 'resolved', execution: 'succeeded', compatibility: 'satisfied', recommendation: { status: positive ? 'aligned' : 'different', expected: 'Dev Drive', performance: 'not_measured' }, nextAction: '볼륨 생성·파일 이동·보안 정책 변경은 별도의 작업으로 검토합니다.' });
}

/**
 * Optional inputs beyond analyzeProject/inspectWindows:
 * project.metadata: mise.{configFiles,unsafeDynamicConfig}, git.required,
 * ide.required, nativeBuild.{msvc,windowsSdk}, auxiliary.{search,github,authentication},
 * storage.{requested,path}; requirements.dotnet.metadata.targetFrameworks.
 * host: environment (allowlisted roots only), capabilities.dotnetSdkSelection (false disables),
 * ide.{vscodeRoots,windowsSdkRoots}, authentication.github.state; commands.vswhere/cl.
 * query must support the fixed argv below; unsupported queries return not_run.
 * Query stdout/stderr, credential helper bodies, config bodies and tokens are never returned.
 */
export async function collectAdvanced({ projectPath, project = {}, host = {}, timeoutMs = 5000, query } = {}) {
  const root = projectPath ?? project.root;
  if (!absolute(root)) throw new TypeError('프로젝트의 절대 경로가 필요합니다.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) throw new TypeError('조회 제한 시간은 양의 정수여야 합니다.');
  const env = envRoots(host.environment ?? process.env);
  async function ask(tool, args, overrides = {}, cwd = root) {
    if (typeof query !== 'function') return { state: 'not_run', exitCode: null, reason: 'query_unsupported' };
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => query(tool, [...args], { cwd, env: { ...env, ...overrides }, execute: false })).then((q) => q && typeof q.state === 'string' ? q : { state: 'failed', reason: 'invalid_query_result' }),
        new Promise((resolve) => { timer = setTimeout(() => resolve({ state: 'timed_out', exitCode: null }), timeoutMs); }),
      ]);
    } catch { return { state: 'failed', exitCode: null, reason: 'query_exception' }; }
    finally { clearTimeout(timer); }
  }
  const ctx = { root, project, host, env, ask };
  const groups = await Promise.all([toolsCheck(ctx), dotnetCheck(ctx), gitChecks(ctx), ideCheck(ctx), auxiliaryCheck(ctx), storageCheck(ctx)]);
  const checks = groups.flat();
  return { checks, observations: Object.fromEntries(checks.map((check) => [check.checkId, check.observed])) };
}
