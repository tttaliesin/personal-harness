import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const repoRoot = realpathSync.native(fileURLToPath(new URL('../../', import.meta.url)));
const cli = join(repoRoot, 'src', 'cli', 'main.mjs');
const controller = { threadId: 'fixture-controller', hostId: 'local' };
const worker = { threadId: 'fixture-worker', hostId: 'local' };
const scope = { projectId: 'fixture-project', taskId: 'fixture-task' };
const workSpec = {
  goal: 'Produce the synthetic report.',
  constraints: ['Keep the input file intact.'],
  completionCriteria: [
    { id: 'report', description: 'The report contains the required total.' },
    { id: 'format', description: 'The report has a readable format.' },
  ],
  reasoningEscalations: ['medium', 'xhigh'],
};
const controllerCheck = { status: 'met', evidenceRefs: ['fixture:independent-check'], note: 'Independently checked.' };
const workerEvidence = 'fixture:worker-self-report';

function fixture(t) {
  const local = join(repoRoot, '.local');
  mkdirSync(local, { recursive: true });
  assert.equal(realpathSync.native(local), local);
  const root = mkdtempSync(join(local, 'structured-work-test-'));
  t.after(() => {
    const target = realpathSync.native(root);
    assert.equal(target, root);
    assert.equal(dirname(target), local);
    rmSync(target, { recursive: true, force: true, maxRetries: 3 });
  });
  const stateDir = join(root, 'state');
  const projectRoot = join(root, 'project');
  mkdirSync(projectRoot);
  const project = {
    projectId: scope.projectId, projectRoot, controller, hostProjectId: 'fixture-desktop-project',
    authorization: {
      createWorkers: true, sendFollowups: true, archiveCompleted: true, restoreWorkers: true,
      source: 'Synthetic permission fixture.',
    },
  };
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^CODEX_(THREAD|HOST)_ID$/i.test(key)));
  function run(command, input, errorCode, caller = controller) {
    const result = spawnSync(process.execPath, [cli, command, '--state-dir', stateDir, '--input', '-'], {
      cwd: projectRoot, input: JSON.stringify(input), encoding: 'utf8', windowsHide: true, timeout: 20_000,
      env: { ...env, CODEX_THREAD_ID: caller.threadId, CODEX_HOST_ID: caller.hostId },
    });
    assert.ifError(result.error);
    const diagnostic = `${command}\n${result.stdout}\n${result.stderr}`;
    assert.ok(result.stdout.trim(), diagnostic);
    const response = JSON.parse(result.stdout);
    assert.equal(result.status, errorCode ? 2 : 0, diagnostic);
    assert.equal(response.ok, !errorCode, diagnostic);
    if (errorCode) assert.equal(response.error.code, errorCode, diagnostic);
    return response;
  }
  run('project', project);
  const request = { ...scope, requestId: 'request', prompt: 'Create the report.',
    profile: { model: 'fixture-model', thinking: 'low' }, workSpec };
  function record(plan) {
    const { id, runId, type } = plan.action;
    const hostResult = type === 'create' ? worker : type === 'archive'
      ? { threadId: worker.threadId, archived: true } : { threadId: worker.threadId };
    return run('record', { ...scope, runId, actionId: id, hostResult, evidenceRef: `fixture:receipt-${id}` });
  }
  function terminal(runId, cursor, status = 'completed') {
    const turnId = `turn-${cursor}`;
    return run('observe', { ...scope, runId, evidenceRef: `fixture:observation-${cursor}`, hostResult: { polls: [{
      thread: { id: worker.threadId, hostId: worker.hostId, status: { type: 'idle' } },
      cursor, latestTurn: { id: turnId, status }, latestAssistantMessage: { turnId, phase: 'final_answer',
        text: JSON.stringify({ runId, status, summary: 'Synthetic result.',
          verification: { status: 'passed', evidenceRefs: [workerEvidence] }, pendingRequests: [] }),
      },
    }] } });
  }
  function evaluation(task, extra = {}) {
    return { ...scope, runId: task.runId, resultEventId: task.result.eventId,
      checks: workSpec.completionCriteria.map(({ id }) => ({ id, ...controllerCheck })),
      constraintReview: controllerCheck, ...extra };
  }
  function history() {
    const db = new DatabaseSync(join(stateDir, 'state.sqlite'), { readOnly: true });
    try { return db.prepare('SELECT command FROM history ORDER BY id').all().map(row => row.command); }
    finally { db.close(); }
  }
  return { run, record, terminal, evaluation, history, request, project };
}

