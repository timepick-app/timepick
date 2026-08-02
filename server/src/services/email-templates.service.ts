/**
 * Email Templates Service — projection-aware read/write layer.
 *
 * The DB helper (email-templates.db.ts) returns raw rows with bodyMjml.
 * This service computes the system-template projection (introText/signatureText)
 * via the parseSystemTemplate/composeSystemTemplate pair. The controller
 * consumes the projection-aware DTO.
 */

import {
  getEmailTemplate,
  updateEmailTemplate,
  resetEmailTemplatesToFactory,
  type EmailTemplateRow,
  type TemplateKey,
} from '../db/email-templates.db'
import { withTransaction } from '../db'
import {
  resetSharedShellToFactory,
  isInvitationShellCustomized,
} from './shell-parts.service'
import { assertSafeEmailBody } from '../validators/email-body-content.validator'
import {
  SUBJECT_VARIABLES_BY_TEMPLATE,
  SUBJECT_VARIABLE_LABELS,
  normalizeSubject,
} from '../lib/email-subject'
import { buildPreviewVariables, factorySubjectTemplate } from './email-send.service'

// --- Types ---

// 'cancellation_confirmation' est désormais inclus : le body est restructuré par la
// migration 024 pour être compatible avec l'éditeur 2-zones (INTRO + SIG), le bloc
// détails (événement/date/horaires/motif/calendrier) étant figé dans le skeleton.
// Restent exclues : 'invitation' (éditable via PUT brut) et 'slot_modification'
// (corps dynamique — blocs conditionnels assemblés au runtime via {{changes_blocks}} ;
// non exposé dans l'éditeur UI, décision V8 — donc pas de skeleton INTRO/SIG).
export type SystemTemplateKey = Exclude<TemplateKey, 'invitation' | 'slot_modification'>

/**
 * Une variable admissible dans un objet, telle que le serveur la publie.
 *
 * UN TABLEAU, PAS UN DICTIONNAIRE, et ce n'est pas un goût : le middleware de
 * conversion de casse réécrit les CLÉS de toute réponse JSON, donc un
 * `Record<'event_name', …>` partirait en `eventName` et le client
 * interpolerait `{{eventName}}` — un jeton que le serveur ne reconnaît pas.
 * Dans un tableau, `event_name` est une VALEUR, que le middleware ne touche
 * pas. Mesuré sur la réponse réelle le 2026-08-01. Ne pas « simplifier » en
 * dictionnaire.
 */
export interface SubjectVariableView {
  /** Nom du jeton, tel qu'il s'écrit entre accolades. */
  name: string
  /** Libellé FR affiché dans le menu d'insertion. */
  label: string
  /**
   * Valeur de démonstration, RESTREINTE à ce que ce modèle fournit réellement.
   * Sans cette restriction, l'aperçu montrerait « Réunion de présentation » là
   * où l'envoi réel produit du vide : il CACHERAIT le défaut au lieu de le
   * révéler.
   */
  previewValue: string
}

/**
 * Ce que le client a besoin de savoir de l'objet, en une fois. La liste des
 * variables est fournie PAR LE SERVEUR et non recalculée côté client : elle
 * dépend de ce que la fonction d'envoi passe réellement à `renderEmail`, une
 * information que seul le serveur détient.
 */
interface SubjectView {
  /** Personnalisation, ou `null` = objet d'usine. Forme SOURCE, à jetons. */
  subject: string | null
  /** Objet d'usine, forme SOURCE. Sert de point de départ à l'édition. */
  defaultSubject: string
  /** Variables admissibles dans l'objet DE CE MODÈLE. */
  subjectVariables: SubjectVariableView[]
}

interface InvitationTemplateView extends SubjectView {
  templateKey: 'invitation'
  bodyMjml: string
  defaultBodyMjml: string
  // True si la coque de l'invitation (pied + coque commune carte) diffère de
  // l'usine — pilote le bouton « Restaurer le gabarit d'usine » côté client
  // (lot 3b). Absent pour les modèles système (coque non éditable per-key).
  shellCustomized?: boolean
  updatedAt: Date
}

interface SystemTemplateView extends SubjectView {
  templateKey: SystemTemplateKey
  introText: string
  signatureText: string
  defaultIntroText: string
  defaultSignatureText: string
  /**
   * `magic_link_login` SEUL : ce modèle a deux objets d'usine, choisis sur le
   * rôle du destinataire. Absents des sept autres — leur présence est le
   * prédicat qui fait apparaître le sélecteur « Membre / Administrateur » dans
   * le popover d'édition.
   */
  subjectAdmin?: string | null
  defaultSubjectAdmin?: string
  updatedAt: Date
}

