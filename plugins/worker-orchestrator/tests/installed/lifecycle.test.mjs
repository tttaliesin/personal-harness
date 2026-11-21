import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstallation } from './fixture.mjs';

test('relocated installed CLI persists a full synthetic lifecycle and restores the same worker for a fresh run', async () => {
  const fixture = await createInstallation('lifecycle-test');
  const scope = { projectId: 'installed-fixture', taskId: 'review' };
  const workerRef = { threadId: 'fixture-worker', hostId: 'local' };
  const profile = { model: 'fixture-model', thinking: 'high' };
  await fixture.cli('project', {
    projectId: scope.projectId,
    projectRoot: fixture.workspace,
    hostProjectId: 'fixture-desktop-project',
    controller: { threadId: 'fixture-controller', hostId: 'local' },
    authorization: {
      createWorkers: true, sendFollowups: true, archiveCompleted: true, restoreWorkers: true,
      source: 'Synthetic installed-copy test scope; no real host actions.',
    },
  });
  const request = { ...scope, requestId: 'fixture-request-1', prompt: 'Run the local synthetic fixture.', profile };
  const planned = await fixture.cli('dispatch', request);
  assert.equal(planned.action.type, 'create');
  assert.equal((await fixture.cli('dispatch', request)).action.id, planned.action.id);
  const run = { ...scope, runId: planned.action.runId };
  assert.equal(planned.hostCall.arguments.target.projectId, 'fixture-desktop-project');

  await fixture.cli('record', { ...scope, actionId: planned.action.id, hostResult: workerRef, evidenceRef: 'fixture:create-receipt' });
  await fixture.cli('observe', { ...run, eventId: 'approval-1', status: 'waiting_approval', waitId: 'fixture-approval', evidenceRef: 'fixture:approval-wait' });
  assert.equal((await fixture.cli('archive', run, { failure: true })).error.code, 'ACCEPTANCE_REQUIRED');
  await fixture.cli('resolve', { ...run, waitId: 'fixture-approval', evidenceRef: 'fixture:user-approved' });
  await fixture.cli('observe', { ...run, eventId: 'input-1', status: 'waiting_input', waitId: 'fixture-input', evidenceRef: 'fixture:input-wait' });
  await fixture.cli('resolve', { ...run, waitId: 'fixture-input', evidenceRef: 'fixture:user-answer' });

  const finalResult = { runId: run.runId, status: 'completed', summary: 'Synthetic fixture completed.', verification: { status: 'passed', evidenceRefs: ['fixture:test-output'] }, pendingRequests: [] };
  await fixture.cli('observe', {
    ...run,
    evidenceRef: 'fixture:wait-result',
    hostResult: { polls: [{
      thread: { id: workerRef.threadId, hostId: workerRef.hostId, status: { type: 'idle' } },
      cursor: 'fixture-cursor-1',
      latestTurn: { id: 'fixture-turn-1', status: 'completed' },
      latestAssistantMessage: { text: JSON.stringify(finalResult), turnId: 'fixture-turn-1' },
    }] },
  });
  assert.equal((await fixture.cli('accept', run, { failure: true })).error.code, 'VERIFICATION_REQUIRED');
  await fixture.cli('verify', { ...run, status: 'passed', evidenceRefs: ['fixture:test-output'] });
  await fixture.cli('accept', run);
  const archival = await fixture.cli('archive', run);
  assert.equal(archival.action.type, 'archive');
  await fixture.cli('record', { ...scope, actionId: archival.action.id, hostResult: { ...workerRef, archived: true }, evidenceRef: 'fixture:archive-receipt' });
  assert.equal((await fixture.cli('status', scope)).task.archived, true);

  const followup = await fixture.cli('dispatch', { ...request, requestId: 'fixture-request-2', prompt: 'Run a fresh synthetic follow-up.' });
  assert.equal(followup.action.type, 'unarchive');
  assert.notEqual(followup.action.runId, run.runId);
  assert.deepEqual(followup.action.workerRef, workerRef);
  assert.equal(followup.task.verification.status, 'unverified');
  assert.equal(followup.task.accepted, false);
  const restored = await fixture.cli('record', { ...scope, actionId: followup.action.id, hostResult: { ...workerRef, archived: false }, evidenceRef: 'fixture:restore-receipt' });
  assert.equal(restored.action.type, 'send');
  assert.deepEqual(restored.action.workerRef, workerRef);
  await fixture.cli('record', { ...scope, actionId: restored.action.id, hostResult: { threadId: workerRef.threadId }, evidenceRef: 'fixture:send-receipt' });
  const fresh = await fixture.cli('status', scope);
  assert.equal(fresh.task.runId, followup.action.runId);
  assert.deepEqual(fresh.task.workerRef, workerRef);
  assert.equal(fresh.task.archived, false);
  assert.equal(fresh.task.phase, 'running');
  assert.equal(fresh.task.verification.status, 'unverified');
  assert.equal(fresh.task.accepted, false);

  // A worker may already exist after an ambiguous create; repeated dispatch cannot resend it.
  const unknownScope = { ...scope, taskId: 'unknown-create' };
  const unknownRequest = { ...request, ...unknownScope, requestId: 'fixture-request-unknown' };
  const uncertain = await fixture.cli('dispatch', unknownRequest);
  await fixture.cli('record', { ...unknownScope, actionId: uncertain.action.id, outcome: 'unknown', evidenceRef: 'fixture:ambiguous-host-response' });
  const blocked = await fixture.cli('dispatch', unknownRequest);
  assert.equal(blocked.needsReconciliation, true);
  assert.equal(blocked.action, null);
  assert.equal(blocked.hostCall, undefined);
});
