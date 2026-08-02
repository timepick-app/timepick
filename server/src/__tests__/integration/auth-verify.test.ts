import request from 'supertest';
import jwt from 'jsonwebtoken';
import { testServer } from '../helpers/test-server';
import { query } from '../../db';
import { persistMagicLinkToken } from '../../services/auth.service';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_for_testing';

// Helper to create a test user
// Note: Uses query (not testQuery) because API calls need to see this data
const createTestUser = async (overrides: { email?: string; first_name?: string; role?: string } = {}) => {
  const timestamp = Date.now();
  const email = overrides.email || `test-verify-${timestamp}@test.com`;
  const firstName = overrides.first_name || `Test User ${timestamp}`;
  const result = await query(
    `INSERT INTO users (email, first_name, role)
     VALUES ($1, $2, $3)
     RETURNING id, email, first_name, role`,
    [email, firstName, overrides.role || 'user']
  );
  return result.rows[0];
};

type MagicLinkOverrides = { role?: string; redirectAfterLogin?: string; eventId?: string; exp?: number };

// Signe un magic link SANS l'émettre : aucune trace en base. Depuis le passage à
// l'usage unique, un tel jeton est rejeté par /auth/verify malgré une signature
// parfaite — c'est la base qui dit si un lien a été émis par cette instance.
const forgeToken = (userId: string, overrides: MagicLinkOverrides = {}) => {
  const payload: {
    userId: string;
    exp: number;
    role?: string;
    redirectAfterLogin?: string;
    eventId?: string;
  } = {
    userId,
    exp: overrides.exp || Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  return jwt.sign(payload, JWT_SECRET);
};

// Émet un magic link exactement comme le serveur : signature PUIS enregistrement
// dans magic_link_tokens. Le jeton obtenu est donc consommable — une fois.
const createTestToken = async (userId: string, overrides: MagicLinkOverrides = {}) => {
  const exp = overrides.exp || Math.floor(Date.now() / 1000) + 3600;
  const token = forgeToken(userId, { ...overrides, exp });
  await persistMagicLinkToken(userId, token, exp);
  return token;
};

describe('POST /api/auth/verify - Magic Link Verification', () => {
  afterAll(async () => {
    // Clean up any API-created test data
    await query("DELETE FROM users WHERE email LIKE 'test-verify-%@test.com'");
    // Clean up app_config modifications (restore default session_ttl)
    await query("INSERT INTO app_config (key, value) VALUES ('session_ttl', '7200') ON CONFLICT (key) DO UPDATE SET value = '7200'");
  });

  afterEach(async () => {
    // Clean up created test users after each test
    // Note: We use DELETE because this test file primarily uses API calls
    // which bypass transactions (see POC findings in 2-14-isolation-tests.md)
    await query("DELETE FROM users WHERE email LIKE 'test-verify-%@test.com'");
    await query("DELETE FROM events WHERE name LIKE 'Verify HasMember Event%'");
    // Reset app_config to default after each test that modifies it
    await query("INSERT INTO app_config (key, value) VALUES ('session_ttl', '7200') ON CONFLICT (key) DO UPDATE SET value = '7200'");
  });

  describe('Validation', () => {
    it('retourne 400 si token manquant', async () => {
      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toBeDefined();
    });

    it('retourne 400 si token vide', async () => {
      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Token valide', () => {
    it('retourne 200 avec user et un NOUVEAU token de session', async () => {
      const user = await createTestUser({ role: 'admin' });
      const magicLinkToken = await createTestToken(user.id);

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token: magicLinkToken });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('token');
      // Le token de session doit être DIFFÉRENT du magic link
      expect(res.body.data.token).not.toBe(magicLinkToken);
      expect(res.body.data.user).toMatchObject({
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        role: 'admin',
      });
      expect(res.body.data.user).toHaveProperty('lastName');
      expect(res.body.data.user).not.toHaveProperty('fullName');
      // D6 story 1.4 : hasMemberAccess présent (boolean). Admin sans event_users → false.
      expect(typeof res.body.data.user.hasMemberAccess).toBe('boolean');
      expect(res.body.data.user.hasMemberAccess).toBe(false);
    });

    it('retourne les infos utilisateur complètes pour un membre', async () => {
      const timestamp = Date.now();
      const user = await createTestUser({
        email: `user-${timestamp}@test.com`,
        first_name: 'User Test',
        role: 'user',
      });
      const token = await createTestToken(user.id);

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token });

      expect(res.status).toBe(200);
      expect(res.body.data.user).toMatchObject({
        id: user.id,
        email: `user-${timestamp}@test.com`,
        firstName: 'User Test',
        role: 'user',
      });
    });

    it('retourne les infos utilisateur complètes pour un admin', async () => {
      const timestamp = Date.now();
      const user = await createTestUser({
        email: `admin-${timestamp}@test.com`,
        first_name: 'Admin Test',
        role: 'admin',
      });
      const token = await createTestToken(user.id);

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token });

      expect(res.status).toBe(200);
      expect(res.body.data.user).toMatchObject({
        id: user.id,
        email: `admin-${timestamp}@test.com`,
        firstName: 'Admin Test',
        role: 'admin',
      });
    });

    it('crée un nouveau token de session avec expiration différente du magic link', async () => {
      const user = await createTestUser();

      // Configurer un sessionTTL de 1 heure en base pour ce test
      // Use query (not testQuery) because app_config needs to be visible to API calls
      await query(
        `INSERT INTO app_config (key, value) VALUES ('session_ttl', '3600')
         ON CONFLICT (key) DO UPDATE SET value = '3600'`
      );

      // Créer un magic link qui expire dans 3 heures
      const magicLinkToken = await createTestToken(user.id, {
        exp: Math.floor(Date.now() / 1000) + (3 * 60 * 60), // 3 heures
      });

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token: magicLinkToken });

      expect(res.status).toBe(200);
      const sessionToken = res.body.data.token;

      // Décoder les deux tokens pour vérifier les expirations
      const magicLinkDecoded = jwt.decode(magicLinkToken) as { exp: number };
      const sessionDecoded = jwt.decode(sessionToken) as { exp: number };

      // Le token de session doit avoir une expiration plus courte (1h configuré vs 3h du magic link de test)
      expect(sessionDecoded.exp).toBeLessThan(magicLinkDecoded.exp);
      expect(sessionDecoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000) + 3000); // Au moins 50 minutes dans le futur
    });
  });

  describe('hasMemberAccess (D6 story 1.4)', () => {
    it('membre rattaché à un événement → hasMemberAccess=true', async () => {
      const user = await createTestUser({ role: 'user' });
      // Rattacher le membre à un événement via event_users (PK event_id+user_id).
      const event = await query(
        `INSERT INTO events (name, is_published) VALUES ($1, true) RETURNING id`,
        [`Verify HasMember Event ${Date.now()}`]
      );
      await query('INSERT INTO event_users (event_id, user_id) VALUES ($1, $2)', [
        event.rows[0].id,
        user.id,
      ]);

      const token = await createTestToken(user.id);
      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token });

      expect(res.status).toBe(200);
      expect(res.body.data.user.hasMemberAccess).toBe(true);
    });

    it('membre sans aucun événement → hasMemberAccess=false', async () => {
      const user = await createTestUser({ role: 'user' });
      const token = await createTestToken(user.id);

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token });

      expect(res.status).toBe(200);
      expect(res.body.data.user.hasMemberAccess).toBe(false);
    });
  });

  describe('redirectAfterLogin', () => {
    it('retourne redirectAfterLogin si présent dans le magic link', async () => {
      const user = await createTestUser({ role: 'user' });
      const token = await createTestToken(user.id, {
        redirectAfterLogin: '/event/123e4567-e89b-12d3-a456-426614174000',
      });

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('redirectAfterLogin');
      expect(res.body.data.redirectAfterLogin).toBe('/event/123e4567-e89b-12d3-a456-426614174000');
    });

    it('ne retourne pas redirectAfterLogin si absent du magic link', async () => {
      const user = await createTestUser();
      const token = await createTestToken(user.id); // Sans redirectAfterLogin

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token });

      expect(res.status).toBe(200);
      expect(res.body.data).not.toHaveProperty('redirectAfterLogin');
    });
  });

  describe('eventId', () => {
    it('retourne eventId si présent dans le magic link', async () => {
      const user = await createTestUser({ role: 'user' });
      const eventId = '123e4567-e89b-12d3-a456-426614174000';
      const token = await createTestToken(user.id, { eventId });

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('eventId');
      expect(res.body.data.eventId).toBe(eventId);
    });

    it('ne retourne pas eventId si absent du magic link', async () => {
      const user = await createTestUser();
      const token = await createTestToken(user.id); // Sans eventId

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token });

      expect(res.status).toBe(200);
      expect(res.body.data).not.toHaveProperty('eventId');
    });
  });

  describe('Token invalide', () => {
    it('retourne 401 pour token JWT invalide', async () => {
      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token: 'invalid-token-xyz' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
      expect(res.body.error.message).toContain('invalide');
    });

    it('retourne 401 pour token malformé', async () => {
      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token: 'not.a.jwt.token' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('retourne 401 pour token expiré', async () => {
      const expiredToken = jwt.sign(
        { userId: 'test-id', exp: Math.floor(Date.now() / 1000) - 3600 },
        JWT_SECRET
      );

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token: expiredToken });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
      expect(res.body.error.message).toContain('expiré');
    });

    it('retourne 401 si utilisateur supprimé', async () => {
      const user = await createTestUser({ role: 'user' });
      const token = await createTestToken(user.id);

      // Supprimer l'utilisateur (use query to bypass transaction for this test)
      await query('DELETE FROM users WHERE id = $1', [user.id]);

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token });

      // Supprimer un membre RÉVOQUE ses liens en attente : magic_link_tokens.user_id
      // est ON DELETE CASCADE, la ligne du jeton part avec le compte. Le refus tombe
      // donc à la consommation, et non plus au chargement de l'utilisateur. Ce que le
      // test prouve reste vrai, et l'est davantage : le lien d'un compte supprimé
      // n'ouvre aucune session.
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_ALREADY_USED');
      expect(res.body.error.message).toContain('déjà');

      // Cleanup since we bypassed transaction
      await query('DELETE FROM users WHERE id = $1', [user.id]);
    });

    it('retourne 401 pour un jeton jamais émis (signature valide, aucune ligne en base)', async () => {
      const fakeUserId = '00000000-0000-0000-0000-000000000000';
      // forgeToken, pas createTestToken : ce jeton n'a jamais été émis par l'instance.
      const token = forgeToken(fakeUserId);

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token });

      // Rejeté à la consommation, avant toute requête sur users : un jeton forgé ne
      // permet plus de distinguer un compte existant d'un compte absent (pas
      // d'énumération possible), et USER_NOT_FOUND n'est plus atteignable ainsi.
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_ALREADY_USED');
    });

    it('retourne 401 si userId n\'est pas un UUID valide', async () => {
      const invalidUuidToken = jwt.sign(
        { userId: 'not-a-uuid', exp: Math.floor(Date.now() / 1000) + 3600 },
        JWT_SECRET
      );

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token: invalidUuidToken });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('Route publique (pas d\'auth requise)', () => {
    it('fonctionne sans Authorization header', async () => {
      const user = await createTestUser();
      const token = await createTestToken(user.id);

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token });

      expect(res.status).toBe(200);
    });

    it('ignore un Authorization header invalide', async () => {
      const user = await createTestUser();
      const token = await createTestToken(user.id);

      const res = await request(testServer())
        .post('/api/auth/verify')
        .set('Authorization', 'Bearer invalid-token')
        .send({ token });

      expect(res.status).toBe(200);
    });
  });

  describe('Structure de réponse', () => {
    it('retourne une réponse avec data.token et data.user', async () => {
      const user = await createTestUser();
      const token = await createTestToken(user.id);

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token });

      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data.user).toHaveProperty('id');
      expect(res.body.data.user).toHaveProperty('email');
      expect(res.body.data.user).toHaveProperty('firstName');
      expect(res.body.data.user).toHaveProperty('role');
    });
  });

  describe('Gestion des erreurs JWT', () => {
    it('retourne 401 pour token malformé (pas 500)', async () => {
      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token: 'malformed-token' });

      // Toujours 401 pour les erreurs JWT, jamais 500
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('Tracking de clic d\'invitation', () => {
    let testEventId: string;

    const createTestEvent = async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const result = await query(
        `INSERT INTO events (name, description)
         VALUES ($1, $2) RETURNING id`,
        [`test-verify-event-${uniqueSuffix}`, 'Event for click tracking']
      );
      return result.rows[0].id;
    };

    const insertSentInvitation = async (eventId: string, userId: string) => {
      await query(
        `INSERT INTO invitations (event_id, user_id, status, sent_at)
         VALUES ($1, $2, 'sent', NOW() - INTERVAL '5 minutes')`,
        [eventId, userId]
      );
    };

    afterEach(async () => {
      await query("DELETE FROM events WHERE name LIKE 'test-verify-event-%'");
    });

    it('enregistre clicked_at (mais pas status=clicked) quand le magic link contient un eventId', async () => {
      const user = await createTestUser({ role: 'user' });
      testEventId = await createTestEvent();
      await insertSentInvitation(testEventId, user.id);

      const token = await createTestToken(user.id, { eventId: testEventId });
      const res = await request(testServer()).post('/api/auth/verify').send({ token });

      expect(res.status).toBe(200);

      const invitation = await query(
        'SELECT status, clicked_at FROM invitations WHERE event_id = $1 AND user_id = $2',
        [testEventId, user.id]
      );
      // markAsClicked ne touche plus status — la source de vérité est clicked_at
      expect(invitation.rows[0].status).toBe('sent');
      expect(invitation.rows[0].clicked_at).not.toBeNull();
    });

    it('ne fait rien si le magic link ne contient pas d\'eventId', async () => {
      const user = await createTestUser({ role: 'user' });
      testEventId = await createTestEvent();
      await insertSentInvitation(testEventId, user.id);

      const token = await createTestToken(user.id); // pas d'eventId
      const res = await request(testServer()).post('/api/auth/verify').send({ token });

      expect(res.status).toBe(200);

      const invitation = await query(
        'SELECT status, clicked_at FROM invitations WHERE event_id = $1 AND user_id = $2',
        [testEventId, user.id]
      );
      expect(invitation.rows[0].status).toBe('sent');
      expect(invitation.rows[0].clicked_at).toBeNull();
    });

    it('préserve le clicked_at original lors d\'un second clic (idempotence)', async () => {
      const user = await createTestUser({ role: 'user' });
      testEventId = await createTestEvent();
      await insertSentInvitation(testEventId, user.id);

      const token = await createTestToken(user.id, { eventId: testEventId });

      // Premier clic
      await request(testServer()).post('/api/auth/verify').send({ token });
      const firstClick = await query(
        'SELECT clicked_at FROM invitations WHERE event_id = $1 AND user_id = $2',
        [testEventId, user.id]
      );
      const firstClickedAt = firstClick.rows[0].clicked_at;

      // Second clic (même token)
      await new Promise(resolve => setTimeout(resolve, 50));
      await request(testServer()).post('/api/auth/verify').send({ token });
      const secondClick = await query(
        'SELECT clicked_at FROM invitations WHERE event_id = $1 AND user_id = $2',
        [testEventId, user.id]
      );

      expect(secondClick.rows[0].clicked_at.getTime())
        .toBe(firstClickedAt.getTime());
    });

    it('ne bloque pas le login si l\'invitation n\'existe pas (eventId présent mais pas d\'invitation)', async () => {
      const user = await createTestUser({ role: 'user' });
      testEventId = await createTestEvent();
      // Pas d'invitation insérée

      const token = await createTestToken(user.id, { eventId: testEventId });
      const res = await request(testServer()).post('/api/auth/verify').send({ token });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('token');
    });
    it('token EXPIRÉ (signature valide) → 401 TOKEN_EXPIRED ET clicked_at enregistré en base', async () => {
      const user = await createTestUser({ role: 'user' });
      testEventId = await createTestEvent();
      await insertSentInvitation(testEventId, user.id);

      const expiredToken = await createTestToken(user.id, {
        eventId: testEventId,
        exp: Math.floor(Date.now() / 1000) - 3600, // expiré il y a 1h
      });
      const res = await request(testServer()).post('/api/auth/verify').send({ token: expiredToken });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');

      // Le clic doit être enregistré malgré l'expiration
      const invitation = await query(
        'SELECT clicked_at FROM invitations WHERE event_id = $1 AND user_id = $2',
        [testEventId, user.id]
      );
      expect(invitation.rows[0].clicked_at).not.toBeNull();
    });

    it('token à signature INVALIDE → 401 INVALID_TOKEN ET aucun clic enregistré', async () => {
      const user = await createTestUser({ role: 'user' });
      testEventId = await createTestEvent();
      await insertSentInvitation(testEventId, user.id);

      // Token signé avec un mauvais secret — signature invalide
      const badToken = jwt.sign({ userId: user.id, eventId: testEventId }, 'wrong_secret_xyz');
      const res = await request(testServer()).post('/api/auth/verify').send({ token: badToken });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');

      // Aucun clic ne doit être enregistré pour un token forgé
      const invitation = await query(
        'SELECT clicked_at FROM invitations WHERE event_id = $1 AND user_id = $2',
        [testEventId, user.id]
      );
      expect(invitation.rows[0].clicked_at).toBeNull();
    });

    it('token EXPIRÉ avec invitation DÉJÀ cliquée → 401 ET clicked_at INCHANGÉ (pas de double-écriture)', async () => {
      const user = await createTestUser({ role: 'user' });
      testEventId = await createTestEvent();
      await insertSentInvitation(testEventId, user.id);

      // Pré-positionner un clic antérieur : markAsClicked filtre clicked_at IS NULL,
      // donc l'UPDATE matchera 0 ligne sur ce second appel (premier clic gagnant).
      const priorClickAt = new Date(Date.now() - 60 * 60 * 1000); // il y a 1h
      await query(
        `UPDATE invitations SET clicked_at = $3
         WHERE event_id = $1 AND user_id = $2`,
        [testEventId, user.id, priorClickAt]
      );

      const expiredToken = await createTestToken(user.id, {
        eventId: testEventId,
        exp: Math.floor(Date.now() / 1000) - 3600, // expiré il y a 1h
      });
      const res = await request(testServer()).post('/api/auth/verify').send({ token: expiredToken });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');

      // clicked_at doit rester strictement identique (aucune ré-écriture)
      const invitation = await query(
        'SELECT clicked_at FROM invitations WHERE event_id = $1 AND user_id = $2',
        [testEventId, user.id]
      );
      expect(invitation.rows[0].clicked_at).not.toBeNull();
      expect(invitation.rows[0].clicked_at.getTime()).toBe(priorClickAt.getTime());
    });

    it('token EXPIRÉ sans userId dans le payload → 401 ET markAsClicked n\'écrit rien (clicked_at reste NULL)', async () => {
      const user = await createTestUser({ role: 'user' });
      testEventId = await createTestEvent();
      await insertSentInvitation(testEventId, user.id);

      // Token expiré signé avec un eventId valide MAIS sans userId.
      // La garde `decoded.userId && uuidRegex.test(decoded.userId)` n'est pas satisfaite →
      // markAsClicked n'est jamais appelé.
      const expiredToken = jwt.sign(
        { eventId: testEventId, exp: Math.floor(Date.now() / 1000) - 3600 },
        JWT_SECRET
      );
      const res = await request(testServer()).post('/api/auth/verify').send({ token: expiredToken });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');

      // Aucun clic enregistré : la ligne existante conserve clicked_at = NULL
      const invitation = await query(
        'SELECT clicked_at FROM invitations WHERE event_id = $1 AND user_id = $2',
        [testEventId, user.id]
      );
      expect(invitation.rows[0].clicked_at).toBeNull();
    });

  });

  describe('TOKEN_EXPIRED context — renvoi par identité (isAdmin)', () => {
    // Branche expirée : pour un token SANS eventId mais avec un userId UUID, le serveur
    // dérive isAdmin du rôle DB et autorise canResend. La signature est déjà validée par
    // jwt (TokenExpiredError ⇒ signature OK + exp dépassée), donc jwt.decode du userId
    // est fiable. Aucun role/redirect n'est lu du token pour cette décision.
    const expiredExp = () => Math.floor(Date.now() / 1000) - 3600;

    it('(h) token admin expiré sans eventId → context.isAdmin=true & canResend=true', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const token = await createTestToken(admin.id, { exp: expiredExp() });

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
      expect(res.body.error.context.canResend).toBe(true);
      expect(res.body.error.context.isAdmin).toBe(true);
    });

    it('(i) token user (non-admin) expiré sans eventId → context.isAdmin=false & canResend=true', async () => {
      const user = await createTestUser({ role: 'user' });
      const token = await createTestToken(user.id, { exp: expiredExp() });

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
      expect(res.body.error.context.canResend).toBe(true);
      expect(res.body.error.context.isAdmin).toBe(false);
    });

    it('user introuvable, token expiré sans eventId → isAdmin=false & canResend=true (anti-énumération)', async () => {
      const fakeUserId = '00000000-0000-0000-0000-000000000000';
      const token = forgeToken(fakeUserId, { exp: expiredExp() });

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
      expect(res.body.error.context.canResend).toBe(true);
      expect(res.body.error.context.isAdmin).toBe(false);
    });
  });

  describe('Bootstrap admin (P3)', () => {
    const BOOTSTRAP_EMAIL_PREFIX = 'bootstrap-verify-'

    afterEach(async () => {
      await query(`DELETE FROM users WHERE email LIKE '${BOOTSTRAP_EMAIL_PREFIX}%@test.com'`)
    })

    it('(a) token bootstrap sans noms → 200, admin créé avec le repli « Administrateur »', async () => {
      const email = `${BOOTSTRAP_EMAIL_PREFIX}${Date.now()}@test.com`
      await query("DELETE FROM users WHERE role = 'admin'")

      const token = jwt.sign(
        { bootstrap: true, email, role: 'admin' },
        JWT_SECRET,
        { expiresIn: '1h' }
      )

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token })

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('token')
      expect(res.body.data.user).toMatchObject({ email, role: 'admin' })

      // Vérifier la création en DB. Repli D4 : `users.first_name` est NOT NULL,
      // un token sans prénom doit connecter la personne, pas rendre 500.
      const dbResult = await query("SELECT * FROM users WHERE email = $1", [email])
      expect(dbResult.rows.length).toBe(1)
      expect(dbResult.rows[0].role).toBe('admin')
      expect(dbResult.rows[0].first_name).toBe('Administrateur')
    })

    it('(b) token bootstrap avec admin existant → 401 SETUP_ALREADY_DONE', async () => {
      const existingEmail = `${BOOTSTRAP_EMAIL_PREFIX}existing-${Date.now()}@test.com`
      const bootstrapEmail = `${BOOTSTRAP_EMAIL_PREFIX}new-${Date.now()}@test.com`

      // Insérer un admin existant
      await query(
        "INSERT INTO users (email, first_name, role) VALUES ($1, 'Existing', 'admin')",
        [existingEmail]
      )

      const token = jwt.sign(
        { bootstrap: true, email: bootstrapEmail, role: 'admin' },
        JWT_SECRET,
        { expiresIn: '1h' }
      )

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token })

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('SETUP_ALREADY_DONE')
      expect(res.body.error.message).toBe('La configuration est déjà terminée. Connectez-vous via la page de connexion.')

      // Aucune ligne supplémentaire créée
      const dbResult = await query("SELECT * FROM users WHERE role = 'admin'")
      expect(dbResult.rows.length).toBe(1)
    })

    it('(c) token bootstrap avec prénom/nom → admin créé avec ces valeurs', async () => {
      const email = `${BOOTSTRAP_EMAIL_PREFIX}named-${Date.now()}@test.com`
      await query("DELETE FROM users WHERE role = 'admin'")

      const token = jwt.sign(
        { bootstrap: true, email, firstName: 'Camille', lastName: 'Martin', role: 'admin' },
        JWT_SECRET,
        { expiresIn: '1h' }
      )

      const res = await request(testServer())
        .post('/api/auth/verify')
        .send({ token })

      expect(res.status).toBe(200)
      expect(res.body.data.user).toMatchObject({ firstName: 'Camille', lastName: 'Martin' })

      const dbResult = await query('SELECT first_name, last_name FROM users WHERE email = $1', [email])
      expect(dbResult.rows[0]).toMatchObject({ first_name: 'Camille', last_name: 'Martin' })
    })
  })

  // Point B du plan « dettes reportées » : un refus sortait en 401 indifférencié dans
  // les journaux (morgan ne journalise que méthode, URL et statut), alors que les trois
  // motifs appellent des remèdes opposés. Le motif doit donc être lisible côté serveur,
  // et le jeton doit rester invisible.
  describe('Journalisation des refus', () => {
    const REJECTION_LINE = '[Auth][verify] lien refusé';
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    // Le contexte est comparé en entier plutôt que champ par champ : aucune assertion
    // de type à écrire, et la forme de la ligne journalisée est elle-même sous contrat.
    const rejections = (): unknown[] =>
      warnSpy.mock.calls
        .filter(([line]) => line === REJECTION_LINE)
        .map(([, context]) => context);

    it('distingue les trois motifs de refus dans la sortie du serveur', async () => {
      const user = await createTestUser();

      const expired = await createTestToken(user.id, { exp: Math.floor(Date.now() / 1000) - 60 });
      await request(testServer()).post('/api/auth/verify').send({ token: expired });

      const used = await createTestToken(user.id);
      const first = await request(testServer()).post('/api/auth/verify').send({ token: used });
      expect(first.status).toBe(200); // le refus vient du SECOND clic
      await request(testServer()).post('/api/auth/verify').send({ token: used });

      await request(testServer()).post('/api/auth/verify').send({ token: 'lien-tronque-par-un-client-mail' });

      expect(rejections()).toEqual([
        { code: 'TOKEN_EXPIRED' },
        { code: 'TOKEN_ALREADY_USED' },
        { code: 'INVALID_TOKEN', reason: 'jwt malformed' },
      ]);
    });

    it('précise la cause d\'un lien invalide sans jamais écrire le jeton', async () => {
      const user = await createTestUser();
      const token = await createTestToken(user.id);

      await request(testServer()).post('/api/auth/verify').send({ token });
      await request(testServer()).post('/api/auth/verify').send({ token }); // refusé
      await request(testServer()).post('/api/auth/verify').send({ token: 'pas-un-jwt' });

      expect(rejections()).toContainEqual({ code: 'INVALID_TOKEN', reason: 'jwt malformed' });

      // Un préfixe suffirait à ruiner l'intention : rien du jeton ne doit sortir.
      const written = JSON.stringify(warnSpy.mock.calls);
      expect(written).not.toContain(token);
      expect(written).not.toContain(token.slice(0, 16));
    });
  });

});
