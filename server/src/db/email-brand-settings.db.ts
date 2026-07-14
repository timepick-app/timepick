/**
 * Email Brand Settings DB helper — read/write the email_brand_settings singleton.
 *
 * camelCase DTO boundary: this helper maps snake_case SQL columns to camelCase
 * wire-shape keys at the boundary, following the SMTP precedent (settings.db.ts).
 *
 * Note: getEmailBrandSettings() intentionally duplicates the read path of
 * render-email.service.ts:125-134 during E1.S2/S3a parallel implementation.
 * S3a returns a camelCase DTO (wire-facing); S2 uses snake_case (renderer-internal).
 * The DRY cleanup is captured under OPEN-Q-1 in story 22-3a.
 */

import { query, withTransaction } from '../db'
import { EMAIL_BRAND_FACTORY_DEFAULTS } from '../config/emailBrandDefaults'

// --- DTOs (camelCase wire shape) ---

export interface EmailBrandSettings {
  logoUrl: string | null
  primaryColor: string
  buttonTextColor: string
  fontFamily: string
  buttonBorderRadius: number
  updatedAt: Date
}

export type EmailBrandSettingsUpdate = Partial<Omit<EmailBrandSettings, 'updatedAt'>>

// --- Error classes ---

export class EmailBrandSettingsNotFoundError extends Error {
  constructor() {
    super('Email brand settings singleton row not found')
    this.name = 'EmailBrandSettingsNotFoundError'
  }
}

class EmptyPatchError extends Error {
  constructor() {
    super('Patch body must contain at least one field')
    this.name = 'EmptyPatchError'
  }
}

// --- Wire (camelCase) → SQL column (snake_case) mapping ---

const WIRE_TO_COLUMN = {
  logoUrl: 'logo_url',
  primaryColor: 'primary_color',
  buttonTextColor: 'button_text_color',
  fontFamily: 'font_family',
  buttonBorderRadius: 'button_border_radius',
} as const satisfies Record<keyof EmailBrandSettingsUpdate, string>

// --- Internal row type (snake_case from pg) ---

type RawRow = {
  logo_url: string | null
  primary_color: string
  button_text_color: string
  font_family: string
  button_border_radius: number
  updated_at: Date
}

function rowToDto(row: RawRow): EmailBrandSettings {
  return {
    logoUrl: row.logo_url,
    primaryColor: row.primary_color,
    buttonTextColor: row.button_text_color,
    fontFamily: row.font_family,
    buttonBorderRadius: row.button_border_radius,
    updatedAt: row.updated_at,
  }
}

// --- Public API ---

const SELECT_COLUMNS = `SELECT logo_url, primary_color, button_text_color, font_family, button_border_radius, updated_at FROM email_brand_settings WHERE id = 1`

export async function getEmailBrandSettings(): Promise<EmailBrandSettings> {
  const { rows } = await query<RawRow>(SELECT_COLUMNS)
  if (rows.length === 0) throw new EmailBrandSettingsNotFoundError()
  return rowToDto(rows[0])
}

export async function updateEmailBrandSettings(patch: EmailBrandSettingsUpdate): Promise<EmailBrandSettings> {
  const wireKeys = (Object.keys(WIRE_TO_COLUMN) as (keyof typeof WIRE_TO_COLUMN)[])
    .filter((k) => k in patch)

  if (wireKeys.length === 0) throw new EmptyPatchError()

  const setClause = wireKeys
    .map((k, i) => `${WIRE_TO_COLUMN[k]} = $${i + 1}`)
    .join(', ')
  const values = wireKeys.map((k) => patch[k])

  const sql = `UPDATE email_brand_settings
               SET ${setClause}
               WHERE id = 1
               RETURNING logo_url, primary_color, button_text_color, font_family, button_border_radius, updated_at`

  const { rows } = await query<RawRow>(sql, values)
  if (rows.length === 0) throw new EmailBrandSettingsNotFoundError()
  return rowToDto(rows[0])
}

/**
 * Reset the singleton row to the factory defaults exported by
 * `config/emailBrandDefaults.ts`. Wrapped in `withTransaction` with a
 * `SELECT … FOR UPDATE` row-lock so the previous logo URL we read is the
 * exact one being overwritten — preventing the SELECT-then-UPDATE race where
 * a concurrent admin upload changes `logo_url` between the two statements.
 */
export async function resetEmailBrandToFactory(): Promise<{
  previousLogoUrl: string | null
  dto: EmailBrandSettings
}> {
  return withTransaction(async (client) => {
    const sel = await client.query<{ logo_url: string | null }>(
      'SELECT logo_url FROM email_brand_settings WHERE id = 1 FOR UPDATE'
    )
    if (sel.rowCount === 0) throw new EmailBrandSettingsNotFoundError()
    const previousLogoUrl = sel.rows[0].logo_url

    const upd = await client.query<RawRow>(
      `UPDATE email_brand_settings
         SET logo_url = $1,
             primary_color = $2,
             button_text_color = $3,
             font_family = $4,
             button_border_radius = $5
       WHERE id = 1
       RETURNING logo_url, primary_color, button_text_color, font_family,
                button_border_radius, updated_at`,
      [
        EMAIL_BRAND_FACTORY_DEFAULTS.logoUrl,
        EMAIL_BRAND_FACTORY_DEFAULTS.primaryColor,
        EMAIL_BRAND_FACTORY_DEFAULTS.buttonTextColor,
        EMAIL_BRAND_FACTORY_DEFAULTS.fontFamily,
        EMAIL_BRAND_FACTORY_DEFAULTS.buttonBorderRadius,
      ]
    )
    if (upd.rowCount === 0) throw new EmailBrandSettingsNotFoundError()
    return { previousLogoUrl, dto: rowToDto(upd.rows[0]) }
  })
}
