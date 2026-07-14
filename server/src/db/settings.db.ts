import { query } from './query'
import { encrypt, decrypt } from '../services/encryption.service'

const SMTP_KEYS = [
  'smtp_host',
  'smtp_port',
  'smtp_secure',
  'smtp_user',
  'smtp_password',
  'smtp_from_name',
  'smtp_from_email'
] as const

const PASSWORD_SENTINELS = ['****', '']

const SMTP_PROVISIONED_KEY = 'smtp_provisioned'

export async function isSmtpProvisioned(): Promise<boolean> {
  const r = await query(`SELECT value FROM app_config WHERE key = $1`, [SMTP_PROVISIONED_KEY])
  return r.rows[0]?.value === 'true'
}

export async function markSmtpProvisioned(): Promise<void> {
  await query(
    `INSERT INTO app_config (key, value) VALUES ($1, 'true')
     ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW()`,
    [SMTP_PROVISIONED_KEY]
  )
}

export interface SmtpSettings {
  smtpHost: string
  smtpPort: string
  smtpSecure: boolean
  smtpUser: string
  smtpPassword: string
  smtpFromName: string
  smtpFromEmail: string
}

export async function getSmtpSettings(): Promise<SmtpSettings> {
  const result = await query(
    `SELECT key, value FROM app_config WHERE key IN (${SMTP_KEYS.map((_, i) => `$${i + 1}`).join(', ')})`,
    [...SMTP_KEYS]
  )

  const map = new Map(result.rows.map((r: { key: string; value: string }) => [r.key, r.value]))

  const rawPassword = map.get('smtp_password') || ''
  const password = rawPassword && !PASSWORD_SENTINELS.includes(rawPassword)
    ? decrypt(rawPassword)
    : ''

  return {
    smtpHost: map.get('smtp_host') || '',
    smtpPort: map.get('smtp_port') || '',
    smtpSecure: map.get('smtp_secure') === 'true',
    smtpUser: map.get('smtp_user') || '',
    smtpPassword: password,
    smtpFromName: map.get('smtp_from_name') || 'TimePick',
    smtpFromEmail: map.get('smtp_from_email') || ''
  }
}

export async function saveSmtpSettings(data: Partial<SmtpSettings>): Promise<void> {
  const entries: Array<{ key: string; value: string }> = []

  if (data.smtpHost !== undefined) entries.push({ key: 'smtp_host', value: data.smtpHost })
  if (data.smtpPort !== undefined) entries.push({ key: 'smtp_port', value: data.smtpPort })
  if (data.smtpSecure !== undefined) entries.push({ key: 'smtp_secure', value: String(data.smtpSecure) })
  if (data.smtpUser !== undefined) entries.push({ key: 'smtp_user', value: data.smtpUser })
  if (data.smtpFromName !== undefined) entries.push({ key: 'smtp_from_name', value: data.smtpFromName })
  if (data.smtpFromEmail !== undefined) entries.push({ key: 'smtp_from_email', value: data.smtpFromEmail })

  // Handle password: skip sentinel values, encrypt real values
  if (data.smtpPassword !== undefined) {
    if (!PASSWORD_SENTINELS.includes(data.smtpPassword)) {
      entries.push({ key: 'smtp_password', value: encrypt(data.smtpPassword) })
    }
    // If sentinel value, skip — preserve existing password in DB
  }

  if (entries.length === 0) return

  await Promise.all(
    entries.map(entry =>
      query(
        `INSERT INTO app_config (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [entry.key, entry.value]
      )
    )
  )
}

export async function clearSmtpSettings(): Promise<void> {
  await query(
    `DELETE FROM app_config WHERE key = ANY($1::text[])`,
    [SMTP_KEYS as unknown as string[]]
  )
  await markSmtpProvisioned()
}
