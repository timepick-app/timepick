import request from 'supertest';
import { testServer } from '../helpers/test-server';
import { query } from '../../db';

/**
 * POST /api/test/login — contrat observable de la réponse.
 *
 * `hasMemberAccess` doit être un booléen recalculé à la volée via EXISTS(event_users),
 * exactement comme le flux normal (magic-link/refresh, cf. auth-verify.test.ts /
 * auth-refresh.test.ts). Le garde de forme client `isValidStoredAuthUser` (useAuth) exige ce
 * champ ; son absence provoque une purge silencieuse de `localStorage` au montage.
 *
 * Les routes /api/test sont gardées par ALLOW_TEST_ROUTES=true (en plus de NODE_ENV !==
 * 'production', déjà garanti par la suite Jest) — non posé par défaut dans envSetup.js.
 */
describe('POST /api/test/login', () => {
  const previousAllowTestRoutes = process.env.ALLOW_TEST_ROUTES;

  beforeAll(() => {
    process.env.ALLOW_TEST_ROUTES = 'true';
  });

  afterAll(() => {
    process.env.ALLOW_TEST_ROUTES = previousAllowTestRoutes;
  });

  afterEach(async () => {
    await query("DELETE FROM users WHERE email LIKE 'test-routes-%@test.com'");
    await query("DELETE FROM events WHERE name LIKE 'TestRoutes HasMember Event%'");
  });

  it('hasMemberAccess=false pour un admin sans ligne event_users', async () => {
    const email = `test-routes-${Date.now()}@test.com`;
    await query(
      `INSERT INTO users (email, first_name, role) VALUES ($1, $2, 'admin')`,
      [email, 'TestRoutes Admin']
    );

    const res = await request(testServer())
      .post('/api/test/login')
      .send({ email });

    expect(res.status).toBe(200);
    expect(typeof res.body.user.hasMemberAccess).toBe('boolean');
    expect(res.body.user.hasMemberAccess).toBe(false);
  });

  it('hasMemberAccess=true pour un utilisateur rattaché à un événement via event_users', async () => {
    const email = `test-routes-${Date.now()}@test.com`;
    const userResult = await query(
      `INSERT INTO users (email, first_name, role) VALUES ($1, $2, 'user') RETURNING id`,
      [email, 'TestRoutes Member']
    );
    const userId = userResult.rows[0].id;

    const eventResult = await query(
      `INSERT INTO events (name, is_published) VALUES ($1, true) RETURNING id`,
      [`TestRoutes HasMember Event ${Date.now()}`]
    );
    await query('INSERT INTO event_users (event_id, user_id) VALUES ($1, $2)', [
      eventResult.rows[0].id,
      userId,
    ]);

    const res = await request(testServer())
      .post('/api/test/login')
      .send({ email });

    expect(res.status).toBe(200);
    expect(res.body.user.hasMemberAccess).toBe(true);
  });
});
