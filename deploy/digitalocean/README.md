# Kit de déploiement — DigitalOcean App Platform

> **STATUT : NON PROUVÉ EN SESSION (aucun compte DO / doctl) — kit prêt-à-lancer, preuve SMTP à exécuter par Jensen.**
>
> Ce kit (`app.yaml` + ce README) est un livrable de config + protocole. Aucun déploiement réel n'a été exécuté ni observé en session : pas de compte DigitalOcean, pas de `doctl` disponible ici. Chaque affirmation « ça marche » dans ce document est soit sourcée depuis la doc officielle DO, soit explicitement marquée comme à vérifier par un humain avec les étapes exactes pour le faire.

## Pourquoi ce kit impose les chantiers A + B

DigitalOcean App Platform est une PaaS **sans volumes persistants** : le système de fichiers de chaque conteneur est éphémère, plafonné à **4 GiB**, et repart de zéro à **chaque redeploy** (nouveau build/pull d'image = nouveau conteneur, aucun disque conservé entre deux déploiements).

Conséquence directe sur les deux couperets identifiés dans le contrat :

- **C3 (uploads)** — un `STORAGE_DRIVER=local` perdrait tous les fichiers uploadés au premier redeploy. → `STORAGE_DRIVER=s3` est **obligatoire** ici (chantier A, déjà livré). `app.yaml` définit `STORAGE_DRIVER=s3` + `S3_ENDPOINT`/`S3_BUCKET`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`.
- **C4 (secrets sur disque)** — `JWT_SECRET`/`ENCRYPTION_KEY` stockés sur le FS du conteneur seraient régénérés/perdus à chaque redeploy (sessions et magic-links invalidés ; pire, un `ENCRYPTION_KEY` perdu rend le mot de passe SMTP en base indéchiffrable → lockout admin). → ces deux secrets **doivent** être des variables d'environnement App Platform (chantier B, déjà livré), jamais des fichiers écrits par l'app. `app.yaml` les définit en `type: SECRET`.

**Architecture (amd64 uniquement, OK)** : App Platform ne supporte que des images conteneur **AMD64** (« App Platform only supports Linux-based container images built for the AMD64 architecture », [doc DO — Deploy from Container Images](https://docs.digitalocean.com/products/app-platform/how-to/deploy-from-container-images/)). L'image canonique `ghcr.io/timepick-app/timepick` est multi-arch (amd64+arm64) → App Platform tire automatiquement la variante `amd64` du manifest. Aucune action requise côté kit.

## Fichiers de ce kit

- `app.yaml` — App Spec DigitalOcean complète : service unique depuis l'image GHCR, `http_port: 3000`, `health_check.http_path: /health`, `instance_count: 1`, toutes les env vars requises (placeholders `<...>`), bloc `databases` PostgreSQL managé ≥ 16. Alternative « build from source » documentée en commentaire YAML si le pull GHCR externe n'est pas disponible pour ce compte.
- Ce README — étapes de déploiement + **protocole de preuve SMTP** (section critique, à exécuter avant toute mise en production).

Pour le tableau complet des variables d'environnement (raisons, formats, defaults), voir la fiche **[Déployer sur un PaaS](https://docs.timepick.app/installation/deploiement-paas)** de la documentation TimePick — ce README ne duplique pas ce tableau, il pointe dessus et détaille uniquement ce qui est spécifique à App Platform (le piège `http_port`, le bloc `databases`, le protocole SMTP).

## Étapes de déploiement

Prérequis : `doctl` installé et authentifié (`doctl auth init`), un compte DigitalOcean avec facturation active.

### 1. Provisionner le cluster PostgreSQL managé (≥ 16)

Le contrat exige PostgreSQL **≥ 16** (version minimale supportée du projet). `app.yaml` référence un cluster managé existant via `cluster_name` (production: true) — le provisionner d'abord :

```bash
doctl databases create timepick-db-cluster \
  --engine pg \
  --version 16 \
  --region nyc3 \
  --size db-s-1vcpu-1gb \
  --num-nodes 1
```

Reporter le nom exact du cluster créé dans `app.yaml` (clé `databases[0].cluster_name`), ainsi que la région choisie dans `region:` si elle diffère de `nyc`.

> Alternative rapide pour un test jetable non productif : dans `app.yaml`, remplacer le bloc `databases` par une **dev database** (`production: false`, sans `cluster_name` — DO en provisionne une automatiquement). Non recommandé en prod : pas de haute disponibilité, taille limitée, cycle de vie lié à l'app.

### 2. Provisionner le stockage objet S3-compatible

`STORAGE_DRIVER=s3` est obligatoire (FS éphémère). Utiliser DigitalOcean Spaces (S3-compatible) ou tout autre fournisseur S3-compatible.

> ⚠️ **La création d'un bucket Spaces n'est PAS exposée par `doctl`** (la doc DO renvoie explicitement vers un outil S3-compatible). Créer le bucket via la **console DO** (*Create → Spaces Object Storage*) ou un client S3 (`s3cmd` / `aws-cli`) pointé sur l'endpoint `<region>.digitaloceanspaces.com`.

Générer ensuite une clé d'accès Spaces via la **console** (*API → Spaces Keys → Generate New Key*, qui donne l'access key **et** le secret) ou en CLI :

```bash
doctl spaces keys create timepick-do-app-platform
```

Reporter `S3_ENDPOINT` (`https://<region>.digitaloceanspaces.com`), `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` — soit directement dans `app.yaml` avant `doctl apps create` (déconseillé si le fichier part en dépôt Git : préférer l'étape 4 pour les secrets), soit après coup via la console / `doctl` comme indiqué en étape 4.

### 3. Compléter les placeholders non-secrets de `app.yaml`

Remplir dans `app.yaml` : `APP_URL` (domaine HTTPS public final de l'app — même provisoire, ex. `https://timepick-xxxxx.ondigitalocean.app` avant l'attribution d'un domaine custom), `S3_ENDPOINT`, `S3_BUCKET`, `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_FROM_NAME`/`SMTP_FROM_EMAIL`, `databases[0].cluster_name`.

**Ne pas** committer de vraies valeurs de secrets (`JWT_SECRET`, `ENCRYPTION_KEY`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `SMTP_PASSWORD`) dans `app.yaml` si ce fichier est versionné en clair — les injecter via la console DO ou `doctl apps update` après création (App Platform les chiffre au premier submit et remplace la valeur en clair par une valeur chiffrée `EV[...]` dans le spec stocké côté plateforme).

### 4. Créer l'app et injecter les secrets

```bash
doctl apps create --spec deploy/digitalocean/app.yaml
```

`doctl` affiche l'`APP_ID` créé. Injecter/mettre à jour ensuite les secrets restants (`JWT_SECRET`, `ENCRYPTION_KEY`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `SMTP_PASSWORD`) soit :
- via la console DO (**App > Settings > App-Level / Component Environment Variables**, cocher **Encrypt**), soit
- en éditant `app.yaml` avec les vraies valeurs puis `doctl apps update <APP_ID> --spec deploy/digitalocean/app.yaml` (App Platform déclenche un nouveau déploiement).

Vérifier le déploiement :

```bash
doctl apps get <APP_ID>
doctl apps logs <APP_ID> --type run --follow
```

Confirmer que `GET https://<domaine-app>/health` répond `200` (JSON) avant de poursuivre — c'est la preuve que le process a bootstrapé et que les migrations idempotentes (`prepare-db.js`) se sont exécutées avec succès contre le cluster PG.

### 5. Dérouler le wizard setup IMMÉDIATEMENT

Les routes `/api/setup/*` sont **publiques** tant qu'aucun admin n'existe. Dès que `/health` répond 200, ouvrir l'URL publique de l'app et dérouler le wizard (créer le 1er admin, vérifier par magic-link) **avant** toute exposition prolongée à un réseau non fiable — c'est aussi l'étape qui sert de preuve SMTP (section suivante).

## PROTOCOLE DE PREUVE SMTP (point critique de ce chantier)

**Pourquoi ce protocole existe** : la politique de DigitalOcean App Platform sur le trafic SMTP sortant (ports 587/465) ne repose, à la date de rédaction, que sur des réponses de staff DO en forum communautaire — une source **non canonique**, non confirmée dans la documentation officielle App Spec / Networking. Il est **interdit de conclure « OK »** sur la base de cette seule source. La leçon du chantier B (secrets) s'applique directement ici : un test qui *a l'air* de réussir n'est pas une preuve — seule la réception réelle d'un email en fait foi.

### Ce qui NE constitue PAS une preuve

Le bouton **« Tester la connexion »** du wizard setup (ou tout bouton équivalent qui valide juste `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD` en ouvrant une connexion + `AUTH`) **ne prouve pas** l'envoi réel d'un email. Il vérifie qu'un mot de passe/token est accepté par le serveur SMTP, pas que la plateforme d'hébergement laisse effectivement passer le trafic sortant sur le port choisi jusqu'à la remise finale (filtrage réseau égress, throttling, blocklist IP partagée du pool App Platform, etc. sont invisibles à ce test). C'est exactement le piège qui a trompé une vérification lors du chantier B : le bouton rassure à tort.

### Preuve exigée : un magic-link réellement reçu

1. **Déployer l'app jetable** avec ce kit (`app.yaml`, section « Étapes de déploiement » ci-dessus), avec un vrai compte SMTP de test :
   - **Brevo (ex-Sendinblue)** sur port **587 STARTTLS** → `SMTP_PORT=587`, `SMTP_SECURE=false`.
   - **OVH** sur port **465 SSL** → `SMTP_PORT=465`, `SMTP_SECURE=true`.
   (Choisir l'un des deux, ou tout autre fournisseur SMTP réel disponible — l'essentiel est un port/mode de chiffrement représentatif de la prod cible.)
2. **Wizard setup** : ouvrir l'URL publique de l'app fraîchement déployée, configurer le SMTP réel dans le wizard (les valeurs `SMTP_*` seedées via `app.yaml` sont lues au 1er boot par `prepare-db.js` ; le wizard peut aussi les modifier — dans les deux cas, c'est la valeur effectivement en base après ce point qui compte, cf. contrat).
3. **Saisir l'email admin réel** (une boîte que Jensen peut réellement consulter) et déclencher **« Envoyer le lien de connexion »** (ou équivalent — le flux magic-link de création du 1er admin).
4. **CONFIRMER** :
   - ouvrir la vraie boîte mail cible et vérifier la **réception effective** de l'email contenant le magic-link (pas seulement l'absence d'erreur côté app — un envoi silencieusement droppé par un filtre réseau égress ne produit souvent aucune erreur applicative visible) ;
   - **cliquer** le lien reçu et confirmer que le compte admin est bien créé/vérifié côté app.

### Verdict binaire à consigner

À l'issue de l'étape 4, noter explicitement dans un compte-rendu de déploiement (pas dans ce README, qui reste un kit générique réutilisable) :

- **Magic-link reçu : OUI** → SMTP sortant 587/465 fonctionne réellement sur App Platform pour ce fournisseur/port. La cible est validée pour la prod.
- **Magic-link reçu : NON** (ports 587/465 bloqués ou droppés silencieusement) → **App Platform n'est PAS un Droplet** : il n'existe **aucun repli sur le port 2525** ici (le repli 2525 documenté ailleurs suppose un accès réseau bas niveau type Droplet/VM, absent sur une PaaS managée type App Platform). Dans ce cas, deux options :
  1. basculer l'envoi transactionnel vers un **transport email HTTP** — TimePick propose nativement Brevo, Mailjet, Scaleway et Sweego (fournisseurs européens) ainsi que Resend (US, en dernier recours) via son sélecteur **Envoi par API (HTTP)**, plutôt que le protocole SMTP (voir [Fournisseurs SMTP — Envoi par API (HTTP)](https://docs.timepick.app/configuration/smtp-fournisseurs#envoi-par-api-http) — c'était le périmètre du chantier C, hors scope de ce kit) ;
  2. ou changer de cible de déploiement pour une plateforme offrant un accès réseau sortant moins restreint (ex. un Droplet classique, cf. kit correspondant si disponible).

Ce verdict doit être binaire et daté — ne jamais l'inférer par extrapolation depuis un autre déploiement PaaS (chaque plateforme filtre différemment son trafic égress SMTP).

## Rappels du contrat gelé (résumé — détail complet : [Déployer sur un PaaS](https://docs.timepick.app/installation/deploiement-paas))

- Scale = **1 instance obligatoire**, jamais plus (rate limiters en mémoire per-process).
- PostgreSQL **≥ 16 obligatoire**.
- `VITE_API_URL` n'est **jamais** à définir ici (build-time, déjà baké dans l'image lors du build CI).
- `PORT` n'est **jamais** à forcer manuellement (App Platform l'injecte automatiquement = `http_port`, et l'app lit déjà `process.env.PORT`).
- `PUBLIC_BASE_URL` n'est pertinent que sous `STORAGE_DRIVER=local` — inutilisé ici (`STORAGE_DRIVER=s3`), utiliser `S3_PUBLIC_BASE_URL` si un domaine public dédié aux uploads est nécessaire.
