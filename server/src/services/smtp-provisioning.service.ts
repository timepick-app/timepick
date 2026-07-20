import { getSmtpSettings, saveSmtpSettings, isSmtpProvisioned, markSmtpProvisioned } from '../db/settings.db'
import { getEmailProviderConfig, saveEmailProviderConfig } from '../db/email-provider.db'

/**
 * Chantier C — seed provider email depuis EMAIL_PROVIDER/EMAIL_API_KEY, miroir
 * du seed SMTP_* existant ci-dessous. Le chemin SMTP_HOST reste PRIORITAIRE
 * et intact (vérifié en premier) ; le provider n'est vérifié/écrit que si
 * SMTP_HOST est absent, EMAIL_PROVIDER='resend' et EMAIL_API_KEY est défini —
 * `getEmailProviderConfig`/`saveEmailProviderConfig` (email-provider.db) ne
 * sont donc JAMAIS appelées quand EMAIL_PROVIDER est absent (pas d'appel DB
 * systématique ajouté au chemin SMTP historique).
 */
export async function provisionSmtpFromEnv(): Promise<void> {
  try {
    const current = await getSmtpSettings()
    if (current.smtpHost || await isSmtpProvisioned()) return

    if (process.env.SMTP_HOST) {
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
      return
    }

    if (process.env.EMAIL_PROVIDER === 'resend' && process.env.EMAIL_API_KEY) {
      const existing = await getEmailProviderConfig()
      if (existing.provider !== 'smtp' || existing.apiKey) return // config provider déjà présente

      await saveEmailProviderConfig({ provider: 'resend', apiKey: process.env.EMAIL_API_KEY })
      await saveSmtpSettings({
        smtpFromName: process.env.SMTP_FROM_NAME || 'TimePick',
        smtpFromEmail: process.env.SMTP_FROM_EMAIL || '',
      })
      await markSmtpProvisioned()
      console.log("[SmtpProvisioning] Provider email 'resend' provisionné depuis les variables d'environnement")
    }
  } catch (err) {
    console.error('[SmtpProvisioning] échec du seed (non bloquant) — vérifiez ENCRYPTION_KEY (64 hex) et la connectivité DB:', err)
  }
}
