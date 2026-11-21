import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const cli = fileURLToPath(new URL('../../src/cli/main.mjs', import.meta.url));
const workspace = realpathSync.native(fileURLToPath(new URL('../../', import.meta.url)));
const execFileAsync = promisify(execFile);
const env = Object.fromEntries(Object.entries(process.env)
  .filter(([key]) => !/^(GIT_|CODEX_(THREAD|HOST)_ID$)/i.test(key)));

function gitCommand(cwd, args) {
  const result = spawnSync('git', args, { cwd, env, encoding: 'utf8', windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
}

function gitRepository(root) {
  mkdirSync(root, { recursive: true });
  gitCommand(root, ['init', '--quiet', '--template=']);
  return root;
}

function fixture(t) {
  const local = join(workspace, '.local');
  mkdirSync(local, { recursive: true });
  assert.equal(realpathSync.native(local), local);
  const root = mkdtempSync(join(local, 'candidate-test-'));
  t.after(() => {
    const target = realpathSync.native(root);
    assert.equal(dirname(target), local);
    assert.equal(target, root);
    rmSync(target, { recursive: true, force: true, maxRetries: 3 });
  });

  const stateDir = join(root, 'state');
  const projectRoot = gitRepository(join(root, 'project'));
  async function runTogether(calls) {
    const processes = calls.map(({ command, threadId, hostId = 'local' }) => execFileAsync(process.execPath,
      [cli, command, '--state-dir', stateDir, '--input', '-'], {
        env: { ...env, ...(hostId && { CODEX_HOST_ID: hostId }), ...(threadId && { CODEX_THREAD_ID: threadId }) },
        windowsHide: true, timeout: 20_000,
      }));

    // Start every CLI before supplying input so the claim calls can race on SQLite.
    for (const [index, execution] of processes.entries()) {
      execution.child.stdin.on('error', () => {}); // The process result reports early exit.
      execution.child.stdin.end(JSON.stringify(calls[index].input));
    }
    const results = await Promise.allSettled(processes);
    return results.map(result => {
      if (result.status === 'rejected') {
        throw new Error(`${result.reason.message}\n${result.reason.stdout ?? ''}`, { cause: result.reason });
      }
      const response = JSON.parse(result.value.stdout);
      assert.equal(response.ok, true, result.value.stdout);
      return response;
    });
  }

  async function run(command, input, threadId, hostId) {
    const [response] = await runTogether([{ command, input, threadId, hostId }]);
    return response;
  }
  return { root, projectRoot, run, runTogether };
}

function catalogEntry(path, projectId = 'desktop-project', isGitRepository = true) {
  return { projectId, projectKind: 'local', path, hostId: 'local', isGitRepository };
}

function thread(id, cwd, { projectId = 'desktop-project', status = { type: 'idle' } } = {}) {
  return { id, kind: 'codex', projectId, hostId: 'local', cwd, status };
}

function page(threads, { cursor = null, nextCursor = null } = {}) {
  return { cursor, result: { threads, nextCursor } };
}

function soleThread(projectRoot, threadId, projectId = 'desktop-project') {
  return {
    projectRoot,
    projects: { projects: [catalogEntry(projectRoot, projectId)] },
    threadPages: [page([thread(threadId, projectRoot, { projectId })])],
  };
}

function assertUnclaimed(result, decision, reason) {
  assert.equal(result.decision, decision);
  assert.equal(result.claimed, false);
  if (reason !== undefined) assert.equal(result.reason, reason);
}

function registerLegacyController(run, projectRoot, hostProjectId = 'desktop-project') {
  return run('project', {
    projectId: 'legacy-project', projectRoot, hostProjectId,
    controller: { threadId: 'old-controller', hostId: 'local' },
    authorization: {
      createWorkers: true, sendFollowups: false, archiveCompleted: false, restoreWorkers: false,
      source: 'Synthetic CLI test fixture',
    },
  });
}

async function assertCliError(run, command, input, code, threadId, hostId) {
  await assert.rejects(run(command, input, threadId, hostId), error => {
    assert.equal(error.cause?.code, 2);
    const response = JSON.parse(error.cause.stdout);
    assert.equal(response.ok, false);
    assert.equal(response.error.code, code, error.cause.stdout);
    assert.equal(response.hostCall, undefined);
    return true;
  });
}

test('candidate does not include tasks during unregistered discovery', async t => {
  const { projectRoot, run } = fixture(t);
  const discovered = await run('candidate', {
    ...soleThread(projectRoot, 'current'), includeStatus: true,
  }, 'current');
  assertUnclaimed(discovered, 'candidate');
  assert.equal(Object.hasOwn(discovered, 'tasks'), false);

  const lookup = await run('candidate', { projectRoot, includeStatus: true }, 'current');
  assertUnclaimed(lookup, 'undetermined', 'DISCOVERY_REQUIRED');
  assert.equal(lookup.project, null);
  assert.equal(Object.hasOwn(lookup, 'tasks'), false);
});

test('candidate rejects a non-boolean includeStatus before looking up the caller', async t => {
  const { projectRoot, run } = fixture(t);
  for (const includeStatus of ['true', 1, null]) {
    await assert.rejects(run('candidate', { projectRoot, includeStatus }), error => {
      assert.equal(error.cause?.code, 2);
      const response = JSON.parse(error.cause.stdout);
      assert.equal(response.ok, false);
      assert.equal(response.error.code, 'INPUT');
      return true;
    });
  }
});

test('candidate requires the caller identity from the subprocess environment', async t => {
  const { projectRoot, run } = fixture(t);
  const input = { ...soleThread(projectRoot, 'current'), claim: true };
  assertUnclaimed(await run('candidate', input), 'undetermined', 'MISSING_CURRENT_THREAD');
});

test('candidate requires the full cursor chain and counts older notLoaded threads', async t => {
  const { projectRoot, run } = fixture(t);
  const first = page([thread('current', projectRoot)], { nextCursor: 'older' });
  const input = { ...soleThread(projectRoot, 'current'), claim: true, threadPages: [first] };
  assertUnclaimed(await run('candidate', input, 'current'), 'undetermined', 'INCOMPLETE_HISTORY');

  const older = page([thread('older-thread', projectRoot, { status: { type: 'notLoaded' } })], { cursor: 'older' });
  const complete = await run('candidate', { ...input, threadPages: [first, older] }, 'current');
  assertUnclaimed(complete, 'not_candidate', 'MULTIPLE_THREADS');
});

test('candidate honors a pre-existing controller absent from stale discovery', async t => {
  const { projectRoot, run } = fixture(t);
  const { project } = await registerLegacyController(run, projectRoot);

  const stale = { ...soleThread(projectRoot, 'new-thread'), claim: true, includeStatus: true };
  const outsider = await run('candidate', stale, 'new-thread');
  assertUnclaimed(outsider, 'not_candidate', 'CONTROLLER_EXISTS');
  assert.equal(Object.hasOwn(outsider, 'tasks'), false);

  const lookup = await run('candidate', { projectRoot }, 'old-controller');
  assertUnclaimed(lookup, 'controller');
  assert.deepEqual(lookup.project, project);
});

test('candidate counts each nonarchived thread once and holds on an unresolved project peer', async t => {
  const { root, projectRoot, run } = fixture(t);
  const input = {
    projectRoot,
    projects: { projects: [catalogEntry(root, 'desktop-project', false)] },
    threadPages: [
      page([thread('current', projectRoot)], { nextCursor: 'older' }),
      page([thread('current', projectRoot), { ...thread('archived', projectRoot), archived: true }], { cursor: 'older' }),
    ],
  };
  assertUnclaimed(await run('candidate', input, 'current'), 'candidate');
  input.threadPages[1].result.threads.push(thread('unknown-scope', null));
  assertUnclaimed(await run('candidate', { ...input, claim: true }, 'current'), 'undetermined', 'AMBIGUOUS_THREAD_SCOPE');
});

test('candidate recognizes a bound worker and prevents a claim in an unbound repository', async t => {
  const { root, projectRoot, run } = fixture(t);
  const { project } = await registerLegacyController(run, projectRoot);
  const scope = { projectId: project.projectId, taskId: 'fixture-task' };
  const { action } = await run('dispatch', {
    ...scope, requestId: 'fixture-request', prompt: 'Synthetic worker fixture',
    profile: { model: 'fixture-model', thinking: 'low' },
  });
  await run('record', {
    ...scope, actionId: action.id, hostResult: { threadId: 'worker', hostId: 'local' },
    evidenceRef: 'fixture:worker-receipt',
  });

  const lookup = await run('candidate', { projectRoot, includeStatus: true }, 'worker');
  assertUnclaimed(lookup, 'worker');
  assert.deepEqual(lookup.project, project);
  assert.equal(Object.hasOwn(lookup, 'tasks'), false);

  const unbound = gitRepository(join(root, 'unbound'));
  const stale = { ...soleThread(unbound, 'worker', 'unbound-desktop'), claim: true };
  assertUnclaimed(await run('candidate', stale, 'worker'), 'worker');
});

test('candidate includes status only when requested by the registered controller', async t => {
  const { projectRoot, run } = fixture(t);
  const { project } = await registerLegacyController(run, projectRoot);
  const { projectId } = project;
  const taskId = 'fixture-task';
  await run('dispatch', {
    projectId, taskId, requestId: 'fixture-request', prompt: 'Synthetic task fixture',
    profile: { model: 'fixture-model', thinking: 'low' },
  });

  const baseline = await run('candidate', { projectRoot }, 'old-controller');
  assertUnclaimed(baseline, 'controller', 'REGISTERED_CONTROLLER');
  assert.equal(Object.hasOwn(baseline, 'tasks'), false);
  assert.deepEqual(await run('candidate', { projectRoot, includeStatus: false }, 'old-controller'), baseline);

  const status = await run('status', { projectId });
  assert.deepEqual(status.tasks.map(task => task.taskId), [taskId]);
  const combined = await run('candidate', { projectRoot, includeStatus: true }, 'old-controller');
  assert.deepEqual(combined, { ...baseline, project: status.project, tasks: status.tasks });
});

test('candidate isolates sibling Git repositories sharing a Desktop parent', async t => {
  const { root, projectRoot, runTogether } = fixture(t);
  const sibling = gitRepository(join(root, 'sibling'));
  const projects = { projects: [catalogEntry(root, 'desktop-project', false)] };
  const threadPages = [page([thread('parent', root), thread('first', projectRoot), thread('second', sibling)])];

  const results = await runTogether([['first', projectRoot], ['second', sibling]].map(([threadId, checkout]) => ({
    command: 'candidate', threadId, input: { projectRoot: checkout, projects, threadPages, claim: true },
  })));
  for (const result of results) {
    assert.equal(result.claimed, true);
    assert.equal(result.project.hostProjectId, 'desktop-project');
  }
  assert.notEqual(results[0].project.projectId, results[1].project.projectId);
});

test('candidate prefers the observed Desktop group and holds ambiguous or contradictory claims', async t => {
  const { root, projectRoot, run } = fixture(t);
  const sibling = gitRepository(join(root, 'sibling'));
  const input = {
    ...soleThread(projectRoot, 'current', 'desktop-parent'),
    projects: { projects: [
      catalogEntry(projectRoot), catalogEntry(root, 'desktop-parent', false), catalogEntry(sibling, 'sibling'),
      { ...catalogEntry(projectRoot, 'remote-repository'), hostId: 'remote-host', projectKind: 'remote' },
    ] },
  };
  const ambiguousClaims = [
    [thread('current', projectRoot, { projectId: 'removed-project' })],
    [thread('current', projectRoot, { projectId: 'remote-repository' })],
    [thread('current', projectRoot, { projectId: 'sibling' })],
    [thread('current', projectRoot, { projectId: null })],
    [thread('current', projectRoot), thread('current', projectRoot, { projectId: 'desktop-parent' })],
  ];
  for (const threads of ambiguousClaims) {
    assertUnclaimed(await run('candidate', { ...input, claim: true, threadPages: [page(threads)] }, 'current'),
      'undetermined', 'AMBIGUOUS_PROJECT');
  }
  assertUnclaimed(await run('candidate', {
    ...input, claim: true, projects: { projects: [catalogEntry(root, 'desktop-parent', false)] },
    threadPages: [page([thread('current', projectRoot, { projectId: null })])],
  }, 'current'), 'undetermined', 'AMBIGUOUS_PROJECT');
  assertUnclaimed(await run('candidate', {
    ...input, claim: true, threadPages: [page([thread('current', sibling)])],
  }, 'current'), 'undetermined', 'AMBIGUOUS_THREAD_SCOPE');
  const missingGroup = { ...soleThread(projectRoot, 'current'),
    threadPages: [page([thread('current', projectRoot, { projectId: null })])] };
  assert.equal((await run('candidate', missingGroup, 'current')).hostProjectId, 'desktop-project');

  const claimed = await run('candidate', { ...input, claim: true }, 'current');
  assert.equal(claimed.claimed, true);
  assert.equal(claimed.project.hostProjectId, 'desktop-parent');
});

test('candidate claims a same-host remote group only when its catalog path can be verified', async t => {
  const { root, projectRoot, run } = fixture(t);
  const hostId = 'remote-control:env_fixture';
  const projectId = 'remote-repository';
  const threadId = 'remote-controller';
  const remoteProject = { ...catalogEntry(projectRoot, projectId), projectKind: 'remote', hostId };
  const input = {
    projectRoot, claim: true,
    threadPages: [page([{ ...thread(threadId, projectRoot, { projectId }), hostId }])],
  };
  const missing = { ...remoteProject, path: join(root, 'unavailable') };
  assertUnclaimed(await run('candidate', {
    ...input, projects: { projects: [missing] },
  }, threadId, hostId), 'undetermined', 'AMBIGUOUS_PROJECT');

  const claimed = await run('candidate', {
    ...input, projects: { projects: [remoteProject] },
  }, threadId, hostId);
  assert.equal(claimed.claimed, true);
  assert.equal(claimed.project.hostProjectId, projectId);
  assert.deepEqual(claimed.project.controller, { threadId, hostId });
});

test('candidate uses the same repository and binding from a real linked worktree', async t => {
  const { root, projectRoot, run } = fixture(t);
  const hooks = join(root, 'empty-hooks');
  mkdirSync(hooks);
  gitCommand(projectRoot, ['-c', 'user.name=Candidate Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${hooks}`, 'commit', '--quiet', '--allow-empty', '-m', 'Initialize fixture']);
  const worktree = join(root, 'linked');
  gitCommand(projectRoot, ['worktree', 'add', '--quiet', '--detach', worktree, 'HEAD']);
  const worktreeGroups = { projects: [catalogEntry(projectRoot), catalogEntry(worktree, 'linked-group')] };
  for (const group of ['linked-group', 'desktop-project']) {
    const discovered = await run('candidate', {
      ...soleThread(worktree, 'current', group), projects: worktreeGroups,
    }, 'current');
    assert.equal(discovered.hostProjectId, group);
  }
  assertUnclaimed(await run('candidate', {
    ...soleThread(projectRoot, 'current', 'linked-group'), projects: worktreeGroups,
  }, 'current'), 'undetermined', 'AMBIGUOUS_PROJECT');
  const input = {
    ...soleThread(projectRoot, 'current'),
    threadPages: [page([thread('current', projectRoot), thread('linked', worktree, { projectId: null })])],
  };
  assertUnclaimed(await run('candidate', input, 'current'), 'not_candidate', 'MULTIPLE_THREADS');
  const claim = await run('candidate', { ...soleThread(projectRoot, 'current'), claim: true }, 'current');
  assert.equal(claim.claimed, true);
  const fromWorktree = await run('candidate', { projectRoot: worktree }, 'linked');
  assertUnclaimed(fromWorktree, 'not_candidate', 'CONTROLLER_EXISTS');
  assert.deepEqual(fromWorktree.project, claim.project);
});

test('sync-project repairs a parent binding before planning a create in the verified child group', async t => {
  const { root, projectRoot, run } = fixture(t);
  const { project: legacy } = await registerLegacyController(run, projectRoot, 'desktop-parent');
  const { projectId, controller } = legacy;
  const authorization = { ...legacy.authorization, sendFollowups: true, scope: 'project' };
  const { project } = await run('project', { ...legacy, authorization }, controller.threadId);
  const request = {
    projectId, taskId: 'existing-task', requestId: 'old-request', prompt: 'Synthetic worker fixture',
    profile: { model: 'fixture-model', thinking: 'low' },
  };
  const { action, hostCall } = await run('dispatch', request, controller.threadId);
  assert.equal(hostCall.arguments.target.projectId, 'desktop-parent');

  const proof = {
    projectId,
    projects: { projects: [catalogEntry(root, 'desktop-parent', false), catalogEntry(projectRoot)] },
    threadPages: [
      page([thread('other-thread', root, { projectId: 'desktop-parent' })], { nextCursor: 'second' }),
      page([thread(controller.threadId, projectRoot)], { cursor: 'second', nextCursor: 'unneeded' }),
    ],
  };
  await assertCliError(run, 'sync-project', proof, 'PENDING_ACTION', controller.threadId);
  assert.deepEqual((await run('status', { projectId })).project, project);
  const { task } = await run('record', {
    projectId, taskId: request.taskId, actionId: action.id,
    hostResult: { threadId: 'old-worker', hostId: 'local' }, evidenceRef: 'fixture:old-worker',
  }, controller.threadId);

  // Desktop can supply a thread ID without exporting CODEX_HOST_ID in the shell.
  const synced = await run('sync-project', proof, controller.threadId, null);
  assert.equal(synced.previousHostProjectId, 'desktop-parent');
  assert.equal(synced.project.hostProjectId, 'desktop-project');
  assert.deepEqual({ ...synced.project, updatedAt: project.updatedAt, hostProjectId: project.hostProjectId }, project);
  assert.equal(synced.hostCall, undefined);
  const replay = await run('sync-project', proof, controller.threadId);
  assert.deepEqual(replay.project, synced.project);
  assert.deepEqual((await run('candidate', { projectRoot, includeStatus: true }, controller.threadId)).tasks, [task]);
  await assertCliError(run, 'dispatch', { ...request, requestId: 'reuse-request', reuseOnly: true },
    'WORKER_PROJECT_MISMATCH', controller.threadId);

  const next = await run('dispatch', {
    ...request, taskId: 'new-task', requestId: 'new-request',
  }, controller.threadId);
  assert.equal(next.action.type, 'create');
  assert.equal(next.action.hostProjectId, 'desktop-project');
  assert.deepEqual(next.hostCall.arguments.target, {
    type: 'project', projectId: 'desktop-project', environment: { type: 'local' },
  });
});

test('sync-project rejects missing, stale, or cross-scope Desktop evidence without altering the registration', async t => {
  const { root, projectRoot, run } = fixture(t);
  const sibling = gitRepository(join(root, 'sibling'));
  const { project } = await registerLegacyController(run, projectRoot, 'desktop-parent');
  const { projectId, controller: { threadId } } = project;
  const { projects, threadPages } = soleThread(projectRoot, threadId);
  const input = { projectId, projects, threadPages };
  const controller = thread(threadId, projectRoot);
  const cases = [
    [{ ...input, projectId: 'unregistered' }, 'PROJECT_NOT_FOUND'],
    [{ ...input, threadPages: undefined }, 'INCOMPLETE_HISTORY'],
    [{ ...input, threadPages: [page([controller], { cursor: 'skipped' })] }, 'INCOMPLETE_HISTORY'],
    [{ ...input, threadPages: [page([], { nextCursor: 'expected' }), page([controller], { cursor: 'wrong' })] },
      'INCOMPLETE_HISTORY'],
    [{ ...input, threadPages: [page([thread('other', projectRoot)], { nextCursor: 'more' })] }, 'CALLER_NOT_FOUND'],
    [{ ...input, threadPages: [page([{ ...controller, archived: true }])] }, 'CALLER_NOT_FOUND'],
    [{ ...input, threadPages: [page([{ ...controller, hostId: 'remote-host' }])] }, 'HOST_MISMATCH'],
    [{ ...input, threadPages: [page([{ ...controller, projectId: null }])] }, 'AMBIGUOUS_PROJECT'],
    [{ ...input, projects: { projects: [catalogEntry(sibling, 'sibling')] } }, 'AMBIGUOUS_PROJECT'],
    [{ ...input, projects: { projects: [{ ...catalogEntry(projectRoot), projectKind: 'remote' }] } }, 'AMBIGUOUS_PROJECT'],
    [{ ...input, projects: { projects: [catalogEntry(sibling)] } }, 'AMBIGUOUS_PROJECT'],
    [{ ...input, projectRoot: sibling, threadPages: [page([{ ...controller, cwd: sibling }])] }, 'AMBIGUOUS_THREAD_SCOPE'],
    [{ ...input, projects: { projects: [...projects.projects, catalogEntry(sibling)] } }, 'AMBIGUOUS_PROJECT'],
  ];
  for (const [proof, expectedError] of cases) {
    await assertCliError(run, 'sync-project', proof, expectedError, threadId);
  }
  await assertCliError(run, 'sync-project', { ...input, caller: project.controller }, 'CONTROLLER_REQUIRED', 'other-thread');
  await assertCliError(run, 'sync-project', input, 'CONTROLLER_REQUIRED', threadId, 'remote-host');
  assert.deepEqual((await run('status', { projectId })).project, project);
});

test('CLI advertises and forwards structured dispatch and evaluation with the usual host-call mapping', async t => {
  const { projectRoot, run } = fixture(t);
  const { project: legacy } = await registerLegacyController(run, projectRoot);
  const { projectId, controller: { threadId } } = legacy;
  await run('project', { ...legacy, authorization: { ...legacy.authorization, sendFollowups: true } });
  const capabilities = await run('capabilities');
  for (const capability of ['project-binding', 'work-spec', 'evaluate']) {
    assert.ok(capabilities.supports.includes(capability));
  }

  const workSpec = {
    goal: 'Check the fixture',
    constraints: [],
    completionCriteria: [{ id: 'fixture-check', description: 'The fixture check passes' }],
    reasoningEscalations: ['medium'],
  };
  const taskId = 'structured-task';
  const dispatched = await run('dispatch', {
    projectId, taskId, requestId: 'structured-dispatch', prompt: 'Check the fixture',
    profile: { model: 'fixture-model', thinking: 'low' }, workSpec,
  }, threadId);
  assert.deepEqual(dispatched.action.workSpec, workSpec);
  assert.equal(dispatched.hostCall.tool, 'mcp__codex_app__create_thread');
  const runScope = { projectId, taskId, runId: dispatched.action.runId };
  await run('record', {
    ...runScope, actionId: dispatched.action.id, hostResult: { threadId: 'fixture-worker', hostId: 'local' },
    evidenceRef: 'fixture:worker',
  }, threadId);
  const resultEventId = 'synthetic-result';
  await run('observe', {
    ...runScope, eventId: resultEventId, status: 'completed', evidenceRef: 'fixture:result',
    result: { success: true, summary: 'The worker finished the fixture.' },
  }, threadId);
  const evaluated = await run('evaluate', {
    ...runScope, resultEventId, checks: [
      { id: 'fixture-check', status: 'unmet', evidenceRefs: ['fixture:independent-check'], note: 'The fixture failed.' },
    ],
  }, threadId);
  assert.equal(evaluated.decision.type, 'retry');
  assert.equal(evaluated.action.runId, evaluated.decision.nextRunId);
  assert.equal(evaluated.hostCall.tool, 'mcp__codex_app__send_message_to_thread');
  assert.equal(evaluated.hostCall.arguments.threadId, 'fixture-worker');
  assert.equal(evaluated.hostCall.arguments.thinking, 'medium');
});

test('candidate distinguishes a Git catalog parent from a nested repository', async t => {
  const { root, projectRoot, runTogether } = fixture(t);
  gitRepository(root);
  const projects = { projects: [catalogEntry(root, 'git-parent'), catalogEntry(projectRoot, 'git-child')] };
  const threadPages = [page([
    thread('parent', root, { projectId: 'git-parent' }),
    thread('child', projectRoot, { projectId: 'git-child' }),
  ])];

  const [parent, child] = await runTogether([
    { command: 'candidate', threadId: 'parent', input: { projectRoot: root, projects, threadPages, claim: true } },
    { command: 'candidate', threadId: 'child', input: { projectRoot, projects, threadPages, claim: true } },
  ]);
  for (const result of [parent, child]) {
    assert.equal(result.decision, 'controller');
    assert.equal(result.claimed, true);
  }
  assert.equal(parent.project.projectRoot, root);
  assert.equal(parent.project.hostProjectId, 'git-parent');
  assert.equal(child.project.projectRoot, projectRoot);
  assert.equal(child.project.hostProjectId, 'git-child');
});

test('candidate persists exactly one concurrent first claim without mutation permissions', async t => {
  const { projectRoot, run, runTogether } = fixture(t);
  const callers = ['first', 'second'];
  const claims = await runTogether(callers.map(threadId => ({
    command: 'candidate', threadId, input: { ...soleThread(projectRoot, threadId), claim: true, includeStatus: true },
  })));
  assert.equal(claims.filter(result => result.claimed === true).length, 1);
  const winnerIndex = claims.findIndex(result => result.claimed === true);
  const { project, decision } = claims[winnerIndex];
  assert.equal(decision, 'controller');
  assert.equal(Object.hasOwn(claims[winnerIndex], 'tasks'), false);
  assertUnclaimed(claims[1 - winnerIndex], 'not_candidate', 'CONTROLLER_EXISTS');
  assert.deepEqual(project.controller, { threadId: callers[winnerIndex], hostId: 'local' });
  assert.equal(project.projectRoot, projectRoot);
  assert.equal(project.hostProjectId, 'desktop-project');

  const lookup = await run('candidate', { projectRoot }, callers[winnerIndex]);
  assertUnclaimed(lookup, 'controller');
  assert.deepEqual(lookup.project, project);
  const persisted = await run('status', { projectId: project.projectId });
  assert.deepEqual(persisted.project, project);
  assert.deepEqual(persisted.tasks, []);
  const { createWorkers, sendFollowups, archiveCompleted, restoreWorkers } = persisted.project.authorization;
  assert.deepEqual({ createWorkers, sendFollowups, archiveCompleted, restoreWorkers }, {
    createWorkers: false, sendFollowups: false, archiveCompleted: false, restoreWorkers: false,
  });
});
