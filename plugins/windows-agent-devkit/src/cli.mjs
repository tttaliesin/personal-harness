#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { diagnose, VERSION } from './doctor.mjs';
const LANGUAGES = ['node', 'python', 'go', 'rust', 'zig', 'dotnet'];
const STATUS_LABELS = { pass: '통과', fail: '요구 위반', warn: '검토', unknown: '미확인', skipped: '생략' };
const OPTIONS = {
  project: { type: 'string' },
  format: { type: 'string', default: 'text' },
  languages: { type: 'string' },
  native: { type: 'boolean', default: false },
  wsl: { type: 'boolean', default: false },
  containers: { type: 'boolean', default: false },
  'process-compose': { type: 'boolean', default: false },
  app: { type: 'boolean', default: false },
  'codex-executable': { type: 'string' },
  ide: { type: 'boolean', default: false },
  storage: { type: 'string' },
  'github-auth': { type: 'boolean', default: false },
  'state-dir': { type: 'string' },
  'timeout-ms': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', default: false },
};
export const HELP = `Windows Agent Devkit ${VERSION}

node dist/cli.mjs [doctor] [옵션]

환경을 읽기 전용으로 진단하고 직접 실행할 명령을 안내합니다.

  --project <경로>          프로젝트 디렉터리, 기본값 현재 경로
  --format <text|json>      출력 형식, 기본값 text
  --languages <목록>       auto 또는 node,python,go,rust,zig,dotnet 쉼표 목록
  --native                 호스트의 언어 도구 요구를 명시
  --wsl / --containers / --process-compose   호스트 도구와 설정 정보 점검 선택
  --app                    앱과 공유하는 플러그인 설치 목록 조회
  --codex-executable <경로> 검증할 Codex 네이티브 실행 파일
  --ide                    VS Code와 네이티브 빌드 도구 점검 선택
  --storage <경로>          대상 볼륨·Dev Drive 메타데이터 조회
  --github-auth            GitHub CLI 원격 인증 조회 선택
  --state-dir <경로>       기존 도구 유지 사유를 조회할 상태 디렉터리
  --timeout-ms <정수>      조회별 제한 시간, 기본값 5000, 범위 100..30000
  --help / -h              도움말
  --version                CLI 버전

종료 코드  0 완료 · 1 요구 위반 · 2 입력 또는 진단 오류
`;

