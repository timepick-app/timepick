#!/usr/bin/env node

/**
 * sync-image-tag.js — Aligne le tag d'image GHCR épinglé sur la version du package.
 *
 * Source de vérité UNIQUE : `package.json.version`. Le kit Docker Compose épingle
 * un tag LITTÉRAL (doctrine « jamais `latest` en prod ») ; ce script réécrit ce
 * littéral pour qu'il ne dérive jamais de la version publiée. Il est appelé
 * automatiquement au bump de version (skill `timepick-push`, étape 5) et vérifié
 * en CI (`--check`) — de sorte que personne n'ait à penser à éditer le tag.
 *
 * Cibles (un fichier absent est IGNORÉ, jamais une erreur : `docs-public/` est
 * purgé du miroir public — seul `deploy/compose/` y subsiste, cf. sync-public) :
 *   - deploy/compose/compose.yaml                    → kit canonique
 *   - docs-public/01-installation/03-…docker.md      → copie inline du kit
 *
 * Réécrit TOUT tag épinglé `ghcr.io/timepick-app/timepick:vX.Y.Z` (ligne `image:`
 * du kit ET exemples `docker pull …:vX.Y.Z`) sur la version courante. L'ancre
 * `ghcr.io/timepick-app/timepick:` exclut les mentions historiques en prose
 * (« publique depuis v0.29.0 », sans préfixe registre), qui ne doivent pas suivre.
 *
 * Usage :
 *   node scripts/sync-image-tag.js           # réécrit les fichiers désynchronisés
 *   node scripts/sync-image-tag.js --check   # ne réécrit rien ; sort 1 si dérive (CI)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Groupe capturant = tout jusqu'au `:` inclus ; seul le `vX.Y.Z` est remplacé.
const TAG_RE = /(ghcr\.io\/timepick-app\/timepick:)v\d+\.\d+\.\d+/g;

const TARGETS = [
  'deploy/compose/compose.yaml',
  'docs-public/01-installation/03-installation-production-docker.md',
];

function readVersion() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) {
    throw new Error(`Version package.json invalide : « ${pkg.version} » (attendu X.Y.Z)`);
  }
  return pkg.version;
}

function main() {
  const check = process.argv.includes('--check');
  const want = `v${readVersion()}`;

  let drift = 0;
  let written = 0;

  for (const rel of TARGETS) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) {
      console.log(`- ${rel} : absent, ignoré`);
      continue;
    }

    const before = readFileSync(abs, 'utf8');
    let hits = 0;
    const after = before.replace(TAG_RE, (_m, prefix) => {
      hits++;
      return `${prefix}${want}`;
    });

    if (hits === 0) {
      throw new Error(
        `Aucun tag épinglé dans ${rel} (motif attendu : « ghcr.io/timepick-app/timepick:vX.Y.Z »). ` +
          `Le bloc a-t-il été déplacé/supprimé ? Mettre à jour TARGETS dans scripts/sync-image-tag.js.`,
      );
    }

    if (after === before) {
      console.log(`- ${rel} : déjà à ${want} (${hits} occurrence·s)`);
      continue;
    }

    if (check) {
      drift++;
      console.log(`✗ ${rel} : désynchronisé (attendu ${want})`);
    } else {
      writeFileSync(abs, after);
      written++;
      console.log(`✓ ${rel} : réécrit → ${want} (${hits} occurrence·s)`);
    }
  }

  if (check && drift > 0) {
    console.error(`\nDérive détectée sur ${drift} fichier·s. Corriger avec : npm run sync:image-tag`);
    process.exit(1);
  }
  console.log(check ? `\nOK — tag image aligné sur ${want}.` : `\nTerminé — ${written} fichier·s réécrit·s, tag = ${want}.`);
}

main();
