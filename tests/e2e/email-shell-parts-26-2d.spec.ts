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

/**
 * Lit le `content` CALCULÉ d'un pseudo-élément de décoration d'un bloc de coque,
 * dans le document de l'iframe du canvas.
 *
 * Pourquoi le calculé et pas l'attribut : une règle CSS dont le sélecteur ne
 * matche pas laisse les attributs parfaitement en place et n'affiche RIEN. C'est
 * exactement comment l'étiquette permanente exigée par la policy est restée
 * muette pendant des mois — `data-locked-label` était posé, la règle qui le
 * consommait exigeait la classe et l'attribut sur le même élément. Asserter
 * l'attribut aurait été vert tout du long.
 *
 * `::before` = pastille de structure (« En-tête » / « Corps » / « Pied »),
 * `::after` = pastille d'héritage (absente = `'none'`).
 */
async function canvasPseudo(
  page: Page,
  partKind: 'header' | 'footer' | 'content-wrapper',
  pseudo: '::before' | '::after',
): Promise<string> {
  return page.evaluate(
    ({ kind, pseudoSel }) => {
      // Cast DOM connu (`querySelector` retourne `Element | null`), pas une
      // forme fabriquée : l'iframe du canvas est same-origin, son
      // `contentDocument` est donc lisible.
      const frame = document.querySelector('iframe.gjs-frame') as HTMLIFrameElement | null
      const doc = frame?.contentDocument
      if (!doc?.defaultView) return '<canvas-doc-inaccessible>'
      const el = doc.querySelector(`[data-part-kind="${kind}"]`)
      if (!el) return `<${kind}-absent>`
      return doc.defaultView.getComputedStyle(el, pseudoSel).content
    },
    { kind: partKind, pseudoSel: pseudo },
  )
}

/**
 * Deux faces du même invariant après création d'une surcharge : le drapeau
 * `selectable` de la section, et le fait que la sélection ABOUTISSE. Le deep-lock
 * des blocs hérités pose `selectable: false` ; tant qu'il tient, `getSelected()`
 * reste vide même après un `select()`.
 */
async function headerSelectableAndSelected(
  page: Page,
): Promise<{ selectable: boolean; selectionLanded: boolean }> {
  return page.evaluate(() => {
    type Comp = {
      getAttributes: () => Record<string, string>
      components: () => { models: Comp[] }
      get: (key: string) => unknown
    }
    // Crochet de test posé sur `window` par `grapesConfig.ts` en DEV. Aucun
    // typage global ne le déclare ; s'il manque, l'attente de l'appelant a déjà
    // échoué. Assertion nommée plutôt qu'inlinée dans l'accès.
    const win = window as unknown as {
      __grapesEditor: {
        getWrapper: () => { find: (sel: string) => Comp[] }
        select: (c: Comp) => void
        getSelected: () => unknown
      }
    }
    const ed = win.__grapesEditor
    const section = ed
      .getWrapper()
      .find('[css-class~="locked-shell"]')
      .find((s) => s.getAttributes()['data-part-kind'] === 'header')
    if (!section) throw new Error('section header introuvable')
    const leaf = section.components().models[0]?.components().models[0] ?? section
    ed.select(leaf)
    return {
      selectable: section.get('selectable') === true,
      selectionLanded: !!ed.getSelected(),
    }
  })
}

/**
 * AIRE d'intersection (en px²) entre le panneau d'héritage et la barre latérale
 * droite de GrapesJS, plus les largeurs des deux éléments.
 *
 * Vérifier l'inverse de son propre changement : le 2026-07-30, remonter ce
 * panneau dans l'empilement (`z-20`) l'a rendu cliquable AU PRIX de la barre
 * latérale — 184 de ses 192 px de large recouverts, ses clics interceptés tant
 * que le panneau restait ouvert. « Mon élément est-il atteignable » ne répond
 * pas à « que recouvre-t-il désormais ».
 *
 * `-1` quand l'un des deux éléments est absent : sans cette sentinelle, un
 * sélecteur devenu faux rendrait une aire nulle, donc un test vert à vide. Les
 * deux largeurs sont renvoyées pour la même raison — une aire nulle obtenue
 * parce que le panneau lui-même est dégénéré ne prouve rien.
 */
