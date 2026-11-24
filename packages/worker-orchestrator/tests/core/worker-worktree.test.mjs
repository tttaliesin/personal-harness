import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { hostCallFor } from '../../src/adapters/codex-desktop/index.mjs';
import { Orchestrator } from '../../src/core/orchestrator.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'worker-worktree-test-'));
  const projectRoot = join(dir, 'repo');
  const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const core = new Orchestrator(join(dir, 'state'));
  t.after(() => {
    core.close();
    assert.equal(dirname(dir), tmpdir());
    rmSync(dir, { recursive: true, force: true });
  });
  git(dir, 'init', '-b', 'main', projectRoot);
  git(projectRoot, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Initial commit');
  const startCommit = git(projectRoot, 'rev-parse', 'HEAD');
  for (const branch of ['work-a', 'work-b']) git(projectRoot, 'branch', branch);
  const controller = { threadId: 'controller', hostId: 'local' };
  const projectInput = {
    projectId: 'project', hostProjectId: 'desktop-project', projectRoot, controller,
    authorization: { createWorkers: true, sendFollowups: true,
      archiveCompleted: true, restoreWorkers: true, source: 'explicit user instruction' },
  };
  const { project } = core.execute('project', projectInput);
  const caller = { ...controller, projectRoots: [project.projectRoot] };
  core.execute('project', { ...projectInput, authorization: { ...projectInput.authorization, scope: 'project' } }, caller);
  const execute = (command, taskId, input = {}) => core.execute(command, { projectId: 'project', taskId, ...input }, caller);
  const dispatch = (taskId, input = {}) => execute('dispatch', taskId, {
    requestId: 'first-request', prompt: 'Implement the task.', profile: { model: 'test-model', thinking: 'high' }, ...input,
  });
  const record = (taskId, action) => execute('record', taskId, { actionId: action.id,
    outcome: 'succeeded', receipt: { workerRef: { threadId: `worker-${taskId}`, hostId: 'local' } }, evidenceRef: 'host:receipt' });
  const finish = (taskId, runId, input = {}) => {
    execute('observe', taskId, { runId, eventId: `result-${taskId}`, status: 'completed', evidenceRef: 'host:result',
      result: { success: true, summary: 'Result reviewed by controller.' } });
    execute('verify', taskId, { runId, status: 'passed', evidenceRefs: ['test:result'] });
    return execute('accept', taskId, { runId, ...input });
  };
  const makeWorktree = branchName => {
    const path = join(dir, branchName);
    git(projectRoot, 'worktree', 'add', '--detach', path, branchName);
    assert.equal(git(path, 'rev-parse', 'HEAD'), startCommit);
    git(path, 'switch', '--no-guess', branchName);
    return path;
  };
  const workerThread = (taskId, cwd) => ({ id: `worker-${taskId}`, hostId: 'local', cwd, status: { type: 'idle' } });
  return { dispatch, execute, record, finish, makeWorktree, startCommit, git, workerThread, projectRoot };
}

test('plans independent Desktop worktrees and keeps the assignment across follow-up', t => {
  const f = fixture(t);
  for (const branchName of ['work-a', 'work-b']) {
    const worktree = { branchName, startCommit: f.startCommit };
    const { task, action } = f.dispatch(branchName, { worktree });
    const call = hostCallFor(action);
    assert.deepEqual(task.worktree, worktree);
    assert.deepEqual(call.arguments.target.environment, {
      type: 'worktree', startingState: { type: 'branch', branchName, onMissing: 'error' },
    });
    assert.match(call.arguments.prompt, /detached HEAD/);
    assert.ok(call.arguments.prompt.includes(f.startCommit));
    assert.equal(f.dispatch(branchName).action.id, action.id);
    f.record(branchName, action);
    f.makeWorktree(branchName);
    assert.equal(f.finish(branchName, task.runId).action, null);
    assert.throws(() => f.dispatch(branchName, { requestId: 'changed', worktree: { ...worktree, branchName: 'other' } }),
      { code: 'WORKTREE_ASSIGNMENT_MISMATCH' });
    const followup = f.dispatch(branchName, { requestId: 'follow-up' });
    assert.deepEqual(followup.task.worktree, worktree);
    assert.equal(followup.action.type, 'send');
    const send = hostCallFor(followup.action);
    assert.equal(send.arguments.threadId, `worker-${branchName}`);
    assert.match(send.arguments.prompt, /이전에 확인한 worktree 경로/);
  }
});

test('rejects a changed start commit or branch in use before issuing a create action', t => {
  const f = fixture(t);
  const branchName = 'work-a';
  assert.throws(() => f.dispatch('task', { worktree: { branchName, startCommit: '0'.repeat(f.startCommit.length) } }),
    { code: 'WORKTREE_START_MISMATCH' });
  f.makeWorktree(branchName);
  assert.throws(() => f.dispatch('task', { worktree: { branchName, startCommit: f.startCommit } }),
    { code: 'WORKTREE_BRANCH_IN_USE' });
});

