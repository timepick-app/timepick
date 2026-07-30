#!/usr/bin/env ts-node
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { createInterface, type Interface } from 'node:readline/promises';

// Charger .env depuis le répertoire server
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const ADMIN_ROLE = 'admin' as const;

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  role: string;
  createdAt: Date;
}

let rl: Interface | null = null;

/**
 * Pose une question à l'opérateur.
 *
 * Garde-fou non-TTY : sans terminal interactif (pipe, cron, CI) personne ne
 * peut répondre — échouer explicitement plutôt que laisser le script pendre.
 */
async function ask(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(
      `saisie interactive requise (${prompt.trim()}) mais l'entrée standard n'est pas un terminal. ` +
      "Relancez le script depuis un terminal, ou passez l'email en argument."
    );
  }
  rl ??= createInterface({ input: process.stdin, output: process.stdout });
  return (await rl.question(prompt)).trim();
}

/**
 * Vérifie si un email est valide
 * Regex pragmatique : valide les formats email courants, pas une RFC complète
 */
function isValidEmail(email: string): boolean {
  // Regex améliorée : requiert au moins 2 lettres pour le TLD, rejette les points consécutifs
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

/** Demande l'email jusqu'à en obtenir un valide. */
async function askEmail(): Promise<string> {
  for (;;) {
    const email = await ask("Email de l'administrateur : ");
    if (isValidEmail(email)) return email;
    console.error(`❌ "${email}" n'est pas une adresse email valide`);
  }
}

/** Demande prénom (requis) puis nom (facultatif). */
async function askAdminNames(): Promise<{ firstName: string; lastName: string | null }> {
  for (;;) {
    const firstName = await ask('Prénom : ');
    if (firstName) return { firstName, lastName: (await ask('Nom (facultatif) : ')) || null };
    console.error('❌ Le prénom est requis');
  }
}

/**
 * Récupère la liste des administrateurs
 */
async function listAdmins(client: Client): Promise<AdminUser[]> {
  const result = await client.query(
    'SELECT id, email, first_name as "firstName", role, created_at as "createdAt" FROM users WHERE role = $1 ORDER BY created_at DESC',
    [ADMIN_ROLE]
  );
  return result.rows;
}

/**
 * Affiche la liste des administrateurs
 */
function displayAdmins(admins: AdminUser[]): void {
  if (admins.length === 0) {
    console.log('📋 Aucun administrateur trouvé');
    return;
  }

  console.log(`\n📋 Administrateurs (${admins.length}):`);
  admins.forEach((admin, index) => {
    console.log(`  ${index + 1}. ${admin.email} (${admin.firstName || 'N/A'})`);
  });
}

/**
 * Crée ou promeut un utilisateur en administrateur (opération atomique)
 * Utilise une transaction avec SELECT FOR UPDATE pour éviter les race conditions
 */
async function createOrPromoteAdmin(
  client: Client,
  email: string
): Promise<{ action: string; user: AdminUser; previousRole?: string }> {
  await client.query('BEGIN');

  try {
    // Verrouiller la ligne potentielle pour éviter les race conditions
    const existing = await client.query(
      'SELECT id, email, first_name as "firstName", role FROM users WHERE email = $1 FOR UPDATE',
      [email]
    );

    if (existing.rows.length === 0) {
      // Cas 1: Création d'un nouvel administrateur.
      // Les noms sont demandés ICI et nulle part ailleurs : une promotion doit
      // préserver l'identité déjà en base. La transaction reste ouverte pendant
      // la saisie — c'est le prix de l'atomicité, acceptable pour un script
      // mono-opérateur lancé à la main.
      const { firstName, lastName } = await askAdminNames();
      const result = await client.query(
        `INSERT INTO users (email, first_name, last_name, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, first_name as "firstName", role, created_at as "createdAt"`,
        [email, firstName, lastName, ADMIN_ROLE]
      );
      await client.query('COMMIT');
      return { action: 'created', user: result.rows[0] };
    }

    const user = existing.rows[0];

    if (user.role === ADMIN_ROLE) {
      // Cas 2: Déjà admin - rien à faire
      await client.query('ROLLBACK');
      return { action: 'already_admin', user };
    }

    // Cas 3: Promotion d'un utilisateur existant — first_name jamais écrasé
    const result = await client.query(
      `UPDATE users
       SET role = $1, updated_at = NOW()
       WHERE email = $2
       RETURNING id, email, first_name as "firstName", role, created_at as "createdAt"`,
      [ADMIN_ROLE, email]
    );
    await client.query('COMMIT');
    // `RETURNING role` rend le rôle APRÈS mise à jour ('admin') : le rôle
    // d'origine ne survit que dans la ligne verrouillée plus haut.
    return { action: 'promoted', user: result.rows[0], previousRole: user.role };
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/**
 * Fonction principale
 */
async function main(): Promise<void> {
  // L'email en argument est un raccourci : il pré-remplit la première question.
  const emailArg = process.argv[2];

  if (emailArg && !isValidEmail(emailArg)) {
    console.error(`❌ Erreur: "${emailArg}" n'est pas une adresse email valide`);
    process.exitCode = 1;
    return;
  }

  // Vérifier DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error("❌ Erreur: DATABASE_URL n'est pas défini dans le fichier .env");
    process.exitCode = 1;
    return;
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    console.log('🔗 Connexion à la base de données...');

    // `||` et non `??` : `create-admin "$EMAIL"` avec la variable non définie
    // passe une chaîne VIDE, qui n'est pas nullish. Avec `??` elle sautait le
    // prompt ET le garde de validation, et insérait un admin sans email.
    const email = emailArg || (await askEmail());

    // Opération atomique : création (avec saisie des noms) ou promotion
    const result = await createOrPromoteAdmin(client, email);

    switch (result.action) {
      case 'created':
        console.log(`✅ ${email} est maintenant administrateur`);
        break;
      case 'promoted':
        console.log(`✅ ${email} a été promu administrateur (anciennement: ${result.previousRole})`);
        break;
      case 'already_admin':
        console.log(`ℹ️  ${email} est déjà administrateur`);
        break;
    }

    // Afficher la liste des administrateurs
    const admins = await listAdmins(client);
    displayAdmins(admins);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Erreur lors de la création de l'administrateur: ${errorMessage}`);
    process.exitCode = 1;
  } finally {
    rl?.close();
    await client.end();
  }
}

// Exécuter le script
main();
