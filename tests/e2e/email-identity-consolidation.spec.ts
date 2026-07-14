import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin } from './helpers/auth'
import {
  SERVER_BASE,
  createTestEvent,
  deleteTestEvent,
  fetchAdminToken,
  waitForGrapesEditorReady,
} from './helpers/email-editor'

/**
 * Plan 2 (2026-05-23) — Consolidation identité visuelle dans l'éditeur.
 *
 * Couvert ici :
 *   A. URL legacy ?subtab=identite-visuelle redirige vers template-invitation
 *      (pas de 404).
 *   B. EmailSettingsSubtabs n'expose plus l'onglet "Identité visuelle".
 *   C. Éditeur template général : bouton "Identité visuelle" visible, ouverture
 *      du popover, modification d'un champ → clic « Enregistrer » → PATCH +
 *      persistance après reload (Plan 3a — Save manuel remplace l'auto-save
 *      debouncé).
 *   D. Éditeur d'événement : bouton "Identité visuelle" absent (asymétrie
 *      cascade strictement respectée).
 *   E. Plan 3a — fermer le popover sans cliquer Enregistrer = aucune
 *      persistance ; à la réouverture, le form re-hydrate depuis le serveur.
 *
 * Tagged `@slow`. Run local :
 *   ALLOW_TEST_ROUTES=true npm run dev
 *   npx playwright test email-identity-consolidation --grep "@slow"
 */

const ORIGINAL_COLOR = '#18181b'
const TEST_COLOR = '#ff3366'

