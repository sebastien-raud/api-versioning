import SimpleGit from "simple-git";
import path from 'node:path';
import fs from "node:fs";

import pino from 'pino';
import { log } from "node:console";

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

const repositoriesDirectory = path.resolve(process.env.REPOS_DIR || '../repos/');

// SimpleGit configuration
const simpleGitOptions = {
  timeout: 10000,  // 10 secondes max
};

/**
 * GET /history/:repository/:entity/:name
 * 
 * Retourne l'historique des commits d'un fichier
 * Query string :
 *   - from : index de début des retours (0 : dernier commit)
 *   - limit : nombre maximum de retours (max : 50)
 * 
 * @param {string} repository - Le slug du repo (ex: "mon-repo")
 * @param {string} entity - L'entité (ex: "article")
 * @param {string} name - Le nom du fichier (ex: "mon-fichier.md")
 * 
 * @returns {200} { all: [...liste des commits...], total: 25 }
 */
export async function historyController(req, res) {
  const { repository, entity, name } = req.params;
  
  const limit = Math.min((req.query?.limit ?? 10), 50);
  const from = parseInt(req.query?.from ?? 0, 10) || 0;

  const logData = {
    repository,
    entity,
    name,
    limit,
    from
  };
  
  logger.info(logData, 'api:history request received');

  try {
    const data = {
      repository,
      entity,
      name,

      safeFileName: path.basename(name),
      safeEntity: path.basename(entity),
    };

    const basePath = path.resolve(repositoriesDirectory, data.repository);

    data.absoluteFilePath = path.resolve(basePath, data.safeEntity, data.safeFileName);  
    data.gitRepository = path.join(repositoriesDirectory, data.repository);
    data.gitFilePath = path.join(data.safeEntity, data.safeFileName);

    // CRITICAL SECURITY CHECK: Ensure path doesn't escape base directory
    if (!data.absoluteFilePath.startsWith(basePath)) {
      throw new Error(`Path traversal detected: ${data.absoluteFilePath}`);
    }

    const git = SimpleGit(data.gitRepository, simpleGitOptions);
    const isRepo = await git.checkIsRepo();

    if (!fs.existsSync(data.gitRepository) || !isRepo) {
      throw new Error(`Repository not found: ${data.gitRepository}`);
    }

    const log = await git.log({ file: data.gitFilePath, '--max-count': limit, '--skip': from });
    
    log.all.forEach(l => {
      delete l.refs;
      delete l.body
    });

    res.send(log);
  } catch (error) {  
    logger.error({
        ...logData,
        error: "Internal server error",
        details: error.message,
      }, 'api:history request error');

    return res.status(500).send({
      error: 'Internal server error',
      details: error.message
    });
  }
}