export type EmailTemplateView = InvitationTemplateView | SystemTemplateView

// --- Error classes ---

export class MalformedSystemTemplateError extends Error {
  constructor(public readonly templateKey: TemplateKey, missing: string) {
    super(`System template ${templateKey} is missing marker(s): ${missing}`)
    this.name = 'MalformedSystemTemplateError'
  }
}

export class InvitationCompositionError extends Error {
  constructor() {
    super('composeSystemTemplate must not be called with templateKey === "invitation"')
    this.name = 'InvitationCompositionError'
  }
}

// --- Skeletons (canonical — mirrors migration 031 ; salutation intégrée dans la zone intro) ---

interface SystemTemplateSkeleton {
  readonly before: string
  readonly afterIntroBeforeSig: string
  readonly after: string
}

const SYSTEM_TEMPLATE_SKELETONS: Record<SystemTemplateKey, SystemTemplateSkeleton> = {
  magic_link_login: {
    before: `<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">`,
    afterIntroBeforeSig: `</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{magic_link}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">`,
    after: `</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>`,
  },
  reservation_confirmation: {
    before: `<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">`,
    afterIntroBeforeSig: `</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Gérer ma réservation</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">`,
    after: `</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>`,
  },
  account_created: {
    before: `<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">`,
    afterIntroBeforeSig: `</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{login_url}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">`,
    after: `</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>`,
  },
  role_promoted: {
    before: `<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">`,
    afterIntroBeforeSig: `</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{login_url}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">`,
    after: `</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>`,
  },
  role_demoted: {
    before: `<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">`,
    afterIntroBeforeSig: `</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{login_url}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">`,
    after: `</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>`,
  },
  cancellation_confirmation: {
    before: `<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">`,
    afterIntroBeforeSig: `</mj-text>
    <!-- INTRO:END -->
    <mj-text padding-bottom="4px"><strong>Événement :</strong> {{event_name}}</mj-text>
    <mj-text padding-bottom="4px"><strong>Date :</strong> {{slot_date}}</mj-text>
    <mj-text padding-bottom="8px"><strong>Horaires :</strong> {{slot_time}}</mj-text>
    <mj-text padding-bottom="8px">{{cancellation_reason}}</mj-text>
    <mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Choisir un nouveau créneau</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" padding-top="0">`,
    after: `</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>`,
  },
  unregistration_confirmation: {
    before: `<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">`,
    afterIntroBeforeSig: `</mj-text>
    <!-- INTRO:END -->
    <mj-text padding-bottom="4px"><strong>Événement :</strong> {{event_name}}</mj-text>
    <mj-text padding-bottom="4px"><strong>Date :</strong> {{slot_date}}</mj-text>
    <mj-text padding-bottom="8px"><strong>Horaires :</strong> {{slot_time}}</mj-text>
    <mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Voir les créneaux disponibles</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" padding-top="0">`,
    after: `</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>`,
  },
}

// --- Pure helpers: parser & composer ---

const INTRO_RE = /<!-- INTRO:START -->([\s\S]*?)<!-- INTRO:END -->/
const SIG_RE = /<!-- SIG:START -->([\s\S]*?)<!-- SIG:END -->/
const MJ_TEXT_RE = /<mj-text[^>]*>([\s\S]*?)<\/mj-text>/

export function parseSystemTemplate(
  bodyMjml: string,
  templateKey: SystemTemplateKey,
): { introText: string; signatureText: string } {
  const introMatch = INTRO_RE.exec(bodyMjml)
  if (!introMatch) {
    throw new MalformedSystemTemplateError(templateKey, 'INTRO:START/END')
  }

  const sigMatch = SIG_RE.exec(bodyMjml)
  if (!sigMatch) {
    throw new MalformedSystemTemplateError(templateKey, 'SIG:START/END')
  }

  const introText = stripMjTextWrapper(introMatch[1].trim())
  const signatureText = stripMjTextWrapper(sigMatch[1].trim())

  return { introText, signatureText }
}

export function composeSystemTemplate(params: {
  templateKey: SystemTemplateKey
  introText: string
  signatureText: string
}): string {
  const { templateKey, introText, signatureText } = params
  const skeleton = SYSTEM_TEMPLATE_SKELETONS[templateKey]
  return (
    skeleton.before +
    encodeWithBreaks(introText) +
    skeleton.afterIntroBeforeSig +
    encodeWithBreaks(signatureText) +
    skeleton.after
  )
}

// --- HTML entity helpers ---

