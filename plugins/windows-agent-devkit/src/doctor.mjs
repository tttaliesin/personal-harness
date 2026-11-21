import { realpath, stat } from 'node:fs/promises';
import { analyzeProject } from './project.mjs';
import { inspectWindows } from './windows.mjs';
import { evaluateVersion } from './versions.mjs';
import { createQuery } from './query.mjs';
import { collectAdvanced } from './advanced.mjs';
import { collectInfrastructure } from './infrastructure.mjs';
import { enhanceRuntimes } from './runtime.mjs';
import { attachSupport } from './support.mjs';
import { loadExceptions } from './exceptions.mjs';
import { checkApp } from './app-check.mjs';
import { summarizeTaskRunners, collectTaskRunnerTools, attachTaskRunnerChecks } from './task-runner-checks.mjs';

export const VERSION = '0.3.5';
export const P0_IDS = ['ENV-01', 'ENV-02', 'SH-01', 'PATH-01', 'REQ-01', 'PKG-01', 'GIT-01', 'GIT-02', 'NODE-01', 'NODE-02', 'PY-01', 'PY-02', 'GO-01', 'RUST-01', 'ZIG-01', 'DOTNET-01', 'TOOLS-01', 'WSL-01', 'CTR-01', 'LD-01', 'PC-01', 'RCM-01'];
export const P1_IDS = ['RUST-02', 'WSL-02', 'CTR-02', 'PC-02', 'IDE-01', 'CODEX-01', 'AUX-01', 'STORE-01'];
const LANGUAGE_TOOLS = { node: 'node', python: 'python', go: 'go', rust: 'rustc', zig: 'zig', dotnet: 'dotnet' };
const LANGUAGE_CHECKS = { node: 'NODE-01', python: 'PY-01', go: 'GO-01', rust: 'RUST-01', zig: 'ZIG-01', dotnet: 'DOTNET-01' };
const LABELS = { node: 'Node.js', python: 'Python', go: 'Go', rust: 'Rust', zig: 'Zig', dotnet: '.NET SDK' };
const VERSION_ARGS = {
  node: ['--version'], python: ['--version'], go: ['version'],
  rust: ['--version'], zig: ['version'], dotnet: ['--list-sdks'],
};
const RUNNER_ARGS = new Map([['npm', ['run']], ['mise', ['run']], ['task', []], ['just', []], ['make', []]]);
const MANUAL_CHECKS = {
  'RUST-02': 'Rust 링크 확인에는 프로젝트의 기존 빌드 명령을 사용합니다.',
  'WSL-02': '배포판 내부에서는 그 문맥의 도구 버전과 프로젝트 확인 명령을 사용합니다.',
  'CTR-02': 'Docker 연결과 서비스 상태는 해당 프로젝트의 확인 명령으로 확인합니다.',
  'PC-02': '서비스 상태는 해당 프로젝트의 Process Compose 확인 명령으로 확인합니다.',
};

function commandGuidance(project, runners, { wsl, containers, processCompose }) {
  const commands = [];
  for (const [language, requirement] of Object.entries(project.requirements)) {
    if (requirement.state === 'required') {
      commands.push({ tool: LANGUAGE_TOOLS[language], args: [...VERSION_ARGS[language]], description: `${LABELS[language]} 선택 버전 확인` });
    }
  }
  if (wsl) commands.push({ tool: 'wsl', args: ['--list', '--verbose'], description: '등록된 배포판과 WSL 버전 확인' });
  if (containers || project.environment.containers !== 'not_required') {
    commands.push({ tool: 'docker', args: ['version'], description: '현재 Docker 문맥의 클라이언트와 엔진 버전 확인' });
    if (project.files.some((file) => /^(?:docker-)?compose\.ya?ml$/i.test(file))) {
      commands.push({ tool: 'docker', args: ['compose', 'ps'], description: '프로젝트 루트에서 기존 Compose 서비스 상태 확인' });
    }
  }
  if (processCompose || project.environment.processCompose !== 'not_required') {
    commands.push({ tool: 'Get-Command', args: ['process-compose'], description: 'PowerShell에서 Process Compose 명령의 경로 확인' });
  }
  const seen = new Set();
  for (const { tool, task, definitions } of runners.recommendation.evidence.ci ?? []) {
    const prefix = RUNNER_ARGS.get(tool);
    const key = `${tool} ${task}`;
    const checkTask = typeof task === 'string' && /^(?:build|check|lint|test|verify)(?:[._:-][a-z0-9._:-]{1,120})?$/i.test(task);
    if (!prefix || !definitions?.length || !checkTask || seen.has(key)) continue;
    seen.add(key);
    commands.push({ tool, args: [...prefix, task], description: '프로젝트 루트 선언과 CI에서 확인한 기존 작업' });
  }
  return commands;
}

