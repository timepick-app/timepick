import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { loginAsAdmin } from './helpers/auth'
import {
  SERVER_BASE,
  createTestEvent,
  deleteTestEvent,
  fetchAdminToken,
  waitForGrapesEditorReady,
} from './helpers/email-editor'

/**
 * Persistance du CORPS d'e-mail : éditeur réel → base → relecture.
 *
 * Ce fichier existe parce que la sauvegarde du corps par événement est restée
 * cassée trois mois sous une suite entièrement verte. Le serveur exigeait dans
 * la charge utile PATCH des marqueurs `<!-- BODY:START -->` / `<!-- BODY:END -->`
 * que l'extraction côté client retire par construction — elle ne renvoie que le
 * contenu ENTRE les marqueurs. Aucun test ne faisait circuler le corps
 * réellement produit par l'éditeur jusqu'au serveur, donc personne n'a vu le 400.
 *
 * Les trois niveaux de tests existants passaient à côté pour trois raisons
 * distinctes — ce fichier prend l'exact contre-pied de chacune :
 *  - les tests serveur fabriquent leur corps AVEC les marqueurs : ils testent le
 *    validateur contre lui-même ;
 *  - les tests client bouchonnent l'éditeur : l'extraction réelle ne tourne
 *    jamais ;
 *  - la seule spec de bout en bout qui clique « Enregistrer » le fait sur
 *    l'éditeur général, après n'avoir modifié que les attributs `<mj-body>`, et
 *    n'attend que le PUT des shell-parts — un échec du PATCH du corps y est
 *    invisible.
 *
 * Deux contraintes non négociables, sous peine de reconstruire l'angle mort :
 *  1. le corps envoyé vient de l'ÉDITEUR (canvas GrapesJS sérialisé puis
 *     extrait par le code de production), jamais d'une constante écrite ici ;
 *  2. ce qui est modifié est le CORPS (un bloc de texte du canvas), jamais un
 *     attribut de coque.
 *
 * Cette spec n'envoie aucun e-mail : ne jamais y ajouter de purge MailPit.
 *
 * ⚠️ Le cas B écrit sur une ressource PARTAGÉE — le corps du modèle d'invitation
 * général, celui que reçoivent les destinataires réels. Il le restaure octet pour
 * octet en `afterAll`. C'est le seul point d'écriture non idempotent de la suite
 * de bout en bout : toute modification de ce fichier doit préserver la protection
 * du nettoyage (voir `afterAll`).
 */

/**
 * Marque unique, recalculée DANS chaque test — un `Date.now()` au niveau du module
 * serait figé au chargement et donc partagé par toutes les répétitions sous
 * `--repeat-each`, où un résidu d'une répétition ratée validerait faussement la
 * suivante.
 */
const newEditToken = () => `E2E-BODY-SAVE-${Date.now()}`

const BODY_START_MARKER = '<!-- BODY:START -->'
const BODY_END_MARKER = '<!-- BODY:END -->'

// --- Formes de réponse de l'API, nommées au point de lecture ---
//
// Assertion de type plutôt que validation runtime : ces enveloppes sont le
// contrat serveur, déjà validé côté API, et les helpers voisins
// (`helpers/email-editor.ts`) lisent leurs réponses de la même façon. Une
// seconde convention ici n'achèterait rien.

interface EventTemplateEnvelope {
  data: { bodyMjml: string; isCustom: boolean }
}

interface InvitationTemplateEnvelope {
  data: { bodyMjml: string }
}

/** Iframe du canvas GrapesJS — ce que l'administrateur a réellement sous les yeux. */
const CANVAS_FRAME = 'iframe.gjs-frame'

/**
 * Surface GrapesJS consommée par `appendTokenToFirstBodyText`, décrite ici
 * parce que le handle `window.__grapesEditor` n'est typé nulle part côté
 * Playwright (exposé en DEV uniquement par la config de l'éditeur).
 */
interface GrapesComponent {
  parent: () => GrapesComponent | undefined
  getAttributes: () => Record<string, unknown>
  findType: (type: string) => GrapesComponent[]
  components: (html?: string) => { map: <T>(fn: (c: GrapesComponent) => T) => T[] }
  toHTML: () => string
}

