#!/usr/bin/env ts-node
/**
 * Purge + re-seed de la table `users` (Story S6 — Refonte du profil membre).
 *
 * - Purge IRRÉVERSIBLE : supprime tous les users SAUF l'admin de référence
 *   (`SEED_ADMIN_EMAIL`, défaut `admin@timepick.example.org`). La cascade FK
 *   (event_users / invitations / bookings / admin_recovery_codes = ON DELETE
 *   CASCADE ; recovery_audit_log.admin_id = ON DELETE SET NULL) nettoie les
 *   enfants. Exécutée en SQL direct, hors la garde applicative `deleteUser`.
 * - Re-seed ~43 membres réalistes via `@faker-js/faker/locale/fr`
 *   (40 membres role 'user' + 3 admins, dont l'admin de référence).
 *
 * Idempotence : le PRNG faker est seedé (génération déterministe) et chaque
 * exécution purge puis re-seede ⇒ l'état final est identique (mêmes emails,
 * COUNT stable, aucun doublon). Les inserts fictifs utilisent
 * `ON CONFLICT (email) DO NOTHING` ; l'admin de référence est upserté
 * (`DO UPDATE SET role='admin'`) — jamais dupliqué, jamais déclassé en 'user'.
 *
 * Gardes : refuse `NODE_ENV === 'production'` et refuse un schéma pré-S2
 * (colonne `full_name` encore présente / `first_name` absente).
 *
 * Usage : npm run seed [-- --force]
 *   --force / --yes : saute l'attente de confirmation interactive (CI / non-TTY).
 */
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fakerFR as faker } from '@faker-js/faker';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PERSONAL_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@timepick.example.org';
const MEMBER_TARGET = 40; // lignes-piège + membres faker
const FAKER_SEED = 20260612;
const CONFIRM_DELAY_MS = 3000;
const TRAP_PHONE = '06 12 34 56 78';

type Role = 'user' | 'admin';

interface SeedUser {
  email: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  profession: string | null;
  informations: string | null;
  role: Role;
}

const PROFESSIONS = [
  'Enseignant',
  'Infirmier',
  'Agriculteur',
  'Chauffeur',
  'Artisan',
  'Commerçant',
  'Ingénieur',
  'Retraité',
  'Aide-soignant',
  'Étudiant',
  'Comptable',
  'Électricien',
  'Boulanger',
  'Pompier volontaire',
  'Éducateur spécialisé',
];

const INFORMATIONS_POOL: (string | null)[] = [
  'Dispose d\'un minibus',
  'Indisponible le mercredi',
  'Matériel de jardinage disponible',
  'Peut accueillir des enfants le jeudi matin',
  'Bénévole depuis 3 ans',
  'Possède un permis remorque',
  'Disponible uniquement les week-ends',
  'Référent sécurité de l\'association',
  null,
  null,
  null,
  null,
];

/**
 * Lignes-piège obligatoires (décision verrouillée 7) — valeurs explicites,
 * jamais générées aléatoirement, pour exercer recherche / tri / getInitials :
 *  - mononyme       : last_name NULL           → getInitials fallback 1 lettre
 *  - nom composé    : tiret dans first_name     → getInitials 'JD', pas 'J-D'
 *  - noms accentués : Héloïse / Élodie Ångström → ILIKE + tri Unicode + initiales 'É'/'Å'
 */
const TRAP_MEMBERS: SeedUser[] = [
  { email: 'madonna@timepick.local', firstName: 'Madonna', lastName: null, phone: TRAP_PHONE, profession: 'Artiste', informations: 'Mononyme — pas de nom de famille', role: 'user' },
  { email: 'jean-pierre.dupont-martin@timepick.local', firstName: 'Jean-Pierre', lastName: 'Dupont-Martin', phone: TRAP_PHONE, profession: 'Artisan', informations: 'Nom composé prénom et nom', role: 'user' },
  { email: 'heloise.menard@timepick.local', firstName: 'Héloïse', lastName: 'Ménard', phone: TRAP_PHONE, profession: 'Enseignante', informations: 'Dispose d\'un minibus', role: 'user' },
  { email: 'elodie.angstrom@timepick.local', firstName: 'Élodie', lastName: 'Ångström', phone: TRAP_PHONE, profession: 'Ingénieure', informations: 'Indisponible le mercredi', role: 'user' },
];

