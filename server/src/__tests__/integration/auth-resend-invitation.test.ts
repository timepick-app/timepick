import request from 'supertest';
import jwt from 'jsonwebtoken';
import { testServer } from '../helpers/test-server';
import * as invitationsModule from '../../services/invitations.service';
import { NotFoundError } from '../../errors/NotFoundError';
import { EmailDeliveryError } from '../../errors/EmailDeliveryError';
import pool from '../../db/pool'
import * as emailService from '../../services/email-send.service'

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_for_testing';

/**
 * Crée un token JWT signé avec le secret courant.
 * Par défaut expiré (expOffset négatif) pour simuler un lien d'invitation périmé.
 */
const makeToken = (
  userId: string,
  eventId: string,
  secret = JWT_SECRET,
  expOffset = -3600
) => {
  const exp = Math.floor(Date.now() / 1000) + expOffset;
  return jwt.sign({ userId, eventId, exp }, secret);
};

describe('POST /api/auth/resend-invitation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // (a) Token forgé (mauvais secret) → 200 générique, service NON appelé
  it('(a) token forgé → 200 générique, service non appelé', async () => {
    const spy = jest
      .spyOn(invitationsModule.invitationsService, 'resendInvitation')
      .mockResolvedValue({
        sent: true,
        email: 'a@example.com',
        sentAt: new Date(),
        userId: 'u-forged-a',
        eventId: 'e-forged-a',
      });

    const forgedToken = makeToken('u-forged-a', 'e-forged-a', 'wrong-secret');
    const res = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token: forgedToken });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBeDefined();
    expect(spy).not.toHaveBeenCalled();
  });

  // (b) Token signé expiré, service résout → 200 {data.message}, spy appelé
  it('(b) token signé expiré + service résout → 200 avec message, spy appelé', async () => {
    const userId = 'u-resend-b';
    const eventId = 'e-resend-b';
    const spy = jest
      .spyOn(invitationsModule.invitationsService, 'resendInvitation')
      .mockResolvedValue({
        sent: true,
        email: 'b@example.com',
        sentAt: new Date(),
        userId,
        eventId,
      });

    const expiredToken = makeToken(userId, eventId); // expOffset = -3600
    const res = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token: expiredToken });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBeDefined();
    expect(spy).toHaveBeenCalledWith(eventId, userId);
  });

  // (c) Service rejette NotFoundError → 422 RESEND_NOT_AVAILABLE
  it('(c) NotFoundError du service → 422 RESEND_NOT_AVAILABLE', async () => {
    const userId = 'u-resend-c';
    const eventId = 'e-resend-c';
    jest
      .spyOn(invitationsModule.invitationsService, 'resendInvitation')
      .mockRejectedValue(new NotFoundError('Utilisateur non trouvé'));

    const token = makeToken(userId, eventId);
    const res = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('RESEND_NOT_AVAILABLE');
  });

  // (d) Service rejette EmailDeliveryError → 503 EMAIL_SERVICE_UNAVAILABLE
  it("(d) EmailDeliveryError du service → 503 EMAIL_SERVICE_UNAVAILABLE", async () => {
    const userId = 'u-resend-d';
    const eventId = 'e-resend-d';
    jest
      .spyOn(invitationsModule.invitationsService, 'resendInvitation')
      .mockRejectedValue(new EmailDeliveryError());

    const token = makeToken(userId, eventId);
    const res = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('EMAIL_SERVICE_UNAVAILABLE');
  });

  // (d2) Service rejette Error générique → 500 INTERNAL_ERROR
  it('(d2) Error générique du service → 500 INTERNAL_ERROR', async () => {
    const userId = 'u-resend-d2';
    const eventId = 'e-resend-d2';
    jest
      .spyOn(invitationsModule.invitationsService, 'resendInvitation')
      .mockRejectedValue(new Error('boom'));

    const token = makeToken(userId, eventId);
    const res = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  // (e) Rate-limit : 2e appel successif (même token, service résout) → 429 RATE_LIMITED
  it('(e) rate-limit : 2e appel même token → 429 RATE_LIMITED', async () => {
    const userId = 'u-resend-e';
    const eventId = 'e-resend-e';
    jest
      .spyOn(invitationsModule.invitationsService, 'resendInvitation')
      .mockResolvedValue({
        sent: true,
        email: 'e@example.com',
        sentAt: new Date(),
        userId,
        eventId,
      });

    const token = makeToken(userId, eventId);

    const res1 = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });
    expect(res1.status).toBe(200);

    const res2 = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });
    expect(res2.status).toBe(429);
    expect(res2.body.error.code).toBe('RATE_LIMITED');
  });

  // (f) Après un échec (EmailDeliveryError), retry même token → 429 RATE_LIMITED
  //     Le rate-limit est enregistré à chaque tentative acceptée (avant l'appel service).
  it('(f) après échec EmailDeliveryError, retry même token → 429 RATE_LIMITED', async () => {
    const userId = 'u-resend-f';
    const eventId = 'e-resend-f';
    const spy = jest
      .spyOn(invitationsModule.invitationsService, 'resendInvitation')
      .mockRejectedValueOnce(new EmailDeliveryError());

    const token = makeToken(userId, eventId);

    const res1 = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });
    expect(res1.status).toBe(503);

    const res2 = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });
    expect(res2.status).toBe(429);
    expect(res2.body.error.code).toBe('RATE_LIMITED');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/auth/resend-invitation — renvoi par identité (token sans eventId)', () => {
  // Chemin « identité » : DB réelle (rôle/email/redirect dérivés DB) + service email mické,
  // suivant le pattern de auth-login.test.ts. Le chemin événement (describe ci-dessus) reste
  // mické au niveau invitationsService et n'est pas affecté par ces tests.
  let sendAdminSpy: jest.SpyInstance;
  let sendUserSpy: jest.SpyInstance;

  beforeEach(() => {
    sendAdminSpy = jest.spyOn(emailService, 'sendAdminMagicLinkEmail').mockResolvedValue(true);
    sendUserSpy = jest.spyOn(emailService, 'sendUserMagicLinkEmail').mockResolvedValue(true);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await pool.query("DELETE FROM users WHERE email LIKE 'test-resend-id-%@test.com'");
  });

  const createUser = async (role: 'admin' | 'user') => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = `test-resend-id-${suffix}@test.com`;
    const result = await pool.query(
      `INSERT INTO users (email, first_name, last_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, role, first_name, last_name`,
      [email, 'Resend', 'Identity', role]
    );
    return result.rows[0];
  };

  // Token de connexion signé (signature valide) SANS eventId, expiré par défaut.
  const identityToken = (
    userId: string,
    opts: { role?: string; redirectAfterLogin?: string; expOffset?: number } = {}
  ) => {
    const payload: Record<string, unknown> = {
      userId,
      exp: Math.floor(Date.now() / 1000) + (opts.expOffset ?? -3600),
    };
    if (opts.role) payload.role = opts.role;
    if (opts.redirectAfterLogin) payload.redirectAfterLogin = opts.redirectAfterLogin;
    return jwt.sign(payload, JWT_SECRET);
  };

  const tokenFromLink = (link: string): string => {
    const parsed = new URL(link);
    return parsed.searchParams.get('token') || '';
  };

  // (a) Token admin authentique expiré sans eventId → 200, email admin vers l'email DB,
  //     nouveau token dont role/redirect sont DÉRIVÉS de la DB (jamais des claims).
  it('(a) token admin expiré sans eventId → 200 + email admin (email DB) + token role/redirect dérivés DB', async () => {
    const admin = await createUser('admin');
    const token = identityToken(admin.id, { role: 'admin', redirectAfterLogin: '/admin' });

    const res = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBeDefined();

    // Email admin envoyé UNIQUEMENT vers l'email DB du userId
    expect(sendUserSpy).not.toHaveBeenCalled();
    expect(sendAdminSpy).toHaveBeenCalledTimes(1);
    const [toEmail, magicLink] = sendAdminSpy.mock.calls[0];
    expect(toEmail).toBe(admin.email);

    // Nouveau token : role/redirect re-dérivés DB
    const fresh = jwt.verify(tokenFromLink(magicLink as string), JWT_SECRET) as {
      userId: string; role: string; redirectAfterLogin: string;
    };
    expect(fresh.userId).toBe(admin.id);
    expect(fresh.role).toBe('admin');
    expect(fresh.redirectAfterLogin).toBe('/admin');

    // Token frais stocké en DB (par son empreinte)
    const db = await pool.query('SELECT token_hash FROM magic_link_tokens WHERE user_id = $1', [admin.id]);
    expect(db.rows[0].token_hash).toBeTruthy();
  });

  // (b) User rétrogradé admin→member : token forgé role=admin/redirect=/admin, mais la DB
  //     dit 'user' → lien/redirect DOIVENT refléter 'user' (preuve : rôle dérivé DB).
  it('(b) user rétrogradé admin→member → lien/redirect reflètent member (role DB, pas le claim)', async () => {
    const user = await createUser('user');
    const token = identityToken(user.id, { role: 'admin', redirectAfterLogin: '/admin' });

    const res = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });

    expect(res.status).toBe(200);
    // Email USER (pas admin) → rôle dérivé DB
    expect(sendAdminSpy).not.toHaveBeenCalled();
    expect(sendUserSpy).toHaveBeenCalledTimes(1);
    const [toEmail, magicLink] = sendUserSpy.mock.calls[0];
    expect(toEmail).toBe(user.email);

    const fresh = jwt.verify(tokenFromLink(magicLink as string), JWT_SECRET) as {
      role: string; redirectAfterLogin: string;
    };
    expect(fresh.role).toBe('user');
    expect(fresh.redirectAfterLogin).toBe('/me');
  });

  // (sec §4.4) redirectAfterLogin malveillant dans le token → jamais honoré ; redirect serveur.
  it('(sec) redirectAfterLogin malveillant dans le token jamais honoré → redirect serveur dérivé du rôle', async () => {
    const admin = await createUser('admin');
    const token = identityToken(admin.id, { role: 'user', redirectAfterLogin: 'https://evil.test/steal' });

    const res = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });

    expect(res.status).toBe(200);
    expect(sendAdminSpy).toHaveBeenCalledTimes(1);
    const [, magicLink] = sendAdminSpy.mock.calls[0];
    const fresh = jwt.verify(tokenFromLink(magicLink as string), JWT_SECRET) as { redirectAfterLogin: string };
    expect(fresh.redirectAfterLogin).toBe('/admin');
    expect(fresh.redirectAfterLogin).not.toContain('evil');
  });

  // (c) User introuvable (signature valide mais ligne absente) → 200 générique SANS email.
  it('(c) user introuvable (signature valide) → 200 générique sans email', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const token = identityToken(fakeId);

    const res = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBeDefined();
    expect(sendAdminSpy).not.toHaveBeenCalled();
    expect(sendUserSpy).not.toHaveBeenCalled();
  });

  // (sec §4.1) Token forgé (signature KO) sans eventId → 200 générique, aucun email, aucune écriture DB.
  it('(sec) token forgé sans eventId (signature KO) → 200 générique, aucun email, aucune écriture DB', async () => {
    const admin = await createUser('admin');
    const forged = jwt.sign(
      { userId: admin.id, exp: Math.floor(Date.now() / 1000) - 3600 },
      'wrong-secret'
    );

    const res = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token: forged });

    expect(res.status).toBe(200);
    expect(sendAdminSpy).not.toHaveBeenCalled();
    expect(sendUserSpy).not.toHaveBeenCalled();
    const db = await pool.query('SELECT token_hash FROM magic_link_tokens WHERE user_id = $1', [admin.id]);
    expect(db.rows).toHaveLength(0);
  });

  // (d) Rejeu du même token expiré 2× dans la fenêtre → 2e appel rate-limité (429).
  it('(d) rejeu même token 2× dans la fenêtre → 2e appel 429 RATE_LIMITED', async () => {
    const admin = await createUser('admin');
    const token = identityToken(admin.id);

    const res1 = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });
    expect(res1.status).toBe(200);

    const res2 = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });
    expect(res2.status).toBe(429);
    expect(res2.body.error.code).toBe('RATE_LIMITED');
  });

  // (e) Unification des clés de rate-limit identité/événement pour le même userId (F-084) :
  //     l'ancienne clé composite `${userId}:${eventId}` isolait les deux chemins, ce qui
  //     permettait de contourner le throttle en faisant varier `eventId`. La clé est
  //     désormais `identity:${userId}` pour les deux chemins : un seul bucket par cible.
  it('(e) unification clé rate-limit identité/événement pour le même userId (fix F-084)', async () => {
    const admin = await createUser('admin');
    const eventSpy = jest
      .spyOn(invitationsModule.invitationsService, 'resendInvitation')
      .mockResolvedValue({
        sent: true, email: admin.email, sentAt: new Date(), userId: admin.id, eventId: 'evt-iso',
      });

    // Renvoi identité → enregistre `identity:${id}`
    const idToken = identityToken(admin.id);
    const r1 = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token: idToken });
    expect(r1.status).toBe(200);

    // Renvoi événement même userId → MÊME bucket `identity:${id}` → 429 (plus de bypass via eventId)
    const evToken = jwt.sign(
      { userId: admin.id, eventId: 'evt-iso', exp: Math.floor(Date.now() / 1000) - 3600 },
      JWT_SECRET
    );
    const r2 = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token: evToken });
    expect(r2.status).toBe(429);
    expect(r2.body.error.code).toBe('RATE_LIMITED');
    expect(eventSpy).not.toHaveBeenCalled();
  });

  // (f) Échec d'envoi email → 503 EMAIL_SERVICE_UNAVAILABLE.
  it('(f) échec email → 503 EMAIL_SERVICE_UNAVAILABLE', async () => {
    const admin = await createUser('admin');
    sendAdminSpy.mockResolvedValue(false);
    const token = identityToken(admin.id);

    const res = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('EMAIL_SERVICE_UNAVAILABLE');
  });

  // (g) Aucune session/cookie émise sur le chemin de renvoi (email uniquement).
  it('(g) aucune session/cookie émis sur le chemin de renvoi', async () => {
    const admin = await createUser('admin');
    const token = identityToken(admin.id);

    const res = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });

    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.body.data).not.toHaveProperty('token');
    expect(res.body).not.toHaveProperty('token');
  });
});