export function parseOptions(args) {
  const tokens = [...args];
  const action = tokens[0] && !tokens[0].startsWith('-') ? tokens.shift() : 'doctor';
  if (action !== 'doctor') throw new Error('지원하지 않는 명령입니다. doctor를 사용하세요.');
  let values;
  try {
    ({ values } = parseArgs({ args: tokens, allowPositionals: false, strict: true, options: OPTIONS }));
  } catch (error) {
    if (error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') throw new Error('지원하지 않는 옵션입니다. --help에서 진단 옵션을 확인하세요.');
    if (error.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') throw new Error('옵션 값이 누락되었거나 형식이 잘못되었습니다. --help에서 진단 옵션을 확인하세요.');
    if (error.code === 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL') throw new Error('명령이나 옵션에 속하지 않는 인수가 있습니다.');
    throw error;
  }
  if (!['text', 'json'].includes(values.format)) throw new Error('--format은 text 또는 json이어야 합니다.');
  const languages = !values.languages || values.languages === 'auto' ? [] : [...new Set(values.languages.split(',').map((language) => language.trim()))];
  if (languages.some((language) => !LANGUAGES.includes(language))) throw new Error('--languages에 지원하지 않는 계열이 있습니다.');
  const timeout = values['timeout-ms'] ?? '5000';
  if (!/^\d+$/.test(timeout) || Number(timeout) < 100 || Number(timeout) > 30000) throw new Error('--timeout-ms는 100..30000 범위의 정수여야 합니다.');
  const pathOption = (name) => values[name] === undefined ? undefined : resolve(values[name]);
  return {
    action,
    projectPath: resolve(values.project ?? process.cwd()),
    format: values.format,
    help: values.help,
    version: values.version,
    languages,
    native: values.native,
    wsl: values.wsl,
    containers: values.containers,
    processCompose: values['process-compose'],
    app: values.app,
    codexExecutable: pathOption('codex-executable'),
    ide: values.ide,
    storage: pathOption('storage'),
    githubAuth: values['github-auth'],
    stateDir: pathOption('state-dir'),
    timeoutMs: Number(timeout),
  };
}

export function formatReport(report) {
  const lines = [`Windows Agent Devkit ${report.pluginVersion}`, `프로젝트: ${report.project.root}`, `실행 환경: ${report.context.platform}, ${report.context.diagnosticShell?.name ?? '미확인'} ${report.context.diagnosticShell?.version ?? ''}`, ''];
  for (const check of report.checks) {
    lines.push(`[${STATUS_LABELS[check.status]}] ${check.checkId}: ${check.message}`);
    if (check.resolvedPath) lines.push(`  경로: ${check.resolvedPath}`);
    if (typeof check.observed === 'string') lines.push(`  관찰: ${check.observed}`);
    if (check.support?.status && check.support.status !== 'unknown') lines.push(`  공식 지원 계열: ${check.support.status} (${check.support.checkedOn})`);
    if (check.status === 'fail' || check.status === 'warn') {
      for (const requirement of Array.isArray(check.requirement) ? check.requirement : []) {
        if (typeof requirement.value !== 'string') continue;
        const declaration = [requirement.source, requirement.field].filter(Boolean).join(' / ');
        lines.push(`  요구: ${requirement.value}${declaration ? ` (${declaration})` : ''}`);
      }
      if (check.nextAction) lines.push(`  다음 조치: ${check.nextAction}`);
    }
  }
  if (report.taskRunners) {
    const { recommendation } = report.taskRunners;
    const decision = recommendation.action === 'keep' ? `기존 ${recommendation.expected} 유지`
      : recommendation.action === 'suggest' ? `${recommendation.expected} 도입 제안` : '판단 보류';
    lines.push('', `작업 실행기 권장: ${decision}`, `  ${recommendation.message}`);
    for (const call of recommendation.evidence.ci ?? []) {
      const location = `${call.source} / ${call.job} / 단계 ${call.step + 1}`;
      if (call.definitions) lines.push(`  ${location} → ${call.definitions.join(', ')}의 ${call.task}`);
      else lines.push(`  ${location}의 ${[call.tool, call.task].filter(Boolean).join(' ')} 호출과 작업 선언의 연결은 미확인입니다.`);
    }
    for (const workflow of recommendation.evidence.workflows ?? []) {
      for (const job of workflow.jobs) {
        lines.push(`  ${job.source} / ${job.job} / 단계 ${job.steps.map((index) => index + 1).join(', ')}에 공통 절차가 선언되어 있습니다.`);
      }
    }
    for (const entry of recommendation.evidence.preferences ?? []) {
      lines.push(`  ${entry.source}${entry.job ? ` / ${entry.job} / 단계 ${entry.step + 1}` : ''}에서 ${entry.tool} 선택을 확인했습니다.`);
    }
    for (const item of report.taskRunners.declarations) lines.push(`  ${item.tool}: ${item.source} (${item.state}), 작업: ${item.tasks.join(', ') || '미확인'}`);
    for (const item of report.taskRunners.tools) lines.push(`  실행 파일 ${item.tool}: ${item.version ?? '버전 미확인'} (${item.execution})${item.executable ? `, ${item.executable}` : ''}`);
  }
  if (report.commandGuidance?.length) {
    lines.push('', '직접 실행할 명령');
    for (const { tool, args, description } of report.commandGuidance) {
      lines.push(`  ${[tool, ...args].join(' ')}`, `    ${description}`);
    }
  }
  lines.push('', `결과: 통과 ${report.summary.pass}, 요구 위반 ${report.summary.fail}, 검토 ${report.summary.warn}, 미확인 ${report.summary.unknown}, 생략 ${report.summary.skipped}`);
  return lines.join('\n');
}
export async function main(args, { inspect, query } = {}) {
  const options = parseOptions(args);
  if (options.help) { process.stdout.write(HELP); return 0; }
  if (options.version) { process.stdout.write(`${VERSION}\n`); return 0; }
  const report = await diagnose({ ...options, inspect, query });
  const output = options.format === 'json' ? JSON.stringify(report, null, 2) : formatReport(report);
  process.stdout.write(`${output}\n`);
  return report.summary.fail > 0 ? 1 : 0;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.exitCode = await main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`진단을 완료하지 못했습니다: ${error.message}\n`);
    process.exitCode = 2;
  }
}
