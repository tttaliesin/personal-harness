import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPackage } from '../../scripts/build-package.mjs';
import { approvalHookFor } from '../../src/adapters/codex-desktop/push.mjs';
import { publishApproval, readPushEvents } from '../../src/core/push-journal.mjs';

const repoRoot = realpathSync.native(fileURLToPath(new URL('../../', import.meta.url)));
const local = join(repoRoot, '.local');
const sourceCli = join(repoRoot, 'src', 'cli', 'main.mjs');
const controller = { threadId: 'controller', hostId: 'local' };
const workerA = { threadId: 'worker-a', hostId: 'local' };
const workerB = { threadId: 'worker-b', hostId: 'local' };
const projectId = 'push-project';
const projectScope = { projectId };

function fixture(t) {
  mkdirSync(local, { recursive: true });
  assert.equal(realpathSync.native(local), local);
  const root = mkdtempSync(join(local, 'push-test-'));
  t.after(() => {
    const target = realpathSync.native(root);
    assert.equal(dirname(target), local);
    assert.equal(target, root);
    rmSync(target, { recursive: true, force: true, maxRetries: 3 });
  });
  const projectRoot = join(root, 'project');
  const stateDir = join(root, 'state');
  const defaultData = join(root, 'default-data');
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !/^(?:CODEX_(?:THREAD|HOST)_ID|LOCALAPPDATA|GIT_.*)$/i.test(key)));

  function checkout(cwd) {
    mkdirSync(cwd);
    const git = spawnSync('git', ['init', '--quiet', '--template='], { cwd, encoding: 'utf8', env, windowsHide: true });
    assert.ifError(git.error);
    assert.equal(git.status, 0, git.stderr);
    return cwd;
  }
  checkout(projectRoot);

  function invocation(command, input, { caller = controller, cwd = projectRoot, cli = sourceCli,
    flags = ['--state-dir', stateDir] } = {}) {
    return {
      args: [cli, command, '--input', '-', ...flags],
      input: JSON.stringify(input),
      options: { cwd, windowsHide: true, env: {
        ...env, LOCALAPPDATA: defaultData,
        ...(caller?.threadId && { CODEX_THREAD_ID: caller.threadId }),
        ...(caller?.hostId && { CODEX_HOST_ID: caller.hostId }),
      } },
    };
  }

  function parse(command, status, stdout, stderr, errorCode) {
    const details = [command, stdout, stderr].join('\n');
    const response = JSON.parse(stdout);
    assert.equal(status === 0, errorCode === undefined, details);
    assert.equal(response.ok, errorCode === undefined, details);
    if (errorCode) assert.equal(response.error?.code, errorCode, details);
    return response;
  }

  function run(command, input, params) {
    const { args, input: stdin, options } = invocation(command, input, params);
    const proc = spawnSync(process.execPath, args, { ...options, input: stdin, encoding: 'utf8', timeout: 20_000 });
    assert.ifError(proc.error);
    return parse(command, proc.status, proc.stdout, proc.stderr, params?.errorCode);
  }

  async function concurrent(command, input, params = {}) {
    const { args, input: stdin, options } = invocation(command, input, params);
    return new Promise((resolve, reject) => {
      const { preload, onJournalRead } = params;
      if (preload) args.unshift('--import', 'data:text/javascript,' + encodeURIComponent(preload));
      const proc = spawn(process.execPath, args, { ...options, timeout: 20_000,
        stdio: onJournalRead ? ['pipe', 'pipe', 'pipe', 'ipc'] : 'pipe' });
      if (onJournalRead) proc.on('message', () => {
        try { onJournalRead(); }
        catch (error) { reject(error); }
      });
      proc.stdout.setEncoding('utf8');
      proc.stderr.setEncoding('utf8');
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', value => { stdout += value; });
      proc.stderr.on('data', value => { stderr += value; });
      proc.on('error', reject);
      proc.on('close', status => {
        try { resolve(parse(command, status, stdout, stderr)); }
        catch (error) { reject(error); }
      });
      proc.stdin.on('error', reject);
      proc.stdin.end(stdin);
    });
  }

  function journalApproval(sessionId, turnId, id = projectId, expected = 0) {
    const { args, input, options } = invocation('journal-approval', {
      session_id: sessionId, turn_id: turnId, cwd: projectRoot,
      tool_name: 'fixture-only-metadata', tool_input: { command: 'omitted from journal' },
    }, { caller: null, flags: ['--project-root', projectRoot, '--project-id', id, '--host-id', 'local'] });
    const proc = spawnSync(process.execPath, args, { ...options, input, encoding: 'utf8', timeout: 20_000 });
    assert.ifError(proc.error);
    assert.equal(proc.status, expected, proc.stderr);
    assert.equal(proc.stdout, '');
  }

  const project = { ...projectScope, projectRoot, hostProjectId: 'desktop-project', controller,
    authorization: { createWorkers: true, sendFollowups: true, restoreWorkers: true, archiveCompleted: true,
      source: 'Fixture grant' } };
  const grant = { ...project, authorization: { ...project.authorization, scope: 'project', pushEvents: true } };
  run('project', project, { caller: null });
  return { run, concurrent, journalApproval, checkout, root, project, grant, projectRoot, defaultData };
}

