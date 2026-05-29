import path from 'node:path';

export function repoData(data, repositoriesDirectory) {
  const repoData = {
    repository: data.repository,
    entity: data.entity,
    name: data.name,
    content: data.content,
    contentType: data.content_type,
    author: data.author,
    authorEmail: data.author_email,
    message: data.message,

    safeFileName: undefined,
    safeEntity: undefined,

    gitRepository: undefined,
    gitFilePath: undefined,
    absoluteFilePath: undefined,
    absoluteDirectoryPath: undefined
  };
  
  repoData.safeFileName = path.normalize(repoData.name);
  repoData.safeEntity = path.normalize(repoData.entity);

  // git repository absolute path
  repoData.gitRepository = path.join(
    repositoriesDirectory,
    repoData.repository
  );

  // git file path in repo
  repoData.gitFilePath = path.join(
    repoData.safeEntity,
    repoData.safeFileName
  );

  // absolute file path.
  // directory structure is
  // - repo dir
  //   - repo
  //     - entity
  repoData.absoluteFilePath = path.join(
    repositoriesDirectory,
    repoData.repository,
    repoData.entity,
    repoData.safeFileName
  );

  // absolute directory path
  repoData.absoluteDirectoryPath = path.dirname(repoData.absoluteFilePath);

  return repoData;
}