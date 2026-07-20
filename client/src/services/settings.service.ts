import axios from 'axios'
import api, { type ApiResponse } from './api'

// Public endpoints live at the server root (outside /api). Derive root baseURL from VITE_API_URL.
const serverBaseURL = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '')
const publicApi = axios.create({ baseURL: serverBaseURL })

/**
 * Transport email pluggable — 'brevo' est accepté en DB/client mais REFUSÉ
 * par le validateur serveur (itération suivante).
 */
export type EmailProvider = 'smtp' | 'resend' | 'brevo'

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
  /** '****' si une clé API est stockée côté serveur, '' sinon — jamais la clé réelle */
  emailApiKey: string
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
 * Payload for the Resend (API-based) provider — PUT/POST /admin/settings/smtp[/test]
 * with `provider: 'resend'`. `emailApiKey` may be the sentinel '****' to keep/test
 * the key already stored server-side.
 */
export interface EmailApiProviderPayload {
  provider: 'resend'
  emailApiKey?: string
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
 * Save SMTP settings — payload is provider-discriminated (smtp historique ou resend)
 */
export const saveSmtpSettings = async (payload: EmailSettingsPayload): Promise<{ message: string }> => {
  const { data } = await api.put<ApiResponse<{ message: string }>>('/admin/settings/smtp', payload)
  return data.data
}

/**
 * Test connection with given parameters (smtp or resend)
 * SMTP path: the password must NOT be the sentinel "****" — the backend rejects it.
 * Resend path: the sentinel "****" is accepted — it tests the key already stored.
 */
export const testSmtpConnection = async (payload: EmailSettingsPayload): Promise<SmtpTestResult> => {
  const { data } = await api.post<SmtpTestResult>('/admin/settings/smtp/test', payload)
  return data
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