function request(taskId, requestId = 'first') {
  return { ...projectScope, taskId, requestId, prompt: 'Synthetic work.', profile: { model: 'model', thinking: 'low' } };
}

function receipt(action, hostResult) {
  const { taskId, runId, id: actionId } = action;
  return { ...projectScope, taskId, runId, actionId, hostResult, evidenceRef: 'test:receipt' };
}

function resultInput(projectRoot, { taskId, runId }, workerTurnId = 'turn-' + taskId) {
  return { ...projectScope, projectRoot, taskId, runId, hostId: 'local', workerTurnId, controllerRef: controller,
    result: { runId, status: 'completed', summary: 'Synthetic result.', verification: {
      status: 'passed', evidenceRefs: ['test:worker'],
    }, pendingRequests: [] } };
}

function hostSnapshot(worker, turnId, result, { waiting = false, status = 'completed' } = {}) {
  return { thread: { id: worker.threadId, hostId: worker.hostId,
    status: waiting ? { type: 'active', activeFlags: ['waitingOnApproval'] } : { type: 'idle' } },
  turns: [{ id: turnId, status, items: result
    ? [{ id: 'final', type: 'agentMessage', phase: 'final_answer', text: JSON.stringify(result) }]
    : [] }] };
}

function readEvidence(event, readThreadResult) {
  return { ...projectScope, eventId: event.eventId, readThreadResult, evidenceRef: 'test:read-thread' };
}

test('push hook is opt-in, targets the actual packaged CLI, and preserves user config', async t => {
  const { run, concurrent, checkout, root, grant, projectRoot } = fixture(t);
  run('push-config', projectScope, { errorCode: 'AUTHORIZATION_REQUIRED' });
  run('project', { ...grant, authorization: { ...grant.authorization, pushEvents: 'true' } },
    { errorCode: 'INVALID_AUTHORIZATION' });
  const waiting = run('dispatch', { ...request('wait-only'), pushEnabled: true });
  assert.equal(waiting.task.pushEnabled, undefined);
  assert.equal(waiting.task.runStartedAt, undefined);
  assert.equal(waiting.action.push, undefined);

  run('project', grant);
  run('push-config', projectScope, { caller: workerA, errorCode: 'CONTROLLER_REQUIRED' });
  run('push-config', projectScope, { caller: { ...controller, hostId: 'other' }, errorCode: 'CONTROLLER_REQUIRED' });
  run('push-config', projectScope, { cwd: checkout(join(root, 'other')), errorCode: 'PROJECT_SCOPE_MISMATCH' });
  const { packageRoot } = await buildPackage({ repoRoot, outputRoot: join(root, 'catalog') });
  const cli = join(packageRoot, 'dist', 'cli.mjs');
  const dryRun = run('push-config', projectScope, { cli, caller: { threadId: controller.threadId } });
  assert.equal(dryRun.hookPath, join(projectRoot, '.codex', 'hooks.json'));
  assert.equal(dryRun.applied, false);
  assert.equal(existsSync(dirname(dryRun.hookPath)), false);
  assert.deepEqual(dryRun.hookConfig, approvalHookFor({ ...grant, controllerRef: controller },
    { nodePath: process.execPath, cliPath: cli }));
  mkdirSync(dirname(dryRun.hookPath));
  const userGroup = { matcher: '*', hooks: [{ type: 'command', command: 'user-hook' }] };
  writeFileSync(dryRun.hookPath, JSON.stringify({ extra: { value: true }, hooks: { PermissionRequest: [userGroup],
    SessionStart: [userGroup] } }));
  const apply = { ...projectScope, apply: true };
  assert.equal(run('push-config', apply, { cli }).applied, true);
  assert.deepEqual(JSON.parse(readFileSync(dryRun.hookPath, 'utf8')), {
    extra: { value: true },
    hooks: { PermissionRequest: [userGroup, ...dryRun.hookConfig.hooks.PermissionRequest], SessionStart: [userGroup] },
  });
  const installed = readFileSync(dryRun.hookPath);
  assert.equal(run('push-config', apply, { cli }).applied, false);
  run('push-config', apply, { errorCode: 'HOOK_CONFIG_CONFLICT' });
  assert.deepEqual(readFileSync(dryRun.hookPath), installed);
  const previous = { nodePath: process.execPath, cliPath: cli };
  writeFileSync(join(dirname(dryRun.hookPath), 'hooks.worker-orchestrator.lock'), '');
  run('push-config', { ...apply, previous }, { errorCode: 'HOOK_CONFIG_BUSY' });
  assert.deepEqual(readFileSync(dryRun.hookPath), installed);
  rmSync(join(dirname(dryRun.hookPath), 'hooks.worker-orchestrator.lock'));
  const upgrades = await Promise.all([
    concurrent('push-config', { ...apply, previous }),
    concurrent('push-config', { ...apply, previous }),
  ]);
  assert.deepEqual(upgrades.map(result => result.applied).sort(), [false, true]);
  const installedUpdate = JSON.parse(readFileSync(dryRun.hookPath, 'utf8'));
  assert.deepEqual(installedUpdate.hooks.PermissionRequest, [userGroup, ...upgrades[0].hookConfig.hooks.PermissionRequest]);
  assert.equal(run('status', projectScope).tasks[0].pushEnabled, undefined);

  run('project', { ...grant, authorization: { ...grant.authorization, pushEvents: false } });
  run('push-inbox', projectScope, { errorCode: 'AUTHORIZATION_REQUIRED' });
  run('push-config', apply, { errorCode: 'AUTHORIZATION_REQUIRED' });
  run('push-config', { ...apply, remove: true }, { caller: workerA, errorCode: 'CONTROLLER_REQUIRED' });
  assert.equal(run('push-config', { ...projectScope, remove: true }).applied, false);
  assert.deepEqual(JSON.parse(readFileSync(dryRun.hookPath, 'utf8')), installedUpdate);
  assert.equal(run('push-config', { ...apply, remove: true }).applied, true);
  assert.equal(run('push-config', { ...apply, remove: true }).applied, false);
  assert.deepEqual(JSON.parse(readFileSync(dryRun.hookPath, 'utf8')), {
    extra: { value: true }, hooks: { PermissionRequest: [userGroup], SessionStart: [userGroup] },
  });
  assert.equal(run('dispatch', request('after-revocation')).action.push, undefined);
});

