import { lstat, readFile } from 'node:fs/promises';
import { join, dirname, posix, win32 } from 'node:path';
import { decodeOutput } from './windows.mjs';
import { evaluateVersion } from './versions.mjs';
import { parseDocument } from 'yaml';

const LIMIT = 256 * 1024;
function check(checkId, status, reason, message, observed = {}, extra = {}) {
  return { checkId, status, reason, message, applicability: 'required', resolution: 'unknown', execution: 'not_run', compatibility: status === 'pass' ? 'satisfied' : status === 'fail' ? 'violated' : 'unknown', support: { status: 'unknown', source: null, checkedOn: null }, recommendation: { status: 'unknown' }, observed, nextAction: '관찰한 경로와 선택한 실행 문맥을 확인합니다.', ...extra };
}
const skip = (id, message) => check(id, 'skipped', 'not_applicable', message, {}, { applicability: 'not_required', compatibility: 'not_applicable' });
const okay = (q) => q?.state === 'succeeded' && q.exitCode === 0;
const binary = (host, tool) => host.commands?.[tool]?.[0];
async function metadataFile(file) {
  try {
    const info = await lstat(file);
    if (info.isSymbolicLink() || !info.isFile() || info.size > LIMIT) return { state: 'unknown' };
    return { state: 'read', text: await readFile(file, 'utf8') };
  } catch (error) { return { state: error.code === 'ENOENT' ? 'absent' : 'unknown' }; }
}
function endpointKind(value) {
  if (typeof value !== 'string') return 'unknown';
  return value.startsWith('npipe://') ? 'windows-pipe' : value.startsWith('unix://') ? 'unix-socket' : value.startsWith('ssh://') ? 'remote-ssh' : /^tcp:\/\//.test(value) ? 'tcp' : 'unknown';
}

async function nodeManager(project, host) {
  const req = project.requirements.node;
  if (req.state === 'not_required') return skip('NODE-02', 'Node.js 의존성 관리 요구가 없습니다.');
  const managers = req.packageManagers ?? [], names = [...new Set(managers.map((i) => i.name ?? i))];
  const observed = { declarations: managers, lockFiles: req.lockFiles, workspaces: req.metadata?.workspaces ?? project.metadata?.workspaces ?? [], selected: [] };
  if (req.state === 'unknown') return check('NODE-02', 'unknown', 'requirement_unknown', 'Node.js 의존성 선언을 확정하지 못했습니다.', observed, { applicability: 'unknown' });
  if (names.length > 1) return check('NODE-02', 'warn', 'multiple_manager_declarations', '여러 패키지 관리자 선언의 적용 범위를 확인해야 합니다.', observed);
  if (!names.length) return check('NODE-02', 'unknown', 'manager_not_declared', 'Node.js 패키지 관리자가 명시되지 않았습니다.', observed);
  const name = names[0], candidate = binary(host, name);
  if (!candidate) return check('NODE-02', 'fail', 'manager_not_resolved', '프로젝트의 패키지 관리자 명령을 현재 PATH에서 찾지 못했습니다.', observed, { resolution: 'not_resolved' });
  // npm/pnpm/yarn wrappers can download or execute project-selected JS on --version.
  // Read the installed CLI's own package metadata without running Corepack or scripts.
  const paths = [join(candidate.path, '..', 'node_modules', name, 'package.json'), join(candidate.path, '..', '..', 'node_modules', name, 'package.json')];
  let version;
  for (const file of paths) {
    const data = await metadataFile(file);
    if (data.state !== 'read') continue;
    try { const value = JSON.parse(data.text); if (value.name === name && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(value.version)) { version = value.version; break; } } catch {}
  }
  observed.selected.push({ name, path: candidate.path, version: version ?? null, method: 'installed_package_metadata' });
  const requested = (req.metadata?.packageManagerRequests ?? project.metadata?.packageManagerRequests ?? []).filter((r) => r.name === name);
  const assessment = version && requested.length ? evaluateVersion(version, requested, { language: 'node' }) : null;
  const status = !version ? 'unknown' : assessment?.compatibility === 'violated' ? 'fail' : assessment?.compatibility === 'unknown' ? 'unknown' : 'pass';
  return check('NODE-02', status, !version ? 'wrapper_target_not_verified' : assessment?.reason ?? 'manager_metadata_observed', version ? '설치된 관리자 패키지의 버전 메타데이터와 선언을 비교했습니다.' : '명령 래퍼의 실제 관리자 버전을 정적으로 확인하지 못했습니다.', observed, { resolution: 'resolved', resolvedPath: candidate.path, compatibility: status === 'pass' ? 'satisfied' : status === 'fail' ? 'violated' : 'unknown', recommendation: { status: 'aligned', expected: '프로젝트의 기존 패키지 관리자' } });
}

