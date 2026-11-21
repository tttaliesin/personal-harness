const names = {
  mise: 'mise tasks', task: 'Taskfile (Go Task)', just: 'Justfile (just)',
  make: 'Makefile (GNU Make)', npm: 'npm scripts',
};
const explicitTools = new Set(['task', 'just', 'make']);

function decision(action, tools, reason, message, evidence = {}) {
  return {
    action, tools, reason, message, evidence,
    status: { keep: 'aligned', suggest: 'different', defer: 'unknown' }[action],
    expected: tools.length ? tools.map((tool) => names[tool]).join(' · ') : null,
    application: action === 'keep' ? 'existing_project' : action === 'suggest' ? 'shared_ci_workflow' : 'project_review',
  };
}

function existingRunnerDecision(declarations, calls) {
  const evidence = { declarations, ci: calls };
  if ([...declarations, ...calls].some((entry) => entry.state === 'unknown')) {
    return decision('defer', [], 'static_analysis_incomplete', '설정이나 CI에 해석하지 못한 실행기 선언이 있습니다.', evidence);
  }
  if (calls.some((call) => call.atProjectRoot !== true || !call.task)) {
    return decision('defer', [], 'ci_task_scope_unverified', '일부 CI 호출의 루트 작업 경로나 작업 이름을 확인할 수 없습니다.', evidence);
  }

  const verifiedCalls = [];
  for (const call of calls) {
    const definitions = declarations.filter((entry) => entry.tool === call.tool &&
      typeof entry.source === 'string' && !entry.source.includes('/'));
    // A second root definition can change which file the runner selects.
    if (!definitions.length || !definitions.every((entry) => entry.tasks.includes(call.task))) {
      return decision('defer', [], 'ci_task_not_declared', 'CI에서 호출한 작업을 해당 실행기의 루트 선언과 연결할 수 없습니다.', evidence);
    }
    verifiedCalls.push({ ...call, definitions: definitions.map((entry) => entry.source) });
  }

  const available = declarations.filter((entry) => entry.state === 'declared' && entry.tasks.length > 0);
  if (!available.length) return null;
  const tools = [...new Set(available.map((entry) => entry.tool))];
  const keepEvidence = { declarations: available, ci: verifiedCalls };
  if (verifiedCalls.length && tools.length === 1 && tools[0] === 'npm') {
    const matchedTasks = [...new Set(verifiedCalls.map((call) => call.task))];
    return {
      ...decision('keep', tools, 'ci_uses_root_npm_scripts',
        `CI에서 루트 package.json의 ${matchedTasks.join(', ')} 스크립트를 호출합니다.`, keepEvidence),
      matchedTasks,
    };
  }
  return verifiedCalls.length
    ? decision('keep', tools, 'existing_runner_matches_ci', 'CI의 작업 호출이 루트에 선언된 실행기와 작업 이름에 일치합니다.', keepEvidence)
    : decision('keep', tools, 'existing_task_declarations', '프로젝트에 기존 작업이 선언되어 있습니다. CI 호출과의 일치는 미확인입니다.', keepEvidence);
}

function preparedInAllJobs(workflow, tool) {
  return workflow.jobs.every((job) => workflow.prepared.some((entry) =>
    entry.tool === tool && entry.source === job.source && entry.job === job.job));
}

function rootNpmSources(project) {
  if (!project.metadata?.taskRunnerLanguages?.includes('node') || !project.files?.includes('package.json')) return [];
  const managers = project.requirements?.node?.packageManagers ?? [];
  if (managers.some(({ name }) => name !== 'npm')) return [];
  const fixedVersion = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
  return [...new Set(managers.filter(({ source, version }) => ['package-lock.json', 'npm-shrinkwrap.json'].includes(source) ||
    (source === 'package.json' && typeof version === 'string' && fixedVersion.test(version))).map(({ source }) => source))];
}