function summarizeChecks(checks) {
  const summary = { pass: 0, fail: 0, warn: 0, unknown: 0, skipped: 0 };
  for (const check of checks) summary[check.status] += 1;
  return summary;
}

function result(checkId, status, reason, message, extra = {}) {
  return {
    checkId, status, reason, message,
    applicability: 'required', resolution: 'unknown', execution: 'not_run',
    compatibility: 'unknown',
    support: { status: 'unknown', source: null, checkedOn: null },
    recommendation: { status: 'unknown' },
    nextAction: '미확인 조건은 해당 실행 문맥에서 별도로 확인합니다.',
    ...extra,
  };
}

function candidates(host, name) { return host.commands?.[name] ?? []; }
function probe(host, name) { return host.probes?.[name]; }
function discovered(host, name) { return candidates(host, name).length > 0; }

function toolEvidence(host, name) {
  const query = probe(host, name);
  const entry = candidates(host, name)[0];
  return {
    resolution: entry ? 'resolved' : 'not_resolved',
    resolvedPath: query?.executable ?? entry?.path ?? null,
    candidates: candidates(host, name),
    execution: ['succeeded', 'failed', 'timed_out'].includes(query?.state) ? query.state : 'not_run',
    command: query ? { executable: query.executable, arguments: query.arguments, exitCode: query.exitCode } : null,
    observed: query?.version ?? entry?.productVersion ?? entry?.fileVersion ?? null,
    method: query?.method ?? 'verified_version_query',
  };
}

function skip(id, message) {
  return result(id, 'skipped', 'not_applicable', message, { applicability: 'not_required', compatibility: 'not_applicable' });
}

function languageCheck(language, requirement, host) {
  const id = LANGUAGE_CHECKS[language];
  if (requirement.state === 'not_required') return skip(id, `${LABELS[language]} 개발 요구가 없습니다.`);
  const name = LANGUAGE_TOOLS[language];
  const evidence = toolEvidence(host, name);
  const common = { ...evidence, requirement: requirement.versionRequests, notes: requirement.notes ?? [] };
  if (requirement.state === 'unknown') return result(id, 'unknown', 'requirement_unknown', '프로젝트 선언을 해석하지 못해 적용 요구를 확인할 수 없습니다.', { ...common, applicability: 'unknown' });
  if (evidence.resolution === 'not_resolved') return result(id, 'fail', 'command_not_resolved', `${LABELS[language]} 요구가 있으나 현재 진단 문맥에서 명령을 찾지 못했습니다.`, { ...common, compatibility: 'violated', nextAction: '설치 상태와 PATH를 구분해 확인하고 프로젝트 지정 도구의 실행 경로를 준비합니다.' });
  const query = probe(host, name);
  if ((query?.state !== 'succeeded' && !query?.versionVerified) || !query.version) return result(id, 'unknown', query?.state ?? 'version_not_queried', query?.reason ?? '현재 경로의 실행 버전을 변경 없이 확인하지 못했습니다.', common);
  const assessment = evaluateVersion(query.version, requirement.versionRequests, { ...requirement.metadata, language });
  if (assessment.reason === 'no_version_requirement') return result(id, 'pass', query.method === 'pe_go_buildinfo' ? 'runtime_metadata_observed' : 'runtime_queried', `${LABELS[language]} 버전을 확인했습니다. 현재 정적 분석 범위에서 명시적인 버전 범위는 확인되지 않았습니다.`, { ...common, compatibility: 'satisfied' });
  const status = assessment.compatibility === 'satisfied' ? 'pass' : assessment.compatibility === 'violated' ? 'fail' : 'unknown';
  const message = status === 'pass' ? '확인한 도구 버전이 프로젝트의 선언 범위를 충족합니다.' : status === 'fail' ? '확인한 도구 버전이 프로젝트의 선언 범위를 벗어납니다.' : '버전 표현이나 선택 근거를 충분히 확인하지 못했습니다.';
  return result(id, status, assessment.reason, message, { ...common, compatibility: assessment.compatibility, nextAction: status === 'fail' ? '기존 관리자에서 프로젝트 지정 버전을 선택한 뒤 다시 확인합니다.' : '공식 지원 상태와 실제 빌드·테스트는 별도로 확인합니다.' });
}

