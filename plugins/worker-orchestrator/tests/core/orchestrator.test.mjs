import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { Orchestrator, OrchestratorError } from '../../src/core/orchestrator.mjs';

const requestedProfile = { model: 'requested-model', thinking: 'high' };
const worker = { threadId: 'worker-1', hostId: 'local' };
const coreUrl = new URL('../../src/core/orchestrator.mjs', import.meta.url).href;

function fixture(t, { open = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'worker-orchestrator-core-'));
  const projectRoot = join(dir, 'project');
  mkdirSync(projectRoot);
  const stateDir = join(dir, 'state');
  const instances = [];
  const f = {
    dir, projectRoot, stateDir,
    projectInput: {
      projectId: 'p1', projectRoot, hostProjectId: 'host-project-1',
      controller: { threadId: 'controller', hostId: 'local' },
      authorization: { createWorkers: true, sendFollowups: true,
        archiveCompleted: true, restoreWorkers: true, source: 'explicit user instruction' },
    },
    open() {
      const orchestrator = new Orchestrator(stateDir);
      instances.push(orchestrator);
      return orchestrator;
    },
    input(extra = {}) { return { projectId: 'p1', taskId: 't1', ...extra }; },
    dispatch(extra = {}) {
      return f.core.execute('dispatch', f.input({ requestId: 'request-1', prompt: 'Implement the task.',
        profile: requestedProfile, ...extra }));
    },
    task() { return f.core.execute('status', f.input()).task; },
    record(action, extra = {}) {
      return f.core.execute('record', f.input({ actionId: action.id, outcome: 'succeeded',
        receipt: { workerRef: worker }, evidenceRef: 'host:receipt', ...extra }));
    },
    running() {
      const planned = f.dispatch();
      return f.record(planned.action);
    },
    observe(status, extra = {}) {
      return f.core.execute('observe', f.input({ runId: f.task().runId,
        eventId: `event-${status}`, status, evidenceRef: `host:${status}`,
        ...(status === 'completed' ? { result: { success: true, summary: 'Result reviewed by controller.' } } : {}),
        ...extra }));
    },
    verify(extra = {}) {
      return f.core.execute('verify', f.input({ runId: f.task().runId,
        status: 'passed', evidenceRefs: ['test:passed'], ...extra }));
    },
    accept(extra = {}) {
      return f.core.execute('accept', f.input({ runId: f.task().runId, ...extra }));
    },
    archive(extra = {}) {
      return f.core.execute('archive', f.input({ runId: f.task().runId, ...extra }));
    },
    complete() {
      f.running();
      f.observe('completed');
      f.verify();
      return f.accept();
    },
    db(fn) {
      const db = new DatabaseSync(join(stateDir, 'state.sqlite'));
      try { return fn(db); } finally { db.close(); }
    },
  };
  t.after(() => {
    for (const orchestrator of instances) orchestrator.close();
    // Only the exact mkdtemp directory owned by this test is removed.
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.match(dir, /worker-orchestrator-core-/);
    rmSync(dir, { recursive: true, force: true });
  });
  if (open) {
    f.core = f.open();
    f.core.execute('project', f.projectInput);
  }
  return f;
}

function throwsCode(fn, code) {
  assert.throws(fn, error => error instanceof OrchestratorError && error.code === code);
}

function projectSync(f, target = 'host-project-2', caller = f.projectInput.controller) {
  return f.core.execute('sync-project', {
    projectId: f.projectInput.projectId, hostProjectId: target,
    controllerThreadId: f.projectInput.controller.threadId, hostId: f.projectInput.controller.hostId,
  }, caller);
}

test('project synchronization retains legacy worker provenance, registry identity, authorization, and history', t => {
  const f = fixture(t);
  const { project, task } = f.complete();
  assert.equal(task.workerHostProjectId, project.hostProjectId);
  f.db(db => db.prepare("UPDATE tasks SET json = json_remove(json, '$.workerHostProjectId')").run());
  assert.equal(f.task().workerHostProjectId, undefined);
  const before = f.db(db => db.prepare('SELECT count(*) AS total FROM history').get().total);
  for (const caller of [null, { ...project.controllerRef, hostId: null }, { ...project.controllerRef, hostId: 'remote' }]) {
    throwsCode(() => projectSync(f, undefined, caller), 'CONTROLLER_REQUIRED');
  }
  const synced = projectSync(f);
  assert.equal(synced.previousHostProjectId, project.hostProjectId);
  assert.equal(synced.project.hostProjectId, 'host-project-2');
  assert.deepEqual({ ...synced.project, hostProjectId: project.hostProjectId, updatedAt: project.updatedAt }, project);
  assert.equal(synced.task, null);
  assert.equal(synced.action, null);
  assert.equal(synced.needsReconciliation, false);
  assert.equal(f.task().workerHostProjectId, project.hostProjectId);
  assert.deepEqual(f.task().workerRef, worker);
  assert.equal(f.task().runId, task.runId);
  assert.equal(f.task().accepted, true);
  assert.equal(f.db(db => db.prepare('SELECT host_project_id FROM projects').get().host_project_id), 'host-project-2');
  assert.equal(f.db(db => db.prepare('SELECT count(*) AS total FROM history').get().total), before + 1);
  assert.equal(projectSync(f).previousHostProjectId, undefined);
  assert.equal(f.db(db => db.prepare('SELECT count(*) AS total FROM history').get().total), before + 1);
  throwsCode(() => f.dispatch(), 'WORKER_PROJECT_MISMATCH');
  throwsCode(() => f.dispatch({ requestId: 'next' }), 'WORKER_PROJECT_MISMATCH');
  const other = f.dispatch({ taskId: 'other', requestId: 'other' });
  assert.equal(other.action.hostProjectId, 'host-project-2');
  const created = f.core.execute('record', {
    projectId: project.projectId, taskId: 'other', actionId: other.action.id,
    outcome: 'succeeded', receipt: { workerRef: { ...worker, threadId: 'other' } }, evidenceRef: 'host:other',
  });
  assert.equal(created.task.workerHostProjectId, 'host-project-2');
});

