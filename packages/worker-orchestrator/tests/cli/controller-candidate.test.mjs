import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { assessControllerCandidate, resolveControllerScope } from '../../src/adapters/codex-desktop/controller-candidate.mjs';

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

    // Start every CLI before supplying input so the enrollment calls can race on SQLite.
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

function assertNoPermissions(project) {
  const { createWorkers, sendFollowups, archiveCompleted, restoreWorkers } = project.authorization;
  assert.deepEqual({ createWorkers, sendFollowups, archiveCompleted, restoreWorkers }, {
    createWorkers: false, sendFollowups: false, archiveCompleted: false, restoreWorkers: false,
  });
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

test('candidate enrolls a verified caller without claim and includes requested status', async t => {
  const { projectRoot, run } = fixture(t);
  const lookup = await run('candidate', { projectRoot, includeStatus: true }, 'current');
  assertUnclaimed(lookup, 'undetermined', 'DISCOVERY_REQUIRED');
  assert.equal(lookup.project, null);
  assert.equal(Object.hasOwn(lookup, 'tasks'), false);

  const discovered = await run('candidate', {
    ...soleThread(projectRoot, 'current'), includeStatus: true,
  }, 'current');
  assert.equal(discovered.decision, 'controller');
  assert.equal(discovered.reason, 'CONTROLLER_CLAIMED');
  assert.equal(discovered.claimed, true);
  assert.deepEqual(discovered.tasks, []);
  assert.deepEqual(discovered.project.controller, { threadId: 'current', hostId: 'local' });
  assertNoPermissions(discovered.project);
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

test('Desktop candidate assessment requires a contiguous history prefix through the caller', t => {
  const { projectRoot } = fixture(t);
  const scope = resolveControllerScope(projectRoot);
  const first = page([thread('peer', projectRoot)], { nextCursor: 'older' });
  const current = thread('current', projectRoot, { status: { type: 'notLoaded' } });
  const older = page([current], { cursor: 'older', nextCursor: 'unneeded' });
  const { projects } = soleThread(projectRoot, 'current');
  const cases = [
    [undefined, 'INCOMPLETE_HISTORY'],
    [[older], 'INCOMPLETE_HISTORY'],
    [[first, { ...older, cursor: 'skipped' }], 'INCOMPLETE_HISTORY'],
    [[first, page([current], { cursor: 'older', nextCursor: 'older' })], 'INCOMPLETE_HISTORY'],
    [[first], 'CALLER_NOT_FOUND'],
    [[page([{ ...current, archived: true }])], 'CALLER_NOT_FOUND'],
    [[page([{ ...current, hostId: 'remote-host' }])], 'CALLER_NOT_FOUND'],
    [[page([current, { ...current, hostId: 'remote-host' }])], 'CALLER_NOT_FOUND'],
    [[page([current, { ...current, archived: true }])], 'CALLER_NOT_FOUND'],
    [[page([current, { ...current, cwd: null }])], 'AMBIGUOUS_THREAD_SCOPE'],
    [[page([current, { ...current, projectId: 'other-group' }])], 'AMBIGUOUS_PROJECT'],
  ];
  for (const [threadPages, reason] of cases) {
    assert.deepEqual(assessControllerCandidate(scope, 'current', 'local', projects, threadPages), { reason });
  }

  assert.deepEqual(assessControllerCandidate(scope, 'current', null, projects, [first, older]), {
    reason: 'CANDIDATE', hostId: 'local', hostProjectId: 'desktop-project',
  });
});

test('candidate enrolls a peer without inheriting the legacy controller grant', async t => {
  const { projectRoot, run } = fixture(t);
  const { project } = await registerLegacyController(run, projectRoot);
  const peerId = 'new-thread';
  const request = {
    projectId: project.projectId, taskId: 'legacy-task', requestId: 'legacy-request', prompt: 'Synthetic worker fixture',
    profile: { model: 'fixture-model', thinking: 'low' },
  };
  await run('dispatch', request, 'old-controller');

  const proof = { ...soleThread(projectRoot, peerId), claim: true, includeStatus: true };
  const peer = await run('candidate', proof, peerId);
  assertUnclaimed(peer, 'controller', 'CONTROLLER_READY');
  assert.equal(peer.project.projectId, project.projectId);
  assert.deepEqual(peer.project.controller, { threadId: peerId, hostId: 'local' });
  assertNoPermissions(peer.project);
  assert.deepEqual(peer.tasks, []);
  await assertCliError(run, 'dispatch', {
    ...request, taskId: 'peer-task', requestId: 'peer-request',
  }, 'AUTHORIZATION_REQUIRED', peerId);

  const lookup = await run('candidate', { projectRoot, includeStatus: true }, 'old-controller');
  assertUnclaimed(lookup, 'controller', 'REGISTERED_CONTROLLER');
  assert.deepEqual(lookup.project.authorization, project.authorization);
  assert.deepEqual(lookup.project.controllerRef, project.controllerRef);
  assert.deepEqual(lookup.tasks.map(task => task.taskId), [request.taskId]);
  const peerLookup = await run('candidate', { projectRoot, includeStatus: true }, peerId);
  assertUnclaimed(peerLookup, 'controller', 'REGISTERED_CONTROLLER');
  assert.deepEqual(peerLookup.project, peer.project);
  assert.deepEqual(peerLookup.tasks, []);
});

test('candidate ignores peers with unresolved checkouts or different hosts', async t => {
  const { root, projectRoot, run } = fixture(t);
  const input = {
    projectRoot,
    projects: { projects: [catalogEntry(root, 'desktop-project', false)] },
    threadPages: [
      page([
        thread('peer', projectRoot),
        thread('unknown-scope', null),
        { ...thread('remote-peer', null), hostId: 'remote-host' },
        { ...thread('archived', projectRoot), archived: true },
        thread('current', projectRoot),
      ], { nextCursor: 'unneeded' }),
    ],
  };
  const current = await run('candidate', input, 'current');
  assert.equal(current.reason, 'CONTROLLER_CLAIMED');
  const peer = await run('candidate', input, 'peer');
  assertUnclaimed(peer, 'controller', 'CONTROLLER_READY');
  assert.equal(peer.project.projectId, current.project.projectId);
  assert.equal(peer.project.controller.threadId, 'peer');
  assertNoPermissions(peer.project);
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
  const { projects } = soleThread(projectRoot, 'current');
  const inferred = assessControllerCandidate(resolveControllerScope(projectRoot), 'current', 'local', projects,
    [page([thread('current', projectRoot, { projectId: null })])]);
  assert.deepEqual(inferred, { reason: 'CANDIDATE', hostId: 'local', hostProjectId: 'desktop-project' });

  const claimed = await run('candidate', { ...input, claim: true }, 'current');
  assert.equal(claimed.claimed, true);
  assert.equal(claimed.project.hostProjectId, 'desktop-parent');

  const peerId = 'peer';
  const otherGroupProof = { ...input, threadPages: [page([thread(peerId, projectRoot)])] };
  const otherGroup = await run('candidate', otherGroupProof, peerId);
  assertUnclaimed(otherGroup, 'undetermined', 'HOST_PROJECT_MISMATCH');
  assertUnclaimed(await run('candidate', { projectRoot }, peerId), 'undetermined', 'DISCOVERY_REQUIRED');
  const sameGroupProof = {
    ...input, threadPages: [page([thread(peerId, projectRoot, { projectId: 'desktop-parent' })])],
  };
  const sameGroup = await run('candidate', sameGroupProof, peerId);
  assertUnclaimed(sameGroup, 'controller', 'CONTROLLER_READY');
  assert.equal(sameGroup.project.projectId, claimed.project.projectId);
  assert.equal(sameGroup.project.hostProjectId, 'desktop-parent');
  const synced = await run('sync-project', { ...sameGroupProof, projectId: claimed.project.projectId }, peerId);
  assert.deepEqual(synced.project, sameGroup.project);
  await assertCliError(run, 'sync-project', { ...otherGroupProof, projectId: claimed.project.projectId },
    'HOST_PROJECT_MISMATCH', peerId);
  assert.equal((await run('candidate', { projectRoot }, 'current')).project.hostProjectId, 'desktop-parent');
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
    const { threadPages } = soleThread(worktree, 'linked', group);
    const discovered = assessControllerCandidate(resolveControllerScope(worktree), 'linked', 'local', worktreeGroups, threadPages);
    assert.equal(discovered.reason, 'CANDIDATE');
    assert.equal(discovered.hostProjectId, group);
  }
  assertUnclaimed(await run('candidate', {
    ...soleThread(projectRoot, 'current', 'linked-group'), projects: worktreeGroups,
  }, 'current'), 'undetermined', 'AMBIGUOUS_PROJECT');
  const input = {
    ...soleThread(projectRoot, 'current'),
    projects: worktreeGroups,
    threadPages: [page([thread('current', projectRoot), thread('linked', worktree)])],
  };
  const claim = await run('candidate', input, 'current');
  assert.equal(claim.claimed, true);
  const fromWorktree = await run('candidate', { ...input, projectRoot: worktree }, 'linked');
  assertUnclaimed(fromWorktree, 'controller', 'CONTROLLER_READY');
  assert.equal(fromWorktree.project.projectId, claim.project.projectId);
  assert.equal(fromWorktree.project.projectRoot, projectRoot);
  assert.equal(fromWorktree.project.hostProjectId, claim.project.hostProjectId);
  assert.deepEqual(fromWorktree.project.controller, { threadId: 'linked', hostId: 'local' });
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

test('concurrent candidates initialize one project and each gain a permissionless controller view', async t => {
  const { projectRoot, run, runTogether } = fixture(t);
  const callers = ['first', 'second'];
  const { projects } = soleThread(projectRoot, callers[0]);
  const threadPages = [page(callers.map(threadId => thread(threadId, projectRoot)), { nextCursor: 'unneeded' })];
  const claims = await runTogether(callers.map((threadId, index) => ({
    command: 'candidate', threadId, input: { projectRoot, projects, threadPages, claim: index === 0, includeStatus: true },
  })));
  assert.equal(claims.filter(result => result.claimed === true).length, 1);
  const projectId = claims[0].project.projectId;
  for (const [index, { project, decision, reason, claimed, tasks }] of claims.entries()) {
    const threadId = callers[index];
    assert.equal(decision, 'controller');
    assert.equal(reason, claimed ? 'CONTROLLER_CLAIMED' : 'CONTROLLER_READY');
    assert.deepEqual(tasks, []);
    assert.equal(project.projectId, projectId);
    assert.equal(project.projectRoot, projectRoot);
    assert.equal(project.hostProjectId, 'desktop-project');
    assert.deepEqual(project.controller, { threadId, hostId: 'local' });
    assertNoPermissions(project);

    const lookup = await run('candidate', { projectRoot }, threadId);
    assertUnclaimed(lookup, 'controller', 'REGISTERED_CONTROLLER');
    assert.deepEqual({ ...lookup.project, updatedAt: project.updatedAt }, project);
  }
});
