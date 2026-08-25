import { test, expect } from '@playwright/test'

/**
 * E2E : F-085 — la révocation serveur déclenchée par le clic « Déconnexion »
 * survit à la navigation qui la suit immédiatement (`window.location.href =
 * '/login'`).
 *
 * C'est le seul maillon qui manque : les 3 suites unitaires (NavUser.test.tsx,
 * PublicUserMenu.test.tsx, useAuth.test.ts) mockent `fetch` et ne vérifient
 * que l'appel — jamais qu'une requête réelle survit à la navigation du
 * navigateur, exactement le bug déjà observé (un XHR axios n'est envoyé qu'à
 * la micro-tâche suivante, la navigation l'annule avant qu'il ne parte). La
 * régression serveur `auth-security-regression.test.ts` prouve que l'endpoint
 * révoque ; ce test prouve que le navigateur l'appelle réellement.
 *
 * PRÉCONDITION : ALLOW_TEST_ROUTES=true côté serveur (POST /api/test/users +
 * POST /api/test/login, cf. tests/e2e/helpers/auth.ts).
 */

const SERVER_BASE = 'http://localhost:3000'
const TEST_EMAIL = 'e2e-logout-revocation-admin@test.local'

test.describe('Logout — révocation serveur (F-085)', () => {
  test.afterAll(async ({ request }) => {
    await request.delete(`${SERVER_BASE}/api/test/users/${encodeURIComponent(TEST_EMAIL)}`)
  })

  test('le clic « Déconnexion » révoque le jeton serveur avant que la page ne se décharge', async ({
    page,
    request,
  }) => {
    // Seed : utilisateur admin dédié + jeton minté par /api/test/login, qui
    // porte le claim `tv` (server/src/routes/test.routes.ts:149-150) —
    // condition nécessaire à la révocabilité, cf. auth.middleware.ts.
    const createRes = await request.post(`${SERVER_BASE}/api/test/users`, {
      data: { email: TEST_EMAIL, full_name: 'E2E Logout Admin', role: 'admin' },
    })
    if (!createRes.ok() && createRes.status() !== 409) {
      throw new Error(`Échec création utilisateur test : ${createRes.status()}`)
    }

    const loginRes = await request.post(`${SERVER_BASE}/api/test/login`, {
      data: { email: TEST_EMAIL },
    })
    expect(loginRes.ok()).toBe(true)
    const { token, user } = await loginRes.json()

    // Contrôle AVANT : sans cette assertion, un test qui échoue après coup
    // pourrait échouer « pour de mauvaises raisons » (jeton déjà mort avant
    // même le clic). C'est elle qui rend l'assertion finale probante.
    const before = await request.get(`${SERVER_BASE}/api/me/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(before.status()).toBe(200)

    await page.goto('/admin')
    await page.evaluate(
      ({ user, token }) => {
        localStorage.setItem('auth_user', JSON.stringify(user))
        localStorage.setItem('auth_token', token)
        localStorage.setItem('session_expires_at', String(Date.now() + 7200000))
        localStorage.setItem('loginTime', String(Math.floor(Date.now() / 1000)))
        localStorage.setItem('sessionTTL', '7200')
      },
      { user, token }
    )
    await page.reload()

    await page.getByRole('button', { name: 'Menu utilisateur' }).click()
    await page.getByRole('menuitem', { name: 'Déconnexion' }).click()

    await page.waitForURL('**/login')

    // La révocation part en `fetch(keepalive)` juste avant le déchargement :
    // elle peut atterrir légèrement après la navigation. `expect.poll` évite
    // le `waitForTimeout` arbitraire tout en bornant l'attente.
    await expect
      .poll(
        async () => {
          const res = await request.get(`${SERVER_BASE}/api/me/profile`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          return { status: res.status(), code: res.ok() ? null : (await res.json()).code }
        },
        {
          timeout: 5000,
          message: 'le jeton capturé avant le clic devait être révoqué (401 SESSION_INVALID)',
        }
      )
      .toEqual({ status: 401, code: 'SESSION_INVALID' })
  })
})
