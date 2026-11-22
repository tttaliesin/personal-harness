import { spawnSync } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import { HostContractError, unwrapHostResult } from './index.mjs';

const text = value => typeof value === 'string' && value.trim().length > 0;
const within = (root, directory) => {
  const suffix = relative(root, directory);
  return suffix !== '..' && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix);
};

function directory(value) {
  if (!text(value) || !isAbsolute(value)) return null;
  try {
    return statSync(value).isDirectory() ? realpathSync.native(value) : null;
  } catch {
    return null;
  }
}

function git(cwd, ...args) {
  const env = { ...process.env };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_PREFIX']) delete env[name];
  return spawnSync('git', ['-C', cwd, ...args], { env, encoding: 'utf8', windowsHide: true, timeout: 5000 });
}

export function resolveControllerScope(start) {
  const currentDirectory = directory(start);
  if (!currentDirectory) return null;
  const top = git(currentDirectory, 'rev-parse', '--show-toplevel');
  if (top.status !== 0) {
    if (top.status === 128 && /not a git repository/i.test(top.stderr)) {
      return { projectRoot: currentDirectory, roots: [currentDirectory], isGit: false };
    }
    return null;
  }
  const current = directory(top.stdout.replace(/\r?\n$/, ''));
  const worktrees = git(currentDirectory, 'worktree', 'list', '--porcelain', '-z');
  if (!current || worktrees.status !== 0) return null;
  const listed = worktrees.stdout.split('\0').filter(line => line.startsWith('worktree '));
  const roots = [...new Set(listed.map(line => directory(line.slice('worktree '.length))).filter(Boolean))];
  const projectRoot = directory(listed[0]?.slice('worktree '.length));
  return projectRoot && roots.includes(current) ? { projectRoot, roots, isGit: true } : null;
}

function readHistory(pages, { requireComplete = true } = {}) {
  if (!Array.isArray(pages) || !pages.length) return null;
  const seenCursors = new Set();
  const threads = [];
  let cursor = null;
  for (const [index, page] of pages.entries()) {
    if (!page || (page.cursor ?? null) !== cursor || seenCursors.has(cursor)) return null;
    seenCursors.add(cursor);
    let result;
    try { result = unwrapHostResult(page.result); } catch { return null; }
    if (!Array.isArray(result.threads) || !(result.nextCursor === null || text(result.nextCursor))) return null;
    if (!result.threads.every(thread => thread?.kind === 'codex' && text(thread.id) && text(thread.hostId))) return null;
    threads.push(...result.threads);
    cursor = result.nextCursor;
    if (cursor === null && index !== pages.length - 1) return null;
    if (cursor !== null && seenCursors.has(cursor)) return null;
  }
  return cursor === null || !requireComplete ? threads : null;
}

function repositoryMembership(real, scope) {
  if (!real) return null;
  if (!scope.roots.some(root => within(root, real))) return false;
  if (scope.roots.includes(real) || !scope.isGit) return true;
  const root = git(real, 'rev-parse', '--show-toplevel');
  const actual = root.status === 0 ? directory(root.stdout.replace(/\r?\n$/, '')) : null;
  return actual ? scope.roots.includes(actual) : null;
}

function readProjects(raw, hostId) {
  let catalog;
  try { catalog = unwrapHostResult(raw).projects; } catch { return null; }
  if (!Array.isArray(catalog)) return null;
  const byId = new Map();
  for (const project of catalog) {
    if (!text(project?.projectId)) continue;
    const entries = byId.get(project.projectId) ?? [];
    entries.push(project);
    byId.set(project.projectId, entries);
  }
  const projects = new Map();
  for (const [id, entries] of byId) {
    const sameHost = entries.filter(project => project.hostId === hostId &&
      (project.projectKind === 'local' || (project.projectKind === 'remote' && hostId !== 'local')));
    if (!sameHost.length) continue;
    const path = directory(sameHost[0].path);
    if (sameHost.length !== entries.length || sameHost.slice(1).some(project => directory(project.path) !== path)) {
      return null;
    }
    if (path) projects.set(id, { id, path });
  }
  return projects;
}

function projectFits(path, cwd, scope) {
  // Desktop can group a linked worktree under the primary checkout.
  if (path === scope.projectRoot) return true;
  if (!within(path, cwd)) return false;
  if (scope.roots.some(root => within(root, path))) return true;
  if (!scope.isGit || !scope.roots.some(root => within(path, root))) return false;
  // A broad local folder can group a repository when it is not itself another checkout root.
  const parent = git(path, 'rev-parse', '--show-toplevel');
  if (parent.status === 0) {
    const root = directory(parent.stdout.replace(/\r?\n$/, ''));
    return root !== null && root !== path;
  }
  return parent.status === 128 && /not a git repository/i.test(parent.stderr);
}

