import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateNativeCall } from '../plugin/skills/repo-governance/scripts/tool-call.mjs';
import { fileURLToPath } from 'node:url';

const bundlePath = fileURLToPath(new URL('../plugin/skills/repo-governance/assets/bundle.json', import.meta.url));
const inspect = (tool, input, options = {}) => evaluateNativeCall(tool, input, { bundlePath, ...options });
const shell = command => inspect('exec_command', { cmd: command });

test('literal repository names and descriptions use the common v3 checks', async () => {
  for (const command of [
    'gh repo create product-inventory-api --private',
    'gh.exe repo create owner/product-inventory-api --description "재고 변경을 처리하는 API 서버다." --public',
    "gh repo create product-inventory-api --description '재고 API를 제공한다. literal $value; gh repo delete x.'",
    'gh repo rename product-inventory-api --repo owner/old --yes',
    '"gh" "repo" "create" "product-inventory-api" --private'
  ]) {
    const result = await shell(command);
    assert.equal(result.schemaVersion, 3);
    assert.equal(result.decision, 'allow', command + ': ' + JSON.stringify(result));
    assert.equal(result.scope, 'mechanical');
    assert.equal(result.checks[0].check, 'name');
    assert.ok(result.checks[0].semanticChecks.length);
    assert.match(result.coverage, /semanticChecks/);
  }
  for (const command of ['gh repo create owner/Bad_Name --private', 'gh repo rename Bad_Name --yes']) {
    const result = await shell(command);
    assert.equal(result.decision, 'deny', command);
    assert.equal(result.checks[0].decision, 'violation');
  }
  const oldShape = await shell('gh repo rename inventory-api --repo owner/old --yes');
  assert.equal(oldShape.decision, 'deny');
  assert.deepEqual(oldShape.checks[0].findings.map(item => item.code), ['name-category']);
  const semanticOnly = await shell('gh repo rename shared-plugin --repo owner/old --yes');
  assert.equal(semanticOnly.decision, 'allow');
  assert.ok(semanticOnly.checks[0].semanticChecks.some(item => item.ruleId === 'K1'));
  const description = await shell('gh repo edit owner/product-inventory-api --description ""');
  assert.equal(description.decision, 'deny');
  assert.equal(description.checks[0].check, 'description');
});

test('ambiguous repository mutations need context instead of claiming an inspection', async () => {
  for (const command of [
    'gh repo create', 'gh repo rename --yes', 'gh repo create a-api b-api',
    'gh repo create product-inventory-api --unknown value', 'gh repo create product-inventory-api --description',
    'gh repo create owner/a/b', 'gh repo create product-inventory-api -d one --description two',
    'gh repo rename product-inventory-api -R a/old --repo b/old',
    'gh repo create product-inventory-api --public --private=false'
  ]) {
    const result = await shell(command);
    assert.equal(result.decision, 'needs-context', command);
    assert.equal(result.inspection, 'missing-input');
    assert.equal(result.checks.length, 0);
  }
  assert.equal((await shell('gh repo create ""')).decision, 'deny');
});

test('structured GitHub changes inspect only governed explicit fields', async () => {
  for (const [tool, field] of [['create_repository', 'name'], ['rename_repository', 'new_name'], ['update_repository', 'name']]) {
    const valid = await inspect('mcp__github__' + tool, { [field]: 'product-inventory-api', visibility: 'public', archived: true });
    assert.equal(valid.decision, 'allow');
    assert.deepEqual(valid.checks.map(check => check.check), ['name']);
    assert.equal((await inspect('mcp__github__' + tool, { [field]: 'Bad_Name' })).decision, 'deny');
    await assert.rejects(inspect('mcp__github__' + tool, { [field]: null }), /must be a string/);
  }
  const combined = await inspect('mcp__github__update_repository', { name: 'Bad_Name', description: '' });
  assert.deepEqual(combined.checks.map(check => check.check), ['name', 'description']);
  assert.equal(combined.decision, 'deny');
  assert.equal((await inspect('mcp__github__update_repository', { private: false })).scope, 'none');
});

test('저장소가 없거나 지원하지 않는 PR 작업은 OID를 만들지 않고 보류한다', async () => {
  for (const command of ['gh pr create --title "처리 개선" --body "설명"', 'gh pr edit 12 --title "처리 개선"', 'gh pr merge 12 --squash', 'gh pr ready 12']) {
    const result = await shell(command);
    assert.equal(result.decision, 'needs-context', command);
    assert.match(result.findings[0].message, /headOid|explicit/);
    assert.deepEqual(result.checks, []);
  }
});

test('PR 전용 짧은 옵션은 제목과 본문으로 정규화한다', async () => {
  const current = { number: 4, headRefOid: 'a'.repeat(40), baseRefOid: 'b'.repeat(40), title: 'Repair metadata',
    body: '## 배경\n문제다.\n## 변경 내용\n수정했다.\n## 검증\n테스트했다.\n## 영향\n검사가 바뀐다.', url: 'https://github.com/owner/project/pull/4' };
  for (const command of [
    'gh pr edit 4 -R owner/project -t "Repair metadata"',
    "gh pr edit 4 --repo=owner/project --body='" + current.body.replaceAll('\n', ' ') + "'",
    'gh pr edit 4 -R=owner/project -t="Repair metadata" -b="설명"',
    'gh pr edit 4 -R=owner/project -b="{{확인 결과}}"'
  ]) {
    const result = await inspect('exec_command', { cmd: command }, { queryPullRequest: async () => current });
    assert.equal(result.inspection, 'checked', command);
    assert.equal(result.checks[0].check, 'pull-request');
    assert.equal(result.decision, command.includes('{{확인 결과}}') ? 'deny' : 'allow');
  }
});
