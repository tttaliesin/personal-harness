import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, cpSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, relative } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { runCheck } from '../plugin/skills/repo-governance/scripts/check.mjs';

const bundlePath=process.env.REPO_GOVERNANCE_TEST_BUNDLE ?? fileURLToPath(new URL('../plugin/skills/repo-governance/assets/bundle.json',import.meta.url));
const cli=fileURLToPath(new URL('../plugin/skills/repo-governance/scripts/check.mjs',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
function temp(t) {
  const dir=mkdtempSync(join(tmpdir(),'repo governance 한글-')); t.after(()=>rmSync(dir,{recursive:true,force:true})); return dir;
}
function fixture(t) {
  const outer=temp(t), repository=join(outer,'제품'); mkdirSync(repository);
  const git=(args,env={},cwd=repository)=>execFileSync('git',['-C',cwd,'-c','core.autocrlf=false','-c','user.name=fixture','-c','user.email=fixture@localhost',...args],{env:{...process.env,...env},encoding:'utf8',stdio:'pipe'}).trim();
  git(['init','-q','-b','trunk']);
  writeFileSync(join(repository,'.gitignore'),'/local-out/\n/hidden.db\n');
  writeFileSync(join(repository,'source.txt'),'base\n');
  git(['add','.']); git(['commit','-qm','fixture']);
  const productPath=join(outer,'product.json');
  const product={schemaVersion:1,bundle:{version:'0.2.0',sha256:sha(readFileSync(bundlePath))},
    outputBoundaries:[{path:'local-out',purpose:'runtime logs',lifetime:'one run'}]};
  writeFileSync(productPath,JSON.stringify(product));
  return {outer,repository,git,product,context:{repository,productPath,bundlePath}};
}
const req=(check,sources,context={bundlePath})=>({schemaVersion:3,operation:'check',check,sources,context});
async function call(request,code,argv=[]) {
  const r=await runCheck(JSON.stringify(request),argv); const parsed=JSON.parse(r.line);
  assert.equal(r.exitCode,code,JSON.stringify(parsed.findings)); return parsed;
}
const scope=(f,s)=>req('file-scope',Array.isArray(s)?s:[s],f.context);
const file=path=>({kind:'file',path});
function snapshot(f) {
  return {head:f.git(['rev-parse','HEAD']),index:sha(readFileSync(join(f.repository,'.git/index'))),
    objects:readdirSync(join(f.repository,'.git/objects'),{recursive:true}).sort()};
}

test('strict request, source cardinality, context duplicates, direct JSON-line CLI and migration rejection',async()=>{
  const n=req('name',[{kind:'text',text:'product-inventory-api'}]);
  for (const invalid of [{...n,approved:true},{...n,operation:'apply'},{...n,schemaVersion:2},{...n,context:{...n.context,approved:true}},
    {...n,sources:[{kind:'text',text:'product-inventory-api',approved:true}]},{...n,sources:[file('README.md')]},{...n,sources:[...n.sources,...n.sources]},{...n,check:'constructor'}])
    await call(invalid,1);
  await call(n,1,['--bundle',bundlePath]); await call({...n,context:{}},1,['--bundle',bundlePath,'--bundle',bundlePath]);
  await call({...n,sources:[]},3); await call({...n,context:{}},3);
  await call({...n,context:{}},0,['--bundle',bundlePath]);
  for (const [input,code] of [[JSON.stringify(n),0],[JSON.stringify({...n,sources:[{kind:'text',text:'WRONG'}]}),2],['{\n',1],[JSON.stringify({...n,sources:[]}),3]]) {
    const p=spawnSync(process.execPath,[cli],{input,encoding:'utf8'}); assert.equal(p.status,code,p.stderr);
    assert.equal(p.stdout.trimEnd().split('\n').length,1); assert.equal(JSON.parse(p.stdout).schemaVersion,3);
  }
});
test('bundle integrity rejects removed resources, changed bytes, duplicate/traversal entries and incompatible versions',async t=>{
  const dir=temp(t), root=resolve(dirname(bundlePath),'../../..'), m=JSON.parse(readFileSync(bundlePath));
  for (const f of m.files) {
    mkdirSync(dirname(join(dir,f.path)),{recursive:true}); cpSync(join(root,f.path),join(dir,f.path));
  }
  const path=join(dir,'skills/repo-governance/assets/bundle.json');
  const n=req('name',[{kind:'text',text:'product-inventory-api'}],{bundlePath:path});
  for (const [manifest,exit] of [[{...m,files:m.files.filter(f=>f.path!=='specs/naming.md')},3],
    [{...m,files:[m.files[0],...m.files]},1],[{...m,files:[{...m.files[0],path:'../unsafe'}]},1],[{...m,version:'0.1.0'},3]]) {
    writeFileSync(path,JSON.stringify(manifest)); await call(n,exit);
  }
  writeFileSync(path,JSON.stringify(m)); await call(n,0);
  writeFileSync(join(dir,'specs/naming.md'),'tampered'); await call(n,3);
});
test('K7 before writes distinguishes allowed ignored outputs, unignored or tracked collisions, and unknown file responsibility',async t=>{
  const f=fixture(t), run=(s,code)=>call(scope(f,s),code), candidate='local-out/run.log';
  const before=snapshot(f);
  const r=await run([file(candidate),file('new-source.txt')],0);
  assert.equal(r.semanticChecks[0].ruleId,'K7'); assert.deepEqual(snapshot(f),before);
  assert.equal(existsSync(join(f.repository,candidate)),false);
  await run(file('hidden.db'),0);
  writeFileSync(join(f.repository,'.gitignore'),''); await run(file(candidate),2);
  mkdirSync(join(f.repository,'local-out')); writeFileSync(join(f.repository,candidate),'tracked');
  f.git(['add','-f','--',candidate]); await run(file(candidate),2);
  await call(req('file-scope',[file('source.txt')],{bundlePath,repository:f.repository}),0);
  for (const override of [{approved:true},{branchNamespace:{prefix:'a/',source:'x',scope:'x',expires:'x',approved:true}}]) {
    writeFileSync(f.context.productPath,JSON.stringify({...f.product,...override})); await run(file('source.txt'),1);
  }
  writeFileSync(f.context.productPath,JSON.stringify({schemaVersion:1})); await run(file('source.txt'),0);
  writeFileSync(f.context.productPath,JSON.stringify({...f.product,bundle:{version:'0.1.0',sha256:'0'.repeat(64)}})); await run(file('source.txt'),0);
  writeFileSync(f.context.productPath,JSON.stringify({...f.product,schemaVersion:2}));
  assert.match((await run(file('source.txt'),3)).findings[0].message,/Unsupported product schemaVersion/);
});
test('K7 forced staged output, revision inclusion, deletion and unrelated historical file check the actual changed set',async t=>{
  const f=fixture(t), name='local-out/data.bin', bytes=Buffer.from([0,254,9,3]);
  mkdirSync(join(f.repository,'local-out')); writeFileSync(join(f.repository,name),bytes);
  f.git(['add','-f','--',name]);
  const oid=f.git(['rev-parse',':'+name]), before=snapshot(f);
  writeFileSync(join(f.repository,name),'different worktree bytes');
  const r=await call(scope(f,{kind:'index'}),2);
  assert.ok(r.observed.some(o=>o.kind==='blob' && o.digestOrOid===oid && o.target.endsWith('data.bin')));
  assert.deepEqual(snapshot(f),before); assert.equal(readFileSync(join(f.repository,name),'utf8'),'different worktree bytes');
  f.git(['commit','-qm','fixture inclusion']);
  const rev=await call(scope(f,{kind:'revision',revision:'HEAD'}),2);
  assert.ok(rev.observed.some(o=>o.kind==='revision' && o.digestOrOid===f.git(['rev-parse','HEAD'])));
  writeFileSync(join(f.repository,'source.txt'),'source\n'); f.git(['add','source.txt']);
  const unrelated=await call(scope(f,{kind:'index'}),0); assert.ok(!unrelated.observed.some(o=>o.kind==='blob' && o.target.endsWith('data.bin')));
  f.git(['rm','--cached',name]); const removed=await call(scope(f,{kind:'index'}),0);
  assert.ok(removed.observed.some(o=>o.kind==='removed-blob' && o.digestOrOid===oid));
  await call(scope(f,{kind:'revision',revision:'--help'}),1);
  await call(scope(f,{kind:'revision',revision:'missing-branch'}),3);
});
test('alternate Git index is inspected, not modified; default index and object list stay unchanged',async t=>{
  const f=fixture(t), env={GIT_INDEX_FILE:join(f.outer,'other index')};
  f.git(['read-tree','HEAD'],env);
  writeFileSync(join(f.repository,'source.txt'),'alternate content\n'); f.git(['add','source.txt'],env);
  const oid=f.git(['rev-parse',':source.txt'],env), before=snapshot(f), alternate=sha(readFileSync(env.GIT_INDEX_FILE));
  writeFileSync(join(f.repository,'source.txt'),'worktree\n');
  const p=spawnSync(process.execPath,[cli],{env:{...process.env,...env},encoding:'utf8',input:JSON.stringify(scope(f,{kind:'index'}))});
  assert.equal(p.status,0,p.stdout+p.stderr);
  const r=JSON.parse(p.stdout);
  assert.ok(r.observed.some(o=>o.kind==='index' && relative(o.target,env.GIT_INDEX_FILE)===''));
  assert.ok(r.observed.some(o=>o.kind==='blob' && o.digestOrOid===oid));
  assert.deepEqual(snapshot(f),before); assert.equal(sha(readFileSync(env.GIT_INDEX_FILE)),alternate);
});
test('linked worktree reads its own Git message and staged bytes; relative README links resolve beside that actual README',async t=>{
  const f=fixture(t), work=join(f.outer,'linked');
  f.git(['worktree','add','-q','-b','other',work]);
  const context={...f.context,repository:work};
  const message=f.git(['rev-parse','--path-format=absolute','--git-path','COMMIT_EDITMSG'],{},work);
  const bytes=Buffer.from('docs: 문서를 고친다\r\n','utf8'); writeFileSync(message,bytes);
  const r=await call(req('commit-message',[file(message)],context),0);
  assert.ok(r.observed.some(o=>o.kind==='file' && o.digestOrOid===sha(bytes)));
  mkdirSync(join(work,'docs')); writeFileSync(join(work,'docs/README.md'),'# 시작\n\n[자료](../source.txt)\n');
  await call(req('readme',[file('docs/README.md')],context),0);
  writeFileSync(join(work,'docs/README.md'),'# 시작\n\n[자료](없음.md)\n');
  await call(req('readme',[file('docs/README.md')],context),2);
  writeFileSync(join(work,'source.txt'),'linked worktree\n'); f.git(['add','source.txt'],{},work);
  const index=await call(req('file-scope',[{kind:'index'}],context),0);
  assert.ok(index.observed.some(o=>o.kind==='blob' && o.digestOrOid===f.git(['rev-parse',':source.txt'],{},work)));
});
test('external targets, metadata paths, duplicate sources and symlink/junction escapes cannot be read as product files',async t=>{
  const f=fixture(t);
  const dir=join(f.outer,'external'); mkdirSync(dir); writeFileSync(join(dir,'private'),'private fixture');
  for (const path of ['../external/private',join(dir,'private'),'.git/config'])
    await call(scope(f,file(path)),1);
  await call(scope(f,[file('source.txt'),file('./source.txt')]),1);
  await t.test('directory link cannot escape its declared repository',async linkTest=>{
    try {symlinkSync(dir,join(f.repository,'alias'),process.platform==='win32'?'junction':'dir');}
    catch(e) {if (['EPERM','EACCES'].includes(e.code)) {linkTest.skip('Host is unable to create a directory link: '+e.code);return;} throw e;}
    const r=await call(scope(f,file('alias/private')),1); assert.ok(!r.observed.some(o=>o.digestOrOid===sha('private fixture')));
  });
});