async function panelSidebarOverlap(
  page: Page,
): Promise<{ overlapArea: number; sidebarWidth: number; panelWidth: number }> {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-testid="mjml-editor-locked-panel-overlay"]')
    const sidebar = document.querySelector('.gjs-pn-views-container')
    if (!panel || !sidebar) return { overlapArea: -1, sidebarWidth: -1, panelWidth: -1 }
    const a = panel.getBoundingClientRect()
    const b = sidebar.getBoundingClientRect()
    const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
    return {
      overlapArea: Math.round(width * height),
      sidebarWidth: Math.round(b.width),
      panelWidth: Math.round(a.width),
    }
  })
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

  test('bloc hérité → panneau, personnalisation → bloc éditable et signaux à jour DANS LE MÊME ÉCRAN', async ({
    page,
  }) => {
    await page.goto(`/admin/events/${eventId}/edit#template`)
    await page.getByTestId('event-invitation-preview-iframe').waitFor()
    await page.getByTestId('event-invitation-open-editor-btn').click()
    await page.getByTestId('mjml-editor-inner').waitFor()
    await waitForGrapesEditorReady(page)

    // STEP 1 — aucune row shell_parts pour cet event : le bloc est hérité, le
    // clic doit être intercepté et monter le panneau. C'est CE chemin que le nom
    // d'event GrapesJS pilote (`component:select:before`) : avec un nom erroné,
    // le handler ne se déclenche jamais et le panneau reste invisible sans la
    // moindre erreur — le silence exact que ce smoke existe pour rompre.
    await selectLockedShellDescendant(page, 'header')
    const panel = page.getByTestId('mjml-editor-locked-panel-overlay')
    await expect(panel).toBeVisible({ timeout: 5000 })
    // L'origine résolue remonte à n'importe quel niveau supérieur (template /
    // brand / hardcoded) ; l'invariant est « pas le niveau courant ».
    const initialOrigin = await page
      .getByTestId('locked-shell-info-panel-header')
      .getAttribute('data-origin')
    expect(initialOrigin).not.toBe('event')

    // STEP 1 bis — le panneau ne recouvre RIEN de la barre latérale de
    // l'éditeur. Mesuré, pas apprécié : un ancrage `right-2` la recouvrait à
    // 184 px sur 192 de large sans qu'aucun test ne bronche. Les deux largeurs
    // sont assérées d'abord : une aire nulle entre deux boîtes dégénérées serait
    // un vert à vide, pas une preuve.
    const overlap = await panelSidebarOverlap(page)
    expect(overlap.sidebarWidth).toBeGreaterThan(0)
    expect(overlap.panelWidth).toBeGreaterThan(0)
    expect(
      overlap.overlapArea,
      `panneau d'héritage ⇄ barre latérale GrapesJS : ${overlap.overlapArea} px² d'intersection`,
    ).toBe(0)

    // STEP 1 ter — signaux visuels AVANT personnalisation. Assertés sur le
    // `content` calculé des pseudo-éléments, pas sur les attributs : une règle
    // CSS dont le sélecteur ne matche pas laisserait les attributs intacts et
    // n'afficherait rien. C'est exactement le bug de l'étiquette permanente,
    // muette pendant des mois derrière des attributs parfaitement posés.
    expect(await canvasPseudo(page, 'header', '::before')).toContain('En-tête')
    expect(await canvasPseudo(page, 'header', '::after')).toMatch(/Hérité|Contenu d'origine/)
    expect(await canvasPseudo(page, 'content-wrapper', '::before')).toContain('Corps')

    // STEP 2 — « Personnaliser ce bloc » : PUT shell-parts → refetch du
    // contexte → panneau refermé.
    const putPromise = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/admin/shell-parts/event/${eventId}/header`) &&
        r.request().method() === 'PUT',
    )
    const refetchPromise = page.waitForResponse(
      (r) => r.url().includes('/api/admin/editor-context') && r.request().method() === 'GET',
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

    // STEP 3 — LE CŒUR DU SMOKE : le bloc est devenu ÉDITABLE dans le même
    // écran. La version de ce test antérieure à juin se contentait de « le
    // panneau ne se rouvre pas » derrière un `waitForTimeout(300)` — assertion
    // que le produit satisfaisait alors qu'il laissait le bloc verrouillé à
    // l'écran jusqu'à réouverture de l'éditeur (le `onSuccess` du bouton ne
    // rafraîchissait pas le canvas). Le trou est resté invisible un mois.
    //
    // Attente OBSERVABLE, jamais temporelle : `data-inherited` disparaît du
    // wrapper, ce qui n'arrive qu'après le re-push du canvas.
    await page.waitForFunction(
      () => {
        type Comp = { getAttributes: () => Record<string, string> }
        // Crochet de test posé par `grapesConfig.ts` en DEV. Assertion nommée
        // plutôt qu'inlinée dans l'accès.
        const win = window as unknown as {
          __grapesEditor?: { getWrapper: () => { find: (sel: string) => Comp[] } }
        }
        const ed = win.__grapesEditor
        if (!ed) return false
        const section = ed
          .getWrapper()
          .find('[css-class~="locked-shell"]')
          .find((s) => s.getAttributes()['data-part-kind'] === 'header')
        return !!section && section.getAttributes()['data-inherited'] === undefined
      },
      { timeout: 15000 },
    )
    // Le deep-lock pose `selectable: false` ; quand il tombe, la sélection
    // aboutit. Deux faces du même invariant : l'attribut ET le comportement.
    expect(await headerSelectableAndSelected(page)).toEqual({
      selectable: true,
      selectionLanded: true,
    })

    // STEP 3 bis — les signaux visuels ont suivi : la pastille d'héritage a
    // disparu, l'étiquette de structure reste. Sans cette paire, le commit qui
    // rend l'héritage lisible peut se re-déliter en silence.
    expect(await canvasPseudo(page, 'header', '::after')).toBe('none')
    expect(await canvasPseudo(page, 'header', '::before')).toContain('En-tête')
    // Le pied, lui, n'a pas été personnalisé : il porte toujours sa pastille.
    expect(await canvasPseudo(page, 'footer', '::after')).toMatch(/Hérité|Contenu d'origine/)

    // STEP 4 — « Enregistrer » ne doit PAS s'être activé tout seul : on a
    // persisté le résolu courant à l'identique, les ancres de coque restent
    // valides. S'il s'active, c'est un faux positif du suivi de modifications.
    await expect(page.getByTestId('mjml-editor-save-btn')).toBeDisabled()
  })

  test("bloc déjà surchargé au niveau event → le panneau d'héritage ne s'ouvre pas", async ({
    page,
    request,
  }) => {
    await seedShellPart(request, token, 'event', eventId, 'header', SAMPLE_CONTENT_HEADER)
    await page.goto(`/admin/events/${eventId}/edit#template`)
    await page.getByTestId('event-invitation-preview-iframe').waitFor()
    await page.getByTestId('event-invitation-open-editor-btn').click()
    await page.getByTestId('mjml-editor-inner').waitFor()
    await waitForGrapesEditorReady(page)

    await selectLockedShellDescendant(page, 'header')

    // ATTENTE OBSERVABLE de la prise en compte du clic par React. Le badge
    // structurel monte dès que `selectedLockedPart` est posé, SANS condition
    // d'héritage — contrairement au panneau. Il prouve donc que le rendu a bien
    // eu lieu, et rend l'absence du panneau ci-dessous significative.
    // Le commentaire précédent prétendait « laisser un tick à React » alors
    // qu'aucune attente n'avait lieu : `toHaveCount(0)` et `toBeHidden()` se
    // résolvent au premier tick, donc le test passait avant même que React
    // n'ait pu monter le panneau.
    await expect(page.getByTestId('mjml-editor-structural-badge-overlay')).toBeVisible()
    await expect(page.getByTestId('locked-shell-info-panel-header')).toHaveCount(0)
    await expect(page.getByTestId('mjml-editor-locked-panel-overlay')).toHaveCount(0)
  })
})

