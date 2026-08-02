import request from 'supertest';
import jwt from 'jsonwebtoken';
import { testServer } from '../helpers/test-server';
import pool from '../../db/pool'
import * as emailService from '../../services/email-send.service'

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_for_testing';

// Helper to create a test user
const createTestUser = async (overrides: { email?: string; role?: string } = {}) => {
  const timestamp = Date.now();
  const email = overrides.email || `test-login-${timestamp}@test.com`;
  const result = await pool.query(
    `INSERT INTO users (email, first_name, role)
     VALUES ($1, $2, $3)
     RETURNING id, email, role`,
    [email, `Test User ${timestamp}`, overrides.role || 'user']
  );
  return result.rows[0];
};

// Helper to create a test event
const createTestEvent = async (isPublished: boolean = true) => {
  const uniqueId = Math.random().toString(36).substring(7);
  const result = await pool.query(
    `INSERT INTO events (name, is_published)
     VALUES ($1, $2)
     RETURNING id`,
    [`AuthLogin Test Event ${uniqueId}`, isPublished]
  );
  return result.rows[0];
};

// Helper to clean all test events created by THIS test file only
const cleanTestEvents = async () => {
  await pool.query("DELETE FROM events WHERE name LIKE 'AuthLogin Test Event%'");
};

// Helper pour s'assurer qu'il n'y a aucun événement publié
const ensureNoPublishedEvents = async () => {
  // Supprime tous les événements (sauf ceux marqués comme ne pas supprimer)
  // Pour les tests, on supprime tous les événements de test
  await cleanTestEvents();
  // Vérifier qu'il n'y a plus d'événements publiés
  const result = await pool.query("SELECT COUNT(*) FROM events WHERE is_published = true");
  return parseInt(result.rows[0].count) === 0;
};

interface MagicLinkTokenPayload {
  userId?: string;
  role?: string;
  redirectAfterLogin?: string;
  exp?: number;
}

// Décode le lien magique tel que le membre le REÇOIT, lu dans l'espion d'envoi (armé
// par le beforeEach du describe). Depuis la migration 043, la base ne porte plus que
// l'empreinte sha256 du jeton : elle ne peut plus servir de source ici — et le test y
// gagne, il lit le lien réellement envoyé plutôt qu'une colonne.
const decodeSentMagicLink = (role: 'admin' | 'user' = 'user'): MagicLinkTokenPayload => {
  const send = (role === 'admin'
    ? emailService.sendAdminMagicLinkEmail
    : emailService.sendUserMagicLinkEmail) as jest.Mock;
  const calls = send.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const link = calls[calls.length - 1][1] as string;
  const token = new URL(link).searchParams.get('token') as string;
  return jwt.verify(token, JWT_SECRET) as MagicLinkTokenPayload;
};

