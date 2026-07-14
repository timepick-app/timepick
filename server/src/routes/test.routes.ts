import { Router } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db/pool';

const router = Router();

/**
 * Test Routes - Routes utilitaires pour les tests E2E et développement
 * NE PAS utiliser en production - ces routes sont désactivées par défaut
 *
 * Sécurité: Deux couches de protection :
 * 1. ALLOW_TEST_ROUTES doit être explicitement 'true' (défaut: undefined/false)
 * 2. NODE_ENV ne doit pas être 'production'
 */

/**
 * Vérifie si les routes de test sont autorisées
 */
function areTestRoutesAllowed(): boolean {
  // Les routes doivent être explicitement autorisées ET on ne doit pas être en production
  return process.env.ALLOW_TEST_ROUTES === 'true' && process.env.NODE_ENV !== 'production';
}

/**
 * DELETE /api/test/cleanup/admins
 * Supprime tous les utilisateurs admin (pour tests E2E uniquement)
 */
router.delete('/cleanup/admins', async (req, res) => {
  try {
    if (!areTestRoutesAllowed()) {
      return res.status(403).json({ error: 'Non disponible en production' });
    }

    await pool.query("DELETE FROM users WHERE role = 'admin'");
    res.json({ message: 'Admins supprimés' });
  } catch (err) {
    console.error('Error cleaning up admins:', err);
    res.status(500).json({ error: 'Server Error' });
  }
});

/**
 * POST /api/test/users
 * Crée un utilisateur sans authentification (pour tests E2E uniquement)
 */
router.post('/users', async (req, res) => {
  try {
    if (!areTestRoutesAllowed()) {
      return res.status(403).json({ error: 'Non disponible en production' });
    }

    const { email, full_name, role = 'user' } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email requis' });
    }

    // Idempotent : un email déjà présent (réexécution des suites E2E sur la base
    // partagée) ne doit pas remonter une violation de contrainte unique en 500.
    // ON CONFLICT met à jour le nom/rôle et renvoie toujours la row — « ensure ».
    const result = await pool.query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
         SET first_name = EXCLUDED.first_name, role = EXCLUDED.role
       RETURNING id, email, first_name, last_name, role, created_at`,
      [email, full_name || 'Test User', role]
    );

    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    console.error('Error creating test user:', err);
    res.status(500).json({ error: 'Server Error' });
  }
});

/**
 * DELETE /api/test/users/:email
 * Supprime un utilisateur par email (pour tests E2E uniquement)
 */
router.delete('/users/:email', async (req, res) => {
  try {
    if (!areTestRoutesAllowed()) {
      return res.status(403).json({ error: 'Non disponible en production' });
    }

    const { email } = req.params;
    await pool.query('DELETE FROM users WHERE email = $1', [email]);
    res.json({ message: `Utilisateur ${email} supprimé` });
  } catch (err) {
    console.error('Error deleting test user:', err);
    res.status(500).json({ error: 'Server Error' });
  }
});

/**
 * POST /api/test/login
 * Génère un token JWT valide pour les tests E2E
 *
 * Body: { email: string }
 * Response: { token: string, user: { id, email, firstName, lastName, role } }
 *
 * Utilisation dans les tests:
 * 1. Créer un admin: POST /api/test/users { email: "test@test.local", role: "admin" }
 * 2. Obtenir un token: POST /api/test/login { email: "test@test.local" }
 * 3. Utiliser le token dans localStorage
 */
router.post('/login', async (req, res) => {
  try {
    if (!areTestRoutesAllowed()) {
      return res.status(403).json({ error: 'Non disponible en production' });
    }

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email requis' });
    }

    // Récupérer l'utilisateur
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, role FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const user = result.rows[0];

    // Générer un token JWT valide (expire dans 2 heures)
    const JWT_SECRET = process.env.JWT_SECRET!;
    const exp = Math.floor(Date.now() / 1000) + 7200; // 2 heures

    const token = jwt.sign(
      { userId: user.id, exp },
      JWT_SECRET
    );

    // Stocker le token en base (comme le flux normal)
    await pool.query(
      `UPDATE users SET magic_link_token = $1, token_expires_at = to_timestamp($2) WHERE id = $3`,
      [token, exp, user.id]
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Error generating test token:', err);
    res.status(500).json({ error: 'Server Error' });
  }
});

/**
 * DELETE /api/test/shell-parts/:ownerKind/:ownerId
 * Supprime toutes les rows shell_parts pour un (owner_kind, owner_id) — utilisé
 * par les smokes Playwright 26-2d pour réinitialiser l'état entre tests
 * (le panneau d'héritage ne s'ouvre pas si `origin === ownerKind` côté client,
 * cf. AC5 — on doit pouvoir repartir d'un état "pas de surcharge").
 */
router.delete('/shell-parts/:ownerKind/:ownerId', async (req, res) => {
  try {
    if (!areTestRoutesAllowed()) {
      return res.status(403).json({ error: 'Non disponible en production' });
    }

    const { ownerKind, ownerId } = req.params;
    await pool.query(
      'DELETE FROM shell_parts WHERE owner_kind = $1 AND owner_id = $2',
      [ownerKind, ownerId]
    );
    res.json({ message: `shell_parts supprimés pour ${ownerKind}/${ownerId}` });
  } catch (err) {
    console.error('Error deleting test shell_parts:', err);
    res.status(500).json({ error: 'Server Error' });
  }
});

/**
 * GET /api/test/boom
 * Lève une erreur async NON catchée — sert à vérifier que le filet de sécurité
 * global (app.ts) renvoie un 500 propre au lieu de laisser la requête sans réponse.
 * Gated comme les autres routes de test (jamais montée en production).
 */
router.get('/boom', async (_req, res) => {
  if (!areTestRoutesAllowed()) {
    res.status(403).json({ error: 'Non disponible en production' });
    return;
  }
  // Volontairement NON catchée : Express 5 transmet le rejet au handler global.
  throw new Error('boom: erreur de test non gérée');
});

export default router;
