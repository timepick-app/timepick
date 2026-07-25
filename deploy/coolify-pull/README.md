# Bascule Coolify : build local → image GHCR (pull), arm64

> **STATUT : NON PROUVÉ EN SESSION** (pas de compte Coolify ni de CLI disponibles ici) — kit prêt-à-lancer, à exécuter et vérifier manuellement par un opérateur humain.

> ⚠️ **À EXÉCUTER PAR OPS — ne pas lancer sur la prod sans feu vert explicite de Jensen.** Cette bascule touche l'app TimePick en production sur le VPS Oracle A1. **Lire tout le document, y compris « Le piège central » et « Rollback », avant de cliquer Deploy.** Une bascule naïve (sans les prérequis P1/P2 ci-dessous) **verrouille les admins** et fait disparaître les logos d'email — voir pourquoi juste en dessous.

---

## Contexte

Le VPS Oracle A1 tourne en **arm64** (Ampere). L'app TimePick y est aujourd'hui déployée en Coolify **Build Pack : Dockerfile** : à chaque déploiement, Coolify **compile l'image localement sur le VPS** (`npm ci`, `vite build`, `tsc`, bindings natifs `sharp`/`bcrypt`) — coûteux en RAM/CPU sur le tier gratuit contraint (limite **L5**).

