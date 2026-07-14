import { getSmtpSettings, saveSmtpSettings, isSmtpProvisioned, markSmtpProvisioned } from '../db/settings.db'

export async function provisionSmtpFromEnv(): Promise<void> {
  try {
    const current = await getSmtpSettings()
    if (current.smtpHost || await isSmtpProvisioned() || !process.env.SMTP_HOST) return
    await saveSmtpSettings({
      smtpHost: process.env.SMTP_HOST,
      smtpPort: process.env.SMTP_PORT || '587',
      smtpSecure: process.env.SMTP_SECURE === 'true',
      smtpUser: process.env.SMTP_USER || '',
      smtpPassword: process.env.SMTP_PASSWORD || '',
      smtpFromName: process.env.SMTP_FROM_NAME || 'TimePick',
      smtpFromEmail: process.env.SMTP_FROM_EMAIL || '',
    })
    await markSmtpProvisioned()
    console.log("[SmtpProvisioning] SMTP provisionné depuis les variables d'environnement")
  } catch (err) {
    console.error('[SmtpProvisioning] échec du seed (non bloquant) — vérifiez ENCRYPTION_KEY (64 hex) et la connectivité DB:', err)
  }
}
