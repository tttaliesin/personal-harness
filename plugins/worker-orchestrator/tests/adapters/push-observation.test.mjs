import test from 'node:test';
import assert from 'node:assert/strict';
import {capabilityDescription, hostCallFor, observationFromPush} from '../../src/adapters/codex-desktop/index.mjs';

const worker = {threadId: 'worker', hostId: 'local', projectId: 'p', taskId: 't', runId: 'r', turnId: 'turn'};
const report = {
  runId: worker.runId,
  status: 'completed',
  summary: 'Wrote F:\\project\\report.json',
  verification: {status: 'passed', evidenceRefs: ['worker-evidence']},
  pendingRequests: [{id: 'request', kind: 'approval', summary: 'Check the pending request'}]
};
const resultEvent = {
  eventId: 'result-event', kind: 'result', projectId: worker.projectId, taskId: worker.taskId, runId: worker.runId,
  hostId: worker.hostId, workerThreadId: worker.threadId, workerTurnId: worker.turnId, result: report
};
const approvalEvent = {
  eventId: 'approval-event', kind: 'approval', projectId: worker.projectId,
  hostId: worker.hostId, workerThreadId: worker.threadId, workerTurnId: worker.turnId
};
const finalItem = {
  type: 'agentMessage', phase: 'final_answer', id: 'final', text: JSON.stringify(report, null, 2)
};
const read = {
  thread: {id: worker.threadId, hostId: worker.hostId, status: {type: 'idle'}},
  page: {limit: 1, hasMore: true},
  turns: [{id: worker.turnId, status: 'completed', items: [
    {type: 'agentMessage', phase: 'commentary', id: 'progress', text: 'Checking'}, finalItem
  ]}]
};
const evidenceRef = 'trusted-read.json';
const observe = (event, response = read, ref = worker) => observationFromPush(event, ref, response, evidenceRef);
const withTurn = fields => ({...read, turns: [{...read.turns[0], ...fields}]});
const approvalRead = (...activeFlags) => ({
  ...withTurn({status: 'inProgress', items: []}),
  thread: {...read.thread, status: {type: 'active', activeFlags}}
});

test('capabilities advertise push delivery and retain optional legacy wait parsing', () => {
  const capabilities = capabilityDescription();
  assert.ok(capabilities.supports.includes('push-event'));
  assert.ok(capabilities.supports.includes('observe'));
  assert.ok(capabilities.requiredTools.includes('read_thread'));
  assert.ok(!capabilities.requiredTools.includes('wait_threads'));
  assert.ok(capabilities.optionalTools.includes('wait_threads'));
  assert.match(capabilities.pushEvent.wake, /start or resume its turn/);
});

test('only a complete dispatch push context adds the one-shot result callback', () => {
  const controllerRef = {threadId: 'controller', hostId: worker.hostId};
  const push = {
    projectRoot: 'F:/project', projectId: worker.projectId, taskId: worker.taskId, runId: worker.runId,
    hostId: worker.hostId, controllerRef, authorizationSource: 'user delegation'
  };
  const action = {
    type: 'create', hostProjectId: 'desktop-p', projectId: worker.projectId, taskId: worker.taskId,
    runId: worker.runId, profile: {model: 'test-model', thinking: 'high'}, prompt: 'Check the fixture'
  };
  for (const dispatch of [action, {...action, type: 'send', workerRef: worker}]) {
    const legacy = hostCallFor(dispatch).arguments.prompt;
    assert.doesNotMatch(legacy, /push-result|send_message_to_thread/);
    assert.ok(legacy.endsWith('\n\nCheck the fixture'));
    for (const field of Object.keys(push)) {
      assert.equal(hostCallFor({...dispatch, push: {...push, [field]: undefined}}).arguments.prompt, legacy, field);
    }
    assert.equal(hostCallFor({...dispatch, push: {...push, runId: 'past-run'}}).arguments.prompt, legacy);
    assert.equal(hostCallFor({...dispatch, controllerRef, push: {...push,
      controllerRef: {...controllerRef, threadId: 'different-controller'}}}).arguments.prompt, legacy);
    const prompt = hostCallFor({...dispatch, push}).arguments.prompt;
    assert.ok(prompt.includes(JSON.stringify(push)));
    assert.match(prompt, /push-result --input -[^\n]*workerTurnId[^\n]*CODEX_THREAD_ID[^\n]*workerThreadId/);
    assert.match(prompt, /send_message_to_thread[^\n]*한 번[\s\S]*동일한 원문 JSON/);
    assert.doesNotMatch(prompt, /read_thread|wait_threads|create_thread|set_thread_archived/);
  }
});