test('project synchronization waits for uncertain creation and cannot return a send planned for the old binding', t => {
  const f = fixture(t);
  const create = f.dispatch();
  throwsCode(() => projectSync(f), 'PENDING_ACTION');
  f.record(create.action, { outcome: 'unknown', receipt: null });
  throwsCode(() => projectSync(f), 'PENDING_ACTION');
  f.record(create.action);
  f.observe('completed');
  f.verify();
  f.accept();
  const send = f.dispatch({ requestId: 'followup' });
  assert.equal(send.action.hostProjectId, f.projectInput.hostProjectId);
  projectSync(f);
  throwsCode(() => f.dispatch({ requestId: 'followup' }), 'WORKER_PROJECT_MISMATCH');
  assert.equal(f.task().pendingAction.id, send.action.id);
  projectSync(f, f.projectInput.hostProjectId);
  assert.equal(f.dispatch({ requestId: 'followup' }).action.id, send.action.id);
});

test('a structured retry is blocked by project drift and resumes only when the same worker matches again', t => {
  const f = fixture(t);
  const execute = (command, input) => f.core.execute(command, f.input(input), f.projectInput.controller);
  const dispatch = execute('dispatch', {
    requestId: 'structured', prompt: 'Test the implementation.',
    profile: { model: 'fixture-model', thinking: 'low' },
    workSpec: { goal: 'Pass the test.', constraints: [],
      completionCriteria: [{ id: 'test', description: 'The test passes.' }], reasoningEscalations: ['high'] },
  });
  execute('record', { actionId: dispatch.action.id, outcome: 'succeeded',
    receipt: { workerRef: worker }, evidenceRef: 'host:create' });
  execute('observe', { runId: dispatch.task.runId, eventId: 'result', status: 'failed', evidenceRef: 'host:failed' });
  const review = { runId: dispatch.task.runId, resultEventId: 'result',
    checks: [{ id: 'test', status: 'unmet', evidenceRefs: ['controller:test'], note: 'Test failed.' }] };
  projectSync(f);
  const blocked = execute('evaluate', review);
  assert.equal(blocked.decision.type, 'blocked');
  assert.ok(blocked.decision.reasons.includes('WORKER_PROJECT_MISMATCH'));
  assert.equal(blocked.action, null);
  projectSync(f, f.projectInput.hostProjectId);
  const retry = execute('evaluate', review);
  assert.equal(retry.decision.type, 'retry');
  assert.deepEqual(retry.action.workerRef, worker);
  projectSync(f);
  assert.equal(execute('evaluate', review).action, null);
  projectSync(f, f.projectInput.hostProjectId);
  assert.equal(execute('evaluate', review).action.id, retry.action.id);
});

test('a failed acceptance write rolls back the structured decision and passing verification', t => {
  const f = fixture(t);
  const execute = (command, input) => f.core.execute(command, f.input(input), f.projectInput.controller);
  const plan = execute('dispatch', {
    requestId: 'structured', prompt: 'Test the implementation.', profile: requestedProfile,
    workSpec: { goal: 'Pass the test.', constraints: [], completionCriteria: [{ id: 'test', description: 'The test passes.' }] },
  });
  execute('record', { actionId: plan.action.id, outcome: 'succeeded',
    receipt: { workerRef: worker }, evidenceRef: 'host:create' });
  const result = execute('observe', { runId: plan.task.runId, eventId: 'result', status: 'completed',
    result: { success: true, summary: 'Worker result.' }, evidenceRef: 'host:completed' });
  const review = { runId: plan.task.runId, resultEventId: 'result',
    checks: [{ id: 'test', status: 'met', evidenceRefs: ['controller:test'], note: 'Test passed.' }] };
  const historyCount = () => f.db(db => db.prepare('SELECT count(*) AS total FROM history').get().total);
  const before = historyCount();
  f.db(db => db.exec(`CREATE TRIGGER reject_accept BEFORE INSERT ON history
    WHEN NEW.command = 'accept' BEGIN SELECT RAISE(ABORT, 'test acceptance failure'); END`));
  throwsCode(() => execute('evaluate', review), 'STATE_ERROR');
  assert.deepEqual(f.task(), result.task);
  assert.equal(historyCount(), before);
  f.db(db => db.exec('DROP TRIGGER reject_accept'));
  assert.equal(execute('evaluate', review).decision.type, 'complete');
  assert.equal(historyCount(), before + 3);
});

