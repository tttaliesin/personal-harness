import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const cli=fileURLToPath(new URL('../../src/cli/main.mjs',import.meta.url));
function fixture(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'worker-orchestrator-cli-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const run=(command,input)=>{
  const r=spawnSync(process.execPath,[cli,command,'--state-dir',path.join(root,'state'),'--input','-'],{input:JSON.stringify(input),encoding:'utf8'});
  assert.equal(r.error,undefined);return {code:r.status,json:JSON.parse(r.stdout)};
 };
 const project={projectId:'p',projectRoot:root,hostProjectId:'host-p',controller:{threadId:'controller',hostId:'local'},authorization:{createWorkers:true,sendFollowups:true,archiveCompleted:true,restoreWorkers:true,source:'test fixture authorized lifecycle'}};
 assert.equal(run('project',project).code,0);
 const dispatch={projectId:'p',taskId:'t',requestId:'req-1',prompt:'Probe',profile:{model:'test-host-model',thinking:'low'}};
 return {root,run,dispatch};
}
test('CLI records real envelope shape and gates archive until verification and acceptance',t=>{
 const {run,dispatch}=fixture(t);
 const planned=run('dispatch',dispatch);assert.equal(planned.code,0);assert.equal(planned.json.hostCall.tool,'mcp__codex_app__create_thread');
 const action=planned.json.action;
 const raw={content:[{type:'text',text:JSON.stringify({threadId:'worker',hostId:'local'})}]};
 const createRecord={projectId:'p',taskId:'t',actionId:action.id,hostResult:raw,evidenceRef:'fixture/create.json'};
 const bound=run('record',createRecord);assert.equal(bound.code,0);
 assert.deepEqual(run('record',createRecord),bound);
 assert.equal(run('record',{...createRecord,hostResult:{threadId:'different',hostId:'local'}}).json.error.code,
  'ACTION_REPLAY_MISMATCH');
 const scope={projectId:'p',taskId:'t',runId:action.runId};
 assert.notEqual(run('archive',scope).code,0);
 const text=JSON.stringify({runId:action.runId,status:'completed',summary:'done',verification:{status:'not_run',evidenceRefs:[]},pendingRequests:[]});
 const wait={polls:[{thread:{id:'worker',hostId:'local',status:{type:'idle'}},cursor:'c1',latestTurn:{id:'turn',status:'completed'},latestAssistantMessage:{text,turnId:'turn',phase:'final_answer'}}]};
 assert.equal(run('observe',{...scope,hostResult:wait,evidenceRef:'fixture/wait.json'}).code,0);
 assert.notEqual(run('accept',scope).code,0);
 assert.equal(run('verify',{...scope,status:'passed',evidenceRefs:['fixture/verified-marker.json']}).code,0);
 assert.equal(run('accept',scope).code,0);
 const archive=run('archive',scope);assert.equal(archive.json.hostCall.arguments.archived,true);
 const createReplayDuringArchive=run('record',createRecord);
 assert.equal(createReplayDuringArchive.code,0);
 assert.equal(createReplayDuringArchive.json.action,null);
 assert.equal(createReplayDuringArchive.json.task.pendingAction.id,archive.json.action.id);
 assert.equal(run('record',{...scope,actionId:archive.json.action.id,hostResult:{threadId:'worker',archived:true},evidenceRef:'fixture/archive.json'}).code,0);
 const follow=run('dispatch',{...dispatch,requestId:'req-2',prompt:'Follow up'});
 assert.equal(follow.json.action.type,'unarchive');assert.notEqual(follow.json.task.runId,action.runId);assert.equal(follow.json.task.verification.status,'unverified');
 const restoreRecord={projectId:'p',taskId:'t',actionId:follow.json.action.id,hostResult:{threadId:'worker',archived:false},evidenceRef:'fixture/unarchive.json'};
 const unarchived=run('record',restoreRecord);
 assert.equal(unarchived.code,0);assert.equal(unarchived.json.action.type,'send');assert.equal(unarchived.json.hostCall.arguments.threadId,'worker');
 assert.deepEqual(run('record',restoreRecord),unarchived);
 const sendRecord={...restoreRecord,actionId:unarchived.json.action.id,hostResult:{threadId:'worker'},evidenceRef:'fixture/send.json'};
 const sent=run('record',sendRecord);
 assert.equal(sent.code,0);
 assert.deepEqual(run('record',sendRecord),sent);
 assert.deepEqual(run('record',restoreRecord),sent);
});
test('unparseable host acknowledgement blocks repeat creation across CLI processes',t=>{
 const {run,dispatch}=fixture(t);const plan=run('dispatch',dispatch).json;
 const bad=run('record',{projectId:'p',taskId:'t',actionId:plan.action.id,hostResult:{isError:true,content:[]},evidenceRef:'fixture/ambiguous.json'});
 assert.equal(bad.code,1);assert.equal(bad.json.needsReconciliation,true);assert.equal(bad.json.action,null);
 const replay=run('dispatch',dispatch);assert.equal(replay.code,0);assert.equal(replay.json.action,null);assert.equal(replay.json.needsReconciliation,true);
});
test('invalid reasoning effort cannot leave an unexecutable persisted creation',t=>{
 const {run,dispatch}=fixture(t);const bad=run('dispatch',{...dispatch,profile:{model:'test',thinking:'invalid'}});
 assert.equal(bad.code,2);assert.equal(bad.json.error.code,'MODEL_SETTINGS');
 const valid=run('dispatch',dispatch);assert.equal(valid.code,0);assert.equal(valid.json.action.type,'create');
});
test('malformed host identity and domain-rejected host receipt both prevent retry creation',t=>{
 const {run,dispatch}=fixture(t);
 const first=run('dispatch',dispatch).json;
 const malformed=run('record',{projectId:'p',taskId:'t',actionId:first.action.id,hostResult:{threadId:'worker',hostId:17},evidenceRef:'fixture/malformed.json'});
 assert.equal(malformed.code,1);assert.equal(malformed.json.needsReconciliation,true);assert.equal(run('dispatch',dispatch).json.hostCall,undefined);
 const confirmed=run('record',{projectId:'p',taskId:'t',actionId:first.action.id,hostResult:{threadId:'worker',hostId:'local'},evidenceRef:'fixture/confirmed.json'});assert.equal(confirmed.code,0);
 const second=run('dispatch',{...dispatch,taskId:'other',requestId:'other-1'}).json;
 const collision=run('record',{projectId:'p',taskId:'other',actionId:second.action.id,hostResult:{threadId:'worker',hostId:'local'},evidenceRef:'fixture/collision.json'});
 assert.equal(collision.code,1);assert.equal(collision.json.needsReconciliation,true);
 assert.equal(run('dispatch',{...dispatch,taskId:'other',requestId:'other-1'}).json.hostCall,undefined);
});

