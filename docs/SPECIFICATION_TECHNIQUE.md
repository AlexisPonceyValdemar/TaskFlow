# TaskFlow — Spécification technique

## 1. Architecture générale

```
 Navigateur (SPA HTML/JS)
        │  HTTP / JSON  (jeton JWT dans l'en-tête Authorization)
        ▼
 ┌──────────────────────────┐        ┌─────────────────────┐
 │  app  (Node.js / Express)│ ─────▶ │  mongo  (MongoDB 7) │
 │  - API REST /api/*       │  URI   │  base « taskflow »  │
 │  - fichiers statiques    │        │  volume mongo-data  │
 └──────────────────────────┘        └─────────────────────┘
        conteneurs orchestrés par docker compose
```

| Couche | Technologie | Justification |
|---|---|---|
| Base de données | MongoDB 7 | Imposé ; modèle documentaire adapté aux tâches riches (checklist, commentaires imbriqués) |
| ODM | Mongoose 8 | Validation des schémas, déclaration des index |
| API | Node.js 22 + Express 4 | Léger, pilote MongoDB officiel |
| Authentification | JWT (jsonwebtoken) + bcrypt | Sans état côté serveur → l'application peut être répliquée horizontalement |
| Front-end | HTML / CSS / JavaScript natif | Aucune étape de build, servi par Express |
| Déploiement | Docker Compose | Lancement par une seule commande |

L'application est **sans état** (stateless) : aucune session n'est stockée en mémoire. Plusieurs instances de `app` peuvent donc tourner derrière un répartiteur de charge.

## 2. Configuration de la connexion

La connexion est entièrement pilotée par des variables d'environnement, définies dans `.env` :

| Variable | Exemple |
|---|---|
| `MONGODB_URI` | `mongodb://mongo:27017/taskflow` |
| `MONGODB_MAX_POOL_SIZE` | `20` |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | `5000` |
| `MONGODB_CONNECT_RETRIES` | `30` |

La chaîne de connexion accepte toutes les options standard de MongoDB (`replicaSet`, `readPreference`, `w`, `retryWrites`, `authSource`…). Passer en replica set ou en cluster shardé ne demande **aucune modification du code** :

```dotenv
# Replica set
MONGODB_URI=mongodb://mongo1:27017,mongo2:27017,mongo3:27017/taskflow?replicaSet=rs0&readPreference=primaryPreferred&w=majority&retryWrites=true
# Sharding (via mongos)
MONGODB_URI=mongodb://mongos1:27017,mongos2:27017/taskflow?w=majority&retryWrites=true
```

Au démarrage, l'application retente la connexion (30 essais toutes les 2 s par défaut), ce qui laisse le temps à un cluster de s'initialiser.

## 3. Isolation multi-entreprise (multi-tenant)

Modèle retenu : **base partagée, collections partagées, discriminant `companyId`** dans chaque document.

Règles appliquées par le code :

1. À la connexion, l'API émet un jeton JWT signé contenant `sub` (id utilisateur), `companyId` et `role`.
2. À chaque requête, le middleware `auth` vérifie le jeton, recharge l'utilisateur depuis la base (`{_id, companyId, active: true}`) et fixe `req.companyId`.
3. Toutes les requêtes MongoDB passent par `req.tenant(filtre)`, qui ajoute systématiquement `companyId: req.companyId`. Le `companyId` ne provient **jamais** du corps, de l'URL ou des paramètres de la requête.
4. À la création d'un document, `companyId` est forcé depuis le jeton.
5. Les références croisées sont contrôlées : un membre de projet ou un assigné doit appartenir à la même entreprise (`assertUsersInCompany`), un assigné doit être membre du projet.
6. Une ressource d'une autre entreprise renvoie **404** (et non 403), pour ne pas révéler son existence.
7. Les routes « entreprise » (`/api/company`) n'acceptent pas d'identifiant : on ne peut agir que sur sa propre entreprise.