test('the first hook installation writes exclusively without hard links', async t => {
  const { run, concurrent, grant } = fixture(t);
  run('project', grant);
  const payload = { ...projectScope, apply: true };
  const denyHardLinks = 'import fs from "node:fs"; fs.linkSync = () => { throw Object.assign(new Error("fixture"), {code: "EPERM"}); };';
  const results = await Promise.all([
    concurrent('push-config', payload, { preload: denyHardLinks }),
    concurrent('push-config', payload, { preload: denyHardLinks }),
  ]);
  assert.deepEqual(results.map(result => result.applied).sort(), [false, true]);
  assert.deepEqual(JSON.parse(readFileSync(results[0].hookPath, 'utf8')), results[0].hookConfig);
});

test('a wake from a bound worker can arrive before the approval journal commit', async t => {
  const { run, concurrent, grant, projectRoot } = fixture(t);
  run('project', grant);
  const { action } = run('dispatch', request('approval-race'));
  run('record', receipt(action, workerA));
  const workerTurnId = 'race-turn';
  const notice = 'worker-orchestrator-event/1 ' + JSON.stringify({ kind: 'approval', projectId, hostId: 'local',
    workerThreadId: workerA.threadId, workerTurnId });
  const payload = { ...projectScope, notice, sourceThreadId: workerA.threadId };
  const onJournalAccess = [
    'import fs from "node:fs";', 'import { syncBuiltinESMExports } from "node:module";',
    'const lstat = fs.lstatSync;',
    'fs.lstatSync = (file, ...args) => {',
    '  const info = lstat(file, ...args);',
    '  if (String(file).endsWith("inbox.sqlite")) process.send("journal-read");',
    '  return info;',
    '};', 'syncBuiltinESMExports();',
  ].join('\n');
  let reads = 0;
  let approval;
  const inbox = await concurrent('push-inbox', payload, { preload: onJournalAccess, onJournalRead() {
    if (reads++ !== 0) return;
    approval = publishApproval(projectRoot, { projectId, hostId: 'local' },
      { cwd: projectRoot, session_id: workerA.threadId, turn_id: workerTurnId });
  } });
  assert.ok(reads >= 2);
  assert.equal(inbox.noticeStatus, 'ready');
  assert.deepEqual(inbox.events.map(event => event.eventId), [approval.eventId]);
  const other = { ...payload, notice: notice.replace(workerTurnId, 'other-turn') };
  reads = 0;
  const withReadyEvent = await concurrent('push-inbox', other, { preload: onJournalAccess, onJournalRead() { reads++; } });
  assert.equal(reads, 1);
  assert.equal(withReadyEvent.noticeStatus, 'pending');
  assert.equal(withReadyEvent.noticeReadThread.threadId, workerA.threadId);
  assert.deepEqual(withReadyEvent.events.map(event => event.eventId), [approval.eventId]);
});

