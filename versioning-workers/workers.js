import 'dotenv/config.js';

import { Worker } from 'bullmq';
import IORedis from "ioredis";
import { dir } from 'node:console';
import SimpleGit from "simple-git";

import fs, { statSync } from "node:fs";
import path from 'node:path';

import { pushQueue } from './lib/queue.js';
import { repoData } from './lib/repoData.js';

import Redlock from 'redlock';

import pino from 'pino';

const repositoriesDirectory = path.resolve(process.env.REPOS_DIR || '../repos/');

const pushDelay = Number(process.env.PUSH_DELAY || 30000);
const repoLockTtl = Number(process.env.REPO_LOCK_TTL || 30000);

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
  maxRetriesPerRequest: null,
});

// lock redis on repo to avoid simultaneous git actions
const redlock = new Redlock(
  [connection],
  {
    retryCount: 10,
    retryDelay: 200,
  }
);

// SimpleGit configuration
const simpleGitOptions = {
  timeout: 10000,  // 10 secondes max
};

// pino init
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

const workerCommit = new Worker(
  'git-commit',
  async (job) => {
    
    const logData = {
      repository: job.data.repository,
      entity: job.data.entity,
      file: job.data.name,
      jobId: job.id
    };

    logger.info(logData, 'git:commit job started');

    try {
      await executeGitOperations('commit', logData, job);
    } catch (error) {
      logger.error({
          ...logData,
          details: error.message
        }, 'git:commit error');
      throw error;
    }
  },
  {
    connection,

    // IMPORTANT pour git
    concurrency: 1,
  }
);

workerCommit.on('completed', (job) => {
  logger.info({
      repository: job.data.repository,
      entity: job.data.entity,
      file: job.data.name,
      jobId: job.id,
    }, 'git:commit completed');
});

workerCommit.on('failed', (job, err) => {
  logger.error({
      repository: job.data.repository,
      entity: job.data.entity,
      file: job.data.name,
      jobId: job?.id,
      error: err
    }, 'git:commit failed');
});

const workerDelete = new Worker(
  'git-delete',
  async (job) => {
    
    const logData = {
      repository: job.data.repository,
      entity: job.data.entity,
      file: job.data.name,
      jobId: job.id
    };

    logger.info(logData, 'git:delete job started');

    try {
      await executeGitOperations('delete', logData, job);
    } catch (error) {
      logger.error({
          ...logData,
          details: error.message
        }, 'git:delete error');
      throw error;
    }
  },
  {
    connection,

    // IMPORTANT pour git
    concurrency: 1,
  }
);

async function executeGitOperations(operation, logData, job) {
  // get data
  const data = repoData(job.data, repositoriesDirectory);

  // file path protections
  if (data.safeFileName.includes('..') || data.safeFileName.includes('/') || path.isAbsolute(data.safeFileName)) {
    throw new Error(`Invalid path ${data.safeFileName}`);
  }

  await redlock.using(
    [`repo:${data.repository}`],
    repoLockTtl,
    async () => {
      const git = SimpleGit(data.gitRepository, simpleGitOptions);

      if (!fs.existsSync(data.gitRepository)) {
        throw new Error(`Directory not found: ${data.gitRepository}`);
      }

      const isRepo = await git.checkIsRepo();

      if (!isRepo) {
        throw new Error(`Repository not found: ${data.gitRepository}`);
      }

      // git pull rebase to avoid problems
      await git.reset(['--hard']);
      await git.clean('f', ['-d']);

      // creates directory if not exists
      if (!fs.existsSync(data.absoluteDirectoryPath)) {
        fs.mkdirSync(data.absoluteDirectoryPath, { recursive: true});
      }
      
      const statDir = fs.statSync(data.absoluteDirectoryPath);

      if (!statDir.isDirectory()) {
        throw new Error(`${data.absoluteDirectoryPath} already exists and is not a directory.`);
      }

      if (operation === 'commit') {
        // writes file, text or binary
        if (data.contentType === 'text') {
          fs.writeFileSync(data.absoluteFilePath, data.content, 'utf8');
        } else {
          fs.writeFileSync(data.absoluteFilePath, data.content);
        }

        logger.info(logData, 'git:commit file written');
      } else if (operation === 'delete') {
        if (!fs.existsSync(data.absoluteFilePath)) {
          throw new Error(`${data.absoluteFilePath} not exists`);
        }

        const statFile = fs.statSync(data.absoluteFilePath);
        if (!statFile.isFile()) {
          throw new Error(`${data.absoluteFilePath} already exists and is not a file.`);
        }

        // deletes file
        fs.rmSync(data.absoluteFilePath);

        logger.info(logData, 'git:delete file deleted');
      }

      // git add
      await git.add(data.gitFilePath);
      const status = await git.status();

      if (!status.files.length) {
        logger.warn(logData, `git:${operation} nothing to commit`);
        return;
      }

      // git commit
      await git.commit(data.message, {
        '--author': `${data.author} <${data.authorEmail}>`,
      });

      const sha = (await git.revparse(['HEAD'])).trim();
      logger.info({...logData, sha}, `git:${operation} job done`);

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
    }
  );
}

workerDelete.on('completed', (job) => {
  logger.info({
      repository: job.data.repository,
      entity: job.data.entity,
      file: job.data.name,
      jobId: job.id,
    }, 'git:delete completed');
});

workerDelete.on('failed', (job, err) => {
  logger.error({
      repository: job.data.repository,
      entity: job.data.entity,
      file: job.data.name,
      jobId: job?.id,
      error: err
    }, 'git:delete failed');
});

const workerPush = new Worker(
  'git-push',
  async (job) => {
    
    const logData = {
      repository: job.data.repository,
      gitRepository: job.data.gitRepository,
      jobId: job.id,
    };

    logger.info(logData, 'git:push job started');

    try {
      // get data
      const {
        repository,
        gitRepository
      } = job.data;

      await redlock.using(
        [`repo:${repository}`],
        repoLockTtl,
        async () => {
          const git = SimpleGit(gitRepository, simpleGitOptions);

          // check if push is needed
          const status = await git.status();

          if (status.ahead > 0) {
            await git.push();
            logger.info(logData, 'git:push done');
          } else {
            logger.warn(logData, 'git:push already done');
          }

          logger.info(logData, 'git:push job done');
        }
      );
    } catch (error) {
      logger.error({
          ...logData,
          error: error.message
        }, 'git:push error');
      throw error;
    }
  },
  {
    connection,
    concurrency: 1,
  }
);

workerPush.on('completed', (job) => {
  logger.info({
      repository: job.data.repository,
      gitRepository: job.data.gitRepository,
      jobId: job.id,
    }, 'git:push completed');
});

workerPush.on('failed', (job, err) => {
  logger.error({
      repository: job.data.repository,
      gitRepository: job.data.gitRepository,
      jobId: job?.id,
      error: err
    }, 'git:push failed');
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