test('registration fixes root and host identity, validates explicit authorization, rejects collisions', t => {
  const f = fixture(t);
  const first = f.core.execute('status', { projectId: 'p1' }).project;
  const repeated = f.core.execute('project', { ...f.projectInput,
    controller: { threadId: 'new-controller', hostId: 'local' } }).project;
  assert.equal(repeated.projectRoot, first.projectRoot);
  assert.equal(repeated.hostProjectId, first.hostProjectId);
  assert.equal(repeated.createdAt, first.createdAt);
  assert.equal(repeated.controllerRef.threadId, 'new-controller');
  const otherRoot = join(f.dir, 'other');
  mkdirSync(otherRoot);
  for (const changes of [{ projectRoot: otherRoot }, { hostProjectId: 'changed' },
    { controller: { hostId: 'other-host', threadId: 'controller' } },
    { projectId: 'p2' }, { projectId: 'p2', projectRoot: otherRoot }]) {
    throwsCode(() => f.core.execute('project', { ...f.projectInput, ...changes }), 'PROJECT_IDENTITY_CONFLICT');
  }
  throwsCode(() => f.core.execute('project', { ...f.projectInput, projectRoot: '.' }), 'INVALID_PROJECT_ROOT');
  throwsCode(() => f.core.execute('project', { ...f.projectInput, projectRoot: join(f.dir, 'missing') }), 'INVALID_PROJECT_ROOT');
  for (const bad of [undefined, null, 'true', 1]) {
    throwsCode(() => f.core.execute('project', { ...f.projectInput,
      authorization: { ...f.projectInput.authorization, createWorkers: bad } }), 'INVALID_AUTHORIZATION');
  }
  throwsCode(() => f.core.execute('project', { ...f.projectInput,
    authorization: { ...f.projectInput.authorization, source: ' ' } }), 'INVALID_INPUT');
  assert.equal(f.core.execute('status', { projectId: 'p1' }).project.controllerRef.threadId, 'new-controller');
});

test('dispatch returns an immutable create plan and request replay never creates another run', t => {
  const f = fixture(t);
  const first = f.dispatch();
  assert.equal(first.then, undefined, 'execute is synchronous');
  assert.deepEqual(Object.keys(first).sort(), ['action', 'needsReconciliation', 'project', 'task']);
  assert.equal(first.action.type, 'create');
  assert.equal(first.action.id, first.action.actionId);
  assert.match(first.task.runId, /^[A-Za-z0-9_-]+$/);
  assert.equal(first.action.projectRoot, first.project.projectRoot);
  assert.equal(first.action.hostProjectId, 'host-project-1');
  assert.deepEqual(first.action.controllerRef, f.projectInput.controller);
  assert.deepEqual(first.action.profile, requestedProfile);
  assert.deepEqual(first.task.requestedProfile, requestedProfile);
  assert.equal(first.task.effectiveProfile, null);
  assert.equal(first.action.workerRef, null);
  assert.deepEqual(first.task.pendingAction, first.action);
  assert.deepEqual(f.dispatch(), first);
  throwsCode(() => f.dispatch({ prompt: 'Different prompt.' }), 'REQUEST_REPLAY_MISMATCH');
  throwsCode(() => f.dispatch({ profile: { ...requestedProfile, thinking: 'low' } }), 'REQUEST_REPLAY_MISMATCH');
  throwsCode(() => f.dispatch({ requestId: 'request-2' }), 'TASK_BUSY');
  first.action.id = 'caller-mutation';
  first.task.profile.model = 'caller-mutation';
  assert.notEqual(f.task().pendingAction.id, 'caller-mutation');
  assert.equal(f.task().profile.model, requestedProfile.model);
});

for (const outcome of ['unknown', 'failed']) {
  test(`${outcome} create blocks retries across reopen until the same action is reconciled`, t => {
    const f = fixture(t);
    const first = f.dispatch();
    const uncertain = f.record(first.action, { outcome, receipt: { pendingClientThreadId: 'queued' } });
    assert.equal(uncertain.action, null);
    assert.equal(uncertain.needsReconciliation, true);
    assert.equal(uncertain.task.pendingAction.id, first.action.id);
    f.core.close();
    f.core = f.open();
    const replay = f.dispatch();
    assert.equal(replay.action, null);
    assert.equal(replay.task.runId, first.task.runId);
    throwsCode(() => f.dispatch({ requestId: 'request-2' }), 'TASK_BUSY');
    throwsCode(() => f.record(first.action, { receipt: { workerRef: { threadId: 'thread-only' } } }), 'INVALID_INPUT');
    const confirmed = f.record(first.action);
    assert.equal(confirmed.action, null);
    assert.equal(confirmed.needsReconciliation, false);
    assert.equal(confirmed.task.pendingAction, null);
    assert.equal(confirmed.task.phase, 'running');
    assert.deepEqual(confirmed.task.workerRef, worker);
    assert.equal(f.dispatch().action, null);
    assert.equal(f.db(db => db.prepare('SELECT count(*) AS n FROM actions').get().n), 1);
  });
}