function managerCheck(id, requirement, label) {
  if (requirement.state === 'not_required') return skip(id, `${label} 의존성 작업 요구가 없습니다.`);
  if (requirement.state === 'unknown') return result(id, 'unknown', 'requirement_unknown', `${label} 환경 선언을 읽지 못했습니다.`, { applicability: 'unknown' });
  const names = [...new Set((requirement.packageManagers ?? []).map((manager) => typeof manager === 'string' ? manager : manager.name).filter(Boolean))];
  const locks = requirement.lockFiles ?? [];
  const ambiguous = names.length > 1 || locks.filter((file) => !['npm-shrinkwrap.json', 'requirements.txt'].includes(file)).length > 1;
  return result(id, ambiguous ? 'warn' : 'unknown', ambiguous ? 'multiple_manager_declarations' : 'static_dependency_metadata', ambiguous ? '서로 다른 의존성 관리 선언을 발견했습니다. 적용 범위를 확인해야 합니다.' : '의존성 선언과 잠금 파일을 정적으로 확인했습니다. 관리자 실행과 환경 동기화는 수행하지 않았습니다.', {
    observed: { packageManagers: requirement.packageManagers ?? [], lockFiles: locks, metadata: requirement.metadata },
    nextAction: '프로젝트의 기존 패키지 관리자와 잠금 방식을 보존하고 해당 버전의 실행 경로를 확인합니다.',
  });
}

function effectiveRequirements(project, options) {
  const requirements = structuredClone(project.requirements);
  for (const language of options.languages ?? []) {
    if (requirements[language].state === 'not_required') requirements[language].state = 'required';
  }
  if (project.metadata?.execution?.hostLanguages) {
    for (const [language, requirement] of Object.entries(requirements)) {
      if (options.native || options.languages?.includes(language)) continue;
      const state = project.metadata.execution.hostLanguages[language];
      if (state === 'not_required' || state === 'unknown') requirement.state = state;
    }
    return requirements;
  }
  if (!options.native && project.environment.containers !== 'not_required') {
    for (const [language, requirement] of Object.entries(requirements)) {
      if (requirement.state === 'required' && !options.languages?.includes(language)) {
        requirement.state = 'unknown';
        requirement.notes.push('컨테이너 선언이 있어 호스트의 언어 도구 필요성이 미확인입니다. --native 또는 --languages로 호스트 조회를 명시할 수 있습니다.');
      }
    }
  }
  return requirements;
}

