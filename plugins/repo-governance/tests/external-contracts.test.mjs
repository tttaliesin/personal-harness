import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {runCheck} from '../plugin/skills/repo-governance/scripts/check.mjs';
import {productFrom,Missing} from '../plugin/skills/repo-governance/scripts/contracts.mjs';

const root=fileURLToPath(new URL('../plugin/',import.meta.url));
const bundlePath=join(root,'skills/repo-governance/assets/bundle.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const evidence={source:'https://example.invalid/upstream/CONTRIBUTING.md',scope:'이번 외부 저장소의 기여 작업',expires:'참조한 외부 계약이 바뀔 때까지'};
const upstream={style:'upstream-area',areas:['doc','githooks.txt'],...evidence};
const baseProduct=()=>({schemaVersion:1,bundle:{version:'0.2.0',sha256:hash(readFileSync(bundlePath))},outputBoundaries:[]});
function temporary(t) {
  const directory=mkdtempSync(join(tmpdir(),'governance-external-contracts-'));
  t.after(()=>{
    assert.equal(dirname(resolve(directory)),resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('governance-external-contracts-'));
    rmSync(directory,{recursive:true,force:true});
  });
  return directory;
}
async function inspect(check,text,productPath,context={}) {
  const result=await runCheck(JSON.stringify({schemaVersion:3,operation:'check',check,sources:[{kind:'text',text}],context:{bundlePath,...(productPath?{productPath}:{}),...context}}));
  const response=JSON.parse(result.line);
  assert.equal(result.exitCode,{pass:0,violation:2,'needs-context':3,error:1}[response.decision]);
  assert.equal(response.scope,'mechanical');
  assert.ok(response.semanticChecks.length);
  return response;
}
function selectedProduct(t,changes) {
  const directory=temporary(t),productPath=join(directory,'product.json');
  writeFileSync(productPath,JSON.stringify({...baseProduct(),...changes}));
  return productPath;
}

test('a platform-required repository exception matches one declared literal name only',async t=>{
  for(const name of ['.github','acme.github.io'])assert.equal((await inspect('name',name)).decision,'violation');
  const productPath=selectedProduct(t,{repositoryNameException:{name:'.github',...evidence}});
  const pass=await inspect('name','.github',productPath);
  assert.equal(pass.decision,'pass');
  assert.match(pass.semanticChecks[0].question,/or a verified platform contract.*exact name/);
  assert.ok(pass.semanticChecks[0].requiredEvidence.some(value=>value.includes('actual platform contract')&&value.includes('not approval')));
  for(const name of ['acme.github.io','.github-extra','Bad_Name','billing-api'])assert.equal((await inspect('name',name,productPath)).decision,'violation',name);
  assert.equal((await inspect('name','product-billing-api',productPath)).decision,'pass');
  assert.equal(pass.approved,undefined);
  const pagesPath=selectedProduct(t,{repositoryNameException:{name:'acme.github.io',...evidence}});
  assert.equal((await inspect('name','acme.github.io',pagesPath)).decision,'pass');
  assert.equal((await inspect('name','other.github.io',pagesPath)).decision,'violation');
});

test('upstream area subjects are accepted only by the selected product declaration',async t=>{
  const subject='doc: clarify distinction between sign-off and pgp-signing';
  assert.equal((await inspect('commit-message',subject)).decision,'violation');
  const productPath=selectedProduct(t,{commitConvention:upstream});
  const pass=await inspect('commit-message',subject,productPath);
  assert.equal(pass.decision,'pass');
  assert.ok(pass.semanticChecks[0].question.includes('default Korean convention'));
  assert.ok(pass.semanticChecks[0].requiredEvidence.some(value=>value.includes('actual contribution contract')));
  assert.equal((await inspect('commit-message','githooks.txt: improve the intro section',productPath)).decision,'pass');
  assert.equal((await inspect('commit-message','config: change a setting',productPath)).decision,'violation');
  assert.equal((await inspect('commit-message','fix: 만료 처리를 고친다',productPath)).decision,'pass');
  assert.equal((await inspect('commit-message',subject)).decision,'violation');
});

test('upstream area exceptions preserve separators, placeholders, references and conditional bodies',async t=>{
  const productPath=selectedProduct(t,{commitConvention:upstream});
  for(const subject of ['doc: ','doc:  leading extra space','doc : wrong delimiter','doc:update','doc: {{actual summary}}',
    'doc: update\nbody without separator','doc: update\n\nRefs: wrong','doc: update\n\nFixes #12',
    'feat!: 응답을 바꾼다','revert: 설정을 되돌린다','doc: update\n\nBREAKING CHANGE: callers must change',
    'githooks.txt: update\u2028another title']) {
    assert.equal((await inspect('commit-message',subject,productPath)).decision,'violation',subject);
  }
  assert.equal((await inspect('commit-message','doc: update\n\n참조한 실제 계약을 반영한다.\n\nRefs: #12',productPath)).decision,'pass');
  assert.equal((await inspect('commit-message','feat!: 응답을 바꾼다\n\n기존 호출자를 이행한다.',productPath)).decision,'pass');
});

test('an automation namespace preserves the exact consumer prefix and common branch body checks',async t=>{
  const repository=temporary(t);
  const environment=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key)));
  const git=(...args)=>execFileSync('git',['-C',repository,'-c','core.hooksPath=','-c','commit.gpgsign=false','-c','user.name=Fixture','-c','user.email=fixture@invalid',...args],{encoding:'utf8',windowsHide:true,env:environment}).trim();
  git('init','-q','-b','main');git('commit','--allow-empty','-qm','test: 기준을 준비한다');
  const productPath=join(repository,'product.json');
  const product={...baseProduct(),branchNamespace:{kind:'automation',prefix:'releases/',...evidence}};
  writeFileSync(productPath,JSON.stringify(product));
  const before={head:git('rev-parse','HEAD'),refs:git('show-ref')};
  const context={repository,baseRef:'refs/heads/main'};
  const pass=await inspect('branch','releases/11',productPath,context);
  assert.equal(pass.decision,'pass');
  assert.ok(pass.semanticChecks[0].requiredEvidence.some(value=>value.includes('consuming automation')));
  for(const branch of ['release/11','releases/bad_name','releases/extra/11'])assert.equal((await inspect('branch',branch,productPath,context)).decision,'violation',branch);
  assert.equal((await inspect('branch','releases-11',productPath,context)).decision,'pass');
  delete product.branchNamespace.kind;
  product.branchNamespace.prefix='host/42/';
  writeFileSync(productPath,JSON.stringify(product));
  assert.equal((await inspect('branch','host/42/fix-login',productPath,context)).decision,'pass');
  assert.deepEqual({head:git('rev-parse','HEAD'),refs:git('show-ref')},before);
});