test('events deduplicate without state or history changes and waits survive completion', t => {
  const f = fixture(t);
  f.running();
  const runId = f.task().runId;
  f.observe('waiting_approval', { waitId: 'approval-1' });
  const waiting = f.observe('waiting_input', { waitId: 'input-1' });
  assert.equal(waiting.task.phase, 'waiting');
  throwsCode(() => f.observe('waiting_approval', { eventId: 'conflicting-batch', waits: [
    { waitId: 'new-approval', kind: 'approval' },
    { waitId: 'approval-1', kind: 'input' },
  ] }), 'WAIT_ID_CONFLICT');
  assert.deepEqual(f.task(), waiting.task);
  assert.deepEqual(waiting.task.waits.map(wait => [wait.id, wait.kind]),
    [['approval-1', 'approval'], ['input-1', 'input']]);
  const beforeHistory = f.db(db => db.prepare('SELECT count(*) AS n FROM history').get().n);
  const duplicate = f.observe('completed', { eventId: 'event-waiting_input' });
  assert.deepEqual(duplicate.task, waiting.task);
  assert.equal(f.db(db => db.prepare('SELECT count(*) AS n FROM history').get().n), beforeHistory);
  const completed = f.observe('completed');
  assert.equal(completed.task.phase, 'review');
  assert.equal(completed.task.waits.length, 2);
  f.verify();
  throwsCode(() => f.accept(), 'UNRESOLVED_WAITS');
  throwsCode(() => f.dispatch({ requestId: 'request-2' }), 'UNRESOLVED_WAITS');
  throwsCode(() => f.core.execute('resolve', f.input({ runId, waitId: 'unrelated', evidenceRef: 'answer' })), 'WAIT_NOT_FOUND');
  throwsCode(() => f.core.execute('resolve', f.input({ runId, waitId: 'input-1' })), 'INVALID_INPUT');
  f.core.execute('resolve', f.input({ runId, waitId: 'approval-1', evidenceRef: 'host:approval-resolved' }));
  const resolved = f.core.execute('resolve', f.input({ runId, waitId: 'input-1', evidenceRef: 'host:user-answer' }));
  assert.equal(resolved.task.phase, 'review');
  assert.equal(resolved.task.waits.length, 0);
  assert.equal(resolved.task.resolvedWaits.length, 2);
  const repeated = f.core.execute('resolve', f.input({ runId, waitId: 'input-1', evidenceRef: 'host:user-answer' }));
  assert.equal(repeated.task.version, resolved.task.version);
  assert.equal(f.accept().task.phase, 'complete');
});

test('unknown observation blocks overlapping dispatch and recovers with fresh running or completed evidence', t => {
  const f = fixture(t);
  f.running();
  let unknown = f.observe('unknown');
  assert.equal(unknown.task.phase, 'running');
  assert.equal(unknown.task.result.success, null);
  assert.equal(unknown.needsReconciliation, true);
  throwsCode(() => f.dispatch({ requestId: 'request-2' }), 'TASK_BUSY');
  const recovered = f.observe('running');
  assert.equal(recovered.task.phase, 'running');
  assert.equal(recovered.needsReconciliation, false);
  f.observe('waiting_input', { waitId: 'answer' });
  unknown = f.observe('unknown', { eventId: 'unknown-2' });
  assert.equal(unknown.task.phase, 'waiting');
  assert.equal(unknown.task.waits.length, 1);
  const completed = f.observe('completed');
  assert.equal(completed.needsReconciliation, false);
  assert.equal(completed.task.phase, 'review');
  assert.equal(completed.task.waits.length, 1);
  throwsCode(() => f.observe('running', { eventId: 'late-running' }), 'INVALID_TRANSITION');
});

test('failed observations cannot inherit a supplied success result; unknown never becomes successful', t => {
  const f = fixture(t);
  f.running();
  f.observe('failed', { result: { success: true, summary: 'Host reports failure.' } });
  assert.equal(f.task().result.success, false);
  assert.equal(f.task().result.eventId, 'event-failed');
  f.verify();
  throwsCode(() => f.accept(), 'RESULT_NOT_SUCCESSFUL');
  f.observe('unknown');
  assert.equal(f.task().result.success, null);
  assert.equal(f.task().phase, 'review');
  throwsCode(() => f.dispatch({ requestId: 'request-2' }), 'TASK_BUSY');
  throwsCode(() => f.observe('running'), 'INVALID_TRANSITION');
  f.observe('failed', { eventId: 'confirmed-failure' });
  assert.equal(f.task().needsReconciliation, false);
  const correction = f.dispatch({ requestId: 'request-2', prompt: 'Correct the failure.' });
  assert.equal(correction.action.type, 'send');
  assert.equal(correction.task.verification.status, 'unverified');
});

