// worker.js

import { Worker } from 'bullmq';
import IORedis from "ioredis";
import { dir } from 'node:console';
import SimpleGit from "simple-git";

import fs, { statSync } from "node:fs";
import path from 'node:path';

const repositoriesDirectory = path.resolve(process.env.REPOS_DIR || '../repos/');

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  'git-commit',
  async (job) => {
    console.log('processing job', job.id);

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
    await git.add(name);

    const status = await git.status();

    if (!status.files.length) {
      console.log('nothing to commit');
      return;
    }

    // git commit
    await git.commit(message, {
      '--author': `${author} <${author_email}>`,
    });

    // git push
    await git.push();

    console.log('export done');
  },
  {
    connection,

    // IMPORTANT pour git
    concurrency: 1,
  }
);

worker.on('completed', (job) => {
  console.log(`job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`job ${job?.id} failed`, err);
});