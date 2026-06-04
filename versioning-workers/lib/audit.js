import { DatabaseSync } from 'node:sqlite';

const sqliteDbPath = process.env.SQLITE_DB || './data/audits.sqlite';
const db = new DatabaseSync(sqliteDbPath);

export const AUDIT_STATES = {
  STARTED: 'started',
  COMMITTED: 'committed',
  DONE: 'done',
  ERROR: 'error',
  SKIPPED: 'skipped'
};

export function auditCreateTableOperations() {
  // note : created_at is UTC
  db.exec(`
    CREATE TABLE IF NOT EXISTS operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      created_at DATETIME NOT NULL DEFAULT (datetime('now','localtime')),

      repository TEXT NOT NULL,

      operation TEXT NOT NULL,
      status TEXT NOT NULL,

      entity TEXT,
      file TEXT,

      author TEXT,
      author_email TEXT,

      commit_sha TEXT,

      job_id TEXT,
      origin_job_id TEXT,

      error_message TEXT,

      metadata TEXT
    );`
  );
}

export function auditOperation(data, operation, status, jobId) {
  const stmt = db.prepare(`
    INSERT INTO operations (
      repository,
      operation,
      status,
      entity,
      file,
      author,
      author_email,
      commit_sha,
      job_id,
      origin_job_id,
      error_message,
      metadata
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    data?.repository || '',
    operation || '',
    status || '',
    data?.entity ?? null,
    data?.file ?? null,
    data?.author ?? null,
    data?.authorEmail ?? null,
    data?.commitSha ?? null,
    jobId ? jobId.toString() : null,
    data?.originJobId ?? null,
    data?.errorMessage ?? null,
    data?.metadata ?? null
  );
}