function resolveCallerProject(callers, scope, projects, { allowFallback = false } = {}) {
  const groups = new Set(callers.map(row => row.projectId ?? null));
  if (groups.size !== 1) return { reason: 'AMBIGUOUS_PROJECT' };
  const paths = new Set(callers.map(row => directory(row.cwd)));
  const [cwd] = paths;
  if (paths.size !== 1 || repositoryMembership(cwd, scope) !== true) {
    return { reason: 'AMBIGUOUS_THREAD_SCOPE' };
  }

  const [group] = groups;
  if (group !== null) {
    const project = projects.get(group);
    return project && projectFits(project.path, cwd, scope)
      ? { hostProjectId: group }
      : { reason: 'AMBIGUOUS_PROJECT' };
  }
  if (allowFallback) {
    const compatible = [...projects.values()].filter(project =>
      (scope.roots.includes(project.path) || within(project.path, scope.projectRoot))
      && projectFits(project.path, cwd, scope));
    if (compatible.length === 1 && scope.roots.includes(compatible[0].path)) {
      return { hostProjectId: compatible[0].id };
    }
  }
  return { reason: 'AMBIGUOUS_PROJECT' };
}

function membership(thread, scope, projects, inRepository) {
  const owner = projects.get(thread.projectId);
  const exact = owner && scope.roots.includes(owner.path);
  if (exact) return inRepository !== false ? true : null;
  if (inRepository === true) {
    return !owner || scope.roots.some(root => within(owner.path, root))
      || repositoryMembership(owner.path, scope) === true ? true : null;
  }
  if (inRepository === null && (!owner || scope.roots.some(root => within(owner.path, root)))) return null;
  return false;
}

export function assessControllerCandidate(scope, threadId, hostId, projectsResult, pages) {
  const history = readHistory(pages);
  if (!history) return { reason: 'INCOMPLETE_HISTORY' };
  const rows = history.filter(thread => thread.archived !== true);
  const callers = rows.filter(thread => thread.id === threadId);
  const callerHosts = new Set(callers.map(thread => thread.hostId));
  if (callerHosts.size !== 1 || (hostId && !callerHosts.has(hostId))) return { reason: 'CALLER_NOT_FOUND' };
  const [observedHostId] = callerHosts;
  const projects = readProjects(projectsResult, observedHostId);
  if (!projects) return { reason: 'AMBIGUOUS_PROJECT' };
  const binding = resolveCallerProject(callers, scope, projects, { allowFallback: true });
  if (binding.reason) return binding;

  const members = new Map();
  const directories = new Map();
  for (const thread of rows) {
    if (thread.hostId !== observedHostId) continue;
    if (!directories.has(thread.cwd)) directories.set(thread.cwd, repositoryMembership(directory(thread.cwd), scope));
    const match = membership(thread, scope, projects, directories.get(thread.cwd));
    if (match === null || (members.has(thread.id) && members.get(thread.id) !== match)) {
      return { reason: 'AMBIGUOUS_THREAD_SCOPE' };
    }
    members.set(thread.id, match);
  }
  if (members.get(threadId) !== true) return { reason: 'CALLER_NOT_FOUND' };
  const matchingThreads = [...members.values()].filter(Boolean).length;
  if (matchingThreads !== 1) return { reason: 'MULTIPLE_THREADS', matchingThreads };
  return { reason: 'CANDIDATE', hostId: observedHostId, hostProjectId: binding.hostProjectId, matchingThreads };
}

export function validateProjectBinding(project, caller, projectsResult, pages) {
  const { threadId, hostId } = project.controllerRef;
  if (caller?.threadId !== threadId || (caller.hostId && caller.hostId !== hostId)) {
    throw new HostContractError('CONTROLLER_REQUIRED', 'Project binding requires the registered controller conversation and host.');
  }
  const history = readHistory(pages, { requireComplete: false });
  if (!history) throw new HostContractError('INCOMPLETE_HISTORY', 'Supply a contiguous Desktop history prefix starting at the first page.');
  if (history.some(row => row.hostId !== hostId)) {
    throw new HostContractError('HOST_MISMATCH', 'Desktop history must belong to the registered controller host.');
  }
  const callers = history.filter(row => row.id === threadId);
  if (!callers.length || callers.some(row => row.archived !== undefined && row.archived !== false)) {
    throw new HostContractError('CALLER_NOT_FOUND', 'Desktop history must confirm the active registered controller.');
  }
  const scope = resolveControllerScope(project.projectRoot);
  if (!scope?.roots.includes(project.projectRoot)) {
    throw new HostContractError('SCOPE_UNAVAILABLE', 'The registered project root is not a known checkout root.');
  }
  const projects = readProjects(projectsResult, hostId);
  const binding = projects && resolveCallerProject(callers, scope, projects);
  if (!binding?.hostProjectId) {
    throw new HostContractError(binding?.reason ?? 'AMBIGUOUS_PROJECT',
      'Desktop history and the local project catalog must identify a single group compatible with the registered checkout.');
  }
  return { projectId: project.projectId, hostProjectId: binding.hostProjectId, hostId, controllerThreadId: threadId };
}
