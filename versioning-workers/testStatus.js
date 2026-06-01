import SimpleGit from "simple-git";
import path from 'node:path';

const repositoriesDirectory = path.resolve(process.env.REPOS_DIR || '../repos/');

const gitRepository = path.join(
  repositoriesDirectory,
  'test-repos'
);

const git = SimpleGit(gitRepository);

const status = await git.status();

console.log(status.files.length);