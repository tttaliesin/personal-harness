import { mkdirSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { OrchestratorError, requireCondition } from '../contracts/errors.mjs';

const MIGRATION_V1 = `
  CREATE TABLE projects (
    project_id TEXT PRIMARY KEY,
    project_root TEXT NOT NULL UNIQUE,
    host_id TEXT NOT NULL,
    host_project_id TEXT NOT NULL,
    json TEXT NOT NULL,
    UNIQUE (host_id, host_project_id)
  );
  CREATE TABLE tasks (
    project_id TEXT NOT NULL REFERENCES projects(project_id),
    task_id TEXT NOT NULL,
    current_run_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    worker_host_id TEXT,
    worker_thread_id TEXT,
    json TEXT NOT NULL,
    PRIMARY KEY (project_id, task_id),
    UNIQUE (worker_host_id, worker_thread_id),
    CHECK ((worker_host_id IS NULL) = (worker_thread_id IS NULL))
  );
  CREATE TABLE requests (
    project_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    run_id TEXT NOT NULL UNIQUE,
    prompt TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    json TEXT NOT NULL,
    PRIMARY KEY (project_id, task_id, request_id),
    FOREIGN KEY (project_id, task_id) REFERENCES tasks(project_id, task_id)
  );
  CREATE TABLE actions (
    action_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('create', 'send', 'archive', 'unarchive')),
    outcome TEXT NOT NULL CHECK (outcome IN ('planned', 'succeeded', 'failed', 'unknown')),
    json TEXT NOT NULL,
    record_json TEXT,
    FOREIGN KEY (project_id, task_id) REFERENCES tasks(project_id, task_id)
  );
  CREATE UNIQUE INDEX one_pending_action_per_task
    ON actions(project_id, task_id) WHERE outcome != 'succeeded';
  CREATE TABLE events (
    project_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    json TEXT NOT NULL,
    PRIMARY KEY (project_id, task_id, event_id),
    FOREIGN KEY (project_id, task_id) REFERENCES tasks(project_id, task_id)
  );
  CREATE TABLE history (
    id INTEGER PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id),
    task_id TEXT,
    run_id TEXT,
    command TEXT NOT NULL,
    created_at TEXT NOT NULL,
    input_json TEXT NOT NULL,
    snapshot_json TEXT NOT NULL
  );
  CREATE INDEX history_by_task ON history(project_id, task_id, id);
`;

const MIGRATION_V2 = `
  CREATE TABLE actions_v2 (
    action_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('create', 'send', 'archive', 'unarchive')),
    outcome TEXT NOT NULL CHECK (outcome IN ('planned', 'succeeded', 'failed', 'unknown', 'rejected')),
    json TEXT NOT NULL,
    record_json TEXT,
    FOREIGN KEY (project_id, task_id) REFERENCES tasks(project_id, task_id)
  );
  INSERT INTO actions_v2(action_id, project_id, task_id, run_id, type, outcome, json, record_json)
    SELECT action_id, project_id, task_id, run_id, type, outcome, json, record_json FROM actions;
  DROP TABLE actions;
  ALTER TABLE actions_v2 RENAME TO actions;
  CREATE UNIQUE INDEX one_pending_action_per_task
    ON actions(project_id, task_id) WHERE outcome NOT IN ('succeeded', 'rejected');
`;

const MIGRATION_V3 = `
  CREATE TABLE projects_v3 (
    project_id TEXT PRIMARY KEY,
    project_root TEXT NOT NULL UNIQUE,
    host_id TEXT NOT NULL,
    host_project_id TEXT NOT NULL,
    json TEXT NOT NULL
  );
  INSERT INTO projects_v3 SELECT project_id, project_root, host_id, host_project_id, json FROM projects;
  DROP TABLE projects;
  ALTER TABLE projects_v3 RENAME TO projects;
  CREATE INDEX projects_by_host_project ON projects(host_id, host_project_id);
`;

const migrations = [MIGRATION_V1, MIGRATION_V2, MIGRATION_V3];
export const SCHEMA_VERSION = migrations.length;

/** All read/modify/write commands hold one cross-process SQLite write lock. */
export class SQLiteStore {
  constructor(stateDir) {
    requireCondition(typeof stateDir === 'string' && stateDir.trim() && isAbsolute(stateDir),
      'INVALID_STATE_DIR', 'stateDir must be an absolute directory path.');
    this.stateDir = resolve(stateDir);
    this.databasePath = join(this.stateDir, 'state.sqlite');
    this.closed = false;
    try {
      mkdirSync(this.stateDir, { recursive: true });
      this.db = new DatabaseSync(this.databasePath);
      // Rebuilding a referenced table requires foreign keys to be disabled outside the transaction.
      this.db.exec('PRAGMA busy_timeout = 10000; PRAGMA foreign_keys = OFF;');
      // Migrations themselves are serialized, including first-open races.
      this.transaction(() => {
        this.db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL
        )`);
        const versions = this.db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
        requireCondition(versions.length <= SCHEMA_VERSION && versions.every((row, index) => row.version === index + 1),
          'UNSUPPORTED_SCHEMA',
          'The state database has an unsupported schema version.');
        for (let version = versions.length + 1; version <= SCHEMA_VERSION; version += 1) {
          this.db.exec(migrations[version - 1]);
          this.db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)')
            .run(version, new Date().toISOString());
        }
        if (versions.length < SCHEMA_VERSION) {
          requireCondition(!this.db.prepare('PRAGMA foreign_key_check').get(),
            'STATE_CONFLICT', 'Migrating the state database left an invalid foreign key.');
        }
      });
      this.db.exec('PRAGMA foreign_keys = ON;');
    } catch (error) {
      this.db?.close();
      this.closed = true;
      throw this.publicError(error);
    }
  }

  publicError(error) {
    if (error instanceof OrchestratorError) return error;
    const message = String(error?.message ?? error);
    const code = /database is (locked|busy)/i.test(message) ? 'STATE_BUSY'
      : /UNIQUE constraint failed/i.test(message) ? 'STATE_CONFLICT' : 'STATE_ERROR';
    return new OrchestratorError(code, message, undefined, { cause: error });
  }

  transaction(fn) {
    requireCondition(!this.closed, 'STATE_CLOSED', 'The orchestrator is closed.');
    let began = false;
    try {
      this.db.exec('BEGIN IMMEDIATE');
      began = true;
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      if (began) this.db.exec('ROLLBACK');
      throw this.publicError(error);
    }
  }

  project(projectId) {
    const row = this.db.prepare('SELECT json FROM projects WHERE project_id = ?').get(projectId);
    return row ? JSON.parse(row.json) : null;
  }

  projectsForRoots(roots) {
    const placeholders = roots.map(() => '?').join(', ');
    return this.db.prepare(`SELECT json FROM projects WHERE project_root IN (${placeholders})`)
      .all(...roots).map(row => JSON.parse(row.json));
  }

  workerProject(threadId, hostId) {
    const row = hostId
      ? this.db.prepare('SELECT project_id FROM tasks WHERE worker_host_id = ? AND worker_thread_id = ?').get(hostId, threadId)
      : this.db.prepare('SELECT project_id FROM tasks WHERE worker_thread_id = ?').get(threadId);
    return row ? this.project(row.project_id) : null;
  }

  task(projectId, taskId) {
    const row = this.db.prepare('SELECT json FROM tasks WHERE project_id = ? AND task_id = ?')
      .get(projectId, taskId);
    return row ? JSON.parse(row.json) : null;
  }

  tasks(projectId) {
    return this.db.prepare('SELECT json FROM tasks WHERE project_id = ? ORDER BY task_id').all(projectId)
      .map(row => JSON.parse(row.json));
  }

  request(projectId, taskId, requestId) {
    return this.db.prepare('SELECT * FROM requests WHERE project_id = ? AND task_id = ? AND request_id = ?')
      .get(projectId, taskId, requestId);
  }

  action(projectId, taskId, actionId) {
    return this.db.prepare('SELECT * FROM actions WHERE project_id = ? AND task_id = ? AND action_id = ?')
      .get(projectId, taskId, actionId) ?? null;
  }

  saveTask(task, { insert = false } = {}) {
    if (insert) {
      this.db.prepare(`INSERT INTO tasks(project_id, task_id, current_run_id, version,
        worker_host_id, worker_thread_id, json) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(task.projectId, task.taskId, task.runId, task.version,
          task.workerRef?.hostId ?? null, task.workerRef?.threadId ?? null, JSON.stringify(task));
    } else {
      const previousVersion = task.version;
      task.version += 1;
      task.updatedAt = new Date().toISOString();
      const result = this.db.prepare(`UPDATE tasks SET current_run_id = ?, version = ?,
        worker_host_id = ?, worker_thread_id = ?, json = ?
        WHERE project_id = ? AND task_id = ? AND version = ?`)
        .run(task.runId, task.version, task.workerRef?.hostId ?? null,
          task.workerRef?.threadId ?? null, JSON.stringify(task),
          task.projectId, task.taskId, previousVersion);
      requireCondition(result.changes === 1, 'STATE_CONFLICT', 'Task changed concurrently.');
    }
    this.db.prepare(`UPDATE requests SET json = ?
      WHERE project_id = ? AND task_id = ? AND run_id = ?`)
      .run(JSON.stringify(task), task.projectId, task.taskId, task.runId);
  }

  history(command, input, project, task = null) {
    this.db.prepare(`INSERT INTO history(project_id, task_id, run_id, command,
      created_at, input_json, snapshot_json) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(project.projectId, task?.taskId ?? null, task?.runId ?? null, command,
        new Date().toISOString(), JSON.stringify(input), JSON.stringify(task ?? project));
  }

  close() {
    if (!this.closed) {
      this.db.close();
      this.closed = true;
    }
  }
}