Le chantier D (CI GitHub Actions, `.github/workflows/docker.yml`) publie désormais une image multi-arch (`amd64` + `arm64`) sur `ghcr.io/timepick-app/timepick` (tags `latest`, `<tag git, ex. v0.29.0>`, `sha-<court>`). En mode **pull**, Coolify tire la variante `arm64` déjà construite → le VPS **ne compile plus rien** (gain RAM/CPU, plus de risque d'OOM au déploiement).

---

## ⚠️ Le piège central : les volumes Coolify sont préfixés par l'UUID de la ressource

**Il n'existe pas de conversion « in-place » d'une app Git/Build-Pack en app « Docker Image ».** Passer en mode pull impose de **créer une nouvelle ressource** de type *Docker Image*. Or, d'après la [doc officielle Coolify (Persistent Storage)](https://coolify.io/docs/knowledge-base/persistent-storage), *« To prevent storage overlapping between resources, Coolify automatically adds the resource's UUID to the volume name. »*

Conséquence : une nouvelle ressource monte des **volumes NEUFS et VIDES**, même si vous leur donnez les mêmes noms (`timepick-uploads`, `timepick-data`) que l'ancienne. Au premier boot, sans précaution :

- `/app/server/data` vide → `secret-bootstrap.ts` **régénère** `JWT_SECRET`/`ENCRYPTION_KEY` → la nouvelle `ENCRYPTION_KEY` ne peut plus déchiffrer le mot de passe SMTP stocké en base → magic-links morts → **verrouillage admin** (désastre **L3**).
- `/app/server/uploads` vide → tous les logos d'email déjà référencés renvoient **404**.

**Ce kit neutralise ce piège en s'appuyant sur les chantiers A et B (déjà livrés)** : une fois les secrets promus en **variables d'env** (chantier B) et les uploads sur **S3** ou réattachés (chantier A), la ressource n'a plus d'état critique sur le disque local → la bascule vers une nouvelle ressource devient sûre. Les prérequis P1/P2 ci-dessous sont **obligatoires**, pas optionnels.

---

## Prérequis (dans l'ordre — NE PAS sauter)

### P1 — Promouvoir les secrets en variables d'env (chantier B) sur la ressource ACTUELLE

Avant toute bascule, exécuter la procédure **[« Migrer une installation existante : secrets disque → environnement »](https://docs.timepick.app/configuration/variables-environnement#migration-secrets)** sur l'app **actuelle** (Build Pack) : extraire `ENCRYPTION_KEY`/`JWT_SECRET` **en place**, les poser en env, Redeploy, puis vérifier `GET /api/admin/encryption-key` → `source:"env"` + **même fingerprint**, et une reconnexion par magic-link OK.

Effet : les secrets ne dépendent plus du volume `data`. La nouvelle ressource, configurée avec **les mêmes valeurs en env**, ne régénère rien → pas de lockout.

### P2 — Traiter les uploads (chantier A)

- **Option A (recommandée)** : basculer `STORAGE_DRIVER=s3` (chantier A) sur l'app actuelle et valider (upload d'un logo → servi depuis le bucket). Les uploads quittent le FS local → la nouvelle ressource n'a plus besoin du volume `uploads`.
- **Option B (rester en local)** : réattacher les fichiers existants à la nouvelle ressource. Récupérer le chemin hôte du volume actuel (`docker volume inspect <nom-réel-du-volume-uploads>` sur le VPS — le nom réel inclut l'UUID de l'ancienne ressource) puis, sur la nouvelle ressource, déclarer un **bind mount** *source = ce chemin hôte* → *destination = `/app/server/uploads`* (au lieu d'un volume nommé neuf). À défaut, copier les fichiers de l'ancien volume vers le nouveau avant le cutover.

### P3 — Image publiée + accès GHCR

- Un tag versionné (`v0.29.0`+) a été publié par la CI (vérifier sur `https://github.com/timepick-app/timepick/pkgs/container/timepick`) — premier tag d'image du namespace `timepick-app` ; les références legacy `v1.x` sous `ghcr.io/seangoogoo/…` sont abandonnées (aucune image n'y a jamais été publiée).
- Si le package GHCR est **privé** : un **PAT classique** avec le scope **`read:packages`** (un token *fine-grained* exige la permission **compte** « Packages: Read-only » — le scoping au repo seul ne donne pas l'accès aux packages).

---

## Étapes de bascule

Terminologie vérifiée sur la doc officielle Coolify (Docker Registry / Persistent Storage). Les libellés exacts peuvent varier selon la version installée.

### 1. Vérifier le pull GHCR depuis l'hôte (AVANT tout Deploy)

En SSH sur le VPS, **avec l'utilisateur configuré pour ce serveur dans Coolify** (souvent `root`) :

```bash
# Package privé uniquement — PAT via stdin (ne PAS utiliser `-p <PAT>` : le token
# fuiterait dans l'historique shell et dans `ps`).
echo "<PAT read:packages>" | docker login ghcr.io -u <github_username> --password-stdin

# Prouver la chaîne de credentials de bout en bout (attrape le bug connu
# Coolify « unauthorized au pull » — coollabsio/coolify#4604 — AVANT la bascule) :
docker pull ghcr.io/timepick-app/timepick:<tag>
```

Coolify réutilise ces credentials Docker Engine natifs de l'hôte (`~/.docker/config.json`) — il n'y a **pas** de champ registry dédié dans l'UI. Si le package est public, `docker login` est inutile ; le `docker pull` doit tout de même réussir en anonyme.

### 2. Créer la ressource « Docker Image » (nouvelle ressource, pas de conversion in-place)

Projet TimePick → **+ Add Resource** → **Docker Image** :

- **Image** : `ghcr.io/timepick-app/timepick:<tag épinglé, ex. v0.29.0>` — voir **Épinglage** ; ne **jamais** utiliser `latest` en prod.
- **Ports Exposes** : `3000`.

**Ne pas cliquer Deploy** — configurer d'abord les étapes 3 et 4.

### 3. Reporter la configuration (env, volumes, healthcheck) — SANS `VITE_API_URL`

- **Environment Variables** : reprendre le même bloc que l'app actuelle, secrets **en env** (P1) inclus. Tableau des variables : [« Déployer sur un PaaS »](https://docs.timepick.app/installation/deploiement-paas). **Retirer `VITE_API_URL`** : c'est une variable de *build*, déjà bakée à `/api` (relatif, same-origin) dans l'image GHCR ; en mode pull il n'y a plus de build, elle est sans effet.
- **Volumes** :
  - `uploads` : selon **P2** — Option A (s3) → aucun volume `uploads` requis ; Option B (local) → **bind mount** vers le chemin hôte existant.
  - `data` : **plus nécessaire** si les secrets sont en env (P1). (Si vous n'avez pas fait P1 — déconseillé — il faut bind-monter le chemin hôte de l'ancien volume `data`, sinon lockout.)
- **Healthcheck** : `GET` · `http` · `localhost` · port `3000` · path `/health` · code `200`. **Jamais** une sonde TCP nue (`/health` répond 200 même en JSON dégradé ; une sonde TCP ne détecte pas un process vivant mais non fonctionnel).
- **Pre/Post Deployment Commands** : laisser vide (migrations au boot via le `CMD` du conteneur, sérialisées par advisory lock PostgreSQL).

### 4. Déployer sur un domaine TEMPORAIRE, puis valider

Pour éviter à la fois le **downtime** de la prod et un **conflit de FQDN dupliqué** (deux ressources revendiquant le même domaine → routage Traefik/Coolify cassé) :

1. Assigner à la nouvelle ressource le **sous-domaine temporaire auto-généré par Coolify** (pas le FQDN de prod, qui reste sur l'ancienne ressource **en marche**).
2. **Deploy**. Suivre les logs : plus de phase de build (`npm ci`/`vite build`/`tsc`) — un `docker pull` de l'image `arm64`, puis `[prepare-db] …`, `[migrate] Done: N migration(s) applied`, `Server running on port 3000`.
3. Valider sur le domaine temporaire : statut **Running** + **Healthy** ; `GET https://<domaine-temp>/health` → 200 ; **login par magic-link réel** ; **logos d'email présents** (preuve que P1 + P2 ont fonctionné).

### 5. Swap du domaine (cutover)

Une fois la nouvelle ressource validée en conditions réelles :

1. Retirer le **FQDN de prod** de l'**ancienne** ressource (Build Pack).
2. L'ajouter à la **nouvelle** ressource (Docker Image) → Coolify reprovisionne le TLS.
3. Vérifier `https://<FQDN-prod>/health` → 200 et un parcours de bout en bout.

Le swap est quasi instantané et évite le conflit de FQDN dupliqué.

---

## Épinglage de version (tag)

- **Toujours épingler un tag versionné** (`ghcr.io/timepick-app/timepick:v0.29.0`). **Jamais `latest`** : il change de contenu à chaque release → un « Redeploy » deviendrait imprévisible.
- **Mise à jour de version** : éditer le champ **Docker Image** (`v0.29.0` → `v0.30.0`) → **Save** → **Deploy**.
- `sha-<court>` permet d'épingler un commit précis (investigation ponctuelle).

---

## Rollback

Aucune option n'est destructive **si l'ancienne ressource est conservée** :

1. **Re-pointer un ancien tag** (bug après montée de version) : champ **Docker Image** → tag précédent → **Save** → **Deploy**.
2. **Revenir au « Build Pack: Dockerfile »** (rollback du mode pull) : ré-assigner le **FQDN de prod** à l'ancienne ressource (jamais supprimée, seulement sans domaine depuis le cutover) → **Deploy**. Elle a **conservé son UUID, donc ses propres volumes intacts** (secrets + uploads d'origine) → aucune perte. Le build local reste 100 % fonctionnel.

> ⚠️ **Ne PAS supprimer l'ancienne ressource** tant que la nouvelle n'est pas validée sur plusieurs cycles. Les volumes sont **préfixés par l'UUID de ressource** : ils ne se partagent **pas** « par nom » entre ressources. Si vous n'êtes pas passé en secrets-env (P1) + s3 (P2), les volumes de l'ancienne ressource sont la **seule** copie des secrets/uploads d'origine — les supprimer = lockout admin définitif + perte des logos.

---

## Rappels (contraintes runtime — valables avant et après la bascule)

- **Scale = 1 instance obligatoire** (rate limiters `MemoryStore` per-process). Ne jamais configurer plus d'une réplique.
- **arm64** : s'assurer que le tag épinglé provient du build CI **multi-arch** (manifest list) — Docker sélectionne alors automatiquement la variante `arm64` sur le VPS ARM.
- **Healthcheck** : `GET /health`, jamais TCP.
- **Wizard L7** : sur cette install **existante**, le wizard du 1ᵉʳ admin a déjà été fait ; la bascule ne le redéclenche pas (données admin en DB, inchangées).

---

## Références

- Documentation TimePick : [Déploiement Coolify / VPS](https://docs.timepick.app/installation/deploiement-coolify-vps) (guide complet) · [Déployer sur un PaaS](https://docs.timepick.app/installation/deploiement-paas) (contraintes runtime, env vars) · [migration des secrets disque → env](https://docs.timepick.app/configuration/variables-environnement#migration-secrets) (procédure P1).
- Coolify — Docker Registry (auth via credentials Docker Engine de l'hôte) : https://coolify.io/docs/knowledge-base/docker/registry
- Coolify — Persistent Storage (préfixe UUID sur les volumes nommés) : https://coolify.io/docs/knowledge-base/persistent-storage
- Bug connu pull GHCR depuis Coolify : https://github.com/coollabsio/coolify/issues/4604
