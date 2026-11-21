import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync,existsSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../plugin/',import.meta.url));
const bundlePath=join(root,'skills/repo-governance/assets/bundle.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(at,args)=>execFileSync('git',['-C',at,...args],{encoding:'utf8',windowsHide:true}).trim();
function bind(target,product,backup='') {
  const run=spawnSync(process.execPath,[join(root,'scripts/task-cli.mjs'),'bind-product'],{cwd:root,encoding:'utf8',windowsHide:true,env:{...process.env,REPO_GOVERNANCE_TARGET:target,REPO_GOVERNANCE_PRODUCT:product,REPO_GOVERNANCE_BACKUP:backup}});
  assert.ifError(run.error);
  const output=JSON.parse(run.stdout);
  return {...output,exitCode:run.status};
}
function task(name,...args) {
  const run=spawnSync(process.platform==='win32'?'task.exe':'task',['--exit-code',name,...args],{cwd:root,encoding:'utf8',windowsHide:true});
  assert.ifError(run.error);
  return {...JSON.parse(run.stdout),exitCode:run.status};
}
function fixture(t) {
  const directory=mkdtempSync(join(tmpdir(),'governance-product-io-'));
  t.after(()=>{assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(basename(directory).startsWith('governance-product-io-'));rmSync(directory,{recursive:true,force:true});});
  const target=join(directory,'product');mkdirSync(target);git(target,['init','--quiet']);
  const input=join(directory,'input.json');
  const product={schemaVersion:1,bundle:{version:'0.2.0',sha256:hash(readFileSync(bundlePath))},sources:['CONTRACT.md'],baseRef:'develop',outputBoundaries:[{path:'.local-output',purpose:'합성 시험 결과',lifetime:'시험 종료까지'}],readmeProfile:'compact',
    branchNamespace:{prefix:'releases/',kind:'automation',source:'workflow.yml',scope:'합성 자동화',expires:'소비 workflow 제거 시'},
    repositoryNameException:{name:'.github',source:'host-contract.md',scope:'합성 호스트',expires:'호스트 계약 종료 시'},
    commitConvention:{style:'upstream-area',areas:['doc','githooks.txt'],source:'CONTRIBUTING.md',scope:'합성 upstream',expires:'기여 종료 시'}};
  writeFileSync(input,JSON.stringify(product)+'\n');
  return {directory,target,input,product};
}

test('local product setup validates bytes, is idempotent and preserves a different installed input',t=>{
  const directory=mkdtempSync(join(tmpdir(),'governance-product-task-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const target=join(directory,'worktree');mkdirSync(target);
  git(target,['init','--quiet']);
  const productPath=join(directory,'product.json');
  const product={schemaVersion:1,bundle:{version:'0.2.0',sha256:hash(readFileSync(bundlePath))},outputBoundaries:[]};
  const bytes=JSON.stringify(product)+'\n';
  writeFileSync(productPath,bytes);
  const task=spawnSync(process.platform==='win32'?'task.exe':'task',['--exit-code','bind:product','TARGET='+target,'PRODUCT='+productPath],{cwd:root,encoding:'utf8',windowsHide:true,env:{...process.env,REPO_GOVERNANCE_PRODUCT:'wrong-input.json'}});
  assert.ifError(task.error);
  assert.equal(task.status,0,task.stdout+task.stderr);
  const first=JSON.parse(task.stdout);
  first.exitCode=task.status;
  assert.equal(first.exitCode,0,JSON.stringify(first));assert.equal(first.changed,true);
  assert.equal(readFileSync(first.destination,'utf8'),bytes);
  assert.deepEqual(JSON.parse(readFileSync(first.adoptionPath,'utf8')),{schemaVersion:1,mode:'enforce'});
  assert.equal(first.adoptionChanged,true);
  assert.equal(bind(target,productPath).changed,false);
  assert.equal(git(target,['ls-files']),'');
  const configBefore=readFileSync(join(target,'.git/config'));
  product.sources=['current-contract.md'];writeFileSync(productPath,JSON.stringify(product));
  const conflict=bind(target,productPath);
  assert.equal(conflict.exitCode,3);assert.equal(conflict.changed,false);
  assert.equal(readFileSync(first.destination,'utf8'),bytes);
  product.schemaVersion=2;writeFileSync(productPath,JSON.stringify(product));
  assert.equal(bind(target,productPath).exitCode,1);
  assert.deepEqual(readFileSync(join(target,'.git/config')),configBefore);
});

test('invalid UTF-8 is rejected before a local product input is created',t=>{
  const directory=mkdtempSync(join(tmpdir(),'governance-product-utf8-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const target=join(directory,'worktree');mkdirSync(target);git(target,['init','--quiet']);
  const productPath=join(directory,'product.json');
  const product={schemaVersion:1,bundle:{version:'0.2.0',sha256:hash(readFileSync(bundlePath))},sources:['bad-encoding'],outputBoundaries:[]};
  const bytes=Buffer.from(JSON.stringify(product));
  bytes[bytes.indexOf('bad-encoding')]=0xc0;
  writeFileSync(productPath,bytes);
  const result=bind(target,productPath);
  assert.equal(result.exitCode,1,JSON.stringify(result));
  assert.equal(result.decision,'error');
  assert.equal(existsSync(git(target,['rev-parse','--path-format=absolute','--git-path','repo-governance/product.json'])),false);
});

test('binding a legacy product records adoption and restoring a missing input preserves that adoption',t=>{
  const directory=mkdtempSync(join(tmpdir(),'governance-product-adoption-'));
  t.after(()=>{assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(basename(directory).startsWith('governance-product-adoption-'));rmSync(directory,{recursive:true,force:true});});
  const target=join(directory,'worktree');mkdirSync(target);git(target,['init','--quiet']);
  const productPath=join(directory,'input.json');
  const product={schemaVersion:1,bundle:{version:'0.2.0',sha256:hash(readFileSync(bundlePath))},outputBoundaries:[]};
  const bytes=JSON.stringify(product)+'\n';writeFileSync(productPath,bytes);
  const destination=git(target,['rev-parse','--path-format=absolute','--git-path','repo-governance/product.json']);
  mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,bytes);
  const adopted=bind(target,productPath);
  assert.equal(adopted.exitCode,0,JSON.stringify(adopted));assert.equal(adopted.changed,true);assert.equal(adopted.adoptionChanged,true);
  const marker=readFileSync(adopted.adoptionPath);rmSync(destination);
  const restored=bind(target,productPath);
  assert.equal(restored.exitCode,0,JSON.stringify(restored));assert.equal(restored.changed,true);assert.equal(restored.adoptionChanged,false);
  assert.deepEqual(readFileSync(adopted.adoptionPath),marker);assert.equal(readFileSync(destination,'utf8'),bytes);
});

test('binding never overwrites a malformed adoption marker or installs a new product beside it',t=>{
  const directory=mkdtempSync(join(tmpdir(),'governance-product-marker-'));
  t.after(()=>{assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(basename(directory).startsWith('governance-product-marker-'));rmSync(directory,{recursive:true,force:true});});
  const target=join(directory,'worktree');mkdirSync(target);git(target,['init','--quiet']);
  const productPath=join(directory,'input.json');
  writeFileSync(productPath,JSON.stringify({schemaVersion:1,bundle:{version:'0.2.0',sha256:hash(readFileSync(bundlePath))},outputBoundaries:[]}));
  const destination=git(target,['rev-parse','--path-format=absolute','--git-path','repo-governance/product.json']);
  const marker=join(dirname(destination),'adoption.json');mkdirSync(dirname(marker),{recursive:true});writeFileSync(marker,'{}');
  const denied=bind(target,productPath);
  assert.equal(denied.exitCode,1,JSON.stringify(denied));assert.match(denied.findings[0].message,/adoption marker/);
  assert.equal(readFileSync(marker,'utf8'),'{}');assert.equal(existsSync(destination),false);
});

test('show product emits a pin-free example and exclusively writes a BOM-free external input',t=>{
  const f=fixture(t),output=join(f.directory,'new product 입력.json');
  const plain=task('show:product');
  assert.deepEqual(plain,{schemaVersion:1,sources:[],outputBoundaries:[],exitCode:0});
  const created=task('show:product','OUTPUT='+output);
  assert.equal(created.exitCode,0,JSON.stringify(created));assert.equal(created.destination,output);
  const bytes=readFileSync(output);
  assert.equal(bytes.subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf])),false);
  assert.equal(created.sha256,hash(bytes));assert.deepEqual(JSON.parse(bytes),{schemaVersion:1,sources:[],outputBoundaries:[]});
  const second=task('show:product','OUTPUT='+output);
  assert.equal(second.exitCode,1,JSON.stringify(second));assert.deepEqual(readFileSync(output),bytes);
});

test('show product refreshes only the selected pin and preserves every product-specific field',t=>{
  const f=fixture(t);
  const previous={...f.product,bundle:{version:'0.1.0',sha256:'0'.repeat(64)}};
  const original=JSON.stringify(previous)+'\n';writeFileSync(f.input,original);
  const output=join(f.directory,'refreshed.json');
  const selected=task('show:product','PRODUCT='+f.input,'OUTPUT='+output);
  assert.equal(selected.exitCode,0,JSON.stringify(selected));
  const expected={...previous,bundle:f.product.bundle};
  assert.deepEqual(JSON.parse(readFileSync(output)),expected);
  assert.equal(readFileSync(f.input,'utf8'),original);
  const destination=git(f.target,['rev-parse','--path-format=absolute','--git-path','repo-governance/product.json']);
  mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,original);
  const marker=join(dirname(destination),'adoption.json');writeFileSync(marker,'{"schemaVersion":1,"mode":"enforce"}\n');
  const fromTarget=task('show:product','TARGET='+f.target);
  assert.equal(fromTarget.exitCode,0,JSON.stringify(fromTarget));delete fromTarget.exitCode;
  assert.deepEqual(fromTarget,expected);assert.equal(readFileSync(destination,'utf8'),original);
  const both=join(f.directory,'ambiguous.json');
  assert.equal(task('show:product','TARGET='+f.target,'PRODUCT='+f.input,'OUTPUT='+both).exitCode,1);
  assert.equal(existsSync(both),false);
});

