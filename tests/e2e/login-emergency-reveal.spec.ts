import { test, expect } from '@playwright/test'

/**
 * E2E: Contextual reveal of the emergency-login path on /login
 *
 * PRECONDITIONS (test is SKIPPED if unmet — see tech-spec F13):
 *   1. ALLOW_TEST_ROUTES=true on the server (POST /api/test/users is used to
 *      seed the admin + regular user; DELETE /api/test/users/:email for reset).
 *   2. SMTP is available and the two submit paths return identical HTTP
 *      statuses. If admin vs user flows diverge (e.g. selective 503), the
 *      equality assertion is NOT meaningful and the test fails explicitly
 *      rather than silently passing (post-adversarial F4/F5).
 *
 * SEED DATA (DELETE-then-INSERT for idempotency — post-adversarial F3):
 *   - admin email: emerg-reveal-admin@e2e.test  (role: admin)
 *   - user  email: emerg-reveal-user@e2e.test   (role: user)
 *
 * The anti-enumeration test (AC6) is the load-bearing check: post-submit the
 * `[data-testid="login-success"]` textContent + response status + stable
 * headers MUST be byte-for-byte identical for admin vs user emails.
 */

const ADMIN_EMAIL = 'emerg-reveal-admin@e2e.test'
const USER_EMAIL = 'emerg-reveal-user@e2e.test'

async function seedUser(
  request: import('@playwright/test').APIRequestContext,
  email: string,
  role: 'admin' | 'user'
) {
  // DELETE-then-INSERT: the bare POST route has no ON CONFLICT, so a second
  // run would otherwise throw on the unique email constraint and the whole
  // test would silently skip (F3). A 404 from DELETE (not seeded yet) is
  // treated as success.
  const del = await request.delete(`http://localhost:3000/api/test/users/${encodeURIComponent(email)}`)
  if (!del.ok() && del.status() !== 404) {
    console.warn(`[seed] DELETE ${email} returned ${del.status()}; proceeding anyway`)
  }

  const res = await request.post('http://localhost:3000/api/test/users', {
    data: {
      email,
      full_name: role === 'admin' ? 'Emergency Admin' : 'Emergency User',
      role,
    },
  })
  return res.ok()
}

test.describe('Login — emergency-login contextual reveal', () => {
  test('AC1: no recovery link visible on default /login', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('a[href="/emergency-login"]')).toHaveCount(0)
  })

  test('AC4: recovery link revealed when ?ctx=admin', async ({ page }) => {
    await page.goto('/login?ctx=admin')
    const recoveryLink = page.locator('a[href="/emergency-login"]')
    await expect(recoveryLink).toBeVisible()
  })

  test('AC5: recovery link revealed on post-submit success state', async ({ page, request }) => {
    const seeded = await seedUser(request, USER_EMAIL, 'user')
    if (!seeded) test.skip(true, 'Seeding failed — enable ALLOW_TEST_ROUTES=true on the server.')

    await page.goto('/login')
    await page.getByPlaceholder('votre@email.com').fill(USER_EMAIL)
    await page.getByRole('button', { name: /recevoir mon lien de connexion/i }).click()

    const successBlock = page.getByTestId('login-success')
    await expect(successBlock).toBeVisible()
    await expect(successBlock).toContainText(/si cet email est enregistré/i)

    const recoveryLink = successBlock.locator('a[href="/emergency-login"]')
    await expect(recoveryLink).toBeVisible()
  })

  test('AC6: anti-enumeration — identical post-submit DOM + response for admin vs user emails', async ({
    page,
    request,
  }) => {
    const seededAdmin = await seedUser(request, ADMIN_EMAIL, 'admin')
    const seededUser = await seedUser(request, USER_EMAIL, 'user')
    if (!seededAdmin || !seededUser) {
      test.skip(true, 'Seeding failed — enable ALLOW_TEST_ROUTES=true on the server.')
    }

    // SMTP precondition: both submits need equivalent SMTP availability. A 5xx
    // on one email but not the other would defeat the equality assertion for a
    // reason unrelated to enumeration. Skip if server is not reporting smtp:ok.
    const health = await request.get('http://localhost:3000/api/health')
    if (health.ok()) {
      const body = await health.json()
      if (body?.services?.smtp && body.services.smtp !== 'ok') {
        test.skip(
          true,
          `SMTP not ok (${body.services.smtp}) — anti-enumeration comparison not meaningful.`
        )
      }
    }

    type Capture = {
      status: number
      contentType: string
      cacheControl: string
      body: string
    }

    async function capture(email: string): Promise<Capture> {
      await page.goto('/login')
      await page.getByPlaceholder('votre@email.com').fill(email)

      const [response] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST'
        ),
        page.getByRole('button', { name: /recevoir mon lien de connexion/i }).click(),
      ])

      const status = response.status()
      const headers = response.headers()

      // Surface post-submit divergence explicitly instead of hanging on the
      // testid wait (post-adversarial F5). 503 means the success block is
      // never rendered — fail fast with a meaningful message.
      if (status >= 500) {
        throw new Error(
          `POST /api/auth/login for ${email} returned ${status} — anti-enumeration ` +
            `equality cannot be asserted. Verify SMTP is healthy for BOTH seeded accounts ` +
            `before rerunning. Response body: ${await response.text().catch(() => '<unreadable>')}`
        )
      }

      const successBlock = page.getByTestId('login-success')
      await expect(successBlock).toBeVisible({ timeout: 10_000 })
      // textContent (not innerHTML) avoids React/Radix-generated id attributes
      // and Tailwind class reordering noise — see tech-spec F1.
      const body = await successBlock.textContent()

      return {
        status,
        contentType: headers['content-type'] ?? '',
        cacheControl: headers['cache-control'] ?? '',
        body: body ?? '',
      }
    }

    const adminResult = await capture(ADMIN_EMAIL)
    const userResult = await capture(USER_EMAIL)

    // Assert status first so a later textContent mismatch cannot mask an
    // upstream divergence (F4). Status equality is a precondition for the
    // remaining DOM comparison to be meaningful.
    expect(adminResult.status, 'HTTP status must be identical').toBe(userResult.status)
    expect(adminResult.contentType, 'content-type must be identical').toBe(userResult.contentType)
    expect(adminResult.cacheControl, 'cache-control must be identical').toBe(userResult.cacheControl)
    expect(adminResult.body, 'login-success textContent must be identical').toBe(userResult.body)
  })
})
