import SimpleGit from "simple-git";
import path from 'node:path';
import fs from "node:fs";

const repositoriesDirectory = path.resolve(process.env.REPOS_DIR || '../repos/');

// SimpleGit configuration
const simpleGitOptions = {
  timeout: 10000,  // 10 secondes max
};

/**
 * GET /diff/:repository/:entity/:name/:commit1/:commit2
 * 
 * Retourne le diff entre 2 commits d'un fichier
 * 
 * @param {string} repository - Le slug du repo (ex: "mon-repo")
 * @param {string} entity - L'entité (ex: "article")
 * @param {string} name - Le nom du fichier (ex: "mon-fichier.md")
 * @param {string} commit1 - Hash du premier commit
 * @param {string} commit2 - Hash du second commit
 * 
 * @returns {200} { all: [...liste des commits...], total: 25 }
 */
export async function diffController(req, res) {
  const { repository, entity, name, commit1, commit2 } = req.params;

  const data = {
    repository,
    entity,
    name,
    commit1: commit1.substring(0, 7),
    commit2: commit2.substring(0, 7),

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

  const diff = await git.diff([data.commit1, data.commit2, '--', data.gitFilePath]);

  res.send({diff});
}