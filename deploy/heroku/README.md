# Kit de déploiement — Heroku (Container Registry / stack `container`)

> **STATUT : NON PROUVÉ EN SESSION (aucun compte Heroku / CLI) — kit prêt-à-lancer.**
> Aucun compte Heroku ni CLI `heroku`/`docker` n'est disponible dans cette session. Ce
> kit fournit la configuration réelle (`heroku.yml`) et le protocole exact à exécuter
> par un opérateur humain (Jensen). Rien ci-dessous n'a été exécuté contre une
> infrastructure Heroku réelle — voir « Preuve à exécuter » pour ce qui reste à
> valider manuellement avant de considérer ce kit comme un déploiement fonctionnel.

Ce kit ne touche à aucun code applicatif (`client/`, `server/`, `shared/`). Il ne
contient que la configuration de déploiement Heroku : `heroku.yml` (ce dossier) et
ce README.

Pour le tableau complet des variables d'environnement et les contraintes runtime
partagées par toutes les cibles PaaS (scale, migrations, healthcheck), voir la
fiche **[Déployer sur un PaaS](https://docs.timepick.app/installation/deploiement-paas)** de
la documentation TimePick — ce document ne la duplique pas, il la complète avec
les commandes Heroku spécifiques.

## Rappels spécifiques à Heroku (avant de commencer)

- **Filesystem éphémère (dynos)** — comme tout PaaS sans volume persistant, un
  redémarrage/redeploy de dyno réinitialise le disque. En conséquence :
  - `STORAGE_DRIVER=s3` est **obligatoire** (chantier A) + `S3_ENDPOINT`,
    `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (le boot échoue en
    fail-fast si une var S3 requise manque en `STORAGE_DRIVER=s3`).
  - `JWT_SECRET` et `ENCRYPTION_KEY` **doivent** être posées en config vars
    (chantier B) — sans ça elles sont régénérées à chaque boot/redeploy : sessions
    et magic-links invalidés, mot de passe SMTP en base indéchiffrable → lockout
    admin. Sur une install Heroku déjà existante avec un `ENCRYPTION_KEY`
    différent, suivre la [procédure disque → environnement](https://docs.timepick.app/configuration/variables-environnement#migration-secrets)
    avant de changer la valeur.
- **SMTP sortant** — l'infrastructure Heroku throttle/bloque uniquement le port
  **25** sortant sur les dynos Common Runtime (non levable hors Private Space,
  cf. [changelog Heroku #2198](https://devcenter.heroku.com/changelog-items/2198)
  et [Heroku Help IR3S6I5X](https://help.heroku.com/IR3S6I5X/problem-in-sending-e-mails-through-smtp)).
  Rien d'autre n'est bloqué : les ports de soumission standards **587
  (STARTTLS)** et **465 (SMTPS implicite)** passent normalement — utilisables
  pour `SMTP_PORT`/`SMTP_SECURE` sans contournement. Ne configurez pas
  `SMTP_PORT=25`.
- **Heroku Postgres** — l'addon `heroku-postgresql` provisionne par défaut
  **PostgreSQL 17** pour toute nouvelle base créée en 2026 (confirmé via
  [Heroku Postgres Version Support](https://devcenter.heroku.com/articles/heroku-postgres-version-support)),
  ce qui satisfait la contrainte **PostgreSQL ≥ 16** de TimePick (version
  minimale supportée du projet) sans action particulière. Si l'addon existant est
  plus ancien, vérifier `heroku pg:info -a <app>` avant de continuer.
- **Non-root runtime** — Heroku n'exécute jamais les conteneurs avec des
  privilèges root, quel que soit le contenu du Dockerfile (cf.
  [Container Registry & Runtime — Dockerfile Commands and Runtime](https://devcenter.heroku.com/articles/container-registry-and-runtime#dockerfile-commands-and-runtime)).
  Le `Dockerfile` du repo ne déclare pas de `USER` explicite (root par défaut à
  la construction) ; ceci n'a jusqu'ici posé aucun problème connu sur cette
  image (aucune écriture disque hors du volume s3 en amont), mais à surveiller
  dans les logs de boot si une erreur de permission apparaît.
- **`HEALTHCHECK` Dockerfile ignoré** — Heroku ne lit pas d'instruction
  `HEALTHCHECK` : le Dyno Manager vérifie lui-même qu'un process `web` répond
  sur `$PORT` dans la fenêtre de boot (pas de configuration d'un chemin HTTP
  particulier côté Heroku, contrairement à DO App Platform). `GET /health` reste
  la sonde de référence pour la preuve manuelle ci-dessous, mais rien à
  configurer côté plateforme.

## Deux voies de déploiement

### Voie A — pull GHCR + re-push (RECOMMANDÉE, alignée avec le contrat P1)

Le contrat Chantier D impose une image **unique**, construite une seule fois par
la CI GitHub Actions et publiée sur `ghcr.io/timepick-app/timepick` (tags `latest`,
`<tag git>`, `sha-<court>`). Heroku ne peut pas tirer directement depuis GHCR
(Container Registry Heroku n'accepte que des push vers `registry.heroku.com`) :
l'opérateur doit donc re-tag/re-push l'image déjà construite par CI, **sans la
reconstruire**. C'est la voie qui respecte le modèle « pull-only » du contrat.

Prérequis : `docker` installé et authentifié pour lire l'image publique/privée
GHCR ; CLI `heroku` installée et authentifiée (`heroku login`) ; l'app Heroku déjà
créée avec le stack `container` (`heroku create <app> --stack container` ou
`heroku stack:set container -a <app>` sur une app existante).

```sh
# 1. Tirer l'image canonique publiée par CI, forcée en amd64
#    (Heroku Container Registry n'exécute QUE de l'amd64 — l'image multi-arch
#    fournit cette variante, pas besoin de la reconstruire).
docker pull --platform linux/amd64 ghcr.io/timepick-app/timepick:<tag>

# 2. Re-tag vers le registre Heroku. Le nom de process (web) DOIT apparaître
#    dans le tag pour permettre `heroku container:release` en CLI (sinon il
#    faut passer par l'API avec l'image_id — voir doc officielle).
docker tag ghcr.io/timepick-app/timepick:<tag> registry.heroku.com/<app>/web

# 3. Authentification au Container Registry Heroku
heroku container:login

# 4. Push de l'image re-taguée
docker push registry.heroku.com/<app>/web

# 5. Publication de la release (démarre le nouveau dyno avec cette image ;
#    déclenche le CMD du Dockerfile = migrations + serveur, cf. contrat)
heroku container:release web -a <app>
```

Source du protocole « Pushing an Existing Image » :
[Container Registry & Runtime — Building and Pushing Image(s)](https://devcenter.heroku.com/articles/container-registry-and-runtime#building-and-pushing-images).

`<tag>` = un tag git publié par la CI (ex. `v0.29.0`) ou `latest` ; `<app>` = nom de
l'app Heroku (ex. `timepick-prod`). Ne remplacez jamais `<tag>` par une valeur
inventée — utilisez un tag réellement publié par `.github/workflows/docker.yml`.

### Voie B — repli, build côté Heroku via `heroku.yml`

À utiliser uniquement si la Voie A est indisponible (ex. GHCR privé sans accès
depuis le poste de l'opérateur, ou test rapide sans image publiée). Cette voie
**recompile** l'image directement depuis le `Dockerfile` du repo — elle
n'utilise PAS l'image canonique GHCR, ce qui déroge au modèle « pull-only » du
contrat. `deploy/heroku/heroku.yml` (ce dossier) est le manifeste requis pour
cette voie : il doit être commité **à la racine du repo** (Heroku ne lit
`heroku.yml` qu'à la racine — pour ce kit, copiez/déplacez ce fichier avant le
`git push heroku`, ou committez-le tel quel si ce dossier `deploy/heroku/` est
temporairement promu à la racine pour ce déploiement).

```sh
# 1. Passer l'app au stack container
heroku stack:set container -a <app>

# 2. Configurer le remote git `heroku` dans ce clone (sinon `git push heroku`
#    échoue : « 'heroku' does not appear to be a git repository »).
heroku git:remote -a <app>

# 3. heroku.yml doit être à la RACINE du repo poussé (à côté du Dockerfile).
#    Pousser déclenche le build direct par Heroku.
git push heroku main
```

Heroku construit alors l'image nativement en amd64 sur son infrastructure —
aucune contrainte de plateforme (`--platform`) à gérer côté opérateur pour
cette voie. Le build lit `build.config.VITE_API_URL: /api` dans `heroku.yml`
et l'injecte comme `ARG` au Dockerfile (chemin relatif, same-origin — voir
commentaire dans `heroku.yml`).

Source : [Building Docker Images with heroku.yml](https://devcenter.heroku.com/articles/build-docker-images-heroku-yml).

## Configuration (`heroku config:set`)

Ne posez QUE des config vars runtime — jamais `VITE_API_URL` (déjà baké au
build, cf. contrat) ni `PORT` (injecté automatiquement par Heroku par dyno,
lu par `process.env.PORT` côté serveur). Tableau complet et détails de chaque
variable : [« Déployer sur un PaaS »](https://docs.timepick.app/installation/deploiement-paas). Résumé
des commandes :

```sh
# DATABASE_URL est généralement déjà injectée automatiquement si l'addon
# heroku-postgresql est attaché à l'app (heroku addons:create heroku-postgresql:<plan> -a <app>).
# Vérifier avec `heroku config -a <app>` avant de la reposer manuellement.

heroku config:set -a <app> \
  JWT_SECRET="<valeur non vide, générée ex. openssl rand -hex 32>" \
  ENCRYPTION_KEY="<64 caractères hexadécimaux, ex. openssl rand -hex 32>" \
  APP_URL="https://<app>.herokuapp.com" \
  NODE_ENV=production \
  STORAGE_DRIVER=s3 \
  S3_ENDPOINT="<endpoint S3/compatible>" \
  S3_BUCKET="<bucket>" \
  S3_ACCESS_KEY_ID="<access-key-id>" \
  S3_SECRET_ACCESS_KEY="<secret-access-key>" \
  SMTP_HOST="<host>" \
  SMTP_PORT="<587 ou 465>" \
  SMTP_SECURE="<true|false selon 465|587>" \
  SMTP_USER="<user>" \
  SMTP_PASSWORD="<password>" \
  SMTP_FROM_NAME="<nom expéditeur>" \
  SMTP_FROM_EMAIL="<adresse expéditeur>"
```

Les variables `SMTP_*` sont seedées en base au premier boot par `prepare-db` ;
les modifier après ce premier boot n'a plus d'effet runtime (le serveur relit
la config SMTP depuis la DB, pas depuis l'env — cf. contrat).

## Scale

```sh
heroku ps:scale web=1 -a <app>
```

**1 instance obligatoire, jamais plus.** Tous les rate limiters de sécurité
(setup, recovery, encryption-key admin, uploads, admin actions) sont en
`MemoryStore` per-process ; à N dynos chaque limite vaut ×N. Les migrations au
boot restent multi-instance-safe (advisory lock PostgreSQL) donc un `heroku
container:release`/`heroku restart` isolé ne corrompt rien, mais ne scalez
jamais `web` au-delà de 1 en régime établi.

## Preuve à exécuter par l'opérateur (non faite en session)

Avant de considérer ce kit comme un déploiement Heroku fonctionnel, l'opérateur
doit exécuter et consigner :

1. **Restart sans corruption** — `heroku restart -a <app>`, puis re-vérifier
   `GET https://<app>.herokuapp.com/health` → `200` (JSON, y compris si le
   statut SMTP interne est `degraded`). Confirmer qu'aucune donnée n'est perdue
   après restart : les uploads (S3, pas le FS du dyno) et les secrets
   (`JWT_SECRET`/`ENCRYPTION_KEY` en config vars, pas régénérés) doivent
   survivre intacts au cycle de dyno.
2. **Wizard L7 immédiat** — dérouler `/api/setup/*` (création + vérification du
   premier compte admin par magic-link) **dès le premier boot public**, ces
   routes étant publiques tant qu'aucun admin n'existe.
3. **Magic-link réellement reçu** — envoyer un magic-link et confirmer sa
   **réception effective** dans une boîte mail réelle via le relais SMTP
   587/465 configuré. Exigence binaire (reçu ou pas) identique au kit DO App
   Platform : le bouton « Tester la connexion » de l'admin SMTP ne prouve que
   l'authentification, pas l'acheminement bout-en-bout.

Aucune de ces trois preuves n'a été exécutée dans cette session (pas de compte
Heroku ni de CLI disponibles). Ce README documente le protocole exact ; c'est
à l'opérateur de le dérouler et d'en consigner le résultat (ex. dans le mémo
d'audit d'hébergement).
