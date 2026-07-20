# TimePick — Docker Compose (app + PostgreSQL)

Kit canonique pour auto-héberger TimePick en « pur Docker » : l'application (image officielle GHCR, **publique et multi-arch** `amd64`+`arm64` depuis `v0.29.0` — aucun `docker login` requis) et sa base PostgreSQL dans deux conteneurs liés par le réseau interne Compose, avec volumes persistants. C'est le chemin recommandé de la fiche [Installation en production (Docker)](https://timepick.docs.jensen-siu.net/installation/installation-production-docker.html).

> **Vérifié de bout en bout** : `docker compose up -d` tire l'image publique en anonyme, `GET /health` répond `200` (statut `degraded` tant que le SMTP n'est pas configuré — attendu) et la SPA est servie sur `/`.

## Démarrage rapide

Depuis ce dossier (ou une copie de `compose.yaml` + `.env.example` sur le serveur) :

```bash
cp .env.example .env   # puis renseigner chaque valeur (le fichier indique la commande de génération par secret)
docker compose up -d
```

Vérifier :

```bash
curl http://localhost:3000/health
```

Réponse `200` avec un statut `ok` — ou `degraded` tant que le SMTP n'est pas configuré, ce qui est normal juste après l'installation. Le port publié se change avec `TIMEPICK_PORT` dans `.env`.

Prérequis : Docker + **Docker Compose v2** (`docker compose version`) — voir [Prérequis](https://timepick.docs.jensen-siu.net/installation/prerequis.html).

## Après le premier démarrage (à faire immédiatement)

1. **Assistant de configuration** — ouvrir l'application dans un navigateur : elle redirige vers `/setup` (création du premier administrateur). Ne pas différer : tant qu'aucun admin n'existe, les routes `/api/setup/*` sont publiques. Voir [Configuration initiale](https://timepick.docs.jensen-siu.net/configuration/configuration-initiale.html).
2. **SMTP obligatoire pour se connecter** — TimePick s'authentifie par liens de connexion envoyés par email : **sans serveur SMTP configuré, personne ne peut se connecter** (l'instance reste `degraded`). L'assistant demande la configuration ; modifiable ensuite dans Paramètres → Serveur d'email. Réglages par fournisseur : [SMTP — Fournisseurs](https://timepick.docs.jensen-siu.net/configuration/smtp-fournisseurs.html). Alternative : provisionner via les variables `SMTP_*` au premier démarrage — voir [Variables d'environnement](https://timepick.docs.jensen-siu.net/configuration/variables-environnement.html).

## Mise à jour

1. **Sauvegarder la base** (voir ci-dessous) — les migrations sont forward-only, sans rollback.
2. Éditer le tag épinglé dans `compose.yaml` (ex. `v0.29.0` → `v0.30.0`).
3. `docker compose pull && docker compose up -d`

Les migrations s'appliquent automatiquement au démarrage du conteneur. Ne **jamais** remplacer le tag par `latest`. Détail et vérifications post-mise à jour : [Mettre à jour une instance](https://timepick.docs.jensen-siu.net/installation/mise-a-jour.html).

## Sauvegardes

Trois éléments, à copier **hors du serveur** :

- **Base PostgreSQL** — depuis ce dossier :

  ```bash
  docker compose exec db pg_dump -U timepick -d timepick -F c > timepick_$(date +%Y-%m-%d).dump
  ```

- **Volume `uploads`** (`timepick_uploads` — images de l'éditeur d'emails) : archive `tar` du volume.
- **Le fichier `.env`** : il contient `ENCRYPTION_KEY`, sans laquelle le mot de passe SMTP d'un dump restauré est indéchiffrable. À stocker séparément des dumps.

Procédures complètes (uploads, restauration, vérifications) : [Sauvegarde et restauration](https://timepick.docs.jensen-siu.net/exploitation/sauvegarde-restauration.html).

## Rappels

- **`docker compose down -v` efface les données** : l'option `-v` supprime les volumes `pgdata` et `uploads` — base et images uploadées perdues, définitivement, sans confirmation. Pour arrêter l'instance sans rien détruire : `docker compose down` (sans `-v`), ou `docker compose stop` pour une simple pause.
- **1 seule instance** (`scale=1`) : les limitations de débit sont maintenues en mémoire, par processus — ne jamais configurer de réplique.
- **PostgreSQL non exposé** : le service `db` n'a volontairement aucun port publié sur l'hôte. Accès ponctuel : `docker compose exec db psql -U timepick -d timepick`.
- **HTTPS** : placer un reverse proxy (Caddy, Traefik, Nginx…) devant le port publié ; `APP_URL` doit être l'URL publique HTTPS finale, sinon les liens de connexion envoyés par email pointent au mauvais endroit.
- **Secrets en variables d'environnement** : `JWT_SECRET` et `ENCRYPTION_KEY` sont exigés dans `.env` (le kit refuse de démarrer sans) — aucun état secret caché dans un volume, la sauvegarde se réduit à `.env` + les deux volumes.
