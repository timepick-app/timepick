import request from 'supertest';
import jwt from 'jsonwebtoken';
import { testServer } from '../helpers/test-server';
import pool from '../../db/pool'

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_for_testing';

// Helper to create a test user
const createTestUser = async (overrides: { email?: string; first_name?: string; role?: string } = {}) => {
  const timestamp = Date.now();
  const email = overrides.email || `test-refresh-${timestamp}@test.com`;
  const firstName = overrides.first_name || `Test User ${timestamp}`;
  const result = await pool.query(
    `INSERT INTO users (email, first_name, role)
     VALUES ($1, $2, $3)
     RETURNING id, email, first_name, role`,
    [email, firstName, overrides.role || 'admin']
  );
  return result.rows[0];
};

// Helper pour créer un token JWT de session valide
const createSessionToken = (userId: string, role: string, iat?: number) => {
  const payload: { userId: string; role: string; iat?: number } = { userId, role };
  if (iat !== undefined) {
    payload.iat = iat;
  }
  // 2 heures par défaut
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
};

// Helper pour créer un token expiré
const createExpiredToken = (userId: string, role: string) => {
  const payload = { userId, role };
  const exp = Math.floor(Date.now() / 1000) - 3600; // Expiré il y a 1 heure
  return jwt.sign({ ...payload, exp }, JWT_SECRET);
};

