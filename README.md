# TaskFlow — Gestion de projet SaaS multi-entreprises

**Auteurs** : PONCEY VALDEMAR Alexis et SUEUR Mathieu — groupe DEV 2.2

Outil de gestion de projet inspiré de Trello / Notion / ClickUp : entreprises, utilisateurs, projets, tâches et tableau **Kanban** avec glisser-déposer. Chaque entreprise est strictement isolée des autres.

**Stack** : Node.js 22 · Express · Mongoose · MongoDB 7 · front-end HTML/CSS/JS sans framework · Docker Compose.

---

## 1. Démarrage

Seuls **Docker** et **Docker Compose** sont nécessaires. À la racine du projet :

```bash
docker compose up -d --build
```

Puis ouvrir **http://localhost:3000**.

Le premier démarrage télécharge les images et installe les dépendances dans le conteneur (environ 1 minute). L'application attend que MongoDB soit prêt (healthcheck) avant de démarrer.

### Comptes de démonstration

Créés automatiquement au premier lancement (`SEED_DEMO=true`). Mot de passe pour tous : **`TaskFlow2026!`** (conforme à la politique de sécurité ANSSI : $\ge$ 12 caractères, majuscule, minuscule, chiffre, symbole).

| Entreprise | E-mail | Rôle |
|---|---|---|
| Acme Corp | `alice@acme.test` | Propriétaire |
| Acme Corp | `bob@acme.test` | Administrateur |
| Acme Corp | `chloe@acme.test` | Membre (ne voit que ses projets) |
| Globex | `dave@globex.test` | Propriétaire |

Se connecter avec Alice puis avec Dave permet de constater l'isolation : aucun des deux ne voit les données de l'autre entreprise.

Il est aussi possible de créer sa propre entreprise depuis l'onglet **« Créer une entreprise »** de l'écran de connexion.

### Commandes utiles

```bash
docker compose ps                 # état des services
docker compose logs -f app        # logs de l'application
docker compose down               # arrêt (les données sont conservées)
docker compose down -v            # arrêt + suppression des données (base réinitialisée)
```

---

## 2. Configuration

Toute la configuration se trouve dans le fichier **`.env`** (lu par `compose.yml`). Aucune modification du code n'est nécessaire.

| Variable | Défaut | Rôle |
|---|---|---|
| `MONGODB_URI` | `mongodb://mongo:27017/taskflow` | Chaîne de connexion MongoDB complète |
| `MONGODB_DB_NAME` | *(celui de l'URI)* | Force le nom de la base |
| `MONGODB_MAX_POOL_SIZE` | `20` | Taille du pool de connexions |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | `5000` | Délai de sélection d'un nœud |
| `MONGODB_CONNECT_RETRIES` / `_RETRY_DELAY_MS` | `30` / `2000` | Tentatives de connexion au démarrage |
| `MONGODB_AUTO_INDEX` | `true` | Création automatique des index |
| `PORT` / `APP_PORT` | `3000` / `3000` | Port interne / port publié sur l'hôte |
| `JWT_SECRET` | — | Clé de signature des sessions (**à changer**) |
| `JWT_EXPIRES_IN` | `8h` | Durée de validité d'une session |
| `SEED_DEMO` | `true` | Données de démonstration si la base est vide |

### Préparer la partie II (réplication / sharding)

Il suffit de changer `MONGODB_URI` dans `.env`, puis `docker compose up -d` :

```dotenv
# Replica set
MONGODB_URI=mongodb://mongo1:27017,mongo2:27017,mongo3:27017/taskflow?replicaSet=rs0&readPreference=primaryPreferred&w=majority&retryWrites=true

# Cluster shardé (l'application se connecte aux routeurs mongos)
MONGODB_URI=mongodb://mongos1:27017,mongos2:27017/taskflow?w=majority&retryWrites=true
```

Le modèle de données est déjà pensé pour le sharding (clé `companyId` présente dans tous les documents, index composés alignés) : voir `docs/SPECIFICATION_TECHNIQUE.md`.

---

## 3. Fonctionnalités

- Création d'entreprise (inscription), modification, suppression complète
- Gestion des utilisateurs avec rôles : propriétaire, administrateur, membre ; désactivation de compte
- Projets : création, modification, archivage, suppression, couleur, dates, membres
- Colonnes du Kanban personnalisables par projet (ajout, renommage, couleur, ordre)
- Tâches : titre, description, statut, priorité, assigné, échéance, étiquettes, checklist, commentaires
- Tableau Kanban avec glisser-déposer (changement de statut et d'ordre)
- Filtres du Kanban : recherche, membre, priorité
- Tableau de bord : statistiques, avancement des projets, tâches à venir, activité récente
- Vue « Mes tâches », journal d'activité par projet
- Isolation stricte des données entre entreprises

Détails : `docs/SPECIFICATION_FONCTIONNELLE.md`.

---

## 4. API REST (résumé)

Toutes les routes sauf `/api/auth/register`, `/api/auth/login` et `/api/health` exigent l'en-tête `Authorization: Bearer <jeton>`.

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Créer une entreprise + son propriétaire |
| POST | `/api/auth/login` | Connexion, renvoie un jeton JWT |
| GET / PUT | `/api/auth/me` | Profil courant |
| GET / PUT / DELETE | `/api/company` | Entreprise courante (DELETE : `{"confirm":"SUPPRIMER"}`) |
| GET | `/api/company/activity` | Journal d'activité |
| GET / POST | `/api/users` | Liste / création d'utilisateurs |
| GET / PUT / DELETE | `/api/users/:id` | Détail / modification / suppression |
| GET / POST | `/api/projects` | Liste (`?status=archived`) / création |
| GET / PUT / DELETE | `/api/projects/:id` | Détail / modification / suppression |
| GET | `/api/projects/:id/stats` | Statistiques du projet |
| GET | `/api/projects/:id/activity` | Activité du projet |
| GET / POST | `/api/projects/:id/tasks` | Tâches du projet (`?q=&assigneeId=&priority=&tag=`) / création |
| GET | `/api/tasks/mine` | Tâches assignées à l'utilisateur |
| GET / PUT / DELETE | `/api/tasks/:id` | Détail / modification / suppression |
| PATCH | `/api/tasks/:id/move` | Déplacement Kanban `{status, index}` |
| POST | `/api/tasks/:id/comments` | Ajouter un commentaire |
| DELETE | `/api/tasks/:id/comments/:commentId` | Supprimer un commentaire |

Exemple :

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"alice@acme.test","password":"TaskFlow2026!"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')
curl -s localhost:3000/api/projects -H "Authorization: Bearer $TOKEN"
```

---

## 5. Arborescence

```
.
├── compose.yml            # services mongo + app
├── Dockerfile             # image de l'application
├── .env                   # configuration (connexion MongoDB, secrets…)
├── package.json / package-lock.json
├── src/
│   ├── server.js          # point d'entrée Express
│   ├── config.js          # lecture de la configuration (variables d'environnement)
│   ├── db.js              # connexion MongoDB avec tentatives
│   ├── models.js          # schémas Mongoose + index
│   ├── lib.js             # authentification, isolation multi-entreprise, utilitaires
│   ├── seed.js            # données de démonstration
│   └── routes/            # auth, company, users, projects, tasks
├── public/                # front-end (index.html, app.js, style.css)
├── scripts/               # utilitaires (ex. génération des PDF)
└── docs/                  # spécifications technique et fonctionnelle (Markdown et PDF)
    ├── SPECIFICATION_FONCTIONNELLE.md / .pdf
    └── SPECIFICATION_TECHNIQUE.md / .pdf
```
