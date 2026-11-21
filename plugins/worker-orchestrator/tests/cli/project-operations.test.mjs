import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPackage } from '../../scripts/build-package.mjs';

const repoRoot = realpathSync.native(fileURLToPath(new URL('../../', import.meta.url)));
const sourceCli = join(repoRoot, 'src', 'cli', 'main.mjs');
const baseEnv = Object.fromEntries(Object.entries(process.env)
  .filter(([key]) => !/^CODEX_(THREAD|HOST)_ID$/i.test(key)));
const controller = { threadId: 'fixture-controller', hostId: 'local' };
const worker = { threadId: 'fixture-worker', hostId: 'local' };
const task = { projectId: 'fixture-project', taskId: 'fixture-task' };

async function fixture(t, { packaged = false } = {}) {
  const local = join(repoRoot, '.local');
  mkdirSync(local, { recursive: true });
  assert.equal(realpathSync.native(local), local);
  const root = mkdtempSync(join(local, 'project-operations-test-'));
  t.after(() => {
    const target = realpathSync.native(root);
    assert.equal(dirname(target), local);
    assert.equal(target, root);
    rmSync(target, { recursive: true, force: true, maxRetries: 3 });
  });

  const projectRoot = join(root, 'project');
  const stateDir = join(root, 'state');
  mkdirSync(projectRoot);
  let cli = sourceCli;
  if (packaged) {
    const { packageRoot } = await buildPackage({ repoRoot, outputRoot: join(root, 'catalog') });
    cli = join(packageRoot, 'dist', 'cli.mjs');
  }

  function run(command, input, { caller = controller, errorCode } = {}) {
    const env = { ...baseEnv };
    if (caller?.threadId) env.CODEX_THREAD_ID = caller.threadId;
    if (caller?.hostId) env.CODEX_HOST_ID = caller.hostId;
    const result = spawnSync(process.execPath, [cli, command, '--state-dir', stateDir, '--input', '-'], {
      cwd: projectRoot,
      env,
      input: JSON.stringify(input),
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20_000,
    });
    assert.ifError(result.error);
    const details = `${command}\n${result.stdout}\n${result.stderr}`;
    assert.ok(result.stdout.trim(), details);
    const response = JSON.parse(result.stdout);
    assert.equal(result.status === 0, errorCode === undefined, details);
    assert.equal(response.ok, errorCode === undefined, details);
    if (errorCode !== undefined) {
      assert.equal(response.error?.code, errorCode, details);
      assert.equal(response.hostCall, undefined, details);
    }
    return response;
  }

  const project = {
    projectId: task.projectId, projectRoot, hostProjectId: 'fixture-desktop-project', controller,
    authorization: {
      createWorkers: true, sendFollowups: true, archiveCompleted: true, restoreWorkers: true,
      source: 'Synthetic legacy grant',
    },
  };
  run('project', project, { caller: null });
  const request = {
    ...task, requestId: 'fixture-request-1', prompt: 'Run the synthetic worker fixture.',
    profile: { model: 'fixture-model', thinking: 'low' },
  };
  return { run, project, request };
}

function projectGrant(project, archiveCompleted = true) {
  return {
    ...project,
    authorization: {
      ...project.authorization, scope: 'project', archiveCompleted, source: 'Synthetic standing grant',
    },
  };
}

function runScope({ projectId, taskId, runId }) {
  return { projectId, taskId, runId };
}

function receipt(action, hostResult) {
  return {
    ...runScope(action), actionId: action.id, hostResult, evidenceRef: `fixture:${action.type}-receipt`,
  };
}

function completion(scope, status = 'completed') {
  const turnId = `turn-${scope.runId}-${status}`;
  return {
    ...scope,
    evidenceRef: `fixture:${turnId}`,
    hostResult: { polls: [{
      thread: { id: worker.threadId, hostId: worker.hostId, status: { type: 'idle' } },
      cursor: turnId,
      latestTurn: { id: turnId, status },
      latestAssistantMessage: { turnId, phase: 'final_answer', text: JSON.stringify({
        runId: scope.runId, status, summary: 'Synthetic worker result.',
        verification: { status: 'passed', evidenceRefs: ['fixture:worker-report'] }, pendingRequests: [],
      }) },
    }] },
  };
}

function passedVerification(task) {
  return {
    ...runScope(task), resultEventId: task.result.eventId, status: 'passed',
    evidenceRefs: [`fixture:controller-checks-${task.runId}`],
  };
}

function assertAcceptedAndOpen({ task, action, hostCall }) {
  assert.equal(task.accepted, true);
  assert.equal(task.archived, false);
  assert.equal(task.pendingAction, null);
  assert.equal(action, null);
  assert.equal(hostCall, undefined);
}

