import test from 'node:test';
import assert from 'node:assert/strict';
import { requestFrom } from '../plugin/skills/repo-governance/scripts/contracts.mjs';
import { readInput, sha } from '../plugin/skills/repo-governance/scripts/inputs.mjs';
import { runCheck } from '../plugin/skills/repo-governance/scripts/check.mjs';
import { fileURLToPath } from 'node:url';

const body = '## 배경\n생성 전에 검사한다.\n## 변경 내용\n같은 검사를 사용한다.\n## 검증\n테스트를 실행했다.\n## 영향\n수정 경로를 유지한다.';
const source = { kind: 'pr-create', repository: 'owner/project', headRef: 'refs/heads/feature/a', baseRef: 'refs/heads/main',
  headOid: 'a'.repeat(40), baseOid: 'b'.repeat(40), title: 'Inspect PR creation', body, draft: false };
const request = value => ({ schemaVersion: 3, operation: 'check', check: 'pull-request', sources: [value],
  context: { bundlePath: fileURLToPath(new URL('../plugin/skills/repo-governance/assets/bundle.json', import.meta.url)) } });

test('생성 전 자료는 정확한 필드와 전체 브랜치 ref 및 단계가 필요하다', () => {
  assert.deepEqual(requestFrom(request(source), []).sources, [source]);
  for (const key of Object.keys(source).filter(key => key !== 'kind')) {
    const incomplete = { ...source };
    delete incomplete[key];
    assert.throws(() => requestFrom(request(incomplete), []), key);
  }
  for (const replacement of [
    { repository: 'https://github.com/owner/project' }, { repository: 'owner/..' }, { repository: 'owner/project/extra' },
    { headRef: 'feature' }, { baseRef: 'refs/tags/main' }, { headRef: 'refs/heads/' }, { headRef: 'refs/heads/a..b' },
    { headRef: 'refs/heads/.hidden' }, { headRef: 'refs/heads/a.lock' }, { headRef: 'refs/heads/a@{b' },
    { headRef: 'refs/heads/a b' }, { headRef: 'refs/heads/a\\b' }, { headRef: 'refs/heads/a/' }, { headRef: 'refs/heads/a.' },
    { headOid: 'a'.repeat(39) }, { baseOid: 'B'.repeat(40) }, { draft: null }, { draft: 'false' }, { title: null },
    { body: 'bad\0body' }, { number: 1 }, { approved: true }, { unknown: null }
  ]) assert.throws(() => requestFrom(request({ ...source, ...replacement }), []), JSON.stringify(replacement));
  assert.throws(() => requestFrom({ ...request(source), check: 'name' }, []));
});

test('제공한 생성 전 자료의 관측은 번호를 만들지 않고 ref와 본문 및 단계를 식별한다', async () => {
  for (const draft of [false, true]) {
    const seen = [], selected = { ...source, draft };
    const result = await readInput(request(selected), undefined, seen);
    assert.equal(result.pr, selected);
    assert.equal(result.target, 'https://github.com/owner/project/compare/refs%2Fheads%2Fmain...refs%2Fheads%2Ffeature%2Fa');
    assert.deepEqual(seen, [
      { kind: 'pr-head', target: 'owner/project@refs/heads/feature/a', digestOrOid: source.headOid },
      { kind: 'pr-base', target: 'owner/project@refs/heads/main', digestOrOid: source.baseOid },
      { kind: 'pr-title', target: result.target, digestOrOid: sha(source.title) },
      { kind: 'pr-body', target: result.target, digestOrOid: sha(body) },
      { kind: 'pr-draft', target: result.target, digestOrOid: sha(JSON.stringify(draft)) }
    ]);
  }
});

test('생성 전 자료와 기존 번호 자료는 동일한 K6 본문 판정을 유지한다', async () => {
  const numbered = { kind: 'pr', number: 4, headOid: source.headOid, baseOid: source.baseOid, title: source.title, body };
  for (const [changes, expected] of [[{},'pass'],[{title:''},'violation'],[{body:''},'pass'],
    [{body:'본문이 한 문장이다.'},'pass'],[{body:'{{검증 결과}}'},'violation'],[{title:'Two\nlines'},'violation']]) {
    const results = await Promise.all([source, numbered].map(async value => JSON.parse((await runCheck(JSON.stringify(request({ ...value, ...changes })))).line)));
    assert.equal(results[0].decision, expected);
    assert.equal(results[0].decision, results[1].decision);
    assert.deepEqual(results[0].findings.map(({ ruleId, code }) => ({ ruleId, code })), results[1].findings.map(({ ruleId, code }) => ({ ruleId, code })));
    assert.ok(results[0].semanticChecks[0].requiredEvidence.some(item => item.includes('creation refs')));
  }
  for (const number of [undefined, 0, '4']) {
    const value = { ...numbered, number };
    if (number === undefined) delete value.number;
    assert.throws(() => requestFrom(request(value), []));
  }
});
