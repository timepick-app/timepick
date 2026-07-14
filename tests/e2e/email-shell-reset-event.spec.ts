import { test, expect, type APIRequestContext } from '@playwright/test'
import { loginAsAdmin } from './helpers/auth'
import {
  SERVER_BASE,
  createTestEvent,
  deleteShellParts,
  deleteTestEvent,
  fetchAdminToken,
  seedShellPart,
  waitForGrapesEditorReady,
} from './helpers/email-editor'

/**
 * Story 26-4 — Spec 3 : bouton « Réinitialiser » au niveau **événement**
 * (livré par 26-3 en orchestration `Promise.allSettled` jusqu'à 3 mutations).
 *
 * Source de vérité (frozen 2026-05-13) — politique de structure verrouillée des emails,
 * § « Annulation par l'utilisateur » (l. 156) :
 *   « Un seul bouton "Réinitialiser au design du modèle" par événement :
 *     efface toutes les personnalisations de l'événement en une fois. »
 *
 * Wording du toast succès confirmé verbatim dans `MjmlEditorOverlayInner.tsx`
 * lignes 759-762 :
 *   ownerKind === 'event' → 'Événement réinitialisé au modèle.'
 *   ownerKind === 'template' → "Modèle d'invitation restauré."
 *
 * Tagged `@slow`. Run local :
 *   ALLOW_TEST_ROUTES=true npm run dev
 *   npx playwright test email-shell-reset-event --grep "@slow"
 *
 * Le flux template (smoke E partial-failure) est déjà couvert par
 * `email-reset-partial-failure-26-3.spec.ts`. Cette spec complète côté event.
 */

const HEADER_OVERRIDE_MJML =
  '<mj-section data-part-kind="header" background-color="#00aaff" css-class="locked-shell">' +
  '<mj-column><mj-text color="#ffffff">Reset test — header surchargé niveau event</mj-text></mj-column>' +
  '</mj-section>'

interface EditorContextHeader {
  data: { header: { origin: string } }
}

async function fetchEventHeaderOrigin(
  request: APIRequestContext,
  token: string,
  eventId: string,
): Promise<string> {
  const res = await request.get(
    `${SERVER_BASE}/api/admin/editor-context?ownerKind=event&ownerId=${encodeURIComponent(
      eventId,
    )}&templateKey=invitation`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok()) {
    throw new Error(`editor-context GET event/${eventId} HTTP ${res.status()}`)
  }
  const body = (await res.json()) as EditorContextHeader
  return body.data.header.origin
}

async function openEventEditor(
  page: import('@playwright/test').Page,
  eventId: string,
): Promise<void> {
  await page.goto(
    `/admin/events/${eventId}/edit?subtab=template-email#emails`,
  )
  await page.getByTestId('event-invitation-open-editor-btn').click()
  await page.getByTestId('mjml-editor-inner').waitFor()
  await waitForGrapesEditorReady(page)
}

test.describe.configure({ timeout: 60_000 })
test.describe('@slow Story 26-4 — Email Shell reset niveau event', () => {
  let token: string
  let eventId: string

  test.beforeAll(async ({ request }) => {
    token = await fetchAdminToken(request)
    eventId = await createTestEvent(
      request,
      token,
      'E2E Story 26-4 — reset event',
    )
  })

  test.afterAll(async ({ request }) => {
    await deleteShellParts(request, 'event', eventId)
    await deleteShellParts(request, 'template', 'invitation')
    await deleteTestEvent(request, token, eventId)
  })

  test.beforeEach(async ({ page, request }) => {
    await deleteShellParts(request, 'event', eventId)
    await deleteShellParts(request, 'template', 'invitation')
    await loginAsAdmin(page)
  })

  test.afterEach(async ({ request }) => {
    await deleteShellParts(request, 'event', eventId)
    await deleteShellParts(request, 'template', 'invitation')
  })

  test("bouton désactivé quand event n'a aucune surcharge", async ({
    page,
    request,
  }) => {
    // Confirme l'état API avant l'assertion UI (anti-race : sans cela, le
    // `toBeDisabled` peut passer pendant l'état loading de TanStack Query,
    // masquant un bug où `isResetAvailable` retournerait toujours true).
    const originBefore = await fetchEventHeaderOrigin(request, token, eventId)
    expect(originBefore).toBe('hardcoded')

    await openEventEditor(page, eventId)
    // Attend que les queries TanStack soient settled avant l'assertion UI.
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('mjml-editor-reset-btn')).toBeDisabled()
  })

  test('clic + confirm → DELETE shell-parts event + cascade remonte au template', async ({
    page,
    request,
  }) => {
    await seedShellPart(
      request,
      token,
      'event',
      eventId,
      'header',
      HEADER_OVERRIDE_MJML,
    )

    const originBefore = await fetchEventHeaderOrigin(request, token, eventId)
    expect(originBefore).toBe('event')

    await openEventEditor(page, eventId)

    const resetBtn = page.getByTestId('mjml-editor-reset-btn')
    await expect(resetBtn).toBeEnabled()

    const deletePromise = page.waitForResponse(
      (r) =>
        r.url().includes(
          `/api/admin/shell-parts/event/${encodeURIComponent(eventId)}/header`,
        ) && r.request().method() === 'DELETE',
    )

    await resetBtn.click()
    const confirmDialog = page.getByTestId('mjml-editor-reset-confirm')
    await expect(confirmDialog).toBeVisible()
    await confirmDialog
      .getByRole('button', { name: 'Restaurer', exact: true })
      .click()

    const deleteResp = await deletePromise
    expect(
      deleteResp.status(),
      `DELETE shell-parts event/header doit retourner 204 idempotent`,
    ).toBe(204)

    // Poll pour absorber la latence d'invalidation post-DELETE (TanStack
    // refetch + replica lag). beforeEach a vidé template aussi → origin
    // doit remonter au hardcoded.
    await expect
      .poll(
        () => fetchEventHeaderOrigin(request, token, eventId),
        {
          timeout: 5000,
          message:
            'post-reset, origin doit remonter au hardcoded (cascade vide template+event)',
        },
      )
      .toBe('hardcoded')
  })

  test('toast succès affiché avec wording attendu', async ({
    page,
    request,
  }) => {
    await seedShellPart(
      request,
      token,
      'event',
      eventId,
      'header',
      HEADER_OVERRIDE_MJML,
    )

    await openEventEditor(page, eventId)

    const resetBtn = page.getByTestId('mjml-editor-reset-btn')
    await expect(resetBtn).toBeEnabled()
    await resetBtn.click()

    const confirmDialog = page.getByTestId('mjml-editor-reset-confirm')
    await expect(confirmDialog).toBeVisible()
    await confirmDialog
      .getByRole('button', { name: 'Restaurer', exact: true })
      .click()

    // Wording verbatim `MjmlEditorOverlayInner.tsx:761` :
    //   ownerKind === 'event' → 'Événement réinitialisé au modèle.'
    // Regex Q4 resserrée pour matcher ce wording (la regex du story file
    // `/Modèle restauré|Réinitialisation/i` ne le matchait pas).
    const successToast = page
      .locator('[data-sonner-toast]')
      .filter({ hasText: /Événement réinitialisé|réinitialisé au modèle/i })
    await expect(successToast).toBeVisible({ timeout: 10000 })
  })
})
