#!/usr/bin/env ts-node
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

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

/**
 * Affiche l'aide du script
 */
function showHelp(): void {
  console.log(`
Usage: npm run create-admin <email>

Paramètres:
  email    L'adresse email de l'utilisateur à créer/promouvoir

Exemples:
  npm run create-admin admin@example.com
  npm run create-admin help
`);
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
async function createOrPromoteAdmin(client: Client, email: string): Promise<{ action: string; user: AdminUser }> {
  await client.query('BEGIN');

  try {
    // Verrouiller la ligne potentielle pour éviter les race conditions
    const existing = await client.query(
      'SELECT id, email, first_name as "firstName", role FROM users WHERE email = $1 FOR UPDATE',
      [email]
    );

    if (existing.rows.length === 0) {
      // Cas 1: Création d'un nouvel administrateur
      const result = await client.query(
        `INSERT INTO users (email, first_name, role)
         VALUES ($1, $2, $3)
         RETURNING id, email, first_name as "firstName", role, created_at as "createdAt"`,
        [email, 'Administrateur', ADMIN_ROLE]
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

    // Cas 3: Promotion d'un utilisateur existant
    const result = await client.query(
      `UPDATE users
       SET role = $1, updated_at = NOW()
       WHERE email = $2
       RETURNING id, email, first_name as "firstName", role, created_at as "createdAt"`,
      [ADMIN_ROLE, email]
    );
    await client.query('COMMIT');
    return { action: 'promoted', user: result.rows[0] };
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/**
 * Fonction principale
 */
async function main(): Promise<void> {
  // Récupérer l'email depuis les arguments
  const emailArg = process.argv[2];

  // Afficher l'aide si demandé ou si pas d'argument
  if (!emailArg || emailArg === 'help' || emailArg === '--help' || emailArg === '-h') {
    showHelp();
    process.exit(0);
  }

  // Valider l'email
  if (!isValidEmail(emailArg)) {
    console.error(`❌ Erreur: "${emailArg}" n'est pas une adresse email valide`);
    process.exit(1);
  }

  // Vérifier DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error("❌ Erreur: DATABASE_URL n'est pas défini dans le fichier .env");
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    console.log('🔗 Connexion à la base de données...');

    // Opération atomique : création ou promotion
    const result = await createOrPromoteAdmin(client, emailArg);

    switch (result.action) {
      case 'created':
        console.log(`✅ ${emailArg} est maintenant administrateur`);
        break;
      case 'promoted':
        console.log(`✅ ${emailArg} a été promu administrateur (anciennement: ${result.user.role})`);
        break;
      case 'already_admin':
        console.log(`ℹ️  ${emailArg} est déjà administrateur`);
        break;
    }

    // Afficher la liste des administrateurs
    const admins = await listAdmins(client);
    displayAdmins(admins);

    process.exit(0);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Erreur lors de la création de l'administrateur: ${errorMessage}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Exécuter le script
main();
