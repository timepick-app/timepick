import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { loginAsAdmin, TEST_ADMIN } from './helpers/auth'

/**
 * Story 26-2d — runtime smokes A-E for the locked-shell inheritance panel.
 *
 * Cible la mémoire `feedback_grapesjs_runtime_smoke_required` — les tests
 * vitest mocknet `initEmailEditor` et passent même quand le mauvais nom d'event
 * GrapesJS est branché (`component:select-before` au lieu de
 * `component:select:before`). Cette spec frappe l'éditeur réel.
 *
 * Stratégie :
 * - `window.__grapesEditor` est exposé en DEV par `grapesConfig.ts` ; on
 *   l'utilise pour selectionner programmatiquement un descendant de la section
 *   header / footer. La sélection passe par le même `setSelected` interne que
 *   les clics utilisateur (cf. `grapes.mjs:67711-67728`), donc l'event
 *   `component:select:before` fire de la même façon.
 */

const SERVER_BASE = 'http://localhost:3000'

const SAMPLE_CONTENT_HEADER =
  '<mj-section data-part-kind="header" background-color="#0066cc">' +
  '<mj-column><mj-text color="#ffffff" font-weight="bold">Test override</mj-text></mj-column>' +
  '</mj-section>'

async function fetchAdminToken(request: APIRequestContext): Promise<string> {
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

async function deleteShellParts(
  request: APIRequestContext,
  ownerKind: 'brand' | 'template' | 'event',
  ownerId: string,
): Promise<void> {
  await request.delete(
    `${SERVER_BASE}/api/test/shell-parts/${ownerKind}/${encodeURIComponent(ownerId)}`,
  )
}

/**
 * Attend que GrapesJS soit complètement initialisé et que les 3 sections
 * locked-shell soient taguées. Sans cette attente, `select()` programmatique
 * peut tomber sur un wrapper vide juste après le mount React.
 */
async function waitForGrapesEditorReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const ed = (window as unknown as { __grapesEditor?: unknown }).__grapesEditor as
        | { getWrapper: () => { find: (sel: string) => unknown[] } }
        | undefined
      if (!ed) return false
      const sections = ed.getWrapper().find('[css-class~="locked-shell"]')
      return sections.length === 3
    },
    { timeout: 20000 },
  )
}

/**
 * Sélectionne un descendant de la section locked-shell ciblée et déclenche
 * `component:select:before` via le pipeline `setSelected` interne de GrapesJS
 * — identique à un clic souris dans le canvas.
 */
async function selectLockedShellDescendant(
  page: Page,
  partKind: 'header' | 'footer',
): Promise<void> {
  await page.evaluate((kind) => {
    type Comp = {
      getAttributes: () => Record<string, string>
      components: () => { models: Comp[] }
    }
    const ed = (window as unknown as {
      __grapesEditor: {
        getWrapper: () => { find: (sel: string) => Comp[] }
        select: (c: Comp) => void
      }
    }).__grapesEditor
    const sections = ed.getWrapper().find('[css-class~="locked-shell"]')
    const section = sections.find(
      (s) => s.getAttributes()['data-part-kind'] === kind,
    )
    if (!section) throw new Error(`section data-part-kind="${kind}" introuvable`)
    const descendants = section.components().models
    // Le clic réel atterrit sur un descendant feuille (mj-text), pas la section
    // elle-même — c'est le cas que le `closest` du handler doit gérer.
    const target = descendants[0]?.components().models[0] ?? descendants[0] ?? section
    ed.select(target)
  }, partKind)
}

// ============================================================================
// Smoke A — Override creation event-level (chemin nominal)
// ============================================================================