Ce choix (plutôt qu'une base par entreprise) permet d'utiliser `companyId` comme **clé de sharding** et de répartir les entreprises sur plusieurs shards.

## 4. Contrôle d'accès (rôles)

| Action | owner | admin | member |
|---|:-:|:-:|:-:|
| Modifier l'entreprise | ✔ | ✔ | |
| Supprimer l'entreprise | ✔ | | |
| Créer / modifier / supprimer un utilisateur | ✔ | ✔ (pas l'owner) | |
| Changer le rôle d'un utilisateur, créer un admin | ✔ | | |
| Voir tous les projets | ✔ | ✔ | seulement ses projets |
| Créer / modifier / supprimer un projet | ✔ | ✔ | |
| Créer / modifier / déplacer une tâche | ✔ | ✔ | ✔ (projets dont il est membre) |
| Supprimer une tâche | ✔ | ✔ | si créateur |
| Commenter | ✔ | ✔ | ✔ |

## 5. Modèle de données

Base : `taskflow`. Cinq collections. Les identifiants sont des `ObjectId` ; les dates sont des `ISODate` (UTC). Les champs `createdAt` / `updatedAt` sont gérés automatiquement.

Choix de modélisation :

- **Références** entre entités indépendantes et de taille non bornée (entreprise → utilisateurs → projets → tâches).
- **Imbrication** pour les données qui n'existent qu'au sein de leur parent et sont lues avec lui : colonnes du Kanban dans le projet, checklist et commentaires dans la tâche.
- **Dénormalisation légère** : `authorName` dans les commentaires, `actorName` dans l'activité, pour l'affichage sans jointure.

### 5.1 `companies`

```json
{
  "_id": { "$oid": "6710a1f2c3b4a5d6e7f80001" },
  "name": "Acme Corp",
  "slug": "acme-corp",
  "plan": "pro",
  "settings": {
    "defaultColumns": [
      { "key": "todo",        "label": "À faire",  "color": "#94a3b8" },
      { "key": "in_progress", "label": "En cours", "color": "#3b82f6" },
      { "key": "review",      "label": "En revue", "color": "#f59e0b" },
      { "key": "done",        "label": "Terminé",  "color": "#10b981" }
    ]
  },
  "createdAt": { "$date": "2026-10-14T08:00:00.000Z" },
  "updatedAt": { "$date": "2026-10-14T08:00:00.000Z" }
}
```

| Champ | Type | Contraintes |
|---|---|---|
| `name` | string | obligatoire, ≤ 120 caractères |
| `slug` | string | unique, identifiant lisible |
| `plan` | string | `free` \| `pro` \| `enterprise` |
| `settings.defaultColumns` | array | colonnes appliquées aux nouveaux projets |

### 5.2 `users`

```json
{
  "_id": { "$oid": "6710a1f2c3b4a5d6e7f80011" },
  "companyId": { "$oid": "6710a1f2c3b4a5d6e7f80001" },
  "name": "Alice Martin",
  "email": "alice@acme.test",
  "passwordHash": "$2a$10$Q7m...hash bcrypt...",
  "role": "owner",
  "jobTitle": "CEO",
  "active": true,
  "lastLoginAt": { "$date": "2026-10-14T09:12:00.000Z" },
  "createdAt": { "$date": "2026-10-14T08:00:00.000Z" },
  "updatedAt": { "$date": "2026-10-14T09:12:00.000Z" }
}
```

| Champ | Type | Contraintes |
|---|---|---|
| `companyId` | ObjectId → companies | obligatoire |
| `email` | string | unique (global), en minuscules ; sert d'identifiant de connexion |
| `passwordHash` | string | hash bcrypt (coût 10), jamais renvoyé par l'API |
| `role` | string | `owner` \| `admin` \| `member` |
| `active` | bool | un compte désactivé ne peut plus se connecter |

### 5.3 `projects`

```json
{
  "_id": { "$oid": "6710a1f2c3b4a5d6e7f80101" },
  "companyId": { "$oid": "6710a1f2c3b4a5d6e7f80001" },
  "name": "Refonte du site web",
  "description": "Nouvelle version du site vitrine et du tunnel de commande.",
  "color": "#6366f1",
  "memberIds": [
    { "$oid": "6710a1f2c3b4a5d6e7f80011" },
    { "$oid": "6710a1f2c3b4a5d6e7f80012" },
    { "$oid": "6710a1f2c3b4a5d6e7f80013" }
  ],
  "columns": [
    { "key": "todo",        "label": "À faire",  "color": "#94a3b8" },
    { "key": "in_progress", "label": "En cours", "color": "#3b82f6" },
    { "key": "review",      "label": "En revue", "color": "#f59e0b" },
    { "key": "done",        "label": "Terminé",  "color": "#10b981" }
  ],
  "status": "active",
  "startDate": { "$date": "2026-10-04T00:00:00.000Z" },
  "endDate":   { "$date": "2026-11-13T00:00:00.000Z" },
  "createdBy": { "$oid": "6710a1f2c3b4a5d6e7f80011" },
  "createdAt": { "$date": "2026-10-14T08:00:00.000Z" },
  "updatedAt": { "$date": "2026-10-14T08:00:00.000Z" }
}
```

| Champ | Type | Contraintes |
|---|---|---|
| `memberIds` | ObjectId[] → users | utilisateurs de la même entreprise uniquement |
| `columns` | array imbriqué | 2 à 10 colonnes, `key` unique ; la **dernière** colonne correspond à l'état « terminé » |
| `status` | string | `active` \| `archived` |

Les colonnes sont imbriquées car elles sont peu nombreuses, toujours lues avec le projet et propres à celui-ci. Une colonne ne peut pas être supprimée tant qu'elle contient des tâches.

### 5.4 `tasks`

```json
{
  "_id": { "$oid": "6710a1f2c3b4a5d6e7f81001" },
  "companyId": { "$oid": "6710a1f2c3b4a5d6e7f80001" },
  "projectId": { "$oid": "6710a1f2c3b4a5d6e7f80101" },
  "title": "Intégrer le header et le footer",
  "description": "Reprendre les maquettes validées.",
  "status": "in_progress",
  "priority": "medium",
  "assigneeId": { "$oid": "6710a1f2c3b4a5d6e7f80013" },
  "reporterId": { "$oid": "6710a1f2c3b4a5d6e7f80012" },
  "dueDate": { "$date": "2026-10-17T00:00:00.000Z" },
  "tags": ["front"],
  "position": 0,
  "checklist": [
    { "_id": { "$oid": "6710a1f2c3b4a5d6e7f82001" }, "text": "Header desktop", "done": true },
    { "_id": { "$oid": "6710a1f2c3b4a5d6e7f82002" }, "text": "Header mobile",  "done": false }
  ],
  "comments": [
    {
      "_id": { "$oid": "6710a1f2c3b4a5d6e7f83001" },
      "authorId": { "$oid": "6710a1f2c3b4a5d6e7f80012" },
      "authorName": "Bob Durand",
      "text": "Pense à reprendre les couleurs de la charte.",
      "createdAt": { "$date": "2026-10-14T10:30:00.000Z" }
    }
  ],
  "completedAt": null,
  "createdAt": { "$date": "2026-10-14T08:00:00.000Z" },
  "updatedAt": { "$date": "2026-10-14T10:30:00.000Z" }
}
```

| Champ | Type | Contraintes |
|---|---|---|
| `companyId` | ObjectId | copié depuis le projet ; garantit l'isolation et sert de préfixe de shard |
| `projectId` | ObjectId → projects | obligatoire |
| `status` | string | doit correspondre à une `key` des colonnes du projet |
| `priority` | string | `low` \| `medium` \| `high` \| `urgent` |
| `assigneeId` | ObjectId → users \| null | doit être membre du projet |
| `position` | number | ordre de la carte dans sa colonne (0, 1, 2…) |
| `tags` | string[] | ≤ 10, en minuscules, sans doublon |
| `checklist` | array imbriqué | sous-tâches cochables |
| `comments` | array imbriqué | fil de discussion |
| `completedAt` | date \| null | renseigné quand la tâche entre dans la dernière colonne |

Le document tâche est autonome : une seule lecture suffit pour afficher la carte et sa fenêtre de détail. Les commentaires sont imbriqués car leur volume par tâche reste faible ; au-delà de quelques centaines, on les déplacerait dans une collection dédiée.

### 5.5 `activities` (journal)

```json
{
  "_id": { "$oid": "6710a1f2c3b4a5d6e7f84001" },
  "companyId": { "$oid": "6710a1f2c3b4a5d6e7f80001" },
  "projectId": { "$oid": "6710a1f2c3b4a5d6e7f80101" },
  "taskId": { "$oid": "6710a1f2c3b4a5d6e7f81001" },
  "actorId": { "$oid": "6710a1f2c3b4a5d6e7f80013" },
  "actorName": "Chloé Petit",
  "action": "task.moved",
  "details": { "title": "Intégrer le header et le footer", "from": "À faire", "to": "En cours" },
  "createdAt": { "$date": "2026-10-14T11:00:00.000Z" }
}
```

Actions enregistrées : `task.created`, `task.updated`, `task.moved`, `task.commented`, `task.deleted`, `project.created`, `project.updated`, `project.deleted`, `user.created`, `user.updated`, `user.deleted`, `company.updated`.

Un index TTL purge automatiquement les entrées de plus de 180 jours.

### 5.6 Relations

```
companies 1 ──< users
companies 1 ──< projects >──< users      (projects.memberIds)
projects  1 ──< tasks
tasks     >── 0..1 users                  (tasks.assigneeId)
companies 1 ──< activities
```

## 6. Index

| Collection | Index | Usage |
|---|---|---|
| companies | `{ slug: 1 }` unique | unicité de l'identifiant |
| users | `{ email: 1 }` unique | connexion |
| users | `{ companyId: 1 }` | liste des membres |
| projects | `{ companyId: 1, status: 1, name: 1 }` | liste des projets |
| projects | `{ companyId: 1, memberIds: 1 }` | projets d'un membre |
| tasks | `{ companyId: 1, projectId: 1, status: 1, position: 1 }` | affichage du Kanban (requête principale) |
| tasks | `{ companyId: 1, assigneeId: 1, status: 1 }` | « Mes tâches » |
| activities | `{ companyId: 1, projectId: 1, createdAt: -1 }` | fil d'activité |
| activities | `{ createdAt: 1 }` TTL 180 j | purge automatique |

Tous les index des données métier commencent par `companyId` : chaque requête est ciblée sur une seule entreprise.

## 7. Évolution vers la réplication et le sharding (partie II)

**Réplication** : seule l'URI change (`replicaSet=rs0`). Le pilote gère la bascule automatique en cas de perte du primaire ; `retryWrites=true` rejoue les écritures interrompues ; `w=majority` garantit la durabilité ; `readPreference=primaryPreferred` ou `secondaryPreferred` permet de répartir les lectures.

**Sharding** : l'application se connecte aux routeurs `mongos`. Clés de sharding proposées :

| Collection | Clé de shard | Raison |
|---|---|---|
| tasks | `{ companyId: 1, projectId: 1 }` (ou `{ companyId: "hashed" }`) | collection la plus volumineuse ; toutes les requêtes filtrent sur `companyId` et `projectId` → requêtes ciblées sur un seul shard |
| activities | `{ companyId: 1, createdAt: 1 }` | forte volumétrie en écriture |
| projects | `{ companyId: 1 }` | requêtes toujours par entreprise |
| users, companies | non shardées | faible volume ; `users.email` doit rester unique globalement, ce qui impose de ne pas la sharder sur `companyId` |

```js
sh.enableSharding("taskflow")
sh.shardCollection("taskflow.tasks",      { companyId: 1, projectId: 1 })
sh.shardCollection("taskflow.activities", { companyId: 1, createdAt: 1 })
sh.shardCollection("taskflow.projects",   { companyId: 1 })
```

Les index existants commencent déjà par ces clés, et toutes les mises à jour de tâches incluent `companyId` dans leur filtre : aucune modification du code n'est requise.

La suppression en cascade (entreprise → projets → tâches) n'utilise pas de transaction afin de fonctionner aussi sur un serveur standalone ; en replica set, elle pourrait être encapsulée dans une transaction multi-documents.

## 8. Sécurité

- Mots de passe hachés avec bcrypt ; le hash n'est jamais renvoyé par l'API (`select: false`).
- Jeton JWT signé (HS256) à durée limitée (`JWT_EXPIRES_IN`) ; secret dans `.env`.
- Vérification de l'utilisateur en base à chaque requête : un compte désactivé ou supprimé perd immédiatement l'accès.
- Recherche texte : la saisie est échappée avant d'être utilisée dans une expression régulière (pas d'injection de regex).
- Validation des `ObjectId` avant toute requête ; erreurs normalisées (400, 401, 403, 404, 409).
- Port MongoDB non exposé hors du réseau Docker.
- Conteneur applicatif exécuté avec un utilisateur non root.

## 9. Conteneurisation

| Fichier | Contenu |
|---|---|
| `Dockerfile` | image `node:22-alpine`, `npm ci --omit=dev`, utilisateur `node`, healthcheck sur `/api/health` |
| `compose.yml` | services `mongo` (image `mongo:7.0`, volume persistant, healthcheck `ping`) et `app` (build local, `env_file: .env`, démarre quand `mongo` est sain) |
| `.env` | configuration complète (connexion, sécurité, données de démo) |