test('structured dispatch validates IDs and escalation order, and binds request replay to the work spec', t => {
  const f = fixture(t);
  for (const invalid of [
    { ...workSpec, completionCriteria: [] },
    { ...workSpec, completionCriteria: [workSpec.completionCriteria[0], workSpec.completionCriteria[0]] },
    { ...workSpec, completionCriteria: [{ id: ' ', description: 'Description' }] },
    { ...workSpec, completionCriteria: [{ id: 'valid-id', description: ' ' }] },
    { ...workSpec, reasoningEscalations: ['low'] },
    { ...workSpec, reasoningEscalations: ['xhigh', 'high'] },
    { ...workSpec, reasoningEscalations: ['medium', 'medium'] },
    { ...workSpec, reasoningEscalations: ['unsupported'] },
  ]) f.run('dispatch', { ...f.request, workSpec: invalid }, 'INVALID_INPUT');
  assert.deepEqual(f.run('status', { projectId: scope.projectId }).tasks, []);
  const plan = f.run('dispatch', f.request);
  assert.deepEqual(plan.task.workSpec, workSpec);
  assert.deepEqual(plan.action.workSpec, workSpec);
  assert.ok(plan.hostCall.arguments.prompt.includes(workSpec.goal));
  assert.ok(plan.hostCall.arguments.prompt.includes(workSpec.completionCriteria[0].description));
  assert.deepEqual(f.run('dispatch', f.request), plan);
  f.run('dispatch', { ...f.request, workSpec: { ...workSpec, goal: 'Another goal.' } }, 'REQUEST_REPLAY_MISMATCH');
  f.run('dispatch', { ...f.request, workSpec: undefined }, 'REQUEST_REPLAY_MISMATCH');
});

test('structured review retries same worker with increasing effort and idempotent actions until the cap', t => {
  const f = fixture(t);
  const initial = f.run('dispatch', f.request);
  f.record(initial);
  const source = f.terminal(initial.task.runId, 'first').task;
  const input = f.evaluation(source, { checks: [
    { id: 'report', status: 'unmet', evidenceRefs: ['fixture:controller-diff'], note: 'The total is wrong.' },
    { id: 'format', ...controllerCheck },
  ] });
  const retry = f.run('evaluate', input);
  assert.equal(retry.decision.type, 'retry');
  assert.equal(retry.decision.nextRunId, retry.task.runId);
  assert.equal(retry.action.type, 'send');
  assert.notEqual(retry.action.runId, source.runId);
  assert.deepEqual(retry.action.profile, { model: f.request.profile.model, thinking: 'medium' });
  assert.deepEqual(retry.action.workerRef, worker);
  assert.deepEqual(retry.action.workSpec, workSpec);
  assert.equal(retry.action.retryContext.previousRunId, source.runId);
  assert.deepEqual(retry.action.retryContext.checks.map(check => check.id), ['report']);
  assert.deepEqual(retry.action.retryContext.checks[0].evidenceRefs, ['fixture:controller-diff']);
  assert.equal(retry.hostCall.arguments.thinking, 'medium');
  for (const expected of [workSpec.goal, 'The total is wrong.', 'fixture:controller-diff', 'fixture:observation-first']) {
    assert.ok(retry.hostCall.arguments.prompt.includes(expected), expected);
  }
  assert.deepEqual(retry.task.verification, { runId: retry.task.runId, status: 'unverified', evidenceRefs: [] });
  const afterRetry = f.history();
  assert.deepEqual(f.run('evaluate', { ...input, checks: input.checks.toReversed() }), retry);
  f.run('evaluate', { ...input, keepWorker: false }, 'EVALUATION_REPLAY_MISMATCH');
  assert.deepEqual(f.history(), afterRetry);
  assert.equal(f.run('dispatch', f.request).action, null);
  f.record(retry);
  assert.equal(f.run('evaluate', input).action, null);
  const nextSource = f.terminal(retry.task.runId, 'second', 'failed').task;
  f.run('evaluate', f.evaluation(nextSource, { resultEventId: input.resultEventId }), 'STALE_RESULT');
  const secondRetry = f.run('evaluate', f.evaluation(nextSource));
  assert.equal(secondRetry.action.profile.thinking, 'xhigh');
  assert.equal(secondRetry.action.profile.model, f.request.profile.model);
  assert.ok(secondRetry.decision.reasons.includes('RESULT_NOT_SUCCESSFUL'));
  f.record(secondRetry);
  const third = f.terminal(secondRetry.task.runId, 'third').task;
  const blockedInput = f.evaluation(third, { checks: input.checks });
  const blocked = f.run('evaluate', blockedInput);
  assert.equal(blocked.decision.type, 'blocked');
  assert.ok(blocked.decision.reasons.includes('NO_HIGHER_EFFORT'));
  assert.equal(blocked.task.runId, third.runId);
  assert.equal(blocked.action, null);
  const afterBlocked = f.history();
  assert.deepEqual(f.run('evaluate', blockedInput), blocked);
  assert.deepEqual(f.history(), afterBlocked);
  f.run('dispatch', { ...f.request, requestId: 'bypass', workSpec: undefined }, 'STRUCTURED_EVALUATION_REQUIRED');
});