test('verification, explicit result review and acceptance gate archive; archive repeats use one action', t => {
  const f = fixture(t);
  f.running();
  throwsCode(() => f.verify(), 'INVALID_PHASE');
  throwsCode(() => f.archive(), 'ACCEPTANCE_REQUIRED');
  f.observe('completed');
  throwsCode(() => f.accept(), 'VERIFICATION_REQUIRED');
  throwsCode(() => f.verify({ evidenceRefs: [] }), 'VERIFICATION_EVIDENCE_REQUIRED');
  throwsCode(() => f.verify({ evidenceRefs: [''] }), 'INVALID_INPUT');
  f.verify({ status: 'failed', evidenceRefs: [] });
  throwsCode(() => f.accept(), 'VERIFICATION_REQUIRED');
  f.verify();
  throwsCode(() => f.accept({ resultReviewed: false }), 'RESULT_REVIEW_REQUIRED');
  const accepted = f.accept();
  assert.equal(accepted.task.phase, 'complete');
  assert.equal(accepted.task.resultReviewed, true);
  assert.equal(f.accept().task.version, accepted.task.version);
  const planned = f.archive();
  assert.equal(planned.action.type, 'archive');
  assert.deepEqual(planned.action.workerRef, worker);
  assert.deepEqual(planned.action.profile, requestedProfile);
  assert.equal(planned.action.prompt, 'Implement the task.');
  assert.deepEqual(f.archive(), planned);
  throwsCode(() => f.record(planned.action, { receipt: { workerRef: worker, archived: 'true' } }), 'INVALID_RECEIPT');
  throwsCode(() => f.record(planned.action, { receipt: { workerRef: { ...worker, threadId: 'different' }, archived: true } }),
    'WORKER_IDENTITY_CONFLICT');
  const archived = f.record(planned.action, { receipt: { workerRef: worker, archived: true } });
  assert.equal(archived.task.archived, true);
  assert.equal(archived.task.phase, 'complete');
  assert.equal(f.archive().action, null);
  assert.equal(f.dispatch().action, null, 'finished request is never resent');
  throwsCode(() => f.observe('completed', { eventId: 'new-event-after-acceptance' }), 'RUN_FINISHED');
});

test('archived followup restores then sends to the same worker with reset verification and stale-run guards', t => {
  const f = fixture(t);
  f.complete();
  const oldRunId = f.task().runId;
  const archivedAction = f.archive().action;
  f.record(archivedAction, { receipt: { workerRef: worker, archived: true } });
  const followup = f.dispatch({ requestId: 'request-2', prompt: 'Follow up.',
    profile: { model: 'new-requested-model', thinking: 'low' } });
  assert.equal(followup.action.type, 'unarchive');
  assert.equal(followup.task.accepted, false);
  assert.equal(followup.task.resultReviewed, false);
  assert.equal(followup.task.result, null);
  assert.deepEqual(followup.task.waits, []);
  assert.equal(followup.task.verification.status, 'unverified');
  assert.equal(followup.task.effectiveProfile, null);
  assert.notEqual(followup.task.runId, oldRunId);
  assert.equal(f.dispatch().action, null, 'an earlier request cannot return a newer pending action');
  for (const command of ['observe', 'resolve', 'verify', 'accept', 'archive']) {
    throwsCode(() => f.core.execute(command, f.input({ runId: oldRunId, eventId: 'old-event',
      status: command === 'verify' ? 'passed' : 'completed', waitId: 'old-wait',
      evidenceRef: 'old', evidenceRefs: ['old'], result: { success: true, summary: 'Old run.' } })), 'STALE_RUN');
  }
  throwsCode(() => f.record(archivedAction, { receipt: { workerRef: worker, archived: true } }), 'STALE_RUN');
  const restored = f.record(followup.action, { receipt: { workerRef: worker, archived: false } });
  assert.equal(restored.task.archived, false);
  assert.equal(restored.action.type, 'send');
  assert.notEqual(restored.action.id, followup.action.id);
  assert.equal(restored.action.runId, followup.task.runId);
  assert.equal(restored.action.prompt, 'Follow up.');
  assert.deepEqual(restored.action.profile, { model: 'new-requested-model', thinking: 'low' });
  assert.deepEqual(restored.action.workerRef, worker);
  const repeatedRestore = f.record(followup.action, { receipt: { workerRef: worker, archived: false } });
  assert.equal(repeatedRestore.action.id, restored.action.id);
  const running = f.record(restored.action);
  assert.equal(running.action, null);
  assert.equal(running.task.phase, 'running');
  assert.deepEqual(running.task.workerRef, worker);
  throwsCode(() => f.observe('completed'), 'EVENT_ID_CONFLICT');
  assert.equal(f.task().phase, 'running');
  throwsCode(() => f.archive(), 'ACCEPTANCE_REQUIRED');
  assert.equal(f.db(db => db.prepare('SELECT count(*) AS n FROM tasks').get().n), 1);
  assert.equal(f.db(db => db.prepare("SELECT count(*) AS n FROM actions WHERE type = 'create'").get().n), 1);
});