function environmentPath(value) {
  if (typeof value !== 'string' || value.length > 32767 || /[\x00-\x1f\x7f]|:\/\//.test(value)) return null;
  if (/^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+)/.test(value)) {
    if (/[<>:"|?*]/.test(value.replace(/^[A-Za-z]:/, '')) || /^[\\/]{2}\.{1,2}[\\/]/.test(value)) return null;
    return { api: win32, key: win32.normalize(value).replace(/\\+$/, '').toLowerCase() };
  }
  if (process.platform !== 'win32' && /^\/(?!\/)/.test(value)) {
    return { api: posix, key: posix.normalize(value).replace(/\/+$/, '') };
  }
  return null;
}

function localPythonEnvironment(entry) {
  // analyzeProject observes these locations relative to the requested root, even for a workspace member.
  return (entry?.directory === '.venv' && ['.venv/pyvenv.cfg', '.venv'].includes(entry.source)) ||
    (entry?.directory === '.' && entry.source === 'pyvenv.cfg');
}

function pythonEnvironment(project, host) {
  const req = project.requirements.python;
  if (req.state === 'not_required') return skip('PY-02', 'Python 의존성 관리 요구가 없습니다.');
  const declarations = req.metadata?.virtualEnvironments ?? [];
  const environments = Array.isArray(declarations) ? declarations.filter(localPythonEnvironment) : [];
  const probe = host.probes?.python;
  const runtime = probe?.state === 'succeeded' ? probe.data : null;
  const prefix = environmentPath(runtime?.prefix), base = environmentPath(runtime?.basePrefix);
  const selected = prefix && prefix.api === base?.api
    ? { prefix: runtime.prefix, basePrefix: runtime.basePrefix, isolated: prefix.key !== base.key }
    : null;
  const uv = binary(host, 'uv') ?? null;
  const observed = { managers: req.packageManagers, lockFiles: req.lockFiles, environments, selected, uv };
  const report = (status, reason, message, extra) => check('PY-02', status, reason, message, observed, {
    recommendation: { status: uv ? 'aligned' : 'different', expected: 'uv와 프로젝트별 가상환경' },
    ...extra,
  });

  if (req.state === 'unknown') return report('unknown', 'requirement_unknown', 'Python 환경 선언을 확정하지 못했습니다.', { applicability: 'unknown' });
  if (!Array.isArray(declarations) || environments.length !== declarations.length || environments.some((entry) => entry.state !== 'required')) {
    return report('unknown', 'virtual_environment_metadata_unknown', '현재 프로젝트 범위에서 가상환경의 경로 또는 pyvenv.cfg 메타데이터를 확인할 수 없습니다.');
  }
  if (runtime?.prefix == null || runtime?.basePrefix == null) {
    return report('unknown', 'interpreter_environment_unknown', '현재 인터프리터의 두 prefix를 조회한 근거가 부족합니다.');
  }
  if (!selected) {
    return report('unknown', 'interpreter_environment_path_invalid', '현재 인터프리터의 두 prefix를 비교 가능한 절대 경로로 해석할 수 없습니다.');
  }
  if (!environments.length) {
    return selected.isolated
      ? report('unknown', 'external_virtual_environment_unverified', '현재 가상환경이 프로젝트에 적용되는지 확인할 경로 근거가 부족합니다.')
      : report('unknown', 'project_environment_not_observed', '현재 Python의 두 prefix가 같으며 프로젝트 환경의 소속을 확인할 메타데이터가 부족합니다.');
  }
  const root = environmentPath(project.root);
  if (!root || root.api !== prefix.api) {
    return report('unknown', 'project_environment_path_unknown', '프로젝트 경로를 현재 인터프리터의 prefix와 비교할 수 없습니다.');
  }
  const matches = environments.some((entry) => environmentPath(root.api.join(project.root, entry.directory))?.key === prefix.key);
  if (matches) {
    return selected.isolated
      ? report('pass', 'project_environment_selected', '현재 인터프리터의 prefix가 프로젝트에서 확인한 가상환경 경로와 일치합니다.')
      : report('unknown', 'project_environment_prefix_conflict', '프로젝트 가상환경 경로와 일치하는 두 prefix가 서로 같아 가상환경 선택 여부를 확정할 수 없습니다.');
  }
  return selected.isolated
    ? report('warn', 'different_virtual_environment_selected', '현재 인터프리터는 프로젝트에서 확인한 경로와 다른 가상환경을 사용합니다.')
    : report('warn', 'declared_environment_not_selected', '현재 인터프리터의 두 prefix가 같은 경로를 가리키며 프로젝트 가상환경 경로와 차이가 있습니다.');
}

export async function collectInfrastructure({ project, host, options = {}, query }) {
  const checks = [await nodeManager(project, host), pythonEnvironment(project, host)];
  if (!options.wsl) checks.push(skip('WSL-01', 'WSL 점검 대상이 선택되지 않았습니다.'));
  else {
    const q = host.probes?.wsl;
    const complete = q?.state === 'succeeded' && Boolean(q.version) && Array.isArray(q.data?.distributions);
    const status = complete ? 'pass' : q?.state === 'not_found' ? 'fail' : 'unknown';
    const reason = complete ? 'wsl_host_observed' : q?.data?.queries?.length ? 'wsl_host_metadata_incomplete' : q?.state ?? 'not_queried';
    const message = complete ? 'WSL 호스트 버전과 설치 배포판 목록을 확인했습니다.' : 'WSL 호스트 버전과 설치 배포판 목록의 조회 근거가 부족합니다.';
    checks.push(check('WSL-01', status, reason, message, q?.data ?? {}, {
      resolution: binary(host, 'wsl') ? 'resolved' : 'not_resolved',
      execution: ['succeeded', 'failed', 'timed_out'].includes(q?.state) ? q.state : 'not_run',
      resolvedPath: q?.executable ?? null,
    }));
  }
  const container = options.containers ? 'required' : project.environment.containers;
  if (container === 'not_required') checks.push(skip('CTR-01', '컨테이너 요구가 없습니다.'), skip('LD-01', '컨테이너 관리 요구가 없습니다.'));
  else {
    const observed = { declarations: project.metadata?.compose ?? {}, devcontainer: project.metadata?.devcontainer ?? null, context: null, compose: null, engine: 'not_contacted' };
    const version = host.probes?.docker;
    if (binary(host, 'docker')) {
      const selected = await query('docker', ['context', 'show']);
      const name = decodeOutput(selected.stdout);
      if (okay(selected) && /^[\w.-]{1,120}$/.test(name)) {
        const inspected = await query('docker', ['context', 'inspect', name]);
        try { const data = JSON.parse(decodeOutput(inspected.stdout)); const row = Array.isArray(data) ? data[0] : data; observed.context = { name, endpointKind: endpointKind(row.Endpoints?.docker?.Host), queryState: inspected.state }; } catch { observed.context = { name, endpointKind: 'unknown' }; }
      }
      const dockerPath = version?.executable ?? binary(host, 'docker')?.path;
      const composePaths = [dockerPath && join(dirname(dockerPath), '..', 'cli-plugins', 'docker-compose.exe'), process.env.ProgramFiles && join(process.env.ProgramFiles, 'Docker', 'Docker', 'resources', 'cli-plugins', 'docker-compose.exe')].filter(Boolean);
      observed.compose = { state: 'not_run', version: null, reason: 'verified_plugin_not_found' };
      for (const executable of [...new Set(composePaths)]) {
        const compose = await query('docker-compose', ['version', '--format', 'json'], { executable });
        try {
          const value = JSON.parse(decodeOutput(compose.stdout));
          if (okay(compose) && /^v?\d+\.\d+\.\d+$/.test(value.version)) { observed.compose = { state: compose.state, version: value.version.replace(/^v/, ''), executable, method: 'verified_direct_plugin' }; break; }
        } catch { /* No unverified Docker CLI plugin is discovered or executed. */ }
      }
    }
    const status = container === 'unknown' ? 'unknown' : !binary(host, 'docker') ? 'fail' : version?.state === 'succeeded' && observed.context?.queryState === 'succeeded' && observed.context.endpointKind !== 'unknown' && observed.compose?.version ? 'pass' : 'unknown';
    checks.push(check('CTR-01', status, status === 'pass' ? 'container_client_configuration_observed' : !binary(host, 'docker') ? 'docker_not_resolved' : 'container_configuration_incomplete', 'Docker 클라이언트·Compose 버전·context 메타데이터를 엔진 연결과 구분했습니다.', observed, { applicability: container, resolution: binary(host, 'docker') ? 'resolved' : 'not_resolved', execution: version?.state === 'succeeded' ? 'succeeded' : 'not_run' }));
    const lazy = binary(host, 'lazydocker');
    const configRoot = process.env.APPDATA ? join(process.env.APPDATA, 'lazydocker', 'config.yml') : null;
    const config = configRoot ? await metadataFile(configRoot) : { state: 'unknown' };
    const configObservation = { state: config.state, path: configRoot, customCommands: false, composeCommand: 'default', commandValues: 'not_collected' };
    if (config.state === 'read') {
      try {
        const document = parseDocument(config.text, { prettyErrors: false, uniqueKeys: true });
        if (document.errors.length) throw new Error();
        const settings = document.toJS({ maxAliasCount: 50 });
        configObservation.customCommands = Boolean(settings?.customCommands);
        const compose = settings?.commandTemplates?.dockerCompose;
        configObservation.composeCommand = compose === undefined ? 'default' : compose === 'docker compose' ? 'docker-compose-v2' : 'custom';
      } catch { configObservation.state = 'unknown'; }
    }
    checks.push(check('LD-01', container === 'unknown' || configObservation.state === 'unknown' ? 'unknown' : lazy ? 'pass' : 'warn', lazy ? 'tui_metadata_observed' : 'lazydocker_not_resolved', 'Lazydocker의 명령 후보·Compose 명령 설정·Docker context를 확인했습니다.', { command: lazy ?? null, configuration: configObservation, dockerContext: observed.context, tui: 'not_started', engine: 'not_contacted' }, { resolution: lazy ? 'resolved' : 'not_resolved', recommendation: { status: lazy ? 'aligned' : 'different', expected: 'Lazydocker' } }));
  }
  const state = options.processCompose ? 'required' : project.environment.processCompose;
  if (state === 'not_required') checks.push(skip('PC-01', '로컬 다중 프로세스 관리 요구가 없습니다.'));
  else {
    const meta = project.metadata?.processCompose ?? {}, cmd = binary(host, 'process-compose');
    const declarations = meta.configurations ?? [], unknown = declarations.some((i) => i.state === 'unknown');
    checks.push(check('PC-01', state === 'unknown' || unknown ? 'unknown' : !cmd ? 'fail' : declarations.length ? 'pass' : 'unknown', unknown ? 'service_configuration_unknown' : !cmd ? 'process_compose_not_resolved' : 'service_configuration_observed', 'Process Compose의 셸·작업 경로·의존성과 준비 검사 선언을 정적으로 확인했습니다.', { command: cmd ?? null, configuration: meta, environmentValues: 'not_collected', serviceExecution: 'not_run' }, { applicability: state, resolution: cmd ? 'resolved' : 'not_resolved' }));
  }
  return { checks };
}
