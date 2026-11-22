import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {evaluateNativeCall} from '../plugin/skills/repo-governance/scripts/tool-call.mjs';

const root=fileURLToPath(new URL('../plugin/',import.meta.url));
const bundlePath=join(root,'skills/repo-governance/assets/bundle.json');
const body='## 배경\n검사 누락을 보완한다.\n## 변경 내용\n실제 후보를 검사한다.\n## 검증\n회귀 테스트를 실행했다.\n## 영향\n검사 누락이 줄어든다.';
const title='fix: 실제 머지 후보의 검사 누락을 수정한다';
const message='현재 후보를 읽기 전용으로 확인한다.\n\n관련 PR: https://github.com/owner/project/pull/4';
const tool='mcp__codex_apps__github_merge_pull_request';
const sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(t,output=false){
  const dir=mkdtempSync(join(tmpdir(),'native-pr-merge-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const repository=join(dir,'product');mkdirSync(repository);
  const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_|^REPO_GOVERNANCE_/i.test(key))),GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
  const git=(...args)=>execFileSync('git',['-C',repository,'-c','user.name=Fixture','-c','user.email=fixture@invalid','-c','commit.gpgsign=false',...args],{encoding:'utf8',windowsHide:true,env}).trim();
  git('init','-q','-b','main');git('remote','add','origin','https://github.com/owner/project.git');
  writeFileSync(join(repository,'source.txt'),'base\n');writeFileSync(join(repository,'.gitignore'),'local/\n');git('add','.');git('-c','core.hooksPath=','commit','-qm','test: 기준을 준비한다');
  const baseRefOid=git('rev-parse','HEAD');
  if(output){mkdirSync(join(repository,'local'));writeFileSync(join(repository,'local/run.log'),'output\n');git('add','-f','local/run.log');}
  else{writeFileSync(join(repository,'source.txt'),'new\n');git('add','source.txt');}
  git('-c','core.hooksPath=','commit','-qm','fix: 후보를 수정한다');
  const headRefOid=git('rev-parse','HEAD');
  const productPath=join(dir,'product.json');writeFileSync(productPath,JSON.stringify({schemaVersion:1,bundle:{version:'0.2.0',sha256:sha(readFileSync(bundlePath))},outputBoundaries:[{path:'local',purpose:'재생성 출력',lifetime:'검증 종료'}]}));
  const current={number:4,title:'Inspect squash candidate',body,url:'https://github.com/owner/project/pull/4',headRefOid,baseRefOid,state:'OPEN',isDraft:false,isCrossRepository:false,mergeable:'MERGEABLE',mergeStateStatus:'CLEAN',reviewDecision:'',statusCheckRollup:[]};
  const input={repository_full_name:'owner/project',pr_number:4,merge_method:'squash',expected_head_sha:headRefOid,commit_title:title,commit_message:message};
  const options={repository,productPath,bundlePath,queryMergePullRequest:async()=>current};
  const inspect=(changes={},more={})=>evaluateNativeCall(tool,{...input,...changes},{...options,...more});
  const snapshot=()=>({head:git('rev-parse','HEAD'),index:sha(readFileSync(join(repository,'.git/index'))),source:readFileSync(join(repository,'source.txt'),'utf8'),refs:git('show-ref'),config:readFileSync(join(repository,'.git/config'),'utf8')});
  return{dir,repository,git,current,input,options,inspect,snapshot};
}

test('explicit structured squash inspects actual PR, final message and exact revision without writing',async t=>{
  const f=fixture(t),before=f.snapshot(),result=await f.inspect();
  assert.equal(result.decision,'allow',JSON.stringify(result));
  assert.deepEqual(result.checks.map(c=>c.check),['pull-request','commit-message','file-scope']);
  assert.ok(result.checks[2].observed.some(o=>o.kind==='revision'&&o.digestOrOid===f.current.headRefOid));
  assert.ok(result.checks[2].observed.some(o=>o.kind==='base'&&o.digestOrOid===f.current.baseRefOid));
  assert.deepEqual(f.snapshot(),before);assert.equal(Object.hasOwn(result,'approved'),false);
});