interface GrapesEditorHandle {
  getWrapper: () => GrapesComponent
  trigger: (event: string) => void
}

/**
 * Ajoute `token` au premier bloc de texte du CORPS (hors coque verrouillée).
 *
 * Pilotage par l'API GrapesJS plutôt que par l'éditeur de texte enrichi : même
 * convention que la spec mj-body, et la seule stable en CI. Ce qui compte pour
 * ce test n'est pas le geste de frappe mais le chemin de sortie — le canvas est
 * sérialisé puis extrait par le code de production.
 *
 * On AJOUTE au texte existant au lieu de le remplacer : les variables `{{...}}`
 * du modèle restent en place, donc pas d'avertissement « variables critiques
 * manquantes » parasite pendant l'enregistrement.
 */
async function appendTokenToFirstBodyText(page: Page, token: string): Promise<void> {
  await page.evaluate((mark) => {
    // Handle de test exposé en DEV par la config de l'éditeur : rien à valider
    // au runtime au-delà de sa présence, que l'on vérifie juste après.
    const testWindow = window as unknown as { __grapesEditor?: GrapesEditorHandle }
    const editor = testWindow.__grapesEditor
    if (!editor) throw new Error('__grapesEditor introuvable — flag DEV manquant ?')

    const insideLockedShell = (component: GrapesComponent): boolean => {
      let ancestor = component.parent()
      while (ancestor) {
        const cssClass = String(ancestor.getAttributes()['css-class'] ?? '')
        if (cssClass.split(/\s+/).includes('locked-shell')) return true
        ancestor = ancestor.parent()
      }
      return false
    }

    const target = editor
      .getWrapper()
      .findType('mj-text')
      .find((component) => !insideLockedShell(component))
    if (!target) {
      throw new Error(
        "Aucun bloc de texte hors coque dans le canvas. Ce test suppose que le corps " +
          "d'invitation en contient au moins un ; si le gabarit d'usine a changé, c'est " +
          'ce test qu\'il faut adapter — pas la sauvegarde qu\'il protège.',
      )
    }

    const currentInner = target.components().map((child) => child.toHTML()).join('')
    target.components(`${currentInner} ${mark}`)
    // Le dirty tracker écoute `update` ; `components()` ne le déclenche pas
    // systématiquement selon la version de grapesjs (même parade que la spec
    // mj-body).
    editor.trigger('update')
  }, token)

  await expect(page.getByTestId('mjml-editor-save-btn')).toBeEnabled({ timeout: 5000 })
}

async function readEventBody(
  request: APIRequestContext,
  token: string,
  eventId: string,
): Promise<{ bodyMjml: string; isCustom: boolean }> {
  const res = await request.get(`${SERVER_BASE}/api/admin/events/${eventId}/email-template`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) throw new Error(`GET event email-template: HTTP ${res.status()}`)
  const payload = (await res.json()) as EventTemplateEnvelope
  return payload.data
}

async function readTemplateBody(request: APIRequestContext, token: string): Promise<string> {
  const res = await request.get(`${SERVER_BASE}/api/admin/settings/email-templates/invitation`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) throw new Error(`GET invitation template: HTTP ${res.status()}`)
  const payload = (await res.json()) as InvitationTemplateEnvelope
  return payload.data.bodyMjml
}

async function writeTemplateBody(
  request: APIRequestContext,
  token: string,
  bodyMjml: string,
): Promise<void> {
  const res = await request.patch(`${SERVER_BASE}/api/admin/settings/email-templates/invitation`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { bodyMjml },
  })
  if (!res.ok()) throw new Error(`PATCH invitation template: HTTP ${res.status()}`)
}

async function openEditor(page: Page, openButtonTestId: string): Promise<void> {
  await page.getByTestId(openButtonTestId).click()
  await page.getByTestId('mjml-editor-inner').waitFor()
  await waitForGrapesEditorReady(page)
}

