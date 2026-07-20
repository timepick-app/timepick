import { query } from './query'
import { encrypt, decrypt } from '../services/encryption.service'

/**
 * Chantier C — persistance du provider email pluggable (smtp | resend | brevo).
 *
 * Module VOLONTAIREMENT séparé de settings.db.ts : les suites-juges de
 * non-régression (settings.db.test.ts `toEqual` exact sur getSmtpSettings(),
 * email-transport.test.ts / smtp-provisioning.test.ts qui remplacent le module
 * settings.db entier par un mock fermé) imposent que la surface de settings.db
 * reste byte-identique. Les deux clés app_config vivent ici :
 *   - email_provider : 'smtp' (défaut, seed migration 039) | 'resend' | 'brevo'
 *   - email_api_key  : clé API chiffrée AES-256-GCM (même mécanique et même
 *     ENCRYPTION_KEY que smtp_password — aucune nouvelle crypto). '' = absente.
 *
 * Sentinelle '****' : comme smtp_password — jamais la clé en clair dans une
 * réponse GET ; à la sauvegarde, '' et '****' préservent la clé stockée.
 */

export const EMAIL_PROVIDERS = ['smtp', 'resend', 'brevo'] as const
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number]

const PROVIDER_KEY = 'email_provider'
const API_KEY_KEY = 'email_api_key'
const API_KEY_SENTINELS = ['****', '']

export interface EmailProviderConfig {
  provider: EmailProvider
  /** Clé API déchiffrée ('' si absente). */
  apiKey: string
}

function normalizeProvider(value: string | undefined): EmailProvider {
  return (EMAIL_PROVIDERS as readonly string[]).includes(value ?? '')
    ? (value as EmailProvider)
    : 'smtp'
}

/**
 * Lit la config provider. Valeur inconnue/absente → 'smtp' (défaut sûr).
 * PROPAGE l'échec de déchiffrement (ENCRYPTION_KEY mismatch) — même sémantique
 * que getSmtpSettings pour smtp_password : buildTransport le détecte via
 * looksLikeDecryptFailure et lève le signal encryptionKeyMismatch.
 */
export async function getEmailProviderConfig(): Promise<EmailProviderConfig> {
  const result = await query(
    `SELECT key, value FROM app_config WHERE key IN ($1, $2)`,
    [PROVIDER_KEY, API_KEY_KEY]
  )
  const map = new Map(result.rows.map((r: { key: string; value: string }) => [r.key, r.value]))

  const rawKey = map.get(API_KEY_KEY) || ''
  const apiKey = rawKey && !API_KEY_SENTINELS.includes(rawKey) ? decrypt(rawKey) : ''

  return { provider: normalizeProvider(map.get(PROVIDER_KEY)), apiKey }
}

/**
 * Sauvegarde provider (+ clé API chiffrée). apiKey undefined/''/'****'
 * → la clé stockée est préservée (miroir du contrat smtp_password).
 */
export async function saveEmailProviderConfig(data: { provider: EmailProvider; apiKey?: string }): Promise<void> {
  // Écritures SÉQUENTIELLES, clé d'abord : si le second write échoue, l'état
  // résiduel est « clé posée, provider inchangé » (inerte) plutôt que
  // « provider=resend sans clé » (config déchirée visible). Pas de transaction :
  // parité de rigueur avec settings.db (une requête par write), l'appelant
  // reçoit l'erreur (pas de faux 200) et peut re-soumettre.
  if (data.apiKey !== undefined && !API_KEY_SENTINELS.includes(data.apiKey)) {
    await query(
      `INSERT INTO app_config (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [API_KEY_KEY, encrypt(data.apiKey)]
    )
  }
  await query(
    `INSERT INTO app_config (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [PROVIDER_KEY, data.provider]
  )
}

/**
 * Supprime provider + clé API → retour au défaut 'smtp' (ligne absente =
 * normalizeProvider → 'smtp'). Appelé avec clearSmtpSettings par le DELETE
 * admin (réinitialisation complète de la config email).
 */
export async function clearEmailProviderConfig(): Promise<void> {
  await query(
    `DELETE FROM app_config WHERE key = ANY($1::text[])`,
    [[PROVIDER_KEY, API_KEY_KEY]]
  )
}
