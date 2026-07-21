import { query } from './query'
import { encrypt, decrypt } from '../services/encryption.service'

/**
 * Chantier email-providers (B1) — persistance data-driven du provider email
 * pluggable (smtp | brevo | mailjet | scaleway | sweego | resend), modèle
 * d'identifiants multi-champ (contrat §2.2).
 *
 * Module VOLONTAIREMENT séparé de settings.db.ts (chantier C, inchangé) : les
 * suites-juges de non-régression (settings.db.test.ts `toEqual` exact sur
 * getSmtpSettings(), email-transport.test.ts / smtp-provisioning.test.ts qui
 * remplacent le module settings.db entier par un mock fermé) imposent que la
 * surface de settings.db reste byte-identique. Deux clés `app_config` vivent
 * ici :
 *   - email_provider : 'smtp' (défaut, seed migration 039) | 'brevo' |
 *     'mailjet' | 'scaleway' | 'sweego' | 'resend' — ordre EU-first, resend
 *     en dernier (contrat §0/§3.1). Fonctionnellement, B1 ne câble QUE
 *     'smtp'/'resend' : les 4 autres ids sont acceptés par ce modèle DB mais
 *     restent injoignables tant que le validateur (settings.validator.ts,
 *     B2) ne les autorise pas.
 *   - email_api_credentials : objet JSON {champ: valeur} sérialisé en TEXT,
 *     remplace le mono-champ email_api_key (migration 040, contrat §2.2).
 *     Les champs `secret` (liste dépendante du fournisseur, cf.
 *     `SecretFieldsResolver` ci-dessous) sont chiffrés individuellement
 *     (AES-256-GCM, encryption.service, même ENCRYPTION_KEY que
 *     smtp_password/email_api_key — aucune nouvelle crypto) ; les autres
 *     restent en clair.
 *
 * Sentinelle '****'/'' PAR CHAMP : comme smtp_password — jamais un secret en
 * clair dans une réponse GET ; à la sauvegarde, ces deux valeurs préservent
 * le champ stocké (au lieu de l'écraser par du vide ou le texte littéral
 * '****').
 */

export const EMAIL_PROVIDERS = ['smtp', 'brevo', 'mailjet', 'scaleway', 'sweego', 'resend'] as const
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number]

const PROVIDER_KEY = 'email_provider'
const CREDENTIALS_KEY = 'email_api_credentials'
/** B1 — compat lecture seule (contrat §2.2). Conservée en DB pour le
 *  rollback ; jamais réécrite par ce module après la migration 040. */
const LEGACY_API_KEY_KEY = 'email_api_key'
const FIELD_SENTINELS = ['****', '']

/**
 * Point d'extension B2 — liste des champs SECRET (à chiffrer individuellement)
 * pour un fournisseur donné. Normalement dérivée de
 * `ProviderMeta.credentialFields.filter(f => f.secret)` exposée par les
 * descripteurs (server/src/services/email-transport/descriptors/*, B2). Ce
 * module DB ne peut PAS importer les descripteurs : les descripteurs
 * référencent déjà `EmailProvider` (import `db → services/email-transport`),
 * un import inverse créerait un cycle. La liste est donc reçue en paramètre
 * (registre injecté), avec un défaut minimal valable pour B1 (seul `apiKey`
 * existe et est toujours secret, quel que soit le provider HTTP). B2
 * branchera le vrai registre côté appelant (controllers) en le dérivant du
 * catalogue de descripteurs.
 */
export type SecretFieldsResolver = (provider: EmailProvider) => readonly string[]
const defaultSecretFields: SecretFieldsResolver = () => ['apiKey']

export interface EmailProviderConfig {
  provider: EmailProvider
  /** Champs déchiffrés (secrets) + en clair (non-secrets). Champ absent → ''. */
  credentials: Record<string, string>
}

function normalizeProvider(value: string | undefined): EmailProvider {
  return (EMAIL_PROVIDERS as readonly string[]).includes(value ?? '')
    ? (value as EmailProvider)
    : 'smtp'
}

function parseCredentials(raw: string | undefined): Record<string, string> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>
    }
  } catch {
    // JSON malformé — traité comme absent (mêmes garanties qu'une valeur vide).
  }
  return {}
}

/**
 * Lit les credentials BRUTS (potentiellement chiffrés) stockés, avec repli
 * legacy resend (contrat §2.2 — installs pré-040 pas encore migrées, ou
 * réécriture directe de `email_api_key` par un chemin externe). Utilisé par
 * `getEmailProviderConfig` (déchiffrement) et `saveEmailProviderConfig`
 * (préservation par champ sur sentinelle).
 */
async function readRawStoredCredentials(provider: EmailProvider): Promise<Record<string, string>> {
  const result = await query(
    `SELECT key, value FROM app_config WHERE key IN ($1, $2)`,
    [CREDENTIALS_KEY, LEGACY_API_KEY_KEY]
  )
  const map = new Map(result.rows.map((r: { key: string; value: string }) => [r.key, r.value]))
  const stored = parseCredentials(map.get(CREDENTIALS_KEY))
  if (Object.keys(stored).length === 0 && provider === 'resend') {
    const legacy = map.get(LEGACY_API_KEY_KEY) || ''
    if (legacy) return { apiKey: legacy }
  }
  return stored
}