test('an explicit external backup preserves the exact previous input and adoption during replacement',t=>{
  const f=fixture(t),first=bind(f.target,f.input);
  assert.equal(first.exitCode,0,JSON.stringify(first));
  const previous=readFileSync(first.destination),marker=readFileSync(first.adoptionPath),config=readFileSync(join(f.target,'.git/config'));
  f.product.sources.push('new-contract.md');writeFileSync(f.input,JSON.stringify(f.product,null,2)+'\n');
  const selected=readFileSync(f.input),backup=join(f.directory,'previous input.json');
  const replaced=task('bind:product','TARGET='+f.target,'PRODUCT='+f.input,'BACKUP='+backup);
  assert.equal(replaced.exitCode,0,JSON.stringify(replaced));assert.equal(replaced.changed,true);
  assert.equal(replaced.adoptionChanged,false);assert.equal(replaced.backupPath,backup);assert.equal(replaced.backupSha256,hash(previous));
  assert.deepEqual(readFileSync(backup),previous);assert.deepEqual(readFileSync(first.destination),selected);
  assert.deepEqual(readFileSync(first.adoptionPath),marker);assert.deepEqual(readFileSync(join(f.target,'.git/config')),config);
  assert.equal(git(f.target,['ls-files']),'');
});

test('adopt is idempotent and preserves a legacy local input and Git settings',t=>{
  const f=fixture(t),first=bind(f.target,f.input);
  assert.equal(first.exitCode,0,JSON.stringify(first));
  const previous=Buffer.from(JSON.stringify({...f.product,bundle:{version:'0.1.0',sha256:'1'.repeat(64)}})+'\n');
  writeFileSync(first.destination,previous);
  git(f.target,['config','--local','core.hooksPath',join(f.directory,'existing hooks')]);
  const config=readFileSync(join(f.target,'.git/config'));
  const legacyMarker=readFileSync(first.adoptionPath);
  const adopted=task('adopt','TARGET='+f.target);
  assert.equal(adopted.exitCode,0,JSON.stringify(adopted));
  assert.equal(adopted.changed,true);
  assert.notEqual(adopted.adoptionPath,first.adoptionPath);
  assert.deepEqual(JSON.parse(readFileSync(adopted.adoptionPath,'utf8')),{schemaVersion:2,mode:'enforce'});
  assert.equal(task('adopt','TARGET='+f.target).changed,false);
  assert.deepEqual(readFileSync(first.adoptionPath),legacyMarker);
  assert.deepEqual(readFileSync(first.destination),previous);
  assert.deepEqual(readFileSync(join(f.target,'.git/config')),config);
  assert.equal(git(f.target,['ls-files']),'');
});