test('project authorization persists and guards project mutations against a forged stdin caller', async t => {
  const { run, project, request } = await fixture(t);
  const grant = projectGrant(project);
  const outsider = { threadId: 'fixture-other-thread', hostId: 'local' };
  function denied(command, input, caller = outsider) {
    run(command, { ...input, caller: controller }, { caller, errorCode: 'CONTROLLER_REQUIRED' });
  }

  denied('project', grant, null);
  run('project', grant, { caller: { threadId: controller.threadId } });
  const projectScope = { projectId: task.projectId };
  const persisted = run('status', projectScope, { caller: null });
  assert.deepEqual(persisted.project.authorization, grant.authorization);
  assert.deepEqual(persisted.project.controllerRef, controller);

  denied('project', project);
  denied('dispatch', request);
  denied('dispatch', request, null);
  denied('dispatch', request, { ...controller, hostId: 'fixture-other-host' });
  assert.deepEqual(run('status', projectScope, { caller: outsider }), persisted);

  const { action: create } = run('dispatch', { ...request, caller: outsider });
  const scope = runScope(create);
  const created = receipt(create, worker);
  denied('record', created);
  run('record', created);

  const wait = {
    ...scope, eventId: 'fixture-wait', status: 'waiting_approval', waitId: 'fixture-approval',
    evidenceRef: 'fixture:approval-wait',
  };
  denied('observe', wait);
  run('observe', wait);
  const resolution = { ...scope, waitId: wait.waitId, evidenceRef: 'fixture:approval-resolution' };
  denied('resolve', resolution);
  run('resolve', resolution);

  const observed = run('observe', completion(scope));
  const verification = passedVerification(observed.task);
  denied('verify', verification);
  run('verify', verification);
  denied('accept', { ...scope, keepWorker: false });
  const accepted = run('accept', scope);
  assertAcceptedAndOpen(accepted);
  denied('archive', scope);
  assert.deepEqual(run('status', task, { caller: outsider }).task, accepted.task);
});

test('dispatch rechecks authorization and worker state after a candidate status snapshot', async t => {
  const { run, project, request } = await fixture(t);
  const git = spawnSync('git', ['init', '--quiet', '--template='], {
    cwd: project.projectRoot, encoding: 'utf8', windowsHide: true,
    env: Object.fromEntries(Object.entries(baseEnv).filter(([key]) => !/^GIT_/i.test(key))),
  });
  assert.ifError(git.error);
  assert.equal(git.status, 0, git.stderr);
  const grant = projectGrant(project);
  run('project', grant);
  const { action: create } = run('dispatch', request);
  run('record', receipt(create, worker));
  const first = runScope(create);
  const completed = run('observe', completion(first));
  run('verify', passedVerification(completed.task));
  const accepted = run('accept', first);
  assertAcceptedAndOpen(accepted);

  const snapshot = run('candidate', { projectRoot: project.projectRoot, includeStatus: true });
  assert.equal(snapshot.reason, 'REGISTERED_CONTROLLER');
  assert.equal(snapshot.project.authorization.sendFollowups, true);
  assert.deepEqual(snapshot.tasks, [accepted.task]);

  const followup = { ...request, requestId: 'fixture-request-2', reuseOnly: true };
  run('project', { ...grant, authorization: { ...grant.authorization, sendFollowups: false } });
  run('dispatch', followup, { errorCode: 'AUTHORIZATION_REQUIRED' });
  assert.deepEqual(run('status', task).task, accepted.task);

  run('project', grant);
  const { action: send } = run('dispatch', followup);
  assert.equal(send.type, 'send');
  assert.deepEqual(send.workerRef, worker);
  const { task: running } = run('record', receipt(send, { threadId: worker.threadId }));
  assert.equal(running.phase, 'running');
  assert.equal(running.pendingAction, null);
  run('dispatch', { ...followup, requestId: 'fixture-request-3' }, { errorCode: 'TASK_BUSY' });
  assert.deepEqual(run('status', task).task, running);
});

