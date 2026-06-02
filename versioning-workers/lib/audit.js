import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('/data/audits.sqlite');

export function auditCreateTableOperations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS operations (
      id INTEGER PRIMARY KEY,

      created_at DATETIME NOT NULL,

      repository TEXT NOT NULL,

      operation TEXT NOT NULL,
      status TEXT NOT NULL,

      entity TEXT,
      file TEXT,

      author TEXT,
      author_email TEXT,

      commit_sha TEXT,

      job_id TEXT,

      error_message TEXT,

      metadata TEXT
    );`
  );
}

export function auditOperation(data, operation, status, jobId, errorMessage = null, metadata = null) {
  const stmt = db.prepare(`
    INSERT INTO operations (
      created_at,
      repository,
      operation,
      status,
      entity,
      file,
      author,
      author_email,
      commit_sha,
      job_id,
      error_message,
      metadata
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    new Date().toISOString(),
    data?.repository || '',
    operation,
    status,
    data?.entity,
    data?.file,
    data?.author,
    data?.authorEmail,
    data?.commitSha,
    data?.jobId,
    data?.errorMessage,
    data?.metadata
  );
}