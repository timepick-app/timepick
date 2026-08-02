import request from 'supertest';
import jwt from 'jsonwebtoken';
import { testServer } from '../helpers/test-server';
import pool from '../../db/pool'

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_for_testing';

// Helper to generate admin token
const generateAdminToken = (userId: string) => {
  return jwt.sign({ userId, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
};

// Helper to create a test user
const createTestUser = async (role: string = 'user') => {
  const timestamp = Date.now();
  const result = await pool.query(
    `INSERT INTO users (email, first_name, role)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [`test-created-${timestamp}@test.com`, `Test User ${timestamp}`, role]
  );
  return result.rows[0];
};

describe('Auth Controller - POST /api/auth/generate-token', () => {
  let adminUserId: string;
  let adminToken: string;

  beforeAll(async () => {
    // Create an admin user for testing
    const result = await pool.query(
      `INSERT INTO users (email, first_name, role)
       VALUES ('test-admin-auth@test.com', 'Test Admin', 'admin')
       ON CONFLICT (email) DO UPDATE SET role = 'admin'
       RETURNING id`
    );
    adminUserId = result.rows[0].id;
    adminToken = generateAdminToken(adminUserId);
  });

  afterAll(async () => {
    // Clean up test data - ne supprimer que les données de CE test (pattern spécifique)
    await pool.query("DELETE FROM users WHERE email LIKE 'test-admin-auth@test.com' OR email LIKE 'test-created-%@test.com'");
    // Note: ne pas fermer pool.end() ici car cela affecterait les autres tests
  });

  afterEach(async () => {
    // Clean up created test users
    await pool.query("DELETE FROM users WHERE email LIKE 'test-created-%@test.com'");
  });

  describe('Authentication & Authorization', () => {
    it('retourne 401 sans admin token', async () => {
      const res = await request(testServer())
        .post('/api/auth/generate-token')
        .send({ userId: 'some-uuid' });

      expect(res.status).toBe(401);
    });

    it('retourne 401 avec token invalide', async () => {
      const res = await request(testServer())
        .post('/api/auth/generate-token')
        .set('Authorization', 'Bearer invalid-token')
        .send({ userId: 'some-uuid' });

      expect(res.status).toBe(401);
    });
  });

  describe('Validation', () => {
    it('retourne 400 pour userId manquant', async () => {
      const res = await request(testServer())
        .post('/api/auth/generate-token')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('retourne 400 pour userId invalide (pas UUID)', async () => {
      const res = await request(testServer())
        .post('/api/auth/generate-token')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: 'not-a-uuid' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('retourne 400 pour eventId invalide', async () => {
      const res = await request(testServer())
        .post('/api/auth/generate-token')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: adminUserId, eventId: 'not-a-uuid' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Génération de magic link', () => {
    it('génère un magic link pour un utilisateur existant', async () => {
      const user = await createTestUser('user');

      const res = await request(testServer())
        .post('/api/auth/generate-token')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: user.id });

      expect(res.status).toBe(200);
      expect(res.body.data.magicLink).toContain('/login?token=');
      expect(res.body.data.userId).toBe(user.id);
      expect(res.body.message).toBe('Magic link généré avec succès');
    });

    it('génère un magic link sans eventId (expiration 24h par défaut)', async () => {
      const user = await createTestUser();

      const res = await request(testServer())
        .post('/api/auth/generate-token')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: user.id });

      expect(res.status).toBe(200);
      expect(res.body.data.magicLink).toContain('/login?token=');

      // Vérifier que l'empreinte du token a été stockée en DB
      const dbResult = await pool.query(
        'SELECT token_hash, expires_at FROM magic_link_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [user.id]
      );
      expect(dbResult.rows[0].token_hash).toBeTruthy();
      expect(dbResult.rows[0].expires_at).toBeTruthy();

      // Vérifier que l'expiration est approximativement 24 heures (DEFAULT_ADMIN_TTL)
      const expirationTime = new Date(dbResult.rows[0].expires_at).getTime();
      const now = Date.now();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      expect(expirationTime).toBeGreaterThanOrEqual(now + twentyFourHoursMs - 2000); // -2s de marge (pour tenir compte du temps d'exécution)
      expect(expirationTime).toBeLessThanOrEqual(now + twentyFourHoursMs + 2000);
    });

    it('retourne 404 si utilisateur n\'existe pas', async () => {
      const res = await request(testServer())
        .post('/api/auth/generate-token')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: '00000000-0000-0000-0000-000000000000' }); // UUID valide mais inexistant

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
      expect(res.body.error.message).toBe('Utilisateur non trouvé');
    });
  });

  describe('Gestion des événements', () => {
    it('génère un magic link avec eventId (si l\'événement existe)', async () => {
      const user = await createTestUser();

      // Créer un événement de test
      const eventResult = await pool.query(
        `INSERT INTO events (name, end_date)
         VALUES ($1, $2)
         RETURNING id`,
        ['Test Event', new Date('2026-03-15T23:59:59Z')]
      );

      const eventId = eventResult.rows[0].id;

      const res = await request(testServer())
        .post('/api/auth/generate-token')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: user.id, eventId });

      expect(res.status).toBe(200);
      expect(res.body.data.eventId).toBe(eventId);

      // Nettoyer l'événement de test
      await pool.query('DELETE FROM events WHERE id = $1', [eventId]);
    });

    it('génère un magic link avec eventId inexistant (24h par défaut)', async () => {
      const user = await createTestUser();
      const nonExistentEventId = '00000000-0000-0000-0000-000000000000';

      const res = await request(testServer())
        .post('/api/auth/generate-token')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: user.id, eventId: nonExistentEventId });

      expect(res.status).toBe(200);
      expect(res.body.data.eventId).toBe(nonExistentEventId);

      // L'expiration devrait être 24 heures par défaut (DEFAULT_ADMIN_TTL)
      const dbResult = await pool.query(
        'SELECT expires_at FROM magic_link_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [user.id]
      );
      const expirationTime = new Date(dbResult.rows[0].expires_at).getTime();
      const now = Date.now();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      expect(expirationTime).toBeGreaterThanOrEqual(now + twentyFourHoursMs - 2000);
    });
  });
});
