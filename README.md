# API de gestion de versioning de document à travers Git

## Sommaire

- [API de gestion de versioning de document à travers Git](#api-de-gestion-de-versioning-de-document-à-travers-git)
  - [Sommaire](#sommaire)
  - [C'est quoi ?](#cest-quoi-)
  - [Architecture](#architecture)
    - [Schéma](#schéma)
    - [Composants](#composants)
  - [Installation](#installation)
  - [Démo](#démo)
  - [Usage de l'API](#usage-de-lapi)
    - [Route `/commit/{repository}`](#route-commitrepository)
      - [Détail des données](#détail-des-données)
  - [Todo](#todo)

## C'est quoi ?

Une API REST qui permet de faire du versioning de documents avec Git en arrière plan (pour le versioning réel) et éventuellement une synchro vers un dépôt centralisé sur GitHub, Gitlab ou autres.

L'API est minimaliste et doit être utilisée comme un service pour dans un autre projet. L'API ne doit pas être exposée au public, elle ne prend pas en charge l'authentification.

## Architecture

L'API REST place la demande de `commit` dans une file.

La file est traitée de façon indépendante par un service dédié qui réalise le `commit`. L'appel du `push` est placé dans une file.

La file du `push` est traitée en différée. Cela permet de regrouper éventuellement plusieurs `commit` dans un `push` afin d'économiser les ressources et ne pas se faire blacklister par les services (GitHub, Gitlab...)

### Schéma

```plaintext
┌─────────────────────────────────────────────────────┐
│  versionning-api (Express.js, port 3000)            │
│  - Endpoint POST /commit/:repository                │
│  - Reçoit les demandes de commit                    │
│  - Ajoute les jobs à la queue Redis (BullMQ)        │
└────────────────┬────────────────────────────────────┘
                 │
                 ↓ (Queue via Redis)
┌─────────────────────────────────────────────────────┐
│  Redis (BullMQ)                                     │
│  - git-commit (queue pour les commits)              │
│  - git-push (queue pour les pushes)                 │
└────────────────┬────────────────────────────────────┘
                 │
                 ↓ (Consomme les jobs)
┌─────────────────────────────────────────────────────┐
│  versionning-worker (Node.js)                       │
│  - workerCommit: traite les commits Git             │
│  - workerPush: pousse les changements               │
│  - Gère les repositories locaux (repos/)            │
└─────────────────────────────────────────────────────┘
```

### Composants

| Composant         | Rôle                                                              | Technos                     |
| ---               | ---                                                               | ---                         |
| versioning-api    | Serveur d'API, validation des requêtes, mise en file des `commit` | Express, Zod, BullMQ        |
| versioning-worker | Traitement asynchrone des opérations Git                          | simple-git, BullMQ, IORedis |
| Redis             | Broker de messages, gestion de la file                            | IORedis                     |
| repos/            | Stockage des repositories Git locaux                              | Git                         |

## Installation

Docker compose à mettre en place @todo

## Démo

À faire @todo

## Usage de l'API

| Route                  | Méthode | Description                                       |
| ---                    | ---     | ---                                               |
| `/commit/{repository}` | `POST`  | Réalise le `add`, `commit` et `push` d'un fichier |

### Route `/commit/{repository}`

Réalise les actions Git `add`, `commit` et `push`.

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

#### Détail des données

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

## Todo

- docker
- gestion arbo
- routes :
  - `delete` : suppression d'un fichier
  - `history` : historique d'un fichier
  - `diff` : diff entre deux commits d'un fichier