describe('POST /api/auth/refresh - Session Refresh', () => {
  afterAll(async () => {
    // Clean up test data
    await pool.query("DELETE FROM users WHERE email LIKE 'test-refresh-%@test.com'");
    // Restore default session_ttl
    await pool.query("INSERT INTO app_config (key, value) VALUES ('session_ttl', '7200') ON CONFLICT (key) DO UPDATE SET value = '7200'");
  });

  afterEach(async () => {
    // Clean up created test users
    await pool.query("DELETE FROM users WHERE email LIKE 'test-refresh-%@test.com'");
    // Nettoyage des événements créés par le test hasMemberAccess=true (story 1.4)
    await pool.query("DELETE FROM events WHERE name LIKE 'Refresh HasMember Event%'");
    // Reset app_config to default after each test that modifies it
    await pool.query("INSERT INTO app_config (key, value) VALUES ('session_ttl', '7200') ON CONFLICT (key) DO UPDATE SET value = '7200'");
  });

  describe('Authentication', () => {
    it('retourne 401 si pas de header Authorization', async () => {
      const res = await request(testServer())
        .post('/api/auth/refresh')
        .send();

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('retourne 401 si token est invalide', async () => {
      const res = await request(testServer())
        .post('/api/auth/refresh')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });

    it('retourne 401 si token est expiré', async () => {
      const user = await createTestUser();
      const expiredToken = createExpiredToken(user.id, user.role);

      const res = await request(testServer())
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      // Le middleware requireAuth retourne une string pour le token expiré
      expect(res.body.error || res.text).toBeDefined();
    });
  });

  describe('Refresh réussi', () => {
    it('retourne 200 avec un nouveau token', async () => {
      const user = await createTestUser({ role: 'admin' });
      // Créer un token avec un iat dans le passé pour simuler une session existante
      const pastIat = Math.floor(Date.now() / 1000) - 3600; // Il y a 1 heure
      const sessionToken = createSessionToken(user.id, user.role, pastIat);

      const res = await request(testServer())
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data).toHaveProperty('expiresAt');
      // Le nouveau token doit être différent de l'ancien
      expect(res.body.data.token).not.toBe(sessionToken);
    });

    it('le nouveau token a une expiration étendue', async () => {
      const user = await createTestUser();
      // Créer un token avec un iat dans le passé pour simuler une session existante
      const pastIat = Math.floor(Date.now() / 1000) - 3600; // Il y a 1 heure
      const sessionToken = createSessionToken(user.id, user.role, pastIat);

      // Décoder l'ancien token pour obtenir son expiration
      const oldDecoded = jwt.decode(sessionToken) as { exp: number };

      const res = await request(testServer())
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(res.status).toBe(200);

      const newDecoded = jwt.decode(res.body.data.token) as { exp: number };
      // Le nouveau token doit expirer PLUS TARD que l'ancien
      expect(newDecoded.exp).toBeGreaterThan(oldDecoded.exp);

      // expiresAt dans la réponse doit correspondre au token
      expect(res.body.data.expiresAt).toBe(newDecoded.exp);
    });

    it('utilise le sessionTTL configuré pour le nouveau token', async () => {
      const user = await createTestUser();

      // Configurer un sessionTTL de 1 heure (3600 secondes)
      await pool.query(
        `INSERT INTO app_config (key, value) VALUES ('session_ttl', '3600')
         ON CONFLICT (key) DO UPDATE SET value = '3600'`
      );

      const sessionToken = createSessionToken(user.id, user.role);

      const res = await request(testServer())
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(res.status).toBe(200);

      const newDecoded = jwt.decode(res.body.data.token) as { exp: number };
      const expectedExp = Math.floor(Date.now() / 1000) + 3600;
      // Tolérance de 5 secondes pour le temps d'exécution
      expect(newDecoded.exp).toBeGreaterThanOrEqual(expectedExp - 2);
      expect(newDecoded.exp).toBeLessThanOrEqual(expectedExp + 5);
    });

    it('fonctionne pour les utilisateurs de rôle user (membre)', async () => {
      const user = await createTestUser({ role: 'user' });
      const sessionToken = createSessionToken(user.id, user.role);

      const res = await request(testServer())
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('token');
    });

    it('le nouveau token contient hasMemberAccess recalculé depuis la DB (D8 story 1.4)', async () => {
      const user = await createTestUser({ role: 'admin' });
      const sessionToken = createSessionToken(user.id, user.role);

      const res = await request(testServer())
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(res.status).toBe(200);
      const decoded = jwt.decode(res.body.data.token) as { hasMemberAccess?: boolean };
      // Admin sans event_users → false (recalculé à la volée via EXISTS, D1).
      expect(decoded.hasMemberAccess).toBe(false);
    });

    it('le nouveau token contient hasMemberAccess=true pour un membre rattaché à un événement (D8 story 1.4)', async () => {
      const user = await createTestUser({ role: 'user' });
      // Rattacher le membre à un événement publié via event_users (PK event_id+user_id).
      const event = await pool.query(
        `INSERT INTO events (name, is_published) VALUES ($1, true) RETURNING id`,
        [`Refresh HasMember Event ${Date.now()}`]
      );
      await pool.query('INSERT INTO event_users (event_id, user_id) VALUES ($1, $2)', [
        event.rows[0].id,
        user.id,
      ]);

      const sessionToken = createSessionToken(user.id, user.role);

      const res = await request(testServer())
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(res.status).toBe(200);
      const decoded = jwt.decode(res.body.data.token) as { hasMemberAccess?: boolean };
      // Membre rattaché → EXISTS(event_users) vrai, recalculé à la volée (D1/D8 story 1.4).
      expect(decoded.hasMemberAccess).toBe(true);
    });

    it('retourne 401 si l\'utilisateur a été supprimé', async () => {
      const user = await createTestUser();
      const sessionToken = createSessionToken(user.id, user.role);

      // Supprimer l'utilisateur
      await pool.query('DELETE FROM users WHERE id = $1', [user.id]);

      const res = await request(testServer())
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(res.status).toBe(401);
      // Le middleware vérifie l'existence de l'utilisateur et retourne 401
      // Le message peut venir du middleware ou du controller
      expect(res.body.error || res.text).toBeDefined();
    });
  });

  describe('Structure de réponse', () => {
    it('retourne token et expiresAt au format camelCase', async () => {
      const user = await createTestUser();
      const sessionToken = createSessionToken(user.id, user.role);

      const res = await request(testServer())
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data).toHaveProperty('expiresAt');
      expect(typeof res.body.data.token).toBe('string');
      expect(typeof res.body.data.expiresAt).toBe('number');
    });
  });
});
