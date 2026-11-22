import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runCheck} from '../plugin/skills/repo-governance/scripts/check.mjs';

const root=fileURLToPath(new URL('../plugin/',import.meta.url));
const bundlePath=join(root,'skills/repo-governance/assets/bundle.json');
const cleanEnv=()=>Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_|^REPO_GOVERNANCE_PRODUCT$/i.test(key)));
const sha=value=>createHash('sha256').update(value).digest('hex');
function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),'governance-git-review-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const repository=join(dir,'product');mkdirSync(repository);
  const env={...cleanEnv(),GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
  const git=(...args)=>execFileSync('git',['-C',repository,'-c','user.name=Fixture','-c','user.email=fixture@invalid','-c','commit.gpgsign=false',...args],{encoding:'utf8',windowsHide:true,env}).trim();
  git('init','-q','-b','main');writeFileSync(join(repository,'.gitignore'),'local/\n');writeFileSync(join(repository,'source.txt'),'base\n');git('add','.');git('-c','core.hooksPath=','commit','-qm','test: 기준을 준비한다');
  const productPath=join(dir,'product.json');
  writeFileSync(productPath,JSON.stringify({schemaVersion:1,bundle:{version:'0.2.0',sha256:sha(readFileSync(bundlePath))},outputBoundaries:[{path:'local',purpose:'재생성 출력',lifetime:'시험 종료'}]}));
  const context={repository,productPath,bundlePath};
  const run=async(source,runtime={})=>{
    const result=await runCheck(JSON.stringify({schemaVersion:3,operation:'check',check:'file-scope',sources:[source],context}),[],{gitEnvironment:env,...runtime});
    return {exitCode:result.exitCode,...JSON.parse(result.line)};
  };
  const snapshot=()=>({head:git('rev-parse','HEAD'),index:sha(readFileSync(join(repository,'.git/index'))),source:readFileSync(join(repository,'source.txt'),'utf8'),objects:readdirSync(join(repository,'.git/objects'),{recursive:true}).sort()});
  return {dir,repository,env,git,run,snapshot};
}
test('Git display settings cannot hide staged or committed gitlinks from file-scope',async t=>{
  const f=fixture(t),base=f.git('rev-parse','HEAD');
  f.git('update-index','--add','--cacheinfo','160000,'+base+',local/link');
  f.git('config','diff.ignoreSubmodules','all');
  const before=f.snapshot(),indexed=await f.run({kind:'index'});
  assert.equal(indexed.decision,'needs-context',JSON.stringify(indexed));assert.deepEqual(f.snapshot(),before);
  f.git('-c','core.hooksPath=','commit','-qm','test: gitlink 자료를 만든다');
  const committed=await f.run({kind:'revision',revision:'HEAD'});
  assert.equal(committed.decision,'needs-context',JSON.stringify(committed));
});
test('known amend inspects its replacement against actual parents while normal staging remains relative to HEAD',async t=>{
  const f=fixture(t);mkdirSync(join(f.repository,'local'));writeFileSync(join(f.repository,'local/run.log'),'output\n');
  f.git('add','-f','local/run.log');f.git('-c','core.hooksPath=','commit','-qm','test: 잘못된 출력 자료를 만든다');
  const before=f.snapshot();
  const ordinary=await f.run({kind:'index'},{indexComparison:'head'});
  assert.equal(ordinary.decision,'pass',JSON.stringify(ordinary));
  const amend=await f.run({kind:'index'},{indexComparison:'amend'});
  assert.equal(amend.decision,'violation',JSON.stringify(amend));
  assert.ok(amend.findings.some(item=>item.code==='included-output'));
  assert.equal(amend.observed.find(item=>item.kind==='parent').digestOrOid,f.git('rev-parse','HEAD^'));
  assert.deepEqual(f.snapshot(),before);
});
test('root amend checks all actual staged blobs without creating an empty tree',async t=>{
  const f=fixture(t);f.git('checkout','--orphan','new-root');
  f.git('rm','-rf','--cached','.');mkdirSync(join(f.repository,'local'));writeFileSync(join(f.repository,'local/run.log'),'output\n');f.git('add','-f','local/run.log');
  f.git('-c','core.hooksPath=','commit','-qm','test: 새 루트 자료를 만든다');
  const before=f.snapshot(),result=await f.run({kind:'index'},{indexComparison:'amend'});
  assert.equal(result.decision,'violation',JSON.stringify(result));assert.deepEqual(f.snapshot(),before);
  assert.equal(result.observed.filter(item=>item.kind==='parent').length,0);
});
test('concurrent checker invocations preserve independent actual indexes and the process environment',async t=>{
  const f=fixture(t);mkdirSync(join(f.repository,'local'));writeFileSync(join(f.repository,'local/run.log'),'output\n');f.git('add','-f','local/run.log');
  const alternateIndex=join(f.dir,'alternate.index');
  execFileSync('git',['-C',f.repository,'read-tree','HEAD'],{windowsHide:true,env:{...f.env,GIT_INDEX_FILE:alternateIndex}});
  const before=f.snapshot(),alternate=sha(readFileSync(alternateIndex)),environment={...process.env};
  const [normal,selected]=await Promise.all([
    f.run({kind:'index'}),f.run({kind:'index'},{gitEnvironment:{...f.env,GIT_INDEX_FILE:alternateIndex}})
  ]);
  assert.equal(normal.decision,'violation',JSON.stringify(normal));
  assert.equal(selected.decision,'pass',JSON.stringify(selected));
  assert.equal(relative(selected.observed.find(item=>item.kind==='index').target,alternateIndex),'');
  assert.deepEqual(f.snapshot(),before);assert.equal(sha(readFileSync(alternateIndex)),alternate);
  assert.deepEqual({...process.env},environment);
});
