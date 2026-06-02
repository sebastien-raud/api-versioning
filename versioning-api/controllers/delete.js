import * as z from "zod";
import { deleteQueue } from "../lib/queue.js";

import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * DELETE /delete/:repository/:entity/:name
 * 
 * Enqueue un job git-delete asynchrone
 * 
 * @param {string} repository - Le slug du repo (ex: "mon-repo")
 * @param {string} entity - L'entité (ex: "article")
 * @param {string} name - Le nom du fichier (ex: "mon-fichier.md")
 * @param {Object} body
 *   - author: string (nom d'auteur)
 *   - author_email: string (email valide)
 *   - message: string (optionnel, commit message)
 * 
 * @returns {204}
 * @returns {422} Erreur de validation
 * @returns {500} Erreur serveur
 * 
 * @note Les retries automatiques sont appliqués (5 tentatives max)
 * @note Le job s'exécutera séquentiellement (concurrency: 1)
 */
export async function deleteController(req, res) {
  const { repository, entity, name } = req.params;

  const logData = {
    repository: repository,
    entity: entity,
    name: name,
    author: `${req.body?.author} <${req.body?.author_email}>`,
  }
  
  logger.info(logData, 'api:delete request received');

  try {
    const validation = z.object({
      author: z.string().trim(),
      author_email: z.string().email(),
      message: z.string().trim().optional(),
    });
    const result = validation.safeParse(req.body);

    if (!result.success) {
      logger.error({
        ...logData,
        details: result.error,
      }, 'api:delete request data validation');

      return res.status(422).send({
        error: "Can't delete content",
        details: result.error
      })
    }

    const data = result.data;

    if (!data.message || !data.message.length) {
      data.message = `Deleted by ${data.author} ${data.author_email}`;
    }

    // enqueue redis job
    const job = await deleteQueue.add(
      'delete-content',
      {
        repository,
        entity,
        name,
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

    logger.info({
        ...logData,
        jobId: job.id
      }, 'api:delete queued');

    
      // return status
    return res.status(202).send({
      status: 'queued',
      jobId: job.id,
    });
  } catch (error) {
    
    logger.error({
        ...logData,
        error: "Internal server error",
        details: error.message,
      }, 'api:delete request error');

    return res.status(500).send({
      error: 'Internal server error',
      details: error.message
    });
  }
}