/** Admins fictifs (en plus de l'admin personnel upserté séparément). */
const EXTRA_ADMINS: SeedUser[] = [
  { email: 'admin-alice@timepick.local', firstName: 'Alice', lastName: 'Durand', phone: '07 11 22 33 44', profession: 'Coordinatrice', informations: null, role: 'admin' },
  { email: 'admin-bob@timepick.local', firstName: 'Bob', lastName: 'Lefèvre', phone: '07 55 66 77 88', profession: 'Trésorier', informations: null, role: 'admin' },
];

/** Local-part email déterministe et sans accent (idempotence + unicité garanties). */
function emailLocalPart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

/** Téléphone mobile FR formaté `0X XX XX XX XX` (déterministe via le seed faker). */
function frenchPhone(): string {
  const prefix = faker.helpers.arrayElement(['6', '7']);
  const pairs = faker.string.numeric(8).match(/.{2}/g) ?? [];
  return `0${prefix} ${pairs.join(' ')}`;
}

/** Membres fictifs faker (role 'user'), emails déterministes et uniques par index. */
function buildFakerMembers(count: number): SeedUser[] {
  const members: SeedUser[] = [];
  for (let i = 0; i < count; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    members.push({
      email: `${emailLocalPart(firstName)}.${emailLocalPart(lastName)}.${i}@timepick.local`,
      firstName,
      lastName,
      phone: frenchPhone(),
      profession: faker.helpers.arrayElement(PROFESSIONS),
      informations: faker.helpers.arrayElement(INFORMATIONS_POOL),
      role: 'user',
    });
  }
  return members;
}