export function buildReport(project, host, options = {}) {
  const requirements = effectiveRequirements(project, options);
  const runtimeRequired = Object.values(requirements).some((requirement) => requirement.state !== 'not_required');
  const containerState = options.containers ? 'required' : project.environment.containers;
  const processState = options.processCompose ? 'required' : project.environment.processCompose;
  const containers = containerState === 'required';
  const processCompose = processState === 'required';
  const checks = [];
  const os = host.context.os ?? {};
  const windows11 = /Windows 11/i.test(os.name ?? '') || (Number(os.build) >= 22000 && /Windows/i.test(os.name ?? '') && !/Server/i.test(os.name ?? ''));
  checks.push(result('ENV-01', windows11 && host.context.processArchitecture === 'x64' ? 'pass' : 'unknown', windows11 ? 'windows_observed' : 'platform_not_verified', '현재 OS와 프로세스 아키텍처를 확인했습니다. 릴리스별 공식 지원 상태는 미확인입니다.', { observed: { os, processArchitecture: host.context.processArchitecture }, compatibility: windows11 && host.context.processArchitecture === 'x64' ? 'satisfied' : 'unknown' }));
  checks.push(result('ENV-02', 'pass', 'project_context_observed', '지정한 Windows 프로젝트의 작업 경로를 확인했습니다.', { observed: { environment: 'windows-native', cwd: project.root }, compatibility: 'satisfied' }));
  const shell = host.context.diagnosticShell;
  const shellAssessment = evaluateVersion(shell?.version, [{ kind: 'range', value: '>=7.6 <7.7' }]);
  const shellAlignment = shellAssessment.compatibility === 'satisfied' ? 'aligned' : shellAssessment.compatibility === 'violated' ? 'different' : 'unknown';
  checks.push(result('SH-01', shellAlignment === 'aligned' ? 'pass' : shellAlignment === 'different' ? 'warn' : 'unknown', 'diagnostic_shell_observed', '설정 파일을 읽지 않은 진단용 PowerShell을 확인했습니다. 사용자·앱의 대화형 셸 설정은 별도입니다.', { observed: shell, compatibility: shellAssessment.compatibility, recommendation: { status: shellAlignment, expected: 'PowerShell 7.6 LTS', role: 'Windows 진단 셸' } }));
  const activeNames = ['git', 'winget', ...(runtimeRequired ? ['mise'] : []), ...Object.entries(requirements).filter(([, item]) => item.state === 'required').map(([name]) => LANGUAGE_TOOLS[name]), ...(options.wsl ? ['wsl'] : []), ...(containers ? ['docker', 'lazydocker'] : []), ...(processCompose ? ['process-compose'] : [])];
  checks.push(result('PATH-01', 'pass', 'command_candidates_observed', '고정한 명령 이름의 후보를 진단 셸에서 조회했습니다. 복수 후보 자체를 충돌로 판정하지 않습니다.', { observed: Object.fromEntries([...new Set(activeNames)].map((name) => [name, candidates(host, name)])), compatibility: 'satisfied' }));
  checks.push(result('REQ-01', project.issues.length ? 'unknown' : 'pass', project.issues.length ? 'declaration_issue' : 'static_requirements_read', project.issues.length ? '일부 선언을 읽거나 해석하지 못했습니다.' : '지원하는 프로젝트 선언을 정적으로 읽었습니다. CI와 스크립트는 실행하지 않았습니다.', { observed: { files: project.files, issues: project.issues, scope: '지정한 루트의 인식 가능한 선언 파일; 상위 선언·하위 모노레포·CI의 의미 분석은 제외' }, compatibility: project.issues.length ? 'unknown' : 'satisfied' }));
  checks.push(result('PKG-01', discovered(host, 'winget') ? 'unknown' : 'warn', 'package_manager_metadata', '설치 관리자 경로를 조회했습니다. 기존 도구의 업데이트 책임과 실제 설치 이력은 미확인입니다.', { ...toolEvidence(host, 'winget'), recommendation: { status: discovered(host, 'winget') ? 'unknown' : 'different', expected: 'WinGet' } }));
  const git = probe(host, 'git');
  checks.push(result('GIT-01', git?.state === 'succeeded' ? 'pass' : 'unknown', git?.state === 'succeeded' ? 'git_version_queried' : 'git_not_verified', 'Git 실행 버전의 조회와 저장소·원격 인증 검증을 구분합니다. 인증 조회는 수행하지 않았습니다.', { ...toolEvidence(host, 'git'), compatibility: git?.state === 'succeeded' ? 'satisfied' : 'unknown' }));
  const attributes = project.files.filter((name) => /(?:^|\/)(?:\.gitattributes|\.editorconfig)$/.test(name));
  checks.push(result('GIT-02', 'unknown', 'repository_policy_metadata', '줄바꿈·인코딩 정책 파일의 존재를 확인했습니다. 전체 추적 파일의 정규화 검사는 후속 범위입니다.', { observed: { files: attributes } }));
  for (const language of ['node', 'python', 'go', 'rust', 'zig', 'dotnet']) {
    checks.push(languageCheck(language, requirements[language], host));
    if (language === 'node') checks.push(managerCheck('NODE-02', requirements.node, 'Node.js'));
    if (language === 'python') checks.push(managerCheck('PY-02', requirements.python, 'Python'));
  }
  checks.push(runtimeRequired ? result('TOOLS-01', 'unknown', 'tool_manager_metadata', 'mise 경로와 프로젝트의 도구 선언을 기록했습니다. 활성화·백엔드·실제 도구 모음 선택은 별도 검증이 필요합니다.', { ...toolEvidence(host, 'mise'), observed: { command: candidates(host, 'mise'), declarations: project.files.filter((file) => /(?:mise\.toml|\.tool-versions)$/.test(file)) }, notes: ['C#의 공식 .NET SDK 설치는 mise 권장안의 예외입니다.'] }) : skip('TOOLS-01', '언어 도구 관리 요구가 없습니다.'));
  checks.push(options.wsl ? result('WSL-01', 'unknown', 'wsl_host_only', 'WSL 실행 파일과 허용한 호스트 조회만 기록합니다. 배포판 내부 실행은 수행하지 않았습니다.', { ...toolEvidence(host, 'wsl'), observed: probe(host, 'wsl')?.data ?? null }) : skip('WSL-01', 'WSL 호스트 점검은 --wsl로 명시했을 때 수행합니다.'));
  checks.push(containerState === 'unknown' ? result('CTR-01', 'unknown', 'requirement_unknown', '컨테이너 선언을 읽지 못했거나 호스트 도구의 적용 요구가 미확인입니다.', { applicability: 'unknown' }) : containers ? result('CTR-01', 'unknown', 'docker_client_only', 'Docker 클라이언트 경로와 버전만 확인합니다. Compose·context·엔진 연결은 검증되지 않은 부분을 미확인으로 유지합니다.', toolEvidence(host, 'docker')) : skip('CTR-01', '컨테이너 요구가 없습니다.'));
  checks.push(containerState === 'unknown' ? result('LD-01', 'unknown', 'requirement_unknown', '컨테이너 관리 요구를 확인하지 못했습니다.', { applicability: 'unknown' }) : containers ? result('LD-01', 'unknown', 'lazydocker_metadata_only', 'Lazydocker의 실행 파일 메타데이터만 확인했습니다. TUI와 엔진 연결을 실행하지 않았습니다.', toolEvidence(host, 'lazydocker')) : skip('LD-01', '컨테이너 관리 요구가 없습니다.'));
  checks.push(processState === 'unknown' ? result('PC-01', 'unknown', 'requirement_unknown', '로컬 다중 프로세스 관리 선언을 읽지 못했습니다.', { applicability: 'unknown' }) : processCompose ? result('PC-01', 'unknown', 'process_compose_static_only', '설정 파일의 존재와 실행 파일 메타데이터를 확인했습니다. 설정의 명령·환경변수 평가와 서비스 기동은 수행하지 않았습니다.', { ...toolEvidence(host, 'process-compose'), observed: { files: project.files.filter((file) => /process-compose/.test(file)), command: candidates(host, 'process-compose') } }) : skip('PC-01', '로컬 다중 프로세스 관리 요구가 없습니다.'));
  const comparisons = [{ role: 'Windows 진단 셸', expected: 'PowerShell 7.6 LTS', observed: shell?.version ?? null, status: shellAlignment }];
  if (runtimeRequired) comparisons.push({ role: '개발 도구 관리', expected: 'mise; .NET SDK 공식 설치 예외', observed: candidates(host, 'mise'), status: discovered(host, 'mise') ? 'unknown' : 'different' });
  const different = comparisons.some((item) => item.status === 'different');
  checks.push(result('RCM-01', different ? 'warn' : comparisons.some((item) => item.status === 'unknown') ? 'unknown' : 'pass', 'recommendation_compared', '프로젝트 요구와 권장 구성을 비교하고 기존 도구를 유지할 근거를 안내합니다.', {
    observed: comparisons, recommendation: { status: different ? 'different' : comparisons.some((item) => item.status === 'unknown') ? 'unknown' : 'aligned' },
    proposal: { changes: ['차이가 확인된 역할은 권장 도구의 경로·버전 선택과 업데이트 책임을 검토합니다.'], preserve: ['프로젝트 지정 런타임', '패키지 관리자와 잠금 파일', '빌드·테스트 명령과 CI'], verify: ['현재 실행 파일의 경로와 버전을 확인합니다.', '프로젝트의 확인 명령은 안내된 문맥에서 사용합니다.'] },
    nextAction: '미확인한 설치 이력과 활성화 상태를 확인하고 필요한 역할의 선택 근거를 검토합니다.',
  }));
  checks.sort((left, right) => P0_IDS.indexOf(left.checkId) - P0_IDS.indexOf(right.checkId));
  const summary = summarizeChecks(checks);
  return { schemaVersion: 1, pluginVersion: VERSION, policyVersion: '2026-11-17', generatedAt: new Date().toISOString(), context: host.context, project: { root: project.root, files: project.files }, summary, checks, deferredChecks: P1_IDS, limitations: ['공식 지원 상태는 자동 조회하지 않아 unknown으로 기록합니다.', '지원하지 않는 선언과 버전 표현은 unknown으로 기록합니다.', '진단 셸의 관찰을 사용자 프로필이나 앱 터미널의 관찰로 일반화하지 않습니다.', '이 보고서는 전체 빌드·테스트와 앱에서의 플러그인 로딩 검증을 대신하지 않습니다.'] };
}

