import { Worker } from 'bullmq';
import IORedis from "ioredis";
import { dir } from 'node:console';
import SimpleGit from "simple-git";

import fs, { statSync } from "node:fs";
import path from 'node:path';

import { pushQueue } from './lib/queue.js';

const repositoriesDirectory = path.resolve(process.env.REPOS_DIR || '../repos/');

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
  maxRetriesPerRequest: null,
});

const workerCommit = new Worker(
  'git-commit',
  async (job) => {
    console.log('git:commit processing job', job.id);

    // get data
    const {
      repository,
      entity,
      name,
      content,
      content_type,
      author,
      author_email,
      message,
    } = job.data;

    const safePath = path.normalize(name);

    // file path protections
    if (safePath.includes('..') || path.isAbsolute(safePath)) {
      throw new Error('Invalid path');
    }

    // starts git actions
    const gitRepository = path.join(
      repositoriesDirectory,
      repository
    );

    const git = SimpleGit(gitRepository);
    const isRepo = await git.checkIsRepo();

    if (!fs.existsSync(gitRepository) || !isRepo) {
      throw new Error(`Repository not found: ${repository}`);
    }

    // git pull rebase to avoid problems
    await git.reset(['--hard']);
    await git.clean('f', ['-d']);
    await git.fetch();

    await git.pull('origin', 'master', {
      '--rebase': 'true',
    });

    // write content
    const filepath = path.join(
      repositoriesDirectory,
      repository,
      name
    );

    // creates directory if not exists
    const dirname = path.dirname(filepath);
    if (!fs.existsSync(dirname)) {
      fs.mkdirSync(dirname, { recursive: true});
    }
    
    const stat = fs.statSync(dirname);

    if (!stat.isDirectory()) {
      throw new Error(`${dirname} already exists and is not a directory.`);
    }

    // writes file, text or binary
    if (content_type === 'text') {
      fs.writeFileSync(filepath, content, 'utf8');
    } else {
      fs.writeFileSync(filepath, content);
    }

    // git add
    await git.add(safePath);

    const status = await git.status();

    if (!status.files.length) {
      console.log('git:commit nothing to commit');
      return;
    }

    // git commit
    await git.commit(message, {
      '--author': `${author} <${author_email}>`,
    });

    console.log('git:commit job done');

    const debounceWindow = 30000;
    const bucket = Math.floor(
      Date.now() / debounceWindow
    );

    // git push : send to queue
    await pushQueue.add(
      'push-content',
      {
        repository,
      },
      {
        delay: debounceWindow,
        jobId: `push-${repository}-${bucket}`,
        removeOnComplete: true,
      }
    );
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
      repository
    } = job.data;

    const gitRepository = path.join(
      repositoriesDirectory,
      repository
    );

    const git = SimpleGit(gitRepository);

    await git.fetch();

    // check if push is needed
    const status = await git.status();

    if (status.ahead > 0) {
      await git.push();
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