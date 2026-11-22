import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { parse as parseToml } from 'smol-toml';
import { parseDocument } from 'yaml';
import { existingEntry as exists, inside, MAX_BYTES, MAX_DEPTH, MAX_ENTRIES, MAX_FILES, matches, memberOf, portable, projectFileAccess } from './project/files.mjs';
import { parseGlobalJson } from './project/global-json.mjs';
import { parseJsonObject, stripJsonComments } from './project/json.mjs';
import { analyzeTaskRunner, TASK_RUNNER_FILES, taskRunnerInvocation, taskRunnerTool } from './task-runners.mjs';
import { taskRunnerWorkflowEvidence, taskRunnerWorkflowStep } from './task-runner-ci.mjs';

const LANGUAGES = ['node', 'python', 'go', 'rust', 'zig', 'dotnet'];
const UNKNOWN = Symbol('지원하지 않는 정적 표현');
const has = (object, key) => Object.hasOwn(object, key);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const unique = (values) => [...new Set(values)];

const NODE_LOCKS = {
  'package-lock.json': 'npm', 'npm-shrinkwrap.json': 'npm',
  'pnpm-lock.yaml': 'pnpm', 'yarn.lock': 'yarn', 'bun.lock': 'bun', 'bun.lockb': 'bun',
};
const PYTHON_LOCKS = { 'uv.lock': 'uv', 'poetry.lock': 'poetry', 'Pipfile.lock': 'pipenv' };
const ALIASES = Object.assign(Object.create(null), { node: 'node', nodejs: 'node', python: 'python', go: 'go', golang: 'go', rust: 'rust', zig: 'zig', dotnet: 'dotnet' });
const RUNNER_PINS = new Set(['task', 'just', 'make']);
const MISE_RUNNER_PINS = new Map([['aqua:go-task/task', 'task'], ['aqua:casey/just', 'just']]);
const EXACT = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z.-]+)?$/;
const PARTIAL = /^v?\d+(?:\.\d+){0,2}$/;
const GO_VERSION = /^1\.\d+(?:\.\d+)?(?:(?:rc|beta)\d+)?$/;
const RUST_CHANNEL = /^(?:stable|beta|nightly)(?:-\d{4}-\d{2}-\d{2})?(?:-(?:x86_64|i686|aarch64)-(?:pc-windows-(?:msvc|gnu)|unknown-linux-(?:gnu|musl)|apple-darwin))?$/;

function classifyVersion(value, language, channels = false) {
  if (typeof value !== 'string' || value.length > 160 || value.trim() !== value || !value) return null;
  if (EXACT.test(value)) return 'exact';
  if (PARTIAL.test(value)) return 'range';
  if (channels && (
    (language === 'rust' && RUST_CHANNEL.test(value)) ||
    value === 'latest' ||
    (language === 'node' && /^(?:stable|current|node|lts|lts\/\*|lts\/-\d+)$/.test(value)) ||
    (language === 'node' && /^lts\/(?:argon|boron|carbon|dubnium|erbium|fermium|gallium|hydrogen|iron|jod|krypton)$/.test(value))
  )) return 'channel';
  // Only recognize a small, explicit version grammar; URLs, templates and shell text never enter reports.
  const atom = language === 'python'
    ? '(?:\\d+(?:\\.(?:\\d+|\\*)){0,2}(?:(?:a|b|rc)\\d+)?|\\*)'
    : '(?:v?\\d+(?:\\.(?:\\d+|[xX*])){0,2}(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?|[xX*])';
  const operators = language === 'python' ? '(?:~=|==|!=|>=|<=|>|<|\\^|~|=)?' : '(?:>=|<=|>|<|\\^|~|=)?';
  const term = new RegExp(`^${operators}\\s*${atom}$`);
  const alternatives = value.split('||');
  if (alternatives.every((alternative) => {
    if (new RegExp(`^\\s*${atom}\\s+-\\s+${atom}\\s*$`).test(alternative)) return language !== 'python';
    const terms = alternative.trim().replace(/([><=~^!]+)\s+(?=[v\d*xX])/g, '$1').split(/[\s,]+/);
    return terms.length > 0 && terms.every((part) => term.test(part));
  })) return 'range';
  return null;
}

// The library owns TOML syntax; this adapter only preserves the analyzer's accessor contract.
function tomlDocument(text) {
  const data = parseToml(text, { maxDepth: MAX_DEPTH, integersAsBigInt: 'asNeeded', unsafeKeyBehaviour: 'throw' });
  const get = (...keys) => keys.reduce((value, key) => object(value) && has(value, key) ? value[key] : undefined, data);
  return { get, contains: (...keys) => get(...keys) !== undefined };
}

