import * as z from "zod";
import { deleteQueue } from "../lib/queue.js";

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

  try {
    const validation = z.object({
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
    res.status(204).end();
  } catch (error) {
    console.error(error);

    return res.status(500).send({
      error: 'Internal server error',
      details: error.message
    });
  }
}