test.describe('Story 26-2d — Smoke A (event-level header override)', () => {
  let token: string
  let eventId: string

  test.beforeAll(async ({ request }) => {
    token = await fetchAdminToken(request)
    eventId = await createTestEvent(request, token, 'Smoke A — 26-2d')
  })

  test.afterAll(async ({ request }) => {
    await deleteShellParts(request, 'event', eventId)
    await deleteTestEvent(request, token, eventId)
  })

  test.beforeEach(async ({ page, request }) => {
    await deleteShellParts(request, 'event', eventId)
    await loginAsAdmin(page)
  })

  test('header click opens panel, customize succeeds, re-click stays silent', async ({
    page,
  }) => {
    await page.goto(`/admin/events/${eventId}/edit?subtab=template-email#emails`)
    await page.getByTestId('event-invitation-preview-iframe').waitFor()
    await page.getByTestId('event-invitation-open-editor-btn').click()
    await page.getByTestId('mjml-editor-inner').waitFor()
    await waitForGrapesEditorReady(page)

    // STEP 1 — select header descendant → panel must open with origin=template
    // (no shell_parts row for this event yet).
    await selectLockedShellDescendant(page, 'header')
    const panel = page.getByTestId('mjml-editor-locked-panel-overlay')
    await expect(panel).toBeVisible({ timeout: 5000 })
    // The cascade origin for an event without override resolves to whichever
    // upper level holds the content (template / brand / hardcoded). The only
    // invariant for AC5 is "not the current ownerKind" — that's what gates
    // the panel from opening.
    const initialOrigin = await page
      .getByTestId('locked-shell-info-panel-header')
      .getAttribute('data-origin')
    expect(initialOrigin).not.toBe('event')

    // STEP 2 — customize: PUT shell-parts → toast success → panel closes →
    // editor-context refetch → origin becomes 'event'.
    const putPromise = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/admin/shell-parts/event/${eventId}/header`) &&
        r.request().method() === 'PUT',
    )
    const refetchPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/admin/editor-context') &&
        r.request().method() === 'GET',
    )
    await page.getByTestId('locked-shell-customize-btn-header').click()

    const putResp = await putPromise
    expect(putResp.status()).toBe(200)
    const putBody = (await putResp.json()) as {
      data: { ownerKind: string; partKind: string }
    }
    expect(putBody.data.ownerKind).toBe('event')
    expect(putBody.data.partKind).toBe('header')

    await expect(panel).toBeHidden({ timeout: 5000 })
    await refetchPromise

    // STEP 3 — re-click header → panel does NOT open (origin === ownerKind).
    await selectLockedShellDescendant(page, 'header')
    await page.waitForTimeout(300) // give React a tick to potentially re-render
    await expect(panel).toBeHidden()
  })
})

// ============================================================================
// Smoke B — Toast error (chemin résilience)
// ============================================================================

test.describe('Story 26-2d — Smoke B (toast.error on server 400)', () => {
  let token: string
  let eventId: string

  test.beforeAll(async ({ request }) => {
    token = await fetchAdminToken(request)
    eventId = await createTestEvent(request, token, 'Smoke B — 26-2d')
  })

  test.afterAll(async ({ request }) => {
    await deleteShellParts(request, 'event', eventId)
    await deleteTestEvent(request, token, eventId)
  })

  test.beforeEach(async ({ page, request }) => {
    await deleteShellParts(request, 'event', eventId)
    await loginAsAdmin(page)
  })

  test('server 400 surfaces a toast.error without crashing the editor', async ({
    page,
  }) => {
    test.setTimeout(60000)
    await page.route('**/api/admin/shell-parts/**', (route) => {
      if (route.request().method() === 'PUT') {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { message: 'Contenu MJML invalide (test injection)' },
          }),
        })
      }
      return route.continue()
    })

    await page.goto(`/admin/events/${eventId}/edit?subtab=template-email#emails`)
    await page.getByTestId('event-invitation-preview-iframe').waitFor()
    await page.getByTestId('event-invitation-open-editor-btn').click()
    await page.getByTestId('mjml-editor-inner').waitFor()
    await waitForGrapesEditorReady(page)

    await selectLockedShellDescendant(page, 'header')
    await expect(page.getByTestId('mjml-editor-locked-panel-overlay')).toBeVisible()
    await page.getByTestId('locked-shell-customize-btn-header').click()

    // Sonner toasts carry `data-sonner-toast` + `data-type="error"` when fired
    // via `toast.error()`. The message comes from the server payload via
    // `extractErrorMessage` (`response.data.error.message`).
    const toast = page.locator('[data-sonner-toast]').filter({
      hasText: 'Contenu MJML invalide (test injection)',
    })
    await expect(toast).toBeVisible({ timeout: 10000 })

    // No white-screen: the editor inner still mounted.
    await expect(page.getByTestId('mjml-editor-inner')).toBeVisible()
  })
})

// ============================================================================
// Smoke C — Idempotence (3 PUTs successifs → 1 row, updated_at > created_at)
// ============================================================================

