/**
 * Préparation d'une base de données pour le déploiement (entrée production).
 *
 * Le chaînage de migrations (001+) suppose que la table `users` existe déjà :
 * 001_initial_schema ne fait qu'`ALTER TABLE users` et crée des FK vers
 * `users(id)`. Sur une base vierge (ex. PostgreSQL managé fraîchement créé par
 * Coolify), il faut donc d'abord appliquer le bootstrap de base (table `users`
 * + extension uuid-ossp + fonction `update_updated_at_column`) AVANT les
 * migrations — exactement comme le font `globalSetup` (tests) et `init-db`
 * (dev). Ce script réunit les deux étapes en une commande idempotente, à
 * utiliser comme commande de pré-déploiement (`node dist/prepare-db.js`).
 *
 * Idempotent : `bootstrap.sql` est en CREATE … IF NOT EXISTS / CREATE OR
 * REPLACE, et `runMigrations` ne rejoue que les migrations en attente. Sûr à
 * relancer à chaque déploiement.
 */
import './bootstrap-env';
import fs from 'node:fs';
import path from 'node:path';
import pool from './db/pool';
import { runMigrations } from './migrate';
import { provisionSmtpFromEnv } from './services/smtp-provisioning.service';

// dist/bootstrap.sql en production (copié par le Dockerfile), ou
// src/__tests__/bootstrap.sql en dev (exécution ts-node depuis src/).
const BOOTSTRAP_CANDIDATES = [
  path.join(__dirname, 'bootstrap.sql'),
  path.join(__dirname, '__tests__', 'bootstrap.sql'),
];

const resolveBootstrap = (): string => {
  const found = BOOTSTRAP_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      `[prepare-db] bootstrap.sql introuvable (cherché : ${BOOTSTRAP_CANDIDATES.join(', ')})`,
    );
  }
  return found;
};

const prepareDb = async (): Promise<void> => {
  const bootstrapSql = fs.readFileSync(resolveBootstrap(), 'utf8');
  const client = await pool.connect();
  try {
    await client.query(bootstrapSql);
  } finally {
    client.release();
  }
  console.log('[prepare-db] bootstrap appliqué (table users + extension + fonction)');

  await runMigrations();
  console.log('[prepare-db] migrations à jour');

  await provisionSmtpFromEnv();
};

prepareDb()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('[prepare-db] échec :', err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
