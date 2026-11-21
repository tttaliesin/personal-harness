import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, rmdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, toNamespacedPath } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { ackPushEvents, publishApproval, publishResult, readPushEvents } from '../../src/core/push-journal.mjs';

const exec = promisify(execFile);
const journalUrl = new URL('../../src/core/push-journal.mjs', import.meta.url);
const local = fileURLToPath(new URL('../../.local/', import.meta.url));
const project = { projectId: 'project-1', hostId: 'desktop' };
const approval = { session_id: 'worker-1', turn_id: 'turn-1' };

function resultInput(runId = 'run-1') {
  return {
    ...project, taskId: 'task-1', runId, workerThreadId: 'worker-1', workerTurnId: 'turn-1',
    result: {
      runId, status: 'completed', summary: 'Delivered.',
      verification: { status: 'passed', evidenceRefs: ['test:passed'] },
      pendingRequests: [{ id: 'question-1', kind: 'input', summary: 'Reply required.' }]
    }
  };
}

function fixture(t, projectName = 'project') {
  mkdirSync(local, { recursive: true });
  const parent = realpathSync.native(local);
  const dir = mkdtempSync(join(parent, 'push-journal-test-'));
  t.after(() => {
    const target = realpathSync.native(dir);
    assert.equal(dirname(target), parent);
    assert.equal(target, dir);
    rmSync(target, { recursive: true, force: true, maxRetries: 3 });
  });
  const root = join(dir, projectName);
  const child = join(root, 'src');
  const outside = join(dir, 'project-other');
  mkdirSync(child, { recursive: true });
  mkdirSync(outside);
  const hash = createHash('sha256').update(project.projectId).digest('hex');
  const inbox = join(root, '.local', 'worker-orchestrator', 'push', hash, 'inbox.sqlite');
  return { root, child, outside, inbox };
}

function launch(operation, ...args) {
  const script = `
    import * as journal from ${JSON.stringify(journalUrl.href)};
    const [operation, ...args] = JSON.parse(process.argv[1]);
    console.log('ready');
    console.log(JSON.stringify(journal[operation](...args)));
  `;
  const execution = exec(process.execPath,
    ['--input-type=module', '--eval', script, JSON.stringify([operation, ...args])],
    { timeout: 15000, windowsHide: true });
  return {
    started: new Promise(resolve => execution.child.stdout.once('data', resolve)),
    result: execution.then(({ stdout }) => JSON.parse(stdout.slice(stdout.indexOf('\n') + 1)))
  };
}

test('results remain idempotent across acknowledgement and project IDs stay isolated', t => {
  const { root, inbox } = fixture(t);
  const input = resultInput();
  assert.deepEqual(readPushEvents(root, input.projectId), []);
  assert.deepEqual(ackPushEvents(root, input.projectId, ['unknown-event']), []);

  const event = publishResult(root, input);
  assert.deepEqual(event, { eventId: event.eventId, kind: 'result', ...input, createdAt: event.createdAt });
  assert.match(event.eventId, /^[0-9a-f-]{36}$/);
  assert.equal(new Date(event.createdAt).toISOString(), event.createdAt);
  assert.deepEqual(readPushEvents(root, input.projectId), [event]);
  assert.deepEqual(readPushEvents(root, 'project-2'), []);
  assert.deepEqual(ackPushEvents(root, 'project-2', [event.eventId]), []);
  assert.deepEqual(ackPushEvents(root, input.projectId, ['missing', event.eventId, event.eventId]), [event.eventId]);
  assert.deepEqual(ackPushEvents(root, input.projectId, [event.eventId]), [event.eventId]);

  const sameResult = { ...input.result, verification: { evidenceRefs: ['test:passed'], status: 'passed' } };
  assert.deepEqual(publishResult(root, { ...input, result: sameResult }), event);
  assert.deepEqual(readPushEvents(root, input.projectId), []);
  assert.throws(() => publishResult(root, { ...input, result: { ...input.result, summary: 'Different.' } }),
    { code: 'PUSH_RESULT_CONFLICT' });
  assert.throws(() => publishResult(root, { ...input, workerTurnId: 'different-turn' }),
    { code: 'PUSH_RESULT_CONFLICT' });

  const otherProject = publishResult(root, { ...input, projectId: 'project-2' });
  assert.notEqual(otherProject.eventId, event.eventId);
  assert.deepEqual(readPushEvents(root, 'project-2'), [otherProject]);
  assert.deepEqual(readFileSync(join(dirname(inbox), '.gitignore'), 'utf8').trim().split('\n'),
    ['/.gitignore', '/inbox.sqlite', '/inbox.sqlite-journal', '/inbox.sqlite-wal', '/inbox.sqlite-shm']);
});

