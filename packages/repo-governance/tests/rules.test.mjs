import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { runCheck } from '../plugin/skills/repo-governance/scripts/check.mjs';

const bundlePath=process.env.REPO_GOVERNANCE_TEST_BUNDLE ?? fileURLToPath(new URL('../plugin/skills/repo-governance/assets/bundle.json',import.meta.url));
const text=t=>({kind:'text',text:t});
async function check(check,source,context={}) {
  const {line,exitCode}=await runCheck(JSON.stringify({schemaVersion:3,operation:'check',check,sources:[source],context:{bundlePath,...context}}));
  const r=JSON.parse(line);
  assert.equal(exitCode,{pass:0,violation:2,'needs-context':3,error:1}[r.decision]);
  assert.equal(r.scope,'mechanical'); assert.ok(r.semanticChecks[0]?.requiredEvidence.length);
  return r;
}
async function decision(checkName,source,want,context) {
  const r=await check(checkName,source,context); assert.equal(r.decision,want,JSON.stringify(r.findings)); return r;
}

test('K1 checks spelling and all five first categories with no word-count limit',async()=>{
  for(const candidate of ['product-order-management-export-api','infra-internal-network','deploy-field',
    'shared-plugin-release-review','shared-bundle-release-review','docs-team-handbook'])
    await decision('name',text(candidate),'pass');
  for(const candidate of ['Product-orders','product-inventory-api\n','product_inventory','product--orders',
    'product','product-orders-','-product-orders','product 주문'])
    assert.deepEqual((await decision('name',text(candidate),'violation')).findings.map(item=>item.code),['name-format']);
  for(const candidate of ['inventory-api','unknown-product-orders'])
    assert.deepEqual((await decision('name',text(candidate),'violation')).findings.map(item=>item.code),['name-category']);
});
test('K2 accepts one-line descriptions with or without a final period',async()=>{
  for (const s of ['주문 CSV의 필수 열을 검사하는 Node.js 명령줄 도구.','주문 도구','English only.'])
    await decision('description',text(s),'pass');
  for (const s of ['', '주문\n도구.', '{{실제 역할}}.'])
    await decision('description',text(s),'violation');
});
test('K3 checks visible document structure, references and quoted template syntax',async()=>{
  const t='# 제품 소개\n\n시작에 필요한 정보다.\n\n[사용](#사용)\n\n## 사용\n\n실행한다.\n';
  await decision('readme',text(t),'pass');
  await decision('readme',text(t+'~~~text\n{{field}}\n~~~\n'),'pass');
  await decision('readme',text(t+'\n설명된 \x60<output-path>\x60 인자다.\n'),'pass');
  for (const tail of ['\n## 빈 절\n','\n{{저장소 이름}}','\n~~~js\n','\n[이동](#미확인)','\n| 기능 | 설명 |\n|---|---|'])
    await decision('readme',text(t+tail),'violation');
  await decision('readme',text(t+'[자료](docs/guide.md)'),'needs-context');
});
test('K4 subject grammar, optional scope, conditional body, trailers and temporary exception',async()=>{
  for (const t of ['fix: 만료 처리를 고친다','fix(api-2)!: 필드를 변경한다\n\n기존 호출자를 수정한다.\n\nRefs: org/repo#12\n','docs: 절차를 적는다\n\nRefs: #123','revert: 설정을 되돌린다\n\n대상 123abcd: 파싱이 실패한다.'])
    await decision('commit-message',text(t),'pass');
  for (const t of ['fix:  잘못된 공백','fix: ','zz: 바꾼다','fix(a_b): 바꾼다','fix: 제목\n붙은 본문','fix!: 파괴적 변경','revert: 되돌린다','fix: 고친다\n\nRefs: wrong','fix: 고친다\n\nFixes #42'])
    await decision('commit-message',text(t),'violation');
  const temporary=await decision('commit-message',text('fixup! fix: 수정한다'),'pass');
  assert.ok(temporary.semanticChecks.some(check=>check.requiredEvidence.some(value=>value.includes('temporary'))));
  for (const prefix of ['fixup!','squash!','amend!']) {
    await decision('commit-message',text(prefix+' fix: 수정한다\u2028다음'),'violation');
    await decision('commit-message',text(prefix+' fix: 수정한다\r다음'),'violation');
    await decision('commit-message',text(prefix+' fix: 수정한다\n\nRefs: wrong'),'violation');
    await decision('commit-message',text(prefix+' fix: 수정한다\n\nRefs: #12'),'pass');
  }
});
test('K5 checks actual base and existing refs without creating anything, and matches an exact declared namespace',async t=>{
  const repository=mkdtempSync(join(tmpdir(),'governance-branch-')); t.after(()=>rmSync(repository,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',['-C',repository,'-c','user.name=Fixture','-c','user.email=fixture@localhost',...args],{stdio:'pipe'}).toString().trim();
  git('init','-q','-b','trunk'); git('commit','--allow-empty','-m','fixture');
  const baseRef='refs/heads/trunk', context={repository,baseRef};
  const r=await decision('branch',text('123-fix-login'),'pass',context);
  assert.ok(r.observed.some(o=>o.kind==='base' && o.digestOrOid===git('rev-parse','HEAD')));
  await decision('branch',text('bad_name'),'violation');
  await decision('branch',text('fix-login'),'needs-context');
  await decision('branch',text('trunk'),'needs-context',context);
  await decision('branch',text('fix/x'),'violation',context);
  const productPath=join(repository,'product.json');
  writeFileSync(productPath,JSON.stringify({schemaVersion:1,bundle:{version:'0.2.0',sha256:createHash('sha256').update(readFileSync(bundlePath)).digest('hex')},
    branchNamespace:{prefix:'host/42/',source:'host contract',scope:'workspace 42',expires:'when task finishes'}}));
  await decision('branch',text('host/42/fix-login'),'pass',{...context,productPath});
  await decision('branch',text('host/43/fix-login'),'violation',{...context,productPath});
  await decision('branch',text('host/42/extra/fix-login'),'violation',{...context,productPath});
  assert.equal(git('branch','--format=%(refname)'),baseRef);
});
test('K6 validates supplied PR identity and allows a short body without fixed headings',async()=>{
  const pr={kind:'pr',number:23,headOid:'a'.repeat(40),baseOid:'b'.repeat(40),title:'Prevent token reuse',
    body:'## 배경\n문제다.\n## 변경 내용\n변경했다.\n## 검증\n계정이 없어 미실행했다.\n## 영향\n인증이 바뀐다.'};
  const r=await decision('pull-request',pr,'pass');
  assert.ok(r.observed.some(x=>x.kind==='pr-head' && x.digestOrOid===pr.headOid));
  await decision('pull-request',{...pr,body:'만료된 토큰의 재사용을 막는다. 계정이 없어 실제 세션 검증은 보류했다.'},'pass');
  for (const p of [{title:'제목\n추가'},{title:''},{body:pr.body.replace('## 영향','~~~\n## 영향')},{body:pr.body.replace('변경했다.','<실행한 확인과 실제 결과>')}])
    await decision('pull-request',{...pr,...p},'violation');
  await decision('pull-request',{...pr,headOid:'HEAD'},'error');
});
