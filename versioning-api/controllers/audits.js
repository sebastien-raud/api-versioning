import { DatabaseSync } from 'node:sqlite';
import pino from 'pino';

import { parseFilters, ALLOWED_FIELDS } from '../lib/parseFilters.js';

const sqliteDbPath = process.env.SQLITE_DB || './data/audits.sqlite';
const db = new DatabaseSync(sqliteDbPath);

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * GET /audit?filters=(job_id = 8 or origin_job_id = 8)&limit=...&from=0&sort=-id
 */
export async function auditController(req, res) {
  try {
    const sqlQuery = queryStringToSql(req.query);
    
    const stmt = db.prepare(sqlQuery.sql);
    const results = stmt.all(...sqlQuery.params);

    res.send({
      all: results,
      total: results.length
    });
  } catch (error) {
    res.status(500).send({
      error: "Can't read audit",
      details: error.message
    });
  }
}

function parseQueryString(query) {
  const limit = Math.min((query?.limit ?? 10), 50);
  const from = parseInt(query?.from ?? 0, 10) || 0;
  const filters = query?.filters ? parseFilters(query.filters) : null;
  const sort = query?.sort ? parseSort(query.sort) : null;

  return {
    filters,
    from,
    limit,
    sort
  }
}

function parseSort(sort) {
  const tokens = sort.split(',');
  const sorting = [];

  tokens.forEach(token => {
    if ('-' === token[0]) {
      const tokenName = token.substring(1, token.length);
      return ALLOWED_FIELDS[tokenName] ? sorting.push(`${tokenName} DESC`) : '';
    }
    return ALLOWED_FIELDS[token] ? sorting.push(`${token} ASC`) : '';
  });

  return sorting.join(', ');
}

function queryStringToSql(query) {
  const parsed = parseQueryString(query);
  let params = [];

  let sql = 'SELECT * FROM operations';

  if (parsed.filters) {
    sql += ' WHERE ' + parsed.filters.sql;
    params.push(...parsed.filters.params);
  }

  if (parsed.sort) {
    sql += ' ORDER BY ' + parsed.sort;
  }

  sql += ' LIMIT ? OFFSET ?';
  params.push(parsed.limit, parsed.from)

  params = params.map(p => p = p.toString());
  
  return {
    sql,
    params
  };
}