/**
 * Lit la config provider. Valeur inconnue/absente → 'smtp' (défaut sûr).
 * PROPAGE l'échec de déchiffrement (ENCRYPTION_KEY mismatch) — même
 * sémantique que getSmtpSettings pour smtp_password : buildTransport le
 * détecte via looksLikeDecryptFailure et lève le signal encryptionKeyMismatch.
 */
export async function getEmailProviderConfig(
  secretFields: SecretFieldsResolver = defaultSecretFields,
): Promise<EmailProviderConfig> {
  const providerResult = await query(`SELECT value FROM app_config WHERE key = $1`, [PROVIDER_KEY])
  const provider = normalizeProvider(providerResult.rows[0]?.value)

  const raw = await readRawStoredCredentials(provider)
  const secrets = new Set(secretFields(provider))
  const credentials: Record<string, string> = {}
  for (const [field, value] of Object.entries(raw)) {
    if (secrets.has(field)) {
      credentials[field] = value && !FIELD_SENTINELS.includes(value) ? decrypt(value) : ''
    } else {
      credentials[field] = value
    }
  }

  return { provider, credentials }
}

export interface SaveEmailProviderConfigInput {
  provider: EmailProvider
  /**
   * Modèle multi-champ (contrat §2.2). Sentinelle '****'/'' PAR CHAMP secret
   * → préserve la valeur stockée pour ce champ. Un champ ABSENT de
   * `credentials` n'est ni écrit ni effacé — pour un fournisseur multi-champ,
   * l'appelant DOIT fournir tous les champs à conserver (valeur réelle ou
   * sentinelle), cf. contrat §4.2 (le PUT envoie l'objet `credentials`
   * complet). `credentials` absent (provider 'smtp') → aucune écriture des
   * credentials stockés (comportement historique préservé).
   */
  credentials?: Record<string, string>
}

/**
 * Sauvegarde provider (+ credentials chiffrés par champ secret). Sentinelle
 * '****'/'' PAR CHAMP → préserve la valeur stockée (chiffrée) pour ce champ,
 * SANS round-trip crypto (copie brute de la valeur existante — même logique
 * que la reprise de migration 040). Écritures SÉQUENTIELLES, credentials
 * d'abord : si le second write échoue, l'état résiduel est « credentials
 * posés, provider inchangé » (inerte) plutôt que « provider=resend sans
 * credentials » (config déchirée visible). Pas de transaction : parité de
 * rigueur avec settings.db (une requête par write), l'appelant reçoit
 * l'erreur (pas de faux 200) et peut re-soumettre.
 */
export async function saveEmailProviderConfig(
  data: SaveEmailProviderConfigInput,
  secretFields: SecretFieldsResolver = defaultSecretFields,
): Promise<void> {
  if (data.credentials) {
    const secrets = new Set(secretFields(data.provider))
    const needsExisting = Object.entries(data.credentials).some(([field, value]) => secrets.has(field) && FIELD_SENTINELS.includes(value))
    // Défense en profondeur (durcissement revue B1 — sentinelle scopée au
    // provider, contrat §7.7) : le blob `email_api_credentials` stocké
    // n'appartient au provider qu'on écrit QUE si le provider STOCKÉ (lu ici)
    // est le MÊME que `data.provider`. Sans ce garde-fou, un switch
    // resend→mailjet avec `apiKey='****'` réinjecterait la clé Resend sous
    // Mailjet (les deux partagent le nom de champ `apiKey`) — le contrôleur
    // fait déjà ce garde-fou en amont (résolution scopée), ceci est une
    // seconde ligne de défense indépendante de l'appelant.
    let existing: Record<string, string> = {}
    if (needsExisting) {
      const providerResult = await query(`SELECT value FROM app_config WHERE key = $1`, [PROVIDER_KEY])
      const storedProvider = normalizeProvider(providerResult.rows[0]?.value)
      existing = storedProvider === data.provider ? await readRawStoredCredentials(data.provider) : {}
    }

    const toStore: Record<string, string> = {}
    for (const [field, value] of Object.entries(data.credentials)) {
      const isSecret = secrets.has(field)
      if (isSecret && FIELD_SENTINELS.includes(value)) {
        if (existing[field] !== undefined) toStore[field] = existing[field]
        continue // rien de stocké pour ce champ → omis (mêmes garanties que l'ancien apiKey undefined)
      }
      toStore[field] = isSecret ? encrypt(value) : value
    }

    await query(
      `INSERT INTO app_config (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [CREDENTIALS_KEY, JSON.stringify(toStore)]
    )
  }

  await query(
    `INSERT INTO app_config (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [PROVIDER_KEY, data.provider]
  )
}

/**
 * Supprime provider + credentials → retour au défaut 'smtp' (ligne absente =
 * normalizeProvider → 'smtp'). `email_api_key` (legacy) n'est PAS supprimé —
 * rollback à portée limitée (contrat §2.2/§7.4). Appelé avec
 * clearSmtpSettings par le DELETE admin (réinitialisation complète de la
 * config email).
 */
export async function clearEmailProviderConfig(): Promise<void> {
  await query(
    `DELETE FROM app_config WHERE key = ANY($1::text[])`,
    [[PROVIDER_KEY, CREDENTIALS_KEY]]
  )
}