test('invalid product schemas and malformed adoption stop before backup or product writes',t=>{
  const f=fixture(t),first=bind(f.target,f.input),before=readFileSync(first.destination),marker=readFileSync(first.adoptionPath),backup=join(f.directory,'previous.json');
  writeFileSync(f.input,JSON.stringify({...f.product,schemaVersion:2}));
  assert.equal(bind(f.target,f.input,backup).exitCode,1);
  assert.equal(existsSync(backup),false);assert.deepEqual(readFileSync(first.destination),before);assert.deepEqual(readFileSync(first.adoptionPath),marker);
  f.product.sources.push('changed-contract.md');writeFileSync(f.input,JSON.stringify(f.product));writeFileSync(first.adoptionPath,'{}');
  assert.equal(bind(f.target,f.input,backup).exitCode,1);
  assert.equal(existsSync(backup),false);assert.deepEqual(readFileSync(first.destination),before);assert.equal(readFileSync(first.adoptionPath,'utf8'),'{}');
});

test('default adoption is shared when first recorded from a linked worktree',t=>{
  const f=fixture(t),linked=join(f.directory,'linked worktree');
  git(f.target,['-c','core.hooksPath=','-c','commit.gpgsign=false','-c','user.name=Fixture','-c','user.email=fixture@invalid','commit','--allow-empty','-qm','test: 기준을 만든다']);
  git(f.target,['worktree','add','--quiet','-b','linked',linked]);
  const first=task('adopt','TARGET='+linked);
  const second=task('adopt','TARGET='+f.target);
  assert.equal(first.exitCode,0,JSON.stringify(first));
  assert.equal(first.changed,true);
  assert.equal(second.exitCode,0,JSON.stringify(second));
  assert.equal(second.changed,false);
  assert.equal(first.adoptionPath,second.adoptionPath);
  for (const target of [f.target,linked]) {
    const product=git(target,['rev-parse','--path-format=absolute','--git-path','repo-governance/product.json']);
    assert.equal(existsSync(product),false);
    assert.equal(existsSync(join(dirname(product),'adoption.json')),false);
  }
  writeFileSync(f.input,JSON.stringify({schemaVersion:1,baseRef:'develop'}));
  const local=bind(linked,f.input);
  assert.equal(local.exitCode,0,JSON.stringify(local));
  assert.notEqual(local.adoptionPath,first.adoptionPath);
  assert.deepEqual(task('show:product','TARGET='+linked),{schemaVersion:1,baseRef:'develop',exitCode:0});
  writeFileSync(first.adoptionPath,'{}');
  assert.equal(task('adopt','TARGET='+linked).exitCode,1);
  assert.equal(readFileSync(first.adoptionPath,'utf8'),'{}');
});