test('completion needs controller checks and accepts sources also cited by the worker', t => {
  const f = fixture(t);
  f.run('project', { ...f.project, authorization: { ...f.project.authorization, scope: 'project' } });
  const plan = f.run('dispatch', f.request);
  f.record(plan);
  const old = f.terminal(plan.task.runId, 'first').task;
  const current = f.terminal(plan.task.runId, 'second').task;
  const input = f.evaluation(current, { keepWorker: false });
  f.run('evaluate', f.evaluation(old), 'STALE_RESULT');
  f.run('evaluate', { ...input, constraintReview: undefined }, 'CONSTRAINT_REVIEW_REQUIRED');
  f.run('evaluate', { ...input, checks: input.checks.slice(0, 1) }, 'INVALID_INPUT');
  f.run('verify', { ...scope, runId: current.runId, status: 'passed', evidenceRefs: [workerEvidence] },
    'STRUCTURED_EVALUATION_REQUIRED');
  f.run('accept', { ...scope, runId: current.runId }, 'STRUCTURED_EVALUATION_REQUIRED');
  f.run('archive', { ...scope, runId: current.runId }, 'ACCEPTANCE_REQUIRED');
  const selfReported = f.run('evaluate', { ...input, checks: input.checks.map(check =>
    ({ ...check, evidenceRefs: [] })) });
  assert.equal(selfReported.decision.type, 'blocked');
  assert.deepEqual(selfReported.decision.reasons, ['CONTROLLER_EVIDENCE_REQUIRED']);
  assert.equal(selfReported.decision.diagnostics.workerVerification.status, 'passed');
  assert.deepEqual(selfReported.decision.diagnostics.workerVerification.evidenceRefs, [workerEvidence]);
  assert.equal(selfReported.task.accepted, false);
  assert.equal(selfReported.task.runId, current.runId);
  assert.equal(selfReported.action, null);
  assert.equal(selfReported.hostCall, undefined);
  const mixed = f.run('evaluate', { ...input, checks: [
    { ...input.checks[0], evidenceRefs: [] },
    { ...input.checks[1], status: 'unmet', note: 'Format needs work.' },
  ] });
  assert.deepEqual(mixed.decision.reasons, ['CONTROLLER_EVIDENCE_REQUIRED']);
  assert.equal(mixed.task.runId, current.runId);
  assert.equal(mixed.action, null);
  const withoutConstraintEvidence = f.run('evaluate', { ...input,
    constraintReview: { ...controllerCheck, evidenceRefs: [] } });
  assert.equal(withoutConstraintEvidence.decision.type, 'blocked');
  assert.deepEqual(withoutConstraintEvidence.decision.reasons, ['CONSTRAINTS_NOT_CONFIRMED']);
  const confirmedByController = { ...input, checks: input.checks.map(check =>
    ({ ...check, evidenceRefs: [workerEvidence], note: 'Read the cited source and confirmed the criterion.' })) };
  const complete = f.run('evaluate', confirmedByController);
  assert.equal(complete.decision.type, 'complete');
  assert.equal(complete.task.accepted, true);
  assert.equal(complete.task.resultReviewed, true);
  assert.deepEqual(complete.task.verification.evidenceRefs, [workerEvidence, ...controllerCheck.evidenceRefs]);
  assert.equal(complete.action.type, 'archive');
  assert.deepEqual(f.history().slice(-4), ['evaluate', 'verify', 'accept', 'archive']);
  assert.deepEqual(f.run('evaluate', confirmedByController), complete);
  f.record(complete);
  assert.equal(f.run('evaluate', confirmedByController).action, null);
});

