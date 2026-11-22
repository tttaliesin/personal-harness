import { parse as parseToml } from 'smol-toml';
import { parseDocument } from 'yaml';

const MAX_BYTES = 256 * 1024;
const MAX_ENTRIES = 4096;
const MAX_DEPTH = 32;
const has = (value, key) => Object.hasOwn(value, key);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const unique = (values) => [...new Set(values)];
const safeName = (value) => typeof value === 'string' && /^[\p{L}\p{N}_][\p{L}\p{N}_.:-]{0,127}$/u.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value);
const dynamic = (value) => typeof value === 'string' && /\{\{|\$\{|\$\(|`|\$[A-Za-z_]/.test(value);
const safeDirectory = (value) => typeof value === 'string' && value.length > 0 && value.length <= 240 && value.trim() === value &&
  !/[\x00-\x1f\x7f@$%{}?*`|&;<>"']|:\/\//.test(value) && !value.replace(/^[A-Za-z]:[\\/]/, '').includes(':');

// Finite names allow workspace discovery to reuse the project's bounded, no-link reader.
export const TASK_RUNNER_FILES = [
  'mise.toml', '.mise.toml',
  ...['Taskfile', 'taskfile'].flatMap((name) => ['yml', 'yaml'].flatMap((extension) => [
    `${name}.${extension}`, `${name}.dist.${extension}`, `${name}.${extension}.dist`,
  ])),
  'Justfile', 'justfile', '.justfile', 'Makefile', 'makefile', 'GNUmakefile', 'package.json', 'mise-tasks',
];

export function taskRunnerTool(name) {
  if (name === 'mise.toml' || name === '.mise.toml' || name === 'mise-tasks') return 'mise';
  if (/^(?:Taskfile|taskfile)(?:\.dist\.ya?ml|\.ya?ml(?:\.dist)?)$/.test(name)) return 'task';
  if (['Justfile', 'justfile', '.justfile'].includes(name)) return 'just';
  if (['Makefile', 'makefile', 'GNUmakefile'].includes(name)) return 'make';
  if (name === 'package.json') return 'npm';
  return null;
}

function boundedGraph(data) {
  let count = 0;
  const ancestors = new Set();
  function visit(value, depth) {
    if (++count > MAX_ENTRIES || depth > MAX_DEPTH) throw new Error();
    if (value === null || typeof value !== 'object') return;
    if (ancestors.has(value)) throw new Error();
    ancestors.add(value);
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error();
      visit(item, depth + 1);
    }
    ancestors.delete(value);
  }
  visit(data, 0);
  if (!object(data)) throw new Error();
  return data;
}

function yaml(text) {
  const document = parseDocument(text, { merge: true, uniqueKeys: true, stringKeys: true, prettyErrors: false });
  if (document.errors.length || document.warnings.length) throw new Error();
  return boundedGraph(document.toJS({ maxAliasCount: 64 }) ?? {});
}

function json(text) {
  const data = JSON.parse(text), stack = [];
  // JSON.parse alone silently overwrites duplicate script names.
  const tokens = text.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]/g) ?? [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '{') stack.push(new Set());
    else if (token === '[') stack.push(null);
    else if (token === '}' || token === ']') stack.pop();
    else if (token.startsWith('"') && tokens[index + 1] === ':') {
      const key = JSON.parse(token), keys = stack.at(-1);
      if (!keys || keys.has(key)) throw new Error();
      keys.add(key);
    }
  }
  return boundedGraph(data);
}

function unknown(record, note) {
  record.state = 'unknown';
  if (!record.notes.includes(note)) record.notes.push(note);
}

function environmentKeys(value, record) {
  if (!object(value)) { unknown(record, '환경 선언의 정적 키 매핑을 확인할 수 없습니다.'); return []; }
  const keys = [];
  for (const [key, entry] of Object.entries(value)) {
    if (/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key)) keys.push(key);
    else unknown(record, '지원하지 않는 환경 키나 환경 로더는 해석하지 않습니다.');
    if (object(entry) || Array.isArray(entry) || dynamic(entry)) unknown(record, '환경 값의 템플릿·동적 계산은 평가하지 않습니다.');
  }
  return keys;
}

