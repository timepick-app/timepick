/**
 * Objet d'e-mail modifiable — parcours bout en bout via Mailpit.
 *
 * CE QUE CE TEST DÉFEND, et que rien d'autre ne défend. Les tests unitaires
 * couvrent la cascade côté serveur et la ligne Objet côté client, chacun avec
 * ses doublures. Aucun ne dit que l'objet TAPÉ DANS L'ÉDITEUR ressort dans
 * l'en-tête `Subject` d'un e-mail réellement livré : c'est le trajet complet —
 * ligne → popover → PATCH → colonne → résolution → interpolation → transport —
 * qui se casse à n'importe laquelle de ses jointures sans qu'une doublure le
 * voie.
 *
 * Prérequis :
 * - Mailpit lancé : `brew services start mailpit` (ou `npm run mail`).
 * - `ALLOW_TEST_ROUTES=true` dans `server/.env`.
 * - Serveur + client dev démarrés (auto via Playwright `webServer`).
 *
 * Tagué @slow — exclu du run CI par défaut, comme les autres specs qui
 * dépendent d'un Mailpit local.
 */

import { test, expect, type APIRequestContext } from '@playwright/test'
import { loginAsAdmin } from './helpers/auth'

const SERVER_BASE = 'http://localhost:3000'
const MAILPIT_API = 'http://localhost:8025/api/v1'

/** Deux jetons, dont un nom : l'interpolation doit tenir sur les deux. */
const CUSTOM_SUBJECT_SOURCE = 'E2E objet — {{event_name}} pour {{user_full_name}}'
/** Ce que `buildPreviewVariables` met dans les deux jetons pour un test-send. */
const EXPECTED_SUBJECT = 'E2E objet — Réunion de présentation pour Camille Martin'

const RECIPIENT = 'e2e-subject-user@test.local'

async function fetchAdminToken(request: APIRequestContext): Promise<string> {
  await request
    .post(`${SERVER_BASE}/api/test/users`, {
      data: { email: 'e2e-subject-admin@test.local', full_name: 'E2E Subject Admin', role: 'admin' },
    })
    .catch(() => null)
  const res = await request.post(`${SERVER_BASE}/api/test/login`, {
    data: { email: 'e2e-subject-admin@test.local' },
  })
  if (!res.ok()) throw new Error(`/api/test/login returned ${res.status()}`)
  return ((await res.json()) as { token: string }).token
}

/** Poll l'API Mailpit — même contrat que `email-cancellation.spec.ts`. */
async function waitForSubject(
  request: APIRequestContext,
  recipient: string,
  timeout = 20000,
): Promise<string> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const res = await request.get(`${MAILPIT_API}/messages`)
    if (!res.ok()) throw new Error(`Mailpit API returned ${res.status()}`)
    const data = (await res.json()) as {
      messages?: Array<{ Subject: string; To?: Array<{ Address: string }> }>
    }
    const hit = (data.messages ?? []).find((m) =>
      (m.To ?? []).some((to) => to.Address.includes(recipient)),
    )
    if (hit) return hit.Subject
    const { promise: tick, resolve: wake } = Promise.withResolvers<void>()
    setTimeout(wake, 750)
    await tick
  }
  throw new Error(`Aucun e-mail pour ${recipient} en ${timeout}ms`)
}

test.describe('@slow Objet d’e-mail — de l’éditeur à la boîte de réception', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await fetchAdminToken(request)
    // Destinataire NON administrateur : le test-send choisit la variante
    // d'objet d'après le rôle en base, et on veut la variante « membre ».
    await request
      .post(`${SERVER_BASE}/api/test/users`, {
        data: { email: RECIPIENT, full_name: 'E2E Subject User', role: 'user' },
      })
      .catch(() => null)
  })

  test.afterAll(async ({ request }) => {
    // Efface la personnalisation, quoi qu'il soit arrivé au test : la base de
    // travail ne doit pas garder un objet de test.
    const current = await request.get(
      `${SERVER_BASE}/api/admin/settings/email-templates/invitation`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!current.ok()) return
    const { data } = (await current.json()) as { data: { bodyMjml: string } }
    await request.patch(`${SERVER_BASE}/api/admin/settings/email-templates/invitation`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { bodyMjml: data.bodyMjml, subject: null },
    })
  })

  test('un objet saisi dans l’éditeur ressort interpolé dans l’en-tête reçu', async ({
    page,
    request,
  }) => {
    expect(await loginAsAdmin(page)).toBe(true)

    await page.goto('/admin/settings?tab=email-template&subtab=template-invitation')
    await page.getByTestId('email-invitation-template-panel').waitFor({ timeout: 20000 })

    // La fiche montre l'objet d'usine, interpolé, avant toute personnalisation.
    await expect(page.getByTestId('invitation-template-subject')).toContainText('Défaut')

    await page.getByTestId('invitation-open-editor-btn').click()
    const line = page.getByTestId('email-subject-line')
    await line.waitFor({ timeout: 40000 })

    // La ligne affiche l'objet INTERPOLÉ, jamais la source à jetons.
    await expect(page.getByTestId('email-subject-line-text')).toHaveText(
      'Inscription participation - Réunion de présentation',
    )

    await line.click()
    await page.getByTestId('email-subject-popover').waitFor()
    // Le champ part de la SOURCE : c'est elle qu'on retouche, pas l'aperçu.
    await expect(page.getByTestId('email-subject-input')).toHaveValue(
      'Inscription participation - {{event_name}}',
    )
    await page.getByTestId('email-subject-input').fill(CUSTOM_SUBJECT_SOURCE)
    await expect(page.getByTestId('email-subject-help')).toContainText(EXPECTED_SUBJECT)

    // Échap ferme le popover SEUL — l'éditeur reste ouvert.
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('email-subject-popover')).toHaveCount(0)
    await expect(page.getByTestId('mjml-editor-overlay')).toBeVisible()

    // Une modification d'objet SEULE suffit à réveiller « Enregistrer ».
    const saveBtn = page.getByTestId('mjml-editor-save-btn')
    await expect(saveBtn).toBeEnabled()
    await saveBtn.click()
    await expect(saveBtn).toBeDisabled({ timeout: 15000 })
    await expect(line).toContainText('Personnalisé')

    // Envoi réel, puis lecture de l'en-tête reçu. Aucun appel d'API ne remplace
    // cette lecture : c'est le seul endroit où le transport est dans la boucle.
    await request.delete(`${MAILPIT_API}/messages`).catch(() => undefined)
    const sent = await request.post(
      `${SERVER_BASE}/api/admin/settings/email-templates/invitation/test-send`,
      { headers: { Authorization: `Bearer ${token}` }, data: { to: RECIPIENT } },
    )
    expect(sent.ok()).toBe(true)

    expect(await waitForSubject(request, RECIPIENT)).toBe(`[Test TimePick] ${EXPECTED_SUBJECT}`)
  })
})
