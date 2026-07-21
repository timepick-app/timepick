import axios from 'axios'
import api, { type ApiResponse } from './api'

// Public endpoints live at the server root (outside /api). Derive root baseURL from VITE_API_URL.
const serverBaseURL = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '')
const publicApi = axios.create({ baseURL: serverBaseURL })

/**
 * Chantier email-providers — provider email pluggable, entièrement piloté par
 * le catalogue serveur (`GET …/email-providers`, contrat §1/§3.1) : AUCUNE
 * liste de fournisseurs en dur ici. `'smtp'` est la seule valeur connue du
 * client ; tout autre id (brevo, mailjet, scaleway, sweego, resend, ou un
 * fournisseur ajouté plus tard côté serveur) est un simple identifiant de
 * catalogue, jamais codé en dur.
 */
export type EmailProvider = string

/** 'eu' pour les fournisseurs UE, 'us' (ex. resend) — informatif (contrat §3.1). */
export type ProviderRegion = 'eu' | 'us'

/**
 * Champ d'identifiant d'un fournisseur HTTP (contrat §3.1) — `SmtpFields`
 * rend UN composant par `CredentialField`, sans connaître les fournisseurs
 * à l'avance.
 */
export interface CredentialField {
  /** 'apiKey' | 'secretKey' | 'projectId' | 'region' | … */
  key: string
  /** Libellé FR affiché ('Clé API', 'Clé secrète', 'ID de projet', 'Région'). */
  label: string
  /** true → champ masqué + sentinelle '****' + chiffré en DB. */
  secret: boolean
  /** ex. 're_…', 'xkeysib-…' — indicatif, jamais bloquant. */
  placeholder?: string
  /** Aide courte optionnelle. */
  help?: string
  /** Défaut true. */
  required?: boolean
  /** Valeur contrainte (ex. région Scaleway) → rendu `<select>` côté client. */
  options?: { value: string; label: string }[]
}

/** Descripteur d'un fournisseur HTTP tel qu'exposé par le catalogue (contrat §3.1). */
export interface ProviderMeta {
  id: string
  /** Affichage neutre — n'apparaît qu'au 2e niveau du sélecteur (sous-menu). */
  label: string
  region: ProviderRegion
  /** ex. '≈ 300 emails/jour (gratuit)' — informatif. */
  freeTierNote: string
  docsUrl?: string
  credentialFields: CredentialField[]
}

/**
 * SMTP settings as returned by GET /api/admin/settings/smtp
 * Note: smtpPort is a STRING from the database (app_config stores text values)
 */
export interface SmtpSettings {
  smtpHost: string
  smtpPort: string
  smtpSecure: boolean
  smtpUser: string
  smtpPassword: string
  smtpFromName: string
  smtpFromEmail: string
  /** 'smtp' par défaut si absent/inconnu en DB */
  emailProvider: EmailProvider
  /** DÉPRÉCIÉ (compat transition) — '****' si une clé API est stockée côté
   *  serveur, '' sinon (= credentials.apiKey). Préférer `credentials`. */
  emailApiKey: string
  /** Credentials multi-champ du fournisseur actif (contrat §4.1) — secrets
   *  masqués '****'/'', non-secrets en clair. Optionnel pour compat avec
   *  d'anciennes fixtures qui ne le fournissent pas encore. */
  credentials?: Record<string, string>
}

/**
 * SMTP settings payload for PUT /api/admin/settings/smtp
 * Note: smtpPort is a NUMBER in the request (backend Zod validates as number)
 */
export interface SmtpSettingsPayload {
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser?: string
  smtpPassword?: string
  smtpFromName?: string
  smtpFromEmail?: string
}

/**
 * Payload pour un fournisseur HTTP (catalogue, `provider !== 'smtp'`) —
 * PUT/POST /admin/settings/smtp[/test] (contrat §4.2/§4.3). `credentials`
 * peut contenir la sentinelle '****'/'' par champ secret — résolue SCOPÉE
 * au fournisseur stocké côté serveur (jamais de fusion inter-fournisseurs).
 */
export interface EmailApiProviderPayload {
  provider: string
  credentials: Record<string, string>
  smtpFromName?: string
  smtpFromEmail?: string
}

/**
 * Discriminated union accepted by saveSmtpSettings/testSmtpConnection.
 * `provider` is optional and defaults to 'smtp' server-side when absent.
 */
export type EmailSettingsPayload = ({ provider?: 'smtp' } & SmtpSettingsPayload) | EmailApiProviderPayload

/**
 * Response from the SMTP test endpoint
 */
export interface SmtpTestResult {
  success: boolean
  message: string
}

/**
 * Fetch current SMTP settings
 */
export const getSmtpSettings = async (): Promise<SmtpSettings> => {
  const { data } = await api.get<ApiResponse<SmtpSettings>>('/admin/settings/smtp')
  return data.data
}

/**
 * Save SMTP settings — payload provider-discriminated (SMTP historique ou fournisseur HTTP du catalogue)
 */
export const saveSmtpSettings = async (payload: EmailSettingsPayload): Promise<{ message: string }> => {
  const { data } = await api.put<ApiResponse<{ message: string }>>('/admin/settings/smtp', payload)
  return data.data
}

/**
 * Test connection with given parameters (smtp or a catalog HTTP provider)
 * SMTP path: the password must NOT be the sentinel "****" — the backend rejects it.
 * HTTP provider path: the sentinel "****" is accepted per field — it tests the value already stored.
 */
export const testSmtpConnection = async (payload: EmailSettingsPayload): Promise<SmtpTestResult> => {
  const { data } = await api.post<SmtpTestResult>('/admin/settings/smtp/test', payload)
  return data
}

/**
 * Catalogue des fournisseurs email HTTP (contrat §1/§3.1) — AUCUN secret,
 * ordre EU-first/resend-last figé côté serveur. `variant` sélectionne
 * l'endpoint : `'admin'` (authentifié) ou `'setup'` (wizard, public gated).
 * Source unique de vérité côté client — aucun fournisseur/champ en dur.
 */
export const getEmailProvidersCatalog = async (variant: 'admin' | 'setup' = 'admin'): Promise<ProviderMeta[]> => {
  const path = variant === 'setup' ? '/setup/email-providers' : '/admin/settings/email-providers'
  const { data } = await api.get<ApiResponse<ProviderMeta[]>>(path)
  return data.data
}

/**
 * Clear all SMTP settings (DELETE /api/admin/settings/smtp).
 * Reverts the server to the env/local-interceptor fallback.
 */
export const clearSmtpSettings = async (): Promise<void> => {
  await api.delete('/admin/settings/smtp')
}

/**
 * Admin health response — detailed DB + SMTP status
 */
export interface AdminHealthResponse {
  status: 'ok' | 'degraded'
  timestamp: string
  services: {
    database: { status: 'ok' | 'error' }
    smtp: { status: 'ok' | 'error' | 'unknown'; healthy: boolean | null }
  }
}

/**
 * Public health response — binary SMTP status
 */
export interface PublicHealthResponse {
  status: 'ok' | 'degraded'
  timestamp: string
  services: { smtp: 'ok' | 'degraded' }
}

/**
 * Admin health — detailed status (requires admin auth)
 */
export const getAdminHealth = async (): Promise<AdminHealthResponse> => {
  const { data } = await api.get<AdminHealthResponse>('/admin/health')
  return data
}

/**
 * Public health — binary status (no auth)
 */
export const getPublicHealth = async (): Promise<PublicHealthResponse> => {
  const { data } = await publicApi.get<PublicHealthResponse>('/health')
  return data
}
