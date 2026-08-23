import request from 'supertest';
import { testServer } from '../helpers/test-server';
import pool from '../../db/pool';

/**
 * F-083 (bis, pentest 2026-08-19) : le limiter IP (`loginIpLimiter`, auth.routes.ts) monté
 * EN SÉRIE avant le limiter par email cible. Testé dans un fichier DÉDIÉ, à dessein : Jest
 * isole le registre de modules PAR FICHIER (cf. test-server.ts) — `app` (et son singleton
 * `loginIpLimiter`, un `MemoryStore` en mémoire process) démarre donc avec un compteur à
 * zéro ici, sans interférence des dizaines de requêtes /login des autres suites
 * (auth-login.test.ts, auth-security-regression.test.ts) qui partageraient sinon le même
 * compteur par IP dans le même fichier.
 */
describe('POST /api/auth/login — rate-limit IP (F-083 bis)', () => {
  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE 'test-secreg-iplim-%@test.com'");
  });

  it('31e requête depuis la même IP avec des emails différents → 429 RATE_LIMITED (limiter IP, étage 2)', async () => {
    const responses = [];
    for (let i = 0; i < 31; i++) {
      responses.push(
        await request(testServer())
          .post('/api/auth/login')
          .send({ email: `test-secreg-iplim-${Date.now()}-${i}@test.com` })
      );
    }

    const statuses = responses.map((r) => r.status);
    expect(statuses.slice(0, 30)).toEqual(Array(30).fill(200));
    expect(statuses[30]).toBe(429);
    expect(responses[30].body.error.code).toBe('RATE_LIMITED');
  });
});