/** Refuse un schéma pré-S2 (colonne full_name encore présente / first_name absente). */
async function assertSchemaPostS2(client: Client): Promise<void> {
  const { rows } = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'users' AND column_name IN ('first_name', 'full_name')`
  );
  if (rows.some((r) => r.column_name === 'full_name')) {
    console.error('❌ Refus : la colonne `full_name` existe encore (S2 non mergé). Migration 020 requise.');
    process.exit(1);
  }
  if (!rows.some((r) => r.column_name === 'first_name')) {
    console.error('❌ Refus : la colonne `first_name` est absente (S2 non mergé). Migration 020 requise.');
    process.exit(1);
  }
}

async function count(client: Client, sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await client.query<{ n: string }>(sql, params);
  return Number(rows[0].n);
}

/** Assertions post-seed (critères d'acceptation S6). Throw sur mismatch → exit 1. */
async function verify(client: Client, expectedTotal: number): Promise<void> {
  const checks: { label: string; ok: boolean; detail: string }[] = [];

  const total = await count(client, 'SELECT COUNT(*) AS n FROM users');
  checks.push({ label: 'COUNT(users) ≈ 43 (±2)', ok: Math.abs(total - expectedTotal) <= 2, detail: `total=${total} (attendu ${expectedTotal})` });

  const personalAdmin = await count(client, 'SELECT COUNT(*) AS n FROM users WHERE email = $1 AND role = $2', [PERSONAL_ADMIN_EMAIL, 'admin']);
  checks.push({ label: 'admin perso présent 1× et role=admin', ok: personalAdmin === 1, detail: `${PERSONAL_ADMIN_EMAIL}=${personalAdmin}` });

  const admins = await count(client, "SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");
  checks.push({ label: 'admins ≥ 3', ok: admins >= 3, detail: `admins=${admins}` });

  const orphanEventUsers = await count(client, 'SELECT COUNT(*) AS n FROM event_users eu LEFT JOIN users u ON u.id = eu.user_id WHERE u.id IS NULL');
  const orphanInvitations = await count(client, 'SELECT COUNT(*) AS n FROM invitations i LEFT JOIN users u ON u.id = i.user_id WHERE u.id IS NULL AND i.user_id IS NOT NULL');
  const orphanBookings = await count(client, 'SELECT COUNT(*) AS n FROM bookings b LEFT JOIN users u ON u.id = b.user_id WHERE u.id IS NULL');
  checks.push({ label: '0 FK orpheline (event_users / invitations / bookings)', ok: orphanEventUsers === 0 && orphanInvitations === 0 && orphanBookings === 0, detail: `eu=${orphanEventUsers} inv=${orphanInvitations} book=${orphanBookings}` });

  const mononyms = await count(client, 'SELECT COUNT(*) AS n FROM users WHERE last_name IS NULL');
  checks.push({ label: 'ligne-piège mononyme (last_name NULL)', ok: mononyms >= 1, detail: `mononymes=${mononyms}` });

  const composite = await count(client, "SELECT COUNT(*) AS n FROM users WHERE first_name LIKE '%-%'");
  checks.push({ label: 'ligne-piège nom composé (tiret)', ok: composite >= 1, detail: `composés=${composite}` });

  const accented = await count(client, "SELECT COUNT(*) AS n FROM users WHERE first_name IN ('Héloïse', 'Élodie')");
  checks.push({ label: 'lignes-piège accentuées', ok: accented >= 1, detail: `accentués=${accented}` });

  console.log('\n— Vérifications —');
  for (const c of checks) {
    console.log(`  ${c.ok ? '✅' : '❌'} ${c.label} · ${c.detail}`);
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    throw new Error(`${failed.length} assertion(s) échouée(s) : ${failed.map((c) => c.label).join(' ; ')}`);
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Refus : NODE_ENV=production. La purge est irréversible — interdite en prod.');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("❌ Erreur : DATABASE_URL n'est pas défini dans .env");
    process.exit(1);
  }

  // Génération déterministe (idempotence : mêmes membres à chaque run).
  faker.seed(FAKER_SEED);
  const fakerMembers = buildFakerMembers(MEMBER_TARGET - TRAP_MEMBERS.length);
  const members: SeedUser[] = [...TRAP_MEMBERS, ...fakerMembers];
  const fictitious: SeedUser[] = [...EXTRA_ADMINS, ...members];
  const expectedTotal = 1 /* admin perso */ + fictitious.length;

  const dbUrl = process.env.DATABASE_URL;
  const safeTarget = dbUrl.replace(/:[^:@/]+@/, ':***@'); // masque le mot de passe
  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();
    await assertSchemaPostS2(client);

    console.log('⚠️  PURGE IRRÉVERSIBLE de la table `users`.');
    console.log(`   Cible : ${safeTarget}`);
    console.log(`   Conservé : ${PERSONAL_ADMIN_EMAIL} · Re-seed : ${expectedTotal} users attendus.`);

    const forced = process.argv.slice(2).some((a) => a === '--force' || a === '--yes' || a === '-y');
    if (process.stdout.isTTY && !forced) {
      console.log(`   Annulez (Ctrl+C) sous ${CONFIRM_DELAY_MS / 1000}s pour interrompre…`);
      await sleep(CONFIRM_DELAY_MS);
    }

    await client.query('BEGIN');

    const purge = await client.query('DELETE FROM users WHERE email <> $1', [PERSONAL_ADMIN_EMAIL]);
    console.log(`\n🧹 Purge : ${purge.rowCount} user(s) supprimé(s) (cascade FK).`);

    // Admin de référence : upsert minimal (plan §4.d) — garantit role='admin' + un
    // first_name valide, SANS écraser le last_name saisi par l'utilisateur.
    // Jamais dupliqué, jamais déclassé en 'user'.
    await client.query(
      `INSERT INTO users (email, first_name, last_name, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO UPDATE
         SET role = 'admin', first_name = EXCLUDED.first_name`,
      [PERSONAL_ADMIN_EMAIL, 'Alex', 'Martin']
    );

    for (const u of fictitious) {
      await client.query(
        `INSERT INTO users (email, first_name, last_name, phone, profession, informations, role)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (email) DO NOTHING`,
        [u.email, u.firstName, u.lastName, u.phone, u.profession, u.informations, u.role]
      );
    }

    await client.query('COMMIT');

    console.log(
      `🌱 Seed : ${EXTRA_ADMINS.length + 1} admins (dont perso) + ${members.length} membres ` +
        `(${TRAP_MEMBERS.length} lignes-piège + ${fakerMembers.length} faker/fr).`
    );

    await verify(client, expectedTotal);

    console.log('\n✅ Seed terminé — base prête.');
    process.exit(0);
  } catch (error: unknown) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connexion déjà fermée / pas de transaction ouverte */
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Échec du seed : ${message}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
