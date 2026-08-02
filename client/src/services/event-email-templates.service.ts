/**
 * Per-event email template API client (Story 24-3 / E3.S3 — FR56-FR60).
 *
 * Wraps the four `/api/admin/events/:id/email-template[/reset|/preview]`
 * endpoints shipped by Story 24-2 (read/patch/reset) and Story 24-3 (preview).
 * Mirrors the camelCase + envelope-unwrap convention of `email-templates.service.ts`.
 *
 * The `EventEmailTemplate` DTO mirrors the server's `EventEmailTemplateView`
 * (server/src/services/event-email-template.service.ts) — the two shapes must
 * stay in sync; there is no shared types package between client and server.
 */
import api, { type ApiResponse } from './api'
import type { SubjectVariable } from '@/lib/email-subject'

export interface EventEmailTemplate {
  eventId: string
  templateKey: 'invitation'
  bodyMjml: string
  defaultBodyMjml: string
  isCustom: boolean
  /**
   * Surcharge d'objet DE CET ÉVÉNEMENT. `null` = hérite. Distinct de
   * `isCustom`, qui agrège corps et coque : l'objet a son propre héritage.
   */
  subject: string | null
  /** L'objet dont cet événement hérite (modèle personnalisé, sinon usine). */
  inheritedSubject: string
  subjectVariables: SubjectVariable[]
  updatedAt: string
}

export interface EventEmailTemplatePatch {
  bodyMjml: string
  /** Absent = ne touche pas ; `null` = revenir à l'héritage. */
  subject?: string | null
}

export interface EventEmailTemplatePreview {
  html: string
  text: string
  /** Objet interpolé, passé par la même cascade que l'envoi réel. */
  subject: string
  templateKey: 'invitation'
  eventId: string
}

export const getEventEmailTemplate = async (
  eventId: string,
): Promise<EventEmailTemplate> => {
  const { data } = await api.get<ApiResponse<EventEmailTemplate>>(
    `/admin/events/${eventId}/email-template`,
  )
  return data.data
}

export const patchEventEmailTemplate = async (
  eventId: string,
  patch: EventEmailTemplatePatch,
): Promise<EventEmailTemplate> => {
  const { data } = await api.patch<ApiResponse<EventEmailTemplate>>(
    `/admin/events/${eventId}/email-template`,
    patch,
  )
  return data.data
}

export const resetEventEmailTemplate = async (
  eventId: string,
): Promise<EventEmailTemplate> => {
  const { data } = await api.post<ApiResponse<EventEmailTemplate>>(
    `/admin/events/${eventId}/email-template/reset`,
  )
  return data.data
}

export const previewEventEmailTemplate = async (
  eventId: string,
): Promise<EventEmailTemplatePreview> => {
  const { data } = await api.post<ApiResponse<EventEmailTemplatePreview>>(
    `/admin/events/${eventId}/email-template/preview`,
  )
  return data.data
}

// Test-send (Task 46) — envoie l'invitation per-event rendue avec des données
// de démonstration à `to`.
export const testSendEventEmailTemplate = async (
  eventId: string,
  to: string,
): Promise<void> => {
  await api.post(`/admin/events/${eventId}/email-template/test-send`, { to })
}
