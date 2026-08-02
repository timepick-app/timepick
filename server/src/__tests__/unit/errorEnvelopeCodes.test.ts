import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ERROR_CODES } from '@timepick/shared'

/**
 * Garde mécanique sur l'ENVELOPPE des réponses d'erreur.
 *
 * Le mode de panne qu'elle ferme : un message métier écrit avec soin côté
 * serveur, mais renvoyé sans `code`. Le client ne peut alors pas savoir qu'il
 * est montrable, et affiche à la place la phrase générique de l'appelant. Ce
 * n'était pas une hypothèse : 206 réponses sur 291 étaient dans ce cas, dont
 * les refus les plus actionnables du produit.
 *
 * Le contrat en une phrase : **sur les fichiers listés ci-dessous, toute
 * réponse 4xx porte un code.** Une seule dispense, et elle ne concerne que les
 * 5xx : un repli technique dont le message est un littéral fixe n'apprend rien
 * de plus que la phrase de l'appelant, lui donner un code serait du théâtre.
 *
 * Y compris les refus de validation. Leur code est `VALIDATION_ERROR`, qui
 * n'entre jamais en liste blanche : ils restent donc invisibles à l'écran. Les
 * coder quand même a un intérêt précis — l'enveloppe n'a plus qu'un seul
 * régime, et cette garde n'a plus à deviner, par expression régulière, si un
 * `error:` sans code est un oubli ou une intention. L'intention est écrite dans
 * le code de production, pas dans le test qui l'inspecte.
 *
 * La liste `COVERED` grandit à chaque groupe de routes unifié. Ce qui y entre
 * ne peut plus régresser ; ce qui n'y est pas encore ne bloque personne. Ajouter
 * un fichier à la liste est le geste qui clôt un groupe — pas l'inverse.
 *
 * Ce qu'elle NE couvre PAS, à savoir avant de s'y fier :
 * - le **contenu** du message porté par un code admis. Un code en liste blanche
 *   dont le message serveur porterait du jargon passerait ici sans bruit ;
 * - les réponses construites hors du motif `res[.status(n)].json({ … })`
 *   (renvoi par un middleware d'erreur, `next(err)`, corps assemblé plus haut) ;
 * - les fichiers absents de `COVERED`.
 */

const SERVER_SRC = resolve(__dirname, '..', '..')

/**
 * Les fichiers dont l'enveloppe est unifiée. Chemins relatifs à `server/src`.
 */
const COVERED = [
  // Événements et créneaux
  'controllers/events.controller.ts',
  'controllers/slots.controller.ts',
  // Membres
  'controllers/admin.controller.ts',
  'controllers/me.controller.ts',
  'controllers/eventUsers.controller.ts',
  // Réservations
  'controllers/reservations.controller.ts',
  // Invitations, exports, statistiques
  'controllers/invitations.controller.ts',
  'controllers/export.controller.ts',
  'controllers/stats.controller.ts',
  'controllers/cancellation-notifications.controller.ts',
  'controllers/analytics.controller.ts',
  // Téléversements et identité de l'organisation
  'routes/uploads.routes.ts',
  'controllers/organization.controller.ts',
  'middleware/organizationLogoUpload.ts',
  // Authentification et autorisation
  'middleware/auth.middleware.ts',
  'middleware/adminAuth.ts',
  'controllers/auth.controller.ts',
  'controllers/recovery.controller.ts',
  // Configuration et e-mail
  'controllers/settings.controller.ts',
  'controllers/setup-smtp.controller.ts',
  'controllers/config.controller.ts',
  'controllers/email-templates.controller.ts',
  'controllers/event-email-template.controller.ts',
  'controllers/email-brand-settings.controller.ts',
  'controllers/editor-context.controller.ts',
  'controllers/emailValidator.controller.ts',
  'controllers/admin-encryption-key.controller.ts',
  'controllers/shell-parts.controller.ts',
]

/**
 * Hors couverture, avec leur raison. Retirer une entrée d'ici est un progrès ;
 * en ajouter une demande la même justification que celles-ci.
 *
 * - `controllers/slots.public.controller.ts` — trois de ses quatre fonctions
 *   (`getSlots`, `bookSlot`, `cancelBooking`, montées sur `/api/slots`) ne sont
 *   appelées par aucun code client et répondent en anglais. Leur donner un code
 *   reviendrait à déclarer montrable un texte qui ne l'est pas. À couvrir le
 *   jour où elles sont traduites ou supprimées.
 * - `controllers/setup.controller.ts` — ses replis sont `'Server Error'` et
 *   `'Not Found'`, en anglais et génériques. Même raison.
 * - `routes/test.routes.ts` — routes de test, jamais montées en production.
 */
