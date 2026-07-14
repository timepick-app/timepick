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
 * Story 26-4 — Spec 2 : cascade brand → template → event observable depuis
 * l'éditeur d'email d'un événement.
 *
 * Source de vérité (frozen 2026-05-13) — politique de structure verrouillée des emails,
 * § « Niveaux de personnalisation (cascade) » :
 *   « Tout bloc laissé vide retombe au niveau supérieur. Tout bloc encore
 *     vide retombe au contenu d'origine codé en dur. »
 *
 * § « Portée du panneau d'héritage » (l. 142-145) :
 *   « Le panneau d'information sur le contenu hérité est **exclusif au
 *     niveau événement**. (...) le panneau d'information remplace toute
 *     tentative d'édition silencieuse. »
 *
 * Tagged `@slow`. Run local :
 *   ALLOW_TEST_ROUTES=true npm run dev
 *   npx playwright test email-shell-cascade-inheritance --grep "@slow"
 */

const HEADER_MJML_TEMPLATE =
  '<mj-section data-part-kind="header" background-color="#aa00ff" css-class="locked-shell">' +
  '<mj-column><mj-text color="#ffffff">Cascade test — header niveau template</mj-text></mj-column>' +
  '</mj-section>'

const HEADER_MJML_EVENT =
  '<mj-section data-part-kind="header" background-color="#00aaff" css-class="locked-shell">' +
  '<mj-column><mj-text color="#ffffff">Cascade test — header niveau event</mj-text></mj-column>' +
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

async function readHeaderBackgroundColor(
  page: import('@playwright/test').Page,
): Promise<string | null> {
  return page.evaluate(() => {
    const ed = (window as unknown as { __grapesEditor?: unknown })
      .__grapesEditor as
      | {
          getWrapper: () => {
            find: (sel: string) => Array<{
              get: (key: string) => unknown
            }>
          }
        }
      | undefined
    if (!ed) throw new Error('__grapesEditor non exposé sur window')
    const header = ed.getWrapper().find('[data-part-kind="header"]')[0]
    if (!header) return null
    const attrs = header.get('attributes') as
      | Record<string, string>
      | undefined
    return attrs?.['background-color'] ?? null
  })
}

test.describe.configure({ timeout: 60_000 })
test.describe('@slow Story 26-4 — Email Shell cascade brand→template→event', () => {
  let token: string
  let eventId: string

  test.beforeAll(async ({ request }) => {
    token = await fetchAdminToken(request)
    eventId = await createTestEvent(
      request,
      token,
      'E2E Story 26-4 — cascade inheritance',
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

  test('header non surchargé : origin résolu n\'est jamais "event" et le panneau d\'héritage n\'est pas monté au chargement', async ({
    page,
    request,
  }) => {
    // beforeEach a nettoyé template + event ; brand n'est pas modifié par
    // les tests (singleton global), donc en env propre la cascade remonte
    // jusqu'au hardcoded. Si un test échoue ici sur "brand" ou "template",
    // c'est un signal de pollution état — fail-fast diagnostique plutôt que
    // masquer via whitelist.
    const origin = await fetchEventHeaderOrigin(request, token, eventId)
    expect(
      origin,
      `editor-context.header.origin attendu "hardcoded" en env propre, reçu "${origin}"`,
    ).toBe('hardcoded')

    await page.goto(
      `/admin/events/${eventId}/edit?subtab=template-email#emails`,
    )
    await page.getByTestId('event-invitation-open-editor-btn').click()
    await page.getByTestId('mjml-editor-inner').waitFor()
    await waitForGrapesEditorReady(page)

    await expect(
      page.getByTestId('locked-shell-info-panel-header'),
      'le panneau d\'héritage header n\'est monté qu\'au clic sur un bloc hérité, jamais au chargement initial',
    ).toHaveCount(0)
  })

  test('header surchargé au niveau template : event hérite du template', async ({
    page,
    request,
  }) => {
    await seedShellPart(
      request,
      token,
      'template',
      'invitation',
      'header',
      HEADER_MJML_TEMPLATE,
    )

    const origin = await fetchEventHeaderOrigin(request, token, eventId)
    expect(origin).toBe('template')

    await page.goto(
      `/admin/events/${eventId}/edit?subtab=template-email#emails`,
    )
    await page.getByTestId('event-invitation-open-editor-btn').click()
    await page.getByTestId('mjml-editor-inner').waitFor()
    await waitForGrapesEditorReady(page)

    const bg = await readHeaderBackgroundColor(page)
    expect(bg, 'background-color du header doit être présent dans attributes').not.toBeNull()
    expect(bg?.toLowerCase()).toBe('#aa00ff')
  })

  test("header surchargé au niveau event : la cascade s'arrête au niveau event", async ({
    page,
    request,
  }) => {
    await seedShellPart(
      request,
      token,
      'template',
      'invitation',
      'header',
      HEADER_MJML_TEMPLATE,
    )
    await seedShellPart(
      request,
      token,
      'event',
      eventId,
      'header',
      HEADER_MJML_EVENT,
    )

    const origin = await fetchEventHeaderOrigin(request, token, eventId)
    expect(origin).toBe('event')

    await page.goto(
      `/admin/events/${eventId}/edit?subtab=template-email#emails`,
    )
    await page.getByTestId('event-invitation-open-editor-btn').click()
    await page.getByTestId('mjml-editor-inner').waitFor()
    await waitForGrapesEditorReady(page)

    const bg = await readHeaderBackgroundColor(page)
    expect(bg, 'background-color du header doit être présent dans attributes').not.toBeNull()
    expect(bg?.toLowerCase()).toBe('#00aaff')
  })
})
