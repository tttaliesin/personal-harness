import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORT_SNAPSHOT, assessSupport, attachSupport } from '../src/support.mjs';

const NOW = '2026-11-17T12:00:00Z';

test('지원 정책은 날짜가 고정된 snapshot과 근거 URL을 반환한다', () => {
  assert.deepEqual(SUPPORT_SNAPSHOT, { checkedOn: '2026-11-17', validUntil: '2026-12-17' });
  for (const [tool, version, release] of [['node', 'v24.0.0', '24'], ['python', '3.13.0', '3.13'], ['go', 'go1.27.0', '1.27'], ['dotnet', '10.0.100', '10'], ['powershell', '7.6.0', '7.6']]) {
    const result = assessSupport(tool, version, { now: NOW });
    assert.equal(result.status, 'in_support', tool);
    assert.equal(result.release, release);
    assert.equal(result.checkedOn, SUPPORT_SNAPSHOT.checkedOn);
    assert.equal(result.validUntil, SUPPORT_SNAPSHOT.validUntil);
    assert.match(result.source, /^https:\/\//);
  }
});

test('snapshot의 시작일·종료일을 포함하고 그 전후에는 지원 여부를 미확인으로 되돌린다', () => {
  for (const [now, status] of [['2026-11-16T23:59:59Z', 'unknown'], ['2026-11-17T00:00:00Z', 'in_support'], ['2026-12-17T23:59:59Z', 'in_support'], ['2026-12-18T00:00:00Z', 'unknown']]) {
    const result = assessSupport('node', '24.18.1', { now });
    assert.equal(result.status, status, now);
    if (status === 'unknown') assert.equal(result.reason, 'policy_snapshot_stale');
  }
});

test('릴리스 계열 지원을 패치 최신성이나 플랫폼 지원으로 확대하지 않는다', () => {
  for (const [tool, versions] of [['node', ['24.0.0', '24.18.1']], ['python', ['3.13.0', '3.13.9']], ['go', ['go1.27.0', 'go1.27.3']]]) {
    const results = versions.map((version) => assessSupport(tool, version, { now: NOW }));
    assert.equal(results[0].release, results[1].release);
    for (const result of results) {
      assert.equal(result.status, 'in_support');
      assert.equal(result.scope, 'release_line');
      assert.equal(result.patchCurrency, 'not_checked');
      assert.equal(result.platformSupport, 'not_checked');
    }
  }
});

test('지원 종료·미수록 미래 계열·시험판·정책 없는 도구를 구분한다', () => {
  for (const [tool, version, status, reason] of [['node', '20.19.0', 'out_of_support', 'release_line_ended'], ['python', '3.10.0', 'out_of_support', 'release_line_ended'], ['go', '1.25.0', 'out_of_support', 'release_line_ended'], ['node', '28.0.0', 'unknown', 'release_not_in_snapshot'], ['node', '24.0.0-rc.1', 'unknown', 'stable_version_not_verified'], ['node', null, 'unknown', 'stable_version_not_verified'], ['rust', '1.90.0', 'unknown', 'no_formal_policy_snapshot']]) {
    const result = assessSupport(tool, version, { now: NOW });
    assert.equal(result.status, status, `${tool} ${version}`);
    assert.equal(result.reason, reason, `${tool} ${version}`);
  }
});

test('Windows 지원은 같은 build라도 Pro·Enterprise·미확인 채널을 구분한다', () => {
  const assess = (name, build = '26100') => assessSupport('windows', null, { now: NOW, os: { name, build } });
  assert.equal(assess('Microsoft Windows 11 Pro').status, 'out_of_support');
  assert.equal(assess('Microsoft Windows 11 Enterprise').status, 'in_support');
  for (const name of ['Microsoft Windows 11 Enterprise LTSC', 'Microsoft Windows Server 2025', 'Microsoft Windows 11']) assert.equal(assess(name).status, 'unknown', name);
  assert.equal(assess('Microsoft Windows 11 Pro', '99999').reason, 'release_not_in_snapshot');
});

test('지원 판정 연결은 호환성·실패를 보존하고 지원 종료 계열의 통과만 경고로 바꾼다', () => {
  const host = { context: { diagnosticShell: { version: '7.6.0' }, os: { name: 'Microsoft Windows 11 Pro', build: '26100' } } };
  const checks = [
    { checkId: 'ENV-01', status: 'pass', compatibility: 'satisfied' },
    { checkId: 'NODE-01', status: 'pass', observed: '20.19.0', compatibility: 'satisfied' },
    { checkId: 'PY-01', status: 'fail', observed: '3.10.0', compatibility: 'violated' },
    { checkId: 'SH-01', status: 'pass' },
    { checkId: 'DOTNET-01', status: 'pass', observed: { selectedSdk: { version: '10.0.100' } } },
    { checkId: 'GO-01', status: 'skipped', support: { status: 'unknown' } },
    { checkId: 'GIT-01', status: 'pass', support: { status: 'unknown' } },
  ];
  attachSupport(checks, host, NOW);
  for (const item of checks.slice(0, 2)) { assert.equal(item.status, 'warn'); assert.equal(item.compatibility, 'satisfied'); assert.equal(item.support.status, 'out_of_support'); }
  assert.equal(checks[2].status, 'fail'); assert.equal(checks[2].compatibility, 'violated');
  assert.equal(checks[3].support.status, 'in_support');
  assert.equal(checks[4].support.status, 'in_support');
  assert.deepEqual(checks[5], { checkId: 'GO-01', status: 'skipped', support: { status: 'unknown' } });
  assert.deepEqual(checks[6], { checkId: 'GIT-01', status: 'pass', support: { status: 'unknown' } });
  const expired = [{ checkId: 'NODE-01', status: 'pass', observed: '24.18.1' }];
  attachSupport(expired, host, '2026-12-18T00:00:00Z');
  assert.equal(expired[0].support.reason, 'policy_snapshot_stale');
  assert.equal(expired[0].support.status, 'unknown');
});