const UNCOVERED_ON_PURPOSE = [
  'controllers/slots.public.controller.ts',
  'controllers/setup.controller.ts',
  'routes/test.routes.ts',
]

interface ErrorResponse {
  file: string
  line: number
  status: string
  body: string
}

/**
 * Extrait les arguments de `res[.status(n)].json(…)` par appariement de
 * délimiteurs — une expression régulière seule ne survit pas aux objets
 * imbriqués ni aux accolades dans les gabarits de chaîne.
 */
function extractJsonResponses(source: string, file: string): ErrorResponse[] {
  const found: ErrorResponse[] = []
  const opener = /res\s*(?:\.status\(\s*([^)]*?)\s*\))?\s*\.json\(/g
  let match: RegExpExecArray | null

  while ((match = opener.exec(source)) !== null) {
    const start = match.index + match[0].length
    let depth = 1
    let index = start
    let quote: string | null = null
    let escaped = false

    while (index < source.length && depth > 0) {
      const char = source[index]
      if (quote !== null) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === quote) quote = null
      } else if (char === '"' || char === "'" || char === '`') {
        quote = char
      } else if (char === '(' || char === '{' || char === '[') {
        depth++
      } else if (char === ')' || char === '}' || char === ']') {
        depth--
      }
      index++
    }

    const body = source.slice(start, index - 1)
    if (!/\berror\s*:/.test(body)) continue
    found.push({
      file,
      line: source.slice(0, match.index).split('\n').length,
      status: match[1] ?? '200',
      body,
    })
  }
  return found
}

/**
 * L'unique dispense — repli technique en 5xx dont le message est un littéral :
 * une phrase fixe qui n'apprend rien de plus que celle de l'appelant.
 */
function isGenericServerFallback({ status, body }: ErrorResponse): boolean {
  if (!/^5\d\d$/.test(status.trim())) return false
  return /\berror\s*:\s*(['"`])/.test(body)
}

/**
 * `{ error: apiError }` — enveloppe étiquetée assemblée en amont, typiquement
 * par `formatApiError`, qui renvoie `{ code: ErrorCode; message: string }`. Le
 * code est bien là, il n'est simplement pas visible dans le littéral. Le motif
 * exige un identifiant nu : `{ error: error.message }` (accès de propriété) ne
 * passe pas, et c'est voulu — c'est précisément le relais qu'on traque.
 */
function isUpstreamEnvelope({ body }: ErrorResponse): boolean {
  return /^\s*\{\s*error\s*:\s*[A-Za-z_$][\w$]*\s*,?\s*\}\s*$/.test(body)
}


describe("enveloppe des réponses d'erreur", () => {
  const responses = COVERED.flatMap((file) =>
    extractJsonResponses(readFileSync(resolve(SERVER_SRC, file), 'utf8'), file),
  )

  it('trouve bien des réponses à inspecter (la garde ne se vide pas en silence)', () => {
    // Sans ce contrôle, une régression de l'extracteur rendrait la garde verte
    // et muette — le pire des deux mondes.
    expect(responses.length).toBeGreaterThan(150)
  })

  it('toute réponse 4xx porte un code ; seuls les replis 5xx en sont dispensés', () => {
    const offences = responses
      .filter(
        (response) =>
          // Un code, en forme étiquetée ou en frère de la forme plate.
          !/\bcode\s*:/.test(response.body) &&
          !isGenericServerFallback(response) &&
          !isUpstreamEnvelope(response),
      )
      .map(
        (response) =>
          `${response.file}:${response.line} [${response.status}] ${response.body.replace(/\s+/g, ' ').trim()}`,
      )

    expect(offences).toEqual([])
  })

  it('aucun code posé en littéral : tous viennent du contrat partagé', () => {
    const contractSize = Object.keys(ERROR_CODES).length
    const offences: string[] = []

    for (const file of COVERED) {
      const source = readFileSync(resolve(SERVER_SRC, file), 'utf8')
      for (const match of source.matchAll(/\bcode\s*:\s*['"]([A-Z][A-Z0-9_]*)['"]/g)) {
        offences.push(`${file} — code: '${match[1]}' devrait être ERROR_CODES.${match[1]}`)
      }
    }

    expect(offences).toEqual([])
    // Le contrat n'est pas vide non plus : garde-fou contre un import cassé.
    expect(contractSize).toBeGreaterThan(30)
  })

  it('les fichiers volontairement hors couverture portent leur raison ici', () => {
    // Ce test n'inspecte rien : il force la liste des dispenses à rester
    // visible et à côté de la garde qu'elle troue. Une entrée ajoutée sans
    // justification dans le commentaire au-dessus se remarque en revue.
    expect(UNCOVERED_ON_PURPOSE.length).toBe(3)
  })
})
