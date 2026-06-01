import path from 'node:path';

export function repoData(data, repositoriesDirectory) {
  // Sanitize inputs immediately with path.basename (removes all path separators)
  const safeFileName = path.basename(data.name);
  const safeEntity = path.basename(data.entity);
  
  // Compute all paths using safe values
  const basePath = path.resolve(repositoriesDirectory, data.repository);
  const absoluteFilePath = path.resolve(basePath, safeEntity, safeFileName);
  
  // CRITICAL SECURITY CHECK: Ensure path doesn't escape base directory
  if (!absoluteFilePath.startsWith(basePath)) {
    throw new Error(`Path traversal detected: ${absoluteFilePath}`);
  }
  
  // Git paths using safe values
  const gitRepository = path.join(repositoriesDirectory, data.repository);
  const gitFilePath = path.join(safeEntity, safeFileName);
  const absoluteDirectoryPath = path.dirname(absoluteFilePath);
  
  // Return final data object
  return {
    repository: data.repository,
    entity: safeEntity,
    name: safeFileName,
    content: data.content,
    contentType: data.content_type,
    author: data.author,
    authorEmail: data.author_email,
    message: data.message,

    safeFileName,
    safeEntity,

    gitRepository,
    gitFilePath,
    absoluteFilePath,
    absoluteDirectoryPath
  };
}