function shell(value, record) {
  const parts = Array.isArray(value) ? value : typeof value === 'string' ? value.trim().split(/\s+/) : [];
  const executable = parts[0];
  // A command string passed as a shell argument must never become report metadata.
  const flags = new Set(['-c', '-e', '-u', '-x', '-s', '-ec', '-eu', '-euc', '-eux', '-euxc', '-o', 'pipefail',
    '--noprofile', '--norc', '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '-File', '/C', '/D', '/S']);
  if (!parts.length || parts.length > 16 || typeof executable !== 'string' ||
      !/^(?:sh|bash|zsh|fish|nu|pwsh|powershell|cmd)(?:\.exe)?$/i.test(executable) ||
      !parts.slice(1).every((part) => flags.has(part))) {
    unknown(record, '셸의 정적 실행 파일과 알려진 인수만 기록합니다.');
    return undefined;
  }
  return parts;
}

function names(values, record) {
  if (!Array.isArray(values)) { unknown(record, '작업 의존성의 정적 이름 목록을 확인할 수 없습니다.'); return []; }
  const result = [];
  for (const value of values) {
    if (safeName(value)) result.push(value);
    else unknown(record, '작업 의존성의 템플릿·패턴·인수 계산은 해석하지 않습니다.');
  }
  return unique(result);
}

function context(data, record, inherited = {}) {
  const detail = { ...inherited };
  if (has(data, 'dir')) {
    delete detail.directory;
    if (safeDirectory(data.dir)) detail.directory = data.dir;
    else unknown(record, '작업 디렉터리의 동적 표현이나 비정적 값은 해석하지 않습니다.');
  }
  if (has(data, 'shell')) {
    delete detail.shell;
    const argv = shell(data.shell, record);
    if (argv) detail.shell = argv;
  }
  if (has(data, 'env')) detail.environmentKeys = unique([...(inherited.environmentKeys ?? []), ...environmentKeys(data.env, record)]);
  return detail;
}

function inspectExpressions(value, record) {
  if (dynamic(value)) unknown(record, '템플릿·변수 참조·동적 계산은 실행하거나 확장하지 않습니다.');
  else if (value !== null && typeof value === 'object') for (const item of Object.values(value)) inspectExpressions(item, record);
}

function addTask(record, name, detail) {
  if (!safeName(name)) { unknown(record, '지원하지 않는 작업 이름이나 동적 이름은 기록하지 않습니다.'); return; }
  if (record.tasks.includes(name)) { unknown(record, '중복 작업 선언의 실제 선택은 확정하지 않습니다.'); return; }
  record.tasks.push(name);
  if (detail && Object.keys(detail).length) (record.taskDetails ??= []).push({ name, ...detail });
}

function mise(data, record) {
  const references = ['include', 'includes', 'task_config', 'task_templates'].some((key) => has(data, key));
  if (!has(data, 'tasks') && !references) return null;
  if (references) unknown(record, 'mise 외부 포함·파일 작업·작업 템플릿은 따라가거나 평가하지 않습니다.');
  if (!has(data, 'tasks')) return record;
  if (!object(data.tasks)) { unknown(record, 'mise tasks의 정적 테이블을 확인할 수 없습니다.'); return record; }
  const inherited = context(data, record);
  inspectExpressions(data.tasks, record);
  for (const [name, task] of Object.entries(data.tasks)) {
    let detail;
    if (typeof task === 'string') { /* Command bodies are deliberately discarded. */ }
    else if (object(task)) {
      detail = context(task, record, inherited);
      const dependencies = [];
      for (const field of ['depends', 'depends_post', 'wait_for']) if (has(task, field)) dependencies.push(...names(task[field], record));
      if (dependencies.length) detail.dependencies = unique(dependencies);
      if (has(task, 'alias')) unknown(record, 'mise 작업 별칭의 선택 의미는 해석하지 않습니다.');
      if (['file', 'extends', 'sources', 'outputs', 'usage', 'tools', 'platforms', 'hide', 'raw'].some((key) => has(task, key))) {
        unknown(record, 'mise 작업의 파일·상속·조건·실행 옵션은 정적 이름 분석 범위 밖입니다.');
      }
      if (has(task, 'run')) {
        if (!(typeof task.run === 'string' || Array.isArray(task.run) && task.run.every((entry) => typeof entry === 'string'))) {
          unknown(record, 'mise run의 문자열 또는 문자열 목록을 확인할 수 없습니다.');
        }
      } else if (!dependencies.length) unknown(record, 'mise 작업의 명령 또는 정적 의존성 선언을 확인할 수 없습니다.');
    } else unknown(record, 'mise 작업 정의의 정적 형식을 확인할 수 없습니다.');
    addTask(record, name, detail ?? inherited);
  }
  return record;
}

function taskfile(data, record) {
  if (!(typeof data.version === 'number' && data.version === 3 || typeof data.version === 'string' && /^3(?:\.\d+){0,2}$/.test(data.version))) {
    unknown(record, 'Taskfile의 지원하는 버전 3 선언을 확인할 수 없습니다.');
  }
  if (has(data, 'includes')) unknown(record, 'Taskfile의 로컬·외부·원격 include는 따라가지 않습니다.');
  if (has(data, 'dotenv')) unknown(record, 'Taskfile의 환경 파일을 읽거나 확장하지 않습니다.');
  inspectExpressions(data, record);
  const inspectVariables = (variables) => {
    if (variables !== undefined && (!object(variables) || Object.values(variables).some((value) => object(value)))) {
      unknown(record, 'Taskfile 변수의 셸 조회·참조·동적 계산은 평가하지 않습니다.');
    }
  };
  inspectVariables(data.vars);
  const inherited = context(data, record);
  if (!object(data.tasks)) { unknown(record, 'Taskfile tasks의 정적 매핑을 확인할 수 없습니다.'); return record; }
  for (const [name, task] of Object.entries(data.tasks)) {
    let detail = inherited;
    if (typeof task === 'string' || Array.isArray(task) && task.every((entry) => typeof entry === 'string')) { /* Shorthand commands. */ }
    else if (object(task)) {
      detail = context(task, record, inherited);
      inspectVariables(task.vars);
      const dependencies = [];
      if (has(task, 'deps')) {
        if (!Array.isArray(task.deps)) unknown(record, 'Taskfile deps의 정적 목록을 확인할 수 없습니다.');
        else for (const dependency of task.deps) {
          if (typeof dependency === 'string') dependencies.push(...names([dependency], record));
          else if (object(dependency) && safeName(dependency.task)) {
            dependencies.push(dependency.task);
            if (Object.keys(dependency).some((key) => key !== 'task')) unknown(record, 'Taskfile 의존 작업의 변수·조건·반복은 해석하지 않습니다.');
          } else unknown(record, 'Taskfile 의존 작업의 동적 이름이나 반복은 해석하지 않습니다.');
        }
      }
      if (has(task, 'cmds')) {
        if (!Array.isArray(task.cmds)) unknown(record, 'Taskfile cmds의 정적 목록을 확인할 수 없습니다.');
        else for (const command of task.cmds) {
          if (typeof command === 'string') continue;
          if (!object(command)) { unknown(record, 'Taskfile 명령 항목의 정적 형식을 확인할 수 없습니다.'); continue; }
          if (has(command, 'task')) dependencies.push(...names([command.task], record));
          if (has(command, 'cmd') && typeof command.cmd !== 'string') unknown(record, 'Taskfile 명령 문자열의 형식을 확인할 수 없습니다.');
          if (Object.keys(command).some((key) => !['task', 'cmd', 'silent', 'ignore_error'].includes(key))) {
            unknown(record, 'Taskfile 명령의 변수·조건·반복·지연 실행은 해석하지 않습니다.');
          }
        }
      } else if (!dependencies.length) unknown(record, 'Taskfile 작업의 명령 또는 정적 의존성을 확인할 수 없습니다.');
      if (dependencies.length) detail = { ...detail, dependencies: unique(dependencies) };
      if (['preconditions', 'requires', 'platforms', 'if', 'for', 'aliases', 'dotenv'].some((key) => has(task, key))) {
        unknown(record, 'Taskfile 작업의 조건·반복·별칭·환경 파일은 해석하지 않습니다.');
      }
    } else unknown(record, 'Taskfile 작업 정의의 정적 형식을 확인할 수 없습니다.');
    addTask(record, name, detail);
  }
  if (!record.tasks.length) unknown(record, 'Taskfile에서 정적으로 식별한 작업 이름이 없습니다.');
  return record;
}

function npm(data, record) {
  if (!has(data, 'scripts')) return null;
  if (!object(data.scripts)) { unknown(record, 'package.json scripts의 정적 객체를 확인할 수 없습니다.'); return record; }
  for (const [name, command] of Object.entries(data.scripts)) {
    if (typeof command !== 'string') unknown(record, 'npm script의 명령 문자열 형식을 확인할 수 없습니다.');
    else inspectExpressions(command, record);
    addTask(record, name);
  }
  return record;
}

function make(text, record) {
  record.notes.push('Make는 단순한 정적 대상 이름과 의존 이름만 식별하며 전체 문법을 해석하지 않습니다.');
  let recipe = false, defineDepth = 0, conditionalDepth = 0, continued = false;
  for (const raw of text.split(/\r?\n/)) {
    const wasContinued = continued;
    continued = /\\\s*$/.test(raw);
    if (wasContinued || continued) {
      unknown(record, 'Make의 줄 연속으로 결합되는 구문은 식별하지 않습니다.');
      continue;
    }
    if (raw.startsWith('\t')) {
      if (!recipe && !defineDepth) unknown(record, 'Make의 대상 밖 레시피 또는 사용자 지정 구문을 확인할 수 없습니다.');
      if (dynamic(raw)) unknown(record, 'Make 레시피의 변수 확장·동적 계산은 평가하지 않습니다.');
      continue;
    }
    const line = raw.replace(/\s*#.*$/, '').trim();
    if (!line) continue;
    recipe = false;
    if (/^(?:override\s+)?\.RECIPEPREFIX\s*[:?+!]?=/.test(line)) {
      unknown(record, 'Make의 사용자 지정 레시피 접두사 이후 구문은 식별하지 않습니다.');
      break;
    }
    if (/^(?:(?:override|export)\s+)?define\b/.test(line)) {
      defineDepth += 1;
      unknown(record, 'Make define·eval로 생성되는 선언은 해석하지 않습니다.');
      continue;
    }
    if (line === 'endef') { if (defineDepth) defineDepth -= 1; else unknown(record, 'Make 블록의 짝을 확인할 수 없습니다.'); continue; }
    if (defineDepth) continue;
    if (/^(?:ifeq|ifneq|ifdef|ifndef)\b/.test(line)) { conditionalDepth += 1; unknown(record, 'Make 조건에 따른 대상 선택은 평가하지 않습니다.'); continue; }
    if (/^endif\b/.test(line)) { if (conditionalDepth) conditionalDepth -= 1; else unknown(record, 'Make 조건 블록의 짝을 확인할 수 없습니다.'); continue; }
    if (/^else\b/.test(line)) { unknown(record, 'Make 조건에 따른 대상 선택은 평가하지 않습니다.'); continue; }
    if (/^(?:-?include|sinclude|load)\b/.test(line)) { unknown(record, 'Make include·외부 선언은 읽거나 실행하지 않습니다.'); continue; }
    if (/^[^:]*?(?::=|::=|\?=|\+=|!=|=)/.test(line)) {
      unknown(record, 'Make 변수 선언·대상 계산·사용자 지정 레시피 설정은 해석하지 않습니다.');
      continue;
    }
    if (conditionalDepth) continue;
    const match = line.match(/^([^:]+):([^:]*)$/);
    if (!match || /[\\$%{}=]/.test(match[1])) { unknown(record, 'Make 패턴·계산 대상·복합 규칙은 정적으로 식별하지 않습니다.'); continue; }
    const targets = match[1].trim().split(/\s+/), prerequisites = match[2].split(';', 1)[0].trim();
    recipe = true;
    if (targets.every((target) => /^\.[A-Z_]+$/.test(target))) {
      if (targets.some((target) => target !== '.PHONY')) unknown(record, 'Make 특수 대상의 실행 의미는 해석하지 않습니다.');
      continue;
    }
    if (!targets.every(safeName)) { unknown(record, 'Make의 단순한 정적 대상 이름만 기록합니다.'); continue; }
    let detail;
    if (prerequisites) {
      const dependencies = names(prerequisites.replace(/\|/g, ' ').split(/\s+/), record);
      if (dependencies.length) detail = { dependencies };
    }
    for (const target of targets) addTask(record, target, detail);
    if (line.includes(';') && dynamic(line.slice(line.indexOf(';') + 1))) unknown(record, 'Make 레시피의 변수 확장·동적 계산은 평가하지 않습니다.');
  }
  if (defineDepth || conditionalDepth || !record.tasks.length) unknown(record, 'Make의 정적 대상이 없거나 블록 구조를 확인할 수 없습니다.');
  return record;
}

function openJustString(line, delimiter = null) {
  for (let index = 0; index < line.length; index += 1) {
    if (delimiter) {
      if (delimiter.includes('"') && line[index] === '\\') { index += 1; continue; }
      if (line.startsWith(delimiter, index)) { index += delimiter.length - 1; delimiter = null; }
    } else {
      if (line[index] === '#') break;
      const token = /^(?:'''|"""|```|`|'|")/.exec(line.slice(index))?.[0];
      if (token) { delimiter = token; index += token.length - 1; }
    }
  }
  return delimiter;
}

function just(text, record) {
  record.notes.push('Just는 인수 없는 단순 레시피 이름과 의존 이름만 식별하며 전체 문법을 해석하지 않습니다.');
  let recipe = false, block = null, windowsAttribute = false, defaultShell, windowsShell;
  for (const raw of text.split(/\r?\n/)) {
    // Never treat headers embedded in multiline strings or recipe bodies as definitions.
    if (block) {
      block = openJustString(raw, block);
      continue;
    }
    if (/^\s/.test(raw)) {
      if (raw.trim() && !recipe) unknown(record, 'Just의 레시피 밖 들여쓰기 구문은 해석하지 않습니다.');
      if (dynamic(raw)) unknown(record, 'Just 레시피의 템플릿·동적 계산은 평가하지 않습니다.');
      continue;
    }
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    recipe = false;
    if (line === '[windows]') {
      if (windowsAttribute) unknown(record, '중복 Just 속성의 적용을 확인할 수 없습니다.');
      if (!record.notes.includes('Just [windows] 속성의 실행 지원은 설치 버전에서 별도로 확인해야 합니다.')) {
        record.notes.push('Just [windows] 속성의 실행 지원은 설치 버전에서 별도로 확인해야 합니다.');
      }
      windowsAttribute = true;
      continue;
    }
    const shellSetting = line.match(/^set\s+(shell|windows-shell)\s*:=\s*(\[.*\])\s*(?:#.*)?$/);
    if (shellSetting) {
      let argv;
      try {
        const value = JSON.parse(shellSetting[2]);
        if (Array.isArray(value)) argv = shell(value, record);
      } catch { /* Unsupported Just expressions are not evaluated. */ }
      if (!argv) unknown(record, 'Just 셸 설정은 알려진 셸과 인수의 literal 문자열 배열만 지원합니다.');
      else if (shellSetting[1] === 'windows-shell' || windowsAttribute) {
        if (windowsShell) unknown(record, '중복 Windows Just 셸 설정의 선택을 확정하지 않습니다.');
        windowsShell = argv;
      } else {
        if (defaultShell) unknown(record, '중복 Just 셸 설정의 선택을 확정하지 않습니다.');
        defaultShell = argv;
      }
      windowsAttribute = false;
      continue;
    }
    const multiline = openJustString(line);
    if (multiline) {
      block = multiline;
      unknown(record, 'Just의 다중 행 문자열·표현식 선언은 해석하지 않습니다.');
      continue;
    }
    if (/^(?:import\??|mod\??|alias|set|export|unexport)\b/.test(line) || line.includes(':=') || line.startsWith('[')) {
      unknown(record, 'Just import·module·별칭·설정·속성·변수 표현식은 해석하지 않습니다.');
      windowsAttribute = false;
      continue;
    }
    const match = line.match(/^@?([\p{L}\p{N}_][\p{L}\p{N}_.-]*):\s*([^#]*?)(?:\s+#.*)?$/u);
    if (!match) { unknown(record, 'Just의 매개변수·동적 선언·지원하지 않는 구문은 식별하지 않습니다.'); continue; }
    recipe = true;
    windowsAttribute = false;
    const dependencies = match[2].trim() ? names(match[2].trim().split(/\s+/), record) : [];
    addTask(record, match[1], dependencies.length ? { dependencies } : undefined);
  }
  const argv = windowsShell ?? defaultShell;
  if (argv) {
    record.taskDetails ??= [];
    for (const name of record.tasks) {
      const detail = record.taskDetails.find((entry) => entry.name === name);
      if (detail) detail.shell = argv;
      else record.taskDetails.push({ name, shell: argv });
    }
  }
  if (block || windowsAttribute || !record.tasks.length) unknown(record, 'Just의 정적 레시피가 없거나 문자열·속성 구조를 확인할 수 없습니다.');
  return record;
}

/** Pure static parsing: only names and allowlisted context cross the report boundary. */
export function analyzeTaskRunner({ tool, source, text, reason }) {
  const record = { tool, source, state: 'declared', tasks: [], notes: [] };
  if (typeof text !== 'string') {
    unknown(record, reason ?? '작업 실행기 선언을 안전하게 읽을 수 없습니다.');
    return record;
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES || text.includes('\0')) {
    unknown(record, '작업 실행기 선언의 크기 또는 텍스트 한도를 초과했습니다.');
    return record;
  }
  try {
    if (tool === 'mise') return mise(boundedGraph(parseToml(text, { maxDepth: MAX_DEPTH, integersAsBigInt: 'asNeeded', unsafeKeyBehaviour: 'throw' })), record);
    if (tool === 'task') return taskfile(yaml(text), record);
    if (tool === 'npm') return npm(json(text), record);
    if (text.split(/\r?\n/).length > MAX_ENTRIES) throw new Error();
    if (tool === 'make') return make(text, record);
    if (tool === 'just') return just(text, record);
    throw new Error();
  } catch {
    // Parser errors may contain source snippets, credentials or commands.
    unknown(record, '작업 실행기 선언의 문법·중복 키·태그·별칭·중첩 한도를 확인할 수 없습니다.');
    return record;
  }
}

const npmInstallFlags = new Set(['--ignore-scripts', '--no-audit', '--no-fund']);
const npmInstallCommands = new Set(['ci', 'install', 'i']);

function singleCommand(run, line) {
  return run.trim() === line && !/[\r\n]/.test(line) && !/[^\S \t\r\n]/.test(run);
}

/** Identify the leading CI invocation without evaluating the shell program. */
export function taskRunnerInvocation(run, { atProjectRoot = false } = {}) {
  if (typeof run !== 'string') return null;
  const line = run.split(/\r?\n/).map((value) => value.trim()).find((value) => value && !value.startsWith('#'));
  if (!line) return null;
  const match = line.match(/^(mise(?:\.exe)?|task(?:\.exe)?|just(?:\.exe)?|make(?:\.exe)?|npm(?:\.cmd|\.exe)?)(?=\s|$)/i);
  if (!match) return null;
  const tool = match[1].toLowerCase().replace(/\.(?:exe|cmd)$/, '');
  const result = { tool, state: 'declared' };
  const rest = line.slice(match[0].length).trim(), tokens = rest.split(/\s+/).filter(Boolean);
  const single = singleCommand(run, line);
  if (!tokens.length) return result;
  if (single && rest === '--version') return { ...result, kind: 'tool_inspection' };
  if (single && tool === 'mise' && rest === 'install') return { ...result, kind: 'tool_setup' };
  if (tool === 'npm' && npmInstallCommands.has(tokens[0])) {
    if (single && tokens.slice(1).every((token) => npmInstallFlags.has(token))) result.kind = 'dependency_install';
    else result.state = 'unknown';
    return result;
  }
  let target;
  let taskArgumentCount = 1;
  if (tool === 'mise') {
    if (['run', 'r'].includes(tokens[0])) target = tokens[1];
    else { result.state = 'unknown'; return result; }
    taskArgumentCount = 2;
  } else if (tool === 'npm') {
    const runsScript = ['run', 'run-script'].includes(tokens[0]);
    if (runsScript) target = tokens[1];
    else if (['test', 'start', 'stop', 'restart'].includes(tokens[0])) target = tokens[0];
    else { result.state = 'unknown'; return result; }
    if (runsScript) taskArgumentCount = 2;
  } else target = tokens[0];
  if (target !== undefined && safeName(target)) result.task = target;
  else result.state = 'unknown';
  if (dynamic(rest) || /[|&;<>\\]/.test(rest) || tokens[0].startsWith('-')) result.state = 'unknown';
  if (atProjectRoot && tokens.length === taskArgumentCount && result.state === 'declared' && single) result.atProjectRoot = true;
  return result;
}
