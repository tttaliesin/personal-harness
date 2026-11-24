import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { requireCondition as check } from '../contracts/errors.mjs';
import { object, text } from './structured-work.mjs';

const gitContextVariables = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_PREFIX'];

function git(directory, ...args) {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
  for (const name of gitContextVariables) delete env[name];
  return spawnSync('git', ['-C', directory, ...args], {
    env, encoding: 'utf8', windowsHide: true, timeout: 5000,
  });
}

function branchRef(worktree) {
  return `refs/heads/${worktree.branchName}`;
}

function listWorktrees(projectRoot) {
  const result = git(projectRoot, 'worktree', 'list', '--porcelain', '-z');
  if (result.status !== 0) return null;
  return result.stdout.split('\0\0').filter(Boolean).map(record => record.split('\0'));
}

export function parseWorktree(value) {
  if (value === undefined) return undefined;
  object(value, 'worktree');
  check(Object.keys(value).every(key => key === 'branchName' || key === 'startCommit'),
    'INVALID_INPUT', 'worktree contains an unsupported field.');
  const branchName = text(value.branchName, 'worktree.branchName');
  const startCommit = text(value.startCommit, 'worktree.startCommit');
  check(!branchName.startsWith('-') && !/[\u0000-\u0020\u007f]/u.test(branchName),
    'INVALID_INPUT', 'worktree.branchName must be a local Git branch name.');
  check(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(startCommit),
    'INVALID_INPUT', 'worktree.startCommit must be a full Git commit ID.');
  return { branchName, startCommit: startCommit.toLowerCase() };
}

export function verifyWorktreeStart(projectRoot, worktree) {
  const ref = branchRef(worktree);
  const result = git(projectRoot, 'show-ref', '--verify', '--hash', ref);
  check(result.status === 0 && result.stdout.trim() === worktree.startCommit,
    'WORKTREE_START_MISMATCH', 'The prepared local branch does not point to the assigned starting commit.', worktree);
  const worktrees = listWorktrees(projectRoot);
  check(worktrees && !worktrees.some(entry => entry.includes(`branch ${ref}`)),
    'WORKTREE_BRANCH_IN_USE', 'The starting branch must be available for checkout in the worker worktree.', worktree);
}

export function preservedWorktreePath(projectRoot, worktree, workerCwd) {
  if (typeof workerCwd !== 'string' || !isAbsolute(workerCwd)) return null;
  const ref = branchRef(worktree);
  const entries = listWorktrees(projectRoot)?.slice(1).filter(entry => entry.includes(`branch ${ref}`));
  const entry = entries?.[0];
  if (entries?.length !== 1 || !entry[0].startsWith('worktree ')
    || entry.some(field => field === 'prunable' || field.startsWith('prunable '))) return null;

  let path;
  try {
    path = realpathSync.native(workerCwd);
    if (path !== realpathSync.native(entry[0].slice('worktree '.length))) return null;
  } catch {
    return null;
  }
  const branch = git(path, 'symbolic-ref', '--quiet', 'HEAD');
  if (branch.status !== 0 || branch.stdout.trim() !== ref) return null;
  const start = git(path, 'merge-base', '--is-ancestor', worktree.startCommit, 'HEAD');
  if (start.status !== 0) return null;
  const status = git(path, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none');
  return status.status === 0 && status.stdout === '' ? path : null;
}
