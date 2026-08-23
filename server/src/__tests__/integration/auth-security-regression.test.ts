/**
 * Régression post-validation pentest (engagement timepick-local, session).
 * Couvre les 6 findings VALIDATED corrigés dans ce lot :
 *   - F-080 : JWT_SECRET faible/défaut → fail-fast au boot (secret-bootstrap.ts)
 *   - F-083 : absence de rate-limit sur /api/auth/login
 *   - F-082 : canal de timing révélant l'existence d'un compte au login
 *   - F-081 : oracle d'énumération resend-invitation via le rate-limit
 *   - F-084 : bypass du limiter resend via eventId variable
 *   - F-085 : aucune révocation/rotation de session (logout, token_version)
 *
 * Timing : on n'asserte jamais une durée précise (flaky) — seulement l'uniformité
 * comportementale (même statut, même corps, même comportement de throttle).
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { testServer } from '../helpers/test-server';
import pool from '../../db/pool';
import * as emailService from '../../services/email-send.service';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_for_testing';

const createTestUser = async (overrides: { email?: string; role?: string } = {}) => {
  const timestamp = Date.now();
  const suffix = Math.random().toString(36).slice(2);
  const email = overrides.email || `test-secreg-${timestamp}-${suffix}@test.com`;
  const result = await pool.query(
    `INSERT INTO users (email, first_name, last_name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, role, token_version`,
    [email, 'Sec', 'Regression', overrides.role || 'user']
  );
  return result.rows[0];
};

const sessionToken = (userId: string, role: string, tv: number, expOffset = 7200) =>
  jwt.sign(
    { userId, role, tv, exp: Math.floor(Date.now() / 1000) + expOffset },
    JWT_SECRET
  );

describe('Régression sécurité — session auth (pentest timepick-local)', () => {
  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE 'test-secreg-%@test.com'");
  });

  // -------------------------------------------------------------------------
  // (a) F-080 — fail-fast au boot sur secret faible (fonction de validation,
  //     pas le boot complet : ensureSecret()/JWT_SECRET_SPEC directement).
  // -------------------------------------------------------------------------
  describe('(a) F-080 — JWT_SECRET faible → fail-fast', () => {
    const savedJwtSecret = process.env.JWT_SECRET;
    const savedDataDir = process.env.DATA_DIR;
    let dataDir: string;

    beforeEach(() => {
      jest.resetModules();
      dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-security-regression-'));
      process.env.DATA_DIR = dataDir;
      delete process.env.JWT_SECRET;
    });

    afterEach(() => {
      fs.rmSync(dataDir, { recursive: true, force: true });
      if (savedJwtSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = savedJwtSecret;
      if (savedDataDir === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = savedDataDir;
    });

    const load = () => import('../../utils/secret-bootstrap');

    it('secret < 32 caractères → ensureSecret lève, sans divulguer la valeur', async () => {
      const { ensureSecret, JWT_SECRET_SPEC } = await load();
      process.env.JWT_SECRET = 'super_secret_dev_key_change_me'; // 30 chars — valeur réellement trouvée dans server/.env avant correctif

      expect(() => ensureSecret(JWT_SECRET_SPEC)).toThrow(/at least 32 characters/);
      expect(() => ensureSecret(JWT_SECRET_SPEC)).not.toThrow(/super_secret_dev_key_change_me/);
    });

    it('secret ≥ 32 caractères mais motif dictionnaire connu → ensureSecret lève', async () => {
      const { ensureSecret, JWT_SECRET_SPEC } = await load();
      process.env.JWT_SECRET = 'your_super_secret_jwt_key_padded_to_32chars';

      expect(() => ensureSecret(JWT_SECRET_SPEC)).toThrow(/weak\/placeholder pattern/);
    });

    it('secret CSPRNG plausible (≥32 chars, hors motifs connus) → accepté', async () => {
      const { ensureSecret, JWT_SECRET_SPEC } = await load();
      process.env.JWT_SECRET = 'Nq8fVw3zRk6pLb1yTc4mGh9xJs2dEo7u';

      expect(ensureSecret(JWT_SECRET_SPEC)).toBe('env');
    });
  });

  // -------------------------------------------------------------------------
  // (b) F-082 + F-083 — login : uniformité + rate-limit
  // -------------------------------------------------------------------------
  describe('(b) F-082/F-083 — POST /api/auth/login', () => {
    beforeEach(() => {
      jest.spyOn(emailService, 'sendUserMagicLinkEmail').mockResolvedValue(true);
      jest.spyOn(emailService, 'sendAdminMagicLinkEmail').mockResolvedValue(true);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('email existant vs inexistant → statut et corps strictement identiques (F-082)', async () => {
      const user = await createTestUser();

      const resFound = await request(testServer())
        .post('/api/auth/login')
        .send({ email: user.email });
      const resNotFound = await request(testServer())
        .post('/api/auth/login')
        .send({ email: `test-secreg-nf-${Date.now()}@test.com` });

      expect(resFound.status).toBe(200);
      expect(resNotFound.status).toBe(200);
      expect(resFound.body).toEqual(resNotFound.body);
    });

    it('6e requête sur le même email cible en moins de 60s → 429 RATE_LIMITED (F-083)', async () => {
      const targetEmail = `test-secreg-flood-${Date.now()}@test.com`;

      const responses = [];
      for (let i = 0; i < 6; i++) {
        responses.push(
          await request(testServer()).post('/api/auth/login').send({ email: targetEmail })
        );
      }

      const statuses = responses.map((r) => r.status);
      expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
      expect(statuses[5]).toBe(429);
      expect(responses[5].body.error.code).toBe('RATE_LIMITED');
    });
  });

  // -------------------------------------------------------------------------
  // (c) F-081 + F-084 — resend-invitation : matrice 2×2 indistinguable
  // -------------------------------------------------------------------------
  describe('(c) F-081/F-084 — POST /api/auth/resend-invitation', () => {
    beforeEach(() => {
      jest.spyOn(emailService, 'sendUserMagicLinkEmail').mockResolvedValue(true);
      jest.spyOn(emailService, 'sendAdminMagicLinkEmail').mockResolvedValue(true);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    const identityToken = (userId: string) =>
      jwt.sign({ userId, exp: Math.floor(Date.now() / 1000) - 3600 }, JWT_SECRET);

    it('matrice 2×2 userId existant/inexistant : même statut sur le 1er appel ET sur le throttle', async () => {
      const user = await createTestUser();
      const nonexistentUserId = '99999999-9999-4999-8999-999999999999';

      const tokenExisting = identityToken(user.id);
      const tokenMissing = identityToken(nonexistentUserId);

      // 1ers appels : indistinguables (200 dans les deux cas)
      const firstExisting = await request(testServer())
        .post('/api/auth/resend-invitation')
        .send({ token: tokenExisting });
      const firstMissing = await request(testServer())
        .post('/api/auth/resend-invitation')
        .send({ token: tokenMissing });

      expect(firstExisting.status).toBe(200);
      expect(firstMissing.status).toBe(200);
      expect(firstExisting.body).toEqual(firstMissing.body);

      // 2es appels (même token, immédiat) : throttle identique (429) dans les deux cas —
      // AVANT le correctif, seul le cas "existant" recevait 429 (oracle F-081).
      const secondExisting = await request(testServer())
        .post('/api/auth/resend-invitation')
        .send({ token: tokenExisting });
      const secondMissing = await request(testServer())
        .post('/api/auth/resend-invitation')
        .send({ token: tokenMissing });

      expect(secondExisting.status).toBe(429);
      expect(secondMissing.status).toBe(429);
      expect(secondExisting.body.error.code).toBe('RATE_LIMITED');
      expect(secondMissing.body.error.code).toBe('RATE_LIMITED');
    });

    it('bypass via eventId variable neutralisé : 2e requête (eventId différent, même userId) → 429 (F-084)', async () => {
      const user = await createTestUser();
      const idToken = identityToken(user.id);

      const first = await request(testServer())
        .post('/api/auth/resend-invitation')
        .send({ token: idToken });
      expect(first.status).toBe(200);

      // Avant le correctif : un eventId aléatoire différent à chaque appel ouvrait un
      // nouveau bucket de throttle et contournait la limite indéfiniment.
      const evToken = jwt.sign(
        { userId: user.id, eventId: 'evt-regression-bypass', exp: Math.floor(Date.now() / 1000) - 3600 },
        JWT_SECRET
      );
      const second = await request(testServer())
        .post('/api/auth/resend-invitation')
        .send({ token: evToken });

      expect(second.status).toBe(429);
      expect(second.body.error.code).toBe('RATE_LIMITED');
    });
  });

  // -------------------------------------------------------------------------
  // (d) F-085 — logout révoque la session ; un nouveau token reste valide
  // -------------------------------------------------------------------------
  describe('(d) F-085 — POST /api/auth/logout', () => {
    it('logout : ancien token → 401 sur une route protégée ; un token frais (tv à jour) → OK', async () => {
      const user = await createTestUser();
      const oldToken = sessionToken(user.id, user.role, user.token_version);

      // La session fonctionne avant logout
      const before = await request(testServer())
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${oldToken}`);
      expect(before.status).toBe(200);

      // Logout : incrémente token_version
      const logoutRes = await request(testServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${oldToken}`);
      expect(logoutRes.status).toBe(200);

      // L'ANCIEN token (tv périmé) est désormais rejeté
      const afterOld = await request(testServer())
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${oldToken}`);
      expect(afterOld.status).toBe(401);
      expect(afterOld.body.code).toBe('SESSION_INVALID');

      // Un login frais (tv à jour, lu en DB après logout) fonctionne
      const dbRow = await pool.query('SELECT token_version FROM users WHERE id = $1', [user.id]);
      const freshToken = sessionToken(user.id, user.role, dbRow.rows[0].token_version);
      const afterFresh = await request(testServer())
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${freshToken}`);
      expect(afterFresh.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // (e) Défense existante (garde de régression) — token d'un user supprimé → 401
  // -------------------------------------------------------------------------
  describe('(e) garde de régression — token d\'un utilisateur supprimé', () => {
    it('un token valide (signature + tv) pour un user supprimé entre-temps → 401', async () => {
      const user = await createTestUser();
      const token = sessionToken(user.id, user.role, user.token_version);

      await pool.query('DELETE FROM users WHERE id = $1', [user.id]);

      const res = await request(testServer())
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_INVALID');
    });
  });
});