test('packaged CLI reuses a retained worker and restores it after verified, replayable archive-on-accept', async t => {
  const { run, project, request } = await fixture(t, { packaged: true });
  const grant = projectGrant(project);
  run('project', grant);
  const reuse = { ...request, reuseOnly: true };
  run('dispatch', reuse, { errorCode: 'WORKER_NOT_FOUND' });
  const persisted = run('status', { projectId: task.projectId });
  assert.deepEqual(persisted.project.authorization, grant.authorization);
  assert.deepEqual(persisted.tasks, []);

  const created = run('dispatch', request);
  assert.equal(created.action.type, 'create');
  assert.equal(created.hostCall.tool, 'mcp__codex_app__create_thread');
  assert.equal(created.hostCall.arguments.target.projectId, project.hostProjectId);
  run('dispatch', reuse, { errorCode: 'WORKER_NOT_FOUND' });
  const first = runScope(created.action);
  run('accept', { ...first, keepWorker: false }, { errorCode: 'INVALID_PHASE' });
  assert.equal(run('status', task).task.pendingAction.id, created.action.id);
  run('record', receipt(created.action, worker));

  const completed = run('observe', completion(first));
  assert.equal(completed.task.result.success, true);
  run('accept', { ...first, keepWorker: false }, { errorCode: 'VERIFICATION_REQUIRED' });
  run('verify', passedVerification(completed.task));
  assertAcceptedAndOpen(run('accept', { ...first, keepWorker: true }));

  const followup = run('dispatch', { ...request, requestId: 'fixture-request-2', prompt: 'Follow up.' });
  assert.equal(followup.action.type, 'send');
  assert.deepEqual(followup.action.workerRef, worker);
  assert.notEqual(followup.action.runId, first.runId);
  run('record', receipt(followup.action, { threadId: worker.threadId }));

  const second = runScope(followup.action);
  const waitId = 'fixture-input';
  run('observe', {
    ...second, eventId: 'fixture-input-wait', status: 'waiting_input', waitId, evidenceRef: 'fixture:input-wait',
  });
  const reviewed = run('observe', completion(second));
  const verified = run('verify', passedVerification(reviewed.task));
  const accept = { ...second, keepWorker: false };
  run('accept', accept, { errorCode: 'UNRESOLVED_WAITS' });
  assert.deepEqual(run('status', task).task, verified.task);
  run('resolve', { ...second, waitId, evidenceRef: 'fixture:input-resolution' });

  const archive = run('accept', accept);
  assert.equal(archive.task.accepted, true);
  assert.equal(archive.task.archived, false);
  assert.equal(archive.action.type, 'archive');
  assert.equal(archive.action.runId, second.runId);
  assert.deepEqual(archive.action.workerRef, worker);
  assert.equal(archive.task.pendingAction.id, archive.action.id);
  assert.deepEqual(archive.hostCall, {
    tool: 'mcp__codex_app__set_thread_archived',
    arguments: { ...worker, source: 'codex', archived: true },
  });
  const replay = run('accept', accept);
  assert.equal(replay.action.id, archive.action.id);
  assert.deepEqual(replay.hostCall, archive.hostCall);
  assert.equal(run('record', receipt(archive.action, { ...worker, archived: true })).task.archived, true);

  const restored = run('dispatch', {
    ...reuse, requestId: 'fixture-request-3', prompt: 'Resume on the archived worker.',
  });
  const third = runScope(restored.action);
  assert.equal(restored.action.type, 'unarchive');
  assert.deepEqual(restored.action.workerRef, worker);
  assert.deepEqual(restored.hostCall, {
    tool: 'mcp__codex_app__set_thread_archived',
    arguments: { ...worker, source: 'codex', archived: false },
  });
  assert.notEqual(third.runId, second.runId);
  assert.deepEqual(restored.task.verification, { runId: third.runId, status: 'unverified', evidenceRefs: [] });
  assert.equal(restored.task.accepted, false);
  const send = run('record', receipt(restored.action, { ...worker, archived: false }));
  assert.equal(send.action.type, 'send');
  assert.deepEqual(send.action.workerRef, worker);
  assert.equal(send.action.runId, third.runId);
  assert.equal(send.hostCall.tool, 'mcp__codex_app__send_message_to_thread');
  assert.equal(send.hostCall.arguments.threadId, worker.threadId);
  run('record', receipt(send.action, { threadId: worker.threadId }));

  const fresh = run('observe', completion(third));
  run('accept', { ...third, keepWorker: false }, { errorCode: 'VERIFICATION_REQUIRED' });
  run('verify', passedVerification(fresh.task));
  assertAcceptedAndOpen(run('accept', third));
});

test('archive-on-accept requires a successful worker result even with passing verification', async t => {
  const { run, project, request } = await fixture(t);
  run('project', projectGrant(project));
  const { action } = run('dispatch', request);
  run('record', receipt(action, worker));
  const scope = runScope(action);
  const failed = run('observe', completion(scope, 'failed'));
  const verified = run('verify', passedVerification(failed.task));
  run('accept', { ...scope, keepWorker: false }, { errorCode: 'RESULT_NOT_SUCCESSFUL' });
  assert.deepEqual(run('status', task).task, verified.task);
});

for (const { label, archiveCompleted } of [
  { label: 'legacy authorization', archiveCompleted: true },
  { label: 'a project grant without archive permission', archiveCompleted: false },
]) {
  test(`keepWorker false accepts and retains the worker under ${label}`, async t => {
    const { run, project, request } = await fixture(t);
    if (!archiveCompleted) run('project', projectGrant(project, archiveCompleted));
    const { action } = run('dispatch', request);
    run('record', receipt(action, worker));
    const scope = runScope(action);
    const completed = run('observe', completion(scope));
    run('verify', passedVerification(completed.task));
    assertAcceptedAndOpen(run('accept', { ...scope, keepWorker: false }));
    if (!archiveCompleted) run('archive', scope, { errorCode: 'AUTHORIZATION_REQUIRED' });
  });
}
