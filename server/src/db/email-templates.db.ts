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
  updated_at: Date
}

function rowToDto(row: RawRow): EmailTemplateRow {
  return {
    templateKey: row.template_key,
    bodyMjml: row.body_mjml,
    defaultBodyMjml: row.default_body_mjml,
    updatedAt: row.updated_at,
  }
}

// --- Public API ---

const RETURNING_COLUMNS = `template_key, body_mjml, default_body_mjml, updated_at`

export async function getEmailTemplate(templateKey: TemplateKey): Promise<EmailTemplateRow> {
  const { rows } = await query<RawRow>(
    `SELECT ${RETURNING_COLUMNS} FROM email_templates WHERE template_key = $1`,
    [templateKey],
  )
  if (rows.length === 0) throw new EmailTemplateNotFoundError(templateKey)
  return rowToDto(rows[0])
}

export async function updateEmailTemplate(
  templateKey: TemplateKey,
  patch: { bodyMjml: string },
): Promise<EmailTemplateRow> {
  const { rows } = await query<RawRow>(
    `UPDATE email_templates SET body_mjml = $1 WHERE template_key = $2 RETURNING ${RETURNING_COLUMNS}`,
    [patch.bodyMjml, templateKey],
  )
  if (rows.length === 0) throw new EmailTemplateNotFoundError(templateKey)
  return rowToDto(rows[0])
}

/**
 * Bulk reset: sets body_mjml = default_body_mjml for the given keys, on the
 * provided transaction client (atomicity with the shell_parts DELETE of the
 * global reset). Does NOT use RETURNING — the global reset only needs the
 * affected row count. Returns the number of rows updated.
 */
export async function resetEmailTemplatesToFactory(
  client: PoolClient,
  keys: readonly TemplateKey[],
): Promise<number> {
  const result = await client.query(
    `UPDATE email_templates SET body_mjml = default_body_mjml WHERE template_key = ANY($1)`,
    [keys],
  )
  return result.rowCount ?? 0
}
