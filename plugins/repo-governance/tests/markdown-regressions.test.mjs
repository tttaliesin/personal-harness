import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli=fileURLToPath(new URL('../plugin/skills/repo-governance/scripts/check.mjs',import.meta.url));
const bundlePath=process.env.REPO_GOVERNANCE_TEST_BUNDLE ?? fileURLToPath(new URL('../plugin/skills/repo-governance/assets/bundle.json',import.meta.url));
function check(text,decision,code,repository) {
  const source=repository?{kind:'file',path:'README.md'}:{kind:'text',text};
  if (repository) writeFileSync(join(repository,'README.md'),text);
  const request={schemaVersion:3,operation:'check',check:'readme',sources:[source],context:{bundlePath,...(repository?{repository}:{})}};
  const run=spawnSync(process.execPath,[cli],{input:JSON.stringify(request),encoding:'utf8',windowsHide:true});
  assert.ifError(run.error);
  assert.equal(run.stdout.trimEnd().split('\n').length,1,run.stderr);
  const result=JSON.parse(run.stdout);
  assert.equal(result.decision,decision,JSON.stringify(result.findings));
  assert.equal(run.status,decision==='pass'?0:2,run.stdout+run.stderr);
  assert.equal(result.scope,'mechanical');
  assert.ok(result.semanticChecks.length>0);
  if (code) assert.ok(result.findings.some(f=>f.code===code),JSON.stringify(result.findings));
  return result;
}

test('literal comment openers in inline, fenced and indented code cannot hide an empty section',()=>{
  for (const example of ['HTML 주석은 `<!--`로 시작한다.','HTML 주석은 `` `<!--` ``로 시작한다.','주석 예시 `<!--\n예시의 다음 줄`이다.','```text\n<!--\n```','~~~text\n<!--\n~~~','    <!--']) {
    const text='# 제품\n\n'+example+'\n\n';
    check(text+'## 빈 절\n<!-- 실제 주석 -->\n','violation','empty-section');
    check(text+'## 사용\n실행한다.\n<!-- 실제 주석 -->\n','pass');
  }
  check('# 제품\n\n설명이다.\n<!-- 숨긴다.\n## 숨긴 절\n{{field}}\n[자료](missing.md)\n-->\n','pass');
  check('# 제품\n\n설명이다.\n\n## 빈 절\n<!-- 내용이 아니다. -->\n','violation','empty-section');
  check('# 제품\n\n제목 `\n---\n보이는 {{field}}\n`\n','violation','placeholder');
  check('# 제품\n\n제목 `\n===\n보이는 {{field}}\n`\n','violation','placeholder');
  check('# 제품\n\n> ```text\n> {{field}}\n> ```\n','pass');
});

test('indented and fenced template examples pass while visible placeholders still fail',()=>{
  for (const example of ['    {{field}}','\t{{field}}','```text\n{{field}}\n```','`{{field}}`'])
    check('# 제품\n\n템플릿 문법을 설명한다.\n\n'+example+'\n','pass');
  for (const text of ['{{field}}','    {{field}}\n\n{{visible}}'])
    check('# 제품\n\n템플릿 문법을 설명한다.\n\n'+text+'\n','violation','placeholder');
  check('# 제품\n\n본문이다.\n    {{field}}\n','violation','placeholder');
  check('# 제품\n\n    ## 코드의 제목\n    [자료](missing.md)\n','pass');
});

test('defined shortcut references inspect actual targets like full and collapsed references',t=>{
  const repository=mkdtempSync(join(tmpdir(),'governance-markdown-'));
  t.after(()=>rmSync(repository,{recursive:true,force:true}));
  writeFileSync(join(repository,'guide.md'),'# 자료\n\n설명이다.\n');
  for (const link of ['[자료]','[자료][자료]','[자료][]']) {
    check('# 제품\n\n'+link+'\n\n[자료]: missing.md\n','violation','link-missing',repository);
    check('# 제품\n\n'+link+'\n\n[자료]: guide.md\n','pass',undefined,repository);
  }
  check('# 제품\n\n정의되지 않은 [문구]는 본문이다.\n','pass',undefined,repository);
  check('# 제품\n\n[자료](guide.md)\n\n[자료]: missing.md\n','pass',undefined,repository);
  check('# 제품\n\n[자료][다른 자료]\n\n[자료]: missing.md\n[다른 자료]: guide.md\n','pass',undefined,repository);
});

test('escaped reference notation stays literal while parsed links inspect actual targets',t=>{
  const repository=mkdtempSync(join(tmpdir(),'governance-literal-link-'));
  t.after(()=>rmSync(repository,{recursive:true,force:true}));
  for (const value of [String.raw`링크 표기는 \[자료\]\[대상\]이다.`, '`[자료][대상]`', '정의되지 않은 [자료][대상]은 일반 본문이다.'])
    check('# 제품\n\n'+value+'\n','pass',undefined,repository);
  check('# 제품\n\n[자료][대상]\n\n[대상]: missing.md\n','violation','link-missing',repository);
  check('# 제품\n\n[자료](missing.md)\n','violation','link-missing',repository);
});

test('one and two column tables require populated body rows',()=>{
  for (const table of ['| 기능 |\n| --- |','| 기능 | 설명 |\n| --- | --- |','| 기능 |\n| :---: |']) {
    check('# 제품\n\n'+table+'\n','violation','empty-table');
    const row=table.includes('설명')?'| 검사 | 설명한다. |':'| 검사 |';
    check('# 제품\n\n'+table+'\n'+row+'\n','pass');
  }
  check('# 제품\n\n| 기능 |\n| --- |\n| |\n','violation','empty-table');
});
