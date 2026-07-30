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
  // Testid réel du panel (`EmailInvitationTemplatePanel.tsx`). L'ancien
  // `email-template-invitation-open-editor-btn` n'a jamais existé côté client,
  // et le `.catch()` de repli visait /modifier|ouvrir l'éditeur/i quand le
  // libellé est « Personnaliser avec l'éditeur » : les deux branches
  // échouaient, le test brûlait son timeout. Repli supprimé — un sélecteur
  // faux doit échouer vite et bruyamment.
  await page.getByTestId('invitation-open-editor-btn').click()
  await page.getByTestId('mjml-editor-inner').waitFor()
  await waitForGrapesEditorReady(page)
}

async function openEventEditor(page: Page, eventId: string): Promise<void> {
  await page.goto(`/admin/events/${eventId}/edit#template`)
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

  // Plan 4a (d607bf4f, 2026-05-24) — le popover n'a plus son propre bouton
  // « Enregistrer » : il enregistre son handler auprès de l'éditeur et remonte
  // son état dirty, de sorte que le SEUL bouton Enregistrer de l'écran (celui
  // de l'éditeur) persiste aussi le leg identité visuelle. Ces deux tests
  // visaient encore `email-identity-menu-save`, retiré ce jour-là.
  test("éditeur template : modification + Enregistrer maître persiste après reload", async ({
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

    // Plan 4a — un seul bouton Enregistrer, celui de l'éditeur, désarmé tant
    // qu'aucun leg n'est sale.
    const masterSave = page.getByTestId('mjml-editor-save-btn')
    await expect(masterSave).toBeDisabled()
    await expect(page.getByTestId('email-identity-menu-save')).toHaveCount(0)

    await colorInput.fill(TEST_COLOR)

    // Le dirty du popover remonte au maître, qui s'arme.
    await expect(masterSave).toBeEnabled()

    // Avant le clic, le serveur garde l'ancienne valeur — aucun auto-save.
    const preSaveRes = await page.request.get(
      `${SERVER_BASE}/api/admin/settings/email-brand`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const preSaveBody = (await preSaveRes.json()) as {
      data: { primaryColor: string }
    }
    expect(preSaveBody.data.primaryColor).toBe(ORIGINAL_COLOR)

    // Le popover doit pouvoir être refermé sans perdre la modification : le
    // bouton qui la persiste vit en dehors de lui.
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)
    await expect(masterSave).toBeEnabled()

    await masterSave.click()

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
        { timeout: 10_000 },
      )
      .toBe(TEST_COLOR)

    // Snapshot resynchronisé : plus rien de sale, le maître se désarme.
    await expect(masterSave).toBeDisabled()

    // Reload : la valeur est ré-hydratée depuis la DB.
    await openTemplateEditor(page)
    await page.getByTestId('email-identity-menu-trigger').click()
    await expect(
      page.getByTestId('email-identity-menu-primary-color-input'),
    ).toHaveValue(TEST_COLOR)
  })

  test("Plan 4a — le brouillon survit à la fermeture du popover et rien ne persiste sans Enregistrer", async ({
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
    await expect(page.getByTestId('mjml-editor-save-btn')).toBeEnabled()

    // Ferme le popover sans enregistrer (Échap).
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)

    // Le brouillon SURVIT : `PopoverContent` est démonté à la fermeture, l'état
    // vit donc au-dessus. Sans cela, refermer le popover jetterait
    // silencieusement la saisie et le bouton Enregistrer maître, resté armé,
    // ne persisterait rien.
    await page.getByTestId('email-identity-menu-trigger').click()
    await expect(colorInput).toHaveValue(TEST_COLOR)
    await expect(page.getByTestId('mjml-editor-save-btn')).toBeEnabled()

    // Mais rien n'a été persisté : la modification n'existe qu'en mémoire.
    const res = await page.request.get(
      `${SERVER_BASE}/api/admin/settings/email-brand`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const body = (await res.json()) as { data: { primaryColor: string } }
    expect(body.data.primaryColor).toBe(ORIGINAL_COLOR)

    // Et un rechargement complet la perd, comme attendu d'un brouillon.
    await openTemplateEditor(page)
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