test('CLI accepts an explicit confirmed rejection and keeps a generic host error ambiguous', t => {
 const {run, dispatch} = fixture(t);
 const original = run('dispatch', dispatch).json.action;
 const scope = {projectId: 'p', taskId: 't', actionId: original.id};
 const hostResult = {isError: true, content: [{type: 'text', text: 'Unclassified host error'}]};
 const ambiguous = run('record', {...scope, hostResult, evidenceRef: 'fixture/unknown.json'});
 assert.equal(ambiguous.json.needsReconciliation, true);
 const changed = {...dispatch, requestId: 'req-2', profile: {...dispatch.profile, model: 'supported'}};
 assert.equal(run('dispatch', changed).json.error.code, 'TASK_BUSY');
 const rejection = {...scope, outcome: 'rejected', evidenceRef: 'fixture/explicit-pre-create-denial.json'};
 assert.equal(run('record', {...rejection, hostResult}).json.error.code, 'INPUT');
 const confirmed = run('record', rejection);
 assert.equal(confirmed.code, 0);
 assert.equal(confirmed.json.task.phase, 'rejected');
 assert.equal(run('dispatch', dispatch).json.action, null);
 const retry = run('dispatch', changed);
 assert.equal(retry.code, 0);
 assert.equal(retry.json.action.type, 'create');
 assert.notEqual(retry.json.action.runId, original.runId);
 assert.equal(run('record', {
  ...scope, hostResult: {threadId: 'late', hostId: 'local'}, evidenceRef: 'fixture/stale.json'
 }).json.error.code, 'STALE_RUN');
 assert.equal(run('dispatch', changed).json.action.id, retry.json.action.id);
});