test('literal squash body and UTF-8 body-file use the same checks and help stays read-only',async t=>{
  const f=fixture(t);writeFileSync(join(f.dir,'message.txt'),message);
  for(const suffix of ['--body "'+message+'"','--body-file "'+join(f.dir,'message.txt').replaceAll('\\','/')+'"']){
    const result=await evaluateNativeCall('exec_command',{cmd:'gh pr merge 4 --repo owner/project --squash --match-head-commit '+f.current.headRefOid+' --subject "'+title+'" '+suffix,workdir:f.repository},f.options);
    assert.equal(result.decision,'allow',JSON.stringify(result));assert.equal(result.checks.length,3);
  }
  const help=await evaluateNativeCall('exec_command',{cmd:'gh pr merge --help'}, {get bundlePath(){throw Error('must not load bundle');}});
  assert.equal(help.decision,'allow');assert.equal(help.scope,'none');
});

test('the common K4, K6 and K7 checks reject independently invalid actual candidates',async t=>{
  const f=fixture(t);
  const badMessage=await f.inspect({commit_title:'invalid'});assert.equal(badMessage.decision,'deny');assert.ok(badMessage.findings.some(x=>x.ruleId==='K4'));
  const badPr=await f.inspect({}, {queryMergePullRequest:async()=>({...f.current,body:'TODO'})});assert.equal(badPr.decision,'deny');assert.ok(badPr.findings.some(x=>x.ruleId==='K6'));
  const output=fixture(t,true),before=output.snapshot(),badFiles=await output.inspect();
  assert.equal(badFiles.decision,'deny');assert.ok(badFiles.findings.some(x=>x.code==='included-output'));assert.deepEqual(output.snapshot(),before);
});

test('missing identity, method, expected head or explicit final message holds before lookup',async t=>{
  const f=fixture(t);let queries=0;const more={queryMergePullRequest:async()=>{queries++;return f.current;}};
  for(const changes of [{repository_full_name:undefined},{pr_number:0},{merge_method:'merge'},{merge_method:'rebase'},{merge_method:null},{expected_head_sha:undefined},{expected_head_sha:'HEAD'},{commit_title:null},{commit_message:undefined},{approved:true},{unknown:null}]){
    const result=await f.inspect(changes,more);assert.equal(result.decision,'needs-context',JSON.stringify(changes));assert.deepEqual(result.checks,[]);
  }
  assert.equal(queries,0);
  for(const extra of ['--auto','--admin','--delete-branch','--merge','--rebase','--squash --squash']){
    const result=await evaluateNativeCall('exec_command',{cmd:'gh pr merge 4 --repo owner/project --squash --match-head-commit '+f.current.headRefOid+' --subject "'+title+'" --body "'+message+'" '+extra,workdir:f.repository},f.options);
    assert.equal(result.decision,'needs-context',extra);
  }
});

test('stale identity, non-ready state, review requirement and unsuccessful status hold without a writer',async t=>{
  const f=fixture(t),before=f.snapshot();
  for(const change of [{number:5},{url:'https://github.com/other/project/pull/4'},{headRefOid:'a'.repeat(40)},{baseRefOid:'b'.repeat(40)},{state:'CLOSED'},{isDraft:true},{isCrossRepository:true},{mergeable:'CONFLICTING'},{mergeStateStatus:'BEHIND'},{mergeStateStatus:'UNKNOWN'},{reviewDecision:'CHANGES_REQUESTED'},{reviewDecision:'REVIEW_REQUIRED'},{statusCheckRollup:[{__typename:'CheckRun',status:'IN_PROGRESS',conclusion:null}]},{statusCheckRollup:[{__typename:'CheckRun',status:'COMPLETED',conclusion:'FAILURE'}]},{statusCheckRollup:[{__typename:'StatusContext',state:'PENDING'}]}]){
    const result=await f.inspect({}, {queryMergePullRequest:async()=>({...f.current,...change})});assert.equal(result.decision,'needs-context',JSON.stringify(change));assert.deepEqual(result.checks,[]);
  }
  for(const statusCheckRollup of [[{__typename:'CheckRun',status:'COMPLETED',conclusion:'SUCCESS'}],[{__typename:'StatusContext',state:'SUCCESS'}]])assert.equal((await f.inspect({}, {queryMergePullRequest:async()=>({...f.current,statusCheckRollup})})).decision,'allow');
  assert.deepEqual(f.snapshot(),before);
});

