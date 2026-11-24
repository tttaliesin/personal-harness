import { realpathSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { SQLiteStore } from '../state/sqlite-store.mjs';
import { OrchestratorError, requireCondition as check } from '../contracts/errors.mjs';
import { decisionEvidence, isSupportedCheck, nextRetryProfile, object, parseEvaluation, parseWorkSpec, text }
  from './structured-work.mjs';
import { parseWorktree, preservedWorktreePath, verifyWorktreeStart } from './worker-worktree.mjs';

export { OrchestratorError } from '../contracts/errors.mjs';

const COMMANDS = new Set(['candidate', 'project', 'sync-project', 'dispatch', 'record', 'observe', 'resolve',
  'evaluate', 'verify', 'accept', 'archive', 'status', 'push-config', 'push-inbox', 'push-ack', 'push-observe']);
const PERMISSIONS = {
  create: 'createWorkers', send: 'sendFollowups',
  archive: 'archiveCompleted', unarchive: 'restoreWorkers',
};
const OBSERVATIONS = new Set(['running', 'waiting_approval', 'waiting_input',
  'completed', 'failed', 'unknown']);
const WAIT_KINDS = { waiting_approval: 'approval', waiting_input: 'input' };

function workerRef(value, name = 'workerRef') {
  object(value, name);
  return { threadId: text(value.threadId, `${name}.threadId`), hostId: text(value.hostId, `${name}.hostId`) };
}

function sameWorker(left, right) {
  return left?.threadId === right?.threadId && left?.hostId === right?.hostId;
}

function controllerForRun(project, task) {
  return task?.controllerRef ?? project.controllerRef;
}

function defaultAuthorization() {
  return {
    ...Object.fromEntries(Object.values(PERMISSIONS).map(permission => [permission, false])),
    source: 'No worker operation grant has been recorded for this conversation.',
  };
}

function pushGranted(authorization) {
  return authorization.scope === 'project' && authorization.pushEvents === true;
}

function runResultPushGranted(task) {
  return task?.pushEnabled === true && typeof task.resultPushAuthorizationSource === 'string';
}

function runArchiveGranted(project, task) {
  return typeof task?.archiveAuthorizationSource === 'string'
    && task.workerHostProjectId === project.hostProjectId;
}

export function pushEventRouteReason(project, task, event) {
  const controller = controllerForRun(project, task);
  if (event.projectId !== project.projectId || event.hostId !== controller.hostId
    || event.workerThreadId === controller.threadId) return 'INCOMPATIBLE_EVENT';
  if (!task?.workerRef || task.phase === 'planned'
    || (task.pendingAction && task.pendingAction.type !== 'archive')) return 'WORKER_PENDING';
  if (task.workerRef.threadId !== event.workerThreadId || task.workerRef.hostId !== event.hostId
    || task.workerHostProjectId !== project.hostProjectId) return 'WORKER_MISMATCH';
  if (task.pushEnabled !== true || !Number.isFinite(Date.parse(task.runStartedAt))
    || !(Date.parse(event.createdAt) >= Date.parse(task.runStartedAt))
    || (event.kind === 'result' && (task.taskId !== event.taskId || task.runId !== event.runId))) return 'RUN_MISMATCH';
  return null;
}

function profile(value) {
  object(value, 'profile');
  check(Object.keys(value).every(key => key === 'model' || key === 'thinking'),
    'INVALID_INPUT', 'profile supports only model and thinking.');
  return { model: text(value.model, 'profile.model'), thinking: text(value.thinking, 'profile.thinking') };
}

function unverified(runId) {
  return { runId, status: 'unverified', evidenceRefs: [] };
}

function canonicalRoot(value) {
  text(value, 'projectRoot');
  check(isAbsolute(value), 'INVALID_PROJECT_ROOT', 'projectRoot must be absolute.');
  try {
    check(statSync(value).isDirectory(), 'INVALID_PROJECT_ROOT', 'projectRoot must be an existing directory.');
    return realpathSync.native(value);
  } catch (error) {
    if (error instanceof OrchestratorError) throw error;
    throw new OrchestratorError('INVALID_PROJECT_ROOT', 'projectRoot must be an existing directory.',
      undefined, { cause: error });
  }
}

/** Plans host actions only. A controller must obtain host permission and execute them. */
export class Orchestrator {
  constructor(stateDir) {
    this.store = new SQLiteStore(stateDir);
  }

  execute(command, input = {}, caller = null) {
    check(COMMANDS.has(command), 'UNKNOWN_COMMAND', `Unknown command: ${String(command)}`);
    object(input, 'input');
    // Detach caller-owned objects so returned data cannot alter persisted snapshots.
    let payload;
    try { payload = JSON.parse(JSON.stringify(input)); }
    catch (error) {
      throw new OrchestratorError('INVALID_INPUT', 'input must be JSON serializable.', undefined, { cause: error });
    }
    return this.store.transaction(() => {
      if (command === 'candidate') return this.controllerCandidate(payload);
      if (command === 'project') return this.registerProject(payload, { caller });
      const projectId = text(payload.projectId, 'projectId');
      const project = this.store.project(projectId);
      check(project, 'PROJECT_NOT_FOUND', `Project is not registered: ${projectId}`);
      if (command === 'sync-project') return this.syncProject(project, payload, caller);
      if (['push-config', 'push-inbox', 'push-ack', 'push-observe'].includes(command)) {
        if (command === 'push-config') {
          return { project: this.requirePushController(project, caller, { removingHook: payload.remove === true }) };
        }
        const view = this.requireController(project, caller);
        const tasks = this.controllerTasks(project, view.controllerRef);
        const resultOnly = !pushGranted(view.authorization);
        const eligible = resultOnly ? tasks.filter(runResultPushGranted) : tasks;
        this.requirePushController(project, caller, { runGrant: resultOnly && eligible.length > 0 });
        return { project: view, tasks: eligible, resultOnly };
      }
      if (command === 'status') {
        const callerView = caller && (project.controllerSelection === 'automatic' || project.controllerAccess?.length)
          ? this.requireController(project, caller) : this.controllerView(project, caller);
        const view = callerView ?? this.projectView(project);
        if (payload.taskId === undefined && payload.actionId === undefined) {
          const tasks = callerView ? this.controllerTasks(project, view.controllerRef) : this.store.tasks(projectId);
          return { project: view, tasks };
        }
        const task = this.getTask(projectId, text(payload.taskId, 'taskId'));
        if (callerView) this.requireRunController(project, task, view.controllerRef);
        const snapshot = this.response(view, task, false);
        if (payload.actionId !== undefined) {
          const row = this.getAction(task, text(payload.actionId, 'actionId'));
          snapshot.recordAction = JSON.parse(row.json);
        }
        return snapshot;
      }
      text(payload.taskId, 'taskId');
      const view = caller || project.controllerSelection === 'automatic' || project.authorization.scope === 'project'
        || payload.workSpec !== undefined || command === 'evaluate'
        ? this.requireController(project, caller) : this.projectView(project);
      const pushEnabled = this.canPush(view, caller);
      if (command === 'dispatch') {
        const prior = this.store.task(projectId, payload.taskId);
        if (prior) this.requireRunController(project, prior, view.controllerRef);
        if (payload.resultPushAuthorizationSource !== undefined) {
          text(payload.resultPushAuthorizationSource, 'resultPushAuthorizationSource');
          check(this.hasControllerContext(view, caller), 'AUTHORIZATION_REQUIRED',
            'One-run result delivery requires the verified controller and registered checkout.');
        }
        if (payload.archiveAuthorizationSource !== undefined) {
          text(payload.archiveAuthorizationSource, 'archiveAuthorizationSource');
          check(this.hasControllerContext(view, caller), 'AUTHORIZATION_REQUIRED',
            'One-run archive authorization requires the verified controller and registered checkout.');
        }
        const result = this.dispatch(view, payload, pushEnabled);
        return this.withPushAction(result, pushEnabled || runResultPushGranted(result.task));
      }
      const task = this.getTask(projectId, payload.taskId);
      if ((task.workSpec || task.archiveAuthorizationSource) && !caller) this.requireController(project, caller);
      this.requireRunController(project, task, view.controllerRef);
      if (command === 'record') {
        const authorized = pushEnabled || (this.hasControllerContext(view, caller) && runResultPushGranted(task));
        return this.withPushAction(this.record(view, task, payload), authorized);
      }
      if (command === 'evaluate') {
        return this.withPushAction(this.evaluate(view, task, payload, pushEnabled), pushEnabled);
      }
      this.currentRun(task, text(payload.runId, 'runId'));
      if (command === 'observe') {
        if (payload.pushEvent !== undefined) {
          const event = object(payload.pushEvent, 'pushEvent');
          this.requirePushController(project, caller,
            { runGrant: event.kind === 'result' && runResultPushGranted(task) });
          const reason = pushEventRouteReason(view, task, event);
          check(!reason, reason, 'The push event no longer belongs to the bound worker and current run.');
          check(payload.eventId === event.eventId && payload.hostTurnId === event.workerTurnId,
            'INCOMPATIBLE_EVENT', 'The observation must match the push event and worker turn.');
        }
        return this.observe(view, task, payload);
      }
      if (command === 'resolve') return this.resolve(view, task, payload);
      if (command === 'verify' || command === 'accept') {
        check(!task.workSpec, 'STRUCTURED_EVALUATION_REQUIRED', 'Use evaluate for a run with a workSpec.');
      }
      if (command === 'verify') return this.verify(view, task, payload);
      if (command === 'accept') return this.accept(view, task, payload);
      if (task.worktree) {
        check(this.hasControllerContext(view, caller), 'AUTHORIZATION_REQUIRED',
          'Worktree archival requires the verified controller and registered checkout.');
      }
      return this.archive(view, task, payload);
    });
  }

  controllerCandidate({ projectRoot, roots, caller, claim = false, assessment = null, includeStatus = false }) {
    const root = canonicalRoot(projectRoot);
    check(Array.isArray(roots) && roots.includes(root), 'INVALID_INPUT', 'roots must include the canonical project root.');
    check(typeof claim === 'boolean', 'INVALID_INPUT', 'claim must be a boolean.');
    check(typeof includeStatus === 'boolean', 'INVALID_INPUT', 'includeStatus must be a boolean.');
    const threadId = text(caller?.threadId, 'caller.threadId');
    const hostId = caller.hostId ?? assessment?.hostId ?? null;
    if (hostId !== null) text(hostId, 'caller.hostId');
    const result = (decision, reason, project = null, claimed = false, extra = {}) =>
      ({ decision, reason, claimed, project, projectRoot: project?.projectRoot ?? root, ...extra });

    const projects = this.store.projectsForRoots(roots);
    if (projects.length > 1) return result('undetermined', 'CONFLICTING_REGISTRATION');
    const [registered] = projects;
    if (registered && hostId && registered.controllerRef.hostId !== hostId) {
      return result('undetermined', 'HOST_MISMATCH');
    }
    const worker = this.store.workerProject(threadId, hostId ?? registered?.controllerRef.hostId);
    if (worker) {
      if (registered?.controllerRef.threadId === threadId) return result('undetermined', 'CONFLICTING_REGISTRATION');
      return result('worker', 'REGISTERED_WORKER', worker);
    }
    const recognized = this.controllerView(registered, caller);
    if (recognized) {
      return result('controller', 'REGISTERED_CONTROLLER', recognized, false,
        includeStatus ? { tasks: this.controllerTasks(registered, recognized.controllerRef) } : {});
    }
    if (!assessment) return result('undetermined', 'DISCOVERY_REQUIRED');
    if (assessment.reason !== 'CANDIDATE') return result('undetermined', assessment.reason);
    const controller = workerRef({ threadId, hostId: assessment.hostId }, 'controller');
    if (hostId !== controller.hostId) return result('undetermined', 'HOST_MISMATCH');
    const hostProjectId = text(assessment.hostProjectId, 'hostProjectId');
    if (registered) {
      if (registered.hostProjectId !== hostProjectId) return result('undetermined', 'HOST_PROJECT_MISMATCH');
      registered.controllerAccess ??= [];
      const known = registered.controllerAccess.find(entry => sameWorker(entry.controllerRef, controller));
      const authorization = known?.authorization ?? defaultAuthorization();
      if (known) known.hostProjectId = hostProjectId;
      else registered.controllerAccess.push({ controllerRef: controller, hostProjectId, authorization });
      this.saveProjectAccess(registered);
      this.store.history('verify_controller_chat', { controller }, registered);
      const view = this.projectView(registered, controller, authorization);
      return result('controller', 'CONTROLLER_READY', view, false,
        includeStatus ? { tasks: this.controllerTasks(registered, controller) } : {});
    }
    const { project } = this.registerProject({
      projectId: randomUUID(), projectRoot: root, hostProjectId, controller,
      authorization: defaultAuthorization(),
    }, { firstClaim: true });
    return result('controller', 'CONTROLLER_CLAIMED', project, true, includeStatus ? { tasks: [] } : {});
  }

  registerProject(input, { firstClaim = false, caller = null } = {}) {
    const projectId = text(input.projectId, 'projectId');
    const projectRoot = canonicalRoot(input.projectRoot);
    const hostProjectId = text(input.hostProjectId, 'hostProjectId');
    const controller = workerRef(input.controller, 'controller');
    const authorization = object(input.authorization, 'authorization');
    text(authorization.source, 'authorization.source');
    for (const permission of Object.values(PERMISSIONS)) {
      check(typeof authorization[permission] === 'boolean', 'INVALID_AUTHORIZATION',
        `authorization.${permission} must be an explicit boolean.`);
    }
    check(authorization.scope === undefined || authorization.scope === 'project', 'INVALID_AUTHORIZATION',
      'authorization.scope must be project when specified.');
    check(authorization.pushEvents === undefined || typeof authorization.pushEvents === 'boolean',
      'INVALID_AUTHORIZATION', 'authorization.pushEvents must be a boolean when specified.');
    const prior = this.store.project(projectId);
    const grant = {
      ...Object.fromEntries([...Object.values(PERMISSIONS), 'source'].map(key => [key, authorization[key]])),
      ...(authorization.scope === 'project' ? { scope: 'project' } : {}),
      ...(authorization.pushEvents !== undefined ? { pushEvents: authorization.pushEvents } : {}),
    };
    if (prior) {
      check(prior.projectRoot === projectRoot && prior.hostProjectId === hostProjectId
        && prior.controllerRef.hostId === controller.hostId,
      'PROJECT_IDENTITY_CONFLICT', 'A registered project root and host project identity are fixed.');
      if (caller || prior.controllerSelection === 'automatic' || prior.controllerAccess?.length
        || authorization.scope === 'project' || prior.authorization.scope === 'project') {
        const view = this.requireController(prior, caller);
        check(sameWorker(view.controllerRef, controller), 'CONTROLLER_REQUIRED',
          'A conversation can update only its own delegation.');
        const peer = prior.controllerAccess?.find(entry => sameWorker(entry.controllerRef, controller));
        if (peer) {
          peer.authorization = grant;
          this.saveProjectAccess(prior);
          const project = this.projectView(prior, controller, grant);
          this.store.history('project', input, project);
          return { project, task: null, action: null, needsReconciliation: false };
        }
      } else if (!sameWorker(prior.controllerRef, controller)) {
        check(this.store.tasks(projectId).length === 0, 'CONTROLLER_REQUIRED',
          'Existing work retains its controller.');
      }
    } else if (!firstClaim) {
      check(authorization.scope !== 'project' && (!caller ||
        (caller.threadId === controller.threadId && (!caller.hostId || caller.hostId === controller.hostId)
          && !this.store.workerProject(caller.threadId, controller.hostId))),
      'CONTROLLER_REQUIRED', 'Project delegation requires a verified controller conversation.');
    }
    const collision = this.store.db.prepare(`SELECT project_id FROM projects WHERE project_id != ?
      AND (project_root = ? OR (? = 1 AND host_id = ? AND host_project_id = ?))`)
      .get(projectId, projectRoot, Number(!firstClaim && !prior), controller.hostId, hostProjectId);
    check(!collision, 'PROJECT_IDENTITY_CONFLICT', 'That root or host project is already registered.',
      collision ? { projectId: collision.project_id } : undefined);
    const now = new Date().toISOString();
    const project = {
      projectId, projectRoot, hostProjectId, controller, controllerRef: controller,
      ...(firstClaim || prior?.controllerSelection === 'automatic' ? {controllerSelection: 'automatic'} : {}),
      ...(prior?.controllerAccess ? { controllerAccess: prior.controllerAccess } : {}),
      authorization: grant,
      createdAt: prior?.createdAt ?? now, updatedAt: now,
    };
    const update = firstClaim ? '' : ' ON CONFLICT(project_id) DO UPDATE SET json = excluded.json';
    this.store.db.prepare(`INSERT INTO projects(project_id, project_root, host_id, host_project_id, json)
      VALUES (?, ?, ?, ?, ?)${update}`)
      .run(projectId, projectRoot, controller.hostId, hostProjectId, JSON.stringify(project));
    this.store.history(firstClaim ? 'claim_controller' : 'project', input, project);
    return { project: this.projectView(project), task: null, action: null, needsReconciliation: false };
  }

  syncProject(project, input, caller) {
    const view = this.requireController(project, caller);
    const hostProjectId = text(input.hostProjectId, 'hostProjectId');
    const hostId = text(input.hostId, 'hostId');
    const controllerThreadId = text(input.controllerThreadId, 'controllerThreadId');
    check(hostId === view.controllerRef.hostId && caller.hostId === hostId
      && controllerThreadId === view.controllerRef.threadId,
    'CONTROLLER_REQUIRED', 'Project synchronization requires the verified caller and host.');
    const previousHostProjectId = project.hostProjectId;
    if (previousHostProjectId === hostProjectId) {
      return { project: view, task: null, action: null, needsReconciliation: false };
    }
    check(sameWorker(project.controllerRef, view.controllerRef), 'HOST_PROJECT_MISMATCH',
      'A peer conversation must use the verified Desktop project group.');
    const tasks = this.store.tasks(project.projectId);
    const pending = tasks.find(task => task.pendingAction?.type === 'create');
    check(!pending, 'PENDING_ACTION', 'Resolve the existing create action before synchronizing the project.',
      pending ? { taskId: pending.taskId, actionId: pending.pendingAction.id } : undefined);
    for (const task of tasks) {
      if (task.workerRef && task.workerHostProjectId == null) {
        task.workerHostProjectId = previousHostProjectId;
        this.store.saveTask(task);
      }
    }
    project.hostProjectId = hostProjectId;
    project.updatedAt = new Date().toISOString();
    this.store.db.prepare('UPDATE projects SET host_project_id = ?, json = ? WHERE project_id = ?')
      .run(hostProjectId, JSON.stringify(project), project.projectId);
    this.store.history('sync-project', { ...input, previousHostProjectId }, project);
    return { project: this.projectView(project), task: null, action: null, needsReconciliation: false, previousHostProjectId };
  }

  getTask(projectId, taskId) {
    const task = this.store.task(projectId, taskId);
    check(task, 'TASK_NOT_FOUND', `Task does not exist: ${taskId}`);
    return task;
  }

  getAction(task, actionId) {
    const row = this.store.action(task.projectId, task.taskId, actionId);
    check(row, 'ACTION_NOT_FOUND', 'No action with that id belongs to this task.');
    this.currentRun(task, row.run_id);
    return row;
  }

  currentRun(task, runId) {
    check(task.runId === runId, 'STALE_RUN', 'The run is no longer current.',
      { currentRunId: task.runId, receivedRunId: runId });
  }

  saveProjectAccess(project) {
    project.updatedAt = new Date().toISOString();
    this.store.db.prepare('UPDATE projects SET json = ? WHERE project_id = ?')
      .run(JSON.stringify(project), project.projectId);
  }

  projectView(project, controllerRef = project.controllerRef, authorization = project.authorization) {
    const { controllerAccess, ...view } = project;
    return { ...view, controller: controllerRef, controllerRef, authorization };
  }

  controllerView(project, caller) {
    if (!project || !caller?.threadId || (caller.hostId && caller.hostId !== project.controllerRef.hostId)
      || this.store.workerProject(caller.threadId, project.controllerRef.hostId)) return null;
    if (caller.threadId === project.controllerRef.threadId) return this.projectView(project);
    const peer = project.controllerAccess?.find(entry => entry.controllerRef.threadId === caller.threadId
      && entry.hostProjectId === project.hostProjectId);
    return peer ? this.projectView(project, peer.controllerRef, peer.authorization) : null;
  }

  controllerTasks(project, controllerRef) {
    return this.store.tasks(project.projectId)
      .filter(task => sameWorker(controllerForRun(project, task), controllerRef));
  }

  requireController(project, caller) {
    const view = this.controllerView(project, caller);
    check(view, 'CONTROLLER_REQUIRED', 'Project operations require a verified non-worker conversation.');
    return view;
  }

  requireRunController(project, task, controllerRef) {
    check(sameWorker(controllerForRun(project, task), controllerRef), 'CONTROLLER_REQUIRED',
      'This execution belongs to the conversation that assigned it.');
  }

  requirePushController(project, caller, { removingHook = false, runGrant = false } = {}) {
    const view = this.requireController(project, caller);
    check((caller.hostId ?? 'local') === view.controllerRef.hostId,
      'CONTROLLER_REQUIRED', 'The current host must match the registered controller host.');
    check(caller.projectRoots?.includes(project.projectRoot),
      'PROJECT_SCOPE_MISMATCH', 'The current checkout must belong to the registered project.');
    if (removingHook) {
      const ref = view.controllerRef;
      if (!pushGranted(view.authorization)) {
        const previousGrant = this.store.db.prepare(`SELECT 1 FROM history
          WHERE project_id = ? AND command = 'project'
            AND json_extract(snapshot_json, '$.controllerRef.threadId') = ?
            AND json_extract(snapshot_json, '$.controllerRef.hostId') = ?
            AND json_extract(snapshot_json, '$.authorization.scope') = 'project'
            AND json_extract(snapshot_json, '$.authorization.pushEvents') = 1
          LIMIT 1`).get(project.projectId, ref.threadId, ref.hostId);
        check(previousGrant, 'AUTHORIZATION_REQUIRED',
          'Removing the managed hook requires a current or previous pushEvents grant.');
      }
      const anotherGrant = [project, ...(project.controllerAccess ?? [])].some(entry =>
        !sameWorker(entry.controllerRef, ref) && pushGranted(entry.authorization));
      check(!anotherGrant, 'HOOK_CONFIG_CONFLICT', 'Another conversation still has pushEvents authorization.');
    } else {
      check(runGrant || pushGranted(view.authorization),
        'AUTHORIZATION_REQUIRED', 'Project delegation and explicit pushEvents authorization are required.');
    }
    return view;
  }

  hasControllerContext(project, caller) {
    return caller?.threadId === project.controllerRef.threadId
      && (caller.hostId ?? 'local') === project.controllerRef.hostId
      && caller.projectRoots?.includes(project.projectRoot) === true;
  }

  canPush(project, caller) {
    return pushGranted(project.authorization) && this.hasControllerContext(project, caller);
  }

  withPushAction(result, authorized) {
    const { action, project, task } = result;
    if (!authorized || !task.pushEnabled || !['create', 'send'].includes(action?.type)) return result;
    const { projectRoot, projectId, authorization } = project;
    const controllerRef = controllerForRun(project, task);
    const { taskId, runId } = task;
    return { ...result, action: { ...action, push: {
      projectRoot, projectId, taskId, runId, hostId: controllerRef.hostId, controllerRef,
      stateDir: this.store.stateDir,
      authorizationSource: task.resultPushAuthorizationSource ?? authorization.source,
    } } };
  }

  authorize(project, type, task) {
    if (type === 'archive' && runArchiveGranted(project, task)) return;
    const permission = PERMISSIONS[type];
    check(project.authorization[permission] === true,
      'AUTHORIZATION_REQUIRED', `Explicit ${permission} authorization is required.`,
      { permission, source: project.authorization.source });
  }

  workerProjectMatches(project, task) {
    return task.workerHostProjectId == null || task.workerHostProjectId === project.hostProjectId;
  }

  requireWorkerProject(project, task) {
    check(this.workerProjectMatches(project, task), 'WORKER_PROJECT_MISMATCH',
      'The worker belongs to a different host project.',
      { workerHostProjectId: task.workerHostProjectId, hostProjectId: project.hostProjectId });
  }

  response(project, task, executable = true, archiveWorktreePath = null) {
    let action = executable && !task.needsReconciliation ? task.pendingAction : null;
    if (['send', 'unarchive'].includes(action?.type) && !this.workerProjectMatches(project, task)) action = null;
    // A saved worktree archive plan is executable only after a fresh Desktop and Git check.
    if (action?.type === 'archive' && task.worktree && !archiveWorktreePath) action = null;
    if (action) this.authorize(project, action.type, task);
    return { project, task, action, needsReconciliation: task.needsReconciliation };
  }

  planAction(project, task, type, { archiveWorktreePath } = {}) {
    check(!task.pendingAction, 'PENDING_ACTION', 'An action is already pending.');
    this.authorize(project, type, task);
    const id = randomUUID();
    const action = {
      id, actionId: id, type, projectId: project.projectId, projectRoot: project.projectRoot,
      taskId: task.taskId, runId: task.runId, requestId: task.requestId,
      prompt: task.prompt, profile: task.profile,
      workerRef: type === 'create' ? null : task.workerRef,
      hostProjectId: project.hostProjectId, controllerRef: controllerForRun(project, task),
      ...(task.workSpec && (type === 'create' || type === 'send' || type === 'unarchive')
        ? { workSpec: task.workSpec } : {}),
      ...(task.worktree && { worktree: task.worktree }),
      ...(archiveWorktreePath && { archiveWorktreePath }),
      ...(task.retryContext && type === 'send' ? { retryContext: task.retryContext } : {}),
    };
    check(type === 'create' || action.workerRef, 'INVALID_STATE', 'This action requires an existing worker.');
    this.store.db.prepare(`INSERT INTO actions(action_id, project_id, task_id, run_id, type, outcome, json)
      VALUES (?, ?, ?, ?, ?, 'planned', ?)`)
      .run(id, task.projectId, task.taskId, task.runId, type, JSON.stringify(action));
    task.pendingAction = action;
    task.needsReconciliation = false;
    return action;
  }

  dispatch(project, input, pushEnabled) {
    const requestId = text(input.requestId, 'requestId');
    const prompt = text(input.prompt, 'prompt');
    const requestedProfile = profile(input.profile);
    const workSpec = parseWorkSpec(input.workSpec, requestedProfile.thinking);
    const { resultPushAuthorizationSource, archiveAuthorizationSource } = input;
    const task = this.store.task(project.projectId, input.taskId);
    const worktree = parseWorktree(input.worktree) ?? task?.worktree;
    check(input.reuseOnly === undefined || typeof input.reuseOnly === 'boolean',
      'INVALID_INPUT', 'reuseOnly must be a boolean when specified.');
    check(input.reuseOnly !== true || task?.workerRef,
      'WORKER_NOT_FOUND', 'Reuse requires an existing bound worker.');
    const request = this.store.request(project.projectId, input.taskId, requestId);
    if (request) {
      const recordedRequest = JSON.parse(request.json);
      check(request.prompt === prompt && request.profile_json === JSON.stringify(requestedProfile)
        && isDeepStrictEqual(recordedRequest.workSpec, workSpec)
        && isDeepStrictEqual(recordedRequest.worktree, worktree)
        && recordedRequest.resultPushAuthorizationSource === resultPushAuthorizationSource
        && recordedRequest.archiveAuthorizationSource === archiveAuthorizationSource,
      'REQUEST_REPLAY_MISMATCH', 'requestId was already used with different dispatch parameters.');
      const currentRequest = request.run_id === task.runId;
      if (currentRequest && task.workerRef) this.requireWorkerProject(project, task);
      // A confirmed unarchive leaves the run planned without an action while send is unauthorized.
      if (currentRequest && task.phase === 'planned' && !task.pendingAction
        && project.authorization[PERMISSIONS.send] === true) {
        this.planAction(project, task, 'send');
        this.store.saveTask(task);
        this.store.history('dispatch', input, project, task);
      }
      return this.response(project, task, currentRequest);
    }
    if (task) {
      check(isDeepStrictEqual(task.worktree, worktree),
        'WORKTREE_ASSIGNMENT_MISMATCH', 'An existing task must retain its worktree assignment.');
      if (task.workerRef) this.requireWorkerProject(project, task);
      check(!task.pendingAction && !task.needsReconciliation && task.hostStatus !== 'unknown'
        && !['planned', 'running', 'waiting'].includes(task.phase),
        'TASK_BUSY', 'The task already has an active run or pending action.');
      check(task.waits.length === 0, 'UNRESOLVED_WAITS', 'Resolve all waits before starting another run.');
      check(task.workerRef || task.phase === 'rejected', 'INVALID_STATE',
        'An existing task must retain its worker identity unless creation was rejected.');
      check(!task.workSpec || ['complete', 'rejected'].includes(task.phase),
        'STRUCTURED_EVALUATION_REQUIRED', 'Evaluate the current structured work before starting another dispatch.');
    }
    const actionType = task?.workerRef ? task.archived ? 'unarchive' : 'send' : 'create';
    this.authorize(project, task?.workerRef ? 'send' : 'create');
    if (actionType === 'unarchive') this.authorize(project, actionType);
    const verifiedWorkerProject = !task?.workerRef || task.workerHostProjectId === project.hostProjectId;
    check(resultPushAuthorizationSource === undefined || verifiedWorkerProject,
      'WORKER_PROJECT_MISMATCH', 'One-run result delivery requires the registered worker project.');
    check(archiveAuthorizationSource === undefined || verifiedWorkerProject,
      'WORKER_PROJECT_MISMATCH', 'One-run archive authorization requires the registered worker project.');
    if (actionType === 'create' && worktree) verifyWorktreeStart(project.projectRoot, worktree);
    return this.startRun(project, task, {
      ...input, requestId, prompt, requestedProfile, workSpec, worktree, runId: randomUUID(),
      pushEnabled: verifiedWorkerProject && (pushEnabled || resultPushAuthorizationSource !== undefined),
    }, actionType, input);
  }

  startRun(project, prior, run, actionType, historyInput) {
    const { runId, requestId, prompt, requestedProfile, workSpec, retryContext, pushEnabled,
      resultPushAuthorizationSource, archiveAuthorizationSource } = run;
    const worktree = prior?.worktree ?? run.worktree;
    const now = new Date().toISOString();
    const task = {
      projectId: project.projectId, taskId: run.taskId, runId, requestId, prompt,
      controllerRef: controllerForRun(project, prior),
      profile: requestedProfile, requestedProfile, effectiveProfile: null,
      workerRef: prior?.workerRef ?? null,
      ...(prior?.workerHostProjectId != null ? { workerHostProjectId: prior.workerHostProjectId } : {}),
      ...(workSpec && { workSpec }),
      ...(worktree && { worktree }),
      ...(retryContext && { retryContext }),
      ...(pushEnabled && { pushEnabled: true, runStartedAt: now }),
      ...(resultPushAuthorizationSource !== undefined && { resultPushAuthorizationSource }),
      ...(archiveAuthorizationSource !== undefined && { archiveAuthorizationSource }),
      archived: prior?.archived ?? false, phase: 'planned', hostStatus: null,
      pendingAction: null, needsReconciliation: false,
      verification: unverified(runId), accepted: false, resultReviewed: false,
      result: null, waits: [], resolvedWaits: [],
      version: prior?.version ?? 1, createdAt: prior?.createdAt ?? now, updatedAt: now,
    };
    if (!prior) this.store.saveTask(task, { insert: true });
    this.store.db.prepare(`INSERT INTO requests(project_id, task_id, request_id, run_id, prompt, profile_json, json)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(task.projectId, task.taskId, requestId, runId, prompt, JSON.stringify(requestedProfile), JSON.stringify(task));
    this.planAction(project, task, actionType);
    this.store.saveTask(task);
    this.store.history('dispatch', historyInput, project, task);
    return this.response(project, task);
  }

  record(project, task, input) {
    const actionId = text(input.actionId, 'actionId');
    const { outcome } = input;
    check(['succeeded', 'failed', 'unknown', 'rejected'].includes(outcome),
      'INVALID_INPUT', 'outcome must be succeeded, failed, unknown, or rejected.');
    text(input.evidenceRef, 'evidenceRef');
    const row = this.getAction(task, actionId);
    if (input.runId !== undefined) this.currentRun(task, text(input.runId, 'runId'));
    const action = JSON.parse(row.json);
    const recorded = { outcome, receipt: input.receipt ?? null, evidenceRef: input.evidenceRef };
    if (row.outcome === 'succeeded' || row.outcome === 'rejected') {
      // An old receipt cannot apply to a later action in the same run.
      check(isDeepStrictEqual(JSON.parse(row.record_json).receipt, recorded.receipt)
        && outcome === row.outcome,
      'ACTION_REPLAY_MISMATCH', 'An already confirmed action cannot be overwritten.');
      const resumeSend = action.type === 'unarchive' && task.pendingAction?.type === 'send'
        && project.authorization[PERMISSIONS.send] === true;
      return this.response(project, task, resumeSend);
    }
    check(task.pendingAction?.id === actionId, 'STALE_ACTION', 'The action is no longer pending.');
    if (row.record_json && isDeepStrictEqual(JSON.parse(row.record_json), recorded)) return this.response(project, task);
    if (outcome === 'succeeded') this.applyReceipt(project, task, action, input.receipt);
    if (outcome === 'rejected') {
      check(action.type === 'create' && !task.workerRef && recorded.receipt === null, 'INVALID_REJECTION',
        'Rejection requires a confirmed pre-execution create denial with no success receipt.');
      task.phase = 'rejected';
      task.hostStatus = 'rejected';
    }
    this.store.db.prepare('UPDATE actions SET outcome = ?, record_json = ? WHERE action_id = ?')
      .run(outcome, JSON.stringify(recorded), actionId);

    const terminal = outcome === 'succeeded' || outcome === 'rejected';
    task.needsReconciliation = !terminal;
    if (terminal) {
      task.pendingAction = null;
      if (action.type === 'unarchive' && project.authorization[PERMISSIONS.send] === true
        && this.workerProjectMatches(project, task)) {
        this.planAction(project, task, 'send');
      }
    }
    this.store.saveTask(task);
    this.store.history('record', input, project, task);
    return this.response(project, task);
  }

  applyReceipt(project, task, action, receipt) {
    this.currentRun(task, action.runId);
    check(task.pendingAction?.id === action.id, 'STALE_ACTION', 'Only the current pending action can be confirmed.');
    object(receipt, 'receipt');
    if (action.type === 'create') {
      const bound = workerRef(receipt.workerRef, 'receipt.workerRef');
      check(bound.hostId === action.controllerRef.hostId, 'WORKER_IDENTITY_CONFLICT',
        'The created worker must belong to the planned host.');
      check(!sameWorker(bound, action.controllerRef), 'WORKER_IDENTITY_CONFLICT',
        'The controller conversation cannot be its own worker.');
      check(!task.workerRef || sameWorker(task.workerRef, bound),
        'WORKER_IDENTITY_CONFLICT', 'A task cannot acquire a second worker.');
      const collision = this.store.db.prepare(`SELECT project_id, task_id FROM tasks
        WHERE worker_host_id = ? AND worker_thread_id = ?
        AND (project_id != ? OR task_id != ?)`)
        .get(bound.hostId, bound.threadId, task.projectId, task.taskId);
      check(!collision, 'WORKER_IDENTITY_CONFLICT', 'That worker is already bound to another task.');
      task.workerRef = bound;
      task.workerHostProjectId = action.hostProjectId;
      task.phase = 'running';
      task.hostStatus = 'running';
    } else {
      check(sameWorker(workerRef(receipt.workerRef, 'receipt.workerRef'), task.workerRef)
        && sameWorker(action.workerRef, task.workerRef),
      'WORKER_IDENTITY_CONFLICT', 'The receipt must identify this task\'s existing worker.');
      if (action.type === 'archive' || action.type === 'unarchive') {
        check(receipt.archived === (action.type === 'archive'), 'INVALID_RECEIPT',
          'receipt.archived must explicitly confirm the planned archive state.');
        task.archived = receipt.archived;
      } else {
        task.phase = 'running';
        task.hostStatus = 'running';
      }
    }
  }

  observe(project, task, input) {
    text(input.eventId, 'eventId');
    text(input.evidenceRef, 'evidenceRef');
    check(OBSERVATIONS.has(input.status), 'INVALID_INPUT', 'Unknown observation status.');
    const duplicate = this.store.db.prepare(`SELECT run_id FROM events
      WHERE project_id = ? AND task_id = ? AND event_id = ?`)
      .get(task.projectId, task.taskId, input.eventId);
    if (duplicate) {
      check(duplicate.run_id === task.runId, 'EVENT_ID_CONFLICT',
        'The observation ID already belongs to a different run of this task.');
      return this.response(project, task, false);
    }
    check(input.pushEvent?.kind !== 'approval' || task.phase !== 'review',
      'RUN_FINISHED', 'A pushed approval cannot change a run with an observed terminal result.');
    check(task.phase !== 'complete' && task.phase !== 'rejected', 'RUN_FINISHED',
      'An accepted or rejected run is immutable.');
    check(!task.pendingAction && task.phase !== 'planned',
      'PENDING_ACTION', 'Confirm dispatch before observing its run.');
    const previousHostStatus = task.hostStatus;
    task.hostStatus = input.status;
    task.needsReconciliation = input.status === 'unknown';
    task.verification = unverified(task.runId);
    task.accepted = false;
    task.resultReviewed = false;
    delete task.evaluation;
    if (Object.hasOwn(WAIT_KINDS, input.status)) {
      this.observeWaits(task, input, previousHostStatus);
      if (task.phase !== 'review') task.phase = task.waits.length ? 'waiting' : 'running';
    } else if (input.status === 'completed') {
      const result = object(input.result, 'result');
      check(typeof result.success === 'boolean', 'INVALID_INPUT', 'result.success must be an explicit boolean.');
      task.result = { success: result.success, summary: text(result.summary, 'result.summary'),
        evidenceRef: input.evidenceRef, eventId: input.eventId };
      task.phase = 'review';
    } else if (input.status === 'failed') {
      if (input.result !== undefined) object(input.result, 'result');
      task.result = { success: false, summary: input.result?.summary ?? 'Worker reported failure.',
        evidenceRef: input.evidenceRef, eventId: input.eventId };
      text(task.result.summary, 'result.summary');
      task.phase = 'review';
    } else if (input.status === 'unknown') {
      task.result = { success: null, summary: 'Worker outcome is unknown.', evidenceRef: input.evidenceRef };
      // Missing host state is not a terminal result and must never release the worker.
      // Keep any known review phase terminal; a fresh completed/failed event can reconcile it.
      if (task.phase !== 'review') task.phase = task.waits.length ? 'waiting' : 'running';
    } else {
      check(task.phase !== 'review', 'INVALID_TRANSITION', 'A terminal observation cannot regress to running.');
      task.phase = task.waits.length ? 'waiting' : 'running';
    }
    this.store.db.prepare(`INSERT INTO events(project_id, task_id, event_id, run_id, json)
      VALUES (?, ?, ?, ?, ?)`)
      .run(task.projectId, task.taskId, input.eventId, task.runId, JSON.stringify(input));
    this.store.saveTask(task);
    this.store.history('observe', input, project, task);
    return this.response(project, task, false);
  }

  observeWaits(task, input, previousHostStatus) {
    const primaryKind = WAIT_KINDS[input.status];
    const inBatch = input.waits !== undefined;
    const entries = inBatch ? input.waits : [{ waitId: input.waitId, kind: primaryKind }];
    check(Array.isArray(entries) && entries.length > 0, 'INVALID_INPUT', 'waits must be a nonempty array.');
    check(entries[0]?.kind === primaryKind && (input.waitId === undefined || input.waitId === entries[0].waitId),
      'INVALID_INPUT', 'The wait status and waitId must match the first wait.');
    for (const entry of entries) {
      object(entry, 'wait');
      const sourceId = text(entry.waitId, 'wait.waitId');
      const { kind, anonymous } = entry;
      check(kind === 'approval' || kind === 'input', 'INVALID_INPUT', 'wait.kind must be approval or input.');
      check(anonymous === undefined || typeof anonymous === 'boolean', 'INVALID_INPUT', 'wait.anonymous must be a boolean.');
      const matches = wait => (anonymous ? wait.sourceWaitId ?? wait.id : wait.id) === sourceId;
      const existing = task.waits.find(matches);
      const resolved = task.resolvedWaits.find(matches);
      check((!existing || existing.kind === kind) && (!resolved || resolved.kind === kind),
        'WAIT_ID_CONFLICT', 'A wait id cannot change kind.');
      if (existing) continue;
      if (resolved && !inBatch) {
        throw new OrchestratorError('WAIT_ID_CONFLICT', 'A resolved wait id cannot be reopened.');
      }
      // Host flags without request IDs can recur during one turn. Only a new running
      // observation separates a resolved flag from the next occurrence of that flag.
      if (resolved && (!anonymous || previousHostStatus !== 'running')) continue;
      const id = resolved ? randomUUID() : sourceId;
      task.waits.push({ id, waitId: id, kind, runId: task.runId, evidenceRef: input.evidenceRef,
        ...(input.pushEvent?.kind === 'approval' && kind === 'approval' ? { workerTurnId: input.hostTurnId } : {}),
        ...(anonymous ? { sourceWaitId: sourceId } : {}) });
    }
  }

  resolve(project, task, input) {
    const id = text(input.waitId, 'waitId');
    text(input.evidenceRef, 'evidenceRef');
    const wait = task.waits.find(entry => entry.id === id && entry.runId === task.runId);
    if (!wait) {
      check(task.resolvedWaits.some(entry => entry.id === id && entry.runId === task.runId),
        'WAIT_NOT_FOUND', 'No matching unresolved wait exists in this run.');
      return this.response(project, task, false);
    }
    task.waits = task.waits.filter(entry => entry.id !== id);
    task.resolvedWaits.push({ ...wait, resolutionEvidenceRef: input.evidenceRef });
    if (task.phase === 'waiting' && task.waits.length === 0) task.phase = 'running';
    this.store.saveTask(task);
    this.store.history('resolve', input, project, task);
    return this.response(project, task, false);
  }

  evaluationObservation(task, resultEventId) {
    const row = this.store.db.prepare(`SELECT event_id, json FROM events
      WHERE project_id = ? AND task_id = ? AND run_id = ?
      ORDER BY (json_extract(json, '$.status') IN ('completed', 'failed')) DESC, rowid DESC LIMIT 1`)
      .get(task.projectId, task.taskId, task.runId);
    check(row?.event_id === resultEventId, 'STALE_RESULT', 'Evaluation must identify the current result event.',
      { currentResultEventId: row?.event_id, receivedResultEventId: resultEventId });
    return JSON.parse(row.json);
  }

  evaluate(project, task, input, pushEnabled) {
    const runId = text(input.runId, 'runId');
    if (runId !== task.runId) {
      const row = this.store.db.prepare('SELECT json FROM requests WHERE project_id = ? AND task_id = ? AND run_id = ?')
        .get(task.projectId, task.taskId, runId);
      const prior = row && JSON.parse(row.json);
      if (prior?.evaluation?.decision.type === 'retry') return this.replayDecision(project, task, prior, input);
      this.currentRun(task, runId);
    }
    check(task.workSpec, 'WORK_SPEC_REQUIRED', 'Evaluation requires a run with a workSpec.');
    const review = parseEvaluation(input, task.workSpec, Boolean(task.worktree));
    if (task.evaluation?.decision.type === 'complete') return this.replayDecision(project, task, task, input);
    const observation = this.evaluationObservation(task, review.resultEventId);
    const diagnostics = decisionEvidence(task.workSpec, review, observation);
    const decision = { runId, resultEventId: review.resultEventId, diagnostics };

    if (review.userDecision) {
      return this.saveDecision(project, task, review, { ...decision, type: 'needs_user', ...review.userDecision });
    }

    const blocked = this.evaluationBlockers(task, diagnostics);
    if (blocked.length) {
      return this.saveDecision(project, task, review, { ...decision, type: 'blocked', reasons: blocked });
    }
    const outstanding = diagnostics.checks.filter(entry => !isSupportedCheck(entry));
    if (outstanding.length === 0 && task.hostStatus === 'completed' && task.result?.success === true) {
      return this.completeEvaluation(project, task, review, { ...decision, type: 'complete' });
    }
    return this.evaluateRetry(project, task, review, decision, outstanding, pushEnabled);
  }

  evaluationBlockers(task, diagnostics) {
    const reasons = [];
    if (task.waits.length) reasons.push('UNRESOLVED_WAITS');
    if (task.pendingAction || task.needsReconciliation) reasons.push('RECONCILIATION_REQUIRED');
    if (task.phase !== 'review' || !['completed', 'failed'].includes(task.hostStatus)) {
      reasons.push('RESULT_NOT_TERMINAL');
    }
    if (diagnostics.checks.some(entry => entry.status === 'met' && !isSupportedCheck(entry))) {
      reasons.push('CONTROLLER_EVIDENCE_REQUIRED');
    }
    if (diagnostics.constraintReview && !isSupportedCheck(diagnostics.constraintReview)) {
      reasons.push('CONSTRAINTS_NOT_CONFIRMED');
    }
    return reasons;
  }

  evaluateRetry(project, task, review, decision, outstanding, pushEnabled) {
    const reasons = [];
    if (outstanding.length) reasons.push('CRITERIA_NOT_MET');
    if (task.result?.success !== true) reasons.push('RESULT_NOT_SUCCESSFUL');
    const requestedProfile = nextRetryProfile(task);
    const blockers = [];
    if (!this.workerProjectMatches(project, task)) blockers.push('WORKER_PROJECT_MISMATCH');
    if (!project.authorization.sendFollowups) blockers.push('AUTHORIZATION_REQUIRED');
    if (!requestedProfile) blockers.push('NO_HIGHER_EFFORT');
    if (!task.workerRef || task.archived) blockers.push('WORKER_UNAVAILABLE');
    if (blockers.length) {
      return this.saveDecision(project, task, review, { ...decision, type: 'blocked', reasons: [...blockers, ...reasons] });
    }

    const nextRunId = randomUUID();
    const requestId = randomUUID();
    const retry = { ...decision, type: 'retry', nextRunId, requestId, profile: requestedProfile, reasons };
    this.saveDecision(project, task, review, retry);
    const retryContext = { previousRunId: task.runId, resultEventId: decision.resultEventId,
      resultEvidenceRef: decision.diagnostics.resultEvidenceRef, workerVerification: decision.diagnostics.workerVerification,
      checks: outstanding, constraintReview: decision.diagnostics.constraintReview, reasons };
    const response = this.startRun(project, task, {
      taskId: task.taskId, runId: nextRunId, requestId, prompt: task.prompt,
      requestedProfile, workSpec: task.workSpec, retryContext, pushEnabled: task.pushEnabled && pushEnabled,
    }, 'send', { source: 'evaluate', previousRunId: task.runId, resultEventId: decision.resultEventId, requestId });
    return { ...response, decision: retry };
  }

  saveDecision(project, task, input, decision) {
    const evaluation = { input, decision };
    if (!isDeepStrictEqual(task.evaluation, evaluation)) {
      task.evaluation = evaluation;
      this.store.saveTask(task);
      this.store.history('evaluate', input, project, task);
    }
    return { ...this.response(project, task, false), decision };
  }

  completeEvaluation(project, task, review, decision) {
    this.saveDecision(project, task, review, decision);
    const { checks, constraintReview } = decision.diagnostics;
    const evidenceRefs = [...checks.flatMap(entry => entry.controllerEvidenceRefs),
      ...(constraintReview?.controllerEvidenceRefs ?? [])];
    this.verify(project, task, { runId: task.runId, resultEventId: review.resultEventId, status: 'passed', evidenceRefs });
    return { ...this.accept(project, task, { runId: task.runId, keepWorker: review.keepWorker }), decision };
  }

  replayDecision(project, task, prior, input) {
    const { decision, input: original } = prior.evaluation;
    const review = parseEvaluation(input, prior.workSpec, original.keepWorker);
    check(review.resultEventId === original.resultEventId, 'STALE_RESULT', 'Evaluation must identify the decided result event.',
      { currentResultEventId: original.resultEventId, receivedResultEventId: review.resultEventId });
    check(isDeepStrictEqual(review, original), 'EVALUATION_REPLAY_MISMATCH',
      'This result already produced a decision with different evaluation inputs.');
    const action = task.pendingAction;
    const retry = task.runId === decision.nextRunId && action?.type === 'send';
    const archive = decision.type === 'complete' && task.runId === decision.runId && action?.type === 'archive';
    const executable = (retry && project.authorization.sendFollowups === true && this.workerProjectMatches(project, task))
      || (archive && (project.authorization.archiveCompleted === true || runArchiveGranted(project, task)));
    return { ...this.response(project, task, executable), decision };
  }

  verify(project, task, input) {
    check(task.phase === 'review', 'INVALID_PHASE', 'Verification requires a run in review.');
    check(!task.pendingAction, 'PENDING_ACTION', 'A host action is still pending.');
    check(input.status === 'passed' || input.status === 'failed', 'INVALID_INPUT', 'Verification status must be passed or failed.');
    check(Array.isArray(input.evidenceRefs), 'INVALID_INPUT', 'evidenceRefs must be an array.');
    input.evidenceRefs.forEach((value, index) => text(value, `evidenceRefs[${index}]`));
    check(input.status !== 'passed' || input.evidenceRefs.length > 0,
      'VERIFICATION_EVIDENCE_REQUIRED', 'Passing verification requires nonempty evidenceRefs.');
    // Event insertion order also identifies results in snapshots saved before result.eventId existed.
    const terminalEvents = this.store.db.prepare(`SELECT event_id FROM events
      WHERE project_id = ? AND task_id = ? AND run_id = ?
      AND json_extract(json, '$.status') IN ('completed', 'failed')
      ORDER BY rowid DESC LIMIT 2`).all(task.projectId, task.taskId, task.runId);
    const currentResultEventId = typeof task.result?.success === 'boolean'
      ? task.result.eventId ?? terminalEvents[0]?.event_id : undefined;
    if (input.resultEventId === undefined) {
      check(terminalEvents.length < 2, 'RESULT_EVENT_ID_REQUIRED',
        'resultEventId is required after a terminal result has been replaced.', { currentResultEventId });
    } else {
      const receivedResultEventId = text(input.resultEventId, 'resultEventId');
      check(receivedResultEventId === currentResultEventId, 'STALE_RESULT',
        'Verification must identify the current terminal result.', { currentResultEventId, receivedResultEventId });
    }
    task.verification = { runId: task.runId, status: input.status, evidenceRefs: [...new Set(input.evidenceRefs)] };
    task.accepted = false;
    task.resultReviewed = false;
    this.store.saveTask(task);
    this.store.history('verify', input, project, task);
    return this.response(project, task, false);
  }

  readyForAcceptance(task) {
    check(task.result?.success === true, 'RESULT_NOT_SUCCESSFUL', 'The result must explicitly report success.');
    check(task.verification?.runId === task.runId && task.verification.status === 'passed'
      && task.verification.evidenceRefs.length > 0,
    'VERIFICATION_REQUIRED', 'The current run needs passing verification with evidence.');
    check(task.waits.length === 0, 'UNRESOLVED_WAITS', 'Approval and input waits must be resolved.');
    check(!task.pendingAction && !task.needsReconciliation, 'PENDING_ACTION', 'A host action is still pending.');
  }

  accept(project, task, input) {
    check(input.keepWorker === undefined || typeof input.keepWorker === 'boolean',
      'INVALID_INPUT', 'keepWorker must be a boolean when specified.');
    const standingArchive = project.authorization.scope === 'project' && project.authorization.archiveCompleted === true;
    const keepWorker = input.keepWorker ?? Boolean(task.worktree);
    const archiveOnAcceptance = !task.worktree && !keepWorker && (standingArchive || runArchiveGranted(project, task));
    if (task.phase === 'complete' && task.accepted) {
      if (archiveOnAcceptance && task.pendingAction?.type === 'archive') return this.archive(project, task, input);
      return this.response(project, task, false);
    }
    check(task.phase === 'review', 'INVALID_PHASE', 'Only a reviewed terminal result can be accepted.');
    this.readyForAcceptance(task);
    check(input.resultReviewed === undefined || input.resultReviewed === true,
      'RESULT_REVIEW_REQUIRED', 'Acceptance must explicitly review the result.');
    // Invoking accept is the controller's explicit review of the recorded result.
    task.resultReviewed = true;
    task.accepted = true;
    task.phase = 'complete';
    this.store.saveTask(task);
    this.store.history('accept', input, project, task);
    if (archiveOnAcceptance) return this.archive(project, task, input);
    return this.response(project, task, false);
  }

  archive(project, task, input) {
    check(task.phase === 'complete' && task.accepted && task.resultReviewed,
      'ACCEPTANCE_REQUIRED', 'Archive requires an accepted and reviewed complete run.');
    const pendingArchive = task.pendingAction?.type === 'archive' ? task.pendingAction : null;
    if (!pendingArchive) this.readyForAcceptance(task);
    if (task.archived || task.needsReconciliation) return this.response(project, task, false);
    this.authorize(project, 'archive', task);

    let archiveWorktreePath;
    if (task.worktree) {
      this.requireWorkerProject(project, task);
      const thread = input.workerThread;
      check(thread?.id === task.workerRef?.threadId && thread?.hostId === task.workerRef?.hostId
        && thread?.status?.type === 'idle'
        && (thread.projectId == null || thread.projectId === project.hostProjectId),
      'WORKTREE_THREAD_UNVERIFIED', 'Read the bound, idle Desktop worker thread before archiving its worktree.');
      archiveWorktreePath = preservedWorktreePath(project.projectRoot, task.worktree, thread.cwd);
      check(archiveWorktreePath
        && (!pendingArchive?.archiveWorktreePath || pendingArchive.archiveWorktreePath === archiveWorktreePath),
      'WORKTREE_NOT_PRESERVED', 'The Desktop worker must be in the clean linked worktree for the assigned branch.');
    }
    if (!pendingArchive) {
      this.planAction(project, task, 'archive', { archiveWorktreePath });
      this.store.saveTask(task);
      this.store.history('archive', input, project, task);
    }
    return this.response(project, task, true, archiveWorktreePath);
  }

  resultPublication(input, caller) {
    const projectId = text(input.projectId, 'projectId');
    const taskId = text(input.taskId, 'taskId');
    const runId = text(input.runId, 'runId');
    const worker = workerRef(caller, 'caller');
    return this.store.transaction(() => {
      const project = this.store.project(projectId);
      check(project, 'PROJECT_NOT_FOUND', 'The result project is not registered.');
      check(canonicalRoot(input.projectRoot) === project.projectRoot,
        'PROJECT_SCOPE_MISMATCH', 'The result must use the registered project root.');
      const task = this.getTask(projectId, taskId);
      this.currentRun(task, runId);
      const controllerRef = controllerForRun(project, task);
      check(worker.hostId === controllerRef.hostId && input.hostId === worker.hostId,
        'HOST_MISMATCH', 'The worker and run controller must belong to the current host.');
      check(!sameWorker(worker, controllerRef), 'WORKER_REQUIRED', 'The controller cannot publish as its own worker.');
      if (input.controllerRef !== undefined) {
        check(sameWorker(workerRef(input.controllerRef, 'controllerRef'), controllerRef),
          'CONTROLLER_REQUIRED', 'The result must return to the conversation that assigned the execution.');
      }
      const owner = this.requireController(project, controllerRef);
      const singleDelivery = runResultPushGranted(task);
      check(task.pushEnabled === true && (singleDelivery || pushGranted(owner.authorization)),
        'AUTHORIZATION_REQUIRED', 'The run controller must have authorized push events.');
      if (task.workerRef) {
        check(sameWorker(worker, task.workerRef), 'WORKER_MISMATCH', 'The worker identity does not match this execution.');
        this.requireWorkerProject(project, task);
      } else {
        // Desktop can start the worker before the controller records the creation response.
        check(task.pendingAction?.type === 'create' && task.pendingAction.hostProjectId === project.hostProjectId
          && !this.store.workerProject(worker.threadId, worker.hostId) && !this.controllerView(project, worker),
        'WORKER_MISMATCH', 'The worker creation must be pending on the registered project.');
      }
      return { controllerRef, singleDelivery };
    });
  }

  resultDestination(input, caller) {
    return this.resultPublication(input, caller).controllerRef;
  }

  close() {
    this.store.close();
  }
}
