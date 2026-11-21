#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { Orchestrator, pushEventRouteReason } from '../core/orchestrator.mjs';
import { requireCondition as check } from '../contracts/errors.mjs';
import { object, text } from '../core/structured-work.mjs';
import { publishApproval, publishResult, readPushEvents, ackPushEvents } from '../core/push-journal.mjs';
import { SCHEMA_VERSION } from '../state/sqlite-store.mjs';
import { capabilityDescription, hostCallFor, receiptFromHost, observationFromPush, observationFromWait,
  unwrapHostResult, validateProfile } from '../adapters/codex-desktop/index.mjs';
import { assessControllerCandidate, resolveControllerScope, validateProjectBinding } from '../adapters/codex-desktop/controller-candidate.mjs';
import { approvalHookFor, resultNoticeFor, parsePushNotice } from '../adapters/codex-desktop/push.mjs';

const pushControllerCommands = ['push-config', 'push-inbox', 'push-ack', 'push-observe'];
const commands = ['candidate', 'project', 'sync-project', 'dispatch', 'record', 'observe', 'resolve', 'verify',
  'evaluate', 'accept', 'archive', 'status', ...pushControllerCommands, 'push-result', 'journal-approval'];
const hookOptions = ['--project-root', '--project-id', '--host-id'];
const pauseCell = new Int32Array(new SharedArrayBuffer(4));

function pause(ms) {
  Atomics.wait(pauseCell, 0, 0, ms);
}

function options(argv) {
  const [command, ...args] = argv;
  const opts = {command};
  const supported = command === 'journal-approval'
    ? ['--input', ...hookOptions]
    : ['--state-dir', '--input', '--format'];
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (!supported.includes(name) || !args[i + 1]) throw Object.assign(new Error(`Unknown or incomplete option: ${name}`), {code: 'INPUT'});
    if (Object.hasOwn(opts, name)) throw Object.assign(new Error(`Duplicate option: ${name}`), {code: 'INPUT'});
    opts[name] = args[++i];
  }
  if (opts['--format'] && opts['--format'] !== 'json') throw Object.assign(new Error('Only JSON output is supported'), {code:'INPUT'});
  return opts;
}

function readInput(opts) {
  check(opts['--input'], 'INPUT', '--input is required');
  const input = JSON.parse(fs.readFileSync(opts['--input'] === '-' ? 0 : opts['--input'], 'utf8').replace(/^\uFEFF/, ''));
  check(input && typeof input === 'object' && !Array.isArray(input), 'INPUT', 'Input must be a JSON object');
  return input;
}

function journalApproval(opts) {
  check(opts['--input'] === '-' && hookOptions.every(name => opts[name]) && opts['--host-id'] === 'local',
    'INPUT', 'journal-approval requires --input -, --project-root, --project-id, and --host-id local.');
  publishApproval(opts['--project-root'], { projectId: opts['--project-id'], hostId: opts['--host-id'] }, readInput(opts));
}

function pushResult(input, threadId, hostId) {
  check(threadId, 'WORKER_REQUIRED', 'push-result requires the current CODEX_THREAD_ID.');
  const { projectRoot, projectId, taskId, runId, workerTurnId, result } = input;
  const controllerRef = object(input.controllerRef, 'controllerRef');
  text(controllerRef.threadId, 'controllerRef.threadId');
  check(controllerRef.threadId !== threadId, 'CONTROLLER_REQUIRED', 'A worker cannot send its result notice to itself.');
  check(input.hostId === hostId && controllerRef.hostId === hostId, 'HOST_MISMATCH',
    'The worker and controller must belong to the current host.');
  const event = publishResult(projectRoot, { projectId, taskId, runId, hostId, workerThreadId: threadId, workerTurnId, result });
  return { event, hostCall: resultNoticeFor(event, controllerRef) };
}

function readHookFile(hookPath) {
  const file = fs.lstatSync(hookPath, { throwIfNoEntry: false });
  check(!file || file.isFile(), 'HOOK_CONFIG_CONFLICT', 'hooks.json must be a regular file.');
  return file ? fs.readFileSync(hookPath) : null;
}

function isPushHook(hook) {
  return [hook?.command, hook?.commandWindows].some(command => /\bjournal-approval\b/.test(command ?? ''))
    || (hook?.type === 'mcp_tool' && hook.server === 'codex_app' && hook.tool === 'send_message_to_thread'
      && hook.input?.prompt?.startsWith?.('worker-orchestrator-event/'));
}

