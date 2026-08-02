import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers/auth'
import { createTestEvent, deleteTestEvent, fetchAdminToken } from './helpers/email-editor'

/**
 * Les messages d'échec affichés à l'administrateur.
 *
 * Contrat vérifié ici, sur l'écran réel :
 * - un message serveur dont le code n'est pas sur la liste blanche n'atteint
 *   jamais l'écran, même en le forçant ;
 * - une coupure réseau produit une phrase française qui ne prétend PAS
 *   savoir si le serveur a traité la demande — pas « Network Error » ;
 * - un délai dépassé produit une phrase DISTINCTE de la coupure réseau,
 *   elle aussi sans affirmation sur l'état serveur.
 *
 * Les trois tests interceptent la même action (publier un événement) : c'est
 * le chemin le plus court vers un `toast.error` réel, sans dépendre de
 * l'éditeur MJML.
 */

/** Le message qui a fait découvrir le défaut : jargon de schéma, affiché tel quel. */
const SERVER_JARGON = 'bodyMjml doit contenir les marqueurs <!-- BODY:START --> … (D-ext6)'

/** Marqueurs qui ne doivent apparaître nulle part sur l'écran testé. */
const FORBIDDEN_ON_SCREEN = [
  'Network Error',
  'timeout of',
  'bodyMjml',
  'D-ext',
  'Expected ',
  'received ',
]

test.describe('Messages d\'échec affichés à l\'administrateur', () => {
  let token: string
  let eventId: string

  test.beforeAll(async ({ request }) => {
    token = await fetchAdminToken(request)
    eventId = await createTestEvent(request, token, 'Messages d\'erreur — chantier')
  })

  test.afterAll(async ({ request }) => {
    await deleteTestEvent(request, token, eventId)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('un message serveur hors liste blanche n\'atteint pas l\'écran', async ({ page }) => {
    await page.route('**/api/admin/events/*/publish', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: SERVER_JARGON } }),
      }),
    )

    await page.goto(`/admin/events/${eventId}/edit`)
    await page.locator('[data-action="publish"]').click()

    const toast = page.locator('[data-sonner-toast]')
    await expect(toast).toBeVisible({ timeout: 10000 })
    // La phrase de l'appelant, pas celle du serveur.
    await expect(toast).toContainText('La publication a échoué')

    // Règle « lire l'écran entier dans l'état testé » : le jargon ne doit
    // apparaître ni dans le toast, ni ailleurs sur la page.
    const screen = await page.locator('body').innerText()
    for (const marker of FORBIDDEN_ON_SCREEN) {
      expect(screen, `« ${marker} » ne doit pas être à l'écran`).not.toContain(marker)
    }
  })

  test('une coupure réseau parle français et ne prétend pas savoir si le travail est perdu', async ({ page }) => {
    await page.goto(`/admin/events/${eventId}/edit`)

    // Coupure posée APRÈS le chargement de la page : c'est bien l'enregistrement
    // qui est coupé, pas la navigation.
    await page.route('**/api/admin/events/*/publish', (route) => route.abort('failed'))

    await page.locator('[data-action="publish"]').click()

    const toast = page.locator('[data-sonner-toast]')
    await expect(toast).toBeVisible({ timeout: 10000 })
    // La phrase réseau : elle ne prétend PAS savoir si le serveur a traité la
    // demande — l'absence de réponse HTTP ne permet pas de le distinguer d'une
    // requête traitée dont la réponse s'est perdue en route.
    await expect(toast).toContainText('Connexion interrompue avant la réponse du serveur')
    await expect(toast).not.toContainText("Rien n'a été envoyé")

    const screen = await page.locator('body').innerText()
    for (const marker of FORBIDDEN_ON_SCREEN) {
      expect(screen, `« ${marker} » ne doit pas être à l'écran`).not.toContain(marker)
    }
  })

  test('un délai dépassé donne la phrase délai, distincte de la coupure réseau', async ({ page }) => {
    // Un test ne peut pas faire avancer la minuterie native d'un XHR : pour
    // exercer réellement la branche `ECONNABORTED` sans attendre les 60 s par
    // défaut, on abaisse le timeout de l'instance axios via l'échappatoire
    // dédiée (client/src/services/api.ts, réservée aux tests e2e). 2 s reste
    // largement suffisant pour les vraies requêtes de la page (événement,
    // contexte éditeur…) sur un serveur local ; seule la route publish,
    // délibérément jamais résolue ci-dessous, doit l'atteindre.
    await page.addInitScript(() => {
      const testWindow = window as unknown as { __E2E_API_TIMEOUT_MS__?: number }
      testWindow.__E2E_API_TIMEOUT_MS__ = 2000
    })

    await page.goto(`/admin/events/${eventId}/edit`)

    // Ne JAMAIS appeler fulfill/continue/abort : la requête reste en attente
    // jusqu'à ce qu'axios l'annule lui-même après le timeout ci-dessus — la
    // seule façon d'observer un vrai `ECONNABORTED` de bout en bout.
    await page.route('**/api/admin/events/*/publish', () => {})

    await page.locator('[data-action="publish"]').click()

    const toast = page.locator('[data-sonner-toast]')
    await expect(toast).toBeVisible({ timeout: 10000 })
    await expect(toast).toContainText("n'a pas répondu à temps")
    // Pas la phrase réseau : un délai n'est pas une coupure, l'utilisateur ne
    // doit pas lire deux fois le même diagnostic pour deux causes distinctes.
    await expect(toast).not.toContainText('Connexion interrompue')

    const screen = await page.locator('body').innerText()
    for (const marker of FORBIDDEN_ON_SCREEN) {
      expect(screen, `« ${marker} » ne doit pas être à l'écran`).not.toContain(marker)
    }
  })
})