test('unarchive confirmation persists while send permission is revoked and dispatch resumes one send', t => {
  const f = fixture(t);
  f.complete();
  f.record(f.archive().action, { receipt: { workerRef: worker, archived: true } });
  const followup = { requestId: 'request-2', prompt: 'Follow up after restore.' };
  const restore = f.dispatch(followup).action;
  const updateAuthorization = changes => f.core.execute('project', { ...f.projectInput,
    authorization: { ...f.projectInput.authorization, ...changes } });
  updateAuthorization({ sendFollowups: false });

  const receipt = { receipt: { workerRef: worker, archived: false } };
  const restored = f.record(restore, receipt);
  assert.equal(restored.task.archived, false);
  assert.equal(restored.task.phase, 'planned');
  assert.equal(restored.task.pendingAction, null);
  assert.equal(restored.needsReconciliation, false);
  assert.equal(restored.action, null);

  f.core.close();
  f.core = f.open();
  assert.deepEqual(f.record(restore, receipt), restored);
  assert.deepEqual(f.dispatch(followup), restored);
  throwsCode(() => f.observe('completed', { eventId: 'premature-completion' }), 'PENDING_ACTION');
  throwsCode(() => f.dispatch({ requestId: 'request-3' }), 'TASK_BUSY');

  updateAuthorization({ restoreWorkers: false });
  assert.equal(f.dispatch().action, null, 'an older request cannot resume the current run');
  throwsCode(() => f.dispatch({ ...followup, prompt: 'Different follow-up.' }), 'REQUEST_REPLAY_MISMATCH');
  const { action: send } = f.dispatch(followup);
  assert.equal(send.type, 'send');
  assert.equal(send.runId, restore.runId);
  assert.equal(send.requestId, followup.requestId);
  assert.deepEqual(send.workerRef, worker);
  assert.equal(f.dispatch(followup).action.id, send.id);
  assert.equal(f.record(restore, receipt).action.id, send.id);
  assert.equal(f.record(send).task.phase, 'running');
  assert.equal(f.dispatch(followup).action, null);
  assert.deepEqual(f.db(db => db.prepare("SELECT type, outcome FROM actions WHERE run_id = ? ORDER BY rowid")
    .all(send.runId).map(row => [row.type, row.outcome])), [['unarchive', 'succeeded'], ['send', 'succeeded']]);
});

test('replacement results require current event evidence and an open completed task plans send', t => {
  const f = fixture(t);
  f.running();
  const first = f.observe('completed').task.result;
  assert.equal(first.eventId, 'event-completed');
  f.verify();
  const replaced = f.observe('completed', { eventId: 'new-result',
    result: { success: true, summary: 'Updated result.' } }).task;
  assert.equal(replaced.result.eventId, 'new-result');
  assert.equal(replaced.verification.status, 'unverified');
  throwsCode(() => f.verify({ resultEventId: first.eventId }), 'STALE_RESULT');
  throwsCode(() => f.verify(), 'RESULT_EVENT_ID_REQUIRED');
  assert.deepEqual(f.task(), replaced);
  throwsCode(() => f.accept(), 'VERIFICATION_REQUIRED');
  f.verify({ resultEventId: replaced.result.eventId });
  f.accept();
  const followup = f.dispatch({ requestId: 'request-2' });
  assert.equal(followup.action.type, 'send');
  assert.equal(followup.task.result, null);
  assert.equal(followup.task.accepted, false);
  assert.equal(followup.task.verification.status, 'unverified');
});

test('verification can identify terminal results from legacy snapshots using persisted events', t => {
  const f = fixture(t);
  f.running();
  const removeResultEventId = () => f.db(db => db.exec(`
    UPDATE tasks SET json = json_remove(json, '$.result.eventId');
    UPDATE requests SET json = json_remove(json, '$.result.eventId');
  `));
  f.observe('failed');
  removeResultEventId();
  assert.equal(f.verify().task.verification.status, 'passed');
  f.observe('unknown');
  const current = f.observe('completed').task.result;
  removeResultEventId();
  assert.throws(() => f.verify(), { code: 'RESULT_EVENT_ID_REQUIRED', details: { currentResultEventId: current.eventId } });
  throwsCode(() => f.verify({ resultEventId: 'event-failed' }), 'STALE_RESULT');
  assert.equal(f.verify({ resultEventId: current.eventId }).task.verification.status, 'passed');
});

test('host permissions must remain explicit for every new plan and pending plan replay', t => {
  const f = fixture(t);
  const deny = changes => f.core.execute('project', { ...f.projectInput,
    authorization: { ...f.projectInput.authorization, ...changes } });
  deny({ createWorkers: false });
  throwsCode(() => f.dispatch(), 'AUTHORIZATION_REQUIRED');
  assert.deepEqual(f.core.execute('status', { projectId: 'p1' }).tasks, []);
  deny({});
  const planned = f.dispatch();
  deny({ createWorkers: false });
  throwsCode(() => f.dispatch(), 'AUTHORIZATION_REQUIRED');
  assert.equal(f.task().pendingAction.id, planned.action.id, 'status remains available without host authorization');
  f.record(planned.action); // Historical facts may be recorded after permission is revoked.
  f.observe('completed');
  f.verify();
  f.accept();
  deny({ archiveCompleted: false, sendFollowups: false });
  throwsCode(() => f.archive(), 'AUTHORIZATION_REQUIRED');
  throwsCode(() => f.dispatch({ requestId: 'request-2' }), 'AUTHORIZATION_REQUIRED');
  deny({});
  const archive = f.archive().action;
  f.record(archive, { receipt: { workerRef: worker, archived: true } });
  deny({ restoreWorkers: false });
  throwsCode(() => f.dispatch({ requestId: 'request-2' }), 'AUTHORIZATION_REQUIRED');
});