test.describe.configure({ timeout: 90_000 })
test.describe("@slow Sauvegarde du corps depuis l'éditeur réel", () => {
  let token: string
  let eventId: string
  /**
   * Corps du modèle GÉNÉRAL d'origine, restauré octet pour octet en `afterAll`.
   * Reste `undefined` si `beforeAll` a échoué avant de le lire — d'où la garde
   * dans le nettoyage : réécrire `undefined` produirait une charge sans
   * `bodyMjml`, donc un 400, donc un nettoyage interrompu.
   */
  let pristineTemplateBody: string | undefined

  test.beforeAll(async ({ request }) => {
    token = await fetchAdminToken(request)
    eventId = await createTestEvent(request, token, 'E2E sauvegarde corps e-mail')
    pristineTemplateBody = await readTemplateBody(request, token)
  })

  test.afterAll(async ({ request }) => {
    // Nettoyage PROTÉGÉ, et c'est délibéré : la restauration touche une ressource
    // partagée (le corps d'invitation envoyé aux destinataires réels) tandis que
    // la suppression ne touche que des données de test. Un échec de la première
    // ne doit jamais empêcher la seconde — sinon un aléa transitoire laisse à la
    // fois le modèle pollué ET un événement orphelin en base.
    // L'échec de restauration reste PROPAGÉ : un modèle général resté pollué doit
    // faire échouer bruyamment, jamais passer inaperçu.
    try {
      if (pristineTemplateBody !== undefined) {
        await writeTemplateBody(request, token, pristineTemplateBody)
      }
    } finally {
      if (eventId) await deleteTestEvent(request, token, eventId)
    }
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('A. événement — le corps édité part en PATCH 200 et se relit après rechargement', async ({
    page,
    request,
  }) => {
    const editToken = newEditToken()
    expect((await readEventBody(request, token, eventId)).isCustom).toBe(false)

    await page.goto(`/admin/events/${eventId}/edit#template`)
    await expect(page.getByTestId('event-invitation-inheritance-badge')).toHaveText('Défaut')
    await openEditor(page, 'event-invitation-open-editor-btn')

    await appendTokenToFirstBodyText(page, editToken)

    const patchPromise = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/admin/events/${eventId}/email-template`) &&
        r.request().method() === 'PATCH',
    )
    await page.getByTestId('mjml-editor-save-btn').click()
    const patchResponse = await patchPromise
    // Le défaut d'origine se manifeste EXACTEMENT ici : 400 « bodyMjml doit
    // contenir les marqueurs ». Assertion sur le statut plutôt que sur un délai
    // d'attente, pour que l'échec nomme sa cause.
    expect(patchResponse.status()).toBe(200)

    const persisted = await readEventBody(request, token, eventId)
    expect(persisted.isCustom).toBe(true)
    expect(persisted.bodyMjml).toContain(editToken)
    // Le corps stocké est celui que l'éditeur a produit, tel quel : sans
    // marqueurs (l'extraction ne renvoie que leur contenu) et sans
    // ré-enveloppement serveur. C'est l'autre moitié de ce qui distingue ce test
    // d'un test qui fabriquerait son corps à la main.
    expect(persisted.bodyMjml).not.toContain(BODY_START_MARKER)
    expect(persisted.bodyMjml).not.toContain(BODY_END_MARKER)

    // Relecture par l'interface : c'est ce que l'administrateur constate.
    await page.reload()
    await expect(page.getByTestId('event-invitation-inheritance-badge')).toHaveText('Personnalisé')
  })

  test('B. général — le corps édité part en PATCH 200 et revient dans le canvas rouvert', async ({
    page,
    request,
  }) => {
    const editToken = newEditToken()
    await page.goto('/admin/settings?tab=email-template&subtab=template-invitation')
    await openEditor(page, 'invitation-open-editor-btn')

    await appendTokenToFirstBodyText(page, editToken)

    const patchPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/admin/settings/email-templates/invitation') &&
        r.request().method() === 'PATCH',
    )
    await page.getByTestId('mjml-editor-save-btn').click()
    const patchResponse = await patchPromise
    expect(patchResponse.status()).toBe(200)

    const persisted = await readTemplateBody(request, token)
    expect(persisted).toContain(editToken)
    expect(persisted).not.toContain(BODY_START_MARKER)
    expect(persisted).not.toContain(BODY_END_MARKER)

    // Aller-retour complet : rechargement, réouverture, la modification est
    // visible dans le canvas reconstruit depuis la base.
    await page.reload()
    await openEditor(page, 'invitation-open-editor-btn')
    await expect(page.frameLocator(CANVAS_FRAME).locator('body')).toContainText(editToken)
  })
})
