import { test, expect, type APIRequestContext } from '@playwright/test'
import { loginAsAdmin, TEST_ADMIN } from './helpers/auth'

/**
 * Visual regression baseline for the MJML editor overlay (Story 23-3, AC15;
 * un-fixme'd by Story 23-4 / E2.S4 — see AC19; extended by Story 24-3 / E3.S3
 * with per-event baselines + catch-up E2 baselines deferred from 24-0/AC3).
 * Wires the Epic 22 retrospective action A5.
 *
 * STATUS: active. Baselines first generated on 2026-05-01 after Story 23-4
 * shipped the host CTA (`<EmailInvitationTemplatePanel>`); per-event baselines
 * + E2 catch-up baselines added 2026-05-02 by Story 24-3. The spec is
 * informational — the `@slow` annotation excludes it from the default CI
 * run via `--grep-invert @slow`. Locally, refresh the baselines with
 * `npx playwright test email-editor-overlay --update-snapshots --grep "@slow"`
 * whenever editor visuals legitimately change.
 */

const SERVER_BASE = 'http://localhost:3000'

const CUSTOM_BODY_FOR_BASELINE =
  '<!-- BODY:START -->\n' +
  '<mj-section>\n' +
  '  <mj-column>\n' +
  '    <mj-text font-size="16px" font-weight="bold">CUSTOM TEMPLATE FOR BASELINE</mj-text>\n' +
  '    <mj-text>{{magic_link}} — {{expiration_date}}</mj-text>\n' +
  '  </mj-column>\n' +
  '</mj-section>\n' +
  '<!-- BODY:END -->'

async function fetchAdminToken(request: APIRequestContext): Promise<string> {
  // Idempotent admin creation. The endpoint may respond 409 (already exists)
  // or 500 (e.g. a clashing entry from a previous run with different fixture
  // data). Either way, the subsequent /api/test/login is the actual gate —
  // the existing helpers/auth.ts swallows non-409 errors here too.
  await request
    .post(`${SERVER_BASE}/api/test/users`, {
      data: {
        email: TEST_ADMIN.email,
        full_name: TEST_ADMIN.fullName,
        role: TEST_ADMIN.role,
      },
    })
    .catch(() => undefined)
  const login = await request.post(`${SERVER_BASE}/api/test/login`, {
    data: { email: TEST_ADMIN.email },
  })
  if (!login.ok()) {
    throw new Error(`Test login failed: HTTP ${login.status()}`)
  }
  const { token } = (await login.json()) as { token: string }
  return token
}

async function createTestEvent(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<string> {
  const res = await request.post(`${SERVER_BASE}/api/admin/events`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name },
  })
  if (!res.ok()) {
    throw new Error(`Cannot create test event "${name}": HTTP ${res.status()}`)
  }
  const body = (await res.json()) as { data: { id: string } }
  return body.data.id
}