function boundWorker(t) {
 const {run, dispatch} = fixture(t);
 const action = run('dispatch', dispatch).json.action;
 const scope = {projectId: 'p', taskId: 't', runId: action.runId};
 assert.equal(run('record', {...scope, actionId: action.id, hostResult: {threadId: 'worker', hostId: 'local'},
  evidenceRef: 'fixture/create.json'}).code, 0);
 const observe = poll => run('observe', {...scope, hostResult: {polls: [poll]}, evidenceRef: 'fixture/wait.json'});
 const resolve = waitId => run('resolve', {...scope, waitId, evidenceRef: 'fixture/user-resolution.json'});
 return {run, scope, observe, resolve};
}

test('one raw observation records mixed waits and acceptance requires resolving each one', t => {
 const {run, scope, observe, resolve} = boundWorker(t);
 const result = (cursor, pendingRequests) => ({
  cursor,
  thread: {id: 'worker', hostId: 'local', status: {type: 'idle'}},
  latestTurn: {id: 'turn', status: 'completed'},
  latestAssistantMessage: {turnId: 'turn', phase: 'final_answer', text: JSON.stringify({
   runId: scope.runId, status: 'completed', summary: 'Result',
   verification: {status: 'not_run', evidenceRefs: []}, pendingRequests
  })}
 });
 const requests = [
  {id: 'approval-1', kind: 'approval', summary: 'Approval needed'},
  {id: 'input-1', kind: 'input', summary: 'Answer needed'}
 ];
 const waiting = observe(result('pending', requests));
 assert.equal(waiting.code, 0);
 assert.deepEqual(waiting.json.task.waits.map(({waitId, kind}) => [waitId, kind]),
  [['approval-1', 'approval'], ['input-1', 'input']]);
 assert.deepEqual(resolve('approval-1').json.task.waits.map(wait => wait.waitId), ['input-1']);
 assert.deepEqual(observe(result('another-poll', requests)).json.task.waits.map(wait => wait.waitId), ['input-1']);
 const completed = observe(result('done', []));
 assert.equal(completed.json.task.phase, 'review');
 assert.equal(run('verify', {...scope, status: 'passed', evidenceRefs: ['fixture/verified.json']}).code, 0);
 assert.equal(run('accept', scope).json.error.code, 'UNRESOLVED_WAITS');
 assert.equal(run('archive', scope).json.error.code, 'ACCEPTANCE_REQUIRED');
 assert.equal(resolve('input-1').code, 0);
 assert.equal(run('accept', scope).code, 0);
 assert.equal(run('archive', scope).json.action.type, 'archive');
});

