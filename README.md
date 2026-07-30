# TimePick — Système de réservation

Plateforme web moderne permettant d'organiser la couverture participative d'événements associatifs : les membres visualisent les créneaux disponibles, réservent leur participation et gèrent leurs réservations depuis une interface mobile-first.

[![CI](https://github.com/timepick-app/timepick/actions/workflows/ci.yml/badge.svg)](https://github.com/timepick-app/timepick/actions/workflows/ci.yml) [![License: FSL-1.1-MIT](https://img.shields.io/badge/License-FSL--1.1--MIT-blue.svg)](LICENSE) [![Site officiel : timepick.app](https://img.shields.io/badge/Site_officiel-timepick.app-3f7963.svg)](https://timepick.app)


---

## 🎯 Aperçu

TimePick aide les associations à organiser la participation à leurs événements. Un admin crée des événements multi-créneaux, y génère des créneaux avec capacité configurable, invite des membres par email via un magic link (sans mot de passe), et suit le taux de remplissage depuis un dashboard analytique. Les membres réservent ou annulent leurs créneaux depuis un calendrier interactif.

Points forts : gestion **multi-événements** avec workflow brouillon → publié, authentification **sans mot de passe**, interface **mobile-first**.

---

## ✨ Fonctionnalités clés

### Essentielles

- **Multi-événements** — création d'événements avec workflow brouillon (`is_published=false`) → publié, date d'ouverture des inscriptions (`opens_at`), duplication en un clic, description en **texte riche** (TipTap : gras, italique, liens).
- **Authentification sans mot de passe** — connexion par magic link envoyé par email ; durées de validité et de session configurables par rôle (`admin` / `user`).
- **Réservation de créneaux** — capacité configurable par créneau, réservation atomique anti-surbooking (verrou PostgreSQL `SELECT … FOR UPDATE` + contrainte d'unicité), annulation libre.
- **Espace membre** — calendrier des créneaux (vue publique ou membre connecté), **filtres par heure du jour, disponibilité et « mes réservations »**, réservation/annulation en temps quasi réel (polling), agenda personnel `/me` (prochains créneaux, heures réalisées, créneaux disponibles).
- **Invitations par événement** — envoi groupé de magic links, suivi de statut par invité (envoyée / cliquée / échec), relance unitaire et relance ciblée des invitations sans réponse depuis plus de 3 jours.
- **Éditeur d'emails visuel** — éditeur GrapesJS/MJML pour **9 modèles d'email** (invitation + 8 emails système), personnalisation en cascade sur 3 niveaux (marque → modèle → événement), identité visuelle (logo, couleurs, police), upload d'images, modèle d'invitation surchargeable par événement.
- **Dashboard analytique** — indicateurs clés (KPI), graphique temporel des réservations (granularités et vues cumulée/incrémentale), entonnoir d'invitation, zone « à traiter », guide d'amorçage.
- **Gestion des utilisateurs** — CRUD complet (`first_name`, `last_name`, email…), recherche/filtre/pagination, import CSV avec **mode dry-run** (validation sans écriture) et export ré-importable, **protection du dernier admin** (suppression et rétrogradation bloquées).
- **Codes de secours** — connexion de secours pour l'admin sans accès email : codes affichés à l'écran une seule fois, jamais envoyés par email.
- **Configuration initiale guidée** — assistant de première utilisation (setup wizard) pour configurer le serveur d'email puis créer le premier admin.
- **Design mobile-first** — interface responsive construite avec Tailwind CSS.

### Compléments

- Configuration SMTP depuis l'interface (Paramètres → Serveur d'email).
- Notifications automatiques par email aux moments clés (réservation, annulation de créneau, désinscription, changement de rôle, création de compte) ; l'annulation d'un créneau déjà réservé est un **soft-delete** qui préserve l'historique et notifie les réservants.
- Intervalles de polling, durées de magic link et de session entièrement configurables.
- Avertissement d'expiration de session côté client.
- Limitation de débit (rate limiting) sur les endpoints sensibles.

---

## 🛠️ Stack technique

| Couche | Technologie |
|---|---|
| Frontend | React 19 · TypeScript 5.9 · Vite 7 |
| Routing & état serveur | React Router 7 · TanStack Query 5 |
| UI | Tailwind CSS 3.4 · Radix UI (shadcn/ui) · Lucide |
| Calendrier | FullCalendar 6 |
| Graphiques | Recharts 3 |
| Éditeur d'emails | GrapesJS + grapesjs-mjml |
| Éditeur de texte riche | TipTap 3 |
| Backend | Express 5 · TypeScript 5.9 (Node.js 22) |
| Base de données | PostgreSQL 16+ (17 en production) |
| Emails | Nodemailer 7 · MJML 5 (intercepteur SMTP local en dev) |
| Validation | Zod 4 |
| Images | Sharp (traitement du logo) |
| Tests | Vitest · Jest · Playwright |
| Qualité | Knip · ESLint · Husky + lint-staged |
| Monorepo | npm workspaces (`client` / `server` / `shared`) |

---

## 📁 Structure du projet

```text
timepick/
├── client/                 # Frontend React (Vite)
│   └── src/
│       ├── components/      # Composants (admin/, public/, ui/ shadcn, email-editor/…)
│       ├── pages/           # Pages routées (admin/, member/…)
│       ├── hooks/           # Hooks React
│       ├── services/        # Client API (axios)
│       ├── lib/             # Utilitaires (peaks.ts, dashboard.ts…)
│       ├── providers/       # Providers (auth, query…)
│       └── types/
├── server/                 # Backend Express
│   ├── src/
│   │   ├── controllers/    # Handlers de requêtes
│   │   ├── routes/         # Routes API
│   │   ├── services/       # Logique métier
│   │   ├── middleware/     # Auth, rate limiting…
│   │   ├── validators/     # Schémas Zod
│   │   ├── db/             # Accès DB, advisory locks
│   │   ├── migrations/     # Migrations SQL (001→038)
│   │   ├── config/         # Constantes (identité email…)
│   │   ├── migrate.ts      # Runner de migrations
│   │   └── index.ts
│   └── scripts/            # Scripts (create-admin, seed…)
├── shared/                 # Types & constantes partagés (@timepick/shared)
├── tests/e2e/              # Tests Playwright
├── scripts/                # Scripts racine (changelog, design system…)
├── Dockerfile              # Build multi-stage (production)
└── package.json            # npm workspaces (client / server / shared)
```

---

## 🚀 Démarrage rapide

### Prérequis

- **Node.js** ≥ 20.19 ou ≥ 22.12 (22.x LTS recommandé, version de production)
- **PostgreSQL** 16+
- **Un intercepteur SMTP local** *(optionnel)* — Mailpit par exemple, pour consulter les emails en développement

### 1. Cloner & installer

```bash
git clone https://github.com/timepick-app/timepick.git
cd timepick
npm install
```

> `npm install` à la racine installe les dépendances des trois workspaces (`client`, `server`, `shared`) en une seule commande. Ne pas faire d'installation séparée par dossier.

### 2. Base de données

Copier le fichier d'exemple et le renseigner :

```bash
cp server/.env.example server/.env
# Éditer server/.env : DATABASE_URL (obligatoire) ; JWT_SECRET, ENCRYPTION_KEY (optionnels — voir ci-dessous)…
```

> ℹ️ `JWT_SECRET` et `ENCRYPTION_KEY` sont **optionnels** : absents, ils sont générés automatiquement au premier démarrage du serveur et stockés dans `server/data/` ; **recommandés en variables d'environnement en production** (une variable d'environnement valide a toujours priorité sur le fichier généré). Pour les gérer soi-même dès le départ (optionnel), générer des secrets forts (chaînes hexadécimales de 64 caractères) :

```bash
openssl rand -hex 32   # → JWT_SECRET
openssl rand -hex 32   # → ENCRYPTION_KEY
```

Initialiser la base et appliquer les migrations :

```bash
cd server
npm run init-db   # crée la base + l'extension uuid-ossp
npm run migrate   # applique les 38 migrations SQL
```

> ℹ️ La création de l'extension `uuid-ossp` peut nécessiter des droits élevés selon l'installation PostgreSQL. En cas d'erreur `permission denied to create extension`, accorder le privilège (`psql -c "ALTER USER <user> SUPERUSER"`) ou pré-installer l'extension.

### 3. Lancer en développement

Depuis la racine du projet :

```bash
npm run dev
```

Démarre **3 processus** en parallèle :

| Processus | URL |
|---|---|
| SHARED (build watch) | — |
| CLIENT (Vite) | http://localhost:5173 |
| SERVER (Express) | http://localhost:3000 |

Pour démarrer un processus individuellement : `npm run dev:client` ou `npm run dev:server` (sur un clone neuf, compiler d'abord le package partagé une fois avec `npm run build:shared` — `npm run dev` le fait automatiquement).

### 4. (Optionnel) Un intercepteur SMTP local

En développement, quand aucun SMTP n'est configuré, TimePick envoie les emails sur `127.0.0.1:1025`. Tout intercepteur SMTP écoutant sur ce port convient (Mailpit, MailCatcher, MailDev…) ; les exemples ci-dessous utilisent **Mailpit**, l'outil exercé sur l'instance de référence.

**Via Homebrew :**

```bash
brew install mailpit
brew services start mailpit
```

**Via Docker :**

```bash
docker run -p 1025:1025 -p 8025:8025 axllent/mailpit
```

Interface web : http://localhost:8025

**Via le compose de dev (fourni, opt-in) :**

```bash
npm run mail       # démarre Mailpit et attend son healthcheck (--wait)
npm run mail:stop  # arrête le conteneur
```

Interface web identique : http://localhost:8025. Le service est **opt-in** (profil `mail` de `compose.dev.yaml`) : il ne démarre jamais avec `npm run dev`. Si les ports 1025/8025 sont déjà pris par un binding IPv4 (typiquement `docker run -p 1025:1025 …`), `npm run mail` échoue avec `port is already allocated` — c'est attendu : gardez alors votre intercepteur existant sans activer le profil. (Sur macOS, un Mailpit lancé via Homebrew écoute en IPv6 et peut coexister sans erreur avec le service compose, lié en IPv4 loopback.)

---

## ⚙️ Configuration initiale (première utilisation)

Au premier démarrage, aucun compte admin n'existe. L'application détecte automatiquement cet état et guide la configuration.

### Flux de l'assistant de configuration

1. **Détection automatique** — l'app appelle `GET /api/setup/status` ; si aucun admin n'existe, elle redirige vers `/setup`.

2. **Assistant multi-étapes** :
   - **(a)** Configuration du **serveur d'email (SMTP)**
   - **(b)** Saisie du **prénom, nom et email** du premier admin
   - **(c)** Confirmation

3. **Lien d'amorçage** — `POST /api/setup/create-admin` envoie un email contenant un **lien bootstrap** (JWT, valable **24 h**) qui transporte les noms saisis. ⚠️ Le compte admin n'est **pas** créé à cette étape.

4. **Création atomique** — au clic sur le lien, l'admin est créé de façon atomique (transaction PostgreSQL + advisory lock empêchant toute création simultanée d'un second admin), puis redirection vers le dashboard.

### Sécurité

- Une fois un admin existant, `/setup` renvoie **404** (pas de divulgation d'état).
- Le lien bootstrap expire après **24 h**.
- Après la première connexion, l'admin est invité à générer ses **codes de secours** (Paramètres → Authentification).

### Alternative CLI

Pour créer un admin sans passer par l'interface (le script se connecte directement à la base — inutile de démarrer le serveur) :

```bash
cd server
npm run create-admin
```

Le script est **interactif** : il demande l'email, puis — seulement s'il faut créer le compte — le prénom (requis) et le nom (facultatif). Un utilisateur déjà en base est simplement promu, son identité est préservée. L'email peut être passé en argument (`npm run create-admin -- admin@exemple.com`) : il pré-remplit alors la première question.

Pour les détails, voir [`https://docs.timepick.app/installation/installation-locale.html`](https://docs.timepick.app/installation/installation-locale.html).

---

## 📚 Documentation de l'API

**URL de base :** `http://localhost:3000/api`

**Authentification :** la plupart des endpoints requièrent l'en-tête `Authorization: Bearer <token>` (token JWT de session). Deux rôles : `admin` et `user`.

### Authentification (`/api/auth`)

| Méthode + chemin | Rôle | Description |
|---|---|---|
| `POST /auth/login` | public | Demande un magic link par email (réponse générique volontaire : anti-énumération) |
| `POST /auth/verify` | public | Vérifie le magic link et ouvre une session |
| `POST /auth/refresh` | `user` / `admin` | Prolonge la session active |
| `POST /auth/emergency-login` | public | Connexion de secours par code (rate-limité) |
| `POST /auth/resend-invitation` | public | Renvoie une invitation |

### Configuration initiale (`/api/setup`)

Accessible tant qu'aucun admin n'existe. Renvoie 404 ensuite.

| Méthode + chemin | Rôle | Description |
|---|---|---|
| `GET /setup/status` | public | Retourne `{ needsSetup }` |
| `POST /setup/create-admin` | public | Envoie le lien bootstrap du premier admin |

### Espace public / membre

| Méthode + chemin | Rôle | Description |
|---|---|---|
| `GET /public/events/:uuid/slots` | public | Créneaux d'un événement |
| `POST /public/reservations` | `user` | Réserver un créneau (`{ slotId }`) |
| `DELETE /public/reservations/by-slot/:slotId` | `user` | Annuler une réservation |
| `GET /me/events` | `user` | Événements de l'utilisateur connecté |
| `GET /me/slots` | `user` | Créneaux réservés |
| `GET /me/available-slots` | `user` | Créneaux disponibles |
| `GET /me/profile` | `user` | Consulter son profil |
| `PATCH /me/profile` | `user` | Modifier son profil |

### Administration (`/api/admin`, rôle `admin`)

| Méthode + chemin | Description |
|---|---|
| `GET /admin/dashboard` · `GET /admin/stats` · `GET /admin/analytics/…` | Dashboard KPI et analytics (bookings-raw, engagement, event-activity) |
| `GET/POST /admin/users` · `GET/PUT/DELETE /admin/users/:id` | CRUD utilisateurs |
| `POST /admin/users/bulk-delete` · `POST /admin/users/import` · `GET /admin/users/export` | Opérations groupées (import/export CSV, suppression en masse) |
| `GET/POST /admin/events` · `PUT/DELETE /admin/events/:id` | CRUD événements (publish/unpublish, duplication, date d'ouverture) |
| `GET/POST /admin/events/:id/slots` | Gestion des créneaux d'un événement |
| `GET /admin/events/:id/users` · `POST /admin/events/:id/invitations/send` | Membres et invitations (envoi, relance, relance sans réponse, suivi statut) |
| `GET/PATCH /admin/events/:id/email-template` | Modèle d'email par événement |
| `GET /admin/events/:id/export/reservations` | Export CSV des réservations |
| `GET/PUT /admin/settings/smtp` · `GET/PATCH /settings/email-brand` · `GET/PATCH /settings/email-templates` | Paramètres SMTP, identité visuelle, modèles d'email |
| `GET/PUT /admin/config/…` | Configuration (polling, TTL magic link / session) |
| `PUT/DELETE /admin/shell-parts/:ownerKind/:ownerId/:partKind` | Parties d'enveloppe email MJML (cascade marque/modèle/événement) |
| `GET/POST /admin/recovery-codes/…` | Codes de secours |
| `GET /admin/cancellation-notifications` · `POST /admin/cancellation-notifications/resend` | Notifications d'annulation de créneaux |
| `POST /uploads/email-image` | Upload d'image pour les emails (admin, max 5 Mo) — retourne une URL absolue |

> Extrait représentatif — pour la liste exhaustive, consulter les fichiers dans `server/src/routes/`.

### Exemple de réponse — enveloppe `data`

Toutes les réponses de succès utilisent l'enveloppe `{ "data": … }`. Exemple après `POST /auth/verify` :

```json
{
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
    "sessionTTL": 7200,
    "user": {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "email": "alice@example.com",
      "firstName": "Alice",
      "lastName": "Dupont",
      "role": "user",
      "hasMemberAccess": true
    }
  }
}
```

> Les réponses de succès sont converties en `camelCase` par un middleware global. Le champ `hasMemberAccess` vaut `true` si l'utilisateur est invité sur au moins un événement — il ouvre l'accès à l'espace membre `/me`.

---

## 🗄️ Base de données & migrations

### Système de migrations

Les migrations SQL sont numérotées de `001` à `038` et stockées dans `server/src/migrations/`. Le runner `server/src/migrate.ts`, invoqué via `npm run migrate`, les applique dans l'ordre séquentiel. Le suivi est assuré par la table `schema_migrations` (une ligne par migration appliquée). Un advisory lock PostgreSQL est posé au démarrage pour empêcher toute exécution concurrente.

```bash
cd server
npm run migrate   # applique les migrations non encore exécutées
```

### Tables principales

| Table | Rôle |
|---|---|
| `users` | Comptes utilisateurs (`email`, `first_name`, `last_name`, `phone`, `role`, `profession`, `informations`, token magic link) |
| `events` | Événements (`name`, `description`, `is_published`, `opens_at`, date de fin, `invitation_mjml`) |
| `event_users` | Rattachement `user` ↔ événement (accès membre) |
| `slots` | Créneaux (`event_id`, `start_time`, `end_time`, `capacity`, `cancelled_at` — soft delete) |
| `bookings` | Réservations (`slot_id`, `user_id` — unicité par couple ; `cancellation_notified_at`) |
| `invitations` | Suivi des invitations (statut `sent`/`clicked`/`failed`, `send_count`, unicité `event_id`+`user_id`) |
| `app_config` | Configuration applicative (intervalle de polling, TTL magic link/session, métadonnées organisation) |
| `email_templates` | Modèles d'email éditables (9 types) |
| `shell_parts` | Parties MJML d'enveloppe email (cascade marque → modèle → événement) |
| `email_brand_settings` | Identité visuelle des emails (logo, couleurs, police) |
| `admin_recovery_codes` | Codes de secours hachés bcrypt |
| `recovery_audit_log` | Journal d'audit des utilisations de codes de secours |
| `schema_migrations` | Suivi des migrations appliquées |

Pour le détail des migrations (DDL, ordre, historique), voir [`https://docs.timepick.app/reference/modele-de-donnees.html`](https://docs.timepick.app/reference/modele-de-donnees.html).

---

## 🔒 Variables d'environnement

### Serveur (`server/.env` — copier depuis `server/.env.example`)

| Variable | Description | Requis | Défaut |
|---|---|---|---|
| `DATABASE_URL` | Chaîne de connexion PostgreSQL | **Oui** | — |
| `JWT_SECRET` | Secret de signature JWT | Non \* | *(auto-généré)* |
| `ENCRYPTION_KEY` | Clé de chiffrement AES (32 octets = 64 caractères hex) pour le mot de passe SMTP stocké en base | Non \* | *(auto-généré)* |
| `PORT` | Port d'écoute du serveur Express | Non | `3000` |
| `APP_URL` | URL de base du frontend — utilisée pour construire les magic links et les CTA dans les emails ⚠️ variable **serveur** | Non | `http://localhost:5173` |
| `EMAIL_FROM` | Adresse d'expéditeur — **effective en développement/test uniquement** ; ignorée en production (voir `SMTP_FROM_EMAIL`, provisionnement initial) | Non | `noreply@example.com` |
| `SMTP_HOST` | Hôte du serveur SMTP — **déclencheur du provisionnement initial** : sans elle, tout le bloc `SMTP_*` ci-dessous est ignoré | Non | — |
| `SMTP_PORT` | Port SMTP (provisionnement initial) | Non | — |
| `SMTP_SECURE` | TLS activé — `true`/`false` (provisionnement initial) | Non | — |
| `SMTP_USER` | Identifiant SMTP (provisionnement initial) | Non | — |
| `SMTP_PASSWORD` | Mot de passe SMTP (provisionnement initial) | Non | — |
| `SMTP_FROM_NAME` | Nom d'expéditeur affiché (provisionnement initial) | Non | — |
| `SMTP_FROM_EMAIL` | Adresse d'expéditeur SMTP (provisionnement initial) | Non | — |
| `PUBLIC_BASE_URL` | URL publique de base pour les liens absolus des images d'email (derrière un reverse proxy / CDN) | Non | *(déduit de la requête)* |
| `ALLOW_TEST_ROUTES` | Active les routes de test E2E (`/api/test/*`) — **hors production uniquement** | Non | `false` |

> \* `JWT_SECRET` et `ENCRYPTION_KEY` sont **optionnels** : absents au premier démarrage, ils sont générés automatiquement (32 octets aléatoires, 64 caractères hex) et stockés dans `server/data/` (`jwt.secret`, `encryption.key`, permissions `0600`). **Recommandé de les définir en variables d'environnement en production** — une variable d'environnement valide a toujours priorité sur le fichier généré (avertissement loggé si les deux existent). `server/data/` doit alors être un **volume persistant** en production (comme `server/uploads`) : sans cela, les clés sont régénérées à chaque recréation du conteneur, ce qui invalide les sessions actives et rend le mot de passe SMTP stocké en base indéchiffrable. La variable `DATA_DIR` permet de changer ce répertoire (défaut `<server>/data`, soit `/app/server/data` sous Docker).

> **Note SMTP — provisionnement initial :** les variables `SMTP_*` ne servent qu'au **démarrage initial**. Au premier lancement, `prepare-db` les copie en base de données ; ensuite, la configuration SMTP se gère **dans l'application** (Paramètres → Serveur d'email) et le runtime lit directement la base. En développement, si aucun SMTP n'est configuré, le système bascule automatiquement sur **un intercepteur SMTP local** (`127.0.0.1:1025`, ex. Mailpit).

> ⚠️ **Sécurité — `ALLOW_TEST_ROUTES`** : cette variable expose des endpoints destructeurs utilisés uniquement par les tests E2E (réinitialisation de base, création de données fictives, etc.). Ne **jamais** la passer à `true` en production.

### Client (`client/.env` ou `client/.env.local`)

| Variable | Description | Requis | Défaut |
|---|---|---|---|
| `VITE_API_URL` | URL complète de l'API backend | Non | `http://localhost:3000/api` |
| `VITE_POLLING_INTERVAL` | Intervalle de rafraîchissement (ms) des créneaux publics via TanStack Query | Non | `30000` |

---

## 🧪 Tests

TimePick dispose de trois suites de tests complémentaires. Pour la configuration détaillée, les variables requises et les stratégies de test, voir [`https://docs.timepick.app/exploitation/tests-et-qualite.html`](https://docs.timepick.app/exploitation/tests-et-qualite.html).

| Suite | Outil | Commande (racine) |
|---|---|---|
| **Frontend** | Vitest + React Testing Library | `npm run test:client` |
| **Backend** | Jest + Supertest (3 projets : `unit`, `integration`, `migrations`) | `npm run test:server` |
| **E2E** | Playwright (`tests/e2e/`) | `npm run test:e2e` |
| **Tout** | Client + serveur | `npm test` |

**Notes :**

- Le backend nécessite un fichier `server/.env.test` avec une base dédiée (`timepick_test`) ; voir `server/.env.example` pour le contenu minimal. L'utilisateur PostgreSQL doit posséder le privilège `CREATEDB` (`psql -c "ALTER USER <user> CREATEDB"`).
- Les tests E2E ne nécessitent PAS de démarrer le serveur manuellement : Playwright lance automatiquement client et serveur (`reuseExistingServer` en local). Positionner `ALLOW_TEST_ROUTES=true` dans `server/.env`, et installer les navigateurs à la première exécution : `npx playwright install chromium`.
- Variantes Playwright disponibles : `npm run test:e2e:ui` (interface graphique), `npm run test:e2e:report` (rapport HTML).

---

## 📦 Scripts

### Racine

| Script | Description |
|---|---|
| `dev` | Lance les 3 processus en parallèle : SHARED (build watch) + CLIENT (Vite) + SERVER (Express) |
| `dev:client` | Démarre uniquement le frontend Vite |
| `dev:server` | Démarre uniquement le serveur Express |
| `dev:shared` | Build watch du package partagé |
| `build` | Build de production (shared + client + server) |
| `build:client` | Build Vite du frontend |
| `build:server` | Compilation TypeScript du serveur |
| `build:shared` | Compilation du package partagé |
| `test` | Lance les tests client et serveur |
| `test:client` | Tests Vitest du frontend |
| `test:server` | Tests Jest du backend |
| `test:e2e` | Tests Playwright |
| `test:e2e:ui` | Tests Playwright en mode interface graphique |
| `test:e2e:report` | Affiche le rapport HTML des derniers tests Playwright |
| `verify:mjml-strict` | Vérifie la conformité MJML de tous les templates |
| `knip` | Détecte les exports, fichiers et dépendances inutilisés |
| `cleanup` | Tue les processus `vitest` résiduels (préserve les serveurs de dev en cours) |

> ⚠️ **Ce dépôt est une vitrine en lecture seule** ; le développement actif se fait dans un dépôt privé. Certains scripts mainteneur (`npm run changelog`, `npm run generate:ds`) écrivent vers un dossier de documentation interne absent de ce clone — ils n'ont pas vocation à tourner depuis ce dépôt public.


### Serveur (`cd server`)

| Script | Description |
|---|---|
| `dev` | Serveur Express en mode développement (hot-reload) |
| `build` | Compilation TypeScript |
| `start` | Démarre le serveur compilé (`node dist/index.js`) |
| `init-db` | Crée la base de données et l'extension `uuid-ossp` |
| `migrate` | Applique toutes les migrations SQL en attente |
| `prepare-db` | Bootstrap idempotent : migrations + provisionnement SMTP/config (utilisé au démarrage conteneur) |
| `create-admin` | Script interactif : crée un admin (prénom/nom demandés) ou promeut un utilisateur existant |
| `seed` | Peuple la base avec des données de développement |
| `seed:500-slots` | Génère 500 créneaux pour les tests de performance |
| `verify:mjml-strict` | Vérifie la conformité MJML des templates |
| `test` | Lance les 3 projets Jest (unit, integration, migrations) |
| `test:watch` | Tests en mode watch |
| `test:coverage` | Rapport de couverture de code |

### Client (`cd client`)

| Script | Description |
|---|---|
| `dev` | Serveur Vite de développement |
| `build` | Build de production Vite |
| `preview` | Prévisualisation locale du build de production |
| `lint` | ESLint sur le code source |
| `test` | Tests Vitest |
| `test:watch` | Tests en mode watch |
| `test:coverage` | Rapport de couverture Vitest |
| `test:e2e` | Tests Playwright (alias) |
| `test:e2e:ui` | Tests Playwright en mode interface graphique |

---

## 🚢 Déploiement

### Build de production

```bash
npm run build
```

Compile dans l'ordre : `shared` → `client` (sortie : `client/dist/`) → `server` (sortie : `server/dist/`).

### Docker

Un `Dockerfile` **multi-stage** est fourni à la racine :

1. **Stage build client** — compilation Vite du frontend.
2. **Stage build server** — compilation TypeScript du backend.
3. **Stage deps production** — installation des dépendances Node.js uniquement nécessaires au runtime.
4. **Stage runtime** — image `node:22-bookworm-slim` ; le serveur Node sert le SPA compilé **et** l'API sur le même port.

Au démarrage du conteneur, `prepare-db` est exécuté (bootstrap idempotent : migrations + provisionnement SMTP/config), puis le serveur est lancé.

```bash
# Construire l'image
docker build -t timepick .

# Lancer le conteneur
docker run -p 3000:3000 --env-file server/.env -v timepick-data:/app/server/data -v timepick-uploads:/app/server/uploads timepick
```

> ⚠️ Dans le conteneur, `localhost` désigne le conteneur lui-même : `DATABASE_URL` doit pointer vers un PostgreSQL joignable. Sur macOS/Windows, utiliser `host.docker.internal` ; sur Linux, l'IP de l'hôte ou un réseau Docker partagé. En production, la base est fournie par Coolify.

> ⚠️ **Volume persistant `server/data/`** — indispensable en production, au même titre que `server/uploads` : c'est là que `JWT_SECRET`/`ENCRYPTION_KEY` sont écrits s'ils sont auto-générés (absents de l'environnement). Sans volume persistant, ces clés sont régénérées à chaque recréation du conteneur (ex. redeploy Coolify) → mot de passe SMTP stocké en base indéchiffrable et sessions/magic-links invalidés.

### Coolify

TimePick est déployé en production sur un VPS via **Coolify** (conteneur unique : le serveur Node sert le SPA et l'API sur le même port ; PostgreSQL managé séparément). L'intégration continue est assurée par GitHub Actions (`.github/workflows/ci.yml`).

Pour le guide de déploiement complet (configuration Coolify, variables d'environnement de production, HTTPS), voir [`https://docs.timepick.app/installation/deploiement-coolify-vps.html`](https://docs.timepick.app/installation/deploiement-coolify-vps.html).

---

## 📖 Documentation

| Document | Description |
|---|---|
| [`https://docs.timepick.app/installation/installation-locale.html`](https://docs.timepick.app/installation/installation-locale.html) | Configuration initiale et première utilisation |
| [`https://docs.timepick.app/installation/deploiement-coolify-vps.html`](https://docs.timepick.app/installation/deploiement-coolify-vps.html) | Guide de déploiement (Docker, Coolify, variables de production) |
| [`https://docs.timepick.app/reference/modele-de-donnees.html`](https://docs.timepick.app/reference/modele-de-donnees.html) | Système de migrations SQL — détail des 38 migrations |
| [`https://docs.timepick.app/exploitation/tests-et-qualite.html`](https://docs.timepick.app/exploitation/tests-et-qualite.html) | Documentation des suites de tests et configuration |

---

## 🤝 Contribution

1. Forker le dépôt et créer une branche `feature/ma-fonctionnalite`.
2. Effectuer les modifications en suivant les conventions du projet (TypeScript strict, Zod pour la validation, patterns existants).
3. Vérifier que les tests passent : `npm test` (client + serveur) et, si pertinent, `npm run test:e2e`.
4. Ouvrir une Pull Request avec une description claire des changements et de la motivation.

---

## 📄 Licence

Ce projet est distribué sous la **Functional Source License 1.1 (MIT Future License)** — une licence *Fair Source*, pas une licence open source au sens strict de l'OSI. Concrètement :

- Téléchargement, installation et usage personnel ou interne sur ton propre serveur : **gratuit, sans restriction**.
- Usage interdit sans accord commercial : héberger ce logiciel (ou un dérivé) pour en revendre l'accès à des tiers en concurrence avec TimePick.
- Chaque version bascule automatiquement en licence **MIT** deux ans après sa publication.

Voir le fichier [`LICENSE`](LICENSE) pour le texte complet.

---

## 🙏 Remerciements

TimePick a été conçu pour les **associations** et associations de parents d'élèves (**APE**) en France, qui ont besoin d'un outil simple et moderne pour organiser la participation bénévole à leurs événements.

Ce projet est né du besoin de remplacer des outils de réservation vieillissants tels que **Framadate**, en proposant une expérience mobile-first adaptée aux réalités des associations françaises.