test('explicit user decisions take priority and waits or unknown results prevent automatic work', t => {
  const f = fixture(t);
  const plan = f.run('dispatch', f.request);
  f.record(plan);
  const current = f.terminal(plan.task.runId, 'result').task;
  const input = f.evaluation(current);
  f.run('observe', { ...scope, runId: current.runId, eventId: 'approval-event',
    evidenceRef: 'fixture:approval', waitId: 'approval', status: 'waiting_approval' });
  const userDecision = { kind: 'authorization', question: 'May the worker access the report?' };
  const needsUser = f.run('evaluate', { ...input, userDecision });
  assert.equal(needsUser.decision.type, 'needs_user');
  assert.equal(needsUser.decision.question, userDecision.question);
  assert.equal(needsUser.action, null);
  const waiting = f.run('evaluate', input);
  assert.equal(waiting.decision.type, 'blocked');
  assert.ok(waiting.decision.reasons.includes('UNRESOLVED_WAITS'));
  f.run('resolve', { ...scope, runId: current.runId, waitId: 'approval', evidenceRef: 'fixture:user-approval' });
  assert.equal(f.run('evaluate', input).decision.type, 'blocked');
  f.run('observe', { ...scope, runId: current.runId, eventId: 'unknown-event', evidenceRef: 'fixture:unknown', status: 'unknown' });
  const unknown = f.run('evaluate', input);
  assert.equal(unknown.decision.type, 'blocked');
  assert.ok(unknown.decision.reasons.includes('RECONCILIATION_REQUIRED'));
  const fresh = f.terminal(current.runId, 'fresh').task;
  assert.equal(f.run('evaluate', f.evaluation(fresh)).decision.type, 'complete');
});

test('revoked send authorization blocks escalation and suppresses replay of a pending send plan', t => {
  const f = fixture(t);
  const plan = f.run('dispatch', f.request);
  f.record(plan);
  const current = f.terminal(plan.task.runId, 'result').task;
  const input = f.evaluation(current, { checks: [
    { id: 'report', status: 'uncertain', evidenceRefs: [], note: 'Unable to confirm the total.' },
    { id: 'format', ...controllerCheck },
  ] });
  f.run('evaluate', input, 'CONTROLLER_REQUIRED', worker);
  f.run('project', { ...f.project, authorization: { ...f.project.authorization, sendFollowups: false } });
  const blocked = f.run('evaluate', input);
  assert.equal(blocked.decision.type, 'blocked');
  assert.ok(blocked.decision.reasons.includes('AUTHORIZATION_REQUIRED'));
  assert.equal(blocked.action, null);
  f.run('project', f.project);
  const retry = f.run('evaluate', input);
  assert.equal(retry.decision.type, 'retry');
  f.run('project', { ...f.project, authorization: { ...f.project.authorization, sendFollowups: false } });
  assert.equal(f.run('evaluate', input).action, null);
  f.run('project', f.project);
  assert.equal(f.run('evaluate', input).action.id, retry.action.id);
});
