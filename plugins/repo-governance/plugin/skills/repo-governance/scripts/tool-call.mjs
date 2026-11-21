import { readFile, realpath, lstat, open } from 'node:fs/promises';
import { basename, dirname, relative, isAbsolute, sep, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { runCheck } from './check.mjs';
import { oidPattern, relativeName, readmePath } from './contracts.mjs';
import { localNativeScope, nativeGitEnvironment } from './native-product.mjs';

const execute = promisify(execFile);
const bundlePath = fileURLToPath(new URL('../assets/bundle.json', import.meta.url));
const shellTools = new Set(['bash', 'powershell', 'exec_command', 'shell_command', 'shell']);
const remoteFileTools = new Set(['create_file','update_file']);
const rawRemoteFileTools = new Set(['create_or_update_file','delete_file','push_files','create_blob','create_tree','create_commit','update_ref']);
const aliases = { '-d': '--description', '-R': '--repo', '-m': '--message', '-F': '--file', '-b': '--base', '-B': '--base', '-t': '--title', '-H': '--head' };
const skip = (reason = 'not-applicable') => ({ kind: 'skip', reason });
const missing = reason => ({ kind: 'missing', reason });
const candidate = checks => ({ kind: 'candidate', checks });
const textCheck = (check, text) => ({ check, sources: [{ kind: 'text', text }] });

function string(value, label) {
  if (typeof value !== 'string') throw new TypeError(label + ' must be a string');
  return value;
}

function tokenize(command) {
  const segments = [[]];
  let value = '', started = false, quote = '', dynamic = false, unsupported = false;
  const push = () => {
    if (started) segments.at(-1).push({ value, dynamic });
    value = ''; started = false; dynamic = false;
  };
  for (let index = 0; index < command.length; index++) {
    const character = command[index];
    if (quote) {
      if (character === quote) {
        if (quote === "'" && command[index + 1] === "'") { value += "'"; dynamic = true; index++; }
        else quote = '';
      } else {
        if (quote === '"' && /[$`%\\]/.test(character)) dynamic = true;
        value += character;
      }
      continue;
    }
    if (character === "'" || character === '"') { quote = character; started = true; }
    else if (/\s/.test(character) && !/[\r\n]/.test(character)) push();
    else if (/[;&|<>\r\n]/.test(character)) { push(); unsupported = true; segments.push([]); }
    else { if (/[$`%\\*?{}()\[\]^@~!,]/.test(character)) dynamic = true; value += character; started = true; }
  }
  push();
  return { segments, unsupported: unsupported || Boolean(quote) };
}

function executable(token) {
  const unescaped = token?.value.replace(/[`^\\]/g, '').toLowerCase().replace(/\.(?:exe|cmd|bat)$/, '');
  if (['gh', 'git', 'env', 'command', 'sudo', 'exec', '&', 'bash', 'sh', 'pwsh', 'powershell', 'cmd'].includes(unescaped)) return unescaped;
  return token?.value.split(/[\\/]/).at(-1).toLowerCase().replace(/[`^]/g, '').replace(/\.(?:exe|cmd|bat)$/, '') ?? '';
}

const gitGlobalFlags = new Set(['--no-pager', '-P', '--paginate', '-p', '--no-optional-locks', '--literal-pathspecs', '--glob-pathspecs', '--noglob-pathspecs', '--icase-pathspecs', '--no-replace-objects', '--no-lazy-fetch', '--no-advice']);
const gitGlobalValues = new Set(['-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env', '--attr-source']);
const gitActions = new Set(['commit', 'branch', 'switch', 'checkout']);
function gitInvocation(words) {
  const directories = [];
  let unsupported = false;
  while (words[0]?.startsWith('-')) {
    const option = words[0];
    if (['--help', '-h', '--version', '-v', '--html-path', '--man-path', '--info-path'].includes(option)) return { words: [], directories, query: true, unsupported };
    if (gitGlobalFlags.has(option)) { words = words.slice(1); continue; }
    if (option === '-C') {
      if (words[1] === undefined) return { words: [], directories, unsupported: true };
      directories.push(words[1]); words = words.slice(2); continue;
    }
    if (gitGlobalValues.has(option)) { unsupported = true; words = words.slice(2); continue; }
    if (/^--(?:git-dir|work-tree|namespace|super-prefix|config-env|attr-source|exec-path)=/.test(option) || option === '--bare' || option === '--exec-path') {
      unsupported = true; words = words.slice(1); continue;
    }
    // An identifiable governed action behind another global spelling still needs inspection.
    const action = words.findIndex(word => gitActions.has(word));
    return { words: action < 0 ? [] : words.slice(action), directories, unsupported: true };
  }
  return { words, directories, unsupported };
}

function branchQuery(arguments_) {
  const end = arguments_.indexOf('--');
  return arguments_.slice(0, end < 0 ? arguments_.length : end).some(value =>
    ['--list', '--show-current', '-a', '--all', '-r', '--remotes', '-d', '-D', '--delete', '--contains', '--merged', '--no-merged'].includes(value)
    || /^--(?:list|contains|merged|no-merged)=/.test(value));
}

function branchCreation(arguments_) {
  const end = arguments_.indexOf('--');
  return arguments_.slice(0, end < 0 ? arguments_.length : end).some(value => {
    // Git accepts unique long option prefixes and clusters of short options.
    // Recognize their possible effect here; only exact supported forms are parsed below.
    if (/^--[^=]+/.test(value)) {
      const option = value.split('=', 1)[0];
      return ['--create', '--force-create', '--orphan'].some(name => name.startsWith(option));
    }
    return /^-[^-]*[bBcC]/.test(value);
  });
}

function helpOption(arguments_, values = []) {
  for (let index = 0; index < arguments_.length; index++) {
    const option = arguments_[index];
    if (option === '--') return false;
    const equal = option.indexOf('=');
    if (values.includes(equal < 0 ? option : option.slice(0, equal))) { if (equal < 0) index++; continue; }
    if (option === '--help' || option === '-h') return true;
  }
  return false;
}

function mutation(tokens, depth = 0) {
  if (depth > 3 || !tokens.length) return false;
  const name = executable(tokens[0]);
  let words = tokens.slice(1).map(item => item.value.replace(/[`^\\]/g, ''));
  if (name === 'gh') {
    if (words[0]?.startsWith('-')) {
      const start = words.findIndex(word => ['repo', 'pr', 'api'].includes(word));
      if (start >= 0) words = words.slice(start);
    }
    return (words[0] === 'repo' && ['create', 'rename', 'edit'].includes(words[1]))
      || (words[0] === 'pr' && ['create', 'new', 'edit', 'merge', 'ready'].includes(words[1]))
      || (words[0] === 'api' && words.some(value => /^(?:(?:--method=|-X=?)?(?:POST|PATCH|PUT|DELETE))$/i.test(value)
        || /^-[fF]|^--(?:field|raw-field|input)(?:=|$)/.test(value)));
  }
  if (name === 'git') {
    const [action, ...arguments_] = gitInvocation(words).words;
    return action === 'commit'
      || (action === 'branch' && !branchQuery(arguments_) && arguments_.length > 0)
      || (['switch', 'checkout'].includes(action) && branchCreation(arguments_));
  }
  if (['env', 'command', 'sudo', 'exec', '&'].includes(name)) return mutation(tokens.slice(1).filter(item => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(item.value)), depth + 1);
  if (['bash', 'sh', 'pwsh', 'powershell', 'cmd'].includes(name)) {
    const selector = tokens.findIndex(item => /^-(?:c|command)$|^\/c$/i.test(item.value));
    if (selector >= 0 && tokens[selector + 1]) return tokenize(tokens[selector + 1].value).segments.some(segment => mutation(segment, depth + 1));
  }
  return false;
}

function parseOptions(tokens, { flags = [], values = [], repeat = [], optionAliases = aliases, allowDashValues = false } = {}) {
  const result = { positional: [], options: new Map() };
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === '--') { result.positional.push(...tokens.slice(index + 1)); break; }
    if (!token.startsWith('-')) { result.positional.push(token); continue; }
    const equal = token.indexOf('=');
    const raw = equal < 0 ? token : token.slice(0, equal);
    const key = optionAliases[raw] ?? raw;
    if (result.options.has(key) && !repeat.includes(key)) return undefined;
    if (flags.includes(raw) || flags.includes(key)) {
      if (equal >= 0) return undefined;
      result.options.set(key, true);
    } else if (values.includes(raw) || values.includes(key)) {
      const value = equal < 0 ? tokens[++index] : token.slice(equal + 1);
      if (value === undefined || !allowDashValues && value.startsWith('-')) return undefined;
      const existing = result.options.get(key);
      result.options.set(key, repeat.includes(key) ? [...(existing ?? []), value] : value);
    } else return undefined;
  }
  return result;
}

function prIdentity(repository, number) {
  return typeof repository === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repository)
    && !['.', '..'].includes(repository.split('/')[1]) && Number.isSafeInteger(number) && number > 0;
}

const creationLookupFailure = 'Read-only PR creation ref lookup failed or timed out, or returned mismatched repository/ref commit data. Verify GitHub CLI access and retry.';
const retargetLookupFailure = 'Read-only PR target branch lookup failed or timed out, or returned mismatched repository/ref commit data. Verify the target branch and GitHub CLI access.';
const refPath = ref => ref.slice('refs/'.length).split('/').map(encodeURIComponent).join('/');
const branchName = value => typeof value === 'string' && value.length > 0 && !value.startsWith('-');

async function queryPrRef(repository, ref) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/debug|trace|^NODE_OPTIONS$/i.test(key)));
  const { stdout } = await execute('gh', ['api', '--method', 'GET', 'repos/' + repository + '/git/ref/' + refPath(ref)], {
    encoding: 'utf8', timeout: 4000, windowsHide: true, shell: false, maxBuffer: 4 * 1024 * 1024,
    env: { ...env, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat' }
  });
  return JSON.parse(stdout);
}

async function queryPrCreationRefs(repository, headRef, baseRef) {
  const results = await Promise.allSettled([headRef, baseRef].map(ref => queryPrRef(repository, ref)));
  if (results.some(result => result.status !== 'fulfilled')) throw new Error(creationLookupFailure);
  return { head: results[0].value, base: results[1].value };
}

async function queryDefaultBranch(repository) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/debug|trace|^NODE_OPTIONS$/i.test(key)));
  const { stdout } = await execute('gh', ['repo', 'view', repository, '--json', 'nameWithOwner,defaultBranchRef'], {
    encoding: 'utf8', timeout: 4000, windowsHide: true, shell: false, maxBuffer: 64 * 1024,
    env: { ...env, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat' }
  });
  return JSON.parse(stdout);
}

function checkPrRefFormat(ref) {
  return execute('git', ['check-ref-format', ref], {
    encoding: 'utf8', timeout: 4000, windowsHide: true, shell: false, maxBuffer: 64 * 1024, env: nativeGitEnvironment()
  });
}

function refCommit(value, repository, ref) {
  const prefix = '/repos/' + repository;
  const matches = (value, suffix) => {
    if (typeof value !== 'string' || /[\\?#]/.test(value)) return false;
    try {
      const url = new URL(value), pathname = decodeURIComponent(url.pathname);
      return url.origin === 'https://api.github.com' && !url.username && !url.password && url.href === value
        && pathname.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase() && pathname.slice(prefix.length) === suffix;
    } catch { return false; }
  };
  return value && typeof value === 'object' && !Array.isArray(value) && value.ref === ref
    && matches(value.url, '/git/refs/' + ref.slice('refs/'.length))
    && value.object && typeof value.object === 'object' && !Array.isArray(value.object)
    && value.object.type === 'commit' && typeof value.object.sha === 'string' && oidPattern.test(value.object.sha)
    && matches(value.object.url, '/git/commits/' + value.object.sha);
}

function githubWorktree(cwd, gitEnvironment) {
  return async args => (await execute('git', ['-c','core.fsmonitor=false',...args], {
    cwd: cwd ?? process.cwd(), encoding: 'utf8', windowsHide: true, timeout: 2000, maxBuffer: 64 * 1024,
    env: gitEnvironment
  })).stdout.trim();
}

async function matchingGithubOrigin(gitRead, repository) {
  const localRoot = await gitRead(['rev-parse','--show-toplevel']);
  const origin = await gitRead(['remote','get-url','origin']);
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^\s?#]+?)(?:\.git)?\/?$/i.exec(origin);
  if (!match || match[1].toLowerCase() !== repository.toLowerCase()) throw Error('origin differs');
  return localRoot;
}

async function remoteFileCall(action, input, context, options) {
  const operation = action === 'create_file' ? 'create' : 'update';
  const allowed = ['repository_full_name','path','content','message','branch',...(operation === 'update' ? ['sha'] : [])];
  const repository = input.repository_full_name;
  if (Object.keys(input).some(key => !allowed.includes(key)) || !prIdentity(repository, 1)
      || ['content','message'].some(key => typeof input[key] !== 'string' || input[key].includes('\0'))
      || operation === 'update' && (typeof input.sha !== 'string' || !oidPattern.test(input.sha)))
    return missing('Direct file publication requires an exact repository, path, content and commit message, plus the current blob SHA for an update.');
  let path;
  try { path = relativeName(input.path); }
  catch { return missing('Direct file publication requires one portable repository-relative path.'); }
  if (process.env.GH_HOST && process.env.GH_HOST.toLowerCase() !== 'github.com') return missing('Direct file publication inspection supports only github.com.');
  const gitEnvironment = nativeGitEnvironment();
  const gitRead = githubWorktree(context.repository, gitEnvironment);
  let localRoot, revision;
  try {
    localRoot = await matchingGithubOrigin(gitRead, repository);
    let branch = input.branch;
    if (branch === undefined || branch === null) {
      const current = await (options.queryDefaultBranch ?? queryDefaultBranch)(repository);
      if (current?.nameWithOwner?.toLowerCase() !== repository.toLowerCase()) throw Error('repository differs');
      branch = current?.defaultBranchRef?.name;
    }
    if (!branchName(branch)) throw Error('invalid branch');
    const ref = 'refs/heads/' + branch;
    await checkPrRefFormat(ref);
    const current = await (options.queryPrRef ?? queryPrRef)(repository, ref);
    if (!refCommit(current, repository, ref)) throw Error('ref differs');
    revision = current.object.sha;
    if (await gitRead(['rev-parse','--verify',revision+'^{commit}']) !== revision) throw Error('commit unavailable');
  } catch { return missing('Direct file publication inspection requires a matching local origin and the current remote target branch commit available locally.'); }

  const published = {
    context: { ...context, repository: localRoot }, gitEnvironment,
    remoteFile: { revision, operation, ...(input.sha ? { expectedBlob: input.sha } : {}) }
  };
  const checks = [
    { ...textCheck('commit-message', input.message), context: published.context },
    { ...published, check: 'file-scope', sources: [{ kind: 'file', path }] }
  ];
  if (readmePath(path)) checks.push({ ...published, check: 'readme', sources: [{ kind: 'text', path, text: input.content }] });
  return candidate(checks);
}

async function prCreation(repository, head, base, metadata, options) {
  if (process.env.GH_HOST && process.env.GH_HOST.toLowerCase() !== 'github.com') return missing('PR creation inspection supports only github.com.');
  if (!prIdentity(repository, 1) || !branchName(head) || !branchName(base))
    return missing('PR creation inspection requires an explicit owner/repo and same-repository head/base branch names.');
  if (['title', 'body'].some(key => typeof metadata[key] !== 'string' || metadata[key].includes('\0')) || typeof metadata.draft !== 'boolean')
    return missing('Provide explicit string title/body candidates and an optional boolean draft stage.');
  const headRef = 'refs/heads/' + head, baseRef = 'refs/heads/' + base;
  try {
    await Promise.all([headRef, baseRef].map(checkPrRefFormat));
  } catch { return missing('PR creation inspection requires valid same-repository Git branch refs.'); }
  let refs;
  try { refs = await (options.queryPrCreationRefs ?? queryPrCreationRefs)(repository, headRef, baseRef); }
  catch { return missing(creationLookupFailure); }
  if (!refs || typeof refs !== 'object' || Array.isArray(refs)
      || !refCommit(refs.head, repository, headRef) || !refCommit(refs.base, repository, baseRef)) return missing(creationLookupFailure);
  return candidate([{ check: 'pull-request', sources: [{ kind: 'pr-create', repository, headRef, baseRef,
    headOid: refs.head.object.sha, baseOid: refs.base.object.sha, ...metadata }] }]);
}

async function queryPullRequest(repository, number, retarget) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/debug|trace|^NODE_OPTIONS$/i.test(key)));
  const fields = 'number,headRefOid,baseRefOid,title,body,url' + (retarget ? ',state,isCrossRepository,headRefName,baseRefName' : '');
  const { stdout } = await execute('gh', ['pr', 'view', String(number), '--repo', repository, '--json', fields], {
    encoding: 'utf8', timeout: 4000, windowsHide: true, maxBuffer: 4 * 1024 * 1024,
    env: { ...env, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat' }
  });
  return JSON.parse(stdout);
}

async function prMetadata(repository, number, changes, options) {
  if (process.env.GH_HOST && process.env.GH_HOST.toLowerCase() !== 'github.com') return missing('PR metadata inspection supports only github.com.');
  if (!prIdentity(repository, number)) return missing('PR metadata inspection requires an explicit owner/repo and positive PR number.');
  if (!Object.keys(changes).length || Object.values(changes).some(value => typeof value !== 'string' || value.includes('\0'))) return missing('Provide explicit string PR title, body, or target branch candidates.');
  const retarget = Object.hasOwn(changes, 'base');
  const targetRef = retarget ? 'refs/heads/' + changes.base : null;
  if (retarget) {
    if (!branchName(changes.base)) return missing('PR retargeting requires an explicit same-repository branch name.');
    try { await checkPrRefFormat(targetRef); }
    catch { return missing('PR retargeting requires a valid same-repository Git branch ref.'); }
  }
  let current;
  try { current = await (options.queryPullRequest ?? queryPullRequest)(repository, number, retarget); }
  catch { return missing('Read-only PR lookup failed or timed out. Verify GitHub CLI access and retry.'); }
  if (!current || typeof current !== 'object' || Array.isArray(current)
      || current.number !== number || typeof current.title !== 'string' || typeof current.body !== 'string'
      || current.title.includes('\0') || current.body.includes('\0')
      || typeof current.headRefOid !== 'string' || !oidPattern.test(current.headRefOid)
      || typeof current.baseRefOid !== 'string' || !oidPattern.test(current.baseRefOid)
      || typeof current.url !== 'string'
      || current.url.toLowerCase() !== ('https://github.com/' + repository + '/pull/' + number).toLowerCase()) {
    return missing('Read-only PR lookup must return the requested GitHub URL, number, full headOid/baseOid and string title/body.');
  }
  let baseOid = current.baseRefOid;
  if (retarget) {
    if (current.state !== 'OPEN' || current.isCrossRepository !== false
        || !branchName(current.headRefName) || !branchName(current.baseRefName) || current.headRefName === changes.base) {
      return missing('PR retargeting requires an open same-repository PR and a target branch different from its head.');
    }
    let target;
    try { target = await (options.queryPrRef ?? queryPrRef)(repository, targetRef); }
    catch { return missing(retargetLookupFailure); }
    if (!refCommit(target, repository, targetRef)) return missing(retargetLookupFailure);
    baseOid = target.object.sha;
  }
  return candidate([{ check: 'pull-request', sources: [{ kind: 'pr', number,
    headOid: current.headRefOid, baseOid,
    title: Object.hasOwn(changes, 'title') ? changes.title : current.title,
    body: Object.hasOwn(changes, 'body') ? changes.body : current.body
  }] }]);
}

async function prEdit(arguments_, context, options) {
  const parsed = parseOptions(arguments_, {
    flags: ['--help', '-h'], values: ['--repo', '--title', '--body', '--body-file', '--base'], allowDashValues: true,
    optionAliases: { '-R': '--repo', '-t': '--title', '-b': '--body', '-F': '--body-file', '-B': '--base' }
  });
  if (parsed?.options.has('--help') || parsed?.options.has('-h')) return skip();
  if (!parsed || parsed.positional.length !== 1 || !/^[1-9][0-9]*$/.test(parsed.positional[0])
      || parsed.options.has('--body') && parsed.options.has('--body-file')) return missing('PR edit requires one literal number and unique repository, title, body, and base options.');
  const repository = parsed.options.get('--repo');
  const number = Number(parsed.positional[0]);
  if (!prIdentity(repository, number)) return missing('PR metadata inspection requires an explicit owner/repo and positive PR number.');
  const changes = {};
  for (const field of ['title', 'body', 'base']) if (parsed.options.has('--' + field)) changes[field] = parsed.options.get('--' + field);
  if (parsed.options.has('--body-file')) {
    const body = await prBodyFile(parsed.options.get('--body-file'), context);
    if (body.kind === 'missing') return body;
    changes.body = body.text;
  }
  return prMetadata(repository, number, changes, options);
}

async function prBodyFile(path, context) {
  if (!path || path === '-') return missing('PR body-file must identify a readable UTF-8 regular file.');
  let file;
  try {
    const absolute = resolve(context.repository ?? process.cwd(), path);
    if (!(await lstat(absolute)).isFile()) return missing('PR body-file must identify a readable UTF-8 regular file.');
    file = await open(absolute, 'r');
    if (!(await file.stat()).isFile()) return missing('PR body-file must identify a readable UTF-8 regular file.');
    return { kind: 'content', text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.readFile()) };
  } catch { return missing('PR body-file must identify a readable UTF-8 regular file.'); }
  finally { await file?.close(); }
}

async function prCreate(arguments_, context, options) {
  const parsed = parseOptions(arguments_, {
    flags: ['--help', '-h', '--draft'], values: ['--repo', '--head', '--base', '--title', '--body', '--body-file'], allowDashValues: true,
    optionAliases: { '-R': '--repo', '-H': '--head', '-B': '--base', '-t': '--title', '-b': '--body', '-F': '--body-file', '-d': '--draft' }
  });
  if (parsed?.options.has('--help') || parsed?.options.has('-h')) return skip();
  if (!parsed || parsed.positional.length || ['--repo', '--head', '--base', '--title'].some(key => !parsed.options.has(key))
      || parsed.options.has('--body') === parsed.options.has('--body-file'))
    return missing('PR creation requires unique explicit repo/head/base/title options and exactly one body or body-file.');
  let body = parsed.options.get('--body');
  if (parsed.options.has('--body-file')) {
    const file = await prBodyFile(parsed.options.get('--body-file'), context);
    if (file.kind === 'missing') return file;
    body = file.text;
  }
  return prCreation(parsed.options.get('--repo'), parsed.options.get('--head'), parsed.options.get('--base'), {
    title: parsed.options.get('--title'), body, draft: parsed.options.has('--draft')
  }, options);
}

async function nativePrCreate(input, options) {
  const allowed = ['repository_full_name', 'head', 'head_branch', 'base', 'base_branch', 'title', 'body', 'draft', 'issue', 'head_repo', 'maintainer_can_modify'];
  if (Object.keys(input).some(key => !allowed.includes(key))
      || ['issue', 'head_repo', 'maintainer_can_modify'].some(key => input[key] != null)
      || ['head', 'base'].some(key => input[key] != null && input[key + '_branch'] != null))
    return missing('Native PR creation supports unambiguous same-repository head/base aliases, title/body and optional draft only.');
  return prCreation(input.repository_full_name, input.head ?? input.head_branch, input.base ?? input.base_branch, {
    title: input.title, body: input.body, draft: Object.hasOwn(input, 'draft') ? input.draft : false
  }, options);
}

async function nativePrEdit(input, options) {
  let repository, number, identityFields;
  if (Object.hasOwn(input, 'repository_full_name') || Object.hasOwn(input, 'pr_number')) {
    repository = input.repository_full_name; number = input.pr_number;
    identityFields = ['repository_full_name', 'pr_number'];
  } else {
    repository = typeof input.owner === 'string' && typeof input.repo === 'string' ? input.owner + '/' + input.repo : undefined;
    const numberField = Object.hasOwn(input, 'pullNumber') ? 'pullNumber' : 'pull_number';
    number = input[numberField]; identityFields = ['owner', 'repo', numberField];
  }
  if (Object.keys(input).some(key => ![...identityFields, 'title', 'body', 'base', 'base_branch'].includes(key))
      || Object.hasOwn(input, 'base') && Object.hasOwn(input, 'base_branch')) {
    return missing('Native PR inspection supports title, body, and one target branch field with explicit repository and number.');
  }
  const changes = {};
  for (const field of ['title', 'body']) if (Object.hasOwn(input, field)) changes[field] = input[field];
  if (Object.hasOwn(input, 'base')) changes.base = input.base;
  if (Object.hasOwn(input, 'base_branch')) changes.base = input.base_branch;
  return prMetadata(repository, number, changes, options);
}

async function queryMergePullRequest(repository, number) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/debug|trace|^NODE_OPTIONS$/i.test(key)));
  const { stdout } = await execute('gh', ['pr', 'view', String(number), '--repo', repository, '--json',
    'number,headRefOid,baseRefOid,title,body,url,state,isDraft,isCrossRepository,mergeable,mergeStateStatus,statusCheckRollup,reviewDecision'], {
    encoding: 'utf8', timeout: 4000, windowsHide: true, maxBuffer: 4 * 1024 * 1024,
    env: { ...env, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat' }
  });
  return JSON.parse(stdout);
}

function successfulStatus(check) {
  return check && typeof check === 'object' && !Array.isArray(check)
    && (check.__typename === 'CheckRun' && check.status === 'COMPLETED' && ['SUCCESS','NEUTRAL','SKIPPED'].includes(check.conclusion)
      || check.__typename === 'StatusContext' && check.state === 'SUCCESS');
}

async function prMerge(input, context, options) {
  const allowed = ['repository_full_name','pr_number','merge_method','expected_head_sha','commit_title','commit_message'];
  if (Object.keys(input).some(key => !allowed.includes(key)) || !prIdentity(input.repository_full_name, input.pr_number)
      || input.merge_method !== 'squash' || typeof input.expected_head_sha !== 'string' || !oidPattern.test(input.expected_head_sha)
      || ['commit_title','commit_message'].some(key => typeof input[key] !== 'string' || input[key].includes('\0')))
    return missing('Squash merge requires an explicit repository, PR number, full expected head and final commit title/body, with no additional mutation options.');
  if (process.env.GH_HOST && process.env.GH_HOST.toLowerCase() !== 'github.com') return missing('Merge inspection supports only github.com.');
  const repository = input.repository_full_name, number = input.pr_number;
  let current;
  try { current = await (options.queryMergePullRequest ?? queryMergePullRequest)(repository, number); }
  catch { return missing('Read-only merge PR lookup failed or timed out. Verify access and retry.'); }
  if (!current || typeof current !== 'object' || Array.isArray(current) || current.number !== number
      || typeof current.url !== 'string' || current.url.toLowerCase() !== ('https://github.com/' + repository + '/pull/' + number).toLowerCase()
      || ['title','body'].some(key => typeof current[key] !== 'string' || current[key].includes('\0'))
      || current.headRefOid !== input.expected_head_sha || typeof current.baseRefOid !== 'string' || !oidPattern.test(current.baseRefOid)
      || current.state !== 'OPEN' || current.isDraft !== false || current.isCrossRepository !== false
      || current.mergeable !== 'MERGEABLE' || current.mergeStateStatus !== 'CLEAN'
      || !['','APPROVED'].includes(current.reviewDecision) || !Array.isArray(current.statusCheckRollup)
      || !current.statusCheckRollup.every(successfulStatus))
    return missing('The queried PR must match the expected head and repository and be an open, non-draft, same-repository, clean merge candidate with no pending/failed checks or outstanding review requirement.');
  let localRoot;
  const gitEnvironment = nativeGitEnvironment();
  const gitRead = githubWorktree(context.repository, gitEnvironment);
  try {
    localRoot = await matchingGithubOrigin(gitRead, repository);
    for (const oid of [current.headRefOid,current.baseRefOid]) if (await gitRead(['rev-parse','--verify',oid+'^{commit}']) !== oid) throw Error('commit unavailable');
    await gitRead(['merge-base','--is-ancestor',current.baseRefOid,current.headRefOid]);
  } catch { return missing('Merge file inspection requires the matching local origin, both actual commit objects, and the queried base as an ancestor of the head. No fetch or merge is performed by the inspector.'); }
  return candidate([
    { check:'pull-request',sources:[{kind:'pr',number,headOid:current.headRefOid,baseOid:current.baseRefOid,title:current.title,body:current.body}] },
    textCheck('commit-message',input.commit_title+'\n\n'+input.commit_message),
    { check:'file-scope',sources:[{kind:'revision',revision:current.headRefOid}],context:{repository:localRoot,baseRef:current.baseRefOid},gitEnvironment }
  ]);
}

async function cliPrMerge(arguments_, context, options) {
  const parsed = parseOptions(arguments_, { flags:['--help','-h','--squash'], values:['--repo','--match-head-commit','--subject','--body','--body-file'],
    optionAliases:{'-R':'--repo','-s':'--squash','-t':'--subject','-b':'--body','-F':'--body-file'},allowDashValues:true });
  if (parsed?.options.has('--help') || parsed?.options.has('-h')) return skip();
  if (!parsed || parsed.positional.length !== 1 || !/^[1-9][0-9]*$/.test(parsed.positional[0]) || !parsed.options.has('--squash')
      || parsed.options.has('--body') === parsed.options.has('--body-file')) return missing('Use one explicit squash PR number, repository, expected head and final subject with body or body-file; automatic/admin/rebase/branch deletion modes are outside coverage.');
  let body = parsed.options.get('--body');
  if (parsed.options.has('--body-file')) {
    const file = await prBodyFile(parsed.options.get('--body-file'), context);
    if (file.kind === 'missing') return file;
    body = file.text;
  }
  return prMerge({repository_full_name:parsed.options.get('--repo'),pr_number:Number(parsed.positional[0]),merge_method:'squash',
    expected_head_sha:parsed.options.get('--match-head-commit'),commit_title:parsed.options.get('--subject'),commit_message:body},context,options);
}

async function ghCall(words, context, options) {
  const [group, action, ...arguments_] = words;
  if (group === 'pr' && action === 'edit') return prEdit(arguments_, context, options);
  if (group === 'pr' && ['create', 'new'].includes(action)) return prCreate(arguments_, context, options);
  if (group === 'pr' && action === 'merge') return cliPrMerge(arguments_, context, options);
  if (group === 'repo' && action === 'rename') {
    const parsed = parseOptions(arguments_, { flags: ['--yes', '-y', '--help', '-h'], values: ['--repo', '-R'], allowDashValues: true });
    if (parsed?.options.has('--help') || parsed?.options.has('-h')) return skip();
    if (!parsed || parsed.positional.length !== 1) return missing('Provide one literal new repository name and supported rename options.');
    return candidate([textCheck('name', parsed.positional[0])]);
  }
  if (group === 'repo' && ['create', 'edit'].includes(action)) {
    const parsed = parseOptions(arguments_, {
      flags: ['--help', '-h', '--private', '--public', '--internal', '--clone', '--add-readme', '--disable-issues', '--disable-wiki', '--include-all-branches', '--enable-issues', '--enable-wiki', '--accept-visibility-change-consequences'],
      values: ['--description', '--homepage', '--team', '--source', '--remote', '--gitignore', '--license', '--template', '--repo', '--visibility', '--default-branch', '-d', '-R'],
      allowDashValues: true
    });
    if (parsed?.options.has('--help') || parsed?.options.has('-h')) return skip();
    if (!parsed || parsed.positional.length > 1) return missing('Repository mutation has unknown, duplicate, or ambiguous inputs.');
    const checks = [];
    if (action === 'create') {
      if (parsed.positional.length !== 1) return missing('Repository creation requires one literal name.');
      const qualified = /^(?:[^/\s]+\/)?([^/\s]*)$/.exec(parsed.positional[0]);
      if (!qualified) return missing('Provide a name or owner/name as one literal candidate.');
      checks.push(textCheck('name', qualified[1]));
    }
    if (parsed.options.has('--description')) checks.push(textCheck('description', parsed.options.get('--description')));
    return checks.length ? candidate(checks) : skip();
  }
  if (group === 'pr' && action === 'ready') return missing('This PR mutation needs context beyond title/body metadata and queried headOid/baseOid.');
  if (group === 'api' && mutation([{ value: 'gh' }, ...words.map(value => ({ value }))])) return missing('Generic GitHub API mutations are not translated into complete governance candidates. Use a supported literal operation or supply the actual candidate to the checker.');
  return skip();
}

async function commitCleanup(parsed, repository) {
  if (parsed.options.has('--cleanup')) return parsed.options.get('--cleanup');
  try {
    const { stdout } = await execute('git', ['-C', repository ?? process.cwd(), '-c', 'core.fsmonitor=false', 'config', '--null', '--get', 'commit.cleanup'], {
      encoding: 'utf8', windowsHide: true, timeout: 4000, maxBuffer: 64 * 1024,
      env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: '', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1' }
    });
    return stdout.endsWith('\0') ? stdout.slice(0, -1) : undefined;
  } catch (error) {
    if (error.code === 1 && !error.stdout && !error.stderr) return 'default';
    return undefined;
  }
}

async function gitCall(words, context) {
  let repository = context.repository;
  const invocation = gitInvocation(words);
  if (invocation.query) return skip();
  if (invocation.unsupported) return missing('Unsupported global Git options cannot establish the exact repository and governance candidate.');
  for (const directory of invocation.directories) repository = resolve(repository ?? process.cwd(), directory);
  const [action, ...arguments_] = invocation.words;
  const localContext = repository ? { repository } : {};
  if (action === 'commit') {
    const parsed = parseOptions(arguments_, {
      flags: ['--help', '-h', '--amend', '--no-edit', '--allow-empty', '--allow-empty-message', '--signoff', '-s', '--no-verify', '-n', '--quiet', '-q', '--verbose', '-v', '--no-gpg-sign'],
      values: ['--message', '-m', '--file', '-F', '--author', '--date', '--cleanup'], repeat: ['--message'], allowDashValues: true
    });
    if (parsed?.options.has('--help') || parsed?.options.has('-h')) return skip();
    if (!parsed || parsed.positional.length || parsed.options.has('--no-verify') || parsed.options.has('-n')) return missing('Stage the intended files first and commit with a literal message and supported options so the agent can inspect the actual index.');
    if (!['default', 'whitespace', 'verbatim'].includes(await commitCleanup(parsed, repository)))
      return missing('The effective commit cleanup mode can change the inspected message or could not be read. Use --cleanup=whitespace or --cleanup=verbatim with an explicit message.');
    let message;
    if (parsed.options.has('--message') && !parsed.options.has('--file')) message = { kind: 'text', text: parsed.options.get('--message').join('\n\n') };
    else if (parsed.options.has('--file') && !parsed.options.has('--message') && parsed.options.get('--file') !== '-') message = { kind: 'file', path: resolve(repository ?? process.cwd(), parsed.options.get('--file')) };
    else if (parsed.options.has('--amend') && parsed.options.has('--no-edit') && repository) {
      const { stdout } = await execute('git', ['-C', repository, '-c', 'core.fsmonitor=false', 'log', '-1', '--format=%B', 'HEAD'], {
        windowsHide: true, maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: '', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1' }
      });
      message = { kind: 'text', text: stdout };
    } else return missing('An actual literal commit message or readable --file is required before this call.');
    const staged = {
      sources: [{ kind: 'index' }], context: localContext,
      indexComparison: parsed.options.has('--amend') ? 'amend' : 'head'
    };
    return candidate([
      { check: 'commit-message', sources: [message], context: localContext },
      { ...staged, check: 'file-scope' },
      { ...staged, check: 'readme' }
    ]);
  }
  let branch, baseRef;
  if (action === 'branch') {
    if (branchQuery(arguments_) || !arguments_.length || helpOption(arguments_)) return skip();
    if (['-m', '-M', '--move'].includes(arguments_[0])) {
      if (![2, 3].includes(arguments_.length)) return missing('Provide literal old/new branch names for rename.');
      branch = arguments_.at(-1);
    } else {
      const parsed = parseOptions(arguments_, { flags: ['--force', '-f', '--no-track', '--track'] });
      if (!parsed || ![1, 2].includes(parsed.positional.length)) return missing('Provide a literal branch name and optional start ref.');
      [branch, baseRef] = parsed.positional;
    }
  } else if (['switch', 'checkout'].includes(action)) {
    if (helpOption(arguments_, ['-b', '-B', '-c', '-C', '--create', '--force-create', '--orphan'])) return skip();
    if (!branchCreation(arguments_)) return skip();
    const attached = /^(--(?:create|force-create|orphan))=(.*)$|^(-[bBcC])(.+)$/.exec(arguments_[0]);
    const normalized = attached ? [attached[1] ?? attached[3], attached[2] ?? attached[4], ...arguments_.slice(1)] : arguments_;
    if (!['-b', '-B', '-c', '-C', '--create', '--force-create'].includes(normalized[0]) || ![2, 3].includes(normalized.length)) return missing('Only literal branch creation with an optional start ref is supported.');
    [, branch, baseRef] = normalized;
  } else return mutation([{ value: 'git' }, ...words.map(value => ({ value }))]) ? missing('Unsupported Git mutation shape cannot establish a complete candidate.') : skip();
  return candidate([{ ...textCheck('branch', branch), context: { ...localContext, baseRef: baseRef ?? 'HEAD' } }]);
}

async function shellCall(command, context, options) {
  const parsed = tokenize(command);
  const active = parsed.segments.filter(segment => segment.length);
  const known = active.some(segment => mutation(segment));
  if (!known) return skip(parsed.unsupported ? 'unsupported-command-shape' : 'not-applicable');
  if (parsed.unsupported || active.length !== 1 || active[0].some(token => token.dynamic)) return missing('Known governance mutation uses compound, redirected, expanded, or incomplete shell input. Provide a single literal operation with its complete candidate.');
  const tokens = active[0];
  if (executable(tokens[0]) === 'gh') return tokens[1]?.value.startsWith('-')
    ? missing('Unsupported global gh options cannot establish the exact governance mutation.')
    : ghCall(tokens.slice(1).map(token => token.value), context, options);
  if (executable(tokens[0]) === 'git') return gitCall(tokens.slice(1).map(token => token.value), context);
  return missing('Wrapped governance mutation cannot be fully interpreted by this adapter.');
}

function within(root, path) {
  const name = relative(root, path);
  return name === '' || name !== '..' && !name.startsWith('..' + sep) && !isAbsolute(name);
}

async function prospectivePath(path) {
  let parent = path;
  const suffix = [];
  for (;;) {
    try { return resolve(await realpath(parent), ...suffix); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try {
        if ((await lstat(parent)).isSymbolicLink()) throw new TypeError('A dangling link cannot establish the write destination.');
      } catch (entryError) { if (entryError.code !== 'ENOENT') throw entryError; }
      const next = dirname(parent);
      if (next === parent) throw error;
      suffix.unshift(basename(parent));
      parent = next;
    }
  }
}

async function fileCall(paths, context) {
  if (!context.repository) return missing('A file mutation needs its actual repository/worktree context.');
  const gitEnvironment = nativeGitEnvironment();
  let root;
  try {
    const result = await execute('git', ['-C', context.repository, '-c', 'core.fsmonitor=false', 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 64 * 1024,
      env: gitEnvironment
    });
    root = await realpath(result.stdout.trim());
  } catch { return missing('Identify an existing product Git worktree before checking this file mutation.'); }
  const sources = [];
  for (const path of paths) {
    const actual = await prospectivePath(path);
    if (!within(root, path) && !within(root, actual)) continue;
    if (!within(root, path)) return missing('An external path alias enters the selected product; supply its actual product path.');
    sources.push({ kind: 'file', path });
  }
  if (!sources.length) return skip('outside-selected-product');
  return candidate([{ check: 'file-scope', sources, context: { ...context, repository: root }, gitEnvironment }]);
}

function patchCall(patch, context) {
  const lines = patch.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.shift() !== '*** Begin Patch' || lines.pop() !== '*** End Patch') return missing('A complete apply_patch envelope is required.');
  const touched = new Set();
  const targets = [];
  while (lines.length) {
    const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(lines.shift());
    if (!header) return missing('Unsupported apply_patch file header.');
    const [, operation, requestedPath] = header;
    const path = resolve(context.repository ?? process.cwd(), requestedPath);
    let destination = path;
    if (operation === 'Update' && lines[0]?.startsWith('*** Move to: ')) {
      const requestedDestination = lines.shift().slice(13);
      if (!requestedDestination) return missing('Move patch requires a destination path.');
      destination = resolve(context.repository ?? process.cwd(), requestedDestination);
    }
    for (const target of new Set([path, destination])) {
      const key = process.platform === 'win32' ? target.toLowerCase() : target;
      if (touched.has(key)) return missing('Repeated or dependent patch targets cannot establish one complete prospective candidate.');
      touched.add(key);
      targets.push(target);
    }
    const body = [];
    while (lines.length && !/^\*\*\* (?:Add|Update|Delete) File: /.test(lines[0])) body.push(lines.shift());
    if (operation === 'Delete') {
      if (body.length) return missing('Delete patch has an unexpected body.');
    } else if (operation === 'Add') {
      if (body.some(line => !line.startsWith('+'))) return missing('Add patch must contain literal added lines only.');
    } else {
      let inChunk = false;
      for (const line of body) {
        if (/^@@(?: .*)?$/.test(line)) inChunk = true;
        else if (!inChunk) return missing('Update patch needs an @@ chunk header.');
        else if (line === '*** End of File') inChunk = false;
        else if (!/^[ +\-]/.test(line)) return missing('Unsupported update patch content.');
      }
    }
  }
  return targets.length ? fileCall(targets, context) : missing('Patch has no actual file candidates.');
}

async function extract(toolName, input, options) {
  const name = toolName.toLowerCase();
  const shortName = name.split(/__|[.:]/).at(-1).replace(/^github_/, '');
  const repository = input.workdir ?? input.cwd ?? options.repository ?? options.cwd;
  if (repository !== undefined) string(repository, 'repository');
  const context = repository ? { repository: resolve(repository) } : {};
  if (shellTools.has(shortName)) return shellCall(string(shortName === 'exec_command' ? input.cmd : input.command, 'Shell command'), context, options);
  if (shortName === 'apply_patch') return patchCall(string(input.command ?? input.patch ?? input.input, 'Patch command'), context);
  if (['write', 'write_file', 'edit', 'edit_file'].includes(shortName)) {
    const path = resolve(context.repository ?? process.cwd(), string(input.file_path ?? input.path, 'file path'));
    if (['write', 'write_file'].includes(shortName)) string(input.content, 'file content');
    return fileCall([path], context);
  }
  if (/(?:^|__|[:.])github(?:__|[:.]|_)/.test(name)) {
    if (['create_repository', 'rename_repository', 'update_repository'].includes(shortName)) {
      const checks = [];
      const field = shortName === 'rename_repository' ? 'new_name' : 'name';
      if (Object.hasOwn(input, field)) checks.push(textCheck('name', string(input[field], field)));
      else if (shortName !== 'update_repository') return missing('An explicit ' + field + ' candidate is required.');
      if (Object.hasOwn(input, 'description')) checks.push(textCheck('description', string(input.description, 'description')));
      return checks.length ? candidate(checks) : skip();
    }
    if (shortName === 'update_pull_request') return nativePrEdit(input, options);
    if (shortName === 'create_pull_request') return nativePrCreate(input, options);
    if (shortName === 'merge_pull_request') return prMerge(input, context, options);
    if (remoteFileTools.has(shortName)) return remoteFileCall(shortName, input, context, options);
    if (rawRemoteFileTools.has(shortName)) return missing('This direct GitHub file or Git object mutation has no complete governance candidate. Use a staged commit or a supported direct file publication.');
    if (['convert_pull_request_to_draft', 'mark_pull_request_ready_for_review'].includes(shortName)) return missing('This native PR mutation needs context beyond title/body metadata and queried headOid/baseOid.');
  }
  return skip();
}

function scopeTargets(toolName, input, options) {
  const name = toolName.toLowerCase();
  const shortName = name.split(/__|[.:]/).at(-1).replace(/^github_/, '');
  const selected = input.workdir ?? input.cwd ?? options.repository ?? options.cwd ?? process.cwd();
  const repository = resolve(string(selected, 'repository'));
  if (shellTools.has(shortName)) {
    const command = string(shortName === 'exec_command' ? input.cmd : input.command, 'Shell command');
    const parsed = tokenize(command);
    const mutations = parsed.segments.filter(segment => mutation(segment));
    if (!mutations.length) return undefined;
    if (parsed.segments.filter(segment => segment.length).length === 1 && helpOption(mutations[0].slice(1).map(token => token.value),
      ['--repo','-R','--description','-d','--message','-m','--file','-F','--author','--date','--cleanup','--subject','--title','-t','--body','-b','--body-file','--head','-H','--base','-B','--match-head-commit'])) return undefined;
    const targets = [];
    const inspect = (tokens, base, depth = 0) => {
      if (depth > 3 || tokens.some(token => token.dynamic)) return false;
      const executableName = executable(tokens[0]);
      if (executableName === 'git') {
        const words = tokens.slice(1).map(token => token.value);
        // These selectors can point outside cwd without an inspectable worktree.
        if (words.some(value => /^--(?:git-dir|work-tree)(?:=|$)/.test(value) || value === '--bare')) return false;
        const invocation = gitInvocation(words);
        if (invocation.directories.some(directory => tokens.some(token => token.value === directory && token.dynamic))) return false;
        for (const directory of invocation.directories) base = resolve(base, directory);
        if (mutation(tokens)) targets.push(base);
        return true;
      }
      if (executableName === 'gh') {
        if (mutation(tokens)) targets.push(base);
        return true;
      }
      if (['env', 'command', 'sudo', 'exec', '&'].includes(executableName)) {
        const arguments_ = tokens.slice(1);
        const assignments = [];
        while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(arguments_[0]?.value ?? '')) assignments.push(arguments_.shift());
        if (assignments.some(token => /^GIT_/i.test(token.value))) return false;
        return inspect(arguments_, base, depth + 1);
      }
      if (['bash', 'sh', 'pwsh', 'powershell', 'cmd'].includes(executableName)) {
        const selector = tokens.findIndex(token => /^-(?:c|command)$|^\/c$/i.test(token.value));
        if (selector < 0 || !tokens[selector + 1] || tokens[selector + 1].dynamic) return false;
        const nested = tokenize(tokens[selector + 1].value);
        return nested.segments.filter(segment => segment.length).every(segment => inspect(segment, base, depth + 1));
      }
      return false;
    };
    // Every segment must preserve an inspectable cwd. An ignored block, condition
    // or expansion may redirect a later Git mutation into an adopted worktree.
    if (!parsed.segments.filter(segment => segment.length).every(tokens => inspect(tokens, repository))) return null;
    return [...new Set(targets)];
  }
  if (['apply_patch', 'write', 'write_file', 'edit', 'edit_file'].includes(shortName)) return [repository];
  if (/(?:^|__|[:.])github(?:__|[:.]|_)/.test(name)) {
    if (shortName === 'update_repository' && !['name', 'description'].some(key => Object.hasOwn(input, key))) return undefined;
    if (remoteFileTools.has(shortName) || rawRemoteFileTools.has(shortName)
      || ['create_repository', 'rename_repository', 'update_repository', 'update_pull_request', 'create_pull_request', 'merge_pull_request',
      'convert_pull_request_to_draft', 'mark_pull_request_ready_for_review'].includes(shortName)) return [repository];
  }
  return undefined;
}

/** Native decisions report mechanical coverage and never grant operational or semantic approval. */
export async function evaluateNativeCall(toolName, input, options = {}) {
  if (typeof toolName !== 'string' || !toolName.trim() || !input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Expected a nonempty tool name and object input');
  const base = { schemaVersion: 3, scope: 'none', checks: [], findings: [] };
  const targets = scopeTargets(toolName, input, options);
  let explicitProduct, explicitInspection = false;
  const scopes = new Map();
  const scopeAt = async (repository, gitEnvironment) => {
    const key = resolve(repository);
    if (!scopes.has(key)) scopes.set(key, await localNativeScope(key, gitEnvironment));
    return scopes.get(key);
  };
  const adoptionReport = () => explicitInspection ? [{source: 'explicit-input'}]
    : [...scopes].map(([repository, state]) => ({repository, source: state.adoption ?? 'none',
      ...(state.adoptionPath ? {adoptionPath: state.adoptionPath, productPath: state.productPath} : {})}));
  const adoptionFailure = error => ({ ...base, decision: 'needs-context', inspection: 'adoption-error',
    findings: [{ ruleId: 'ADAPTER', code: 'ADOPTION_INPUT', message: error.message, target: toolName }],
    coverage: 'Worktree adoption could not be established; this mutation is held.' });
  if (targets !== undefined) {
    const supplied = key => {
      const descriptor = Object.getOwnPropertyDescriptor(options, key);
      return !!descriptor && (typeof descriptor.get === 'function' || descriptor.value !== undefined);
    };
    // Query-only calls must not evaluate lazy bundle/product inputs.
    explicitInspection = supplied('bundlePath') || supplied('productPath') || process.env.REPO_GOVERNANCE_PRODUCT !== undefined;
    if (!explicitInspection && targets !== null) {
      try {
        const states = await Promise.all(targets.map(repository => scopeAt(repository)));
        if (states.length && states.every(state => !state.adopted))
          return { ...base, decision: 'allow', inspection: 'not-adopted', adoption: adoptionReport(), coverage: 'The selected worktree has not adopted these conventions. No governance candidate was inspected.' };
      } catch (error) { return adoptionFailure(error); }
    }
  }
  const selected = await extract(toolName, input, options);
  if (selected.kind === 'skip') return { ...base, decision: 'allow', inspection: selected.reason, coverage: 'No supported governance candidate inspected. Other effects and semantic judgments remain outside coverage.' };
  if (selected.kind === 'missing') return { ...base, decision: 'needs-context', inspection: 'missing-input', findings: [{ ruleId: 'ADAPTER', code: 'NATIVE_INPUT', message: selected.reason, target: toolName }], coverage: 'Known governance mutation was not completely inspected.' };
  const context = { bundlePath: options.bundlePath ?? bundlePath };
  explicitProduct = options.productPath !== undefined ? options.productPath : process.env.REPO_GOVERNANCE_PRODUCT;
  if (explicitProduct !== undefined) {
    if (!string(explicitProduct, 'product path').trim()) throw new TypeError('product path must be nonempty');
    context.productPath = resolve(explicitProduct);
  }
  const checks = [];
  const snapshotCache = new Map();
  let stagedFileCheck;
  for (const check of selected.checks) {
    const staged = check.sources[0].kind === 'index';
    if (staged && check.check === 'readme' && !stagedFileCheck?.observed.some(item => item.kind === 'blob' && readmePath(item.target))) continue;
    const checkContext = check.context ?? (targets?.length === 1 ? {repository: targets[0]} : {});
    const selectedContext = { ...context, ...checkContext };
    if (explicitProduct === undefined && checkContext.repository) {
      let state;
      try { state = await scopeAt(checkContext.repository, check.gitEnvironment); }
      catch (error) { return adoptionFailure(error); }
      if (!state.adopted && !explicitInspection) continue;
      if (state.adopted && state.productPath !== undefined) selectedContext.productPath = state.productPath;
    }
    const result = await runCheck(JSON.stringify({ schemaVersion: 3, operation: 'check', check: check.check, sources: check.sources, context: selectedContext }), [], {
      gitEnvironment: check.gitEnvironment, indexComparison: check.indexComparison,
      ...(staged || check.remoteFile ? { snapshotCache } : {}),
      ...(check.remoteFile ? { remoteFile: check.remoteFile } : {})
    });
    const response = JSON.parse(result.line);
    if (response.schemaVersion !== 3 || response.scope !== 'mechanical' || !['pass', 'violation', 'needs-context', 'error'].includes(response.decision) || !Array.isArray(response.findings) || !Array.isArray(response.semanticChecks)) throw new TypeError('Checker returned an invalid v3 mechanical response');
    const expectedCode = { pass: 0, violation: 2, 'needs-context': 3, error: 1 }[response.decision];
    if (result.exitCode !== expectedCode) throw new TypeError('Checker response and exit code disagree');
    checks.push(response);
    if (staged && check.check === 'file-scope') stagedFileCheck = response;
  }
  if (!checks.length) return { ...base, decision: 'allow', inspection: 'not-adopted', adoption: adoptionReport(), coverage: 'No selected candidate belongs to an adopted worktree. No governance candidate was inspected.' };
  const decision = checks.some(check => check.decision === 'violation') ? 'deny'
    : checks.some(check => check.decision === 'error') ? 'error'
      : checks.some(check => check.decision === 'needs-context') ? 'needs-context' : 'allow';
  return { ...base, scope: 'mechanical', decision, inspection: 'checked', adoption: adoptionReport(), checks, findings: checks.flatMap(check => check.findings), coverage: 'Only the listed mechanical candidates were inspected. The working agent must resolve semanticChecks against actual evidence. No execution permission or immutable binding is issued.' };
}

export function decisionReason(decision) {
  return 'repo-governance mechanical inspection. ' + decision.findings.map(item => item.ruleId + '/' + item.code + ': ' + item.message).join(' ') + ' ' + decision.coverage;
}