test('retries a structured run with the original Git assignment on the same Desktop worker', t => {
  const f = fixture(t);
  const worktree = { branchName: 'work-a', startCommit: f.startCommit };
  const { task, action } = f.dispatch('task', { worktree, workSpec: {
    goal: 'Pass the test.', constraints: [],
    completionCriteria: [{ id: 'test', description: 'The test passes.' }], reasoningEscalations: ['xhigh'],
  } });
  f.record('task', action);
  f.makeWorktree(worktree.branchName);
  f.execute('observe', 'task', { runId: task.runId, eventId: 'result', status: 'failed', evidenceRef: 'host:failed' });
  const result = f.execute('evaluate', 'task', { runId: task.runId, resultEventId: 'result',
    checks: [{ id: 'test', status: 'unmet', evidenceRefs: ['host:failed'], note: 'Test failed.' }] });
  assert.equal(result.decision.type, 'retry');
  assert.deepEqual(result.task.worktree, worktree);
  assert.notEqual(result.task.runId, task.runId);
  assert.equal(hostCallFor(result.action).arguments.threadId, 'worker-task');
});

test('accepts a result with a dirty worktree and archives only after changes are committed', t => {
  const f = fixture(t);
  const branchName = 'work-a';
  const { task, action } = f.dispatch('task', { worktree: { branchName, startCommit: f.startCommit } });
  f.record('task', action);
  const path = f.makeWorktree(branchName);
  writeFileSync(join(path, 'result.txt'), 'Uncommitted result.\n');
  const accepted = f.finish('task', task.runId, { keepWorker: false });
  assert.equal(accepted.task.accepted, true);
  assert.equal(accepted.action, null);
  const scope = { runId: task.runId, workerThread: f.workerThread('task', path) };
  assert.throws(() => f.execute('archive', 'task', { runId: task.runId }), { code: 'WORKTREE_THREAD_UNVERIFIED' });
  assert.throws(() => f.execute('archive', 'task', scope), { code: 'WORKTREE_NOT_PRESERVED' });
  f.git(path, 'add', 'result.txt');
  assert.throws(() => f.execute('archive', 'task', scope), { code: 'WORKTREE_NOT_PRESERVED' });
  f.git(path, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '-m', 'Save result');
  const { action: archive } = f.execute('archive', 'task', scope);
  assert.equal(archive.type, 'archive');
  assert.equal(hostCallFor(archive).arguments.threadId, 'worker-task');
  assert.equal(f.git(path, 'branch', '--show-current'), branchName);
  assert.equal(f.execute('accept', 'task', { runId: task.runId, keepWorker: false }).action, null);
  assert.equal(f.dispatch('task').action, null);

  writeFileSync(join(path, 'result.txt'), 'New changes after the first archive plan.\n');
  assert.throws(() => f.execute('archive', 'task', scope), { code: 'WORKTREE_NOT_PRESERVED' });
  assert.equal(f.execute('status', 'task').task.accepted, true);
  f.git(path, 'restore', 'result.txt');
  assert.equal(f.execute('archive', 'task', scope).action.id, archive.id);
});

test('only explicit worktree archive can return a plan for the bound Desktop checkout', t => {
  const f = fixture(t);
  const worktree = { branchName: 'work-a', startCommit: f.startCommit };
  const { task, action } = f.dispatch('task', { worktree, workSpec: {
    goal: 'Pass the test.', constraints: [],
    completionCriteria: [{ id: 'test', description: 'The test passes.' }],
  } });
  f.record('task', action);
  const path = f.makeWorktree(worktree.branchName);
  const otherPath = f.makeWorktree('work-b');
  const { runId } = task;
  f.execute('observe', 'task', { runId, eventId: 'result', status: 'completed', evidenceRef: 'host:result',
    result: { success: true, summary: 'Result reviewed by controller.' } });
  const review = { runId, resultEventId: 'result', keepWorker: false,
    checks: [{ id: 'test', status: 'met', evidenceRefs: ['test:result'], note: 'Test passed.' }] };
  const accepted = f.execute('evaluate', 'task', review);
  assert.equal(accepted.decision.type, 'complete');
  assert.equal(accepted.action, null);
  for (const cwd of [f.projectRoot, otherPath]) {
    assert.throws(() => f.execute('archive', 'task', { runId, workerThread: f.workerThread('task', cwd) }),
      { code: 'WORKTREE_NOT_PRESERVED' });
  }
  assert.throws(() => f.execute('archive', 'task', { runId, workerThread: f.workerThread('other', path) }),
    { code: 'WORKTREE_THREAD_UNVERIFIED' });
  const scope = { runId, workerThread: f.workerThread('task', path) };
  assert.throws(() => f.execute('archive', 'task', { runId, workerThread: { ...scope.workerThread, status: { type: 'active' } } }),
    { code: 'WORKTREE_THREAD_UNVERIFIED' });
  const { action: archive } = f.execute('archive', 'task', scope);
  assert.equal(archive.type, 'archive');
  assert.equal(f.execute('evaluate', 'task', review).action, null);
  writeFileSync(join(path, 'new.txt'), 'Untracked work.\n');
  assert.equal(f.execute('evaluate', 'task', review).action, null);
  assert.throws(() => f.execute('archive', 'task', scope), { code: 'WORKTREE_NOT_PRESERVED' });
});