test('an anonymous approval can recur in the same turn after confirmed running', t => {
 const {observe, resolve} = boundWorker(t);
 const poll = (cursor, activeFlags) => ({
  cursor,
  thread: {id: 'worker', hostId: 'local', status: {type: 'active', activeFlags}},
  latestTurn: {id: 'same-turn', status: 'inProgress'}
 });
 const firstPoll = poll('first-approval', ['waitingOnApproval']);
 const first = observe(firstPoll).json.task.waits[0];
 assert.deepEqual(observe(poll('again', ['waitingOnApproval'])).json.task.waits, [first]);
 assert.equal(resolve(first.waitId).code, 0);
 assert.equal(observe(poll('resume', [])).json.task.phase, 'running');
 assert.deepEqual(observe(firstPoll).json.task.waits, []);
 const second = observe(poll('second-approval', ['waitingOnApproval'])).json.task.waits[0];
 assert.equal(second.kind, 'approval');
 assert.notEqual(second.waitId, first.waitId);
 assert.deepEqual(observe(poll('second-poll', ['waitingOnApproval'])).json.task.waits, [second]);
 assert.deepEqual(resolve(second.waitId).json.task.waits, []);
});

test('wait JSON with a collapsed Windows path escape recovers the exact Desktop message', t => {
 const {run, scope} = boundWorker(t);
 const backslash = String.fromCharCode(92);
 const original = JSON.stringify({
  runId: scope.runId,
  status: 'completed',
  summary: ['marker cwd=F:', 'workspace', 'project', 'worker-orchestrator'].join(backslash),
  verification: {status: 'passed', evidenceRefs: ['fixture/marker.json']},
  pendingRequests: []
 });
 // The Desktop wait summary dropped one escape per Windows path separator.
 const compact = original.replaceAll(backslash.repeat(2), backslash);
 assert.throws(() => JSON.parse(compact), SyntaxError);
 const input = {
  ...scope,
  evidenceRef: 'fixture/wait.json',
  hostResult: {polls: [{
   cursor: 'cursor:2',
   thread: {id: 'worker', hostId: 'remote-control:fixture', status: {type: 'idle'}},
   latestTurn: {id: 'turn-reused', status: 'completed', error: null},
   latestAssistantMessage: {id: 'final-reused', turnId: 'turn-reused', phase: 'final_answer', text: compact}
  }]}
 };
 const lookup = run('observe', input);
 assert.equal(lookup.code, 0);
 assert.equal(lookup.json.task.hostStatus, 'unknown');
 assert.equal(lookup.json.needsReconciliation, true);
 assert.equal(lookup.json.action, null);
 assert.equal(lookup.json.hostCall.tool, 'mcp__codex_app__read_thread');
 assert.equal(lookup.json.hostCall.arguments.threadId, 'worker');
 assert.equal(lookup.json.hostCall.arguments.hostId, 'local');
 assert.equal(run('archive', scope).json.error.code, 'ACCEPTANCE_REQUIRED');

 const read = (messageId) => ({
  thread: {id: 'worker', hostId: 'local', status: {type: 'idle'}},
  turns: [{
   id: 'turn-reused',
   status: 'completed',
   items: [{id: messageId, type: 'agentMessage', phase: 'final_answer', text: original}]
  }]
 });
 const wrong = run('observe', {
  ...input, readThreadResult: read('different-message'), readThreadEvidenceRef: 'fixture/different-message.json'
 });
 assert.equal(wrong.code, 0);
 assert.equal(wrong.json.task.hostStatus, 'unknown');
 assert.equal(wrong.json.hostCall, undefined);

 const recovery = {...input, readThreadResult: read('final-reused'), readThreadEvidenceRef: 'fixture/read.json'};
 const restored = run('observe', recovery);
 assert.equal(restored.code, 0);
 assert.equal(restored.json.needsReconciliation, false);
 assert.equal(restored.json.task.phase, 'review');
 assert.equal(restored.json.task.result.success, true);
 assert.equal(restored.json.task.result.summary, original);
 assert.equal(restored.json.task.result.evidenceRef, recovery.readThreadEvidenceRef);
 assert.equal(restored.json.hostCall, undefined);
 assert.deepEqual(run('observe', recovery), restored);
 assert.deepEqual(run('observe', input), restored);
 const recentWait = structuredClone(input);
 recentWait.hostResult.polls[0].cursor = 'cursor:3';
 recentWait.hostResult.polls[0].thread.hostId = 'local';
 assert.deepEqual(run('observe', recentWait), restored);
 assert.equal(run('archive', scope).json.error.code, 'ACCEPTANCE_REQUIRED');
 assert.equal(run('verify', {
  ...scope, resultEventId: restored.json.task.result.eventId, status: 'passed', evidenceRefs: ['fixture/verified.json']
 }).code, 0);
 assert.equal(run('accept', scope).code, 0);
 assert.equal(run('archive', scope).json.hostCall.arguments.archived, true);
});