test('a different local origin or unavailable commits cannot supply the merge file candidate',async t=>{
  const f=fixture(t);f.git('remote','set-url','origin','https://github.com/other/project.git');
  assert.equal((await f.inspect()).decision,'needs-context');
  f.git('remote','set-url','origin','https://github.com/owner/project.git');
  assert.equal((await f.inspect({expected_head_sha:'a'.repeat(40)},{queryMergePullRequest:async()=>({...f.current,headRefOid:'a'.repeat(40)})})).decision,'needs-context');
  for(const host of ['enterprise.invalid']){
    const old=process.env.GH_HOST;process.env.GH_HOST=host;
    try{assert.equal((await f.inspect()).decision,'needs-context');}finally{if(old===undefined)delete process.env.GH_HOST;else process.env.GH_HOST=old;}
  }
});

test('remote lookup failures hold and never expose original diagnostic secrets',async t=>{
  const f=fixture(t),result=await f.inspect({}, {queryMergePullRequest:async()=>{throw Error('secret-token-value');}});
  assert.equal(result.decision,'needs-context');assert.doesNotMatch(JSON.stringify(result),/secret-token-value/);
});

test('the actual Codex hook process returns checked context or deny without executing a merge',async t=>{
  const f=fixture(t),before=f.snapshot(),fake=join(f.dir,'fake-gh.mjs'),runner=join(f.dir,'hook-runner.mjs');
  writeFileSync(fake,`const args=process.argv.slice(2);if(args[0]!=='pr'||args[1]!=='view'||args[2]!=='4')throw Error('Only a read-only PR lookup is allowed');process.stdout.write(${JSON.stringify(JSON.stringify(f.current))});`);
  writeFileSync(runner,`
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {promisify} from 'node:util';
const original=childProcess.execFile, run=promisify(original);
const replacement=(file,args,options,callback)=>original(file==='gh'?process.execPath:file,file==='gh'?[${JSON.stringify(fake)},...args]:args,options,callback);
replacement[promisify.custom]=(file,args,options)=>run(file==='gh'?process.execPath:file,file==='gh'?[${JSON.stringify(fake)},...args]:args,options);
childProcess.execFile=replacement;syncBuiltinESMExports();
process.argv=[process.execPath,'hook','--harness','codex','--repository',${JSON.stringify(f.repository)},'--product',${JSON.stringify(f.options.productPath)},'--bundle',${JSON.stringify(bundlePath)}];
await import(${JSON.stringify(new URL('../plugin/hooks/run.mjs',import.meta.url).href)});
`);
  for(const invalid of [false,true]){
    const pending=spawnSync(process.execPath,[runner],{cwd:f.repository,input:JSON.stringify({hook_event_name:'PreToolUse',tool_name:tool,tool_input:{...f.input,...(invalid?{commit_title:'invalid'}:{})}}),encoding:'utf8',windowsHide:true,timeout:15000});
    assert.equal(pending.status,0,pending.stderr);const response=JSON.parse(pending.stdout).hookSpecificOutput;
    if(invalid){assert.equal(response.permissionDecision,'deny');assert.match(response.permissionDecisionReason,/K4\/commit-title/);}
    else{const result=JSON.parse(response.additionalContext);assert.equal(result.decision,'allow');assert.equal(result.checks.length,3);}
  }
  assert.deepEqual(f.snapshot(),before);
});