test('worker identity is unique across tasks and confirmed receipts cannot be overwritten', t => {
  const f = fixture(t);
  const create = f.dispatch().action;
  throwsCode(() => f.record(create, { receipt: { workerRef: { ...worker, hostId: 'other-host' } } }),
    'WORKER_IDENTITY_CONFLICT');
  assert.equal(f.task().workerRef, null);
  f.record(create);
  const stable = f.task();
  assert.equal(f.record(create).task.version, stable.version);
  assert.equal(f.record(create, { receipt: { workerRef: { hostId: worker.hostId, threadId: worker.threadId } } })
    .task.version, stable.version, 'receipt key ordering cannot change replay identity');
  throwsCode(() => f.record(create, { outcome: 'failed' }), 'ACTION_REPLAY_MISMATCH');
  throwsCode(() => f.record(create, { receipt: { workerRef: { ...worker, threadId: 'different' } } }), 'ACTION_REPLAY_MISMATCH');
  const second = f.dispatch({ taskId: 't2', requestId: 'separate-request' });
  throwsCode(() => f.core.execute('record', f.input({ taskId: 't2', actionId: second.action.id,
    outcome: 'succeeded', evidenceRef: 'host:duplicate-worker', receipt: { workerRef: worker } })), 'WORKER_IDENTITY_CONFLICT');
  assert.equal(f.core.execute('status', f.input({ taskId: 't2' })).task.workerRef, null);
  throwsCode(() => f.record(second.action), 'ACTION_NOT_FOUND');
});

test('reopening retains task, events, and history without reapplying migrations', t => {
  const f = fixture(t);
  f.complete();
  const before = f.core.execute('status', { projectId: 'p1' });
  f.core.close();
  f.core.close();
  throwsCode(() => f.core.execute('status', { projectId: 'p1' }), 'STATE_CLOSED');
  f.core = f.open();
  assert.deepEqual(f.core.execute('status', { projectId: 'p1' }), before);
  f.db(db => {
    assert.deepEqual(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(row => row.version), [1, 2, 3]);
    assert.equal(db.prepare('SELECT count(*) AS n FROM events').get().n, 1);
    assert.ok(db.prepare('SELECT count(*) AS n FROM history').get().n >= 6);
    const saved = JSON.parse(db.prepare('SELECT json FROM requests').get().json);
    assert.equal(saved.phase, 'complete');
    assert.equal(saved.accepted, true);
  });
  assert.equal(existsSync(join(f.stateDir, 'state.sqlite')), true);
  assert.equal(existsSync(f.projectRoot), true);
  throwsCode(() => f.core.execute('delete', f.input()), 'UNKNOWN_COMMAND');
  assert.deepEqual(f.core.execute('status', { projectId: 'p1' }), before);
});

test('migrating a V1 database preserves a pending create and allows recovery after confirmed rejection', t => {
  const f = fixture(t);
  const first = f.dispatch().action;
  const failure = { outcome: 'failed', receipt: null, evidenceRef: 'host:unconfirmed-error' };
  f.record(first, failure);
  f.core.close();
  f.db(db => {
    db.exec(`
      ALTER TABLE actions RENAME TO actions_v2_fixture;
      CREATE TABLE actions (
        action_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('create', 'send', 'archive', 'unarchive')),
        outcome TEXT NOT NULL CHECK (outcome IN ('planned', 'succeeded', 'failed', 'unknown')),
        json TEXT NOT NULL,
        record_json TEXT,
        FOREIGN KEY (project_id, task_id) REFERENCES tasks(project_id, task_id)
      );
      INSERT INTO actions SELECT * FROM actions_v2_fixture;
      DROP TABLE actions_v2_fixture;
      CREATE UNIQUE INDEX one_pending_action_per_task
        ON actions(project_id, task_id) WHERE outcome != 'succeeded';
      DELETE FROM schema_migrations WHERE version >= 2;
    `);
  });
  f.core = f.open();
  assert.deepEqual(f.task().pendingAction, first);
  assert.equal(f.task().needsReconciliation, true);
  assert.equal(f.db(db => db.prepare('SELECT outcome FROM actions').get().outcome), 'failed');
  throwsCode(() => f.dispatch({ requestId: 'corrected' }), 'TASK_BUSY');
  throwsCode(() => f.record(first, { outcome: 'rejected' }), 'INVALID_REJECTION');

  const rejection = { outcome: 'rejected', receipt: null, evidenceRef: 'host:validation-before-create' };
  const closed = f.record(first, rejection);
  assert.equal(closed.task.phase, 'rejected');
  assert.equal(closed.task.workerRef, null);
  assert.equal(closed.needsReconciliation, false);
  assert.equal(closed.action, null);
  assert.deepEqual(f.record(first, rejection), closed);
  throwsCode(() => f.record(first), 'ACTION_REPLAY_MISMATCH');
  throwsCode(() => f.observe('running'), 'RUN_FINISHED');
  assert.equal(f.dispatch().action, null);

  const corrected = { requestId: 'corrected', profile: { ...requestedProfile, model: 'supported-model' } };
  f.core.execute('project', { ...f.projectInput, authorization: {
    ...f.projectInput.authorization, createWorkers: false
  } });
  throwsCode(() => f.dispatch(corrected), 'AUTHORIZATION_REQUIRED');
  f.core.execute('project', { ...f.projectInput, authorization: {
    ...f.projectInput.authorization, sendFollowups: false
  } });
  const retry = f.dispatch(corrected).action;
  assert.equal(retry.type, 'create');
  assert.notEqual(retry.id, first.id);
  assert.notEqual(retry.runId, first.runId);
  assert.equal(f.dispatch(corrected).action.id, retry.id);
  assert.equal(f.dispatch().action, null);
  assert.equal(f.record(retry).task.phase, 'running');
  assert.equal(f.db(db => db.prepare('SELECT count(*) AS n FROM tasks').get().n), 1);
  assert.deepEqual(f.db(db => db.prepare('SELECT outcome FROM actions ORDER BY rowid').all().map(row => row.outcome)),
    ['rejected', 'succeeded']);
});