test('external contract inputs reject broad patterns, missing evidence and malformed declarations',()=>{
  const valid={...baseProduct(),repositoryNameException:{name:'.github',...evidence},commitConvention:upstream,branchNamespace:{kind:'automation',prefix:'releases/',...evidence}};
  assert.equal(productFrom(structuredClone(valid)).repositoryNameException.name,'.github');
  const changes=[
    p=>{p.repositoryNameException.name='*.github.io';},p=>{p.repositoryNameException.name='owner/repo';},
    p=>{p.repositoryNameException.name='name\n';},p=>{p.repositoryNameException.name='..';},p=>{p.repositoryNameException.approved=true;},
    p=>{p.commitConvention.style='regex';},p=>{p.commitConvention.areas=['doc','doc'];},p=>{p.commitConvention.areas=[];},
    p=>{p.commitConvention.areas=['.*'];},p=>{p.commitConvention.areas=['doc\n'];},p=>{p.commitConvention.areas='doc';},
    p=>{p.commitConvention.pattern='.*';},p=>{p.branchNamespace.kind='custom';},p=>{p.branchNamespace.prefix='releases';},
    p=>{p.branchNamespace.prefix='bad prefix/';},
  ];
  for(const field of ['source','scope','expires'])for(const name of ['repositoryNameException','commitConvention','branchNamespace']) {
    changes.push(p=>{delete p[name][field];},p=>{p[name][field]=' ';},p=>{p[name][field]='bad\0value';},p=>{p[name][field]='bad\nvalue';});
  }
  for(const change of changes){const value=structuredClone(valid);change(value);assert.throws(()=>productFrom(value));}
});

test('legacy bundle metadata retains external exceptions on supported product schemas',async t=>{
  const product={...baseProduct(),repositoryNameException:{name:'.github',...evidence},commitConvention:upstream};
  product.bundle={version:'0.1.0',sha256:'0'.repeat(64)};
  const productPath=selectedProduct(t,product);
  const incompatible={...product,schemaVersion:2};
  assert.throws(()=>productFrom(incompatible),Missing);
  const incompatiblePath=selectedProduct(t,incompatible);
  for(const [check,text] of [['name','.github'],['commit-message','doc: update']]) {
    assert.equal((await inspect(check,text,productPath)).decision,'pass');
    const result=await inspect(check,text,incompatiblePath);
    assert.equal(result.decision,'needs-context');
    assert.ok(result.findings.some(finding=>finding.message.includes('Unsupported product schemaVersion')));
  }
});