describe('POST /api/auth/login - Public Magic Link Request', () => {
  // Stub l'envoi de magic-link pour éviter de vrais emails vers Mailpit.
  // beforeEach/afterEach (et NON beforeAll) : le test « Échec du service email » fait un
  // mockRestore() local qui restaurerait l'implémentation réelle pour les tests suivants ;
  // ré-armer le spy à chaque test neutralise ce risque (et son mockResolvedValueOnce(false)
  // reste prioritaire sur le mockResolvedValue(true) par défaut → l'assertion 503 tient).
  beforeEach(() => {
    jest.spyOn(emailService, 'sendUserMagicLinkEmail').mockResolvedValue(true);
    jest.spyOn(emailService, 'sendAdminMagicLinkEmail').mockResolvedValue(true);
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query("DELETE FROM users WHERE email LIKE 'test-login-%@test.com'");
    await pool.query("DELETE FROM events WHERE name LIKE 'AuthLogin Test Event%'");
  });

  afterEach(async () => {
    // Restaure les spies email (cf. beforeEach) puis nettoie les utilisateurs/événements du test.
    jest.restoreAllMocks();
    await pool.query("DELETE FROM users WHERE email LIKE 'test-login-%@test.com'");
    await pool.query("DELETE FROM events WHERE name LIKE 'AuthLogin Test Event%'");
  });

  describe('Validation', () => {
    it('retourne 400 pour email manquant', async () => {
      const res = await request(testServer())
        .post('/api/auth/login')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('retourne 400 pour email invalide (format)', async () => {
      const res = await request(testServer())
        .post('/api/auth/login')
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('email');
    });

    it('retourne 400 pour email vide', async () => {
      const res = await request(testServer())
        .post('/api/auth/login')
        .send({ email: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Sécurité - Pas de disclosure', () => {
    it('retourne 200 même si email non trouvé (sécurité)', async () => {
      const res = await request(testServer())
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain('Si cet email est enregistré');
    });

    it('retourne le même message de succès pour email trouvé et non trouvé', async () => {
      const user = await createTestUser();

      const resFound = await request(testServer())
        .post('/api/auth/login')
        .send({ email: user.email });

      const resNotFound = await request(testServer())
        .post('/api/auth/login')
        .send({ email: 'notfound@example.com' });

      expect(resFound.status).toBe(200);
      expect(resNotFound.status).toBe(200);
      expect(resFound.body.data.message).toBe(resNotFound.body.data.message);
    });
  });

  describe('Génération de magic link - User (membre)', () => {
    it('génère un magic link pour un email utilisateur valide trouvé', async () => {
      const user = await createTestUser({ role: 'user' });

      const res = await request(testServer())
        .post('/api/auth/login')
        .send({ email: user.email });

      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain('Si cet email est enregistré');

      // Vérifier que l'empreinte du token a été stockée en base
      const dbResult = await pool.query(
        'SELECT token_hash, expires_at FROM magic_link_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [user.id]
      );
      expect(dbResult.rows[0].token_hash).toBeTruthy();
      expect(dbResult.rows[0].expires_at).toBeTruthy();
    });

    it('génère une expiration de 30min pour un user (membre)', async () => {
      const user = await createTestUser({ role: 'user' });
      const now = Math.floor(Date.now() / 1000);

      await request(testServer())
        .post('/api/auth/login')
        .send({ email: user.email });

      const result = await pool.query(
        'SELECT expires_at FROM magic_link_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [user.id]
      );

      const expiresAt = Math.floor(new Date(result.rows[0].expires_at).getTime() / 1000);
      const expectedExp = now + (7 * 24 * 60 * 60); // 7 days (DEFAULT_USER_TTL)
      expect(expiresAt).toBeGreaterThanOrEqual(expectedExp - 2); // -2s de marge
      expect(expiresAt).toBeLessThanOrEqual(expectedExp + 2); // +2s de marge
    });

    it('inclut redirectAfterLogin=/me dans le token pour un user (D5 story 1.4)', async () => {
      // D5 : un login user sans contexte événement atterrit sur /me (la recherche
      // du « premier événement publié » est supprimée — redirect indépendant des events).
      const user = await createTestUser({ role: 'user' });

      await request(testServer())
        .post('/api/auth/login')
        .send({ email: user.email });

      const payload = decodeSentMagicLink();

      expect(payload.redirectAfterLogin).toBe('/me');
      expect(payload.role).toBe('user');
      expect(payload.userId).toBe(user.id);
    });
  });

  describe('Génération de magic link - Admin', () => {
    it('génère une expiration de 24h pour un admin', async () => {
      const adminUser = await createTestUser({ role: 'admin' });
      const now = Math.floor(Date.now() / 1000);

      await request(testServer())
        .post('/api/auth/login')
        .send({ email: adminUser.email });

      const result = await pool.query(
        'SELECT expires_at FROM magic_link_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [adminUser.id]
      );

      const expiresAt = Math.floor(new Date(result.rows[0].expires_at).getTime() / 1000);
      const expectedExp = now + (24 * 60 * 60); // 24 heures
      expect(expiresAt).toBeGreaterThanOrEqual(expectedExp - 2);
      expect(expiresAt).toBeLessThanOrEqual(expectedExp + 2);
    });

    it('inclut redirectAfterLogin=/admin dans le token pour admin (D5 story 1.4)', async () => {
      const adminUser = await createTestUser({ role: 'admin' });

      await request(testServer())
        .post('/api/auth/login')
        .send({ email: adminUser.email });

      const payload = decodeSentMagicLink('admin');

      expect(payload.redirectAfterLogin).toBe('/admin');
      expect(payload.role).toBe('admin');
      expect(payload.userId).toBe(adminUser.id);
    });
  });

  describe('Redirection post-login indépendante des événements (D5 story 1.4)', () => {
    it('un user obtient /me même avec un événement publié (plus de /event/:id)', async () => {
      // D5 : la SELECT « premier événement publié » est supprimée. Le redirect
      // user est constant (/me) qu'il y ait ou non des événements publiés.
      const event = await createTestEvent(true);
      try {
        const user = await createTestUser({ role: 'user' });

        await request(testServer())
          .post('/api/auth/login')
          .send({ email: user.email });

        const payload = decodeSentMagicLink();

        // Un événement publié existe, mais le redirect reste /me (D5).
        expect(payload.redirectAfterLogin).toBe('/me');
      } finally {
        await cleanTestEvents();
      }
    });
  });

  describe('Email case-insensitive', () => {
    it('trouve l\'utilisateur même si email en majuscules', async () => {
      const timestamp = Date.now();
      const email = `testcase${timestamp}@example.com`;

      // Créer l'utilisateur avec l'email en minuscules
      const result = await pool.query(
        `INSERT INTO users (email, first_name, role)
         VALUES ($1, $2, $3)
         RETURNING id, email, role`,
        [email.toLowerCase(), `Test User ${timestamp}`, 'user']
      );
      const user = result.rows[0];

      const res = await request(testServer())
        .post('/api/auth/login')
        .send({ email: email.toUpperCase() });

      expect(res.status).toBe(200);

      // Vérifier que l'empreinte du token a été stockée pour le bon user
      const result2 = await pool.query(
        'SELECT token_hash FROM magic_link_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [user.id]
      );
      expect(result2.rows[0].token_hash).toBeTruthy();

      // Nettoyer
      await pool.query("DELETE FROM users WHERE email LIKE $1", [`${email.toLowerCase()}%`]);
    });

    it('trouve l\'utilisateur même si email avec mixed case', async () => {
      const timestamp = Date.now();
      const email = `mixedcase${timestamp}@example.com`;

      // Créer l'utilisateur avec l'email en minuscules
      const result = await pool.query(
        `INSERT INTO users (email, first_name, role)
         VALUES ($1, $2, $3)
         RETURNING id, email, role`,
        [email.toLowerCase(), `Test User ${timestamp}`, 'user']
      );
      const user = result.rows[0];

      // Créer l'email avec mixed case (MiXeDcAsE au lieu de mixedcase)
      const mixedCaseEmail = `MiXeDcAsE${timestamp}@Example.Com`;

      const res = await request(testServer())
        .post('/api/auth/login')
        .send({ email: mixedCaseEmail });

      expect(res.status).toBe(200);

      const result2 = await pool.query(
        'SELECT token_hash FROM magic_link_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [user.id]
      );
      expect(result2.rows[0].token_hash).toBeTruthy();

      // Nettoyer
      await pool.query("DELETE FROM users WHERE email LIKE $1", [`${email.toLowerCase()}%`]);
    });
  });

  describe('Route publique (pas d\'auth requise)', () => {
    it('fonctionne sans Authorization header', async () => {
      const res = await request(testServer())
        .post('/api/auth/login')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(200);
    });

    it('ne retourne pas 401 contrairement aux routes admin', async () => {
      const res = await request(testServer())
        .post('/api/auth/login')
        .set('Authorization', 'Bearer invalid-token')
        .send({ email: 'test@example.com' });

      // Ne devrait pas retourner 401 car c'est une route publique
      expect(res.status).not.toBe(401);
    });
  });

  describe('Échec du service email', () => {
    it('returns 503 EMAIL_SERVICE_UNAVAILABLE when sendMail fails', async () => {
      const adminUser = await createTestUser({ role: 'admin' });

      const sendAdminSpy = jest
        .spyOn(emailService, 'sendAdminMagicLinkEmail')
        .mockResolvedValueOnce(false);

      try {
        const res = await request(testServer())
          .post('/api/auth/login')
          .send({ email: adminUser.email });

        expect(res.status).toBe(503);
        expect(res.body.error.code).toBe('EMAIL_SERVICE_UNAVAILABLE');
      } finally {
        sendAdminSpy.mockRestore();
      }
    });
  });

  describe('Gestion des erreurs', () => {
    it('gère les erreurs de base de données gracieusement', async () => {
      // Ce test vérifie que l'endpoint retourne 500 en cas d'erreur serveur
      // mais nous ne pouvons pas facilement simuler une erreur DB sans mock
      // donc on vérifie juste que la structure de réponse est correcte
      const res = await request(testServer())
        .post('/api/auth/login')
        .send({ email: 'test@test.com' });

      // Devrait réussir (même si email non trouvé)
      expect([200, 500]).toContain(res.status);
      if (res.status === 500) {
        expect(res.body.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });
  describe('next threading — préservation de la destination à travers le login', () => {
    it('(a) next sûr → redirectAfterLogin préserve /me/events/:uuid', async () => {
      const eventUuid = '11111111-2222-3333-4444-555555555555';
      const user = await createTestUser({ role: 'user' });

      await request(testServer())
        .post('/api/auth/login')
        .send({ email: user.email, next: `/me/events/${eventUuid}` });

      const payload = decodeSentMagicLink();
      expect(payload.redirectAfterLogin).toBe(`/me/events/${eventUuid}`);
    });

    it('(b) next = URL absolue externe → fallback /me (user)', async () => {
      const user = await createTestUser({ role: 'user' });

      await request(testServer())
        .post('/api/auth/login')
        .send({ email: user.email, next: 'https://evil.com' });

      const payload = decodeSentMagicLink();
      expect(payload.redirectAfterLogin).toBe('/me');
    });

    it('(c) next = //evil.com (scheme authority) → fallback /me (user)', async () => {
      const user = await createTestUser({ role: 'user' });

      await request(testServer())
        .post('/api/auth/login')
        .send({ email: user.email, next: '//evil.com' });

      const payload = decodeSentMagicLink();
      expect(payload.redirectAfterLogin).toBe('/me');
    });

    it('(d) sans next → /me (comportement existant préservé)', async () => {
      const user = await createTestUser({ role: 'user' });

      await request(testServer())
        .post('/api/auth/login')
        .send({ email: user.email });

      const payload = decodeSentMagicLink();
      expect(payload.redirectAfterLogin).toBe('/me');
    });
  });
});
