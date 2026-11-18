# TaskFlow — Spécification fonctionnelle

## 1. Présentation

TaskFlow est un outil de gestion de projet proposé en SaaS, inspiré de Trello, Notion et ClickUp. Une même plateforme accueille plusieurs entreprises clientes. Chacune dispose de son espace privé où ses équipes organisent leurs projets et suivent leurs tâches sur un tableau Kanban.

**Objectifs**

- Centraliser projets, équipes et tâches d'une entreprise.
- Visualiser l'avancement en un coup d'œil grâce au Kanban.
- Garantir qu'aucune entreprise ne puisse voir ou modifier les données d'une autre.

## 2. Acteurs et rôles

| Rôle | Description |
|---|---|
| **Visiteur** | Personne non connectée : peut se connecter ou créer une entreprise. |
| **Propriétaire** (owner) | Créateur de l'entreprise. Tous les droits, dont la suppression de l'entreprise et la gestion des rôles. Un seul par entreprise. |
| **Administrateur** (admin) | Gère les utilisateurs (sauf le propriétaire), tous les projets et toutes les tâches de l'entreprise. |
| **Membre** (member) | Voit uniquement les projets dont il est membre ; crée, modifie, déplace et commente les tâches de ces projets. |

## 3. Fonctionnalités

### 3.1 Authentification

| ID | Fonctionnalité | Règles |
|---|---|---|
| F-AUTH-1 | Créer une entreprise | Formulaire : nom de l'entreprise, nom, e-mail, mot de passe conforme ANSSI (12 caractères min., majuscule, minuscule, chiffre, symbole avec retour visuel en temps réel). Crée l'entreprise et son propriétaire, puis connecte l'utilisateur. |
| F-AUTH-2 | Se connecter | E-mail + mot de passe. Message générique en cas d'échec (pas d'indication sur l'existence du compte). Un compte désactivé ne peut pas se connecter. |
| F-AUTH-3 | Se déconnecter | Bouton dans la barre latérale. |
| F-AUTH-4 | Session | Valable 8 h (configurable). À l'expiration, retour automatique à l'écran de connexion. |

### 3.2 Entreprise

| ID | Fonctionnalité | Rôle requis |
|---|---|---|
| F-ENT-1 | Consulter l'entreprise et ses statistiques (membres, projets actifs, tâches, tâches ouvertes) | tous |
| F-ENT-2 | Modifier le nom et le plan (free / pro / enterprise) | owner, admin |
| F-ENT-3 | Supprimer l'entreprise et **toutes** ses données (utilisateurs, projets, tâches, activité). Confirmation par saisie du mot « SUPPRIMER ». | owner |

### 3.3 Utilisateurs (page « Équipe »)

| ID | Fonctionnalité | Rôle requis | Règles |
|---|---|---|---|
| F-USR-1 | Lister les membres de l'entreprise (nom, e-mail, poste, rôle, nombre de projets) | tous | |
| F-USR-2 | Ajouter un utilisateur | owner, admin | E-mail unique sur la plateforme ; mot de passe initial fourni. Seul le propriétaire peut créer un admin. L'utilisateur est automatiquement rattaché à l'entreprise du créateur. |
| F-USR-3 | Modifier un utilisateur (nom, e-mail, poste, mot de passe) | owner, admin | Un admin ne peut pas modifier le propriétaire. |
| F-USR-4 | Changer le rôle membre ↔ admin | owner | Le rôle propriétaire n'est pas transférable. |
| F-USR-5 | Désactiver / réactiver un compte | owner, admin | On ne peut pas se désactiver soi-même. |
| F-USR-6 | Supprimer un utilisateur | owner, admin | Impossible pour le propriétaire et pour soi-même. Il est retiré de tous les projets et ses tâches deviennent « non assignées ». |

### 3.4 Projets