describe('POST /api/auth/resend-invitation — renvoi post-setup (token bootstrap)', () => {
  let sendAdminSpy: jest.SpyInstance;
  // (bootstrap-j) résout une ligne role='user' → l'envoi passe par le canal member.
  let sendUserSpy: jest.SpyInstance;

  beforeEach(() => {
    sendAdminSpy = jest.spyOn(emailService, 'sendAdminMagicLinkEmail').mockResolvedValue(true);
    sendUserSpy = jest.spyOn(emailService, 'sendUserMagicLinkEmail').mockResolvedValue(true);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await pool.query("DELETE FROM users WHERE email LIKE 'test-bootstrap-%@test.com'");
  });

  /** Crée un compte en base avec email unique — même pattern que le describe identité ci-dessus. */
  const createBootstrapAdmin = async (role: 'admin' | 'user' = 'admin') => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = `test-bootstrap-${suffix}@test.com`;
    const result = await pool.query(
      `INSERT INTO users (email, first_name, last_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, role, first_name, last_name`,
      [email, 'Bootstrap', 'Admin', role]
    );
    return result.rows[0];
  };

  /** Forge un token bootstrap signé (sans userId, avec bootstrap:true). */
  const bootstrapToken = (email: string, opts: { secret?: string; expOffset?: number } = {}) => {
    const secret = opts.secret ?? JWT_SECRET;
    const exp = Math.floor(Date.now() / 1000) + (opts.expOffset ?? 3600);
    return jwt.sign({ bootstrap: true, email, role: 'admin', exp }, secret);
  };

  // (bootstrap-a) email résout un admin → 200, message défini, spy sendAdminMagicLinkEmail appelé
  it('(bootstrap-a) token bootstrap email connu → 200 + spy sendAdminMagicLinkEmail appelé avec cet email', async () => {
    const admin = await createBootstrapAdmin();
    const token = bootstrapToken(admin.email);

    const res = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBeDefined();
    expect(sendAdminSpy).toHaveBeenCalledTimes(1);
    const [toEmail] = sendAdminSpy.mock.calls[0];
    expect(toEmail).toBe(admin.email);
  });

  // (bootstrap-c) spy email renvoie false → 503 EMAIL_SERVICE_UNAVAILABLE
  it('(bootstrap-c) envoi email échoue → 503 EMAIL_SERVICE_UNAVAILABLE', async () => {
    const admin = await createBootstrapAdmin();
    sendAdminSpy.mockResolvedValue(false);
    const token = bootstrapToken(admin.email);

    const res = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('EMAIL_SERVICE_UNAVAILABLE');
  });

  // (bootstrap-d) email ne correspond à aucun user → 200 générique, spy NON appelé
  it('(bootstrap-d) email inconnu → 200 générique, aucun email envoyé', async () => {
    const token = bootstrapToken('no-such-user-bootstrap@test.com');

    const res = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBeDefined();
    expect(sendAdminSpy).not.toHaveBeenCalled();
  });

  /** Token de connexion « identité » (sans eventId), expiré — même forme que /auth/login. */
  const identityTokenFor = (userId: string) =>
    jwt.sign({ userId, exp: Math.floor(Date.now() / 1000) - 3600 }, JWT_SECRET);

  // (bootstrap-e) PREUVE CENTRALE : bucket partagé entre chemins. Le jeton bootstrap et le
  //     jeton identité du même compte consomment la clé `identity:${userId}` — avant le
  //     correctif, le bootstrap avait son propre compteur `identity:email:` et autorisait
  //     2 envois/60 s pour un même compte.
  it('(bootstrap-e) bootstrap puis identité, même compte → 2e appel 429 (bucket partagé)', async () => {
    const admin = await createBootstrapAdmin();

    const res1 = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token: bootstrapToken(admin.email) });
    expect(res1.status).toBe(200);

    const res2 = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token: identityTokenFor(admin.id) });
    expect(res2.status).toBe(429);
    expect(res2.body.error.code).toBe('RATE_LIMITED');
    expect(sendAdminSpy).toHaveBeenCalledTimes(1);
  });

  // (bootstrap-f) Ordre inverse : l'unification ne dépend pas de qui passe en premier.
  it('(bootstrap-f) identité puis bootstrap, même compte → 2e appel 429 (bucket partagé)', async () => {
    const admin = await createBootstrapAdmin();

    const res1 = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token: identityTokenFor(admin.id) });
    expect(res1.status).toBe(200);

    const res2 = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token: bootstrapToken(admin.email) });
    expect(res2.status).toBe(429);
    expect(res2.body.error.code).toBe('RATE_LIMITED');
    expect(sendAdminSpy).toHaveBeenCalledTimes(1);
  });

  // (bootstrap-h) F-081 sur le chemin bootstrap : le 200 « cible absente » et le 200 de
  //     reissueMagicLinkForUserRow sont deux `res.json` distincts — seul un toEqual croisé
  //     interdit qu'un des deux littéraux diverge. Les corps 429 ne sont PAS comparés tels
  //     quels : leur message embarque un compteur de secondes (60→59 entre deux appels).
  it('(bootstrap-h) matrice 2×2 bootstrap : corps 200 STRICTEMENT identiques compte réel/absent', async () => {
    const admin = await createBootstrapAdmin();
    const ghostEmail = `test-bootstrap-ghost-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const tokenReal = bootstrapToken(admin.email);
    const tokenGhost = bootstrapToken(ghostEmail);

    const firstReal = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token: tokenReal });
    const firstGhost = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token: tokenGhost });

    expect(firstReal.status).toBe(200);
    expect(firstGhost.status).toBe(200);
    expect(firstGhost.body).toEqual(firstReal.body);

    const secondReal = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token: tokenReal });
    const secondGhost = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token: tokenGhost });

    expect(secondGhost.status).toBe(secondReal.status);
    expect(secondReal.status).toBe(429);
    expect(secondGhost.body.error.code).toBe(secondReal.body.error.code);
    expect(secondGhost.body.error.code).toBe('RATE_LIMITED');
  });

  // (bootstrap-i) Transition d'existence — le cas d'usage NOMINAL du repli : compte supprimé
  //     ENTRE deux appels du même jeton. Prouve deux choses d'un coup :
  //       - invariant « 200 générique sans fuite » après suppression (corps identique au 200
  //         du compte vivant, aucun envoi supplémentaire) ;
  //       - invariant « une seule clé consommée par appel » : une implémentation qui aurait
  //         consommé AUSSI `identity:email:` au 1er appel renverrait ici 429 au lieu de 200.
  it('(bootstrap-i) compte supprimé entre deux appels → 200 générique identique, sans envoi, puis 429', async () => {
    const admin = await createBootstrapAdmin();
    const token = bootstrapToken(admin.email);

    const alive = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });
    expect(alive.status).toBe(200);
    expect(sendAdminSpy).toHaveBeenCalledTimes(1);

    await pool.query('DELETE FROM users WHERE id = $1', [admin.id]);

    // Bucket de repli vierge → l'appel passe, mais sans cible : 200 générique, aucun envoi.
    const afterDelete = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });
    expect(afterDelete.status).toBe(200);
    expect(afterDelete.body).toEqual(alive.body);
    expect(sendAdminSpy).toHaveBeenCalledTimes(1);

    // Le repli vient d'être consommé → l'appel suivant est throttlé comme n'importe quelle cible.
    const throttled = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });
    expect(throttled.status).toBe(429);
    expect(throttled.body.error.code).toBe('RATE_LIMITED');
  });

  // (bootstrap-j) Rôle/canal/redirect dérivés de la LIGNE DB, jamais du claim du jeton.
  //     bootstrapToken signe toujours role:'admin' (comme setup.service.ts) ; si le premier
  //     admin a été rétrogradé depuis, le renvoi doit repartir sur le canal member. Équivalent
  //     bootstrap du test (b) du describe identité. La ligne résolue par le SELECT remonté est
  //     celle passée à reissueMagicLinkForUserRow : ce test pinne cette réutilisation.
  it('(bootstrap-j) claim role=admin mais ligne DB role=user → canal member + redirect /me', async () => {
    const member = await createBootstrapAdmin('user');
    const token = bootstrapToken(member.email);

    const res = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token });

    expect(res.status).toBe(200);
    expect(sendAdminSpy).not.toHaveBeenCalled();
    expect(sendUserSpy).toHaveBeenCalledTimes(1);
    const [toEmail, magicLink] = sendUserSpy.mock.calls[0];
    expect(toEmail).toBe(member.email);

    const fresh = jwt.verify(
      new URL(magicLink as string).searchParams.get('token') || '',
      JWT_SECRET
    ) as { userId: string; role: string; redirectAfterLogin: string };
    expect(fresh.userId).toBe(member.id);
    expect(fresh.role).toBe('user');
    expect(fresh.redirectAfterLogin).toBe('/me');
  });

  // (bootstrap-k) Casse de l'email du jeton : la résolution est insensible à la casse
  //     (LOWER(email) = LOWER($1)), donc la clé reste `identity:${row.id}` — c'est ce qui
  //     empêche un jeton en casse différente de ré-ouvrir un bucket `identity:email:` parallèle.
  it('(bootstrap-k) jeton en casse différente → résolu, et bucket toujours partagé avec le chemin identité', async () => {
    const admin = await createBootstrapAdmin();

    const res1 = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token: bootstrapToken(admin.email.toUpperCase()) });
    expect(res1.status).toBe(200);
    expect(sendAdminSpy).toHaveBeenCalledTimes(1);
    // Destinataire = email de la LIGNE DB (casse stockée), pas la chaîne du jeton.
    expect(sendAdminSpy.mock.calls[0][0]).toBe(admin.email);

    const res2 = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token: identityTokenFor(admin.id) });
    expect(res2.status).toBe(429);
    expect(res2.body.error.code).toBe('RATE_LIMITED');
    expect(sendAdminSpy).toHaveBeenCalledTimes(1);
  });

  // (bootstrap-l) Deux lignes homographes par la casse sont créables : `users.email` n'est
  //     UNIQUE que de façon SENSIBLE à la casse, et le dédoublonnage de POST /admin/users
  //     compare `email = $1`. Le SELECT du chemin bootstrap étant insensible à la casse, il
  //     doit départager de façon DÉTERMINISTE (casse exacte d'abord) — sans `ORDER BY`, le
  //     tuple rendu dépendrait de l'ordre du tas, donc la clé de throttle et le destinataire
  //     du lien basculeraient d'un appel à l'autre.
  it('(bootstrap-l) deux lignes homographes par la casse → chaque jeton résout SA casse exacte', async () => {
    const stamp = Date.now();
    const lowerEmail = `test-bootstrap-case-${stamp}@test.com`;
    const upperEmail = `test-bootstrap-CASE-${stamp}@test.com`;
    // lowerEmail insérée EN PREMIER : c'est elle que rendrait un LIMIT 1 non départagé.
    await pool.query(
      `INSERT INTO users (email, first_name, last_name, role)
       VALUES ($1, 'Bootstrap', 'Homograph', 'admin'), ($2, 'Bootstrap', 'Homograph', 'admin')`,
      [lowerEmail, upperEmail]
    );

    // Jeton en casse HAUTE → doit résoudre la ligne haute, pas la première du tas.
    const resUpper = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token: bootstrapToken(upperEmail) });
    expect(resUpper.status).toBe(200);
    expect(sendAdminSpy).toHaveBeenCalledTimes(1);
    expect(sendAdminSpy.mock.calls[0][0]).toBe(upperEmail);

    // Jeton en casse BASSE → autre ligne, donc autre bucket : passe malgré l'appel précédent.
    const resLower = await request(testServer())
      .post('/api/auth/resend-invitation')
      .send({ token: bootstrapToken(lowerEmail) });
    expect(resLower.status).toBe(200);
    expect(sendAdminSpy).toHaveBeenCalledTimes(2);
    expect(sendAdminSpy.mock.calls[1][0]).toBe(lowerEmail);
  });
});