const ENCODE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
const ENCODE_RE = /[&<>"']/g

function encodeHtmlEntities(text: string): string {
  return text.replace(ENCODE_RE, (ch) => ENCODE_MAP[ch])
}

// Encode HTML entities puis convertit \n → <br/> (l'escape d'abord garantit
// qu'un &amp;lt;br&gt; saisi par l'admin ne devient pas un vrai saut).
function encodeWithBreaks(text: string): string {
  return encodeHtmlEntities(text).replace(/\n/g, '<br/>')
}

const DECODE_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&apos;': "'",
}
const DECODE_RE = /&(?:amp|lt|gt|quot|#39|#x27|apos);/g

function decodeHtmlEntities(text: string): string {
  return text.replace(DECODE_RE, (m) => DECODE_MAP[m] ?? m)
}

function stripMjTextWrapper(content: string): string {
  const match = MJ_TEXT_RE.exec(content)
  // Convertir <br> → \n AVANT decodeHtmlEntities : un &lt;br&gt; littéral saisi
  // par l'admin serait stocké encodé et ne doit pas devenir un saut de ligne.
  const inner = (match ? match[1].trim() : content).replace(/<br\s*\/?>/gi, '\n')
  const decoded = decodeHtmlEntities(inner)
  return decoded.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Les variables d'objet d'un modèle, prêtes à partir sur le fil : nom, libellé
 * FR et valeur de démonstration. Partagé avec la vue par événement, qui doit
 * publier EXACTEMENT la même liste — deux constructions séparées finiraient
 * par diverger, et l'aperçu de l'événement mentirait sur ce que l'envoi produit.
 *
 * `eventName` : au niveau ÉVÉNEMENT, le NOM RÉEL de l'événement remplace celui
 * de démonstration. Sans lui, la ligne Objet de l'éditeur annonçait « Réunion
 * de présentation » pendant que l'aperçu de la même page, à quelques pixels,
 * affichait le vrai nom — deux messages contradictoires sur le même écran,
 * exactement la classe de défaut que la méthode de vérification du dépôt
 * demande de traquer. Relevé à l'écran le 2026-08-01.
 */
export function subjectVariableViews(
  templateKey: TemplateKey,
  eventName?: string,
): SubjectVariableView[] {
  const demo = buildPreviewVariables(eventName === undefined ? undefined : { eventName })
  return SUBJECT_VARIABLES_BY_TEMPLATE[templateKey].map((name) => ({
    name,
    label: SUBJECT_VARIABLE_LABELS[name],
    previewValue: demo[name] ?? '',
  }))
}

function projectSubject(row: EmailTemplateRow): SubjectView {
  return {
    subject: row.subject,
    defaultSubject: factorySubjectTemplate(row.templateKey, false),
    subjectVariables: subjectVariableViews(row.templateKey),
  }
}

function projectRow(row: EmailTemplateRow): EmailTemplateView {
  const subject = projectSubject(row)

  if (row.templateKey === 'invitation') {
    return {
      templateKey: 'invitation',
      bodyMjml: row.bodyMjml,
      defaultBodyMjml: row.defaultBodyMjml,
      ...subject,
      updatedAt: row.updatedAt,
    }
  }

  const sysKey = row.templateKey as SystemTemplateKey
  const current = parseSystemTemplate(row.bodyMjml, sysKey)
  const defaults = parseSystemTemplate(row.defaultBodyMjml, sysKey)

  return {
    templateKey: sysKey,
    introText: current.introText,
    signatureText: current.signatureText,
    defaultIntroText: defaults.introText,
    defaultSignatureText: defaults.signatureText,
    ...subject,
    // Deux champs de plus pour magic_link_login SEUL : leur présence est le
    // prédicat qui fait apparaître le sélecteur de variante côté client.
    ...(sysKey === 'magic_link_login' && {
      subjectAdmin: row.subjectAdmin,
      defaultSubjectAdmin: factorySubjectTemplate('magic_link_login', true),
    }),
    updatedAt: row.updatedAt,
  }
}

// --- Public service functions ---

export async function getEmailTemplateView(templateKey: TemplateKey): Promise<EmailTemplateView> {
  const row = await getEmailTemplate(templateKey)
  const view = projectRow(row)
  // Flag de coque uniquement pour l'invitation : seul modèle dont la coque
  // (footer + coque commune carte) est éditable et peut dévier de l'usine.
  if (view.templateKey === 'invitation') {
    return { ...view, shellCustomized: await isInvitationShellCustomized() }
  }
  return view
}

/** Part « objet » d'une charge de PATCH — tri-état par champ (cf. `updateEmailTemplate`). */
interface SubjectPatch {
  subject?: string | null
  subjectAdmin?: string | null
}

/**
 * A7 au niveau modèle, côté SERVEUR. Une personnalisation textuellement égale à
 * l'objet d'usine n'est pas une personnalisation : la stocker figerait une
 * copie qui cesserait de suivre toute évolution future de l'usine — la dérive
 * exacte que A7 existe pour empêcher.
 *
 * Le client fait déjà cette réduction (`EmailSubjectLine.nextValue`), mais un
 * PATCH direct la contournerait. Le niveau événement, lui, la fait en SQL
 * (`event-email-template.service.ts`) ; ceci en est le pendant.
 *
 * Tri-état préservé : `undefined` (ne pas toucher) et `null` (effacer) passent
 * inchangés. La comparaison porte sur la forme SOURCE, jetons compris, seule
 * forme dont l'égalité signifie « même objet pour tout destinataire ».
 */
function reduceSubjectToInherited(
  subject: string | null | undefined,
  factory: string,
): string | null | undefined {
  if (subject === undefined || subject === null) return subject
  return subject === normalizeSubject(factory) ? null : subject
}

export async function applyEmailTemplatePatch(
  templateKey: TemplateKey,
  patch: ({ bodyMjml: string } | { introText: string; signatureText: string }) & SubjectPatch,
): Promise<EmailTemplateView> {
  // Les deux branches convergent vers un seul corps, donc vers un seul garde de
  // contenu. La branche système ne peut en principe rien produire de refusé (ses
  // deux zones de texte sont échappées avant injection dans le squelette), mais la
  // vérifier coûte un balayage et transforme une faute de squelette en refus
  // explicite plutôt qu'en corps douteux stocké.
  let bodyMjml: string

  if (templateKey === 'invitation') {
    // Forme garantie par `pickPatchSchema` : la clé invitation n'accepte que `bodyMjml`.
    const invitationPatch = patch as { bodyMjml: string }
    bodyMjml = invitationPatch.bodyMjml
  } else {
    // Forme garantie par `pickPatchSchema` : toute autre clé n'accepte que les deux zones.
    const systemPatch = patch as { introText: string; signatureText: string }
    bodyMjml = composeSystemTemplate({
      templateKey: templateKey as SystemTemplateKey,
      introText: systemPatch.introText,
      signatureText: systemPatch.signatureText,
    })
  }

  assertSafeEmailBody(bodyMjml)

  // Corps et objet dans la MÊME écriture : un seul bouton « Enregistrer » ne
  // vaut pas une seule transaction, mais ces deux-là au moins atterrissent
  // ensemble ou pas du tout.
  return projectRow(
    await updateEmailTemplate(templateKey, {
      bodyMjml,
      subject: reduceSubjectToInherited(
        patch.subject,
        factorySubjectTemplate(templateKey, false),
      ),
      subjectAdmin: reduceSubjectToInherited(
        patch.subjectAdmin,
        factorySubjectTemplate(templateKey, true),
      ),
    }),
  )
}

// Clés UI réinitialisables par le reset global. Toutes les clés système
// (magic_link_login, reservation_confirmation, account_created,
// cancellation_confirmation, role_promoted, role_demoted,
// unregistration_confirmation) sont incluses —
// seul 'invitation' reste géré séparément via PUT brut. Voir design R2.
const UI_RESETTABLE_TEMPLATE_KEYS = [
  'invitation',
  'magic_link_login',
  'reservation_confirmation',
  'account_created',
  'cancellation_confirmation',
  'role_promoted',
  'role_demoted',
  'unregistration_confirmation',
] as const satisfies readonly TemplateKey[]

/**
 * Reset transactionnel global : restaure les 8 corps UI en valeur factory ET
 * restaure le design partagé (shell_parts owner_kind='template') en valeur
 * factory — la carte shell commune @ template[invitation] est remise à sa
 * valeur migration-018 (PAS supprimée, sinon la cascade retombe sur le header
 * legacy hardcodé) tandis que les footers par-template et tout override
 * template-owned sont supprimés.
 * PRÉSERVE la marque (email_brand_settings + shell owner_kind='brand') et les
 * événements (owner_kind='event'). Une transaction = atomique (pas de demi-reset).
 */
export async function resetAllEmailTemplates(): Promise<{
  templatesReset: number
  shellPartsDeleted: number
}> {
  return withTransaction(async (client) => {
    const templatesReset = await resetEmailTemplatesToFactory(client, UI_RESETTABLE_TEMPLATE_KEYS)
    const shellPartsDeleted = await resetSharedShellToFactory(client)
    return { templatesReset, shellPartsDeleted }
  })
}

