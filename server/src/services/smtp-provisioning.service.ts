import { getSmtpSettings, saveSmtpSettings, isSmtpProvisioned, markSmtpProvisioned } from '../db/settings.db'
import { getEmailProviderConfig, saveEmailProviderConfig, type EmailProvider } from '../db/email-provider.db'
import { getProviderMeta } from './email-transport/descriptors'
import { catalogSecretFieldsResolver } from './email-transport/provider-credentials'

/**
 * Chantier email-providers (B2) — seed provider email généralisé (B1 câblait
 * uniquement `resend`), miroir du seed `SMTP_*` existant ci-dessous. Le
 * chemin `SMTP_HOST` reste PRIORITAIRE et intact (vérifié en premier) ; le
 * provider n'est vérifié/écrit que si `SMTP_HOST` est absent ET
 * `EMAIL_PROVIDER` désigne un fournisseur HTTP du catalogue —
 * `getEmailProviderConfig`/`saveEmailProviderConfig` ne sont donc JAMAIS
 * appelées quand `EMAIL_PROVIDER` est absent (pas d'appel DB systématique
 * ajouté au chemin SMTP historique).
 *
 * Précédence des credentials (delta revue 6) : `EMAIL_API_CREDENTIALS`
 * (JSON, riche — objet `{champ: valeur}` du fournisseur) prime sur
 * `EMAIL_API_KEY` (legacy, alias `{apiKey: <valeur>}`, conservé pour compat
 * ascendante avec le seed one-shot pré-B2). JSON malformé → LOGGÉ
 * explicitement (jamais avalé silencieusement), seed ignoré. Champs requis
 * du fournisseur manquants (ex. `mailjet` sans `secretKey`) → loggé + seed
 * ignoré (pas d'écriture partielle).
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

    const provider = process.env.EMAIL_PROVIDER
    if (!provider || provider === 'smtp') return

    const meta = getProviderMeta(provider)
    if (!meta) {
      console.error(`[SmtpProvisioning] EMAIL_PROVIDER='${provider}' inconnu (catalogue) — seed ignoré`)
      return
    }

    let credentials: Record<string, string> | null = null
    if (process.env.EMAIL_API_CREDENTIALS) {
      try {
        const parsed: unknown = JSON.parse(process.env.EMAIL_API_CREDENTIALS)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          credentials = parsed as Record<string, string>
        } else {
          console.error("[SmtpProvisioning] EMAIL_API_CREDENTIALS n'est pas un objet JSON — seed ignoré")
          return
        }
      } catch (err) {
        console.error('[SmtpProvisioning] EMAIL_API_CREDENTIALS: JSON malformé — seed ignoré:', err)
        return
      }
    } else if (process.env.EMAIL_API_KEY) {
      credentials = { apiKey: process.env.EMAIL_API_KEY } // alias legacy (compat pré-B2)
    }
    if (!credentials) return // ni EMAIL_API_CREDENTIALS ni EMAIL_API_KEY — rien à seed

    const missing = meta.credentialFields.filter(f => (f.required ?? true) && !credentials![f.key])
    if (missing.length > 0) {
      console.error(
        `[SmtpProvisioning] EMAIL_PROVIDER='${provider}' — champ(s) requis manquant(s) (${missing.map(f => f.key).join(', ')}) — seed ignoré`,
      )
      return
    }

    const existing = await getEmailProviderConfig(catalogSecretFieldsResolver)
    if (existing.provider !== 'smtp' || Object.values(existing.credentials).some(Boolean)) return // config provider déjà présente

    await saveEmailProviderConfig({ provider: provider as EmailProvider, credentials }, catalogSecretFieldsResolver)
    await saveSmtpSettings({
      smtpFromName: process.env.SMTP_FROM_NAME || 'TimePick',
      smtpFromEmail: process.env.SMTP_FROM_EMAIL || '',
    })
    await markSmtpProvisioned()
    console.log(`[SmtpProvisioning] Provider email '${provider}' provisionné depuis les variables d'environnement`)
  } catch (err) {
    console.error('[SmtpProvisioning] échec du seed (non bloquant) — vérifiez ENCRYPTION_KEY (64 hex) et la connectivité DB:', err)
  }
}
