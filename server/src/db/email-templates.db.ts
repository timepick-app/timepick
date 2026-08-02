/**
 * Email Templates DB helper — persistence-only CRUD for email_templates rows.
 *
 * camelCase DTO boundary: maps snake_case SQL columns to camelCase wire keys.
 * The introText/signatureText projection for system templates is computed in
 * the service layer (services/email-templates.service.ts), not here.
 */

import type { PoolClient } from 'pg'
import { query } from '../db'

// --- Types ---

// Source UNIQUE des clés de template : le tuple `as const` dérive à la fois le
// type `TemplateKey` et la liste runtime `TEMPLATE_KEYS` — impossible de
// désynchroniser (ajouter une clé = une seule édition ici).
export const TEMPLATE_KEYS = [
  'invitation',
  'magic_link_login',
  'reservation_confirmation',
  'cancellation_confirmation',
  'account_created',
  'slot_modification',
  'role_promoted',
  'role_demoted',
  'unregistration_confirmation',
] as const

export type TemplateKey = (typeof TEMPLATE_KEYS)[number]

export interface EmailTemplateRow {
  templateKey: TemplateKey
  bodyMjml: string
  defaultBodyMjml: string
  // Personnalisation de l'objet — NULL = objet d'usine (cf. migration 044 :
  // seule la personnalisation est stockée, jamais la valeur d'usine).
  subject: string | null
  // Variante administrateur, utilisée par magic_link_login seul.
  subjectAdmin: string | null
  updatedAt: Date
}

// --- Error classes ---

export class EmailTemplateNotFoundError extends Error {
  constructor(public readonly templateKey: string) {
    super(`Email template not found: ${templateKey}`)
    this.name = 'EmailTemplateNotFoundError'
  }
}

// --- Internal row type (snake_case from pg) ---

type RawRow = {
  template_key: TemplateKey
  body_mjml: string
  default_body_mjml: string
  subject: string | null
  subject_admin: string | null
  updated_at: Date
}

function rowToDto(row: RawRow): EmailTemplateRow {
  return {
    templateKey: row.template_key,
    bodyMjml: row.body_mjml,
    defaultBodyMjml: row.default_body_mjml,
    subject: row.subject,
    subjectAdmin: row.subject_admin,
    updatedAt: row.updated_at,
  }
}

// --- Public API ---

const RETURNING_COLUMNS = `template_key, body_mjml, default_body_mjml, subject, subject_admin, updated_at`

export async function getEmailTemplate(templateKey: TemplateKey): Promise<EmailTemplateRow> {
  const { rows } = await query<RawRow>(
    `SELECT ${RETURNING_COLUMNS} FROM email_templates WHERE template_key = $1`,
    [templateKey],
  )
  if (rows.length === 0) throw new EmailTemplateNotFoundError(templateKey)
  return rowToDto(rows[0])
}

/** Les trois surcharges d'objet qui décident de la ligne réellement envoyée. */
export interface SubjectOverrides {
  /** `email_templates.subject` — NULL = objet d'usine. */
  subject: string | null
  /** `email_templates.subject_admin` — variante magic_link_login administrateur. */
  subjectAdmin: string | null
  /** `events.invitation_subject` — NULL = hérite du modèle. */
  eventSubject: string | null
}

/**
 * Surcharges d'objet en vigueur pour un envoi, en UN aller-retour.
 *
 * Lecture délibérément maigre : le chemin d'envoi n'a besoin que de trois
 * colonnes de texte court, alors que `getEmailTemplate` ramène deux corps MJML
 * pouvant aller à 64 KiB chacun.
 *
 * La jointure sur `events` est ici plutôt que dans un module « événement »
 * parce que la cascade d'objet est une seule question — « quel objet part ? » —
 * et que la scinder en deux lectures ferait deux allers-retours pour une
 * réponse indivisible. `eventId` absent ⇒ `$2` vaut NULL, la jointure ne
 * ramène rien et `eventSubject` est NULL : le cas « pas d'événement » n'a pas
 * de branche.
 *
 * Retourne `null` si le modèle n'existe pas — l'appelant retombe sur l'usine
 * plutôt que de faire échouer un envoi pour une ligne manquante.
 */
export async function getSubjectOverrides(
  templateKey: TemplateKey,
  eventId?: string,
): Promise<SubjectOverrides | null> {
  const { rows } = await query<{
    subject: string | null
    subject_admin: string | null
    event_subject: string | null
  }>(
    `SELECT t.subject, t.subject_admin, e.invitation_subject AS event_subject
       FROM email_templates t
       LEFT JOIN events e ON e.id = $2::uuid
      WHERE t.template_key = $1`,
    [templateKey, eventId ?? null],
  )
  if (rows.length === 0) return null
  return {
    subject: rows[0].subject,
    subjectAdmin: rows[0].subject_admin,
    eventSubject: rows[0].event_subject,
  }
}

/**
 * `patch.subject` / `patch.subjectAdmin` sont OPTIONNELS et tri-états :
 * absents = ne pas toucher à la colonne, `null` = effacer la personnalisation,
 * chaîne = écrire. Un enregistrement qui ne change que le corps ne doit pas
 * réécrire l'objet, sinon deux onglets ouverts s'effacent mutuellement.
 *
 * L'écriture reste UNE instruction : le corps et l'objet voyagent ensemble,
 * donc ils atterrissent ensemble. `COALESCE($n, colonne)` ne conviendrait pas
 * — il confondrait « efface » et « ne touche pas ». D'où le drapeau
 * compagnon booléen par colonne.
 */
export async function updateEmailTemplate(
  templateKey: TemplateKey,
  patch: { bodyMjml: string; subject?: string | null; subjectAdmin?: string | null },
): Promise<EmailTemplateRow> {
  const { rows } = await query<RawRow>(
    `UPDATE email_templates
        SET body_mjml = $1,
            subject = CASE WHEN $3 THEN $4 ELSE subject END,
            subject_admin = CASE WHEN $5 THEN $6 ELSE subject_admin END
      WHERE template_key = $2
      RETURNING ${RETURNING_COLUMNS}`,
    [
      patch.bodyMjml,
      templateKey,
      patch.subject !== undefined,
      patch.subject ?? null,
      patch.subjectAdmin !== undefined,
      patch.subjectAdmin ?? null,
    ],
  )
  if (rows.length === 0) throw new EmailTemplateNotFoundError(templateKey)
  return rowToDto(rows[0])
}

/**
 * Bulk reset: sets body_mjml = default_body_mjml for the given keys, on the
 * provided transaction client (atomicity with the shell_parts DELETE of the
 * global reset). Does NOT use RETURNING — the global reset only needs the
 * affected row count. Returns the number of rows updated.
 *
 * L'objet suit le corps : « revenir à l'usine » l'efface, puisque son usine
 * n'est pas en base mais dans le code. Les surcharges d'ÉVÉNEMENT ne sont pas
 * touchées — même périmètre que le corps aujourd'hui.
 */
export async function resetEmailTemplatesToFactory(
  client: PoolClient,
  keys: readonly TemplateKey[],
): Promise<number> {
  const result = await client.query(
    `UPDATE email_templates
        SET body_mjml = default_body_mjml, subject = NULL, subject_admin = NULL
      WHERE template_key = ANY($1)`,
    [keys],
  )
  return result.rowCount ?? 0
}