test('a terminal read returns the matched report, original evidence and turn for the existing observe path', () => {
  const {summary, ...rest} = report;
  const event = {...resultEvent, result: {...rest, summary}};
  const expected = {state: 'ready', observation: {
    runId: worker.runId, eventId: resultEvent.eventId, status: 'completed', evidenceRef, hostTurnId: worker.turnId,
    workerReport: report, result: {success: true, summary: finalItem.text}
  }};
  assert.deepEqual(observe(event), expected);
  assert.deepEqual(observe(event, {structuredContent: read}), expected);
  assert.deepEqual(observe(event, JSON.stringify({content: [{type: 'text', text: JSON.stringify(read)}]})), expected);
  const interrupted = observe(event, withTurn({status: 'interrupted'}));
  assert.equal(interrupted.observation.status, 'failed');
  assert.equal(interrupted.observation.result.success, false);
  assert.deepEqual(interrupted.observation.workerReport.pendingRequests, report.pendingRequests);
});

test('result event remains pending before native completion or when the final report disagrees', () => {
  const check = (reason, result = resultEvent, response = read) =>
    assert.deepEqual(observe(result, response), {state: 'pending', reason});
  check('RESULT_TURN_NOT_TERMINAL', resultEvent, withTurn({status: 'inProgress'}));
  check('FINAL_REPORT_RESULT_MISMATCH', {...resultEvent, result: {...report, summary: 'Different result'}});
  check('FINAL_REPORT_RUN_MISMATCH', resultEvent,
    withTurn({items: [{...finalItem, text: JSON.stringify({...report, runId: 'other-run'})}]}));
  for (const items of [[], [finalItem, {...finalItem, id: 'duplicate'}], [{...finalItem, phase: 'commentary'}],
    [{...finalItem, truncated: true}], [{...finalItem, turnId: 'other-turn'}]]) {
    check('INVALID_FINAL_REPORT', resultEvent, withTurn({items}));
  }
});

test('push event and read evidence must refer to the registered worker, scope, and single current turn', () => {
  for (const [field, reason] of [
    ['workerThreadId', 'EVENT_THREAD_MISMATCH'], ['hostId', 'EVENT_HOST_MISMATCH'],
    ['projectId', 'EVENT_PROJECT_MISMATCH'], ['taskId', 'EVENT_TASK_MISMATCH'],
    ['runId', 'EVENT_RUN_MISMATCH'], ['workerTurnId', 'EVENT_TURN_MISMATCH']
  ]) {
    assert.deepEqual(observe({...resultEvent, [field]: 'different'}), {state: 'pending', reason});
  }
  for (const [response, reason] of [
    [{...read, thread: {...read.thread, id: 'different'}}, 'READ_THREAD_ID_MISMATCH'],
    [{...read, thread: {...read.thread, hostId: 'different'}}, 'READ_THREAD_HOST_MISMATCH'],
    [withTurn({id: 'different'}), 'READ_THREAD_TURN_MISMATCH'],
    [{...read, turns: [...read.turns, ...read.turns]}, 'READ_THREAD_SCOPE_MISMATCH'],
    [{...read, turns: []}, 'READ_THREAD_SCOPE_MISMATCH'],
    [{...read, page: {limit: 5}}, 'READ_THREAD_SCOPE_MISMATCH'],
    [withTurn({truncated: true}), 'READ_THREAD_SCOPE_MISMATCH'],
    [{structuredContent: read, isError: true}, 'READ_THREAD_UNAVAILABLE']
  ]) {
    assert.deepEqual(observe(resultEvent, response), {state: 'pending', reason});
  }
  assert.deepEqual(observationFromPush(resultEvent, worker, read, ''),
    {state: 'pending', reason: 'MISSING_READ_THREAD_EVIDENCE'});
});

test('approval events get independent wait IDs only for a flagged active turn and settle after that turn ends', () => {
  const first = observe(approvalEvent, approvalRead('waitingOnApproval'));
  const second = observe({...approvalEvent, eventId: 'approval-event-2'},
    approvalRead({type: 'waitingOnApproval', requestId: 'native-approval'}));
  for (const [id, result] of [[approvalEvent.eventId, first], ['approval-event-2', second]]) {
    assert.deepEqual(result, {state: 'ready', observation: {
      runId: worker.runId, status: 'waiting_approval', eventId: id, waitId: id, waits: [{waitId: id, kind: 'approval'}],
      hostTurnId: worker.turnId, evidenceRef
    }});
  }
  for (const response of [approvalRead(), approvalRead('waitingOnUserInput'),
    {...withTurn({status: 'inProgress'}), thread: {...read.thread, status: {type: 'idle', activeFlags: ['waitingOnApproval']}}}]) {
    assert.deepEqual(observe(approvalEvent, response), {state: 'pending', reason: 'APPROVAL_FLAG_NOT_VISIBLE'});
  }
  assert.deepEqual(observe(approvalEvent, withTurn({id: 'another-turn'})),
    {state: 'pending', reason: 'READ_THREAD_TURN_MISMATCH'});
  for (const status of ['completed', 'failed', 'interrupted']) {
    assert.deepEqual(observe(approvalEvent, {...approvalRead('waitingOnApproval'), turns: withTurn({status}).turns}),
      {state: 'settled', reason: 'APPROVAL_TURN_ENDED'});
  }
});