export async function diagnose({
  projectPath, timeoutMs = 5000, languages = [], wsl = false, containers = false, processCompose = false, native = false,
  ide, storage, githubAuth, app, codexExecutable, stateDir, now, inspect = inspectWindows, query: suppliedQuery,
} = {}) {
  const root = await realpath(projectPath ?? process.cwd());
  if (!(await stat(root)).isDirectory()) throw new Error('점검할 프로젝트 경로는 디렉터리여야 합니다.');
  const project = await analyzeProject(root);
  const active = Object.entries(effectiveRequirements(project, { languages, native })).filter(([, item]) => item.state === 'required').map(([name]) => LANGUAGE_TOOLS[name]);
  const host = await inspect({ projectPath: root, timeoutMs, tools: ['git', ...active, ...(wsl ? ['wsl'] : []), ...(containers || project.environment.containers === 'required' ? ['docker'] : [])] });
  const query = suppliedQuery ?? createQuery({ projectPath: root, host, timeoutMs });
  await enhanceRuntimes({ project, host, tools: active, query });
  const report = buildReport(project, host, { languages, wsl, containers, processCompose, native });
  const taskRunners = summarizeTaskRunners(project);
  const effective = { ...project, requirements: effectiveRequirements(project, { languages, native }), metadata: structuredClone(project.metadata ?? {}) };
  if (ide) (effective.metadata.ide ??= {}).required = true;
  if (storage) effective.metadata.storage = { requested: true, path: typeof storage === 'string' ? storage : root };
  if (githubAuth) effective.metadata.auxiliary = { github: true, authentication: true };
  const [advanced, infrastructure, appCheck, runnerTools] = await Promise.all([
    collectAdvanced({ projectPath: root, project: effective, host, timeoutMs, query }),
    collectInfrastructure({ project: effective, host, options: { wsl, containers, processCompose }, query }),
    checkApp({ query, enabled: app, executable: codexExecutable }),
    collectTaskRunnerTools({ summary: taskRunners, host, query }),
  ]);
  const map = new Map(report.checks.map((item) => [item.checkId, item]));
  for (const item of [...advanced.checks, ...infrastructure.checks, appCheck]) map.set(item.checkId, item);
  for (const [id, nextAction] of Object.entries(MANUAL_CHECKS)) {
    map.set(id, { ...skip(id, '실행 결과는 확인 명령 안내에 따라 별도로 확인합니다.'), reason: 'manual_confirmation', nextAction });
  }
  const ids = [...P0_IDS, ...P1_IDS];
  report.checks = ids.map((id) => map.get(id));
  attachSupport(report.checks, host, now);
  report.deferredChecks = [];
  report.project.scope = project.metadata?.scope;
  report.project.execution = project.metadata?.execution;
  const reqCheck = map.get('REQ-01');
  reqCheck.observed.scope = project.metadata?.scope ?? 'bounded static declarations';
  reqCheck.observed.execution = project.metadata?.execution;
  report.commandGuidance = commandGuidance(effective, taskRunners, { wsl, containers, processCompose });
  try { report.exceptions = await loadExceptions(root, stateDir); }
  catch (error) { report.exceptions = { state: 'unknown', reason: error.code ?? 'exception_state_unreadable' }; }
  const recommendation = map.get('RCM-01');
  recommendation.observed = recommendation.observed.filter((i) => i.role !== '개발 도구 관리');
  if (map.get('TOOLS-01').status !== 'skipped') recommendation.observed.push({ role: '개발 도구 관리', expected: 'mise', observed: map.get('TOOLS-01').observed?.version ?? null, status: map.get('TOOLS-01').recommendation.status });
  recommendation.observed.push({ role: '터미널', expected: 'Windows Terminal', observed: candidates(host, 'wt'), status: discovered(host, 'wt') ? 'aligned' : 'unknown' });
  recommendation.exceptions = report.exceptions;
  taskRunners.tools = runnerTools;
  attachTaskRunnerChecks(report, taskRunners);
  report.summary = summarizeChecks(report.checks);
  report.limitations = ['지원 정책은 2026-11-17의 오프라인 스냅샷이며 30일 후에는 미확인으로 처리합니다.', '지원 계열 판정은 최신 패치·취약점·모든 OS 지원 조합의 확인을 포함하지 않습니다.', '확인 명령은 안내용입니다. 프로젝트 명령과 서비스는 사용자가 해당 문맥에서 확인합니다.', '앱 설치 목록과 실제 Skill 호출의 관찰은 구분합니다.'];
  return report;
}