async function openTemplateEditor(page: Page): Promise<void> {
  await page.goto(
    '/admin/settings?tab=email-template&subtab=template-invitation',
  )
  await page
    .getByTestId('email-template-invitation-open-editor-btn')
    .click()
    .catch(async () => {
      await page
        .getByRole('button', { name: /modifier|ouvrir l'éditeur/i })
        .first()
        .click()
    })
  await page.getByTestId('mjml-editor-inner').waitFor()
  await waitForGrapesEditorReady(page)
}

async function openEventEditor(page: Page, eventId: string): Promise<void> {
  await page.goto(`/admin/events/${eventId}/edit?subtab=template-email#emails`)
  await page.getByTestId('event-invitation-open-editor-btn').click()
  await page.getByTestId('mjml-editor-inner').waitFor()
  await waitForGrapesEditorReady(page)
}

async function resetBrandToFactory(page: Page, token: string): Promise<void> {
  await page.request.post(
    `${SERVER_BASE}/api/admin/settings/email-brand/reset`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
}

test.describe.configure({ timeout: 60_000 })
test.describe('@slow Plan 2 — identité visuelle dans l\'éditeur', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await fetchAdminToken(request)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    // Garantit un état brand stable pour chaque test.
    await resetBrandToFactory(page, token)
  })

  test("redirige ?subtab=identite-visuelle vers template-invitation", async ({
    page,
  }) => {
    await page.goto(
      '/admin/settings?tab=email-template&subtab=identite-visuelle',
    )
    await expect
      .poll(() => new URL(page.url()).searchParams.get('subtab'))
      .toBe('template-invitation')
    await expect
      .poll(() => new URL(page.url()).searchParams.get('tab'))
      .toBe('email-template')
  })

  test("EmailSettingsSubtabs n'expose plus l'onglet Identité visuelle", async ({
    page,
  }) => {
    await page.goto('/admin/settings?tab=email-template')
    // Aucun trigger d'onglet ne porte ce libellé après Plan 2.
    await expect(
      page.getByRole('tab', { name: /Identité visuelle/i }),
    ).toHaveCount(0)
  })

  test("éditeur template : modification + clic Enregistrer persiste après reload (Plan 3a Save manuel)", async ({
    page,
  }) => {
    await openTemplateEditor(page)

    const trigger = page.getByTestId('email-identity-menu-trigger')
    await expect(trigger).toBeVisible()
    await trigger.click()

    const popover = page.getByTestId('email-identity-menu-popover')
    await expect(popover).toBeVisible()

    const colorInput = page.getByTestId(
      'email-identity-menu-primary-color-input',
    )
    await expect(colorInput).toHaveValue(ORIGINAL_COLOR)

    // Plan 3a — bouton Save désactivé tant qu'aucune modification.
    const saveButton = page.getByTestId('email-identity-menu-save')
    await expect(saveButton).toBeDisabled()

    await colorInput.fill(TEST_COLOR)

    // Le bouton devient actif dès la première modification valide.
    await expect(saveButton).toBeEnabled()

    // Avant le clic Enregistrer, le serveur garde encore l'ancienne valeur
    // — l'auto-save debouncé a été retiré dans le Plan 3a.
    const preSaveRes = await page.request.get(
      `${SERVER_BASE}/api/admin/settings/email-brand`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const preSaveBody = (await preSaveRes.json()) as {
      data: { primaryColor: string }
    }
    expect(preSaveBody.data.primaryColor).toBe(ORIGINAL_COLOR)

    // Clic Enregistrer → PATCH part, bouton se redésactive (snapshot
    // resynchronisé). Pas de toast côté identité — feedback assuré par
    // la désactivation + preview canvas (post-smoke 2026-05-23).
    await saveButton.click()

    await expect
      .poll(
        async () => {
          const res = await page.request.get(
            `${SERVER_BASE}/api/admin/settings/email-brand`,
            { headers: { Authorization: `Bearer ${token}` } },
          )
          if (!res.ok()) return null
          const body = (await res.json()) as {
            data: { primaryColor: string }
          }
          return body.data.primaryColor
        },
        { timeout: 5_000 },
      )
      .toBe(TEST_COLOR)

    await expect(saveButton).toBeDisabled()

    // Reload : la valeur est ré-hydratée depuis la DB.
    await openTemplateEditor(page)
    await page.getByTestId('email-identity-menu-trigger').click()
    await expect(
      page.getByTestId('email-identity-menu-primary-color-input'),
    ).toHaveValue(TEST_COLOR)
  })

  test("Plan 3a — fermeture popover sans Save ne persiste rien ; le form re-hydrate depuis le serveur", async ({
    page,
  }) => {
    await openTemplateEditor(page)

    await page.getByTestId('email-identity-menu-trigger').click()
    const popover = page.getByTestId('email-identity-menu-popover')
    await expect(popover).toBeVisible()

    const colorInput = page.getByTestId(
      'email-identity-menu-primary-color-input',
    )
    await colorInput.fill(TEST_COLOR)
    await expect(
      page.getByTestId('email-identity-menu-save'),
    ).toBeEnabled()

    // Ferme le popover sans cliquer Enregistrer (Échap).
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)

    // Serveur inchangé — aucune persistance n'a eu lieu.
    const res = await page.request.get(
      `${SERVER_BASE}/api/admin/settings/email-brand`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const body = (await res.json()) as { data: { primaryColor: string } }
    expect(body.data.primaryColor).toBe(ORIGINAL_COLOR)

    // À la réouverture, le form re-hydrate depuis le serveur — modif perdue.
    await page.getByTestId('email-identity-menu-trigger').click()
    await expect(
      page.getByTestId('email-identity-menu-primary-color-input'),
    ).toHaveValue(ORIGINAL_COLOR)
  })

  test("éditeur événement : bouton Identité visuelle ABSENT (asymétrie cascade)", async ({
    page,
    request,
  }) => {
    const eventId = await createTestEvent(
      request,
      token,
      'E2E Plan 2 — éditeur event sans menu identité',
    )

    try {
      await openEventEditor(page, eventId)

      // Le menu n'est jamais rendu en contexte event.
      await expect(
        page.getByTestId('email-identity-menu-trigger'),
      ).toHaveCount(0)
      await expect(
        page.getByTestId('email-identity-menu-popover'),
      ).toHaveCount(0)
    } finally {
      await deleteTestEvent(request, token, eventId)
    }
  })

  test("clic outside ferme l'infobulle (post-smoke V2 2026-05-23)", async ({
    page,
  }) => {
    await openTemplateEditor(page)
    await page.getByTestId('email-identity-menu-trigger').click()
    const popover = page.getByTestId('email-identity-menu-popover')
    await expect(popover).toBeVisible()

    // Plan 2 post-smoke V2 — overlay retiré (rendait derrière le Dialog
    // parent). Le close-on-outside repose désormais sur le comportement
    // natif Radix Popover. On clique en haut-gauche du Dialog parent.
    await page.mouse.click(10, 10)
    await expect(popover).toHaveCount(0)
    // Le Dialog éditeur parent reste ouvert.
    await expect(page.getByTestId('mjml-editor-inner')).toBeVisible()

    // Échap ferme aussi le popover (parité comportementale).
    await page.getByTestId('email-identity-menu-trigger').click()
    await expect(popover).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)
    await expect(page.getByTestId('mjml-editor-inner')).toBeVisible()
  })
})
