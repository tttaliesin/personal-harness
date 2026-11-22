import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep, toNamespacedPath } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';
import { requireCondition as check } from '../contracts/errors.mjs';
import { object, text } from './structured-work.mjs';

const SCHEMA = `
  CREATE TABLE push_events (
    sequence INTEGER PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE,
    run_id TEXT UNIQUE,
    event_json TEXT NOT NULL,
    acknowledged INTEGER NOT NULL DEFAULT 0 CHECK (acknowledged IN (0, 1))
  ) STRICT;
  CREATE INDEX unread_push_events ON push_events(sequence) WHERE acknowledged = 0;
`;
const IGNORE = '/.gitignore\n/inbox.sqlite\n/inbox.sqlite-journal\n/inbox.sqlite-wal\n/inbox.sqlite-shm\n';

function canonicalDirectory(path, field) {
  check(isAbsolute(text(path, field)), 'INVALID_INPUT', `${field} must be an absolute path.`);
  const canonical = realpathSync.native(path);
  check(statSync(canonical).isDirectory(), 'INVALID_INPUT', `${field} must be a directory.`);
  return canonical;
}

function inboxPath(root, projectId) {
  const hash = createHash('sha256').update(text(projectId, 'projectId')).digest('hex');
  return join(root, '.local', 'worker-orchestrator', 'push', hash, 'inbox.sqlite');
}

function prepareDirectory(path) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const ignorePath = join(directory, '.gitignore');
  try {
    writeFileSync(ignorePath, IGNORE, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST' || !lstatSync(ignorePath).isFile()) throw error;
  }
}

function withInbox(path, create, use) {
  if (create) prepareDirectory(path);
  const file = lstatSync(path, { throwIfNoEntry: false });
  if (!file && !create) return [];
  check(!file || file.isFile(), 'INVALID_PUSH_INBOX', 'The push inbox must be a regular file.');
  // The Windows SQLite VFS needs an extended path when the inbox or its journal exceeds MAX_PATH.
  const db = new DatabaseSync(toNamespacedPath(path));
  try {
    db.exec('PRAGMA busy_timeout = 10000');
    return use(db);
  } finally {
    db.close();
  }
}

function hasSchema(db) {
  return db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'push_events'").get();
}

function writeTransaction(db, write) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = write();
    db.exec('COMMIT');
    return value;
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

function exactObject(value, fields, name) {
  object(value, name);
  check(Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field)),
    'INVALID_INPUT', `${name} must contain exactly these fields: ${fields.join(', ')}.`);
}

function workerResult(result, runId) {
  exactObject(result, ['runId', 'status', 'summary', 'verification', 'pendingRequests'], 'result');
  check(result.runId === runId, 'INVALID_INPUT', 'result.runId must match runId.');
  const { status, summary, verification, pendingRequests } = result;
  check(status === 'completed' || status === 'failed', 'INVALID_INPUT', 'result.status must be completed or failed.');
  text(summary, 'result.summary');
  exactObject(verification, ['status', 'evidenceRefs'], 'result.verification');
  check(['passed', 'failed', 'not_run', 'unknown'].includes(verification.status), 'INVALID_INPUT',
    'Invalid result.verification.status.');
  check(Array.isArray(verification.evidenceRefs), 'INVALID_INPUT', 'result.verification.evidenceRefs must be an array.');
  const evidenceRefs = Array.from(verification.evidenceRefs, ref => text(ref, 'result.verification.evidenceRefs entry'));
  check(Array.isArray(pendingRequests), 'INVALID_INPUT', 'result.pendingRequests must be an array.');
  const requests = Array.from(pendingRequests, request => {
    exactObject(request, ['id', 'kind', 'summary'], 'result.pendingRequests entry');
    check(request.kind === 'approval' || request.kind === 'input', 'INVALID_INPUT', 'Invalid pending request kind.');
    return {
      id: text(request.id, 'pending request.id'),
      kind: request.kind,
      summary: text(request.summary, 'pending request.summary')
    };
  });
  return { runId, status, summary, verification: { status: verification.status, evidenceRefs }, pendingRequests: requests };
}

function publish(path, fields) {
  return withInbox(path, true, db => writeTransaction(db, () => {
    if (!hasSchema(db)) db.exec(SCHEMA);
    if (fields.kind === 'result') {
      const prior = db.prepare('SELECT event_json FROM push_events WHERE run_id = ?').get(fields.runId);
      if (prior) {
        const { eventId, createdAt, ...published } = JSON.parse(prior.event_json);
        check(isDeepStrictEqual(fields, published), 'PUSH_RESULT_CONFLICT', 'This run already has a different result event.');
        return { eventId, ...published, createdAt };
      }
    }
    const event = { eventId: randomUUID(), ...fields, createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO push_events (event_id, run_id, event_json) VALUES (?, ?, ?)')
      .run(event.eventId, fields.runId ?? null, JSON.stringify(event));
    return event;
  }));
}

export function publishResult(projectRoot, input) {
  const { projectId, taskId, runId, hostId, workerThreadId, workerTurnId, result } = object(input, 'result input');
  const path = inboxPath(canonicalDirectory(projectRoot, 'projectRoot'), projectId);
  return publish(path, {
    kind: 'result',
    projectId,
    taskId: text(taskId, 'taskId'),
    runId: text(runId, 'runId'),
    hostId: text(hostId, 'hostId'),
    workerThreadId: text(workerThreadId, 'workerThreadId'),
    workerTurnId: text(workerTurnId, 'workerTurnId'),
    result: workerResult(result, runId)
  });
}

export function publishApproval(projectRoot, input, payload) {
  const { projectId, hostId } = object(input, 'approval input');
  const { session_id, turn_id, cwd } = object(payload, 'approval payload');
  const root = canonicalDirectory(projectRoot, 'projectRoot');
  const scope = relative(root, canonicalDirectory(cwd, 'approval cwd'));
  check(scope !== '..' && !scope.startsWith(`..${sep}`) && !isAbsolute(scope),
    'INVALID_INPUT', 'Approval cwd must be within the project.');
  return publish(inboxPath(root, projectId), {
    kind: 'approval',
    projectId,
    hostId: text(hostId, 'hostId'),
    workerThreadId: text(session_id, 'session_id'),
    workerTurnId: text(turn_id, 'turn_id')
  });
}

export function readPushEvents(projectRoot, projectId) {
  const path = inboxPath(canonicalDirectory(projectRoot, 'projectRoot'), projectId);
  return withInbox(path, false, db => {
    if (!hasSchema(db)) return [];
    return db.prepare('SELECT event_json FROM push_events WHERE acknowledged = 0 ORDER BY sequence')
      .all().map(row => JSON.parse(row.event_json));
  });
}

export function ackPushEvents(projectRoot, projectId, eventIds) {
  const path = inboxPath(canonicalDirectory(projectRoot, 'projectRoot'), projectId);
  check(Array.isArray(eventIds), 'INVALID_INPUT', 'eventIds must be an array.');
  const ids = new Set(Array.from(eventIds, id => text(id, 'eventId')));
  if (!ids.size) return [];
  return withInbox(path, false, db => writeTransaction(db, () => {
    if (!hasSchema(db)) return [];
    const ack = db.prepare('UPDATE push_events SET acknowledged = 1 WHERE event_id = ? RETURNING event_id');
    const confirmed = [];
    for (const id of ids) {
      if (ack.get(id)) confirmed.push(id);
    }
    return confirmed;
  }));
}