test('backup locations inside the product or distribution and existing backups preserve all inputs',t=>{
  const f=fixture(t),first=bind(f.target,f.input),before=readFileSync(first.destination),marker=readFileSync(first.adoptionPath);
  f.product.sources.push('changed-contract.md');writeFileSync(f.input,JSON.stringify(f.product));
  const existing=join(f.directory,'already-saved.json');writeFileSync(existing,'existing backup\n');
  const insideRuntime=join(root,'must-not-create-backup-'+basename(f.directory)+'.json');
  for(const backup of [join(f.target,'previous.json'),join(f.target,'.git/previous.json'),insideRuntime,existing]){
    assert.equal(bind(f.target,f.input,backup).exitCode,1,backup);
    assert.deepEqual(readFileSync(first.destination),before);assert.deepEqual(readFileSync(first.adoptionPath),marker);
    if(backup===existing)assert.equal(readFileSync(existing,'utf8'),'existing backup\n');else assert.equal(existsSync(backup),false,backup);
  }
});

test('symbolic backup parents are refused without changing the product or real target',t=>{
  const f=fixture(t),first=bind(f.target,f.input),before=readFileSync(first.destination);
  f.product.sources.push('changed-contract.md');writeFileSync(f.input,JSON.stringify(f.product));
  const real=join(f.directory,'real-backups'),alias=join(f.directory,'alias-backups');mkdirSync(real);
  try {symlinkSync(real,alias,process.platform==='win32'?'junction':'dir');}
  catch(error){if(process.platform==='win32'&&['EPERM','EACCES'].includes(error.code))return t.skip('Windows directory junction creation is not permitted in this sandbox.');throw error;}
  const result=bind(f.target,f.input,join(alias,'previous.json'));
  assert.equal(result.exitCode,1,JSON.stringify(result));assert.equal(existsSync(join(real,'previous.json')),false);assert.deepEqual(readFileSync(first.destination),before);
});
