import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateVersion } from '../src/versions.mjs';

const assess = (version, value, kind = 'range', metadata = {}) => evaluateVersion(version, [{ kind, value }], metadata).compatibility;
const python = (version, value) => assess(version, value, 'range', { language: 'python' });

test('Node 범위와 복수 선언의 교집합을 비교한다', () => {
  assert.equal(assess('v24.18.1', '>=24 <25'), 'satisfied');
  assert.equal(assess('v26.1.0', '>=24 <25'), 'violated');
  assert.equal(assess('24.18.1', '^24.0.0 || >=26'), 'satisfied');
  assert.equal(evaluateVersion('24.18.1', [{ kind: 'range', value: '>=24' }, { kind: 'exact', value: '22' }]).compatibility, 'violated');
});

test('Python 비교 연산자와 호환 릴리스 범위를 비교한다', () => {
  assert.equal(python('3.14.6', '>=3.14, <3.15'), 'satisfied');
  assert.equal(python('3.15.1', '~=3.14.0'), 'violated');
  assert.equal(python('3.15.1', '~=3.14'), 'satisfied');
});

test('Node 축약 비교 경계와 Python의 숫자 비교를 구분한다', () => {
  assert.equal(assess('24.18.1', '>24'), 'violated');
  assert.equal(assess('24.18.1', '<=24'), 'satisfied');
  assert.equal(assess('24.18.1', '>24.18'), 'violated');
  assert.equal(assess('24.18.1', '<=24.18'), 'satisfied');
  assert.equal(python('3.14.6', '>3.14'), 'satisfied');
  assert.equal(python('3.14.6', '<=3.14'), 'violated');
});

test('Python의 동등 버전과 명시한 wildcard 접두사를 구분한다', () => {
  assert.equal(python('3.14.6', '==3.14'), 'violated');
  assert.equal(python('3.14.6', '!=3.14'), 'satisfied');
  assert.equal(python('3.14.0', '==3.14'), 'satisfied');
  assert.equal(python('3.14.6', '==3.14.*'), 'satisfied');
  assert.equal(python('3.14.6', '!=3.14.*'), 'violated');
});

test('최소 버전과 선호 도구 모음을 구분한다', () => {
  assert.equal(assess('go1.26.5', '1.25', 'minimum'), 'satisfied');
  assert.equal(evaluateVersion('1.26.5', [{ kind: 'minimum', value: '1.25' }, { kind: 'preferred', value: '1.27.0' }]).compatibility, 'satisfied');
});

test('잘못된 표현은 미확인으로 남기고 표준 hyphen·prerelease 규칙을 적용한다', () => {
  for (const requirement of ['workspace:*', 'latest', 'lts/*', '>=3.14; sys_platform == "win32"', '00024', '9007199254740993']) assert.equal(assess('24.18.1', requirement), 'unknown');
  assert.equal(assess('24.18.1', '24 - 26'), 'satisfied');
  assert.equal(assess('24.0.0-rc.1', '>=24'), 'violated');
  assert.equal(evaluateVersion('1.90.0', [{ kind: 'channel', value: 'stable' }]).compatibility, 'unknown');
});

test('.NET SDK feature band와 rollForward를 구분한다', () => {
  assert.equal(assess('10.0.125', '10.0.100', 'sdk'), 'satisfied');
  assert.equal(assess('10.0.200', '10.0.100', 'sdk'), 'violated');
  assert.equal(assess('10.0.200', '10.0.100', 'sdk', { sdk: { rollForward: 'feature' } }), 'satisfied');
  assert.equal(assess('10.0.125', '10.0.100', 'sdk', { sdk: { rollForward: 'disable' } }), 'violated');
  assert.equal(assess('10.0.125', '10.0.100', 'sdk', { sdk: { rollForward: 'other' } }), 'unknown');
});

test('caret의 0.x 경계와 wildcard 범위를 유지한다', () => {
  assert.equal(assess('0.3.1', '^0.2.0'), 'violated');
  assert.equal(assess('24.18.1', '24.x'), 'satisfied');
  assert.equal(assess('24.18.1', '25.*'), 'violated');
  assert.equal(assess('24.18.1', '*'), 'satisfied');
});

test('같은 관리 설정의 여러 버전을 동시에 만족해야 하는 exact 핀으로 오판하지 않는다', () => {
  const requests = ['3.14.6', '3.13.2'].map((value) => ({ source: 'mise.toml', field: 'tools.python', kind: 'exact', value }));
  assert.equal(evaluateVersion('3.14.6', requests, { language: 'python' }).compatibility, 'unknown');
  const constrained = [...requests, { source: 'pyproject.toml', field: 'requires-python', kind: 'range', value: '>=3.15' }];
  assert.equal(evaluateVersion('3.14.6', constrained, { language: 'python' }).compatibility, 'violated');
});