test('result publishing requires the terminal worker-result schema', t => {
  const { root } = fixture(t);
  const input = resultInput();
  const { result } = input;
  const cases = [
    { status: 'waiting_approval' },
    { status: 'running' },
    { runId: 'different-run' },
    { summary: '' },
    { ignored: true },
    { verification: null },
    { verification: { status: 'incomplete', evidenceRefs: [] } },
    { verification: { status: 'passed', evidenceRefs: [''] } },
    { verification: { status: 'passed', evidenceRefs: new Array(1) } },
    { verification: { ...result.verification, extra: true } },
    { pendingRequests: null },
    { pendingRequests: new Array(1) },
    { pendingRequests: [{ id: 'request', kind: 'other', summary: 'Wait.' }] },
    { pendingRequests: [{ id: '', kind: 'approval', summary: 'Wait.' }] },
    { pendingRequests: [{ id: 'request', kind: 'approval' }] },
    { pendingRequests: [{ id: 'request', kind: 'approval', summary: 'Wait.', extra: true }] }
  ];
  for (const fields of cases) {
    assert.throws(() => publishResult(root, { ...input, result: { ...result, ...fields } }),
      { code: 'INVALID_INPUT' }, JSON.stringify(fields));
  }
  assert.deepEqual(readPushEvents(root, project.projectId), []);
  const failure = { ...result, status: 'failed', verification: { status: 'not_run', evidenceRefs: [] } };
  assert.deepEqual(publishResult(root, { ...input, result: failure }).result, failure);
});

test('approval events preserve only correlation metadata and require a cwd inside the project', t => {
  const { root, child, outside } = fixture(t);
  for (const cwd of [outside, 'src']) {
    assert.throws(() => publishApproval(root, project, { ...approval, cwd }), { code: 'INVALID_INPUT' });
  }
  assert.throws(() => publishApproval(root, project, { ...approval, cwd: join(root, 'missing') }), { code: 'ENOENT' });
  const events = [root, child].map(cwd => publishApproval(root, project,
    { ...approval, cwd, tool_input: { command: 'sensitive' }, decision: 'approved' }));
  for (const event of events) {
    assert.deepEqual(event, {
      eventId: event.eventId, kind: 'approval', ...project,
      workerThreadId: approval.session_id, workerTurnId: approval.turn_id, createdAt: event.createdAt
    });
  }
  assert.notEqual(events[0].eventId, events[1].eventId);
  assert.deepEqual(readPushEvents(root, project.projectId), events);
});

test('approval cwd cannot escape the project through a directory link', t => {
  const { root, outside } = fixture(t);
  const escape = join(root, 'escape');
  try {
    symlinkSync(outside, escape, 'junction');
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error;
    t.skip('The host does not permit creating directory links.');
    return;
  }
  assert.throws(() => publishApproval(root, project, { ...approval, cwd: escape }), { code: 'INVALID_INPUT' });
});

test('invalid inbox paths and SQLite data surface errors', t => {
  const { root, inbox } = fixture(t);
  mkdirSync(inbox, { recursive: true });
  assert.throws(() => readPushEvents(root, project.projectId), { code: 'INVALID_PUSH_INBOX' });
  rmdirSync(inbox);
  writeFileSync(inbox, 'not a SQLite database');
  assert.throws(() => readPushEvents(root, project.projectId), /not a database/);
  assert.throws(() => ackPushEvents(root, project.projectId, ['event']), /not a database/);
  assert.throws(() => publishResult(root, resultInput()), /not a database/);
});

test('Windows SQLite can write and acknowledge an inbox beyond MAX_PATH', { skip: process.platform !== 'win32' }, t => {
  const { root, inbox } = fixture(t, 'long-project-'.repeat(14));
  assert.ok(inbox.length > 260);
  const event = publishResult(root, resultInput());
  assert.deepEqual(readPushEvents(root, project.projectId), [event]);
  assert.deepEqual(ackPushEvents(root, project.projectId, [event.eventId]), [event.eventId]);
  assert.deepEqual(readPushEvents(root, project.projectId), []);
});

test('independent processes publish, deduplicate, and acknowledge without losing events', async t => {
  const { root, child, inbox } = fixture(t);
  const payload = { ...approval, cwd: child };
  const input = resultInput();
  const [first, second, repeatedA, repeatedB] = await Promise.all([
    launch('publishApproval', root, project, payload).result,
    launch('publishApproval', root, project, payload).result,
    launch('publishResult', root, input).result,
    launch('publishResult', root, input).result
  ]);
  assert.notEqual(first.eventId, second.eventId);
  assert.deepEqual(repeatedA, repeatedB);

  const idsToAck = [first.eventId, second.eventId, repeatedA.eventId];
  const lock = new DatabaseSync(toNamespacedPath(inbox));
  lock.exec('BEGIN IMMEDIATE');
  const contenders = [
    launch('ackPushEvents', root, project.projectId, idsToAck),
    launch('ackPushEvents', root, project.projectId, idsToAck),
    launch('publishApproval', root, project, payload),
    launch('publishResult', root, resultInput('run-2'))
  ];
  const race = Promise.all(contenders.map(child => child.result));
  try {
    await Promise.race([Promise.all(contenders.map(child => child.started)), race]);
  } finally {
    lock.close();
  }

  const [ackA, ackB, newApproval, newResult] = await race;
  assert.deepEqual(ackA, idsToAck);
  assert.deepEqual(ackB, idsToAck);
  const remaining = readPushEvents(root, project.projectId);
  assert.deepEqual(new Set(remaining), new Set([newApproval, newResult]));
  assert.deepEqual(await launch('publishResult', root, input).result, repeatedA);
  assert.deepEqual(readPushEvents(root, project.projectId), remaining);
});