function newRunnerDecision(project) {
  const workflows = project.metadata?.taskRunnerWorkflows ?? [];
  if (!workflows.length) {
    return decision('defer', [], 'shared_workflow_not_observed', '새 공통 실행기를 제안할 만큼 반복 선언된 CI 빌드·검사 절차를 찾지 못했습니다.');
  }

  const pins = project.metadata?.taskRunnerPreferences ?? [];
  const preferences = [
    ...pins,
    ...workflows.flatMap((workflow) => workflow.prepared),
  ].filter((entry) => explicitTools.has(entry.tool));
  const tools = [...new Set(preferences.map((entry) => entry.tool))];
  if (tools.length > 1) {
    return decision('defer', [], 'conflicting_runner_preferences', '프로젝트 설정이나 관련 CI 작업이 서로 다른 실행기를 선택합니다.', { workflows, preferences });
  }
  const [preferred] = tools;
  if (preferred) {
    const applicable = preferred === 'make' ? workflows.filter((entry) => entry.fileDependency === true) : workflows;
    if (!applicable.length) {
      return decision('defer', [], 'make_file_dependency_unverified', 'GNU Make 선택은 확인했습니다. 반복 절차에서 컴파일 산출물과 링크 입력의 관계를 확인하지 못했습니다.', { workflows, preferences });
    }
    const isPinned = pins.some((entry) => entry.tool === preferred);
    const supported = applicable.filter((entry) => isPinned || preparedInAllJobs(entry, preferred));
    if (!supported.length) {
      return decision('defer', [], 'runner_preparation_unconfirmed', '반복 절차를 호출하는 CI 작업의 공통 실행기 준비를 확인하지 못했습니다.', { workflows, preferences });
    }
    const reason = preferred === 'make' ? 'make_file_dependency' : 'prepared_task_runner';
    const message = preferred === 'make'
      ? 'GNU Make가 선택되어 있고 반복 절차에서 컴파일 산출물을 링크의 입력으로 사용하는 관계를 확인했습니다.'
      : `프로젝트 설정이나 관련 CI가 ${names[preferred]}를 선택해 반복 절차의 공통 작업 후보로 제안합니다.`;
    return decision('suggest', [preferred], reason, message,
      { workflows: supported, preferences });
  }

  const languages = new Set(project.metadata?.taskRunnerLanguages ?? []);
  const npmSources = rootNpmSources(project);
  const npmWorkflows = npmSources.length
    ? workflows.filter((entry) => entry.operations.every(({ language }) => language === 'node')) : [];
  const miseDeclarations = (project.metadata?.declarations ?? []).filter(({ source, kind }) =>
    kind === 'mise' && ['.mise.toml', 'mise.toml'].includes(source));
  const miseLanguages = new Set(miseDeclarations.flatMap(({ selectedLanguages }) => selectedLanguages));
  const polyglotWorkflows = [];
  const managedWorkflows = [];
  for (const entry of workflows) {
    if (npmWorkflows.includes(entry) || !entry.operations.every(({ language }) => languages.has(language))) continue;
    if (new Set(entry.operations.map(({ language }) => language)).size > 1) polyglotWorkflows.push(entry);
    else if (entry.operations.every(({ language }) => miseLanguages.has(language))) managedWorkflows.push(entry);
  }
  const miseWorkflows = [...polyglotWorkflows, ...managedWorkflows];
  if (npmWorkflows.length && miseWorkflows.length) {
    return decision('defer', [], 'conflicting_workflow_needs', 'Node.js 전용 절차와 다중언어 절차에서 서로 다른 공통 작업 후보가 확인됩니다.', { workflows });
  }
  if (npmWorkflows.length) {
    return decision('suggest', ['npm'], 'node_workflow_uses_npm',
      '루트 Node.js 패키지가 npm을 사용합니다. 반복되는 Node.js 빌드·검사를 package.json 스크립트로 묶을 수 있습니다.',
      { workflows: npmWorkflows, preferences: npmSources.map((source) => ({ tool: 'npm', source })) });
  }
  if (polyglotWorkflows.length) {
    return decision('suggest', ['mise'], 'polyglot_shared_workflow',
      '프로젝트에 선언된 두 언어 이상의 작업이 CI에서 반복됩니다. 공통 작업의 기본 후보로 mise tasks를 권장합니다.',
      { workflows: polyglotWorkflows });
  }
  if (managedWorkflows.length) {
    const relevantLanguages = new Set(managedWorkflows.flatMap(({ operations }) => operations.map(({ language }) => language)));
    const preferences = miseDeclarations.filter(({ selectedLanguages }) => selectedLanguages.some((language) => relevantLanguages.has(language)))
      .map(({ source }) => ({ tool: 'mise', source }));
    return decision('suggest', ['mise'], 'mise_manages_workflow_tools',
      '반복되는 CI 작업의 언어 도구를 루트 mise 설정에서 관리합니다. 기존 mise 구성에 공통 작업을 추가할 수 있습니다.',
      { workflows: managedWorkflows, preferences });
  }
  return decision('defer', [], 'runner_choice_unverified', 'CI의 반복 절차는 확인했으며 실행기를 한 가지로 고를 근거는 부족합니다.', { workflows });
}

export function decideTaskRunners(project, declarations, calls) {
  return existingRunnerDecision(declarations, calls) ?? newRunnerDecision(project);
}