// ============================================================================
// Smoke B — Toast d'erreur (chemin résilience). Restauré le 2026-07-30 avec le
// bouton « Personnaliser ce bloc » : son unique déclencheur client était ce
// bouton, retiré du produit en juin, ce qui avait rendu ce smoke inerte.
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

  test('une erreur serveur 400 remonte un toast et ne casse pas l\'éditeur', async ({ page }) => {
    test.setTimeout(60000)
    await page.route('**/api/admin/shell-parts/**', (route) => {
      if (route.request().method() === 'PUT') {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'VALIDATION_ERROR', message: 'Contenu MJML invalide (test injection)' },
          }),
        })
      }
      return route.continue()
    })

    await page.goto(`/admin/events/${eventId}/edit#template`)
    await page.getByTestId('event-invitation-preview-iframe').waitFor()
    await page.getByTestId('event-invitation-open-editor-btn').click()
    await page.getByTestId('mjml-editor-inner').waitFor()
    await waitForGrapesEditorReady(page)

    await selectLockedShellDescendant(page, 'header')
    await expect(page.getByTestId('mjml-editor-locked-panel-overlay')).toBeVisible()
    await page.getByTestId('locked-shell-customize-btn-header').click()

    // Sonner pose `data-sonner-toast`. Le message du serveur porte un code hors
    // liste blanche : il n'atteint donc PAS l'écran — c'est la phrase de
    // l'appelant qui s'affiche, et elle dit que le contenu reste à l'écran.
    const toast = page.locator('[data-sonner-toast]').filter({
      hasText: 'La personnalisation de ce bloc a échoué',
    })
    await expect(toast).toBeVisible({ timeout: 10000 })

    // Pas d'écran blanc : l'éditeur est toujours monté…
    await expect(page.getByTestId('mjml-editor-inner')).toBeVisible()
    // …et le bloc est resté VERROUILLÉ : un PUT refusé ne doit pas déverrouiller
    // un bloc qui n'a aucune cible de sauvegarde. Sans cette assertion, un
    // re-push optimiste du canvas passerait inaperçu.
    expect(await canvasPseudo(page, 'header', '::after')).toMatch(/Hérité|Contenu d'origine/)
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
    // ATTENTE OBSERVABLE, pas un délai. Le badge structurel monte dès qu'un bloc
    // de coque est sélectionné, SANS condition d'héritage — contrairement au
    // panneau. Il prouve donc que React a rendu, et rend significative l'absence
    // du panneau juste après. Les deux `waitForTimeout(300)` qui tenaient ce rôle
    // ici affirmaient « laisser un tick à React » sans garantie : sous charge, le
    // panneau pouvait n'être pas encore monté et le test passait pour rien.
    await expect(page.getByTestId('mjml-editor-structural-badge-overlay')).toBeVisible()
    const panel = page.getByTestId('mjml-editor-locked-panel-overlay')
    await expect(panel).toHaveCount(0)

    // Même attente pour le pied — règle uniforme à ce niveau.
    await selectLockedShellDescendant(page, 'footer')
    await expect(
      page.getByTestId('mjml-editor-structural-badge-overlay').getByTestId('structural-badge-footer'),
    ).toBeVisible()
    await expect(panel).toHaveCount(0)
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
