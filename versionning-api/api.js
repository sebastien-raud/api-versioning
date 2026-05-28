import express from "express";
import cors from "cors";
import * as z from "zod";
import { commitQueue } from "./lib/queue.js";

const app = express();
const port = 3000;

app.use(cors(process.env.ALLOWED_DOMAINS || '*'));
app.disable('x-powered-by');
app.use(express.json());

/**
 * {
 *   "entity": "article",
 *   "entity_id": 42,
 *   "name": "mon-article",
 *   "content": "...markdown...",
 *   "content_type": "text or binary",
 *   "author": "Username",
 *   "author_email": "user@orga.fr",
 *   "message": "commit message"
 * }
 */
app.post('/commit/:repository', async(req, res) => {
  try {
    // data validation
    const validation = z.object({
      entity: z.string().trim(),
      entity_id: z.union([z.string(), z.number()]),
      name: z.string().trim(),
      content: z.string().trim(),
      content_type: z.union([z.literal('text'), z.literal('binary')]),
      author: z.string().trim(),
      author_email: z.string().email(),
      message: z.string().trim().optional(),
    });
    const result = validation.safeParse(req.body);

    if (!result.success) {
      return res.status(422).send({
        error: "Can't commit content",
        details: result.error
      })
    }

    const data = result.data;

    if (!data.message || !data.message.length) {
      data.message = `Updated by ${data.author} ${data.author_email}`;
    }

    const repository = req.params.repository;

    // enqueue redis job
    const job = await commitQueue.add(
      'commit-content',
      {
        repository,
        ...data,
      },
      {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 100,
      }
    );

    // return status
    return res.status(202).send({
      status: 'queued',
      jobId: job.id,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).send({
      error: 'Internal server error',
      details: error.message
    });
  }
});

process.on('SIGTERM', () => {
  console.log('SIGTERM reçu, arrêt du serveur...');
  server.close(() => {
    console.log('API server stopped.');
    process.exit(0);
  });
});

const server = app.listen(port, () => {
  console.log(`API server started on port ${port}`);
});