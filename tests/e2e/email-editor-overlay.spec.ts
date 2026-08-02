import { test, expect, type APIRequestContext } from '@playwright/test'
import { loginAsAdmin, TEST_ADMIN } from './helpers/auth'
import { waitForGrapesEditorReady } from './helpers/email-editor'

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
 *
 * ⚠️ CE QUE CES BASELINES VOIENT, ET CE QU'ELLES NE VOIENT PAS.
 * Une tolérance `maxDiffPixelRatio: 0.02` sur une surface de 1280×720
 * (921 600 px) laisse **18 432 px de budget** : le bouton « Réserver mon
 * créneau » du corps par défaut mesure ~189×27 px ≈ 5 100 px, donc **sa
 * disparition complète ne ferait pas échouer le test**. Mesuré : le diff entre
 * les deux versions de `email-editor-initial.png` du 2026-07-30 valait 8 081 px
 * = 0,877 % — l'ancienne baseline passait encore alors qu'elle documentait une
 * grammaire visuelle retirée du produit.
 *
 * Deux leviers ont été mesurés le 2026-07-31, un seul sert :
 * - **Cadrage : sans effet ici.** Scoper la capture de l'éditeur sur
 *   `[data-testid="mjml-editor-inner"]` au lieu de la page produit une baseline
 *   **rigoureusement identique** — cet élément est une surcouche plein écran,
 *   son cadre EST le viewport. Le cadrage reste écrit parce qu'il dit la cible,
 *   mais il ne resserre rien.
 * - **Seuil : c'est le levier.** Trois exécutions consécutives à `maxDiffPixels: 0`
 *   passent — le rendu est **pixel-exact** sur une même machine, il n'y a aucun
 *   bruit d'anti-aliasing à absorber. Les 2 % n'étaient donc pas une marge
 *   technique mais du mou. La capture de l'éditeur est descendue à **0,002**
 *   (≈ 1 843 px), au-dessus du bruit constaté (nul) et ~3× sous le plus petit
 *   élément qu'on veut voir disparaître.
 *   Portée de cette mesure : **une machine, une version de Chromium**. Police,
 *   hinting, DPI et version du navigateur font dériver le rendu texte bien
 *   au-delà de 0,2 % ailleurs — mais bien au-delà de 2 % aussi, donc le seuil
 *   n'est pas ce qui rendrait ces baselines portables. Elles ne le sont pas, et
 *   c'est déjà le cas : suffixées `-chromium-darwin`, régénérées à la main,
 *   exclues de la CI. Le seuil bas ne coûte donc rien de plus qu'avant, et
 *   rapporte de voir ce que 2 % laissait passer.
 *
 * Les 5 autres captures restent à 0,02 : déjà scopées à un panneau, donc sur une
 * surface bien plus petite où 2 % est un filet autrement plus fin. Les descendre
 * exigerait de mesurer puis régénérer chacune — non fait, donc non promis.
 *
 * Reste vrai dans tous les cas : ces tests protègent des **ruptures de mise en
 * page larges**. Ce qui est petit, textuel ou ponctuel se garde ailleurs —
 * contraste calculé et sélecteurs dans les tests unitaires de
 * `client/src/components/admin/email-editor/__tests__/`, comportement dans
 * `email-shell-parts-26-2d.spec.ts`.
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
    const editor = page.getByTestId('mjml-editor-inner')
    await editor.waitFor()
    // Attendre le montage de l'enveloppe React ne suffit PAS : c'est la seule des
    // 6 captures de ce fichier qui photographie le canvas GrapesJS vivant (les
    // autres visent l'aperçu compilé ou un panneau statique). Sans attendre que
    // la passe de verrouillage/décoration ait tourné, la référence peut se figer
    // sur un état transitoire — et l'inspection à l'œil d'une capture unique ne
    // le verrait pas. `waitForGrapesEditorReady` est le garde-fou déjà standard
    // partout ailleurs dans la suite quand on touche l'éditeur réel.
    await waitForGrapesEditorReady(page)
    // Cadrée sur l'éditeur : ne resserre rien (l'élément est plein écran, mesuré
    // le 2026-07-31), mais dit la cible. Ce qui resserre, c'est le seuil — 0,002
    // au lieu de 0,02, au-dessus d'un bruit mesuré NUL sur 3 exécutions et sous
    // les ~5 100 px du plus petit élément qu'on veut voir disparaître. Détail et
    // limites : avertissement en tête de fichier.
    await expect(editor).toHaveScreenshot('email-editor-initial.png', {
      maxDiffPixelRatio: 0.002,
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