async function deleteTestEvent(
  request: APIRequestContext,
  token: string,
  eventId: string,
): Promise<void> {
  await request.delete(`${SERVER_BASE}/api/admin/events/${eventId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

async function patchEventInvitationBody(
  request: APIRequestContext,
  token: string,
  eventId: string,
  bodyMjml: string,
): Promise<void> {
  const res = await request.patch(
    `${SERVER_BASE}/api/admin/events/${eventId}/email-template`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { bodyMjml },
    },
  )
  if (!res.ok()) {
    throw new Error(
      `Cannot PATCH event email template (${eventId}): HTTP ${res.status()}`,
    )
  }
}

test.describe('@slow MJML editor overlay — visual baseline', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('initial load with body content matches snapshot', async ({ page }) => {
    await page.goto('/admin/settings?tab=email-template&subtab=template-invitation')
    await page.getByTestId('invitation-open-editor-btn').click()
    await page.getByTestId('mjml-editor-inner').waitFor()
    await expect(page).toHaveScreenshot('email-editor-initial.png', {
      maxDiffPixelRatio: 0.02,
    })
  })
})

/**
 * Story 24-3 / E3.S3 — per-event MJML editor baselines.
 *
 * Two baselines: inherited (no override) and customized (PATCHed body).
 * Each test creates its own
 * event via the admin API so the baselines stay stable across runs without
 * relying on a fixture-seeded UUID.
 */
test.describe('@slow per-event MJML editor — visual baseline', () => {
  let token: string
  let inheritedEventId: string
  let customEventId: string

  test.beforeAll(async ({ request }) => {
    token = await fetchAdminToken(request)
    inheritedEventId = await createTestEvent(
      request,
      token,
      'E2E Story 24-3 — inherited baseline',
    )
    customEventId = await createTestEvent(
      request,
      token,
      'E2E Story 24-3 — custom baseline',
    )
    await patchEventInvitationBody(
      request,
      token,
      customEventId,
      CUSTOM_BODY_FOR_BASELINE,
    )
  })

  test.afterAll(async ({ request }) => {
    if (inheritedEventId) {
      await deleteTestEvent(request, token, inheritedEventId)
    }
    if (customEventId) {
      await deleteTestEvent(request, token, customEventId)
    }
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('event template inherited matches snapshot', async ({ page }) => {
    await page.goto(
      `/admin/events/${inheritedEventId}/edit#template`,
    )
    await page.getByTestId('event-invitation-preview-iframe').waitFor()
    await expect(page).toHaveScreenshot('event-template-inherited.png', {
      maxDiffPixelRatio: 0.02,
    })
  })

  test('event template custom matches snapshot', async ({ page }) => {
    await page.goto(
      `/admin/events/${customEventId}/edit#template`,
    )
    await page.getByTestId('event-invitation-preview-iframe').waitFor()
    await expect(page).toHaveScreenshot('event-template-custom.png', {
      maxDiffPixelRatio: 0.02,
    })
  })
})

/**
 * Story 24-3 / E3.S3 — E2 settings catch-up baselines (closes the
 * 24-0/AC3 split-delivery gap formally per `prd.md:1026-1031`).
 *
 * Four Settings sub-tab panels that should have had visual baselines under
 * Epic 23 but were deferred. Each test navigates to the sub-tab and
 * screenshots the panel testid frozen by the corresponding story.
 */
test.describe('@slow E2 settings catch-up — visual baselines', () => {
  // The Settings page renders <SmtpConfigPanel> above <EmailSettingsSubtabs>; in a 1280×720
  // viewport the SmtpConfigPanel fills the visible area, pushing the targeted sub-tab panels
  // below the fold. Page-scoped screenshots therefore captured the SMTP panel for every test
  // and produced byte-identical baselines (Story 24-3 code-review H1, 2026-05-02). The fix is
  // to scope each screenshot to the targeted panel locator so the captured pixels reflect the
  // actual sub-tab content regardless of viewport / scroll state.
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('settings template invitation default matches snapshot', async ({ page }) => {
    await page.goto('/admin/settings?tab=email-template&subtab=template-invitation')
    const panel = page.getByTestId('email-invitation-template-panel')
    await panel.waitFor()
    await expect(panel).toHaveScreenshot('settings-template-invitation-defaut.png', {
      maxDiffPixelRatio: 0.02,
    })
  })

  test('settings magic-link login matches snapshot', async ({ page }) => {
    await page.goto('/admin/settings?tab=email-template&subtab=emails-systeme-magic-link-login')
    const panel = page.getByTestId('email-system-template-panel-magic_link_login')
    await panel.waitFor()
    await expect(panel).toHaveScreenshot('settings-magic-link-login.png', {
      maxDiffPixelRatio: 0.02,
    })
  })

  // Le sous-onglet « magic-link recovery » n'existe plus : `4238a15e`
  // (2026-06-16, sécurisation des codes de secours) a supprimé le template
  // `magic_link_recovery` lui-même — migration 027, DELETE de la row et CHECK
  // resserré de 9 à 8 valeurs — puis sa clé côté client et son sous-onglet. Un
  // `?subtab=` inconnu retombe sur `template-invitation`, donc le test
  // attendait indéfiniment un panneau qui ne peut plus être rendu. Sa baseline
  // est supprimée avec lui.

  test('settings reservation confirmation matches snapshot', async ({ page }) => {
    await page.goto(
      '/admin/settings?tab=email-template&subtab=emails-systeme-confirmation',
    )
    const panel = page.getByTestId('email-reservation-confirmation-panel')
    await panel.waitFor()
    await expect(panel).toHaveScreenshot('settings-confirmation-reservation.png', {
      maxDiffPixelRatio: 0.02,
    })
  })
})
