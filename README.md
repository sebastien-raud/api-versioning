# API de gestion de versioning de documents à travers Git

## Sommaire

- [API de gestion de versioning de documents à travers Git](#api-de-gestion-de-versioning-de-documents-à-travers-git)
  - [Sommaire](#sommaire)
  - [C'est quoi ?](#cest-quoi-)
  - [Architecture](#architecture)
    - [Schéma](#schéma)
    - [Composants](#composants)
  - [Installation](#installation)
  - [Stratégie et comportements](#stratégie-et-comportements)
    - [Garanties et promesses](#garanties-et-promesses)
    - [Diagnostiquer les erreurs](#diagnostiquer-les-erreurs)
    - [Cas d'usage typique](#cas-dusage-typique)
  - [Démo](#démo)
  - [Usage de l'API](#usage-de-lapi)
    - [Route `/commit/{repository}`](#route-commitrepository)
      - [Détail des données `commit`](#détail-des-données-commit)
    - [Route `/history/{repository}/{entity}/{name}`](#route-historyrepositoryentityname)
    - [Route `/diff/{repository}/{entity}/{name}/{commit1}/{commit2}`](#route-diffrepositoryentitynamecommit1commit2)
    - [Route `/delete/:repository/:entity/:name`](#route-deleterepositoryentityname)
      - [Détail des données `delete`](#détail-des-données-delete)
    - [Route `/audit`](#route-audit)
      - [Détails sur la query string](#détails-sur-la-query-string)

## C'est quoi ?

Une API REST qui permet de faire du versioning de documents avec Git en arrière plan (pour le versioning réel) et éventuellement une synchro vers un dépôt centralisé sur GitHub, Gitlab ou autres. Les actions sont ordonnancées (mises en file) pour éviter des erreurs Git et enregistrées dans une table afin d'avoir une traçabilité complète et identifier d'éventuels problèmes.

L'API est minimaliste et doit être utilisée comme un service pour dans un autre projet. L'API ne doit pas être exposée au public. Elle peut néanmoins être sécurisée par un token.

Cas d'usage : gérer l'historisation des fichiers (cours, quiz, questionnaires, documents administratifs, slides...) pour la traçabilité Qualiopi tout en préservant une base simple côté Strapi.

## Architecture

L'API REST place la demande de `commit` dans une file.

La file est traitée de façon indépendante par un service dédié qui réalise le `commit`. L'appel du `push` est placé dans une file.

La file du `push` est traitée en différée. Cela permet de regrouper éventuellement plusieurs `commit` dans un `push` afin d'économiser les ressources et ne pas se faire blacklister par les services (GitHub, Gitlab...)

### Schéma

```plaintext
┌───────────────────────────────────────────────────────┐
│  versioning-api (Express.js, port 3000)               │
│  - POST /commit/:repository                           │
│    - demandes de commit                               │
│    - ajoute les jobs à la queue Redis (BullMQ)        │
│  - GET /history/:repository/:entity/:name             │
│    - demandes d'historique                            |
│  - GET /diff/:repository/:entity/:name/:hash1/:hash2  │
│    - demandes de diff                                 |
│  - DELETE /delete/:repository/:entity/:name           │
│    - demandes de suppression                          │
│    - ajoute les jobs à la queue Redis (BullMQ)        │
└───────────────────────────────────────────────────────┘
                           │
                           ▼ (Queue via Redis)
┌───────────────────────────────────────────────────────┐
│  Redis (BullMQ)                                       │
│  - git-commit (queue pour les commits)                │
│  - git-delete (queue pour les deletes)                │
│  - git-push (queue pour les pushes)                   │
└───────────────────────────────────────────────────────┘
                           │
                           ▼ (Consomme les jobs)
┌───────────────────────────────────────────────────────┐
│  versioning-worker (Node.js)                          │
│  - workerCommit: traite les commits Git               │
│  - workerDelete: traite les deletes Git               │
│  - workerPush: pousse les changements                 │
│  - Gère les repositories locaux                       │
└───────────────────────────────────────────────────────┘
                           │
                           ▼ (Logs des opérations)
┌───────────────────────────────────────────────────────┐
│  SQLite                                               │
│  - enregistrement des actions principales             |
|    des opérations réalisées                           |
└───────────────────────────────────────────────────────┘
```

### Composants

| Composant         | Rôle                                                              | Technos                     |
| ---               | ---                                                               | ---                         |
| versioning-api    | Serveur d'API, validation des requêtes, mise en file des `commit` | Express, Zod, BullMQ        |
| versioning-worker | Traitement asynchrone des opérations Git                          | simple-git, BullMQ, IORedis |
| Redis             | Broker de messages, gestion de la file                            | IORedis                     |
| repos/            | Stockage des repositories Git locaux                              | Git                         |
| data/             | Stockage de la base de données SQLite                             | SQLite                      |

## Installation

- copier le fichier `.env.example` en `.env` et compléter
- copier le fichier `versioning-api/.env.example` en `versioning-api/.env` et compléter
- copier le fichier `versioning-workers/.env.example` en `versioning-workers/.env` et compléter
- dans le répertoire `ssh` copier les clés privées et publiques utilisées par GitHub ou autres (doivent être nommées `id_ed25519` et `id_ed25519.pub`)
- créer un répertoire de stockage des dépôts (correspond à `REPOS_DIR` dans les `.env`)
- initialiser un dépôt local dans ce répertoire ainsi que sur GitHub ou autres
- lancer `docker compose up`

## Stratégie et comportements

### Garanties et promesses

**⚠️ Important pour intégrer correctement avec Strapi :**

1. **Commit = succès local immédiat**
   - L'API retourne `HTTP 202 Accepted` dès que le job est enqueué
   - Cela **ne signifie pas** que le commit Git a réussi
   - Le commit local sera réalisé en arrière-plan par le worker
   - Une fois commité localement, le fichier est **immédiatement visible** en history
   - Les erreurs d'opérations Git sont **loggées en audit**, pas communiquées à Strapi

2. **Push est découplé du commit**
   - Le push (synchronisation vers GitHub/Gitlab) est une opération **séparée et asynchrone**
   - Il se réalise en différé (configurable via `PUSH_DELAY`)
   - Cela permet de regrouper plusieurs commits dans un seul push
   - Un commit peut être visible en history local sans être encore synchronisé avec GitHub
   - Les erreurs de push n'affectent pas les commits locaux

3. **History a toujours une limite**
   - `limit` est plafonné à **50** commits maximum
   - Pas de "récupérer tous les commits" : le paramètre `limit` est obligatoire
   - Utiliser `from` et `limit` pour paginer
   - Permet de garder les performances même sur des files avec 10 000+ commits

### Diagnostiquer les erreurs

Strapi ne reçoit **aucune notification** en cas d'erreur de commit ou push. C'est intentionnel.

**Pour l'administrateur :**

- Consulter la route `/audit` avec les filtres appropriés
- Chercher les `status = 'error'` ou `status = 'started'` (qui pourrait indiquer un job bloqué)
- Exemples de filtres utiles :
  ```plaintext
  # Tous les commits en erreur pour un fichier
  audit?filters=(file = 'article-48.md' and operation = 'commit' and status = 'error')
  
  # Tous les pushes échoués
  audit?filters=(operation = 'push' and status = 'error')
  ```

### Cas d'usage typique

```plaintext
1. Strapi appelle POST /commit/:repository
   → HTTP 202 Accepted { jobId: '...' }
   
2. Job enqueué dans Redis, Worker le traite

3. Worker exécute git add/commit localement
   → Commit local succès → visible immédiatement en history
   → Commit local erreur → loggé en audit, Strapi ne le sait pas

4. (Optionnel) Worker enqueue job push après délai
   → Push vers GitHub succes/erreur → loggé en audit
   
5. Strapi consulte la route /history pour voir l'état actuel
   → Voit les commits présents (locaux ou syncés)
   
6. En cas de problème, admin consulte /audit pour diagnostiquer
```

## Démo

Une démo est disponible dans le répertoire [`démo`](./demo/) : lancer le fichier `index.html` via un serveur et tester.

Le répertoire [`tests`](./tests/) contient des tests de l'API.

## Usage de l'API

| Route                                                    | Méthode  | Description                                            |
| ---                                                      | ---      | ---                                                    |
| `/commit/{repository}`                                   | `POST`   | Réalise le `add`, `commit` et `push` d'un fichier      |
| `/history/{repository}/{entity}/{name}`                  | `GET`    | Affiche l'historique des `commit` d'un fichier         |
| `/diff/{repository}/{entity}/{name}/{commit1}/{commit2}` | `GET`    | Effectue un diff entre deux `commits` d'un fichier     |
| `/delete/:repository/:entity/:name`                      | `DELETE` | Supprime un fichier                                    |
| `/audit`                                                 | `GET`    | Retourne les informations sur les opérations réalisées |

### Route `/commit/{repository}`

Enqueue une demande de commit asynchrone.

- Méthode : `POST`
- Paramètre : `{repository}`, nom du dépôt
- Données :
  ```json
  {
    "entity": "quiz",
    "entity_id": 42,
    "name": "quiz-html-01.md",
    "content": "# Quiz HTML",
    "content_type": "text",
    "author": "Sébastien Raud",
    "author_email": "sebastien.raud@gmail.com",
    "message": "commit message"
  }
  ```

**Réponse :**

- `HTTP 202 Accepted` : Job enqueué avec succès
  ```json
  { "status": "queued", "jobId": "uuid-here" }
  ```
  ⚠️ Cela signifie que la demande est **enqueée**, pas que le commit Git a réussi
- `HTTP 422 Unprocessable Entity` : Erreur de validation des données
- `HTTP 500 Internal Server Error` : Token API invalide (si activé) ou autre erreur

#### Détail des données `commit`

- `entity` : nom de l'entité sauvegardée (pas encore utilisé), obligatoire
- `entity_id` : un identifiant unique de l'entité, numérique ou chaîne de caractères, obligatoire
- `name` : nom de fichier, obligatoire
- `content` : contenu du fichier, obligatoire
- `content_type` : type de contenu, `text` ou `binary`, obligatoire
- `author` : nom de l'utilisateur qui crée ou modifie le fichier, obligatoire
- `author_email` : email de l'utilisateur qui crée ou modifie le fichier, obligatoire
- `message` : message du `commit`, optionnel

Dans le dépôt l'arborescence est :

```plaintext
dépôt
 └─ entity
     └─ name
```

Le `content_type` est nécessaire pour savoir s'il faut enregistrer le fichier en mode texte ou binaire (non pris en compte pour le moment @todo).

Les données `author` et `author_email` sont utilisée pour mémoriser l'auteur du `commit`.

Si le `message` n'est pas présent, le message par défaut est `Updated by {author} {author_email}`.

### Route `/history/{repository}/{entity}/{name}`

Retourne l'historique d'un fichier.

- Méthode : `GET`
- Paramètres :
  - `{repository}` : nom du dépôt
  - `{entity}` : nom de l'entité
  - `{name}` : nom du fichier

Retourne un objet JSON de la forme :

```json
{
  "all": [
    {
      "hash": "d503f93e67e5f272ca29a20ba7d34f9bc6daf7d5",
      "date": "2026-05-29T16:11:08+02:00",
      "message": "Remise en place structuration",
      "author_name": "Jean Dupont",
      "author_email": "jean@example.com"
    },
    ...
  ],
  "latest": {
    "hash": "d503f93e67e5f272ca29a20ba7d34f9bc6daf7d5",
    "date": "2026-05-29T16:11:08+02:00",
    "message": "Remise en place structuration",
    "author_name": "Jean Dupont",
    "author_email": "jean@example.com"
  },
  "total": 10
}
```

- `all` : liste des `commit` retournés
- `latest` : dernier `commit` réalisé sur le fichier
- `total` : nombre d'éléments retournés

On peut utiliser deux paramètres dans la query string :

- `from` : index du premier `commit` à retourner (pagination)
- `limit` : nombre de `commit` à retourner, **valeur maximum 50** (plafonné automatiquement)

**Note :** Il n'est pas possible de récupérer "tous les commits" — une limite est toujours appliquée pour garantir les performances même sur des dépôts avec des milliers de commits. Utiliser `from` et `limit` pour paginer.

### Route `/diff/{repository}/{entity}/{name}/{commit1}/{commit2}`

Retourne le diff entre deux `commit` d'un fichier.

- Méthode : `GET`
- Paramètres :
  - `{repository}` : nom du dépôt
  - `{entity}` : nom de l'entité
  - `{name}` : nom du fichier
  - `{commit1}` : hash du premier `commit`
  - `{commit2}` : hash du second `commit`

Retourne un objet JSON de la forme :

```json
{
  "diff": "diff --git a/article/mon-article.md b/article/mon-article.md\nindex 3fa32c4..abc141b 100644\n--- a/article/mon-article.md\n+++ b/article/mon-article.md\n@@ -4,4 +4,4 @@\n Bla bla !\n Bla **bla** trc fdsfds\n dsq\n-dss ds *ds* **ds** 2325 dsq dsq dsq ! fsdf dsq dsq\n\\ No newline at end of file\n+dss ds *ds* **ds** 2325 dsq dsq dsq ! fsdf dsq\n\\ No newline at end of file\n"
}
```

- `diff` : valeur du diff au format git diff.

### Route `/delete/:repository/:entity/:name`

Enqueue une demande de suppression de fichier asynchrone.

- Méthode : `DELETE`
- Paramètres :
  - `{repository}` : nom du dépôt
  - `{entity}` : nom de l'entité
  - `{name}` : nom du fichier
- Données :
  ```json
  {
    "author": "Sébastien Raud",
    "author_email": "sebastien.raud@gmail.com",
    "message": "commit message"
  }
  ```

**Réponse :**
- `HTTP 202 Accepted` : Job enqueué avec succès
- `HTTP 422 Unprocessable Entity` : Erreur de validation des données

⚠️ Comme pour `/commit`, le retour `202` signifie que la demande est enqueée, pas que la suppression Git a réussi. Vérifier l'audit en cas de doute.

#### Détail des données `delete`

- `author` : nom de l'utilisateur qui crée ou modifie le fichier, obligatoire
- `author_email` : email de l'utilisateur qui crée ou modifie le fichier, obligatoire
- `message` : message du `commit`, optionnel

### Route `/audit`

Retourne les informations sur les opérations réalisées.

- Méthode : `GET`
- Query string :
  - `filters` : filtres de la requêtes
  - `from` : index du premier `commit` à retourner
  - `limit` : nombre de `commit` à retourner, valeur maximum 50
  - `sort` : ordre de tri

#### Détails sur la query string

`filters` permet de filtrer sur les champs suivant :

- `id` : identifiant technique de l'enregistrement
- `created_at` : date de création de l'enregistrement, date UTC au format `YYYY-MM-DD hh:ii:ss` (ex : `2026-06-03 11:26:15`)
- `repository` : dépôt Git
- `operation` : type d'opération réalisée, dans la liste `commit`, `delete`, `push`
- `status` : statut de l'opération réalisée, dans la liste `started` (démarrée), `committed` (commité), `done` (réalisé), `error` (en erreur), `skipped` (abandonnée)
- `entity` : nom de l'entité
- `file` : nom du fichier
- `author` : auteur de la demande
- `author_email` : email de l'auteur de la demande
- `commit_sha` : identifiant de l'opération `commit` ou `delete` réalisée
- `job_id` : identifiant du *job* de l'opération dans la file, pour `commit`, `delete` ou `push`
- `origin_job_id` : identifiant du *job* `commit` ou `delete` à l'origine de la demande de `push`
- `error_message` : message d'erreur
- `metadata` : données complémentaires

Les filtres permettent d'utiliser les opérateurs `=`, `>=`, `<=`, `and` et `or`. Ils utilisent également le système de parenthèses.

Exemples de filtres :

```plaintext
# récupérer toute les actions pour le job_id 8 ainsi que le push
audit?filters=(job_id = 8 or origin_job_id = 8)

# fichier article-48.md, opérations réalisées entre le 01/06/2026 et le 07/06/2026
audit?filters=(file = 'article-48.md' and created_at >= '2026-06-01 00:00:00' and created_at <= '2026-06-07 23:59:59')
```

`sort` permet d'indiquer l'ordre de tri du résultat. On peut mettre plusieurs champs séparés par une virgule. Le caractère `-` devant le nom indique que l'on tri dans l'ordre descendant.

Exemple :

```plaintext
# tri par id descendant et file ascendant
audit?sort=-id,file
```