| ID | Fonctionnalité | Rôle requis | Règles |
|---|---|---|---|
| F-PRJ-1 | Lister les projets (barre latérale + tableau de bord avec barre d'avancement) | tous | Un membre ne voit que ses projets. |
| F-PRJ-2 | Créer un projet : nom, description, couleur, dates de début et de fin, membres, colonnes | owner, admin | Le créateur est automatiquement membre. Colonnes par défaut : À faire, En cours, En revue, Terminé. |
| F-PRJ-3 | Modifier un projet | owner, admin | |
| F-PRJ-4 | Assigner / retirer des membres | owner, admin | Uniquement des utilisateurs de la même entreprise. Un membre retiré est désassigné de ses tâches du projet. |
| F-PRJ-5 | Personnaliser les colonnes du Kanban : ajouter, renommer, colorer, réordonner, supprimer | owner, admin | 2 à 10 colonnes. La dernière colonne vaut « terminé ». Une colonne contenant des tâches ne peut pas être supprimée. |
| F-PRJ-6 | Archiver / réactiver un projet | owner, admin | Un projet archivé disparaît de la barre latérale mais reste accessible depuis le tableau de bord. |
| F-PRJ-7 | Supprimer un projet et toutes ses tâches | owner, admin | Confirmation demandée. |
| F-PRJ-8 | Consulter l'activité du projet | membres du projet | 50 derniers événements. |

### 3.5 Tâches

| ID | Fonctionnalité | Règles |
|---|---|---|
| F-TSK-1 | Créer une tâche depuis le bouton « Ajouter une tâche » d'une colonne | Titre obligatoire. La tâche est placée en bas de la colonne choisie. |
| F-TSK-2 | Renseigner : description, statut, priorité (basse, moyenne, haute, urgente), assigné, échéance, étiquettes, checklist | L'assigné doit être membre du projet. 10 étiquettes max. |
| F-TSK-3 | Attribuer / désattribuer une tâche à un utilisateur | Liste limitée aux membres du projet. |
| F-TSK-4 | Modifier une tâche (clic sur la carte) | |
| F-TSK-5 | Changer le statut | Par la fenêtre de détail ou par glisser-déposer. |
| F-TSK-6 | Supprimer une tâche | Admins ou créateur de la tâche. |
| F-TSK-7 | Commenter une tâche ; supprimer son commentaire | Un admin peut supprimer tout commentaire. |
| F-TSK-8 | Checklist : ajouter, cocher, supprimer des sous-tâches | Avancement affiché sur la carte (ex. 1/3). |
| F-TSK-9 | Date de réalisation automatique | Une tâche entrant dans la dernière colonne est marquée terminée ; elle redevient ouverte si on la sort de cette colonne. |

### 3.6 Tableau Kanban

| ID | Fonctionnalité |
|---|---|
| F-KAN-1 | Afficher une colonne par statut, avec le nombre de tâches. |
| F-KAN-2 | Carte de tâche : étiquettes, titre, priorité (bordure colorée pour haute / urgente), échéance (en rouge si dépassée), avancement de la checklist, nombre de commentaires, avatar de l'assigné. |
| F-KAN-3 | Glisser-déposer une carte vers une autre colonne (change le statut) ou à une autre position (change l'ordre). L'ordre est enregistré. |
| F-KAN-4 | Filtrer : recherche par titre, par membre (ou « non assignées »), par priorité. |
| F-KAN-5 | Afficher les membres du projet en en-tête. |

### 3.7 Tableau de bord et suivi

| ID | Fonctionnalité |
|---|---|
| F-DSH-1 | Indicateurs : projets actifs, tâches ouvertes, tâches au total, nombre de membres. |
| F-DSH-2 | Liste des projets avec barre d'avancement (tâches terminées / total). |
| F-DSH-3 | « Mes tâches à venir » : tâches ouvertes assignées à l'utilisateur, triées par échéance. |
| F-DSH-4 | Activité récente de l'entreprise (qui a fait quoi, quand). |
| F-DSH-5 | Page « Mes tâches » : toutes les tâches ouvertes de l'utilisateur, tous projets confondus ; ouverture directe du détail. |

## 4. Exigences transverses

| ID | Exigence |
|---|---|
| E-1 **Isolation** | Un utilisateur n'accède jamais aux entreprises, utilisateurs, projets, tâches ou activités d'une autre entreprise, même en manipulant les URL ou les identifiants. Une ressource étrangère est traitée comme inexistante. |
| E-2 Sécurité | Mots de passe chiffrés (bcrypt), sessions signées et limitées dans le temps. |
| E-3 Déploiement | Lancement complet par `docker compose up -d --build`, sans autre installation que Docker. |
| E-4 Configuration | La connexion à la base se règle dans `.env`, sans toucher au code (préparation réplication / sharding). |
| E-5 Ergonomie | Interface en français, utilisable sur ordinateur et mobile, thème clair / sombre selon le système. |
| E-6 Persistance | Les données sont conservées entre deux redémarrages (volume Docker). |

## 5. Parcours types

**Création d'un espace**
1. Un responsable crée son entreprise depuis l'écran d'accueil.
2. Il ajoute ses collaborateurs dans « Équipe ».
3. Il crée un projet, choisit les membres et ajuste les colonnes.

**Travail quotidien d'un membre**
1. Il se connecte et consulte « Mes tâches à venir ».
2. Il ouvre le projet, fait glisser sa tâche de « À faire » à « En cours ».
3. Il coche les éléments de la checklist et laisse un commentaire.
4. Il dépose la tâche dans « Terminé » : elle est comptée dans l'avancement du projet.

**Vérification de l'isolation**
1. Alice (Acme) et Dave (Globex) se connectent chacun de leur côté.
2. Aucun ne voit les projets, tâches ou collègues de l'autre.
3. Un appel direct à l'API avec l'identifiant d'un projet de l'autre entreprise renvoie « Projet introuvable ».

## 6. Données de démonstration

Au premier lancement, deux entreprises sont créées (mot de passe `TaskFlow2026!`) :

- **Acme Corp** : Alice (propriétaire), Bob (admin), Chloé (membre) ; projets « Refonte du site web » et « Application mobile » avec des tâches dans tous les états.
- **Globex** : Dave (propriétaire) ; projet « Migration CRM ».

## 7. Pistes d'évolution

- Invitation des utilisateurs par e-mail.
- Notifications (assignation, commentaire, échéance proche).
- Pièces jointes sur les tâches.
- Vues complémentaires : liste, calendrier, diagramme de Gantt.
- Sous-tâches liées et dépendances entre tâches.
- Mises à jour en temps réel (WebSocket) quand plusieurs personnes travaillent sur le même tableau.
