export async function checkApp({ query, enabled = false, executable }) {
  const base = { checkId: 'CODEX-01', applicability: enabled ? 'required' : 'not_required', resolution: 'unknown', execution: 'not_run', compatibility: 'unknown', support: { status: 'unknown', source: null, checkedOn: null }, recommendation: { status: 'unknown' }, nextAction: '앱의 플러그인 화면과 설치한 Skill 호출 결과를 함께 확인합니다.' };
  if (!enabled) return { ...base, status: 'skipped', reason: 'app_check_not_selected', message: '앱 설치 점검은 --app으로 선택합니다.' };
  const result = await query('codex', ['plugin', 'list', '--marketplace', 'windows-agent-devkit-local', '--json'], { executable });
  let data;
  try { data = JSON.parse(result.stdout); } catch {}
  const entries = Array.isArray(data) ? data : data?.installed ?? data?.plugins ?? data?.data?.plugins ?? [];
  const entry = entries.find((item) => item.name === 'windows-agent-devkit' || item.id === 'windows-agent-devkit@windows-agent-devkit-local' || item.plugin?.name === 'windows-agent-devkit');
  const installed = Boolean(entry) && (Array.isArray(data?.installed) || entry.installed === true || entry.isInstalled === true || entry.installation?.status === 'installed' || entry.installationState === 'installed');
  const absent = result.state === 'succeeded' && Array.isArray(data?.installed) && !entry;
  return { ...base, status: installed ? entry.enabled === false ? 'warn' : 'pass' : absent ? 'fail' : 'unknown', reason: installed ? 'local_plugin_installation_observed' : absent ? 'local_plugin_not_installed' : 'plugin_installation_not_verified', message: installed ? '앱과 공유하는 플러그인 설치 목록에서 이 패키지를 확인했습니다.' : absent ? '선택한 로컬 마켓플레이스에 이 플러그인이 설치되어 있지 않습니다.' : '설치 목록에서 이 패키지의 설치 상태를 확정하지 못했습니다.', resolution: result.executable ? 'resolved' : 'not_resolved', execution: ['succeeded', 'failed', 'timed_out'].includes(result.state) ? result.state : 'not_run', compatibility: installed ? 'satisfied' : absent ? 'violated' : 'unknown', observed: { queryState: result.state, installed, enabled: entry?.enabled ?? null, plugin: installed ? { name: 'windows-agent-devkit', marketplace: 'windows-agent-devkit-local', version: entry.localVersion ?? entry.version ?? entry.plugin?.version ?? null } : null, skillInvocation: 'separate_app_evidence_required' } };
}
