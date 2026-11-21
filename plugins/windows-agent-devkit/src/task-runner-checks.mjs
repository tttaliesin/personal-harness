import { decideTaskRunners } from './task-runner-policy.mjs';

const EXECUTABLE_RUNNERS = new Set(['mise', 'task', 'just', 'make']);
const VERSION_PATTERNS = {
  mise: /^(?:mise )?(\d+\.\d+\.\d+)(?:\s|$)/,
  task: /^(?:Task version: v?|v)?(\d+\.\d+\.\d+)(?:\s|$)/i,
  just: /^just (\d+\.\d+\.\d+)(?:\s|$)/,
  make: /^GNU Make (\d+\.\d+(?:\.\d+)?)(?:\s|$)/,
};

/** Adoption is a recommendation, never proof that a task ran successfully. */
export function summarizeTaskRunners(project) {
  const declarations = project.metadata?.taskRunners ?? [];
  const ci = project.metadata?.taskRunnerCI ?? [];
  const ciTasks = ci.filter((item) => item.kind === undefined);
  const observed = [...new Set([...declarations, ...ciTasks].map((item) => item.tool))];
  const recommendation = decideTaskRunners(project, declarations, ciTasks);
  const recommended = recommendation.tools.length === 1 ? recommendation.tools[0] : null;
  return {
    recommended, declarations, ci, tools: [],
    recommendation: { ...recommendation, observed },
    proposal: {
      changes: recommendation.action === 'suggest' ? [recommendation.message] : [],
      preserve: ['프로젝트 지정 런타임', '패키지 관리자와 잠금 파일', '기존 작업 정의와 빌드·테스트 명령', 'CI와 배포 경로'],
      verify: ['Windows·WSL 실행 문맥과 작업 내부 셸 확인', '프로젝트에서 선언한 확인 명령을 해당 작업 경로에서 사용'],
      exception: '기존 Task·just·Make·npm scripts의 유지 근거와 적용 범위를 안내합니다.',
    },
    limitations: ['작업 정의의 정적 탐지는 실행 성공을 뜻하지 않습니다.', '외부 포함과 동적 작업 정의는 지원 범위에 따라 미확인으로 남깁니다.', '목록·dry-run 명령도 프로젝트 설정을 평가할 수 있어 기본 진단에서 실행하지 않습니다.'],
  };
}

export async function collectTaskRunnerTools({ summary, host, query }) {
  const tools = [...new Set([
    ...summary.declarations.map((item) => item.tool),
    ...summary.ci.map((item) => item.tool),
  ])].filter((tool) => EXECUTABLE_RUNNERS.has(tool));
  return await Promise.all(tools.map(async (tool) => {
    let response;
    try { response = await query(tool, ['--version']); }
    catch { response = { state: 'failed', exitCode: null }; }
    const succeeded = response?.state === 'succeeded' && response.exitCode === 0;
    const version = succeeded ? VERSION_PATTERNS[tool].exec(String(response.stdout ?? '').trim())?.[1] ?? null : null;
    return {
      tool,
      candidates: (host.commands?.[tool] ?? []).map((item) => ({ path: item.path, commandType: item.commandType })),
      status: succeeded && version ? 'pass' : response?.state === 'not_found' ? 'fail' : 'unknown',
      resolution: response?.state === 'not_found' ? 'not_resolved' : response?.executable ? 'resolved' : 'unknown',
      execution: response?.state ?? 'not_run', version,
      executable: response?.executable ?? null, exitCode: response?.exitCode ?? null,
      reason: succeeded && !version ? 'unsupported_version_output' : response?.state ?? 'not_run',
      projectTaskExecution: 'not_run',
    };
  }));
}

/** Attach runner observations to existing checks without adding new check IDs. */
export function attachTaskRunnerChecks(report, summary) {
  report.taskRunners = summary;
  const map = new Map(report.checks.map((item) => [item.checkId, item]));
  const requirements = map.get('REQ-01');
  requirements.observed.taskRunners = summary.declarations;
  requirements.observed.taskRunnerCI = summary.ci;
  if (summary.declarations.some((item) => item.state === 'unknown') || summary.ci.some((item) => item.state === 'unknown')) {
    if (requirements.status === 'pass') requirements.status = 'unknown';
    requirements.compatibility = 'unknown';
    requirements.reason = 'task_runner_analysis_incomplete';
    requirements.message = '일부 작업 실행기 선언은 동적이거나 지원 범위 밖이므로 정적 분석을 완료하지 못했습니다.';
  }
  const paths = map.get('PATH-01');
  paths.taskRunners = summary.tools;
  if (summary.tools.some((item) => item.status === 'fail')) {
    paths.status = 'warn'; paths.compatibility = 'unknown';
    paths.reason = 'declared_task_runner_not_resolved';
    paths.message = '선언된 작업 실행기 일부를 현재 Windows PATH에서 찾지 못했습니다. 파일의 존재만으로 Windows 실행 필수를 확정하지 않습니다.';
  } else if (summary.tools.some((item) => item.status === 'unknown') && paths.status === 'pass') {
    paths.status = 'unknown'; paths.compatibility = 'unknown';
    paths.reason = 'task_runner_executable_not_verified';
  }
  map.get('TOOLS-01').taskRunners = summary.tools;
  map.get('ENV-02').taskRunners = { root: report.project.root, taskEnvironment: 'not_evaluated' };
  map.get('SH-01').taskRunners = {
    defaults: { mise: 'cmd /c on Windows', task: 'embedded shell', just: 'sh', make: 'build-dependent shell' },
    taskDetails: summary.declarations.flatMap((item) => (item.taskDetails ?? []).map((task) => ({ tool: item.tool, source: item.source, ...task }))),
    execution: 'not_run',
  };
  const recommendation = map.get('RCM-01');
  recommendation.observed = recommendation.observed.filter((item) => item.role !== '프로젝트 작업 실행기');
  recommendation.observed.push({ role: '프로젝트 작업 실행기', ...summary.recommendation });
  recommendation.taskRunnerProposal = summary.proposal;
  recommendation.recommendation.status = recommendation.observed.some((item) => item.status === 'different') ? 'different' : recommendation.observed.some((item) => item.status === 'unknown') ? 'unknown' : 'aligned';
  recommendation.status = recommendation.recommendation.status === 'different' ? 'warn' : recommendation.recommendation.status === 'unknown' ? 'unknown' : 'pass';
}