test.describe('Story 26-2d — Smoke C (UPSERT idempotence)', () => {
  let token: string
  let eventId: string

  test.beforeAll(async ({ request }) => {
    token = await fetchAdminToken(request)
    eventId = await createTestEvent(request, token, 'Smoke C — 26-2d')
  })

  test.afterAll(async ({ request }) => {
    await deleteShellParts(request, 'event', eventId)
    await deleteTestEvent(request, token, eventId)
  })

  test('three successive PUTs return 200 and updated_at > created_at on the third', async ({
    request,
  }) => {
    await deleteShellParts(request, 'event', eventId)

    const responses: Array<{
      id: string
      createdAt: string
      updatedAt: string
    }> = []

    for (let i = 1; i <= 3; i++) {
      const content =
        `<mj-section data-part-kind="header" background-color="#000000"><mj-column>` +
        `<mj-text color="#ffffff">Iteration ${i}</mj-text></mj-column></mj-section>`
      const res = await request.put(
        `${SERVER_BASE}/api/admin/shell-parts/event/${eventId}/header`,
        {
          headers: { Authorization: `Bearer ${token}` },
          data: { contentMjml: content },
        },
      )
      expect(res.status(), `PUT #${i} should return 200`).toBe(200)
      const body = (await res.json()) as {
        data: { id: string; createdAt: string; updatedAt: string }
      }
      responses.push(body.data)
      // Small spacing so the trigger's NOW() produces a distinct updatedAt;
      // otherwise three PUTs in the same millisecond collapse.
      await new Promise((r) => setTimeout(r, 25))
    }

    // ON CONFLICT (owner_kind, owner_id, part_kind) DO UPDATE preserves the
    // primary key → same id across the three responses.
    expect(responses[0]?.id).toBe(responses[1]?.id)
    expect(responses[1]?.id).toBe(responses[2]?.id)

    // The first response carries the initial timestamps (created_at = updated_at
    // at insert), the third should have updated_at strictly later.
    expect(
      new Date(responses[2]!.updatedAt).getTime(),
    ).toBeGreaterThan(new Date(responses[0]!.createdAt).getTime())

    // The createdAt should remain stable across upserts.
    expect(responses[0]?.createdAt).toBe(responses[2]?.createdAt)
  })
})

// ============================================================================
// Smoke D — Template général : pas de panneau d'héritage à ce niveau.
// Cf. la politique de structure verrouillée des emails, « Portée du panneau d'héritage » : le
// template général est une source dans la cascade, pas un niveau qui hérite.
// ============================================================================

test.describe('Smoke D (template général — pas de panneau d\'héritage)', () => {
  test.beforeEach(async ({ page, request }) => {
    await deleteShellParts(request, 'template', 'invitation')
    await loginAsAdmin(page)
  })

  test.afterAll(async ({ request }) => {
    await deleteShellParts(request, 'template', 'invitation')
  })

  test('header click does NOT open the inheritance panel at template general level', async ({
    page,
  }) => {
    test.setTimeout(60000)
    await page.goto('/admin/settings?tab=email-template&subtab=template-invitation')
    await page.getByTestId('invitation-open-editor-btn').click()
    await page.getByTestId('mjml-editor-inner').waitFor()
    await waitForGrapesEditorReady(page)

    await selectLockedShellDescendant(page, 'header')
    // Give React a tick to potentially open the panel; assert it stays closed.
    await page.waitForTimeout(300)
    const panel = page.getByTestId('mjml-editor-locked-panel-overlay')
    await expect(panel).toBeHidden()

    // Same expectation for footer — règle uniforme à ce niveau.
    await selectLockedShellDescendant(page, 'footer')
    await page.waitForTimeout(300)
    await expect(panel).toBeHidden()
  })
})

// ============================================================================
// Smoke E — Brand-level + hardcoded (extrémité cascade — API-only, pas d'UI brand)
// ============================================================================

test.describe('Story 26-2d — Smoke E (brand-level header override via API)', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await fetchAdminToken(request)
  })

  test.beforeEach(async ({ request }) => {
    await deleteShellParts(request, 'brand', '1')
  })

  test.afterAll(async ({ request }) => {
    await deleteShellParts(request, 'brand', '1')
  })

  test('PUT /api/admin/shell-parts/brand/1/header creates the brand-level override', async ({
    request,
  }) => {
    const res = await request.put(
      `${SERVER_BASE}/api/admin/shell-parts/brand/1/header`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { contentMjml: SAMPLE_CONTENT_HEADER },
      },
    )
    expect(res.status()).toBe(200)
    const body = (await res.json()) as {
      data: {
        ownerKind: string
        ownerId: string
        partKind: string
        contentMjml: string
      }
    }
    expect(body.data).toMatchObject({
      ownerKind: 'brand',
      ownerId: '1',
      partKind: 'header',
    })
    expect(body.data.contentMjml).toContain('data-part-kind="header"')
  })
})
