import { Worker } from 'bullmq';
import IORedis from "ioredis";
import { dir } from 'node:console';
import SimpleGit from "simple-git";

import fs, { statSync } from "node:fs";
import path from 'node:path';

import { pushQueue } from './lib/queue.js';
import { repoData } from './lib/repoData.js';

const repositoriesDirectory = path.resolve(process.env.REPOS_DIR || '../repos/');
const pushDelay = process.env.PUSH_DELAY || 30000;

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
  maxRetriesPerRequest: null,
});

const workerCommit = new Worker(
  'git-commit',
  async (job) => {
    console.log('git:commit processing job', job.id);

    try {
      // get data
      const data = repoData(job.data, repositoriesDirectory);

      // file path protections
      if (data.safeFileName.includes('..') || data.safeFileName.includes('/') || path.isAbsolute(data.safeFileName)) {
        throw new Error(`Invalid path ${data.safeFileName}`);
      }

      const git = SimpleGit(data.gitRepository);
      const isRepo = await git.checkIsRepo();

      if (!fs.existsSync(data.gitRepository) || !isRepo) {
        throw new Error(`Repository not found: ${data.gitRepository}`);
      }

      // git pull rebase to avoid problems
      await git.reset(['--hard']);
      await git.clean('f', ['-d']);
      await git.fetch();

      await git.pull('origin', 'master', {
        '--rebase': 'true',
      });

      // creates directory if not exists
      if (!fs.existsSync(data.absoluteDirectoryPath)) {
        fs.mkdirSync(data.absoluteDirectoryPath, { recursive: true});
      }
      
      const stat = fs.statSync(data.absoluteDirectoryPath);

      if (!stat.isDirectory()) {
        throw new Error(`${data.absoluteDirectoryPath} already exists and is not a directory.`);
      }

      // writes file, text or binary
      if (data.contentType === 'text') {
        fs.writeFileSync(data.absoluteFilePath, data.content, 'utf8');
      } else {
        fs.writeFileSync(data.absoluteFilePath, data.content);
      }

      // git add
      await git.add(data.gitFilePath);

      const status = await git.status();

      if (!status.files.length) {
        console.log('git:commit nothing to commit');
        return;
      }

      // git commit
      await git.commit(data.message, {
        '--author': `${data.author} <${data.authorEmail}>`,
      });

      console.log('git:commit job done');

      const bucket = Math.floor(Date.now() / pushDelay);

      // git push : send to queue
      await pushQueue.add(
        'push-content',
        {
          repository: data.repository,
          gitRepository: data.gitRepository
        },
        {
          delay: pushDelay,
          jobId: `push-${data.repository}-${bucket}`,
          removeOnComplete: true,
        }
      );
    } catch (error) {
      console.log(`git:commit job error : ${error.message}`);
    }
  },
  {
    connection,

    // IMPORTANT pour git
    concurrency: 1,
  }
);

workerCommit.on('completed', (job) => {
  console.log(`git:commit job ${job.id} completed`);
});

workerCommit.on('failed', (job, err) => {
  console.error(`git:commit job ${job?.id} failed`, err);
});

const workerPush = new Worker(
  'git-push',
  async (job) => {
    console.log('git:push processing job', job.id);

    // get data
    const {
      repository,
      gitRepository
    } = job.data;

    const git = SimpleGit(gitRepository);

    await git.fetch();

    // check if push is needed
    const status = await git.status();

    if (status.ahead > 0) {
      await git.push();
      console.log('git:push push done', job.id);
    } else {
      console.log('git:push push already done', job.id);
    }

    console.log('git:push job done', job.id);
  },
  {
    connection,
    concurrency: 1,
  }
);

workerPush.on('completed', (job) => {
  console.log(`git:push job ${job.id} completed`);
});

workerPush.on('failed', (job, err) => {
  console.error(`git:push job ${job?.id} failed`, err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing workers...');
  await workerCommit.close();
  await workerPush.close();
  await connection.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing workers...');
  await workerCommit.close();
  await workerPush.close();
  await connection.quit();
  process.exit(0);
});

console.log('Workers started. Listening for jobs...');