function applyHookConfig(hookPath, hookConfig, previousConfig, remove) {
  const directory = path.dirname(hookPath);
  if (remove && !fs.existsSync(directory)) return false;
  fs.mkdirSync(directory, { recursive: true });
  check(fs.lstatSync(directory).isDirectory(), 'HOOK_CONFIG_CONFLICT', '.codex must be a regular directory.');
  const lockPath = path.join(directory, 'hooks.worker-orchestrator.lock');
  const deadline = performance.now() + 1_000;
  for (;;) {
    try {
      fs.closeSync(fs.openSync(lockPath, 'wx'));
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      check(performance.now() < deadline, 'HOOK_CONFIG_BUSY', 'Another CLI may be changing hooks.json. Lock: ' + lockPath);
      pause(25);
    }
  }
  try {
    return updateHookFile(hookPath, hookConfig, previousConfig, remove);
  } finally {
    fs.unlinkSync(lockPath);
  }
}

function updateHookFile(hookPath, hookConfig, previousConfig, remove) {
  const original = readHookFile(hookPath);
  let config = {};
  if (original) {
    try {
      config = object(JSON.parse(original.toString('utf8').replace(/^\uFEFF/, '')), 'hooks.json');
      if (Object.hasOwn(config, 'hooks')) object(config.hooks, 'hooks.json hooks');
      check(Object.values(config.hooks ?? {}).every(groups => Array.isArray(groups) && groups.every(group =>
        Array.isArray(group?.hooks))), 'HOOK_CONFIG_CONFLICT', 'Existing hook events must contain hook groups.');
    } catch (error) {
      check(false, 'HOOK_CONFIG_CONFLICT', 'Cannot merge hooks.json. ' + error.message);
    }
  }
  const eventName = 'PermissionRequest';
  const [newGroup] = hookConfig.hooks[eventName];
  const oldGroup = previousConfig?.hooks[eventName][0];
  const existing = [];
  for (const [name, groups] of Object.entries(config.hooks ?? {})) {
    for (const [index, group] of groups.entries()) {
      if (group.hooks.some(isPushHook)) existing.push({ name, index, group });
    }
  }
  const [match] = existing;
  if (!match && remove) return false;
  const current = match?.name === eventName && isDeepStrictEqual(match.group, newGroup);
  const previous = oldGroup && match?.name === eventName && isDeepStrictEqual(match.group, oldGroup);
  check(!match || (existing.length === 1 && (current || previous)), 'HOOK_CONFIG_CONFLICT',
    'An existing Worker Orchestrator hook requires its exact previous paths or manual reconciliation.');
  if (current && !remove) return false;
  config.hooks ??= {};
  const groups = config.hooks[eventName] ?? [];
  if (match) groups.splice(match.index, 1, ...(remove ? [] : [newGroup]));
  else groups.push(newGroup);
  if (groups.length) config.hooks[eventName] = groups;
  else delete config.hooks[eventName];

  const temporary = path.join(path.dirname(hookPath), 'hooks.' + randomUUID() + '.tmp');
  fs.writeFileSync(temporary, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
  try {
    if (original) {
      check(original.equals(readHookFile(hookPath) ?? Buffer.alloc(0)), 'HOOK_CONFIG_CONFLICT',
        'hooks.json changed during installation. Retry against the updated file.');
      fs.renameSync(temporary, hookPath);
    } else {
      // Create the destination exclusively even if another writer creates a hook after our read.
      try { fs.copyFileSync(temporary, hookPath, fs.constants.COPYFILE_EXCL); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        check(false, 'HOOK_CONFIG_CONFLICT', 'hooks.json appeared during installation. Retry against the updated file.');
      }
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return true;
}

function pushConfig(project, input) {
  const { apply, remove, previous } = input;
  check(apply === undefined || typeof apply === 'boolean', 'INPUT', 'apply must be a boolean.');
  check(remove === undefined || typeof remove === 'boolean', 'INPUT', 'remove must be a boolean.');
  check(project.controllerRef.hostId === 'local', 'HOST_MISMATCH', 'The official approval hook is available on the local host.');
  const hookPath = path.join(project.projectRoot, '.codex', 'hooks.json');
  const hookConfig = approvalHookFor(project, {
    nodePath: process.execPath, cliPath: fs.realpathSync.native(process.argv[1]),
  });
  let previousConfig;
  if (previous !== undefined) {
    object(previous, 'previous');
    for (const field of ['nodePath', 'cliPath']) {
      check(path.isAbsolute(text(previous[field], 'previous.' + field)), 'INPUT', 'Previous executable paths must be absolute.');
    }
    previousConfig = approvalHookFor(project, previous);
  }
  const applied = apply === true && applyHookConfig(hookPath, hookConfig, previousConfig, remove === true);
  return { hookPath, hookConfig, applied, ...(remove === true && { operation: 'remove' }) };
}

function compatiblePushEvent(event, project) {
  return event?.projectId === project.projectId && event.hostId === project.controllerRef.hostId
    && event.workerThreadId !== project.controllerRef.threadId
    && ['eventId', 'workerThreadId', 'workerTurnId'].every(key => typeof event[key] === 'string' && event[key].trim())
    && typeof event.createdAt === 'string' && Number.isFinite(Date.parse(event.createdAt))
    && ((event.kind === 'approval' && Object.keys(event).length === 7)
      || (event.kind === 'result' && Object.keys(event).length === 10
        && typeof event.taskId === 'string' && typeof event.runId === 'string'
        && event.result?.runId === event.runId && ['completed', 'failed'].includes(event.result?.status)));
}

function readThreadFor(workerRef) {
  return { ...workerRef, turnLimit: 1, includeOutputs: false, maxOutputCharsPerItem: 12000 };
}

function routePushEvents(project, tasks, journal) {
  const byTask = new Map(tasks.map(task => [task.taskId, task]));
  const byWorker = new Map(tasks.filter(task => task.workerRef?.hostId === project.controllerRef.hostId)
    .map(task => [task.workerRef.threadId, task]));
  const events = [];
  const deferred = [];
  for (const event of journal) {
    const task = event?.kind === 'result' ? byTask.get(event.taskId) : byWorker.get(event?.workerThreadId);
    const reason = compatiblePushEvent(event, project) ? pushEventRouteReason(project, task, event) : 'INCOMPATIBLE_EVENT';
    if (reason) {
      deferred.push({ eventId: event?.eventId, reason });
      continue;
    }
    const { taskId, runId, workerRef } = task;
    events.push({ ...event, taskId, runId, workerRef, readThread: readThreadFor(workerRef) });
  }
  return { events, deferred };
}

function noticeFor(project, input) {
  if (!Object.hasOwn(input, 'notice') && !Object.hasOwn(input, 'sourceThreadId')) return undefined;
  const notice = parsePushNotice(input.notice, input.sourceThreadId);
  if (!notice || notice.projectId !== project.projectId || notice.hostId !== project.controllerRef.hostId
    || notice.workerThreadId === project.controllerRef.threadId) return null;
  return notice;
}

function pushNoticeStatus(notice, journal, events) {
  if (notice === undefined) return 'none';
  if (notice === null) return 'invalid';
  const matches = event => event?.kind === notice.kind && event.projectId === notice.projectId
    && event.hostId === notice.hostId && event.workerThreadId === notice.workerThreadId
    && event.workerTurnId === notice.workerTurnId && (notice.kind === 'approval' || event.eventId === notice.eventId);
  if (events.some(matches)) return 'ready';
  return journal.some(matches) ? 'deferred' : 'pending';
}

function pushInbox(project, tasks, journal, input) {
  const notice = noticeFor(project, input);
  let routed = routePushEvents(project, tasks, journal);
  let noticeStatus = pushNoticeStatus(notice, journal, routed.events);
  // Desktop may run the permission journal and wake handlers concurrently.
  // Existing ready events take precedence over giving a missing journal commit a short head start.
  if (notice?.kind === 'approval' && noticeStatus === 'pending') {
    const worker = tasks.find(task => task.pushEnabled === true
      && task.workerRef?.threadId === notice.workerThreadId && task.workerRef.hostId === notice.hostId
      && task.workerHostProjectId === project.hostProjectId && !task.pendingAction
      && ['running', 'waiting'].includes(task.phase));
    if (worker) {
      const deadline = performance.now() + 750;
      while (performance.now() < deadline && noticeStatus === 'pending' && !routed.events.length) {
        pause(50);
        journal = readPushEvents(project.projectRoot, project.projectId);
        routed = routePushEvents(project, tasks, journal);
        noticeStatus = pushNoticeStatus(notice, journal, routed.events);
      }
      if (noticeStatus === 'pending') {
        return { ...routed, noticeStatus, noticeReadThread: readThreadFor(worker.workerRef) };
      }
    }
  }
  return { ...routed, noticeStatus };
}

function terminalApprovalWaits(task, event) {
  return task.waits.filter(wait => wait.kind === 'approval' && wait.runId === event.runId
    && wait.workerTurnId === event.workerTurnId && (event.kind === 'result' || wait.id === event.eventId))
    .map(wait => wait.id);
}

function pushObserve(app, project, tasks, routed, input, caller) {
  const eventId = text(input.eventId, 'eventId');
  const evidenceRef = text(input.evidenceRef, 'evidenceRef');
  const event = routed.events.find(entry => entry.eventId === eventId);
  if (!event) {
    const deferred = routed.deferred.find(entry => entry.eventId === eventId);
    return { state: 'pending', reason: deferred?.reason ?? 'EVENT_NOT_FOUND' };
  }
  const { projectId, taskId, runId, workerRef } = event;
  const currentTask = tasks.find(task => task.taskId === taskId);
  const scope = { projectId, taskId, runId, eventId };
  let snapshot;
  try {
    const raw = typeof input.readThreadResult === 'string' ? JSON.parse(input.readThreadResult) : input.readThreadResult;
    snapshot = unwrapHostResult(raw);
  } catch {
    return { ...scope, state: 'pending', reason: 'READ_THREAD_UNAVAILABLE' };
  }
  if (snapshot.thread?.projectId != null && snapshot.thread.projectId !== project.hostProjectId) {
    return { ...scope, state: 'pending', reason: 'READ_THREAD_PROJECT_MISMATCH' };
  }
  const scopedWorker = { ...workerRef, projectId, taskId, runId };
  const normalized = observationFromPush(event, scopedWorker, snapshot, evidenceRef);
  if (normalized.state !== 'ready') {
    if (normalized.reason !== 'APPROVAL_TURN_ENDED') return { ...scope, ...normalized };
    const resultEvent = routed.events.find(entry => entry.kind === 'result' && entry.runId === runId
      && entry.workerTurnId === event.workerTurnId);
    const report = resultEvent && observationFromPush(resultEvent, scopedWorker, snapshot, evidenceRef).observation?.workerReport;
    const resolvableWaitIds = snapshot.thread.status?.type === 'idle' && report?.pendingRequests.length === 0
      ? terminalApprovalWaits(currentTask, event) : [];
    return { ...scope, ...normalized, resolvableWaitIds };
  }
  const { observation } = normalized;
  if (event.kind === 'result' && (observation.workerReport.pendingRequests.length
    || snapshot.thread.status?.activeFlags?.some?.(flag => /approval|input|question/i.test(typeof flag === 'string' ? flag : flag?.type ?? '')))) {
    return { ...scope, state: 'pending', reason: 'WORKER_REQUESTS_PENDING' };
  }
  if (event.kind === 'approval' && currentTask.resolvedWaits.some(wait => wait.id === observation.waitId)) {
    return { ...scope, state: 'settled', reason: 'APPROVAL_ALREADY_RESOLVED' };
  }
  if (event.kind === 'result' && currentTask.phase === 'complete' && currentTask.result?.eventId === eventId) {
    return { ...scope, state: 'settled', reason: 'RESULT_ALREADY_ACCEPTED' };
  }
  let recorded;
  try {
    const { kind, hostId, workerThreadId, workerTurnId, createdAt } = event;
    recorded = app.execute('observe', { ...observation, projectId, taskId, runId,
      pushEvent: { ...scope, kind, hostId, workerThreadId, workerTurnId, createdAt } }, caller);
  } catch (error) {
    if (!['STALE_RUN', 'WORKER_PENDING', 'WORKER_MISMATCH', 'RUN_MISMATCH', 'PENDING_ACTION', 'RUN_FINISHED'].includes(error.code)) {
      throw error;
    }
    return { ...scope, state: 'pending', reason: error.code };
  }
  const resolvableWaitIds = event.kind === 'result' && snapshot.thread.status?.type === 'idle'
    ? terminalApprovalWaits(recorded.task, event) : [];
  return { ...recorded, ...scope, ...normalized, resolvableWaitIds };
}

function pushControllerCommand(app, command, input, caller) {
  const { project, tasks } = app.execute(command, input, caller);
  if (command === 'push-config') return pushConfig(project, input);
  const { projectRoot, projectId } = project;
  const journal = readPushEvents(projectRoot, projectId);
  if (command === 'push-ack') {
    check(Array.isArray(input.eventIds) && input.eventIds.every(id => typeof id === 'string' && id.trim()), 'INPUT',
      'eventIds must be an array of nonempty strings.');
    const existing = new Map(journal.map(event => [event?.eventId, event]));
    const eventIds = input.eventIds.filter(id => compatiblePushEvent(existing.get(id), project));
    return { acknowledgedEventIds: ackPushEvents(projectRoot, projectId, eventIds) };
  }
  if (command === 'push-observe') return pushObserve(app, project, tasks, routePushEvents(project, tasks, journal), input, caller);
  return pushInbox(project, tasks, journal, input);
}

export function main(argv = process.argv.slice(2), packagedVersion) {
  let app;
  try {
    const opts = options(argv);
    if (opts.command === 'journal-approval') {
      journalApproval(opts);
      return 0;
    }
    const version = packagedVersion ?? JSON.parse(
      fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
    ).version;
    if (opts.command === '--version' || opts.command === 'version') { console.log(JSON.stringify({name:'worker-orchestrator',version,schemaVersion:SCHEMA_VERSION})); return 0; }
    if (opts.command === '--help' || !opts.command) { console.log(JSON.stringify({usage:'node dist/cli.mjs <command> --state-dir <absolute-directory> --input <json-file|->',commands:[...commands, 'capabilities'],hostExecution:'The authorized controller performs returned hostCall, then records the real result.'})); return 0; }
    if (opts.command === 'capabilities') { console.log(JSON.stringify({ok:true,...capabilityDescription()})); return 0; }
    if (!commands.includes(opts.command)) throw Object.assign(new Error(`Unknown command: ${opts.command}`),{code:'INPUT'});
    let input = readInput(opts);
    if (opts.command === 'dispatch') validateProfile(input.profile);
    const threadId = process.env.CODEX_THREAD_ID?.trim();
    const hostId = process.env.CODEX_HOST_ID?.trim() || null;
    if (opts.command === 'push-result') {
      console.log(JSON.stringify({ ok: true, version, ...pushResult(input, threadId, hostId ?? 'local') }, null, 2));
      return 0;
    }
    let caller = threadId ? { threadId, hostId } : null;
    const stateDir = opts['--state-dir'] ?? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), '.local', 'share'), 'WorkerOrchestrator', 'state');
    if (!path.isAbsolute(stateDir)) throw Object.assign(new Error('--state-dir must be absolute'),{code:'INPUT'});
    if (opts.command === 'candidate') {
      if (Object.hasOwn(input, 'claim') && typeof input.claim !== 'boolean') {
        throw Object.assign(new Error('claim must be a boolean.'), {code:'INPUT'});
      }
      if (Object.hasOwn(input, 'includeStatus') && typeof input.includeStatus !== 'boolean') {
        throw Object.assign(new Error('includeStatus must be a boolean.'), {code:'INPUT'});
      }
      const scope = threadId ? resolveControllerScope(input.projectRoot ?? process.cwd()) : null;
      let result = { decision: 'undetermined', reason: threadId ? 'SCOPE_UNAVAILABLE' : 'MISSING_CURRENT_THREAD',
        claimed: false, project: null };
      if (scope) {
        app = new Orchestrator(stateDir);
        const request = { ...scope, caller, claim: input.claim ?? false, includeStatus: input.includeStatus ?? false };
        result = app.execute('candidate', request);
        if (result.reason === 'DISCOVERY_REQUIRED' && (Object.hasOwn(input, 'threadPages') || Object.hasOwn(input, 'projects'))) {
          const assessment = assessControllerCandidate(scope, threadId, hostId, input.projects, input.threadPages);
          result = app.execute('candidate', { ...request, assessment });
        }
      }
      console.log(JSON.stringify({ ok: true, version, ...result }, null, 2));
      return 0;
    }
    app = new Orchestrator(stateDir);
    if (caller && [...pushControllerCommands, 'dispatch', 'record', 'evaluate'].includes(opts.command)) {
      caller.projectRoots = resolveControllerScope(process.cwd())?.roots;
    }
    if (pushControllerCommands.includes(opts.command)) {
      console.log(JSON.stringify({ ok: true, version, ...pushControllerCommand(app, opts.command, input, caller) }, null, 2));
      return 0;
    }
    if (opts.command === 'sync-project') {
      const { project } = app.execute('status', { projectId: input.projectId });
      input = validateProjectBinding(project, caller, input.projects, input.threadPages);
      // Desktop shells may only export CODEX_THREAD_ID.
      caller = { ...caller, hostId: input.hostId };
    }
    let hostIssue;
    let readThread;
    const recordingHostResult = opts.command === 'record' && Object.hasOwn(input, 'hostResult');
    if (recordingHostResult) {
      if (input.outcome === 'rejected') throw Object.assign(new Error(
        'Record confirmed rejection with outcome and evidenceRef, without hostResult'), {code:'INPUT'});
      const {recordAction} = app.execute('status', {
        projectId:input.projectId, taskId:input.taskId, actionId:input.actionId
      });
      let normalized;
      try { normalized = receiptFromHost(recordAction, input.hostResult); }
      catch (error) {
        hostIssue = {code:error.code ?? 'HOST_CONTRACT',message:error.message};
        normalized = {outcome:'unknown',receipt:{}};
      }
      if (!hostIssue && input.outcome && input.outcome !== normalized.outcome) throw Object.assign(new Error('Host result and requested outcome disagree'),{code:'HOST_CONTRACT'});
      Object.assign(input, normalized);
      delete input.hostResult;
    }
    if (opts.command === 'observe') {
      const hasWaitResult = Object.hasOwn(input, 'hostResult');
      const hasReadResult = Object.hasOwn(input, 'readThreadResult');
      let readBack;
      if (hasReadResult || Object.hasOwn(input, 'readThreadEvidenceRef')) {
        if (!hasReadResult || !hasWaitResult || typeof input.readThreadEvidenceRef !== 'string'
          || !input.readThreadEvidenceRef.trim()) {
          throw Object.assign(new Error('Read recovery requires hostResult, readThreadResult, and readThreadEvidenceRef'), {code:'INPUT'});
        }
        readBack = {hostResult: input.readThreadResult, evidenceRef: input.readThreadEvidenceRef};
      }
      if (hasWaitResult) {
        const snapshot = app.execute('status', {projectId:input.projectId,taskId:input.taskId});
        const workerRef = snapshot.task?.workerRef ?? snapshot.task?.worker;
        if (!workerRef) throw Object.assign(new Error('No worker is bound to this task'),{code:'WORKER_MISMATCH'});
        const {readThread: lookup, ...observation} = observationFromWait(
          input.hostResult, workerRef, input.runId, input.evidenceRef, readBack);
        readThread = lookup;
        Object.assign(input, observation);
        delete input.hostResult;
        delete input.readThreadResult;
        delete input.readThreadEvidenceRef;
      }
    }
    let result;
    try { result = app.execute(opts.command, input, caller); }
    catch (error) {
      if (!recordingHostResult || input.outcome !== 'succeeded'
        || !['WORKER_IDENTITY_CONFLICT', 'INVALID_RECEIPT'].includes(error.code)) throw error;
      // The call may already have had an external effect even when the local
      // domain rejects its receipt (e.g. duplicate worker identity).
      hostIssue = {code:error.code ?? 'HOST_CONTRACT',message:error.message};
      result = app.execute('record', {projectId:input.projectId,taskId:input.taskId,actionId:input.actionId,outcome:'unknown',receipt:{},evidenceRef:input.evidenceRef}, caller);
    }
    const response = {ok:true,version,...result};
    if (hostIssue) { response.ok=false; response.hostError=hostIssue; }
    if (result.action && !result.needsReconciliation) response.hostCall = hostCallFor(result.action, result.project);
    if (readThread && (result.needsReconciliation || result.task.hostStatus?.startsWith('waiting_'))) {
      response.hostCall = {tool:'mcp__codex_app__read_thread', arguments:readThread};
    }
    console.log(JSON.stringify(response, null, 2));
    return hostIssue ? 1 : 0;
  } catch (error) {
    const output = argv[0] === 'journal-approval' ? console.error : console.log;
    output(JSON.stringify({ok:false,error:{code:error.code ?? 'INTERNAL',message:error.message}}, null, 2));
    return error.code ? 2 : 1;
  } finally { app?.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = main();
