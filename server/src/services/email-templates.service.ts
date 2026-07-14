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

// --- Types ---

// 'cancellation_confirmation' est désormais inclus : le body est restructuré par la
// migration 024 pour être compatible avec l'éditeur 2-zones (INTRO + SIG), le bloc
// détails (événement/date/horaires/motif/calendrier) étant figé dans le skeleton.
// Restent exclues : 'invitation' (éditable via PUT brut) et 'slot_modification'
// (corps dynamique — blocs conditionnels assemblés au runtime via {{changes_blocks}} ;
// non exposé dans l'éditeur UI, décision V8 — donc pas de skeleton INTRO/SIG).
export type SystemTemplateKey = Exclude<TemplateKey, 'invitation' | 'slot_modification'>

interface InvitationTemplateView {
  templateKey: 'invitation'
  bodyMjml: string
  defaultBodyMjml: string
  // True si la coque de l'invitation (pied + coque commune carte) diffère de
  // l'usine — pilote le bouton « Restaurer le gabarit d'usine » côté client
  // (lot 3b). Absent pour les modèles système (coque non éditable per-key).
  shellCustomized?: boolean
  updatedAt: Date
}

interface SystemTemplateView {
  templateKey: SystemTemplateKey
  introText: string
  signatureText: string
  defaultIntroText: string
  defaultSignatureText: string
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

function projectRow(row: EmailTemplateRow): EmailTemplateView {
  if (row.templateKey === 'invitation') {
    return {
      templateKey: 'invitation',
      bodyMjml: row.bodyMjml,
      defaultBodyMjml: row.defaultBodyMjml,
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

export async function applyEmailTemplatePatch(
  templateKey: TemplateKey,
  patch: { bodyMjml: string } | { introText: string; signatureText: string },
): Promise<EmailTemplateView> {
  let row: EmailTemplateRow

  if (templateKey === 'invitation') {
    row = await updateEmailTemplate(templateKey, {
      bodyMjml: (patch as { bodyMjml: string }).bodyMjml,
    })
  } else {
    const { introText, signatureText } = patch as {
      introText: string
      signatureText: string
    }
    const bodyMjml = composeSystemTemplate({
      templateKey: templateKey as SystemTemplateKey,
      introText,
      signatureText,
    })
    row = await updateEmailTemplate(templateKey, { bodyMjml })
  }

  return projectRow(row)
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

