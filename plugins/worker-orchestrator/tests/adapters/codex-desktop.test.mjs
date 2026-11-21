import test from 'node:test';
import assert from 'node:assert/strict';
import {hostCallFor,receiptFromHost,observationFromWait} from '../../src/adapters/codex-desktop/index.mjs';
const workerRef={threadId:'worker-1',hostId:'local'};
const action={id:'action-1',type:'create',projectId:'p',taskId:'t',runId:'r',hostProjectId:'desktop-p',projectRoot:'F:/project',controllerRef:{threadId:'controller',hostId:'local'},profile:{model:'test-model',thinking:'high'},prompt:'Check the fixture'};
const envelope = payload => ({content: [{type: 'text', text: JSON.stringify(payload)}], isError: false});
const terminalPoll = {
  thread: {id: workerRef.threadId, hostId: workerRef.hostId, status: {type: 'idle'}},
  cursor: 'c2',
  latestTurn: {id: 'turn-1', status: 'completed'}
};
const completedResult = {
  runId: 'r', status: 'completed', summary: 'done',
  verification: {status: 'passed', evidenceRefs: ['worker-evidence']}, pendingRequests: []
};
const finalMessage = result => ({
  id: 'message-1', text: JSON.stringify(result), turnId: terminalPoll.latestTurn.id, phase: 'final_answer'
});
const activeThread = (...activeFlags) => ({
  ...terminalPoll.thread, status: {type: 'active', activeFlags}
});
const observePoll = (poll, evidenceRef = 'evidence', readBack) =>
  observationFromWait({polls: [poll]}, workerRef, 'r', evidenceRef, readBack);
const windowsResult = {...completedResult, summary: 'Wrote F:\\sample\\report.json'};
const compactWindowsPoll = {
  ...terminalPoll,
  latestAssistantMessageId: 'message-1',
  latestAssistantMessage: {
    ...finalMessage(windowsResult), text: JSON.stringify(windowsResult).replaceAll('\\\\', '\\')
  }
};
const alternateHostPoll = {
  ...compactWindowsPoll,
  thread: {...activeThread('waitingOnApproval'), hostId: 'remote-control:example'}
};

function readThreadPayload(result = windowsResult, status = 'completed') {
  const {id, text, phase} = finalMessage(result);
  return {
    thread: terminalPoll.thread,
    page: {limit: 1, hasMore: true},
    turns: [{...terminalPoll.latestTurn, status, items: [
      {type: 'agentMessage', id: 'commentary-1', phase: 'commentary', text: 'Checking the fixture'},
      {type: 'agentMessage', id, text, phase}
    ]}]
  };
}

const readBackFrom = (hostResult = readThreadPayload()) => ({hostResult, evidenceRef: 'read-evidence'});