test('migrating a V2 registry retains its existing action and referential integrity', t => {
  const f = fixture(t);
  const planned = f.dispatch();
  const before = f.core.execute('status', f.input({ actionId: planned.action.id }));
  f.core.close();
  f.db(db => db.exec(`
    PRAGMA foreign_keys = OFF;
    CREATE TABLE projects_v2_fixture (
      project_id TEXT PRIMARY KEY,
      project_root TEXT NOT NULL UNIQUE,
      host_id TEXT NOT NULL,
      host_project_id TEXT NOT NULL,
      json TEXT NOT NULL,
      UNIQUE (host_id, host_project_id)
    );
    INSERT INTO projects_v2_fixture SELECT * FROM projects;
    DROP TABLE projects;
    ALTER TABLE projects_v2_fixture RENAME TO projects;
    DELETE FROM schema_migrations WHERE version = 3;
  `));
  f.core = f.open();
  assert.deepEqual(f.core.execute('status', f.input({ actionId: planned.action.id })), before);
  assert.deepEqual(f.record(planned.action).task.workerRef, worker);
  f.db(db => assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []));
});

const contenderSource = `
  import { Orchestrator } from ${JSON.stringify(coreUrl)};
  const core = new Orchestrator(process.argv[1]);
  process.send({ ready: true });
  process.once('message', ({ project, requestId }) => {
    try {
      core.execute('project', project);
      const result = core.execute('dispatch', { projectId: project.projectId, taskId: 't1',
        requestId, prompt: 'Concurrent request.', profile: {model:'model',thinking:'high'} });
      process.send({ result });
    } catch (error) { process.send({ error: error.code, message: error.message }); }
    finally { core.close(); process.disconnect(); }
  });
`;

async function contend(t, f, requestIds) {
  const children = requestIds.map(() => spawn(process.execPath, ['--input-type=module', '--eval', contenderSource, f.stateDir],
    { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }));
  t.after(() => { for (const child of children) if (child.exitCode === null) child.kill(); });
  const readiness = [];
  const completions = [];
  for (const child of children) {
    let stderr = '';
    let output;
    child.stderr.on('data', chunk => { stderr += chunk; });
    readiness.push(new Promise((accept, reject) => {
      child.on('message', message => { if (message.ready) accept(); else output = message; });
      child.once('error', reject);
      child.once('exit', code => { if (code !== 0) reject(new Error(stderr)); });
    }));
    completions.push(new Promise((accept, reject) => {
      child.once('error', reject);
      child.once('exit', code => code === 0 && output ? accept(output) : reject(new Error(stderr || 'No contender result')));
    }));
  }
  await Promise.all(readiness);
  children.forEach((child, index) => child.send({ project: f.projectInput, requestId: requestIds[index] }));
  return Promise.all(completions);
}

test('six cold-start processes sharing SQLite produce one run and one planned create for the same request',
  { timeout: 30000 }, async t => {
    const f = fixture(t, { open: false });
    const outputs = await contend(t, f, Array(6).fill('same-request'));
    assert.ok(outputs.every(output => output.result), JSON.stringify(outputs));
    assert.equal(new Set(outputs.map(output => output.result.action.id)).size, 1);
    assert.equal(new Set(outputs.map(output => output.result.task.runId)).size, 1);
    f.db(db => {
      assert.equal(db.prepare('SELECT count(*) AS n FROM schema_migrations').get().n, 3);
      for (const table of ['projects', 'tasks', 'requests', 'actions']) {
        assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 1, table);
      }
    });
  });

test('simultaneous different requests cannot overlap one worker task', { timeout: 30000 }, async t => {
  const f = fixture(t, { open: false });
  const outputs = await contend(t, f, ['request-a', 'request-b']);
  assert.equal(outputs.filter(output => output.result).length, 1);
  assert.equal(outputs.filter(output => output.error === 'TASK_BUSY').length, 1);
  f.db(db => {
    assert.equal(db.prepare('SELECT count(*) AS n FROM tasks').get().n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM requests').get().n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM actions').get().n, 1);
  });
});
