import semver from 'semver';

// A dated, offline snapshot of upstream release-line policies, not a CVE database.
export const SUPPORT_SNAPSHOT = Object.freeze({ checkedOn: '2026-11-17', validUntil: '2026-12-17' });
const SOURCES = {
  node: 'https://raw.githubusercontent.com/nodejs/Release/main/schedule.json',
  python: 'https://devguide.python.org/versions/',
  go: 'https://go.dev/doc/devel/release',
  dotnet: 'https://dotnet.microsoft.com/en-us/platform/support/policy',
  powershell: 'https://learn.microsoft.com/en-us/powershell/scripting/install/powershell-support-lifecycle',
  windows: 'https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information',
};
const RELEASES = {
  node: { 22: '2027-04-30', 24: '2028-04-30', 26: '2029-04-30' },
  python: { '3.11': '2027-10', '3.12': '2028-10', '3.13': '2029-10', '3.14': '2030-10', '3.15': '2031-10' },
  go: { '1.26': null, '1.27': null },
  dotnet: { 10: '2028-11-14', 11: '2028-11-14' },
  powershell: { '7.6': '2028-11-14' },
};

export function assessSupport(tool, version, { now = new Date(), os } = {}) {
  const today = new Date(now).toISOString().slice(0, 10);
  const base = { status: 'unknown', source: SOURCES[tool] ?? null, ...SUPPORT_SNAPSHOT, scope: 'release_line', patchCurrency: 'not_checked', platformSupport: 'not_checked' };
  if (today < SUPPORT_SNAPSHOT.checkedOn || today > SUPPORT_SNAPSHOT.validUntil) return { ...base, reason: 'policy_snapshot_stale' };
  if (tool === 'windows') {
    const build = Number(os?.build), name = os?.name ?? '';
    if (!/Windows 11/i.test(name) || /LTSC|Server/i.test(name)) return { ...base, reason: 'edition_or_channel_unknown' };
    const enterprise = /Enterprise|Education/i.test(name), consumer = /Home|Pro/i.test(name);
    if (!enterprise && !consumer) return { ...base, reason: 'edition_unknown' };
    const rows = { 26300: ['26H2', '2028-10-10', '2029-10-09'], 28000: ['26H1', '2028-03-14', '2029-03-13'], 26200: ['25H2', '2027-10-12', '2028-10-10'], 26100: ['24H2', 'ended', '2027-10-12'], 22631: ['23H2', 'ended', 'ended'] };
    const row = rows[build];
    if (!row) return { ...base, reason: 'release_not_in_snapshot' };
    const end = row[enterprise ? 2 : 1];
    return { ...base, status: end === 'ended' || today >= end ? 'out_of_support' : 'in_support', reason: 'upstream_release_line_policy', release: row[0], endOfSupport: end };
  }
  const parsed = semver.parse(String(version ?? '').replace(/^(?:go|v)(?=\d)/, ''));
  if (!parsed || parsed.prerelease.length) return { ...base, reason: 'stable_version_not_verified' };
  if (!RELEASES[tool]) return { ...base, reason: 'no_formal_policy_snapshot' };
  const key = ['python', 'go', 'powershell'].includes(tool) ? `${parsed.major}.${parsed.minor}` : String(parsed.major);
  const entries = RELEASES[tool];
  if (Object.hasOwn(entries, key)) return { ...base, status: 'in_support', reason: 'upstream_release_line_policy', release: key, endOfSupport: entries[key] };
  const highest = Object.keys(entries).at(-1);
  const order = semver.compare(`${parsed.major}.${parsed.minor}.0`, `${highest}${highest.includes('.') ? '' : '.0'}.0`);
  return { ...base, status: order < 0 ? 'out_of_support' : 'unknown', reason: order < 0 ? 'release_line_ended' : 'release_not_in_snapshot', release: key };
}

export function attachSupport(checks, host, now) {
  const tools = { 'ENV-01': 'windows', 'SH-01': 'powershell', 'NODE-01': 'node', 'PY-01': 'python', 'GO-01': 'go', 'RUST-01': 'rust', 'ZIG-01': 'zig', 'DOTNET-01': 'dotnet' };
  for (const check of checks) {
    const tool = tools[check.checkId];
    if (!tool || check.status === 'skipped') continue;
    const version = tool === 'powershell' ? host.context?.diagnosticShell?.version : typeof check.observed === 'string' ? check.observed : typeof check.observed?.selectedSdk === 'string' ? check.observed.selectedSdk : check.observed?.selectedSdk?.version ?? check.observed?.selectedVersion;
    check.support = assessSupport(tool, version, { now, os: host.context?.os });
    if (check.support.status === 'out_of_support' && check.status === 'pass') {
      check.status = 'warn';
      check.nextAction = '프로젝트 호환성 결과와 별도로 공식 지원 종료 계열의 전환을 검토합니다.';
    }
  }
}