test('creates a local project conversation with explicit execution settings',()=>{
 const call=hostCallFor(action); assert.equal(call.arguments.target.projectId,'desktop-p'); assert.equal(call.arguments.model,'test-model');assert.equal(call.arguments.thinking,'high');assert.match(call.arguments.prompt,/runId: r/);
 assert.ok(call.arguments.prompt.endsWith('\n\nCheck the fixture'));
 assert.doesNotMatch(call.arguments.prompt, /작업 명세|재시도 판정 근거/);
});
test('includes the structured assignment in the Desktop create and send prompts', () => {
  const workSpec = {
    goal: 'Validate the fixture',
    constraints: ['Use the current test fixture only'],
    completionCriteria: [
      { id: 'fixture-output', description: 'Confirm the fixture output' },
      { id: 'fixture-status', description: 'Confirm the fixture exit status' }
    ]
  };
  for (const dispatch of [action, {...action, type: 'send', workerRef}]) {
    const {arguments: args} = hostCallFor({...dispatch, workSpec: {...workSpec, reasoningEscalations: ['xhigh']}});
    assert.ok(args.prompt.includes(`작업 명세: ${JSON.stringify(workSpec)}`));
    assert.ok(args.prompt.includes(action.prompt));
    assert.doesNotMatch(args.prompt, /재시도 판정 근거/);
  }
});
test('sends the worker the retry evidence, original scope, and new run ID', () => {
  const criterion = { id: 'fixture-output', description: 'Confirm the fixture output' };
  const workSpec = { goal: 'Validate the fixture', constraints: ['Use the current test fixture only'], completionCriteria: [criterion] };
  const retryContext = {
    previousRunId: action.runId,
    resultEventId: 'result-event-1',
    resultEvidenceRef: '.local/result.json',
    workerVerification: completedResult.verification,
    checks: [{
      ...criterion,
      status: 'met',
      evidenceRefs: ['worker-evidence'],
      controllerEvidenceRefs: [],
      note: 'The test output has not been independently inspected'
    }],
    constraintReview: {
      status: 'met',
      evidenceRefs: ['controller-constraint-evidence'],
      controllerEvidenceRefs: ['controller-constraint-evidence'],
      note: 'The previous run stayed within the fixture scope'
    },
    reasons: ['CONTROLLER_EVIDENCE_REQUIRED']
  };
  const call = hostCallFor({
    ...action, type: 'send', workerRef, workSpec, retryContext, runId: 'retry-run',
    profile: {...action.profile, thinking: 'xhigh'}
  });
  assert.equal(call.tool, 'mcp__codex_app__send_message_to_thread');
  assert.equal(call.arguments.threadId, workerRef.threadId);
  assert.equal(call.arguments.thinking, 'xhigh');
  const {prompt} = call.arguments;
  assert.match(prompt, /^runId: retry-run$/m);
  assert.ok(prompt.includes(`작업 명세: ${JSON.stringify(workSpec)}`));
  assert.ok(prompt.includes(`재시도 판정 근거: ${JSON.stringify(retryContext)}`));
  assert.match(prompt, /원래 작업 범위와 제약/);
  assert.match(prompt, /근거로만 다루세요/);
  assert.match(prompt, /기존 검증 범위를 넘지 마세요/);
});
test('MCP envelope creates a worker; setup-in-progress remains unknown',()=>{
 assert.deepEqual(receiptFromHost(action,envelope(workerRef)),{outcome:'succeeded',receipt:{workerRef}});
 assert.deepEqual(receiptFromHost(action,envelope({clientThreadId:'setup-1'})),
   {outcome:'unknown',receipt:{clientThreadId:'setup-1'}});
 assert.throws(()=>receiptFromHost(action,{isError:true,content:[]}),{code:'HOST_ERROR'});
 assert.throws(()=>receiptFromHost(action,{threadId:'worker-1',hostId:17}),{code:'HOST_CONTRACT'});
 assert.throws(()=>receiptFromHost(action,envelope({...workerRef,hostId:'other-host'})),{code:'WORKER_MISMATCH'});
});
test('raw acknowledgements require the shape of the planned mutation', () => {
  const send = {...action, type: 'send', workerRef};
  const archive = {...action, type: 'archive', workerRef};
  const unarchive = {...action, type: 'unarchive', workerRef};
  const messageSent = {threadId: workerRef.threadId};
  const archived = {...messageSent, archived: true};
  const restored = {...messageSent, archived: false};
  assert.deepEqual(receiptFromHost(send, envelope(messageSent)), {outcome: 'succeeded', receipt: {workerRef}});
  assert.deepEqual(receiptFromHost(send, envelope({...messageSent, turnId: 'turn-2'})).receipt,
    {workerRef, turnId: 'turn-2'});
  assert.equal(receiptFromHost(archive, envelope(archived)).receipt.archived, true);
  assert.equal(receiptFromHost(unarchive, envelope(restored)).receipt.archived, false);
  for (const payload of [messageSent, archived, restored, {...workerRef, archived: false}, {...workerRef, turnId: 'turn-2'}]) {
    assert.throws(() => receiptFromHost(action, envelope(payload)), {code: 'HOST_CONTRACT'});
  }
  for (const payload of [workerRef, archived, restored, {clientThreadId: 'setup-1'}, {thread: {id: workerRef.threadId}}]) {
    assert.throws(() => receiptFromHost(send, envelope(payload)), {code: 'HOST_CONTRACT'});
  }
  assert.throws(() => receiptFromHost(archive, envelope(workerRef)), {code: 'HOST_CONTRACT'});
});
test('rejects archive receipts for another worker or wrong archive state',()=>{
 const archive={...action,type:'archive',workerRef};
 assert.throws(()=>receiptFromHost(archive,{threadId:'other',archived:true}),{code:'WORKER_MISMATCH'});
 assert.throws(()=>receiptFromHost(archive,{threadId:'worker-1',archived:false}),{code:'HOST_CONTRACT'});
 assert.equal(receiptFromHost(archive,{threadId:'worker-1',archived:true}).receipt.archived,true);
});
test('idle alone is not completed and attention takes precedence over a previous completed turn',()=>{
 const base={thread:{id:'worker-1',hostId:'local',status:{type:'idle'}},cursor:'c1'};
 assert.equal(observationFromWait({polls:[base]},workerRef,'r','evidence').status,'unknown');
 const waiting={...base,thread:{...base.thread,status:{type:'active',activeFlags:['waitingOnApproval']}},latestTurn:{id:'turn-1',status:'completed'}};
 assert.equal(observationFromWait({polls:[waiting]},workerRef,'r','evidence').status,'waiting_approval');
});
test('completed result stays observation evidence and never claims verification', () => {
  const message = finalMessage(completedResult);
  const raw = envelope({polls: [{...terminalPoll, latestAssistantMessage: message}]});
  const observation = observationFromWait(raw, workerRef, 'r', 'evidence');
  assert.equal(observation.status, 'completed');
  assert.deepEqual(observation.result, {success: true, summary: message.text});
  assert.equal(observation.verification, undefined);
});
test('a completed model turn with failed work or pending questions is not successful work', () => {
  const observe = result => observationFromWait(
    {polls: [{...terminalPoll, latestAssistantMessage: finalMessage(result)}]}, workerRef, 'r', 'evidence'
  );
  const failed = observe({...completedResult, status: 'failed', summary: 'tests failed'});
  assert.equal(failed.status, 'failed');
  assert.equal(failed.result.success, false);
  const waiting = observe({...completedResult, pendingRequests: [{id: 'question-1', kind: 'input', summary: 'Answer required'}]});
  assert.equal(waiting.status, 'waiting_input');
  assert.equal(waiting.waitId, 'question-1');
  assert.deepEqual(waiting.waits, [{waitId: 'question-1', kind: 'input'}]);
  assert.equal(waiting.result, undefined);
});
test('keeps worker requests in source order and adds distinct host waits', () => {
  const poll = {
    ...terminalPoll,
    thread: activeThread('waitingOnApproval', {type: 'waitingOnApproval', requestId: 'approval-1'},
      'waitingOnUserInput', {type: 'waitingOnUserInput', id: 'host-input'}),
    latestAssistantMessage: finalMessage({...completedResult, pendingRequests: [
      {id: 'question-1', kind: 'input', summary: 'First question'},
      {id: 'approval-1', kind: 'approval', summary: 'Approval required'},
      {id: 'question-2', kind: 'input', summary: 'Second question'}
    ]})
  };
  const observation = observePoll(poll);
  assert.deepEqual(observation.waits, [
    {waitId: 'question-1', kind: 'input'},
    {waitId: 'approval-1', kind: 'approval'},
    {waitId: 'question-2', kind: 'input'},
    {waitId: 'host-input', kind: 'input'}
  ]);
  assert.equal(observation.status, 'waiting_input');
  assert.equal(observation.waitId, 'question-1');
  assert.equal(observation.result, undefined);
});
test('uses explicit flag IDs and suppresses anonymous flags of the same kind', () => {
  const observation = observePoll({...terminalPoll, thread: activeThread(
    'waitingOnApproval',
    {type: 'waitingOnUserInput', requestId: 'host-question', id: 'flag-id'},
    {type: 'waitingOnApproval', requestId: 0},
    {type: 'waitingOnApproval', requestId: '', id: 'next-approval'}
  )});
  assert.deepEqual(observation.waits, [
    {waitId: 'host-question', kind: 'input'},
    {waitId: '0', kind: 'approval'},
    {waitId: 'next-approval', kind: 'approval'}
  ]);
  assert.equal(observation.status, 'waiting_input');
  assert.equal(observation.waitId, 'host-question');
});
test('keeps anonymous wait IDs stable across snapshots and distinguishes their observations', () => {
  const poll = {...terminalPoll, thread: activeThread('waitingOnApproval',
    {type: 'waitingOnUserInput'}, 'waitingOnApproval')};
  const observation = observePoll(poll);
  assert.deepEqual(observation.waits, [
    {waitId: 'codex:turn-1:waiting_approval', kind: 'approval', anonymous: true},
    {waitId: 'codex:turn-1:waiting_input', kind: 'input', anonymous: true}
  ]);
  assert.equal(observation.status, 'waiting_approval');
  assert.equal(observation.waitId, observation.waits[0].waitId);
  assert.equal(observePoll({...poll, changed: false}, 'replay').eventId, observation.eventId);

  const laterSnapshot = observePoll({...poll, cursor: 'c3'});
  assert.deepEqual(laterSnapshot.waits, observation.waits);
  assert.notEqual(laterSnapshot.eventId, observation.eventId);

  const approvalOnly = observePoll({...poll, thread: activeThread('waitingOnApproval')});
  assert.equal(approvalOnly.hostCursor, observation.hostCursor);
  assert.equal(approvalOnly.waitId, observation.waitId);
  assert.notEqual(approvalOnly.eventId, observation.eventId);

  const laterTurn = observePoll({...poll, latestTurn: {...poll.latestTurn, id: 'turn-2'}});
  assert.deepEqual(laterTurn.waits.map(wait => wait.waitId), [
    'codex:turn-2:waiting_approval', 'codex:turn-2:waiting_input'
  ]);
});
test('ignores stale worker requests when the host reports attention', () => {
  const observation = observePoll({
    ...terminalPoll,
    thread: activeThread('waitingOnApproval'),
    latestAssistantMessage: finalMessage({...completedResult, runId: 'old-run', pendingRequests: [
      {id: 'old-approval', kind: 'approval', summary: 'Prior run approval'},
      {id: 'old-question', kind: 'input', summary: 'Prior run question'}
    ]})
  });
  assert.deepEqual(observation.waits, [
    {waitId: 'codex:turn-1:waiting_approval', kind: 'approval', anonymous: true}
  ]);
});
test('malformed or nonfinal worker replies cannot become terminal results', () => {
  const request = {id: 'approval-1', kind: 'approval', summary: 'Approval required'};
  const valid = finalMessage(completedResult);
  const broken = compactWindowsPoll.latestAssistantMessage;
  const malformed = [
    ['missing requests', finalMessage({...completedResult, pendingRequests: undefined})],
    ['requests as an object', finalMessage({...completedResult, pendingRequests: request})],
    ['null request', finalMessage({...completedResult, pendingRequests: [null]})],
    ['invalid request id', finalMessage({...completedResult, pendingRequests: [{...request, id: ''}]})],
    ['invalid request kind', finalMessage({...completedResult, pendingRequests: [{...request, kind: 'other'}]})],
    ['missing request summary', finalMessage({...completedResult, pendingRequests: [{...request, summary: undefined}]})],
    ['wait without requests', finalMessage({...completedResult, status: 'waiting_approval'})],
    ['invalid verification', finalMessage({...completedResult, verification: {status: 'passed'}})],
    ['missing summary', finalMessage({...completedResult, summary: undefined})],
    ['unexpected result field', finalMessage({...completedResult, extra: true})],
    ['stale run', finalMessage({...completedResult, runId: 'old-run'})],
    ['commentary', {...valid, phase: 'commentary'}],
    ['different turn', {...valid, turnId: 'previous-turn'}],
    ['decode failure without a message ID', {...broken, id: undefined}],
    ['decode failure without a turn ID', {...broken, turnId: undefined}],
    ['commentary decode failure', {...broken, phase: 'commentary'}],
    ['decode failure on a different turn', {...broken, turnId: 'previous-turn'}]
  ];
  for (const [label, latestAssistantMessage] of malformed) {
    const poll = {...terminalPoll, latestAssistantMessage};
    const observation = observePoll(poll);
    assert.equal(observation.status, 'unknown', label);
    assert.equal(observation.result, undefined, label);
    assert.equal(observation.readThread, undefined, label);
    assert.deepEqual(observePoll(poll, 'evidence', readBackFrom()), observation, label);
  }
});
test('recovers Windows-path JSON from the exact original final message', () => {
  assert.throws(() => JSON.parse(compactWindowsPoll.latestAssistantMessage.text), SyntaxError);
  const compact = observePoll(compactWindowsPoll);
  assert.equal(compact.status, 'unknown');
  assert.equal(compact.result, undefined);
  assert.equal(compact.evidenceRef, 'evidence');
  assert.deepEqual(compact.readThread, {
    ...workerRef, turnLimit: 1, includeOutputs: false, maxOutputCharsPerItem: 12000
  });

  const readBack = readBackFrom(envelope(readThreadPayload()));
  const recovered = observePoll(compactWindowsPoll, 'evidence', readBack);
  assert.equal(recovered.status, 'completed');
  assert.deepEqual(recovered.result, {success: true, summary: finalMessage(windowsResult).text});
  assert.equal(recovered.evidenceRef, readBack.evidenceRef);
  assert.equal(recovered.readThread, undefined);
  assert.equal(recovered.hostTurnId, compact.hostTurnId);
  assert.equal(recovered.hostCursor, compact.hostCursor);
  assert.notEqual(recovered.eventId, compact.eventId);
  assert.deepEqual(observePoll(compactWindowsPoll, 'evidence', readBack), recovered);

  const validPoll = {...compactWindowsPoll, latestAssistantMessage: finalMessage(completedResult)};
  assert.deepEqual(observePoll(validPoll, 'evidence', readBack), observePoll(validPoll));
});
test('rejects uncorrelated, failed, truncated, or invalid originals without requesting a second read', () => {
  const original = readThreadPayload();
  const [turn] = original.turns;
  const message = turn.items.at(-1);
  const withTurn = fields => ({...original, turns: [{...turn, ...fields}]});
  const withMessage = fields => withTurn({items: [{...message, ...fields}]});
  const unusableReads = [
    ['host error', {...envelope(original), isError: true}],
    ['bad envelope', {content: [{type: 'text', text: '{"turns": ['}]}],
    ['wrong thread', {...original, thread: {...original.thread, id: 'another-worker'}}],
    ['wrong host', {...original, thread: {...original.thread, hostId: 'another-host'}}],
    ['missing host', {...original, thread: {...original.thread, hostId: undefined}}],
    ['wrong turn', withTurn({id: 'later-turn'})],
    ['wrong status', withTurn({status: 'failed'})],
    ['wrong message', withMessage({id: 'another-message'})],
    ['wrong item type', withMessage({type: 'userMessage'})],
    ['wrong phase', withMessage({phase: 'commentary'})],
    ['ambiguous message', withTurn({items: [message, message]})],
    ['truncated text', withMessage({text: message.text.slice(0, -1)})],
    ['truncation marker', withMessage({truncated: true})],
    ['stale run', readThreadPayload({...windowsResult, runId: 'old-run'})],
    ['invalid worker-result schema', readThreadPayload({...windowsResult, pendingRequests: null})]
  ];
  const compact = observePoll(compactWindowsPoll);
  for (const [label, hostResult] of unusableReads) {
    const observation = observePoll(compactWindowsPoll, 'evidence', readBackFrom(hostResult));
    assert.equal(observation.status, 'unknown', label);
    assert.equal(observation.result, undefined, label);
    assert.equal(observation.readThread, undefined, label);
    assert.equal(observation.evidenceRef, 'evidence', label);
    assert.equal(observation.eventId, compact.eventId, label);
  }
});
test('retains host waits on a failed read and honors requests in a matching original', () => {
  const poll = {...compactWindowsPoll, thread: activeThread({type: 'waitingOnApproval', id: 'approval-1'})};
  const compact = observePoll(poll);
  assert.equal(compact.status, 'waiting_approval');
  assert.equal(compact.readThread.hostId, workerRef.hostId);
  assert.deepEqual(compact.waits, [{waitId: 'approval-1', kind: 'approval'}]);

  const failed = observePoll(poll, 'evidence', readBackFrom({isError: true}));
  assert.equal(failed.status, 'waiting_approval');
  assert.deepEqual(failed.waits, compact.waits);
  assert.equal(failed.readThread, undefined);

  const original = readThreadPayload({...windowsResult, pendingRequests: [
    {id: 'question-1', kind: 'input', summary: 'Answer required'}
  ]});
  original.thread = activeThread({type: 'waitingOnUserInput', id: 'host-question'});
  const recovered = observePoll(poll, 'evidence', readBackFrom(original));
  assert.equal(recovered.status, 'waiting_input');
  assert.deepEqual(recovered.waits, [
    {waitId: 'question-1', kind: 'input'},
    {waitId: 'approval-1', kind: 'approval'},
    {waitId: 'host-question', kind: 'input'}
  ]);
  assert.equal(recovered.result, undefined);
  assert.equal(recovered.evidenceRef, 'read-evidence');
});
test('only requests originals for terminal turns with consistent compact keys', () => {
  const running = observePoll({...compactWindowsPoll, latestTurn: {...terminalPoll.latestTurn, status: 'inProgress'}});
  assert.equal(running.status, 'running');
  assert.equal(running.readThread, undefined);
  const inconsistent = observePoll({...compactWindowsPoll, latestAssistantMessageId: 'another-message'});
  assert.equal(inconsistent.status, 'unknown');
  assert.equal(inconsistent.readThread, undefined);

  for (const status of ['failed', 'interrupted']) {
    const poll = {...compactWindowsPoll, latestTurn: {...terminalPoll.latestTurn, status}};
    assert.equal(observePoll(poll).readThread.threadId, workerRef.threadId);
    const recovered = observePoll(poll, 'evidence', readBackFrom(readThreadPayload(windowsResult, status)));
    assert.equal(recovered.status, 'failed');
    assert.equal(recovered.result.success, false);
  }
});
test('an alternate host only supplies compact correlation keys for a read on the registered host', () => {
  const compact = observePoll(alternateHostPoll);
  assert.equal(compact.status, 'unknown');
  assert.equal(compact.waits, undefined);
  assert.equal(compact.hostCursor, undefined);
  assert.deepEqual(compact.readThread, {
    ...workerRef, turnLimit: 1, includeOutputs: false, maxOutputCharsPerItem: 12000
  });

  const original = readThreadPayload();
  const wrongHost = {...original, thread: {...original.thread, hostId: alternateHostPoll.thread.hostId}};
  const ignored = observePoll(alternateHostPoll, 'evidence', readBackFrom(wrongHost));
  assert.equal(ignored.status, 'unknown');
  assert.equal(ignored.waits, undefined);
  assert.equal(ignored.readThread, undefined);

  const readBack = readBackFrom(original);
  const recovered = observePoll(alternateHostPoll, 'evidence', readBack);
  assert.equal(recovered.status, 'completed');
  assert.equal(recovered.evidenceRef, readBack.evidenceRef);
  assert.notEqual(recovered.eventId, compact.eventId);
  assert.deepEqual(observePoll(alternateHostPoll, 'evidence', readBack), recovered);
});
test('prefers a matching registered poll, accepts omitted hosts, and limits other-host polls to recovery', () => {
  const validAlternate = {...alternateHostPoll, latestAssistantMessage: finalMessage(completedResult)};
  const compact = observePoll(validAlternate);
  assert.equal(compact.status, 'unknown');
  assert.equal(compact.result, undefined);
  assert.deepEqual(compact.readThread, {
    ...workerRef, turnLimit: 1, includeOutputs: false, maxOutputCharsPerItem: 12000
  });
  const observe = (...polls) => observationFromWait({polls}, workerRef, 'r', 'evidence');
  assert.throws(() => observe(alternateHostPoll, {...alternateHostPoll}), {code: 'HOST_CONTRACT'});
  assert.throws(() => observe({...alternateHostPoll, thread: {...alternateHostPoll.thread, id: 'another-worker'}}),
    {code: 'HOST_CONTRACT'});

  const strict = {...terminalPoll, latestAssistantMessage: finalMessage(completedResult)};
  const undeclared = {...strict, thread: {id: workerRef.threadId, status: strict.thread.status}};
  assert.deepEqual(observePoll(undeclared), observePoll(strict));
  assert.deepEqual(observe({...undeclared, cursor: 'earlier'}, strict), observePoll(strict));
  assert.deepEqual(observe(alternateHostPoll, strict), observePoll(strict));
  assert.deepEqual(observe(alternateHostPoll, terminalPoll), observePoll(terminalPoll));
  assert.deepEqual(observationFromWait({polls: [validAlternate, strict]}, workerRef, 'r', 'evidence', readBackFrom()),
    observePoll(strict));
});
test('a wait tool error stays unconfirmed when the original read fails or belongs to a prior run', () => {
  const raw = {
    isError: true,
    content: [{type: 'text', text: 'tool call error: tool call failed for `codex_app/wait_threads`\n\nCaused by:\n    Mcp error: -32000: Codex app tool request failed'}]
  };
  const observe = readBack => observationFromWait(raw, workerRef, 'r', 'wait-evidence', readBack);
  const lookup = observe();
  assert.equal(lookup.status, 'unknown');
  assert.deepEqual(lookup.readThread, {
    ...workerRef, turnLimit: 1, includeOutputs: false, maxOutputCharsPerItem: 12000
  });

  const unusableReads = [
    ['stale run', envelope(readThreadPayload({...completedResult, runId: 'old-run'}))],
    ['failed read', {isError: true, content: [{type: 'text', text: 'Codex app tool request failed'}]}]
  ];
  for (const [label, hostResult] of unusableReads) {
    const observation = observe(readBackFrom(hostResult));
    assert.equal(observation.status, 'unknown', label);
    assert.equal(observation.result, undefined, label);
    assert.equal(observation.evidenceRef, 'wait-evidence', label);
    assert.equal(observation.readThread, undefined, label);
  }
});
test('a valid alternate-host summary requires the matching original on the registered worker', () => {
  const poll = {
    ...alternateHostPoll,
    thread: {...terminalPoll.thread, hostId: 'remote-control:env_fixture'},
    latestAssistantMessage: finalMessage({...completedResult, summary: 'Compact summary'})
  };
  const originalResult = {...completedResult, summary: 'Original summary'};
  const original = readThreadPayload(originalResult);
  const [turn] = original.turns;
  const [commentary, message] = turn.items;
  const unusableReads = [
    ['wrong thread', {...original, thread: {...original.thread, id: 'another-worker'}}],
    ['wrong host', {...original, thread: {...original.thread, hostId: poll.thread.hostId}}],
    ['wrong turn', {...original, turns: [{...turn, id: 'another-turn'}]}],
    ['wrong message', {...original, turns: [{...turn, items: [commentary, {...message, id: 'another-message'}]}]}]
  ];
  for (const [label, hostResult] of unusableReads) {
    const observation = observePoll(poll, 'wait-evidence', readBackFrom(envelope(hostResult)));
    assert.equal(observation.status, 'unknown', label);
    assert.equal(observation.result, undefined, label);
    assert.equal(observation.evidenceRef, 'wait-evidence', label);
    assert.equal(observation.readThread, undefined, label);
  }

  const recovered = observePoll(poll, 'wait-evidence', readBackFrom(envelope(original)));
  assert.equal(recovered.status, 'completed');
  assert.deepEqual(recovered.result, {success: true, summary: message.text});
  assert.equal(recovered.evidenceRef, 'read-evidence');
});
test('reads a turn that finishes after the alternate-host snapshot showed commentary', () => {
  const commentary = {id: 'progress-1', turnId: 'turn-1', phase: 'commentary', text: 'Checking the fixture'};
  const poll = {
    ...alternateHostPoll,
    latestTurn: {...terminalPoll.latestTurn, status: 'inProgress'},
    latestAssistantMessageId: commentary.id,
    latestAssistantMessage: commentary
  };
  const original = readThreadPayload(completedResult);
  const lookup = observePoll(poll);
  assert.equal(lookup.status, 'unknown');
  assert.equal(lookup.readThread.hostId, workerRef.hostId);

  const recovered = observePoll(poll, 'wait-evidence', readBackFrom(JSON.stringify(original)));
  assert.equal(recovered.status, 'completed');
  assert.equal(recovered.evidenceRef, 'read-evidence');

  const latestIsDifferent = {...original, turns: [{...original.turns[0], id: 'turn-2'}]};
  const unconfirmed = observePoll(poll, 'wait-evidence', readBackFrom(latestIsDifferent));
  assert.equal(unconfirmed.status, 'unknown');
  assert.equal(unconfirmed.result, undefined);
});
test('recovery event identity follows the message across cursor and host changes', () => {
  const compact = observePoll(compactWindowsPoll);
  const nextMessage = {...compactWindowsPoll,
    latestAssistantMessageId: 'message-2', latestAssistantMessage: {...compactWindowsPoll.latestAssistantMessage, id: 'message-2'}};
  const next = observePoll(nextMessage);
  assert.equal(next.status, 'unknown');
  assert.deepEqual(next.readThread, compact.readThread);
  assert.notEqual(next.eventId, compact.eventId);

  const laterAlias = {...alternateHostPoll, cursor: 'later-cursor'};
  assert.equal(observePoll(laterAlias).eventId, compact.eventId);
  const readBack = readBackFrom();
  const recovered = observePoll(compactWindowsPoll, 'evidence', readBack);
  assert.equal(observePoll(laterAlias, 'evidence', readBack).eventId, recovered.eventId);
});
test('observation identity includes the run and final evidence at the same cursor', () => {
  const observe = (poll, runId = 'r', evidenceRef = 'evidence') =>
    observationFromWait({polls: [poll]}, workerRef, runId, evidenceRef);
  const compact = {...terminalPoll, changed: false};
  const full = {...terminalPoll, changed: true, latestAssistantMessage: finalMessage(completedResult)};
  const incomplete = observe(compact);
  const complete = observe(full);
  assert.equal(incomplete.status, 'unknown');
  assert.equal(complete.status, 'completed');
  assert.equal(incomplete.hostCursor, complete.hostCursor);
  assert.notEqual(incomplete.eventId, complete.eventId);
  assert.equal(observe(compact).eventId, incomplete.eventId);
  assert.equal(observe({...full, changed: false}, 'r', 'same-evidence-copy').eventId, complete.eventId);
  assert.notEqual(observe(compact, 'next-run').eventId, incomplete.eventId);
  const updated = {...full, latestAssistantMessage: finalMessage({...completedResult, summary: 'updated'})};
  assert.notEqual(observe(updated).eventId, complete.eventId);
});
test('a stale completed turn cannot complete a newly dispatched run',()=>{
 const poll={...terminalPoll,latestAssistantMessage:finalMessage({...completedResult,runId:'old-run'})};
 assert.equal(observationFromWait({polls:[poll]},workerRef,'new-run','evidence').status,'unknown');
 assert.equal(observationFromWait({polls:[{...poll,latestTurn:{...poll.latestTurn,status:'failed'}}]},workerRef,'new-run','evidence').status,'unknown');
 assert.equal(observationFromWait({polls:[{...poll,latestTurn:{...poll.latestTurn,status:'interrupted'}}]},workerRef,'new-run','evidence').status,'unknown');
});