const mcpTextResult = payload => ({
 isError: false, content: [{type: 'text', text: JSON.stringify(payload)}]
});

const waitRecoveryCases = [
 ['a wait_threads MCP error', () => ({
  isError: true,
  content: [{type: 'text', text: 'tool call error: tool call failed for `codex_app/wait_threads`\n\nCaused by:\n    Mcp error: -32000: Codex app tool request failed'}]
 })],
 ['a valid wait poll from a remote-control host', (worker, turn, message, result) => JSON.stringify({
  polls: [{
   thread: {...worker, hostId: 'remote-control:env_fixture'},
   cursor: 'cursor:2',
   changed: true,
   latestTurn: turn,
   latestAssistantMessageId: message.id,
   latestAssistantMessage: {
    id: message.id, turnId: turn.id, phase: message.phase,
    text: JSON.stringify({...result, summary: 'Compact summary'})
   }
  }]
 })]
];

for (const [source, makeWaitResult] of waitRecoveryCases) {
 test(`observe recovers from ${source} using the registered worker's original message`, t => {
  const {run, scope} = boundWorker(t);
  const worker = {id: 'worker', hostId: 'local', status: {type: 'idle'}};
  const turn = {id: 'turn-final', status: 'completed', error: null};
  const result = {
   runId: scope.runId, status: 'completed', summary: 'Original summary',
   verification: {status: 'passed', evidenceRefs: ['fixture/worker-evidence.json']}, pendingRequests: []
  };
  const message = {id: 'final-message', type: 'agentMessage', phase: 'final_answer', text: JSON.stringify(result)};
  const input = {...scope, hostResult: makeWaitResult(worker, turn, message, result), evidenceRef: 'fixture/wait.json'};

  const lookup = run('observe', input);
  assert.equal(lookup.code, 0, JSON.stringify(lookup.json));
  assert.equal(lookup.json.task.hostStatus, 'unknown');
  assert.equal(lookup.json.task.result.success, null);
  assert.equal(lookup.json.needsReconciliation, true);
  assert.equal(lookup.json.action, null);
  assert.deepEqual(lookup.json.hostCall, {
   tool: 'mcp__codex_app__read_thread',
   arguments: {threadId: 'worker', hostId: 'local', turnLimit: 1, includeOutputs: false, maxOutputCharsPerItem: 12000}
  });

  const readThreadEvidenceRef = 'fixture/read.json';
  const restored = run('observe', {
   ...input,
   readThreadResult: mcpTextResult({
    thread: worker,
    page: {limit: 1, hasMore: true},
    turns: [{
     ...turn,
     items: [{id: 'commentary-message', type: 'agentMessage', phase: 'commentary', text: 'Checking the fixture'}, message]
    }]
   }),
   readThreadEvidenceRef
  });
  assert.equal(restored.code, 0, JSON.stringify(restored.json));
  assert.equal(restored.json.needsReconciliation, false);
  assert.equal(restored.json.task.hostStatus, 'completed');
  assert.equal(restored.json.task.phase, 'review');
  assert.equal(restored.json.task.result.success, true);
  assert.equal(restored.json.task.result.summary, message.text);
  assert.equal(restored.json.task.result.evidenceRef, readThreadEvidenceRef);
  assert.equal(restored.json.hostCall, undefined);
 });
}
