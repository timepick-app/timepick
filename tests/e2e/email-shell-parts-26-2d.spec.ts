import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin } from './helpers/auth'
import {
  SERVER_BASE,
  createTestEvent,
  deleteShellPart,
  deleteShellParts,
  deleteTestEvent,
  fetchAdminToken,
  seedShellPart,
  waitForGrapesEditorReady,
} from './helpers/email-editor'

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

// Helpers d'infra (token, event, shell-parts, attente GrapesJS) : voir
// `./helpers/email-editor`. Cette spec en avait sa propre copie ; celle de
// `waitForGrapesEditorReady` exigeait `locked-shell === 3` — condition
// impossible, le layout réel comptant 2 `locked-shell` (en-tête + pied) et
// 1 `locked-card` (carte content-wrapper, classe distincte). Les 3 tests UI
// de ce fichier expiraient donc quel que soit l'état du produit.

const SAMPLE_CONTENT_HEADER =
  '<mj-section data-part-kind="header" background-color="#0066cc">' +
  '<mj-column><mj-text color="#ffffff" font-weight="bold">Test override</mj-text></mj-column>' +
  '</mj-section>'

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
    // `__grapesEditor` est un crochet de test posé sur `window` par
    // `grapesConfig.ts` en DEV : aucun typage global ne le déclare et aucune
    // validation runtime n'aurait de sens ici (si le crochet manque, le
    // `waitForGrapesEditorReady` de l'appelant a déjà échoué). Assertion
    // nommée plutôt qu'inlinée dans l'accès.
    type GrapesTestHook = {
      getWrapper: () => { find: (sel: string) => Comp[] }
      select: (c: Comp) => void
    }
    const win = window as unknown as { __grapesEditor: GrapesTestHook }
    const ed = win.__grapesEditor
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
// Smoke A — Panneau d'héritage au niveau événement (les 2 branches de la garde)
// ============================================================================

test.describe("Story 26-2d — Smoke A (panneau d'héritage niveau event)", () => {
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

  test('bloc hérité → panneau ouvert et informatif ; bloc surchargé → panneau muet', async ({
    page,
    request,
  }) => {
    await page.goto(`/admin/events/${eventId}/edit#template`)
    await page.getByTestId('event-invitation-preview-iframe').waitFor()
    await page.getByTestId('event-invitation-open-editor-btn').click()
    await page.getByTestId('mjml-editor-inner').waitFor()
    await waitForGrapesEditorReady(page)

    // BRANCHE 1 — aucune row shell_parts pour cet event : le bloc est hérité,
    // le clic doit être intercepté et monter le panneau. C'est CE chemin que le
    // nom d'event GrapesJS pilote (`component:select:before`) : avec un nom
    // erroné, le handler ne se déclenche jamais et le panneau reste invisible
    // sans la moindre erreur — le silence exact que ce smoke existe pour rompre.
    await selectLockedShellDescendant(page, 'header')
    const panel = page.getByTestId('mjml-editor-locked-panel-overlay')
    await expect(panel).toBeVisible({ timeout: 5000 })
    // L'origine résolue remonte à n'importe quel niveau supérieur (template /
    // brand / hardcoded) ; l'invariant est « pas le niveau courant ».
    const initialOrigin = await page
      .getByTestId('locked-shell-info-panel-header')
      .getAttribute('data-origin')
    expect(initialOrigin).not.toBe('event')

    // Le panneau est INFORMATIF : la création d'une surcharge depuis ce panneau
    // a été retirée (bouton désactivé par 5eebca2e, puis supprimé par 33db2fc3
    // au profit d'un message lisible). Asserter son absence fige la décision :
    // si le bouton revient, c'est un choix produit qui doit se voir ici.
    await expect(
      page.getByTestId('locked-shell-customize-btn-header'),
    ).toHaveCount(0)
    await expect(panel).toContainText("n'est pas encore disponible")

    // BRANCHE 2 — une fois la surcharge posée au niveau event, le bloc n'est
    // plus hérité : le même clic ne doit RIEN monter.
    await seedShellPart(
      request,
      token,
      'event',
      eventId,
      'header',
      SAMPLE_CONTENT_HEADER,
    )
    await page.reload()
    await page.getByTestId('event-invitation-open-editor-btn').click()
    await page.getByTestId('mjml-editor-inner').waitFor()
    await waitForGrapesEditorReady(page)

    await selectLockedShellDescendant(page, 'header')
    // Laisse un tick à React pour monter le panneau s'il devait s'ouvrir.
    await expect(page.getByTestId('locked-shell-info-panel-header')).toHaveCount(0)
    await expect(panel).toBeHidden()
  })

  // Smoke B (« server 400 surfaces a toast.error ») a été retiré le 2026-07-27 :
  // son unique déclencheur était le bouton « Personnaliser ce bloc » du panneau,
  // supprimé du produit par 33db2fc3. Il ne restait aucun chemin client capable
  // de PUT une shell-part depuis ce panneau, donc plus rien à éprouver. Le
  // contrat « une erreur serveur produit un toast et ne casse pas l'éditeur »
  // reste couvert pour la voie de sauvegarde par `MjmlEditorOverlay.test.tsx`.
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

  // Cleanup ciblé sur le SEUL part que ce test crée. Un cleanup owner-wide
  // (`deleteShellParts(request, 'brand', '1')`) effacerait aussi la row
  // factory `content-wrapper` posée par la migration 012 : la carte
  // `locked-card` disparaîtrait de tous les canevas, dans ce run et dans tous
  // les suivants, la suite cessant d'être idempotente.
  test.beforeEach(async ({ request }) => {
    await deleteShellPart(request, token, 'brand', '1', 'header')
  })

  test.afterAll(async ({ request }) => {
    await deleteShellPart(request, token, 'brand', '1', 'header')
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
