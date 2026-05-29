import * as z from "zod";
import { commitQueue } from "../lib/queue.js";

/**
 * POST /commit/:repository
 * 
 * Enqueue un job git-commit asynchrone
 * 
 * @param {string} repository - Le slug du repo (ex: "mon-repo")
 * @param {Object} body
 *   - entity: string (dossier, ex: "article")
 *   - entity_id: number (ID du contenu)
 *   - name: string (nom du fichier, ex: "mon-article.md")
 *   - content: string (contenu à écrire)
 *   - content_type: "text" | "binary"
 *   - author: string (nom d'auteur)
 *   - author_email: string (email valide)
 *   - message: string (optionnel, commit message)
 * 
 * @returns {202} { status: 'queued', jobId: 'uuid' }
 * @returns {422} Erreur de validation
 * @returns {500} Erreur serveur
 * 
 * @note Les retries automatiques sont appliqués (5 tentatives max)
 * @note Le job s'exécutera séquentiellement (concurrency: 1)
 */
export async function commitController(req, res) {
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
}
