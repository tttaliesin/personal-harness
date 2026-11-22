import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, realpath, stat, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Missing, fields, string, relativeName, rulesVersion, digestPattern, oidPattern, productFrom, readmePath } from './contracts.mjs';

const exec = promisify(execFile);
const inputRuntime = new AsyncLocalStorage();
export function withInputRuntime(runtime, run) {
  fields(runtime, [], ['gitEnvironment','indexComparison','snapshotCache','remoteFile'], 'checker runtime');
  if (runtime.indexComparison !== undefined && !['head','amend'].includes(runtime.indexComparison))
    throw Error('Invalid index comparison');
  if (runtime.gitEnvironment !== undefined && (!runtime.gitEnvironment || typeof runtime.gitEnvironment !== 'object'
      || Array.isArray(runtime.gitEnvironment) || Object.values(runtime.gitEnvironment).some(value=>typeof value!=='string' && value!==undefined)))
    throw Error('Invalid checker Git environment');
  if (runtime.snapshotCache !== undefined && !(runtime.snapshotCache instanceof Map)) throw Error('Invalid Git snapshot cache');
  if (runtime.remoteFile !== undefined) {
    const remote=runtime.remoteFile;
    fields(remote,['revision','operation'],['expectedBlob'],'remote file');
    if (typeof remote.revision!=='string' || !oidPattern.test(remote.revision)
        || !['create','update'].includes(remote.operation)
        || (remote.operation==='create' ? Object.hasOwn(remote,'expectedBlob')
          : typeof remote.expectedBlob!=='string' || !oidPattern.test(remote.expectedBlob))) throw Error('Invalid remote file candidate');
  }
  return inputRuntime.run({...runtime, ...(runtime.gitEnvironment ? {gitEnvironment:{...runtime.gitEnvironment}} : {})}, run);
}
const skill = 'skills/repo-governance/';
const runtimeRoot = fileURLToPath(new URL('../../../', import.meta.url));
const runtimeModules = ['check','contracts','inputs','rules','native-product','checks/documents','checks/file-scope','checks/git','checks/repository','vendor/markdown-it'].map(n=>skill+'scripts/'+n+'.mjs');
const requiredFiles = [
  '.codex-plugin/plugin.json','.claude-plugin/plugin.json','package.json','SPEC.md', ...['naming','description','readme','commits','branches','pull-requests','file-inclusion'].map(n=>'specs/'+n+'.md'),
  'templates/README.md','templates/PULL_REQUEST.md','templates/github-actions.yml',skill+'SKILL.md',
  ...['repository-policy','pi-tools','codex-tools','claude-code-tools','checker','architecture','verification','native-verification'].map(n=>skill+'references/'+n+'.md'),
  skill+'assets/policy.json',...runtimeModules,skill+'scripts/hook.mjs',skill+'scripts/tool-call.mjs',
  'hooks/run.mjs','hooks/codex.json','hooks/claude-code.json','.pi/extensions/repo-governance.ts',skill+'scripts/vendor/markdown-it.LICENSE'
];
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const utf8 = b => new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(b);
const observed = (kind,target,digestOrOid) => ({kind,target,digestOrOid});
const inside = (root,target) => {
  const rel = path.relative(root,target);
  return rel === '' || (rel !== '..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel));
};
async function fileBytes(p) {
  if (!(await stat(p)).isFile()) throw Error('Expected a regular file: ' + p);
  return readFile(p);
}
function below(root,p) {
  if (!inside(root,p)) throw Error('Path outside the declared root: ' + p);
  return p;
}
async function physical(root,target,{allowNew=false}={}) {
  below(root,target);
  let dest=root;
  for (const part of path.relative(root,target).split(path.sep).filter(Boolean)) {
    dest=path.join(dest,part);
    let entry;
    try {entry=await lstat(dest);} catch(e) {if (allowNew && e.code==='ENOENT') continue; throw e;}
    if (entry.isSymbolicLink()) dest=below(root,await realpath(dest));
  }
  return dest;
}
export async function loadCriteria(context, seen) {
  const cwd=path.resolve(context.repository ?? '.');
  const manifestPath=await realpath(path.resolve(cwd,context.bundlePath));
  const raw=await fileBytes(manifestPath);
  const digest=sha(raw);
  seen.push(observed('bundle',manifestPath,digest));
  const m=JSON.parse(utf8(raw));
  fields(m,['schemaVersion','version','checkerSchemaVersion','root','files'],[],'bundle');
  if (m.schemaVersion!==1 || m.version!==rulesVersion || m.checkerSchemaVersion!==3 || m.root!=='../../..' || !Array.isArray(m.files))
    throw new Missing('Incompatible bundle schema, release, root or checker version');
  const root=await realpath(path.resolve(path.dirname(manifestPath),m.root));
  const names=new Set(), physicalNames=new Set();
  let policy;
  for (const f of m.files) {
    fields(f,['path','sha256'],[],'bundle entry'); relativeName(f.path);
    if (typeof f.sha256!=='string' || !digestPattern.test(f.sha256) || names.has(f.path)) throw Error('Invalid or duplicate manifest entry: '+f.path);
    names.add(f.path);
    const p=await physical(root,path.join(root,f.path));
    const key=process.platform==='win32'?p.toLowerCase():p;
    if (path.relative(p,manifestPath)==='' || physicalNames.has(key)) throw Error('Circular or aliased manifest entry: '+f.path);
    physicalNames.add(key);
    const bytes=await fileBytes(p);
    if (sha(bytes)!==f.sha256) throw new Missing('Bundle digest mismatch: '+f.path);
    if (runtimeModules.includes(f.path) && path.relative(runtimeRoot,root)!=='' && sha(await fileBytes(path.join(runtimeRoot,f.path)))!==f.sha256)
      throw new Missing('Running checker differs from the selected bundle: '+f.path);
    if (['package.json','.codex-plugin/plugin.json','.claude-plugin/plugin.json'].includes(f.path)) {
      const pkg=JSON.parse(utf8(bytes));
      if (pkg.name!=='repo-governance' || pkg.version!==m.version) throw new Missing('Package or adapter release differs: '+f.path);
    }
    if (f.path===skill+'assets/policy.json') policy=JSON.parse(utf8(bytes));
  }
  for (const name of requiredFiles) if (!names.has(name)) throw new Missing('Required resource missing from bundle: '+name);
  fields(policy,['schemaVersion','version','nameCategories','commitTypes'],[],'policy');
  if (policy.schemaVersion!==1 || policy.version!==m.version || ![policy.nameCategories,policy.commitTypes].every(a=>Array.isArray(a) && a.length && a.every(s=>typeof s==='string' && /^[a-z]+$/.test(s)) && new Set(a).size===a.length))
    throw new Missing('Invalid policy vocabulary or version');
  let product;
  if (context.productPath) {
    const p=await realpath(path.resolve(cwd,context.productPath));
    const bytes=await fileBytes(p);
    seen.push(observed('product',p,sha(bytes)));
    product=productFrom(JSON.parse(utf8(bytes)));
  }
  return {policy,product};
}
async function git(repo,args,accepted=[0]) {
  const options={cwd:repo,encoding:'buffer',windowsHide:true,maxBuffer:64*1024*1024,
    env:{...(inputRuntime.getStore()?.gitEnvironment ?? process.env),GIT_NO_LAZY_FETCH:'1',GIT_ALLOW_PROTOCOL:'',GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0',GIT_NO_REPLACE_OBJECTS:'1'}};
  try {
    const {stdout}=await exec('git',['-c','core.fsmonitor=false',...args],options);
    return {code:0,stdout};
  } catch(e) {
    if (typeof e.code==='number' && accepted.includes(e.code)) return {code:e.code,stdout:e.stdout};
    throw Error('git '+args[0]+' failed: '+String(e.stderr || e.message).trim());
  }
}
const gitLine=async(repo,args)=>utf8((await git(repo,args)).stdout).replace(/\r?\n$/,'');
async function repoRoot(ctx) {
  if (!ctx.repository) throw new Missing('context.repository is required to identify this candidate');
  const cwd=await realpath(ctx.repository);
  const root=await realpath(await gitLine(cwd,['rev-parse','--show-toplevel']));
  if (!inside(root,cwd)) throw Error('Git worktree does not contain the declared repository');
  return root;
}
const zparts=b=>b.length?utf8(b).split('\0').slice(0,-1):[];
async function resolveCommit(repo,ref,optional=false) {
  string(ref,'Git revision');
  if (ref.startsWith('-') || /[\x00-\x1f]/.test(ref)) throw Error('Invalid Git revision');
  const r=await git(repo,['rev-parse','--verify','--quiet','--end-of-options',ref+'^{commit}'],[0,1]);
  if (r.code===1) {if (optional) return null; throw new Missing('Cannot resolve commit: '+ref);}
  const oid=utf8(r.stdout).trim();
  if (!oidPattern.test(oid)) throw Error('Invalid resolved Git OID');
  return oid;
}
function baseFor(ctx, product) {
  return ctx.baseRef ?? product?.baseRef;
}
function sourcePath(root,input) {
  if (/[\x00-\x1f]/.test(input) || /^(?:\\\\|\/\/)/.test(input)) throw Error('Invalid file path');
  if (input.split(/[\\/]/).includes('..')) throw Error('Parent traversal is not a file source: '+input);
  const p=below(root,path.resolve(root,input));
  const rel=path.relative(root,p).split(path.sep).join('/');
  relativeName(rel);
  return p;
}
function relative(root,p) {return path.relative(root,p).split(path.sep).join('/');}
function compareKey(p) {return process.platform==='win32'?p.toLowerCase():p;}
function under(name,dir) {
  const n=compareKey(name), d=compareKey(dir);
  return n===d || n.startsWith(d+'/');
}
async function pathFacts(root,source,boundaries,seen) {
  const lexical=sourcePath(root,source.path);
  const actual=await physical(root,lexical,{allowNew:true});
  const name=relativeName(relative(root,actual));
  const requested=relative(root,lexical);
  const match=p=>boundaries.some(b=>under(p,b));
  const tracked=zparts((await git(root,['--literal-pathspecs','ls-files','-z','--',name])).stdout);
  if (match(name) && !tracked.length && name.includes('/')) {
    const ancestors=name.split('/').slice(0,-1).map((_,i)=>name.split('/').slice(0,i+1).join('/'));
    const parents=zparts((await git(root,['--literal-pathspecs','ls-files','-z','--',...ancestors])).stdout);
    if (parents.some(p=>ancestors.includes(p))) tracked.push(name);
  }
  const ignore=await git(root,['check-ignore','--no-index','-q','--',name],[0,1]);
  let exists=false;
  try {
    const st=await stat(actual);
    if (!st.isFile()) throw Error('File target is not a regular file: '+actual);
    const b=await fileBytes(actual); seen.push(observed('file',actual,sha(b))); exists=true;
  } catch(e) { if (e.code!=='ENOENT') throw e; }
  const result={name,requested,output:match(name),aliasedBoundary:match(name)!==match(requested),
    tracked:tracked.length>0,ignored:ignore.code===0,exists};
  seen.push(observed('path-state',actual,sha(JSON.stringify(result))));
  return result;
}
const rawDiffOptions=['--raw','--no-abbrev','--no-ext-diff','--no-textconv','--no-renames','--ignore-submodules=none','-z'];
const regularBlob = entry => entry?.mode==='100644' || entry?.mode==='100755';

function rawChanges(raw) {
  const rows=zparts(raw), files=[];
  for (let i=0;i<rows.length;i+=2) {
    const m=/^:\d+ (\d+) ([0-9a-f]+) ([0-9a-f]+) ([AMDT])$/.exec(rows[i]);
    if (!m || !rows[i+1] || !oidPattern.test(m[2]) || !oidPattern.test(m[3]))
      throw new Missing('Unsupported Git change or unresolved candidate: '+(rows[i+1] ?? 'unknown path'));
    files.push({name:rows[i+1],previous:m[2],status:m[4],entry:{mode:m[1],oid:m[3]}});
  }
  return files;
}

async function treeEntries(root,revision) {
  const raw=(await git(root,['ls-tree','-r','--full-tree','-z',revision])).stdout;
  const entries=new Map();
  for (const row of zparts(raw)) {
    const m=/^(\d+) (?:blob|commit) ([0-9a-f]+)\t([\s\S]+)$/.exec(row);
    if (!m || !oidPattern.test(m[2])) throw Error('Malformed Git tree record');
    entries.set(m[3],{mode:m[1],oid:m[2]});
  }
  return entries;
}

async function cachedSnapshot(key,seen,capture) {
  const cache=inputRuntime.getStore()?.snapshotCache;
  if (cache?.has(key)) {
    const {snapshot,records}=cache.get(key);
    for (const record of records) seen.push(record);
    return snapshot;
  }
  const records=[];
  try {
    const snapshot=await capture(records);
    cache?.set(key,{snapshot,records});
    return snapshot;
  } finally {
    for (const record of records) seen.push(record);
  }
}

async function indexSnapshot(root,seen) {
  const comparison=inputRuntime.getStore()?.indexComparison ?? 'head';
  return cachedSnapshot(JSON.stringify(['index',root,comparison]),seen,async records=>{
    const head=await resolveCommit(root,'HEAD',true);
    if (comparison==='amend' && !head) throw new Missing('Amend requires an existing HEAD commit.');
    if (head) records.push(observed(comparison==='head'?'parent':'head',root,head));
    let parents=head?[head]:[];
    if (comparison==='amend') {
      const headers=(await git(root,['cat-file','commit',head])).stdout.toString('latin1').split('\n\n',1)[0];
      parents=[...headers.matchAll(/^parent ([0-9a-f]+)$/gm)].map(match=>match[1]);
      for (const parent of parents) {
        if (!oidPattern.test(parent)) throw Error('Invalid amended parent identity');
        await resolveCommit(root,parent);
        records.push(observed('parent',root+'@'+head,parent));
      }
    }

    const objectFormat=await gitLine(root,['rev-parse','--show-object-format']);
    if (!['sha1','sha256'].includes(objectFormat)) throw Error('Unsupported Git object format');
    // Diff against Git's intrinsic empty tree to capture all committable index entries in one read.
    // Intent-to-add paths remain working drafts, so they are absent from this snapshot.
    const empty=createHash(objectFormat).update('tree 0\0').digest('hex');
    const raw=(await git(root,['diff','--cached','--ita-invisible-in-index',...rawDiffOptions,empty,'--'])).stdout;
    const indexPath=path.resolve(root,await gitLine(root,['rev-parse','--path-format=absolute','--git-path','index']));
    records.push(observed('index',indexPath,sha(raw)));
    const entries=new Map();
    for (const {name,status,entry} of rawChanges(raw)) {
      if (status!=='A' || entries.has(name)) throw new Missing('Cannot identify a complete staged tree: '+name);
      entries.set(name,entry);
    }

    const bases=[];
    for (const parent of parents) bases.push(await treeEntries(root,parent));
    const removed=new Map();
    for (const base of bases) {
      for (const [name,entry] of base) if (!entries.has(name)) removed.set(name,entry);
    }
    for (const [name,entry] of removed) records.push(observed('removed-blob',path.join(root,name),entry.oid));
    const files=[];
    for (const [name,entry] of entries) {
      if (bases.length && bases.every(base=>{
        const prior=base.get(name);
        return prior?.mode===entry.mode && prior.oid===entry.oid;
      })) continue;
      files.push(await candidateBlob(root,name,entry,records));
    }
    return {entries,files};
  });
}

async function revisionCandidates(root,source,ctx,product,seen) {
  const oid=await resolveCommit(root,source.revision);
  seen.push(observed('revision',root+'@'+source.revision,oid));
  const baseRef=baseFor(ctx,product);
  const base=await resolveCommit(root,baseRef ?? oid+'^1',!baseRef);
  if (!base && !baseRef) {
    const headers=(await git(root,['cat-file','commit',oid])).stdout.toString('latin1').split('\n\n',1)[0];
    if (/^parent /m.test(headers)) throw new Missing('Parent of the selected revision is unavailable; supply its comparison base.');
  }
  if (base) seen.push(observed('base',root+'@'+(baseRef ?? oid+'^1'),base));
  const args=base?['diff',...rawDiffOptions,base,oid,'--']:['diff-tree','--root','-r','--no-commit-id',...rawDiffOptions,oid,'--'];
  const files=[];
  for (const {name,previous,status,entry} of rawChanges((await git(root,args)).stdout)) {
    if (status==='D') seen.push(observed('removed-blob',path.join(root,name),previous));
    else files.push(await candidateBlob(root,name,entry,seen));
  }
  return files;
}

async function gitBlob(root,name,entry) {
  if (!['100644','100755','120000'].includes(entry.mode)) throw new Missing('Candidate is not a readable Git blob: '+name);
  const blob=(await git(root,['cat-file','blob',entry.oid])).stdout;
  const computed=createHash(entry.oid.length===64?'sha256':'sha1').update('blob '+blob.length+'\0').update(blob).digest('hex');
  if (computed!==entry.oid) throw Error('Git blob identity mismatch: '+name);
  return blob;
}
async function candidateBlob(root,name,entry,seen) {
  const bytes=await gitBlob(root,name,entry);
  seen.push(observed('blob',path.join(root,name),entry.oid));
  return readmePath(name)?{name,bytes}:{name};
}

function gitPathFrom(directory,name) {
  if (path.posix.isAbsolute(name) || /[\\:\x00-\x1f]/.test(name)) throw Error('Expected a relative Git link target: '+name);
  const resolved=path.posix.normalize(path.posix.join(directory,name)).replace(/\/$/,'');
  return resolved==='.' || resolved===''?'':relativeName(resolved);
}

function parentPaths(name) {
  const parts=name.split('/');
  return parts.slice(0,-1).map((_,index)=>parts.slice(0,index+1).join('/'));
}

function gitDirectory(entries,name) {
  if (!name) return true;
  for (const candidate of entries.keys()) if (candidate.startsWith(name+'/')) return true;
  return false;
}

function snapshotLinks(root,entries,knownBytes=new Map(),incoming) {
  const entryAt=name=>name===incoming?{mode:'100644'}:entries.get(name);
  async function blob(name) {
    if (!knownBytes.has(name)) knownBytes.set(name,await gitBlob(root,name,entries.get(name)));
    return knownBytes.get(name);
  }
  return {
    async resolveLink(_root,from,link) {
      let name=gitPathFrom(path.posix.dirname(relative(root,from)),link);
      const followed=new Set();
      while (name) {
        const symlink=[...parentPaths(name),name].find(candidate=>entryAt(candidate)?.mode==='120000');
        if (!symlink) break;
        if (followed.size===40 || followed.has(symlink)) throw new Missing('Cannot resolve Git symbolic link: '+symlink);
        followed.add(symlink);
        const target=gitPathFrom(path.posix.dirname(symlink),utf8(await blob(symlink)));
        const suffix=name.slice(symlink.length+1);
        name=suffix?gitPathFrom(target,suffix):target;
      }
      const entry=entryAt(name);
      if (!entry && !gitDirectory(entries,name)) return null;
      return {path:path.join(root,name),isFile:regularBlob(entry)};
    },
    async readLink(file,seen) {
      const name=relative(root,file);
      const bytes=await blob(name);
      seen.push(observed('linked-file',file,sha(bytes)));
      return utf8(bytes);
    }
  };
}

function stagedReadme(root,{entries,files}) {
  const documents=[], knownBytes=new Map();
  for (const {name,bytes} of files) {
    if (bytes===undefined) continue;
    if (!regularBlob(entries.get(name))) throw new Missing('Staged README must be a regular Git blob: '+name);
    const target=path.join(root,relativeName(name));
    documents.push({text:utf8(bytes).replace(/^\uFEFF/,''),target,root});
    knownBytes.set(name,bytes);
  }
  return {target:root,documents,...snapshotLinks(root,entries,knownBytes)};
}

async function remoteFileInput(root,check,source,remote,boundaries,seen) {
  const name=relativeName(source.path);
  const entries=await cachedSnapshot(JSON.stringify(['revision',root,remote.revision]),seen,async records=>{
    const revision=await resolveCommit(root,remote.revision);
    if (revision!==remote.revision) throw new Missing('Remote branch candidate must identify a commit directly.');
    records.push(observed('revision',root+'@'+revision,revision));
    return treeEntries(root,revision);
  });
  const previous=entries.get(name);
  if (remote.operation==='update') {
    if (!regularBlob(previous) || previous.oid!==remote.expectedBlob)
      throw new Missing('The target branch does not contain the expected current file blob: '+name);
    seen.push(observed('existing-blob',path.join(root,name),previous.oid));
  } else if (previous || gitDirectory(entries,name) || parentPaths(name).some(parent=>entries.has(parent))) {
    throw new Missing('The target branch does not have a vacant file path: '+name);
  }
  if (check==='file-scope')
    return {target:root,kind:'revision',files:[{name,output:boundaries.some(boundary=>under(name,boundary))}]};
  const target=path.join(root,name), bytes=Buffer.from(source.text);
  seen.push(observed('text',target,sha(bytes)));
  return {target,root,text:utf8(bytes),...snapshotLinks(root,entries,new Map([[name,bytes]]),name)};
}

async function readMessage(root,source,check) {
  const p=path.resolve(root,source.path);
  if (check==='commit-message') {
    const message=path.resolve(root,await gitLine(root,['rev-parse','--path-format=absolute','--git-path','COMMIT_EDITMSG']));
    if (path.relative(p,message)==='') {
      if ((await lstat(message)).isSymbolicLink()) throw Error('Unexpected symbolic Git message file');
      return {path:message,bytes:await fileBytes(message)};
    }
  }
  const actual=await physical(root,sourcePath(root,source.path));
  relativeName(relative(root,actual));
  return {path:actual,bytes:await fileBytes(actual)};
}
export async function readInput({check,sources,context},product,seen) {
  const s=sources[0];
  const boundaries=(product?.outputBoundaries ?? []).map(b=>b.path.replace(/\/$/,''));
  const remote=inputRuntime.getStore()?.remoteFile;
  if (remote) {
    if ((check==='readme' && s.kind!=='text') || (check==='file-scope' && (s.kind!=='file' || sources.length!==1))
        || !['readme','file-scope'].includes(check)) throw Error('Remote file inspection requires one explicit file or README text candidate');
    const root=await repoRoot(context);
    return remoteFileInput(root,check,s,remote,boundaries,seen);
  }
  if (s.kind==='index') {
    const root=await repoRoot(context);
    const snapshot=await indexSnapshot(root,seen);
    if (check==='readme') return stagedReadme(root,snapshot);
    const files=snapshot.files.map(({name})=>({name,output:boundaries.some(b=>under(name,b))}));
    return {target:root,kind:'index',files};
  }
  if (s.kind==='text') {
    if (check==='readme' && context.repository) {
      const root=await realpath(context.repository);
      if (!(await stat(root)).isDirectory()) throw Error('README context.repository must identify its root directory');
      const target = s.path === undefined ? path.join(root, 'README.md')
        : await physical(root, sourcePath(root, s.path), { allowNew: true });
      relativeName(relative(root, target));
      seen.push(observed('text',target,sha(s.text)));
      return {text:s.text,target,root};
    }
    seen.push(observed('text',check,sha(s.text)));
    if (check!=='branch') return {text:s.text,target:check};
    const validRef=(await git(undefined,['check-ref-format','refs/heads/'+s.text],[0,1])).code===0;
    const baseRef=baseFor(context,product);
    let base=null, existing=null;
    if (context.repository && baseRef) {
      const root=await repoRoot(context);
      base=await resolveCommit(root,baseRef,true);
      if (base) seen.push(observed('base',root+'@'+baseRef,base));
      if (validRef) existing=await resolveCommit(root,'refs/heads/'+s.text,true);
      if (existing) seen.push(observed('existing-branch',root+'@refs/heads/'+s.text,existing));
      const worktrees=(await git(root,['worktree','list','--porcelain','-z'])).stdout;
      seen.push(observed('worktrees',root,sha(worktrees)));
    }
    return {text:s.text,target:check,validRef,base,existing};
  }
  if (s.kind==='pr') {
    const target='supplied PR #'+s.number;
    seen.push(observed('pr-head',target,s.headOid),observed('pr-base',target,s.baseOid),
      observed('pr-title',target,sha(s.title)),observed('pr-body',target,sha(s.body)));
    return {target,pr:s};
  }
  if (s.kind==='pr-create') {
    const target='https://github.com/'+s.repository+'/compare/'+encodeURIComponent(s.baseRef)+'...'+encodeURIComponent(s.headRef);
    seen.push(observed('pr-head',s.repository+'@'+s.headRef,s.headOid),observed('pr-base',s.repository+'@'+s.baseRef,s.baseOid),
      observed('pr-title',target,sha(s.title)),observed('pr-body',target,sha(s.body)),observed('pr-draft',target,sha(JSON.stringify(s.draft))));
    return {target,pr:s};
  }
  if (!context.repository) throw new Missing('context.repository is required to identify this candidate');
  const root=check==='readme' ? await realpath(context.repository) : await repoRoot(context);
  if (check!=='file-scope') {
    const file=await readMessage(root,s,check);
    seen.push(observed('file',file.path,sha(file.bytes)));
    const text=utf8(file.bytes).replace(/^\uFEFF/,'');
    return {text,target:file.path,root};
  }
  if (s.kind==='file') {
    const files=[];
    for (const source of sources) files.push(await pathFacts(root,source,boundaries,seen));
    if (new Set(files.map(f=>compareKey(f.name))).size!==files.length) throw Error('Duplicate or aliased file source');
    return {target:root,files,kind:'file'};
  }
  const files=await revisionCandidates(root,s,context,product,seen);
  return {target:root,kind:s.kind,files:files.map(({name})=>({name,output:boundaries.some(b=>under(name,b))}))};
}

export async function linkFile(root,from,link) {
  const candidate=below(root,path.resolve(path.dirname(from),link));
  if (candidate!==root) relativeName(relative(root,candidate));
  try {
    const p=await physical(root,candidate);
    if (p!==root) relativeName(relative(root,p));
    const st=await stat(p);
    return {path:p,isFile:st.isFile()};
  } catch(e) {if (e.code==='ENOENT' || e.code==='ENOTDIR') return null; throw e;}
}
export async function linkDocument(file,seen) {
  const bytes=await fileBytes(file);
  seen.push(observed('linked-file',file,sha(bytes)));
  return utf8(bytes);
}
