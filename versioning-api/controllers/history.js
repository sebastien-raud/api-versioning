import SimpleGit from "simple-git";
import path from 'node:path';
import fs from "node:fs";

const repositoriesDirectory = path.resolve(process.env.REPOS_DIR || '../repos/');

// SimpleGit configuration
const simpleGitOptions = {
  timeout: 10000,  // 10 secondes max
};

/**
 * GET /history/:repository/:entity/:name
 * 
 * Enqueue un job git-commit asynchrone
 * 
 * @param {string} repository - Le slug du repo (ex: "mon-repo")
 * @param {Object} body
 *   - entity: string (dossier, ex: "article")
 *   - entity_id: number (ID du contenu)
 *   - name: string (nom du fichier, ex: "mon-article.md")
 *   - content: string (contenu à écrire)
 *   - content_type: "text" | "binary"
 *   - author: string (nom d'auteur)
 *   - author_email: string (email valide)
 *   - message: string (optionnel, commit message)
 * 
 * @returns {202} { status: 'queued', jobId: 'uuid' }
 * @returns {422} Erreur de validation
 * @returns {500} Erreur serveur
 * 
 * @note Les retries automatiques sont appliqués (5 tentatives max)
 * @note Le job s'exécutera séquentiellement (concurrency: 1)
 */
export async function historyController(req, res) {
  const { repository, entity, name } = req.params;
  
  const limit = req.query.limit || 10;
  const from = req.query.from || 0;

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
}