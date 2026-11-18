# AGENTS.md — Guide de développement & Mémoire technique pour TaskFlow

Ce document synthétise les règles d'architecture, les conventions techniques, le modèle multi-tenant et les commandes opérationnelles pour tout agent ou développeur intervenant sur **TaskFlow**.

---

## 1. Contexte du projet

* **Cadre** : BUT 3 Informatique (IUT d'Amiens) — TD1 : Startup / Outil de gestion de projet SaaS (Partie I & anticipation Partie II).
* **Objectif** : Plateforme SaaS de gestion de projet type Trello / Notion / ClickUp multi-entreprises avec tableau Kanban, gestion des membres, des projets et des tâches.
* **Isolation stricte** : Étanchéité absolue entre les entreprises clientes (*multi-tenancy*).
* **Contrainte clé** : Lancement 100% autonome par une commande unique : `docker compose up -d --build`.

---

## 2. Stack technique & Choix d'architecture

| Composant | Technologie | Justification |
|---|---|---|
| **Base de données** | MongoDB 7.0 | Modèle documentaire (imbrication checklist/commentaires), exigé pour le TD |
| **ODM** | Mongoose 8 | Validation de schémas, déclarations d'index, typage des ObjectId |
| **Backend API** | Node.js 22 (Alpine) + Express 4 | Léger, direct, performant, sans couches superflues |
| **Authentification** | JWT (`jsonwebtoken`) + `bcryptjs` | Sans état (*stateless*), horizontalement scalable |
| **Frontend** | HTML5 / CSS3 / Vanilla JS (SPA native) | Zéro build step, servi directement par Express, léger, KISS |
| **Temps réel** | WebSockets natifs (`ws`) | Synchronisation bidirectionnelle multi-utilisateurs du Kanban en direct |
| **Conteneurisation** | Docker & Docker Compose | Déploiement reproductible, orchestration avec healthchecks |

---

## 3. Règle d'or : Isolation Multi-Entreprise (Multi-Tenant)

Le modèle retenu est : **base partagée, collections partagées, discriminant `companyId`**.

1. **Extraction de `companyId`** : Le `companyId` provient **exclusivement** du jeton JWT signé décodé par le middleware `auth` ([src/lib.js](file:///c:/Users/Alexis/taskflow/src/lib.js)). Il n'est **JAMAIS** lu depuis l'URL (`req.params`) ou le corps (`req.body`).
2. **Scoping systématique** : Toutes les requêtes en base de données doivent obligatoirement utiliser l'utilitaire `req.tenant(filtre)` :
   ```javascript
   const tasks = await Task.find(req.tenant({ projectId: project._id }));
   ```
3. **Erreurs inter-entreprises (Anti-IDOR)** : Si un utilisateur tente d'accéder à l'identifiant d'une ressource (projet, tâche, membre) appartenant à une autre entreprise, l'API renvoie **toujours un HTTP 404** (et non un 403) afin de ne pas divulguer l'existence de la ressource.
4. **Vérification d'appartenance** : Tout utilisateur assigné à une tâche ou ajouté à un projet doit préalablement être validé par `assertUsersInCompany(req, ids)`.

---

## 4. Sécurité & Conformité des Mots de Passe

* **Norme ANSSI appliquée** : Les mots de passe créés ou mis à jour doivent impérativement comporter au moins **12 caractères** et inclure :
  * 1 lettre minuscule `[a-z]`
  * 1 lettre majuscule `[A-Z]`
  * 1 chiffre `[0-9]`
  * 1 caractère spécial `[^A-Za-z0-9]`
* **Validation backend** : Centralisée dans `validatePassword` ([src/routes/auth.js](file:///c:/Users/Alexis/taskflow/src/routes/auth.js)) avec retour d'erreurs 400 détaillant les critères manquants.
* **Feedback visuel frontend** : Jauge de force et checklist dynamique en direct lors de la frappe et dès le focus via `setupPasswordMeter` ([public/app.js](file:///c:/Users/Alexis/taskflow/public/app.js)), actif sur la connexion, l'inscription et la gestion d'équipe.
* **Mots de passe en base** : Toujours hachés avec `bcrypt` (facteur de coût 10). Le champ `passwordHash` est défini avec `select: false` pour ne jamais être exposé accidentellement via les retours JSON.

---

## 5. Synchronisation Temps Réel (WebSockets)

* **Module dédié** : [src/ws.js](file:///c:/Users/Alexis/taskflow/src/ws.js) monté sur `/ws`.
* **Authentification & Multi-tenant** : Authentification dès la poignée de main (*handshake*) via le jeton JWT (`?token=...`). Le serveur isole strictement les canaux par `companyId` : aucun événement ne peut fuiter vers une entreprise concurrente.
* **Système de souscription par projet** : Le client envoie `{ type: 'subscribe:project', projectId }` dès qu'il ouvre un Kanban, et `{ type: 'unsubscribe:project' }` en quittant la vue.
* **Événements diffusés** :
  * `task:created` : nouvelle tâche créée.
  * `task:moved` : carte déplacée ou réordonnée.
  * `task:updated` : modification des détails, statut, assignation ou commentaires.
  * `task:deleted` : suppression d'une carte.
* **Reconnexion client** : Gérée avec *backoff* automatique et résilience aux coupures réseau dans [public/app.js](file:///c:/Users/Alexis/taskflow/public/app.js).

---

## 6. Préparation pour la Partie II : Réplication & Sharding

Le sujet stipule que la base évoluera vers un cluster distribué sans modifier le code source.

1. **Configuration par variables d'environnement** : Tout passe par [.env](file:///c:/Users/Alexis/taskflow/.env) :
   * Standalone (actuel) : `mongodb://mongo:27017/taskflow`
   * Replica Set : `mongodb://mongo1:27017,mongo2:27017,mongo3:27017/taskflow?replicaSet=rs0&readPreference=primaryPreferred&w=majority&retryWrites=true`
   * Cluster Shardé : `mongodb://mongos1:27017,mongos2:27017/taskflow?w=majority&retryWrites=true`
2. **Clés de Sharding alignées avec les index** :
   * `tasks` : clé `{ companyId: 1, projectId: 1 }` $\rightarrow$ Toutes les requêtes Kanban ciblent un unique shard.
   * `projects` : clé `{ companyId: 1 }`.
   * `activities` : clé `{ companyId: 1, createdAt: 1 }`.
3. **Connexion résiliente** : Le module [src/db.js](file:///c:/Users/Alexis/taskflow/src/db.js) gère une boucle de retry avec backoff (30 tentatives de 2s) pour tolérer le délai d'élection du nœud primaire (*Primary*) lors du démarrage d'un Replica Set.

---

## 7. Commandes d'exploitation

Toutes les commandes s'exécutent à la racine du projet :

```bash
# Lancement de l'environnement complet (build et démarrage en tâche de fond)
docker compose up -d --build

# Consulter l'état des conteneurs
docker compose ps

# Consulter les logs applicatifs
docker compose logs -f app

# Arrêt des conteneurs (données conservées dans le volume persistant)
docker compose down

# Réinitialisation complète (suppression des données et relance du seed)
docker compose down -v
docker compose up -d --build
```

---

## 8. Comptes de démonstration

Ces comptes sont insérés au démarrage si la base est vide (`SEED_DEMO=true`) :

| Entreprise | Identifiant | Mot de passe | Rôle |
|---|---|---|---|
| **Acme Corp** | `alice@acme.test` | `TaskFlow2026!` | Propriétaire (*owner*) |
| **Acme Corp** | `bob@acme.test` | `TaskFlow2026!` | Administrateur (*admin*) |
| **Acme Corp** | `chloe@acme.test` | `TaskFlow2026!` | Membre (*member*) |
| **Globex** | `dave@globex.test` | `TaskFlow2026!` | Propriétaire (*owner*) |

---

## 9. Conventions pour les futurs développements

1. **Règle KISS & Anti-vibecode** : Ne pas ajouter de framework lourd ou de dépendance superflue sans accord explicite. Privilégier des solutions simples, lisibles et pérennes.
2. **Typage & Schémas stricts** : Valider rigoureusement les données d'entrée.
3. **Commits & GitFlow** : Conventional Commits en français (`feat: ...`, `fix: ...`, `refactor: ...`). Branches `feature/nom` ou `fix/nom`.
4. **Mise à jour du document** : Ce document doit être tenu à jour à chaque évolution majeure de l'infrastructure ou du modèle de données.