test('parallel push events survive registration races, notice failures, selective ack and worker reuse', async t => {
  const { run, concurrent, journalApproval, projectRoot, grant, defaultData } = fixture(t);
  run('project', grant);
  const [first, second] = await Promise.all([
    concurrent('dispatch', request('one')),
    concurrent('dispatch', request('two')),
  ]);
  for (const { action, task } of [first, second]) {
    assert.deepEqual(action.push, { projectRoot, projectId, hostId: 'local', taskId: task.taskId, runId: task.runId,
      controllerRef: controller, authorizationSource: grant.authorization.source });
    assert.equal(task.pushEnabled, true);
    assert.ok(Number.isFinite(Date.parse(task.runStartedAt)));
  }
  const firstReport = resultInput(projectRoot, first.task);
  const secondReport = resultInput(projectRoot, second.task);
  const approvalNotice = 'worker-orchestrator-event/1 ' + JSON.stringify({ kind: 'approval', projectId, hostId: 'local',
    workerThreadId: workerA.threadId, workerTurnId: firstReport.workerTurnId });
  const approvalScope = { ...projectScope, notice: approvalNotice, sourceThreadId: workerA.threadId };
  assert.equal(run('push-inbox', approvalScope).noticeStatus, 'pending');
  journalApproval(workerA.threadId, firstReport.workerTurnId);
  const approval = readPushEvents(projectRoot, projectId)[0];
  assert.equal(approval.kind, 'approval');
  assert.equal(approval.tool_input, undefined);
  assert.equal(run('push-inbox', approvalScope).noticeStatus, 'deferred');
  journalApproval('', 'invalid-turn', projectId, 2);
  journalApproval(workerA.threadId, firstReport.workerTurnId, 'other-project');
  run('push-result', firstReport, { caller: null, flags: [], errorCode: 'WORKER_REQUIRED' });
  run('push-result', firstReport, { caller: controller, flags: [], errorCode: 'CONTROLLER_REQUIRED' });
  run('push-result', { ...firstReport, controllerRef: { ...controller, hostId: 'other' } },
    { caller: workerA, flags: [], errorCode: 'HOST_MISMATCH' });
  run('record', receipt(second.action, workerB));
  const [resultA, resultB] = await Promise.all([
    concurrent('push-result', { ...firstReport, workerThreadId: 'ignored' }, { caller: workerA, flags: [] }),
    concurrent('push-result', secondReport, { caller: workerB, flags: [] }),
  ]);
  assert.equal(resultA.event.workerThreadId, workerA.threadId);
  assert.equal(existsSync(defaultData), false);
  const resultReplay = run('push-result', firstReport, { caller: workerA, flags: [] });
  assert.deepEqual(resultReplay.event, resultA.event);
  assert.deepEqual(resultReplay.hostCall, resultA.hostCall);
  const beforeRecord = run('push-inbox', { ...projectScope, notice: resultA.hostCall.arguments.prompt,
    sourceThreadId: workerB.threadId });
  assert.equal(beforeRecord.noticeStatus, 'invalid');
  assert.deepEqual(beforeRecord.events.map(event => event.eventId), [resultB.event.eventId]);
  assert.deepEqual(beforeRecord.deferred.map(event => event.eventId), [approval.eventId, resultA.event.eventId]);
  assert.equal(run('push-observe', readEvidence(resultA.event, {})).reason, 'WORKER_PENDING');

  run('record', receipt(first.action, workerA));
  const inbox = run('push-inbox', approvalScope);
  assert.equal(inbox.noticeStatus, 'ready');
  assert.equal(inbox.events.length, 3);
  for (const event of inbox.events) {
    assert.ok(event.taskId && event.runId);
    assert.equal(event.readThread.threadId, event.workerRef.threadId);
    assert.equal(event.readThread.hostId, event.workerRef.hostId);
    assert.equal(event.readThread.turnLimit, 1);
  }
  const waitEvidence = readEvidence(approval, hostSnapshot(workerA, firstReport.workerTurnId, undefined,
    { waiting: true, status: 'inProgress' }));
  assert.equal(run('push-observe', waitEvidence).task.waits[0].id, approval.eventId);
  assert.equal(run('push-observe', waitEvidence).task.waits.length, 1);
  assert.equal(run('push-observe', readEvidence(resultA.event, hostSnapshot(workerA, 'newer-turn', firstReport.result))).state, 'pending');

  const terminal = hostSnapshot(workerA, firstReport.workerTurnId, firstReport.result);
  const otherRun = hostSnapshot(workerA, firstReport.workerTurnId, { ...firstReport.result, runId: 'different-run' });
  assert.deepEqual(run('push-observe', readEvidence(approval, otherRun)).resolvableWaitIds, []);
  const stillWaiting = hostSnapshot(workerA, firstReport.workerTurnId, firstReport.result, { waiting: true });
  assert.deepEqual(run('push-observe', readEvidence(approval, stillWaiting)).resolvableWaitIds, []);
  assert.equal(run('push-observe', readEvidence(resultA.event, stillWaiting)).reason, 'WORKER_REQUESTS_PENDING');
  const wrongProject = { ...terminal, thread: { ...terminal.thread, projectId: 'other-desktop-project' } };
  assert.equal(run('push-observe', readEvidence(resultA.event, wrongProject)).reason, 'READ_THREAD_PROJECT_MISMATCH');
  const settledWait = run('push-observe', readEvidence(approval, terminal));
  assert.equal(settledWait.state, 'settled');
  assert.deepEqual(settledWait.resolvableWaitIds, [approval.eventId]);
  const recorded = run('push-observe', readEvidence(resultA.event, terminal));
  assert.equal(recorded.state, 'ready');
  assert.deepEqual(recorded.resolvableWaitIds, [approval.eventId]);
  assert.equal(recorded.task.result.eventId, resultA.event.eventId);
  assert.equal(recorded.task.waits.length, 1);
  assert.deepEqual(run('push-observe', readEvidence(resultA.event, terminal)).task, recorded.task);
  const scope = { ...projectScope, taskId: first.task.taskId, runId: first.task.runId };
  run('resolve', { ...scope, waitId: approval.eventId, evidenceRef: recorded.observation.evidenceRef });
  run('verify', { ...scope, resultEventId: resultA.event.eventId, status: 'passed', evidenceRefs: ['test:controller'] });
  run('accept', scope);
  assert.equal(run('push-observe', readEvidence(resultA.event, terminal)).state, 'settled');
  const reused = run('dispatch', { ...request('one', 'second'), reuseOnly: true });
  assert.equal(reused.action.type, 'send');
  assert.notEqual(reused.task.runId, first.task.runId);
  assert.ok(reused.task.runStartedAt > first.task.runStartedAt);
  run('record', receipt(reused.action, { threadId: workerA.threadId }));
  const afterReuse = run('push-inbox', approvalScope);
  assert.equal(afterReuse.noticeStatus, 'deferred');
  assert.deepEqual(afterReuse.events.map(event => event.eventId), [resultB.event.eventId]);
  for (const stale of [approval, resultA.event]) {
    assert.ok(afterReuse.deferred.some(event => event.eventId === stale.eventId && event.reason === 'RUN_MISMATCH'));
    assert.equal(run('push-observe', readEvidence(stale, terminal)).state, 'pending');
  }
  run('push-ack', { ...projectScope, eventIds: [resultA.event.eventId] }, { caller: workerA, errorCode: 'CONTROLLER_REQUIRED' });
  const foreign = readPushEvents(projectRoot, 'other-project')[0];
  const incompatible = publishApproval(projectRoot, { projectId, hostId: 'other-host' },
    { cwd: projectRoot, session_id: workerB.threadId, turn_id: secondReport.workerTurnId });
  assert.deepEqual(run('push-ack', { ...projectScope, eventIds: [resultA.event.eventId, foreign.eventId, incompatible.eventId] })
    .acknowledgedEventIds, [resultA.event.eventId]);
  assert.deepEqual(run('push-ack', { ...projectScope, eventIds: [resultA.event.eventId] }).acknowledgedEventIds, []);
  assert.deepEqual(run('push-inbox', projectScope).events.map(event => event.eventId), [resultB.event.eventId]);
  assert.equal(readPushEvents(projectRoot, 'other-project').length, 1);
  assert.ok(readPushEvents(projectRoot, projectId).some(event => event.eventId === incompatible.eventId));
  assert.deepEqual(run('status', projectScope).project.authorization, grant.authorization);
});