const staticPath = (value) => typeof value === 'string' && value.length > 0 && value.length <= 240 && value.trim() === value &&
  !/[\x00-\x1f\x7f@$%{}?`|&;<>"']|:\/\//.test(value) && !value.replace(/^[A-Za-z]:[\\/]/, '').includes(':');
const identifier = (value) => typeof value === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);

const devcontainerJson = (text) => stripJsonComments(text).replace(/"(?:\\.|[^"\\])*"|,(\s*[}\]])/g, (match, end) => end ?? match);

const workspaceRoot = (directory) => directory === undefined || directory === '.' || directory === './';
const hostCIShells = new Set([undefined, 'bash', 'sh', 'cmd', 'pwsh', 'powershell']);
const literalCheckout = /^actions\/checkout@[A-Za-z0-9_][A-Za-z0-9_./-]*$/i;

function ciRunSetting(key, step, job, workflow) {
  if (has(step, key)) return step[key];
  for (const { defaults } of [job, workflow]) {
    if (defaults === undefined) continue;
    if (!object(defaults)) return UNKNOWN;
    if (defaults.run === undefined) continue;
    if (!object(defaults.run)) return UNKNOWN;
    if (has(defaults.run, key)) return defaults.run[key];
  }
}

function usesDefaultCheckout(step) {
  if (typeof step?.uses !== 'string' || !/^actions\/checkout@/i.test(step.uses)) return true;
  const inputs = step.with;
  return inputs === undefined || (object(inputs) &&
    (inputs.repository === undefined || inputs.repository === '') && (workspaceRoot(inputs.path) || inputs.path === ''));
}

function recordRunnerPin(pins, tool, versions) {
  const exact = versions.length > 0 && versions.length <= 32 && versions.every((item) => {
    const version = object(item) && Object.keys(item).length === 1 ? item.version : item;
    return typeof version === 'string' && version.length <= 160 && version.trim() === version && EXACT.test(version);
  });
  pins.set(tool, !pins.has(tool) && exact);
}

function yamlDocument(text) {
  const document = parseDocument(text, { merge: true, uniqueKeys: true, stringKeys: true, prettyErrors: false });
  if (document.errors.length || document.warnings.length) throw new Error();
  const data = document.toJS({ maxAliasCount: 64 });
  // Bound expanded graphs as well as input bytes, and reject recursive aliases.
  const ancestors = new Set();
  let count = 0;
  function visit(value, depth) {
    if (++count > MAX_ENTRIES || depth > MAX_DEPTH) throw new Error();
    if (value === null || typeof value !== 'object') return;
    if (ancestors.has(value)) throw new Error();
    ancestors.add(value);
    for (const item of Object.values(value)) visit(item, depth + 1);
    ancestors.delete(value);
  }
  visit(data, 0);
  if (data === null) return {};
  if (!object(data)) throw new Error();
  return data;
}

function description(name) {
  if (name === '.gitattributes' || name === '.editorconfig') return {};
  const runner = taskRunnerTool(name);
  if (runner && runner !== 'npm' && runner !== 'mise') return { parser: 'taskRunner', taskRunner: runner };
  if (name === 'mise-tasks') return { parser: 'miseFileTasks', taskRunner: 'mise' };
  if (name === 'package.json') return { languages: ['node'], parser: 'node', taskRunner: 'npm' };
  if (has(NODE_LOCKS, name)) return { languages: ['node'], manager: NODE_LOCKS[name], lock: true };
  if (name === '.nvmrc' || name === '.node-version') return { languages: ['node'], parser: 'pin' };
  if (name === 'pyproject.toml') return { languages: ['python'], parser: 'python' };
  if (has(PYTHON_LOCKS, name)) return { languages: ['python'], manager: PYTHON_LOCKS[name], lock: true };
  if (/^requirements[^/\\]*\.txt$/i.test(name) || name === 'Pipfile') return { languages: ['python'], manager: name === 'Pipfile' ? 'pipenv' : 'pip' };
  if (name === '.python-version') return { languages: ['python'], parser: 'pin' };
  if (/^environment\.ya?ml$/.test(name)) return { languages: ['python'], manager: 'conda', parser: 'conda' };
  if (name === 'go.mod' || name === 'go.work') return { languages: ['go'], manager: 'go', parser: 'go' };
  if (name === '.go-version') return { languages: ['go'], parser: 'pin' };
  if (name === 'go.sum' || name === 'go.work.sum') return { languages: ['go'], integrity: true };
  if (name === 'Cargo.toml') return { languages: ['rust'], manager: 'cargo', parser: 'cargo' };
  if (name === 'Cargo.lock') return { languages: ['rust'], manager: 'cargo', lock: true };
  if (name === 'rust-toolchain' || name === 'rust-toolchain.toml') return { languages: ['rust'], parser: 'rust' };
  if (name === '.zig-version') return { languages: ['zig'], parser: 'pin' };
  if (name === 'build.zig.zon') return { languages: ['zig'], parser: 'zig' };
  if (name === 'build.zig') return { languages: ['zig'] };
  if (name === 'global.json') return { languages: ['dotnet'], parser: 'dotnet' };
  if (/\.(?:csproj|sln|slnx)$/i.test(name)) return { languages: ['dotnet'], manager: 'nuget' };
  if (name === 'mise.toml' || name === '.mise.toml') return { languages: LANGUAGES, parser: 'mise', shared: true, taskRunner: 'mise' };
  if (name === '.tool-versions') return { languages: LANGUAGES, parser: 'tools', shared: true };
  if (name === 'pnpm-workspace.yaml' || name === 'pnpm-workspace.yml') return { languages: ['node'], parser: 'workspace' };
  if (name === 'pyvenv.cfg' || name === '.venv/pyvenv.cfg') return { languages: ['python'], parser: 'venv' };
  if (/^(?:\.devcontainer\.json|\.devcontainer\/devcontainer\.json)$/.test(name)) return { environment: 'containers', parser: 'devcontainer' };
  if (/^(?:docker-)?compose(?:\.[\w.-]+)?\.ya?ml$/.test(name)) return { environment: 'containers', parser: 'compose' };
  if (/^Dockerfile(?:\.[\w.-]+)?$/.test(name)) return { environment: 'containers' };
  if (/^process-compose(?:\.[\w.-]+)?\.ya?ml$/.test(name)) return { environment: 'processCompose', parser: 'processCompose' };
  return null;
}

/** Read bounded declarations and explicit workspace/CI context without executing project code. */
export async function analyzeProject(projectPath) {
  const requirements = Object.fromEntries(LANGUAGES.map((language) => [language, {
    state: 'not_required', versionRequests: [], packageManagers: [], lockFiles: [], metadata: {}, notes: [],
  }]));
  const metadata = {
    scope: { boundary: '.', boundaryKind: 'project', ancestorDirectories: [], maxDepth: MAX_DEPTH, maxFiles: MAX_FILES, maxBytes: MAX_BYTES },
    declarations: [], workspaces: [], ci: [], taskRunners: [], taskRunnerCI: [],
    taskRunnerWorkflows: [], taskRunnerPreferences: [], taskRunnerLanguages: [],
    processCompose: { source: null, sources: [], services: [], configurations: [], dynamicEnvironment: false },
    compose: { sources: [], services: [], configurations: [], dynamicEnvironment: false },
    dockerfiles: [],
    execution: { location: 'host', hostLanguages: {}, evidence: [] },
  };
  const result = { root: null, requirements, environment: { containers: 'not_required', processCompose: 'not_required' }, files: [], issues: [], metadata };
  const issue = (source, message) => {
    if (!result.issues.some((entry) => entry.source === source && entry.message === message)) result.issues.push({ source, message });
  };
  const collectTaskRunner = (tool, source, text, reason) => {
    const record = analyzeTaskRunner({ tool, source, text, reason });
    if (!record) return;
    const index = metadata.taskRunners.findIndex((entry) => entry.tool === tool && entry.source === source);
    if (index < 0) metadata.taskRunners.push(record);
    else metadata.taskRunners[index] = record;
  };
  const localLanguages = new Set();
  const workflowJobs = [];
  const selectedMiseRunnerPins = new Set();
  const mark = (language, local = true) => {
    if (local) localLanguages.add(language);
    if (requirements[language].state !== 'unknown') requirements[language].state = 'required';
  };
  const unknown = (languages, source, message) => {
    for (const language of languages) requirements[language].state = 'unknown';
    issue(source, message);
  };
  const note = (language, text) => { requirements[language].notes.push(text); };
  const manager = (language, name, source, version) => {
    requirements[language].packageManagers.push({ name, source, ...(version ? { version } : {}) });
  };
  const request = (language, source, field, value, options = {}) => {
    const kind = classifyVersion(value, language, options.channels);
    if (!kind || (options.validate && !options.validate(value))) {
      unknown([language], source, `${field} 필드의 버전 표현을 정적으로 해석할 수 없습니다.`);
      return;
    }
    mark(language);
    requirements[language].versionRequests.push({ source, field, kind: options.kind ?? kind, value });
  };
  const packageVersion = (language, name, source, field, version) => {
    const kind = classifyVersion(version, language);
    if (!kind) { unknown([language], source, `${field} 필드의 도구 버전 표현을 해석할 수 없습니다.`); return; }
    const metadata = requirements[language].metadata;
    (metadata.packageManagerRequests ??= []).push({ name, source, field, kind, value: version });
  };
  const asToml = (text, languages, source) => {
    try { return tomlDocument(text); } catch {
      unknown(languages, source, 'TOML 선언의 문법이 잘못되었거나 지원하는 정적 분석 범위를 벗어났습니다.');
      return null;
    }
  };
  const asJson = (text, languages, source) => {
    try { return parseJsonObject(text); } catch {
      unknown(languages, source, 'JSON 선언을 객체로 읽을 수 없습니다.');
      return null;
    }
  };
  const selections = new Map();
  let declaration;
  const versionPriority = (family, source) => (declaration?.distance ?? 0) * 10 + (family === 'mise' && path.basename(source) !== '.mise.toml' ? 1 : 0);
  const canSelectVersion = (family, language, source) => !selections.has(`${family}:${language}`) || selections.get(`${family}:${language}`) >= versionPriority(family, source);
  const selectVersion = (family, language, source) => {
    if (!canSelectVersion(family, language, source)) return false;
    selections.set(`${family}:${language}`, versionPriority(family, source));
    if (declaration && !declaration.selectedLanguages.includes(language)) declaration.selectedLanguages.push(language);
    return true;
  };

  function nodeDeclaration(text, source) {
    const data = asJson(text, ['node'], source);
    if (!data) return;
    if (has(data, 'workspaces')) workspaceDeclaration(Array.isArray(data.workspaces) ? data.workspaces : data.workspaces?.packages, source, 'npm');
    if (has(data, 'engines')) {
      if (!object(data.engines)) unknown(['node'], source, 'engines 필드의 형식을 확인할 수 없습니다.');
      else {
        if (has(data.engines, 'node')) request('node', source, 'engines.node', data.engines.node);
        for (const name of ['npm', 'pnpm', 'yarn', 'bun']) {
          if (has(data.engines, name)) { manager('node', name, source); packageVersion('node', name, source, `engines.${name}`, data.engines[name]); }
        }
      }
    }
    if (has(data, 'packageManager')) {
      const match = typeof data.packageManager === 'string' && data.packageManager.match(/^(npm|pnpm|yarn|bun)@([^+]+)(?:\+sha(?:224|256|384|512)\.[a-fA-F0-9]+)?$/);
      if (!match || !EXACT.test(match[2])) unknown(['node'], source, 'packageManager 필드의 관리자 또는 고정 버전 형식을 지원하지 않습니다.');
      else {
        manager('node', match[1], source, classifyVersion(match[2], 'node') ? match[2] : undefined);
        packageVersion('node', match[1], source, 'packageManager', match[2]);
      }
    }
    if (!has(data, 'devEngines')) return;
    if (!object(data.devEngines)) { unknown(['node'], source, 'devEngines 필드의 형식을 확인할 수 없습니다.'); return; }
    for (const field of ['runtime', 'packageManager']) {
      if (!has(data.devEngines, field)) continue;
      const list = Array.isArray(data.devEngines[field]) ? data.devEngines[field] : [data.devEngines[field]];
      if (!list.length || list.length > 32) { unknown(['node'], source, 'devEngines 선언 목록의 형식을 지원하지 않습니다.'); continue; }
      for (let index = 0; index < list.length; index += 1) {
        const entry = list[index], key = `devEngines.${field}${Array.isArray(data.devEngines[field]) ? `[${index}]` : ''}`;
        const names = field === 'runtime' ? ['node'] : ['npm', 'pnpm', 'yarn', 'bun'];
        if (!object(entry) || !names.includes(entry.name)) { unknown(['node'], source, `${key} 필드의 도구 선언을 지원하지 않습니다.`); continue; }
        const policy = entry.onFail ?? 'error';
        if (!['warn', 'error', 'ignore'].includes(policy)) unknown(['node'], source, `${key}.onFail 필드의 정책을 지원하지 않습니다.`);
        (requirements.node.metadata.devEngines ??= []).push({ field: key, name: entry.name, onFail: ['warn', 'error', 'ignore'].includes(policy) ? policy : 'unknown' });
        if (field === 'packageManager') manager('node', entry.name, source, classifyVersion(entry.version, 'node') ? entry.version : undefined);
        if (has(entry, 'version')) {
          if (field === 'runtime') request('node', source, `${key}.version`, entry.version);
          else packageVersion('node', entry.name, source, `${key}.version`, entry.version);
        }
      }
    }
  }

  function pythonDeclaration(text, source) {
    const data = asToml(text, ['python'], source);
    if (!data) return;
    const version = data.get('project', 'requires-python');
    if (version !== undefined) request('python', source, 'project.requires-python', version);
    const project = data.get('project');
    if (project !== undefined && !object(project)) unknown(['python'], source, 'project 필드의 테이블 형식을 확인할 수 없습니다.');
    const dynamic = data.get('project', 'dynamic');
    if (dynamic !== undefined && (!Array.isArray(dynamic) || !dynamic.every((item) => typeof item === 'string'))) unknown(['python'], source, 'project.dynamic 필드의 문자열 목록을 확인할 수 없습니다.');
    if (dynamic === UNKNOWN || (Array.isArray(dynamic) && dynamic.includes('requires-python'))) unknown(['python'], source, '동적으로 정하는 requires-python 요구는 실행 없이 확인할 수 없습니다.');
    const poetry = data.get('tool', 'poetry', 'dependencies', 'python');
    if (poetry !== undefined) request('python', source, 'tool.poetry.dependencies.python', object(poetry) ? poetry.version : poetry);
    const tools = ['uv', 'poetry', 'pdm', 'hatch', 'rye'].filter((name) => data.contains('tool', name));
    for (const name of tools) manager('python', name, source);
    if (tools.length) requirements.python.metadata.tools = tools;
    const uvVersion = data.get('tool', 'uv', 'required-version');
    if (uvVersion !== undefined) packageVersion('python', 'uv', source, 'tool.uv.required-version', uvVersion);
    const backend = data.get('build-system', 'build-backend');
    if (typeof backend === 'string') {
      const known = ['poetry.core.masonry.api', 'pdm.backend', 'hatchling.build', 'setuptools.build_meta', 'setuptools.build_meta:__legacy__', 'uv_build'];
      if (known.includes(backend)) requirements.python.metadata.buildBackend = backend;
    }
  }

  function pin(text, source, language) {
    const lines = text.split(/\r?\n/).map((line) => line.replace(/\s*#.*$/, '').trim()).filter(Boolean);
    if (!lines.length || (language !== 'python' && lines.length !== 1) || lines.length > 32) {
      unknown([language], source, '버전 파일의 단일 선언 또는 지원하는 버전 목록을 확인할 수 없습니다.'); return;
    }
    for (const value of lines) request(language, source, 'version', value, { channels: true });
    if (lines.length > 1) note(language, '여러 인터프리터 선언을 보존했으며 실제 선택 순서는 확인하지 않았습니다.');
  }

  function goDeclaration(text, source) {
    // Keep line boundaries while making quoted paths and comments opaque.
    let stripped = '';
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index], pair = text.slice(index, index + 2);
      if (pair === '//') {
        while (index < text.length && text[index] !== '\n') index += 1;
        stripped += '\n';
      } else if (pair === '/*') {
        const end = text.indexOf('*/', index + 2);
        if (end < 0) { unknown(['go'], source, 'Go 선언의 주석이 완결되지 않았습니다.'); return; }
        stripped += ' ' + text.slice(index, end + 2).replace(/[^\n]/g, '');
        index = end + 1;
      } else if (char === '"' || char === '`') {
        const quote = char;
        let closed = false;
        for (index += 1; index < text.length; index += 1) {
          if (text[index] === '\\' && quote === '"') { index += 1; continue; }
          if (text[index] === quote) { closed = true; break; }
          if (quote === '"' && /[\r\n]/.test(text[index])) break;
        }
        if (!closed) { unknown(['go'], source, 'Go 선언의 문자열이 완결되지 않았습니다.'); return; }
        stripped += '"정적문자열"';
      } else stripped += char;
    }
    let block = false;
    const seen = new Set();
    for (const raw of stripped.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (block) { if (line === ')') block = false; continue; }
      if (/^(?:require|exclude|replace|retract|use|tool|godebug)\s*\($/.test(line)) { block = true; continue; }
      const match = line.match(/^(go|toolchain)(?:\s+(.*))?$/);
      if (!match) {
        if (/^module\s+\S+$/.test(line) && source === 'go.mod') {
          if (seen.has('module')) unknown(['go'], source, 'module 지시문이 중복되어 있습니다.');
          seen.add('module');
        } else if (!/^(?:require|exclude|replace|retract|use|tool|godebug)\s+\S/.test(line)) unknown(['go'], source, 'Go 선언에서 지원하지 않거나 잘못된 최상위 지시문을 발견했습니다.');
        continue;
      }
      if (seen.has(match[1])) unknown(['go'], source, '동일한 Go 도구 모음 지시문이 중복되어 있습니다.');
      seen.add(match[1]);
      const value = match[2] ?? '';
      if (match[1] === 'go') request('go', source, 'go', value, { kind: 'minimum', validate: (item) => GO_VERSION.test(item) });
      else if (value === 'default') requirements.go.metadata.toolchainDefault = true;
      else if (/^go/.test(value) && GO_VERSION.test(value.slice(2))) {
        requirements.go.versionRequests.push({ source, field: 'toolchain', kind: 'preferred', value });
      } else unknown(['go'], source, 'toolchain 필드의 선호 Go 도구 모음 표현을 지원하지 않습니다.');
    }
    if (block) unknown(['go'], source, 'Go 선언의 블록이 완결되지 않았습니다.');
    if ((source === 'go.mod' && !seen.has('module')) || (source === 'go.work' && !seen.has('go'))) unknown(['go'], source, 'Go 선언의 필수 module 또는 go 지시문을 확인할 수 없습니다.');
    note('go', 'go 지시문은 최소 요구이며 toolchain 지시문은 선호 도구 모음입니다.');
  }

  function cargoDeclaration(text, source) {
    const data = asToml(text, ['rust'], source);
    if (!data) return;
    const minimum = (field, value) => request('rust', source, field, value, { kind: 'minimum', validate: (item) => /^\d+\.\d+(?:\.\d+)?$/.test(item) });
    const workspace = data.get('workspace', 'package', 'rust-version');
    if (workspace !== undefined) minimum('workspace.package.rust-version', workspace);
    const value = data.get('package', 'rust-version');
    const inherited = data.get('package', 'rust-version', 'workspace');
    if (inherited === true) {
      requirements.rust.metadata.workspaceRustVersion = true;
      if (workspace === undefined) unknown(['rust'], source, '상위 작업 공간의 rust-version 요구는 현재 루트에서 확인할 수 없습니다.');
    } else if (value !== undefined) minimum('package.rust-version', value);
    else if (inherited !== undefined) unknown(['rust'], source, 'rust-version 작업 공간 상속 표현을 지원하지 않습니다.');
  }

  function rustDeclaration(text, source) {
    if (source === 'rust-toolchain' && !text.trimStart().startsWith('[')) { pin(text, source, 'rust'); return; }
    const data = asToml(text, ['rust'], source);
    if (!data) return;
    if (!data.contains('toolchain')) { unknown(['rust'], source, 'toolchain 테이블을 확인할 수 없습니다.'); return; }
    const channel = data.get('toolchain', 'channel');
    const customPath = data.get('toolchain', 'path');
    if (['channel', 'path', 'components', 'targets', 'profile'].every((field) => data.get('toolchain', field) === undefined)) unknown(['rust'], source, 'toolchain 테이블에서 지원하는 도구 모음 속성을 확인할 수 없습니다.');
    if (channel !== undefined) request('rust', source, 'toolchain.channel', channel, { channels: true });
    if (customPath !== undefined) unknown(['rust'], source, '사용자 지정 Rust 경로의 버전은 정적으로 확인하지 않습니다.');
    for (const field of ['components', 'targets']) {
      const value = data.get('toolchain', field);
      if (value === undefined) continue;
      if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && /^[\w-]{1,100}$/.test(item))) unknown(['rust'], source, `toolchain.${field} 필드의 형식을 지원하지 않습니다.`);
      else requirements.rust.metadata[field] = value;
    }
    const profile = data.get('toolchain', 'profile');
    if (profile !== undefined) {
      if (['minimal', 'default', 'complete'].includes(profile)) requirements.rust.metadata.profile = profile;
      else unknown(['rust'], source, 'toolchain.profile 필드의 프로필을 지원하지 않습니다.');
    }
    if (channel === undefined) note('rust', '도구 모음 버전 선택에는 기본값 또는 외부 설정의 확인이 필요합니다.');
  }

  function zigDeclaration(text, source) {
    // ZON is data, but do not interpret Zig expressions or search dependency subobjects.
    const tokens = text.match(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|[A-Za-z_][\w]*|\s+|./gs) ?? [];
    const significant = tokens.filter((token) => !/^\s|^\/\//.test(token) && !token.startsWith('/*'));
    if (significant[0] !== '.' || significant[1] !== '{' || significant.at(-1) !== '}') {
      unknown(['zig'], source, 'ZON 선언의 최상위 객체를 확인할 수 없습니다.'); return;
    }
    let depth = 0, count = 0;
    const brackets = [], pairs = { '}': '{', ']': '[', ')': '(' };
    for (let index = 0; index < significant.length; index += 1) {
      const token = significant[index];
      if (token === '"') { unknown(['zig'], source, 'ZON 선언의 문자열이 완결되지 않았습니다.'); return; }
      if (token === '{' || token === '[' || token === '(') { depth += 1; brackets.push(token); }
      if (token === '}' || token === ']' || token === ')') {
        depth -= 1;
        if (brackets.pop() !== pairs[token]) { unknown(['zig'], source, 'ZON 선언의 괄호가 일치하지 않습니다.'); return; }
      }
      if (depth < 0) break;
      if (depth !== 1 || token !== '.' || significant[index + 1] !== 'minimum_zig_version') continue;
      count += 1;
      const valueToken = significant[index + 3], end = significant[index + 4];
      if (significant[index + 2] !== '=' || !valueToken?.startsWith('"') || ![',', '}'].includes(end)) {
        unknown(['zig'], source, 'minimum_zig_version 필드의 정적 문자열 표현을 지원하지 않습니다.'); continue;
      }
      let value;
      try { value = JSON.parse(valueToken); } catch { value = UNKNOWN; }
      request('zig', source, 'minimum_zig_version', value, { kind: 'minimum', validate: (item) => EXACT.test(item) });
    }
    if (depth || count > 1) unknown(['zig'], source, 'ZON 선언의 중괄호 또는 중복 최소 버전을 확인해야 합니다.');
  }

  function dotnetDeclaration(text, source) {
    let options;
    try { options = parseGlobalJson(text); }
    catch (error) { unknown(['dotnet'], source, error.message); return; }
    note('dotnet', 'SDK 선택과 대상 런타임은 별개이며 분석 경계 안의 가장 가까운 global.json을 사용합니다.');
    if (!options) return;
    if (options.version) {
      requirements.dotnet.versionRequests.push({ source, field: 'sdk.version', kind: 'sdk', value: options.version });
    }
    requirements.dotnet.metadata.sdk = options;
  }

  function miseDeclaration(text, source) {
    const languages = LANGUAGES.filter((language) => canSelectVersion('mise', language, source));
    const rootMise = source === '.mise.toml' || source === 'mise.toml';
    if (!languages.length && !rootMise) return;
    const data = asToml(text, languages, source);
    if (!data) { for (const language of languages) selectVersion('mise', language, source); return; }
    if (languages.length && data.contains('include')) {
      if (declaration) declaration.unresolvedFields = ['include'];
      unknown(languages, source, 'mise 외부 포함 선언은 따라가지 않으므로 추가 요구를 확인할 수 없습니다.');
    }
    const inline = data.get('tools');
    if (inline === undefined) return;
    if (!object(inline)) { unknown(languages, source, 'mise tools 필드의 정적 테이블 형식을 지원하지 않습니다.'); return; }
    if (rootMise) {
      const pins = new Map();
      for (const [key, value] of Object.entries(inline)) {
        const tool = MISE_RUNNER_PINS.get(key) ?? key;
        if (RUNNER_PINS.has(tool) && !selectedMiseRunnerPins.has(tool)) {
          recordRunnerPin(pins, tool, Array.isArray(value) ? value : [value]);
        }
      }
      for (const [tool, exact] of pins) {
        selectedMiseRunnerPins.add(tool);
        if (exact) metadata.taskRunnerPreferences.push({ tool, source });
      }
    }
    for (const [key, value] of Object.entries(inline)) {
      const language = ALIASES[key.split(':').at(-1)];
      if (!language || !selectVersion('mise', language, source)) continue;
      mark(language);
      (requirements[language].metadata.versionManagers ??= []).push('mise');
      if (key.includes(':')) { unknown([language], source, '명시적 mise 백엔드의 버전 해석은 지원하지 않습니다.'); continue; }
      const versions = Array.isArray(value) ? value : [value];
      if (!versions.length || versions.length > 32) { unknown([language], source, 'mise 버전 목록의 형식을 지원하지 않습니다.'); continue; }
      for (const item of versions) {
        const version = object(item) && Object.keys(item).every((field) => field === 'version') ? item.version : item;
        request(language, source, `tools.${key}`, version, { channels: true });
      }
    }
  }

  function toolVersions(text, source) {
    const seen = new Set();
    const pins = new Map();
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/\s*#.*$/, '').trim();
      if (!line) continue;
      const [key, ...versions] = line.split(/\s+/), language = ALIASES[key];
      if (source === '.tool-versions' && RUNNER_PINS.has(key)) recordRunnerPin(pins, key, versions);
      if (!language || !selectVersion('asdf', language, source)) continue;
      mark(language);
      (requirements[language].metadata.versionManagers ??= []).push('asdf');
      if (seen.has(language)) unknown([language], source, '같은 언어의 .tool-versions 선언이 중복되어 있습니다.');
      seen.add(language);
      if (!versions.length || versions.length > 32) unknown([language], source, '.tool-versions 버전 목록의 형식을 지원하지 않습니다.');
      for (const version of versions.slice(0, 32)) request(language, source, key, version, { channels: true });
    }
    for (const [tool, exact] of pins) if (exact) metadata.taskRunnerPreferences.push({ tool, source });
  }

  function condaDeclaration(text, source) {
    let data;
    try { data = yamlDocument(text); }
    catch { unknown(['python'], source, 'Conda YAML의 문법·태그·별칭 한도를 확인할 수 없습니다.'); return; }
    if (!has(data, 'dependencies')) return;
    if (!Array.isArray(data.dependencies)) { unknown(['python'], source, 'Conda dependencies 필드가 목록이 아닙니다.'); return; }
    for (const dependency of data.dependencies) {
      if (typeof dependency !== 'string') continue;
      const match = dependency.match(/^python(?=$|[\s=<>!~])([\s\S]*)$/);
      if (match?.[1].trim()) request('python', source, 'dependencies.python', match[1].trim().replace(/^=(?!=)/, ''));
    }
  }

  const pendingWorkspaces = [];
  function workspaceDeclaration(patterns, source, kind) {
    const entry = { source, kind, state: 'required', patterns: [], members: [], notes: [] };
    metadata.workspaces.push(entry);
    if (!Array.isArray(patterns) || patterns.length > 64 || !patterns.every((value) => typeof value === 'string')) {
      uncertain(entry, source, '작업 공간의 packages 선언이 정적 문자열 목록이 아닙니다.');
      return;
    }
    for (const pattern of patterns) {
      const value = pattern.replace(/^!/, '').replace(/^\.\//, '').replace(/\/$/, '');
      if (!value || value.length > 240 || /[\\@$%{}\[\]?`|&;<>:\x00-\x1f]/.test(value) ||
          value.split('/').some((part) => part === '..' || /^(?:node_modules|\.git|\.venv)$/.test(part))) {
        uncertain(entry, source, '작업 공간 패턴의 외부 경로·동적 표현·지원하지 않는 glob은 탐색하지 않습니다.');
      } else entry.patterns.push((pattern.startsWith('!') ? '!' : '') + value);
    }
    pendingWorkspaces.push(entry);
  }

  function uncertain(record, source, message) {
    record.state = 'unknown';
    (record.notes ??= []).push(message);
    issue(source, message);
  }

  function pathField(value, source, field) {
    if (value === undefined) return { state: 'not_required' };
    if (staticPath(value)) return { state: 'required', value };
    const record = { state: 'unknown' };
    uncertain(record, source, `${field} 경로의 동적 표현이나 비정적 값을 평가하지 않습니다.`);
    return record;
  }

  function shellField(value, source) {
    if (value === undefined) return { state: 'not_required' };
    const record = { state: 'required' };
    const executable = object(value) ? value.shell_command : undefined;
    const args = object(value) ? value.shell_argument : undefined;
    if (!staticPath(executable) || !/^(?:pwsh|powershell|cmd|bash|sh|zsh|fish|nu)(?:\.exe)?$/i.test(executable.split(/[\\/]/).at(-1))) {
      uncertain(record, source, 'shell.shell_command의 알려진 셸 경로를 확인할 수 없습니다.');
    } else record.executable = executable;
    if (args !== undefined) {
      const options = new Set(['-c', '-lc', '-ic', '-l', '-i', '--login', '--noprofile', '--norc', '--no-config', '--no-config-file', '-noprofile', '-noninteractive', '-nologo', '-command', '-noexit', '--commands', '/c', '/s', '/d']);
      // Process Compose forwards this string as one argv element, not a flag list.
      if (typeof args !== 'string' || !options.has(args.toLowerCase())) {
        uncertain(record, source, 'shell.shell_argument는 단일 인수입니다. 여러 옵션 문자열·배열·동적 표현은 미확인으로 남깁니다.');
      } else record.arguments = [args];
    }
    return record;
  }

  const portNumber = (value) => Number.isInteger(Number(value)) && /^(?:[1-9]\d{0,4})$/.test(String(value)) && Number(value) <= 65535;
  function portsField(values, source) {
    if (values === undefined) return [];
    if (!Array.isArray(values) || values.length > 128) { issue(source, 'ports 필드의 정적 목록을 확인할 수 없습니다.'); return [{ state: 'unknown' }]; }
    const range = (value) => {
      if (portNumber(value)) return Number(value);
      if (typeof value !== 'string') return null;
      const parts = value.split('-');
      if (parts.length === 2 && parts.every(portNumber) && Number(parts[0]) <= Number(parts[1])) return value;
      return null;
    };
    return values.map((value) => {
      const entry = { state: 'required' };
      if (object(value)) {
        const target = range(value.target), published = value.published === undefined ? undefined : range(value.published);
        if (target !== null && published !== null && [undefined, 'tcp', 'udp', 'sctp'].includes(value.protocol)) {
          return { ...entry, target, ...(published === undefined ? {} : { published }), protocol: value.protocol ?? 'tcp' };
        }
      } else if (typeof value === 'number' || typeof value === 'string') {
        const match = String(value).match(/^(?:(?:\[[0-9a-fA-F:]+\]|\d{1,3}(?:\.\d{1,3}){3}):)?(?:(\d+(?:-\d+)?):)?(\d+(?:-\d+)?)(?:\/(tcp|udp|sctp))?$/);
        if (match && range(match[2]) !== null && (match[1] === undefined || range(match[1]) !== null)) {
          return { ...entry, target: range(match[2]), ...(match[1] === undefined ? {} : { published: range(match[1]) }), protocol: match[3] ?? 'tcp' };
        }
      }
      uncertain(entry, source, '포트 선언의 동적 표현 또는 포트 범위를 정적으로 확인할 수 없습니다.');
      return entry;
    });
  }

  function dependenciesField(value, source, process = false) {
    if (value === undefined) return [];
    const entries = Array.isArray(value) && !process ? value.map((name) => [name, {}]) : object(value) ? Object.entries(value) : null;
    if (!entries || entries.length > 128) { issue(source, 'depends_on 필드의 정적 목록·매핑을 확인할 수 없습니다.'); return [{ state: 'unknown' }]; }
    const conditions = process ? ['process_started', 'process_healthy', 'process_completed', 'process_completed_successfully', 'process_log_ready'] : ['service_started', 'service_healthy', 'service_completed_successfully'];
    return entries.map(([name, settings]) => {
      const entry = { state: 'required' };
      if (identifier(name)) entry.name = name;
      else uncertain(entry, source, 'depends_on의 정적 서비스 이름을 확인할 수 없습니다.');
      const condition = object(settings) ? settings.condition : undefined;
      if (!object(settings) || (condition !== undefined && !conditions.includes(condition))) uncertain(entry, source, 'depends_on의 조건 표현을 확인할 수 없습니다.');
      else entry.condition = condition ?? (process ? 'process_started' : 'service_started');
      return entry;
    });
  }

  function probeField(value, source, docker = false) {
    if (value === undefined) return { state: 'not_required' };
    const entry = { state: 'required', kind: 'unknown' };
    if (!object(value)) { uncertain(entry, source, '건강 확인 선언이 정적 매핑이 아닙니다.'); return entry; }
    if (docker) {
      if (value.disable === true) return { state: 'not_required', disabled: true };
      if (has(value, 'test')) { entry.kind = 'exec'; entry.commandPresent = true; }
      for (const field of ['interval', 'timeout', 'start_period', 'start_interval']) {
        if (!has(value, field)) continue;
        if (typeof value[field] === 'string' && /^(?:\d+(?:\.\d+)?(?:ns|us|ms|s|m|h))+$/.test(value[field])) (entry.timing ??= {})[field] = value[field];
        else uncertain(entry, source, `healthcheck.${field}의 정적 시간 간격을 확인할 수 없습니다.`);
      }
      if (has(value, 'retries')) {
        if (Number.isInteger(value.retries) && value.retries >= 0 && value.retries <= 1000) (entry.timing ??= {}).retries = value.retries;
        else uncertain(entry, source, 'healthcheck.retries의 정적 횟수를 확인할 수 없습니다.');
      }
    } else {
      const kinds = ['exec', 'http_get'].filter((field) => has(value, field));
      if (kinds.length === 1 && object(value[kinds[0]])) {
        entry.kind = kinds[0] === 'exec' ? 'exec' : 'http';
        if (entry.kind === 'exec') entry.commandPresent = has(value.exec, 'command');
        else {
          if (portNumber(value.http_get.port)) entry.port = Number(value.http_get.port);
          else uncertain(entry, source, 'HTTP 건강 확인 포트의 동적 표현이나 범위를 확인할 수 없습니다.');
          if (['http', 'https'].includes(value.http_get.scheme)) entry.scheme = value.http_get.scheme;
        }
      } else uncertain(entry, source, '건강 확인의 exec 또는 http_get 형식을 확인할 수 없습니다.');
      for (const field of ['initial_delay_seconds', 'period_seconds', 'timeout_seconds', 'success_threshold', 'failure_threshold']) {
        if (!has(value, field)) continue;
        if (typeof value[field] === 'number' && Number.isFinite(value[field]) && value[field] >= 0) (entry.timing ??= {})[field] = value[field];
        else uncertain(entry, source, `건강 확인 ${field}의 정적 숫자를 확인할 수 없습니다.`);
      }
    }
    return entry;
  }

  function processDeclaration(text, source) {
    const record = { source, state: 'required', shell: { state: 'not_required' }, workingDirectory: { state: 'not_required' }, processes: [], notes: [] };
    metadata.processCompose.configurations.push(record);
    metadata.processCompose.sources.push(source);
    if (!metadata.processCompose.source || source === 'process-compose.yaml' || (source === 'process-compose.yml' && metadata.processCompose.source !== 'process-compose.yaml')) metadata.processCompose.source = source;
    let data;
    try { data = yamlDocument(text); }
    catch { uncertain(record, source, 'Process Compose YAML의 문법·태그·별칭 한도를 확인할 수 없습니다.'); result.environment.processCompose = 'unknown'; return; }
    if (has(data, 'environment') || has(data, 'env_file') || has(data, 'vars')) metadata.processCompose.dynamicEnvironment = true;
    record.shell = shellField(data.shell, source);
    if (record.shell.executable && metadata.processCompose.source === source) metadata.processCompose.shell = { command: record.shell.executable, ...(record.shell.arguments ? { argument: record.shell.arguments.join(' ') } : {}) };
    record.workingDirectory = pathField(data.working_dir, source, 'working_dir');
    for (const field of ['include', 'includes', 'extends']) if (has(data, field)) uncertain(record, source, 'Process Compose의 외부 포함·상속은 따라가지 않아 추가 프로세스와 병합 결과는 미확인입니다.');
    if (data.processes === undefined) return;
    if (!object(data.processes)) { uncertain(record, source, 'Process Compose processes 필드가 매핑이 아닙니다.'); result.environment.processCompose = 'unknown'; return; }
    for (const [name, settings] of Object.entries(data.processes)) {
      if (!identifier(name) || !object(settings)) { uncertain(record, source, '프로세스 이름 또는 설정의 정적 매핑을 확인할 수 없습니다.'); continue; }
      const entry = {
        name, state: 'required', commandPresent: has(settings, 'command') || has(settings, 'entrypoint'),
        environmentPresent: has(settings, 'environment') || has(data, 'environment'), envFilePresent: has(settings, 'env_file') || has(data, 'env_file'),
        shell: settings.shell === undefined ? record.shell : shellField(settings.shell, source),
        workingDirectory: settings.working_dir === undefined ? record.workingDirectory : pathField(settings.working_dir, source, 'working_dir'),
        dependencies: dependenciesField(settings.depends_on, source, true),
        health: { readiness: probeField(settings.readiness_probe, source), liveness: probeField(settings.liveness_probe, source) },
        ports: portsField(settings.ports, source),
      };
      if (object(settings.availability)) {
        const policy = settings.availability;
        entry.availability = {};
        if (['always', 'on_failure', 'exit_on_failure', 'no'].includes(policy.restart)) entry.availability.restart = policy.restart;
        for (const field of ['backoff_seconds', 'max_restarts']) if (Number.isInteger(policy[field]) && policy[field] >= 0) entry.availability[field] = policy[field];
        if (typeof policy.exit_on_end === 'boolean') entry.availability.exitOnEnd = policy.exit_on_end;
      }
      if (has(settings, 'extends')) uncertain(entry, source, '프로세스 extends 상속은 병합하지 않아 상속 필드는 미확인입니다.');
      if (entry.shell.state === 'unknown' || entry.workingDirectory.state === 'unknown' || entry.dependencies.some((item) => item.state === 'unknown') || Object.values(entry.health).some((item) => item.state === 'unknown') || entry.ports.some((item) => item.state === 'unknown')) entry.state = 'unknown';
      record.processes.push(entry);
      const probe = entry.health.readiness.state !== 'not_required' ? entry.health.readiness : entry.health.liveness;
      metadata.processCompose.services.push({
        name, source, ...(entry.workingDirectory.value === undefined ? {} : { workingDir: entry.workingDirectory.value }),
        dependencies: entry.dependencies.flatMap((item) => item.name ? [item.name] : []),
        healthCheck: { defined: probe.state !== 'not_required', ...(probe.kind === undefined ? {} : { type: probe.kind }), ...(probe.port === undefined ? {} : { port: probe.port }) },
      });
      if (entry.environmentPresent || entry.envFilePresent || has(settings, 'vars') || /\$|\{\{/.test(String(settings.working_dir ?? ''))) metadata.processCompose.dynamicEnvironment = true;
    }
    if (record.processes.some((entry) => entry.state === 'unknown') || record.shell.state === 'unknown' || record.workingDirectory.state === 'unknown') record.state = 'unknown';
  }

  function venvDeclaration(text, source) {
    const entry = { source, directory: portable(path.dirname(source)), state: 'required', notes: [] };
    (requirements.python.metadata.virtualEnvironments ??= []).push(entry);
    metadata.pythonVenv ??= { environments: requirements.python.metadata.virtualEnvironments };
    const values = new Map();
    for (const raw of text.split(/\r?\n/)) {
      if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
      const pair = raw.match(/^\s*([\w-]+)\s*=\s*(.*?)\s*$/);
      if (!pair) { uncertain(entry, source, 'pyvenv.cfg에 키와 값으로 읽을 수 없는 행이 있습니다.'); continue; }
      const key = pair[1].toLowerCase();
      if (!['version', 'version_info', 'include-system-site-packages', 'home', 'executable', 'implementation'].includes(key)) continue;
      if (values.has(key)) { uncertain(entry, source, 'pyvenv.cfg의 메타데이터 필드가 중복되었습니다.'); continue; }
      values.set(key, pair[2]);
    }
    const version = values.get('version') ?? values.get('version_info');
    if (version !== undefined) {
      if (/^\d+\.\d+\.\d+(?:(?:a|b|rc)\d+)?$/.test(version)) entry.version = version;
      else uncertain(entry, source, 'pyvenv.cfg의 Python 버전 메타데이터를 확인할 수 없습니다.');
    }
    const system = values.get('include-system-site-packages');
    if (system !== undefined) {
      if (/^(true|false)$/i.test(system)) entry.includeSystemSitePackages = system.toLowerCase() === 'true';
      else uncertain(entry, source, 'pyvenv.cfg의 시스템 패키지 포함 설정이 불리언이 아닙니다.');
    }
    // Interpreter paths may reveal usernames or machine layout; report their presence only.
    entry.homePresent = values.has('home');
    entry.executablePresent = values.has('executable');
    if (/^(cpython|pypy)$/i.test(values.get('implementation') ?? '')) entry.implementation = values.get('implementation').toLowerCase();
    note('python', '가상환경 메타데이터는 설치된 환경의 관찰이며 프로젝트의 버전 요구나 인터프리터 실행 검증이 아닙니다.');
  }

  const composeReferences = [];
  function composeDeclaration(text, source) {
    const record = { source, state: 'required', services: [], notes: [] };
    metadata.compose.sources.push(source);
    metadata.compose.configurations.push(record);
    let data;
    try { data = yamlDocument(text); }
    catch { uncertain(record, source, 'Compose YAML의 문법·태그·별칭 한도를 확인할 수 없습니다.'); return; }
    for (const field of ['include', 'extends']) if (has(data, field)) uncertain(record, source, 'Compose 외부 포함·상속은 따라가지 않아 추가 서비스와 병합 결과는 미확인입니다.');
    if (!object(data.services)) { uncertain(record, source, 'Compose services 필드의 정적 매핑을 확인할 수 없습니다.'); return; }
    for (const [name, settings] of Object.entries(data.services)) {
      if (!identifier(name) || !object(settings)) { uncertain(record, source, 'Compose 서비스 이름 또는 정적 설정을 확인할 수 없습니다.'); continue; }
      const entry = {
        name, state: 'required', executionLocation: 'container', imagePresent: has(settings, 'image'),
        commandPresent: has(settings, 'command') || has(settings, 'entrypoint'), environmentPresent: has(settings, 'environment') || has(settings, 'env_file'),
        workingDirectory: pathField(settings.working_dir, source, 'working_dir'),
        dependencies: dependenciesField(settings.depends_on, source), ports: portsField(settings.ports, source), health: probeField(settings.healthcheck, source, true),
      };
      const summary = { name, source };
      if (has(settings, 'image')) {
        // Image references are useful static metadata, but registry credentials/templates are never returned.
        if (typeof settings.image === 'string' && /^(?:[a-zA-Z0-9][a-zA-Z0-9._-]*(?::\d+)?\/)*[a-zA-Z0-9][a-zA-Z0-9._-]*(?::[\w.-]+|@sha256:[a-fA-F0-9]{64})?$/.test(settings.image) && settings.image.length <= 240) summary.image = settings.image;
        else uncertain(entry, source, 'Compose image의 동적 표현이나 비정적 참조는 반환하지 않습니다.');
      }
      if (has(settings, 'build')) {
        summary.build = true;
        const build = object(settings.build) ? settings.build : typeof settings.build === 'string' ? { context: settings.build } : null;
        entry.build = build ? { context: pathField(build.context, source, 'build.context'), dockerfile: pathField(build.dockerfile, source, 'build.dockerfile') } : { state: 'unknown' };
        if (!build) uncertain(entry, source, 'Compose build의 정적 경로·매핑을 확인할 수 없습니다.');
        // No Dockerfile, build args, secrets, mounts or build commands are evaluated.
      }
      if (has(settings, 'profiles')) {
        if (Array.isArray(settings.profiles) && settings.profiles.length <= 64 && settings.profiles.every(identifier)) summary.profiles = settings.profiles;
        else uncertain(entry, source, 'Compose profiles의 정적 이름 목록을 확인할 수 없습니다.');
      }
      if (has(settings, 'extends')) uncertain(entry, source, 'Compose 서비스 extends는 따라가지 않아 상속 필드만 미확인입니다.');
      if (entry.environmentPresent || /\$|\{\{/.test(JSON.stringify([settings.image, settings.working_dir, settings.ports]))) metadata.compose.dynamicEnvironment = true;
      if (entry.workingDirectory.state === 'unknown' || entry.dependencies.some((item) => item.state === 'unknown') || entry.ports.some((item) => item.state === 'unknown') || entry.health.state === 'unknown') entry.state = 'unknown';
      record.services.push(entry);
      metadata.compose.services.push(summary);
    }
    if (record.services.length) result.environment.containers = 'required';
    if (record.services.some((entry) => entry.state === 'unknown')) record.state = 'unknown';
    metadata.execution.evidence.push({ source, kind: 'compose', location: 'unknown', reason: 'Compose는 선언한 서비스의 컨테이너 실행만 나타내며 앱·호스트 언어 실행 위치를 확정하지 않습니다.' });
  }

  function devcontainerDeclaration(text, source) {
    const previous = metadata.devcontainer;
    const record = { source, state: 'required', mode: 'unknown', runtimeLocation: 'unknown', composeFiles: [], notes: [] };
    metadata.devcontainer ??= { source, runtimeLocation: 'unknown', configurations: [] };
    metadata.devcontainer.configurations.push(record);
    if (previous && previous.source !== source) metadata.devcontainer.runtimeLocation = 'unknown';
    let data;
    try { data = asJson(devcontainerJson(text), [], source); }
    catch { issue(source, 'devcontainer JSONC의 주석·문자열을 확인할 수 없습니다.'); }
    if (!data) { uncertain(record, source, 'devcontainer JSONC를 정적 객체로 읽을 수 없습니다.'); return; }
    const modes = ['image', 'build', 'dockerFile', 'dockerComposeFile'].filter((field) => has(data, field));
    if (modes.length !== 1) uncertain(record, source, 'devcontainer의 단일 image·build·Compose 실행 모드를 확인할 수 없습니다.');
    else if (modes[0] === 'dockerComposeFile') {
      record.mode = 'compose';
      const files = Array.isArray(data.dockerComposeFile) ? data.dockerComposeFile : [data.dockerComposeFile];
      if (!files.length || files.length > 32) uncertain(record, source, 'devcontainer Compose 파일 목록의 한도를 확인할 수 없습니다.');
      else for (const filename of files) {
        if (!staticPath(filename) || path.isAbsolute(filename) || path.win32.isAbsolute(filename)) { uncertain(record, source, 'devcontainer의 외부·동적 Compose 참조는 따라가지 않습니다.'); continue; }
        const target = path.resolve(root, path.dirname(source), filename);
        if (!inside(root, target)) { uncertain(record, source, 'devcontainer가 프로젝트 밖의 Compose 파일을 참조하여 읽지 않았습니다.'); continue; }
        const relative = portable(path.relative(root, target));
        record.composeFiles.push(relative);
        composeReferences.push({ source: relative, owner: record });
      }
      if (!identifier(data.service)) uncertain(record, source, 'devcontainer Compose 실행 대상 service의 정적 이름을 확인할 수 없습니다.');
      else record.service = data.service;
      if (record.service && record.composeFiles.length === files.length) record.runtimeLocation = 'container';
    } else if (modes[0] === 'image') {
      record.mode = 'image';
      if (typeof data.image === 'string' && data.image.trim()) record.runtimeLocation = 'container';
      else uncertain(record, source, 'devcontainer image 필드가 비어 있거나 문자열이 아닙니다.');
      if (typeof data.image === 'string' && /[$%{}@]|:\/\//.test(data.image)) uncertain(record, source, 'devcontainer image의 동적 표현이나 외부 인증 값은 평가하거나 반환하지 않습니다.');
    } else if (modes.length === 1) {
      record.mode = 'build';
      const build = object(data.build) ? data.build : has(data, 'dockerFile') ? { dockerfile: data.dockerFile, context: data.context } : null;
      if (build) {
        record.build = { dockerfile: pathField(build.dockerfile, source, 'build.dockerfile'), context: pathField(build.context, source, 'build.context') };
        if (typeof build.dockerfile === 'string' && build.dockerfile.trim()) record.runtimeLocation = 'container';
        if (Object.values(record.build).some((field) => field.state === 'unknown')) record.state = 'unknown';
      } else uncertain(record, source, 'devcontainer build 필드의 정적 매핑을 확인할 수 없습니다.');
    }
    record.workspaceFolder = pathField(data.workspaceFolder, source, 'workspaceFolder');
    record.forwardPorts = portsField(data.forwardPorts, source);
    record.lifecycleCommandsPresent = ['initializeCommand', 'onCreateCommand', 'updateContentCommand', 'postCreateCommand', 'postStartCommand', 'postAttachCommand'].some((field) => has(data, field));
    record.environmentPresent = has(data, 'containerEnv') || has(data, 'remoteEnv');
    if (record.workspaceFolder.state === 'unknown' || record.forwardPorts.some((entry) => entry.state === 'unknown')) record.state = 'unknown';
    if (previous && previous.source !== source) {
      uncertain(record, source, 'devcontainer 설정 파일이 여러 개여서 사용자가 선택할 실행 구성을 확정하지 않았습니다.');
      metadata.devcontainer.runtimeLocation = 'unknown';
    } else {
      metadata.devcontainer.runtimeLocation = record.runtimeLocation;
      if (record.composeFiles.length) metadata.devcontainer.composeFiles = record.composeFiles;
    }
    if (record.runtimeLocation === 'container') result.environment.containers = 'required';
    metadata.execution.evidence.push({ source, kind: 'devcontainer', location: record.runtimeLocation, reason: record.runtimeLocation === 'container' ? '명시한 devcontainer 작업 문맥은 컨테이너이며 Windows 호스트 언어 도구의 필요성은 별도 선택에 달려 있습니다.' : 'devcontainer 실행 모드 또는 참조 범위를 확인하지 못했습니다.' });
  }

  function ciDeclaration(text, source) {
    const record = { source, provider: 'github-actions', state: 'required', jobs: [], notes: [] };
    metadata.ci.push(record);
    let data;
    try { data = yamlDocument(text); }
    catch { uncertain(record, source, 'CI YAML의 문법·태그·별칭 한도를 확인할 수 없습니다.'); return; }
    if (!object(data.jobs)) { uncertain(record, source, 'CI jobs의 정적 매핑을 확인할 수 없습니다.'); return; }
    const workflowAtProjectRoot = source.startsWith('.github/workflows/') &&
      (metadata.scope.boundaryKind !== 'repository' || metadata.scope.boundary === '.');
    const repositoryWorkflow = workflowAtProjectRoot && metadata.scope.boundaryKind === 'repository' && metadata.scope.boundary === '.';
    const setups = {
      'actions/setup-node': ['node', 'node-version', 'node-version-file'],
      'actions/setup-python': ['python', 'python-version', 'python-version-file'],
      'actions/setup-go': ['go', 'go-version', 'go-version-file'],
      'actions/setup-dotnet': ['dotnet', 'dotnet-version', 'global-json-file'],
      'dtolnay/rust-toolchain': ['rust', 'toolchain'],
      'actions-rust-lang/setup-rust-toolchain': ['rust', 'toolchain'],
      'mlugg/setup-zig': ['zig', 'version'],
    };
    for (const [id, job] of Object.entries(data.jobs)) {
      if (!identifier(id) || !object(job)) { uncertain(record, source, 'CI 작업 이름 또는 정적 매핑을 확인할 수 없습니다.'); continue; }
      const entry = { id, state: 'required', executionLocation: has(job, 'container') ? (typeof job.container === 'string' || object(job.container) ? 'container' : 'unknown') : 'host', requirements: [], notes: [] };
      record.jobs.push(entry);
      if (has(job, 'uses')) uncertain(entry, source, '재사용 CI 워크플로는 외부 또는 별도 파일을 평가하지 않아 내부 요구가 미확인입니다.');
      const runsOn = Array.isArray(job['runs-on']) ? job['runs-on'] : [job['runs-on']];
      if (runsOn.every(identifier)) entry.runsOn = runsOn;
      else if (job['runs-on'] !== undefined) uncertain(entry, source, 'CI runs-on의 동적 표현을 평가하지 않습니다.');
      if (job.defaults?.run?.['working-directory'] !== undefined) entry.workingDirectory = pathField(job.defaults.run['working-directory'], source, 'defaults.run.working-directory');
      const matrix = job.strategy?.matrix;
      const matrixValues = (key) => {
        if (!object(matrix)) return null;
        if (matrix.exclude !== undefined) return null;
        const values = [];
        if (Array.isArray(matrix[key])) values.push(...matrix[key]);
        if (Array.isArray(matrix.include)) for (const row of matrix.include) if (object(row) && has(row, key)) values.push(row[key]);
        return values.length > 0 && values.length <= 64 ? unique(values) : null;
      };
      if (job.steps !== undefined && !Array.isArray(job.steps)) { uncertain(entry, source, 'CI steps의 정적 목록을 확인할 수 없습니다.'); continue; }
      const steps = job.steps ?? [];
      const hostWorkspaceAtProjectRoot = workflowAtProjectRoot && entry.executionLocation === 'host' && !has(job, 'uses') && steps.every(usesDefaultCheckout);
      const workflowSteps = repositoryWorkflow && hostWorkspaceAtProjectRoot && entry.runsOn?.length && !has(job, 'if') ? [] : null;
      let afterCheckout = false;
      for (const [index, step] of steps.entries()) {
        if (object(step)) {
          const atProjectRoot = hostWorkspaceAtProjectRoot && !has(step, 'uses') &&
            workspaceRoot(ciRunSetting('working-directory', step, job, data)) && hostCIShells.has(ciRunSetting('shell', step, job, data));
          const invocation = taskRunnerInvocation(step.run, { atProjectRoot });
          if (invocation) metadata.taskRunnerCI.push({ source, job: id, step: index, ...invocation, executionLocation: entry.executionLocation });
          if (workflowSteps) {
            workflowSteps[index] = taskRunnerWorkflowStep(step, { atProjectRoot, afterCheckout });
            if (typeof step.uses === 'string' && literalCheckout.test(step.uses) && !has(step, 'run') && !has(step, 'if')) afterCheckout = true;
          }
        }
        if (!object(step) || typeof step.uses !== 'string') continue;
        const action = step.uses.split('@')[0];
        if (!has(setups, action)) continue;
        const [language, field, fileField] = setups[action];
        mark(language, false);
        const evidence = { source, job: id, step: index, language, field, state: 'required', versionRequests: [], executionLocation: entry.executionLocation, notes: [] };
        entry.requirements.push(evidence);
        (requirements[language].metadata.ciRequirements ??= []).push(evidence);
        const inputs = object(step.with) ? step.with : {};
        let raw = inputs[field];
        if (raw === undefined && action === 'dtolnay/rust-toolchain') raw = step.uses.split('@')[1];
        let versions = typeof raw === 'number' ? [String(raw)] : typeof raw === 'string' ? [raw] : null;
        if (typeof raw === 'string') {
          const reference = raw.match(/^\s*\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}\s*$/);
          if (reference) versions = matrixValues(reference[1])?.map((value) => typeof value === 'number' ? String(value) : value) ?? null;
          else if (language === 'dotnet' && raw.includes('\n')) versions = raw.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
        }
        if (versions) for (const version of versions) {
          const kind = classifyVersion(version, language, true);
          if (kind) evidence.versionRequests.push({ source, field, kind, value: version });
          else uncertain(evidence, source, 'CI 도구 버전의 동적 표현 또는 지원하지 않는 버전은 평가하지 않습니다.');
        }
        if (fileField && has(inputs, fileField)) {
          if (staticPath(inputs[fileField]) && !path.isAbsolute(inputs[fileField]) && !path.win32.isAbsolute(inputs[fileField]) && inside(root, path.resolve(root, inputs[fileField]))) evidence.versionFile = inputs[fileField];
          uncertain(evidence, source, 'CI 버전 파일은 checkout 경로와 작업 디렉터리의 실제 적용을 확인하지 않아 참조만 기록합니다.');
        } else if (!versions) uncertain(evidence, source, matrix?.exclude !== undefined ? 'CI matrix.exclude의 조합 선택은 지원하지 않아 해당 버전 요구만 미확인입니다.' : 'CI 도구 버전이 없거나 정적 행렬 참조로 해석할 수 없습니다.');
        if (evidence.state === 'unknown') entry.state = 'unknown';
      }
      if (workflowSteps && afterCheckout) workflowJobs.push({ source, job: id, steps: workflowSteps });
      if (entry.state === 'unknown') record.state = 'unknown';
    }
  }

  let root;
  try {
    if (typeof projectPath !== 'string' || !projectPath) throw new Error();
    root = path.resolve(projectPath);
    result.root = root;
  } catch {
    unknown(LANGUAGES, '.', '대상 프로젝트 경로를 해석할 수 없습니다.');
    result.environment = { containers: 'unknown', processCompose: 'unknown' };
    metadata.execution.location = 'unknown';
    metadata.execution.hostLanguages = Object.fromEntries(LANGUAGES.map((language) => [language, 'unknown']));
    return result;
  }
  const candidates = new Map(), processed = new Set();
  const sourceOf = (filename) => portable(path.relative(root, filename)) || '.';
  const add = (directory, name, spec = description(name), scope = 'project', distance = 0) => {
    const filename = path.join(directory, name), source = sourceOf(filename);
    if (!candidates.has(source)) candidates.set(source, { source, filename, anchor: inside(root, directory) ? root : directory, spec, scope, distance });
    return candidates.get(source);
  };
  function fail(item, message) {
    const { spec, source } = item;
    if (spec.taskRunner) collectTaskRunner(spec.taskRunner, source, null, message);
    if (spec.parser === 'devcontainer') {
      metadata.devcontainer ??= { source, runtimeLocation: 'unknown', configurations: [] };
      metadata.devcontainer.runtimeLocation = 'unknown';
    }
    if (spec.environment) { result.environment[spec.environment] = 'unknown'; issue(source, message); }
    else if (spec.languages?.length) unknown(spec.languages, source, message);
    else issue(source, message);
  }
  let fileAccess, rootEntries;
  try {
    fileAccess = projectFileAccess(root, await realpath(root));
    rootEntries = await fileAccess.list(root);
  } catch {
    unknown(LANGUAGES, '.', '프로젝트 루트의 선언 파일 목록을 읽을 수 없거나 탐색 한도를 초과했습니다.');
    result.environment = { containers: 'unknown', processCompose: 'unknown' };
    metadata.execution.location = 'unknown';
    metadata.execution.hostLanguages = Object.fromEntries(LANGUAGES.map((language) => [language, 'unknown']));
    return result;
  }
  const { list, safeDirectories } = fileAccess;
  async function read(item) {
    const { text, error } = await fileAccess.read(item);
    if (error) fail(item, error);
    return text;
  }
  for (const entry of rootEntries) if (description(entry.name)) add(root, entry.name);
  for (const [folder, filename, spec] of [
    ['.devcontainer', 'devcontainer.json', { environment: 'containers', parser: 'devcontainer' }],
    ['.venv', 'pyvenv.cfg', { languages: ['python'], parser: 'venv' }],
  ]) {
    if (!rootEntries.some((entry) => entry.name === folder)) continue;
    try {
      if (!await safeDirectories(root, path.join(root, folder))) throw new Error();
      if (await exists(path.join(root, folder, filename))) add(root, `${folder}/${filename}`, spec);
      else if (folder === '.venv') {
        mark('python');
        const entry = { source: '.venv', directory: '.venv', state: 'unknown', notes: ['.venv 폴더는 있으나 pyvenv.cfg 메타데이터가 없습니다.'] };
        (requirements.python.metadata.virtualEnvironments ??= []).push(entry);
        metadata.pythonVenv = { environments: requirements.python.metadata.virtualEnvironments };
        issue('.venv', entry.notes[0]);
      }
    } catch { fail({ source: folder, spec }, '설정 폴더의 링크 또는 비표준 항목은 따라가지 않습니다.'); }
  }

  const inherited = ['global.json', '.node-version', '.python-version', '.tool-versions', '.mise.toml', 'mise.toml'];
  let boundary = root;
  try {
    const rootInfo = await lstat(root);
    for (let distance = 0, directory = root; distance <= MAX_DEPTH; distance += 1, directory = path.dirname(directory)) {
      boundary = directory;
      metadata.scope.boundary = sourceOf(directory);
      const relative = sourceOf(directory);
      if (distance) {
        const info = await lstat(directory);
        if (!info.isDirectory() || info.isSymbolicLink()) { metadata.scope.boundaryKind = 'link'; issue(relative, '상위 디렉터리의 링크 경계 밖은 탐색하지 않습니다.'); break; }
        if (path.resolve(directory) === path.resolve(homedir())) { metadata.scope.boundaryKind = 'home'; break; }
        metadata.scope.ancestorDirectories.push(relative);
        for (const name of inherited) if (await exists(path.join(directory, name))) add(directory, name, description(name), 'ancestor', distance);
      }
      const repository = Boolean(await exists(path.join(directory, '.git')));
      let workspace = false;
      for (const name of ['package.json', 'pnpm-workspace.yaml', 'pnpm-workspace.yml']) {
        if (!await exists(path.join(directory, name))) continue;
        const item = { source: sourceOf(path.join(directory, name)), filename: path.join(directory, name), anchor: directory, spec: { parser: 'scope' } };
        const text = await read(item);
        if (text === null) continue;
        let data;
        try { data = name === 'package.json' ? JSON.parse(text) : yamlDocument(text); } catch { continue; }
        const patterns = name === 'package.json' ? (Array.isArray(data.workspaces) ? data.workspaces : data.workspaces?.packages) : data.packages;
        if (patterns === undefined || (distance && !memberOf(patterns, portable(path.relative(directory, root))))) continue;
        workspace = true;
        if (distance) {
          add(directory, name, description(name), 'workspace', distance);
          if (name !== 'package.json' && await exists(path.join(directory, 'package.json'))) add(directory, 'package.json', description('package.json'), 'workspace', distance);
          for (const lock of Object.keys(NODE_LOCKS)) if (await exists(path.join(directory, lock))) add(directory, lock, description(lock), 'workspace', distance);
          for (const entry of await list(directory, directory)) if (TASK_RUNNER_FILES.includes(entry.name)) add(directory, entry.name, description(entry.name), 'workspace', distance);
        }
      }
      if (repository || workspace) { metadata.scope.boundaryKind = repository ? 'repository' : 'workspace'; break; }
      if (rootInfo.isSymbolicLink()) { metadata.scope.boundaryKind = 'link'; break; }
      if (path.dirname(directory) === directory) { metadata.scope.boundaryKind = 'filesystem'; break; }
      if (distance === MAX_DEPTH) {
        metadata.scope.boundaryKind = 'limit';
        unknown(LANGUAGES, relative, '상위 선언의 탐색 깊이가 한도를 초과하여 추가 요구는 미확인입니다.');
      }
    }
  } catch { unknown(LANGUAGES, sourceOf(boundary), '상위 선언의 적용 경계를 안전하게 확인할 수 없습니다.'); }

  for (const directory of unique([root, boundary])) {
    try {
      const workflows = path.join(directory, '.github', 'workflows');
      if (!await exists(path.join(directory, '.github'))) continue;
      if (!await safeDirectories(directory, path.join(directory, '.github'))) throw new Error();
      if (!await exists(workflows)) continue;
      for (const entry of await list(workflows, directory)) if (/\.ya?ml$/i.test(entry.name)) add(directory, `.github/workflows/${entry.name}`, { parser: 'ci' }, 'ci');
    } catch { issue(sourceOf(path.join(directory, '.github/workflows')), 'CI 폴더의 링크·목록·탐색 한도를 확인할 수 없습니다.'); }
  }
  const parsers = {
    node: nodeDeclaration, python: pythonDeclaration, go: goDeclaration, cargo: cargoDeclaration,
    rust: rustDeclaration, zig: zigDeclaration, dotnet: dotnetDeclaration, mise: miseDeclaration,
    tools: toolVersions, conda: condaDeclaration, venv: venvDeclaration, compose: composeDeclaration,
    devcontainer: devcontainerDeclaration, processCompose: processDeclaration, ci: ciDeclaration,
    workspace: (text, source) => {
      try { workspaceDeclaration(yamlDocument(text).packages, source, 'pnpm'); manager('node', 'pnpm', source); }
      catch { unknown(['node'], source, 'pnpm 작업 공간 YAML의 문법·태그·별칭 한도를 확인할 수 없습니다.'); }
    },
  };
  async function processCandidates() {
    for (const item of [...candidates.values()].sort((a, b) => a.distance - b.distance || (a.source < b.source ? -1 : a.source > b.source ? 1 : 0))) {
      if (processed.has(item.source)) continue;
      processed.add(item.source);
      const { source, spec } = item;
      declaration = { source, kind: spec.parser ?? 'marker', scope: item.scope, distance: item.distance, selectedLanguages: [] };
      metadata.declarations.push(declaration);
      if (spec.parser === 'miseFileTasks') {
        collectTaskRunner('mise', source, null, 'mise-tasks 파일 작업은 폴더 존재만 기록하며 내부 파일·링크·실행 의미는 분석하지 않습니다.');
        continue;
      }
      if (spec.shared) {
        const family = spec.parser === 'mise' ? 'mise' : 'asdf';
        item.spec = { ...spec, languages: spec.languages.filter((language) => canSelectVersion(family, language, source)) };
        if (!item.spec.languages.length && !spec.taskRunner) continue;
      }
      if (item.scope === 'ancestor' && !['mise', 'tools'].includes(spec.parser)) {
        const language = spec.languages[0];
        if (!selectVersion(path.basename(source), language, source)) continue;
      } else if (spec.parser === 'pin' && ['.node-version', '.python-version'].includes(path.basename(source))) selectVersion(path.basename(source), spec.languages[0], source);
      else if (spec.parser === 'dotnet') selectVersion('global.json', 'dotnet', source);
      if (!spec.shared) for (const language of spec.languages ?? []) mark(language);
      if (spec.environment === 'containers' && result.environment.containers === 'not_required') result.environment.containers = 'unknown';
      const text = await read(item);
      if (text === null) continue;
      if (spec.taskRunner) collectTaskRunner(spec.taskRunner, source, text);
      if (spec.manager) for (const language of spec.languages) manager(language, spec.manager, source);
      if (spec.lock) requirements[spec.languages[0]].lockFiles.push(source);
      if (spec.integrity) {
        (requirements.go.metadata.integrityFiles ??= []).push(source);
        note('go', 'go.sum 계열 파일은 의존성 무결성 해시이며 잠금 파일이나 Go 버전 선언이 아닙니다.');
      }
      if (spec.environment === 'processCompose' && result.environment.processCompose !== 'unknown') result.environment.processCompose = 'required';
      if (!spec.parser) {
        if (spec.environment === 'containers') metadata.dockerfiles.push({ source, runtimeLocation: 'unknown' });
        continue;
      }
      try {
        if (spec.parser === 'pin') pin(text, source, spec.languages[0]);
        else if (spec.parser === 'taskRunner') continue;
        else parsers[spec.parser](text, source);
      } catch { fail(item, '선언 파일의 정적 필드 분석을 완료할 수 없습니다.'); }
    }
    declaration = undefined;
  }
  await processCandidates();

  let workspaceEntries = 0;
  for (const workspace of pendingWorkspaces) {
    const base = path.resolve(root, path.dirname(workspace.source));
    workspace.root = sourceOf(base);
    if (!inside(root, base)) { workspace.members = ['.']; continue; }
    const found = new Set(), visited = new Set();
    async function walk(directory, pieces, index, depth = 0) {
      const key = `${directory}\0${pieces.join('/')}\0${index}`;
      if (visited.has(key)) return;
      visited.add(key);
      if (depth > MAX_DEPTH || ++workspaceEntries > MAX_ENTRIES) throw new Error();
      if (!await safeDirectories(base, directory)) throw new Error();
      if (index === pieces.length) {
        if (await exists(path.join(directory, 'package.json'))) found.add(directory);
        return;
      }
      const piece = pieces[index];
      if (piece === '**') await walk(directory, pieces, index + 1, depth);
      const entries = await list(directory, base);
      for (const entry of entries) {
        if (/^(?:node_modules|\.git|\.venv|vendor|target|dist)$/.test(entry.name)) continue;
        if (piece !== '**' && !matches(piece, entry.name)) continue;
        if (entry.isSymbolicLink()) { uncertain(workspace, workspace.source, '작업 공간 패턴에 맞는 폴더 링크는 따라가지 않습니다.'); continue; }
        if (entry.isDirectory()) await walk(path.join(directory, entry.name), pieces, piece === '**' ? index : index + 1, depth + 1);
      }
    }
    try {
      for (const pattern of workspace.patterns.filter((value) => !value.startsWith('!'))) await walk(base, pattern.split('/'), 0);
      for (const directory of [...found].sort()) {
        const relative = portable(path.relative(base, directory));
        if (!memberOf(workspace.patterns, relative)) continue;
        workspace.members.push(sourceOf(directory));
        for (const entry of await list(directory, base)) if (TASK_RUNNER_FILES.includes(entry.name) || has(NODE_LOCKS, entry.name)) add(directory, entry.name, description(entry.name), 'workspace');
      }
    } catch { uncertain(workspace, workspace.source, '작업 공간의 폴더·링크·깊이·항목 한도를 확인하지 못하여 일부 구성원은 미확인입니다.'); }
  }
  await processCandidates();
  for (const { source, owner } of composeReferences) {
    const target = path.resolve(root, source);
    const item = add(root, source, { environment: 'containers', parser: 'compose' });
    if (!inside(root, target)) { uncertain(owner, source, '허용한 프로젝트 밖의 Compose 참조는 읽지 않습니다.'); continue; }
    await processCandidates();
    const compose = metadata.compose.configurations.find((entry) => entry.source === item.source);
    if (!compose || compose.state === 'unknown') uncertain(owner, owner.source, 'devcontainer의 Compose 참조를 완전히 읽거나 병합하지 못했습니다.');
  }
  if (metadata.devcontainer) for (const config of metadata.devcontainer.configurations) {
    if (config.mode !== 'compose' || !config.service) continue;
    const services = metadata.compose.configurations.filter((entry) => config.composeFiles.includes(entry.source)).flatMap((entry) => entry.services);
    if (!services.some((service) => service.name === config.service)) {
      config.runtimeLocation = 'unknown';
      metadata.devcontainer.runtimeLocation = 'unknown';
      uncertain(config, config.source, 'devcontainer가 선택한 Compose 서비스를 허용한 파일에서 확인하지 못했습니다.');
    }
  }
  result.files = [...candidates.keys()].sort();
  for (const language of LANGUAGES) {
    const requirement = requirements[language];
    requirement.packageManagers = [...new Map(requirement.packageManagers.map((item) => [`${item.name}\0${item.source}\0${item.version ?? ''}`, item])).values()];
    requirement.notes = unique(requirement.notes);
    if (requirement.metadata.versionManagers) requirement.metadata.versionManagers = unique(requirement.metadata.versionManagers);
    const pins = requirement.versionRequests.filter((entry) => entry.kind === 'exact');
    // Multiple versions within one file can be intentional alternatives (pyenv/mise).
    const sources = unique(pins.map((entry) => entry.source));
    if (sources.length > 1 && sources.every((source) => pins.filter((entry) => entry.source === source).length === 1) && unique(pins.map((entry) => entry.value.replace(/^v/, ''))).length > 1) {
      unknown([language], sources.join(', '), '서로 다른 파일의 고정 버전 선언이 충돌하므로 선택된 버전을 확정하지 않았습니다.');
    }
    if (language === 'node' && unique(requirement.packageManagers.map((item) => item.name)).length > 1) issue(unique(requirement.packageManagers.map((item) => item.source)).join(', '), '여러 Node.js 패키지 관리자 선언이 발견되어 작업에 적용되는 관리자를 확인해야 합니다.');
    if (requirement.state === 'required' && !requirement.versionRequests.length) note(language, '관련 선언은 있으나 정적으로 확인한 언어 버전 요구는 없습니다.');
  }
  if (result.files.includes('rust-toolchain') && result.files.includes('rust-toolchain.toml')) unknown(['rust'], 'rust-toolchain, rust-toolchain.toml', 'Rust 도구 모음 파일이 둘 다 존재하여 선택 우선순위를 별도로 확인해야 합니다.');
  metadata.taskRunnerLanguages = [...localLanguages].filter((language) => requirements[language].state === 'required');
  metadata.taskRunnerWorkflows = taskRunnerWorkflowEvidence(workflowJobs);
  const containerContext = metadata.devcontainer?.runtimeLocation;
  metadata.execution.location = containerContext ?? 'host';
  for (const language of LANGUAGES) {
    metadata.execution.hostLanguages[language] = requirements[language].state === 'not_required' || (!localLanguages.has(language) && requirements[language].metadata.ciRequirements?.length)
      ? 'not_required' : containerContext === 'container' ? 'not_required' : containerContext === 'unknown' ? 'unknown' : requirements[language].state;
  }
  if (!metadata.devcontainer && localLanguages.size) metadata.execution.evidence.push({ source: '.', kind: 'local-declarations', location: 'host', reason: '로컬 언어 선언의 호스트 적용을 기본값으로 유지하며 보조 Compose 서비스의 존재로 제외하지 않습니다.' });
  return result;
}
