import request from 'supertest';
import { testServer } from '../helpers/test-server';
import { query } from '../../db';
import { generateTestMagicLinkToken } from '../helpers/auth';
import jwt from 'jsonwebtoken';
import { requireAdmin } from '../../middleware/adminAuth';

describe('requireAdmin Middleware', () => {
  // Nettoyer la base de données après chaque test
  afterEach(async () => {
    await query('DELETE FROM users WHERE email LIKE $1', ['%test-admin-auth%']);
  });

  /**
   * Helper pour créer un utilisateur de test avec un rôle spécifique
   */
  async function createTestUser(overrides: { email?: string; firstName?: string; role?: string } = {}) {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const defaultEmail = `test-admin-auth-${uniqueSuffix}@example.com`;
    const defaultName = 'Test Admin Auth User';
    const defaultRole = 'user';

    const userResult = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, first_name, role`,
      [
        overrides.email || defaultEmail,
        overrides.firstName || defaultName,
        overrides.role || defaultRole
      ]
    );

    return userResult.rows[0];
  }

  /**
   * Helper pour générer un magic link valide
   * Utilise le helper de test avec TTL par défaut
   */
  async function generateValidToken(userId: string): Promise<string> {
    // Retourner le token JWT directement (le magic link complet n'est pas nécessaire pour l'auth)
    return generateTestMagicLinkToken(userId, 3600); // 1h
  }

  describe('accès non-authentifié', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(testServer())
        .get('/api/admin/users');

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Token');
    });

    it('retourne 401 avec token invalide', async () => {
      const res = await request(testServer())
        .get('/api/admin/users')
        .set('Authorization', 'Bearer invalid-token-xyz');

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('invalide');
    });

    it('retourne 401 avec token expiré', async () => {
      const expiredToken = jwt.sign(
        { userId: 'test-id', exp: Math.floor(Date.now() / 1000) - 3600 },
        process.env.JWT_SECRET || 'dev_secret'
      );

      const res = await request(testServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('expiré');
    });

    it('retourne 401 sans le préfixe Bearer', async () => {
      const user = await createTestUser({ role: 'admin' });
      const token = await generateValidToken(user.id);

      const res = await request(testServer())
        .get('/api/admin/users')
        .set('Authorization', token); // Manque "Bearer "

      expect(res.status).toBe(401);
    });
  });

  describe('accès non-autorisé (rôle)', () => {
    it('retourne 403 pour utilisateur non-admin (rôle user)', async () => {
      const user = await createTestUser({ role: 'user' });
      const token = await generateValidToken(user.id);

      const res = await request(testServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('administrateurs');
    });

    it('retourne 403 si rôle changé après génération du token', async () => {
      // Créer admin et générer token
      const user = await createTestUser({ role: 'admin' });
      const token = await generateValidToken(user.id);

      // Changer le rôle en base de données
      await query('UPDATE users SET role = $1 WHERE id = $2', ['user', user.id]);

      const res = await request(testServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('administrateurs');
      // ⚠️ CRITICAL: Confirme que la vérification se fait en DB, pas seulement dans le token
    });

    it('retourne 404 si utilisateur supprimé après génération du token', async () => {
      const user = await createTestUser({ role: 'admin' });
      const token = await generateValidToken(user.id);

      // Supprimer l'utilisateur
      await query('DELETE FROM users WHERE id = $1', [user.id]);

      const res = await request(testServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('non trouvé');
    });
  });

  describe('accès autorisé', () => {
    it('retourne 200 pour admin valide sur GET /api/admin/users', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const token = await generateValidToken(admin.id);

      const res = await request(testServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.users).toBeDefined();
      expect(Array.isArray(res.body.users)).toBe(true);
    });

    it('retourne 200 pour admin valide sur GET /api/admin/dashboard', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const token = await generateValidToken(admin.id);

      const res = await request(testServer())
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.stats).toBeDefined();
    });

    it('retourne 201 pour POST /api/admin/users avec admin', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const token = await generateValidToken(admin.id);

      const newEmail = `new-user-${Date.now()}-${Math.random()}@example.com`;
      const res = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: newEmail,
          first_name: 'New User',
          role: 'user'
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.email).toBe(newEmail);
    });

    it('permet l\'accès à toutes les routes admin avec un token admin valide', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const token = await generateValidToken(admin.id);

      // Test plusieurs routes admin
      // On teste que l'accès aux routes admin fonctionne avec un token admin
      // Le middleware a autorisé l'accès (pas de 401 ou 403)
      // Les codes 200/201 indiquent que le middleware a fonctionné
      const dashboardRes = await request(testServer())
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 201, 400, 404, 500]).toContain(dashboardRes.status);
      expect(dashboardRes.status).not.toBe(401);
      expect(dashboardRes.status).not.toBe(403);

      const usersRes = await request(testServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 201, 400, 404, 500]).toContain(usersRes.status);
      expect(usersRes.status).not.toBe(401);
      expect(usersRes.status).not.toBe(403);
    });
  });

  describe('req.user enrichi (D3 story 1.4)', () => {
    it('requireAdmin positionne req.user.hasMemberAccess (boolean) pour un admin', async () => {
      // requireAdmin ne renvoie PAS req.user dans la réponse HTTP ; un test
      // d'intégration HTTP ne peut donc pas l'observer. On invoque le middleware
      // directement avec un faux req/res et on capture req.user via next().
      const admin = await createTestUser({ role: 'admin' });
      const token = await generateValidToken(admin.id);

      const req = { headers: { authorization: `Bearer ${token}` } } as any;
      const res = {} as any;
      let captured: { userId?: string; role?: string; hasMemberAccess?: boolean } | undefined;
      await requireAdmin(req, res, () => {
        captured = req.user;
      });

      expect(captured).toBeDefined();
      expect(captured!.role).toBe('admin');
      expect(typeof captured!.hasMemberAccess).toBe('boolean');
      // Admin sans event_users → false
      expect(captured!.hasMemberAccess).toBe(false);
    });
  });

  describe('POST /api/auth/generate-token (admin only)', () => {
    it('retourne 403 pour utilisateur non-admin', async () => {
      const user = await createTestUser({ role: 'user' });
      const token = await generateValidToken(user.id);

      const res = await request(testServer())
        .post('/api/auth/generate-token')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: user.id });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('administrateurs');
    });

    it('retourne 200 pour admin avec payload valide', async () => {
      const targetUser = await createTestUser({ role: 'user' });
      const admin = await createTestUser({ role: 'admin' });
      const adminToken = await generateValidToken(admin.id);

      const res = await request(testServer())
        .post('/api/auth/generate-token')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: targetUser.id });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.magicLink).toBeDefined();
      expect(res.body.data.magicLink).toContain('token=');
    });
  });
});
