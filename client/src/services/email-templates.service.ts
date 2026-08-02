import api, { type ApiResponse } from './api'
import type { SubjectVariable } from '@/lib/email-subject'

export type TemplateKey =
  | 'invitation'
  | 'magic_link_login'
  | 'reservation_confirmation'
  | 'account_created'
  | 'cancellation_confirmation'
  | 'role_promoted'
  | 'role_demoted'
  | 'unregistration_confirmation'

/**
 * Part « objet » commune aux deux formes de DTO. Le serveur est propriétaire de
 * `subjectVariables` : le client n'entretient PAS sa propre liste de variables
 * autorisées, elle dépend de ce que la fonction d'envoi passe au rendu.
 */
interface SubjectFields {
  /** Personnalisation, ou `null` = objet d'usine. Forme SOURCE, à jetons. */
  subject: string | null
  /** Objet d'usine, forme SOURCE. Point de départ de l'édition. */
  defaultSubject: string
  subjectVariables: SubjectVariable[]
}

export interface InvitationTemplate extends SubjectFields {
  templateKey: 'invitation'
  bodyMjml: string
  defaultBodyMjml: string
  // Lot 3b — présent UNIQUEMENT pour l'invitation : true si la coque (en-tête,
  // mj-body, content-wrapper, ou pied) diffère de l'usine. NE couvre PAS le
  // corps (comparé séparément côté client via bodyMjml !== defaultBodyMjml).
  shellCustomized?: boolean
  updatedAt: string
}

export interface SystemTemplate extends SubjectFields {
  templateKey: Exclude<TemplateKey, 'invitation'>
  introText: string
  signatureText: string
  defaultIntroText: string
  defaultSignatureText: string
  /**
   * `magic_link_login` SEUL : ce modèle a deux objets, choisis à l'envoi sur le
   * rôle du destinataire. Leur PRÉSENCE est le prédicat qui fait apparaître le
   * sélecteur « Membre / Administrateur » dans le popover.
   */
  subjectAdmin?: string | null
  defaultSubjectAdmin?: string
  updatedAt: string
}

// Narrowing helpers: the API contract guarantees that the DTO shape is
// determined by the templateKey, so callers passing a literal key get the
// concrete type back instead of the full union.
export type TemplateForKey<K extends TemplateKey> = K extends 'invitation'
  ? InvitationTemplate
  : SystemTemplate

/** Tri-état par champ : absent = ne touche pas, `null` = efface, chaîne = écrit. */
export interface SubjectPatch {
  subject?: string | null
  subjectAdmin?: string | null
}

export type PatchForKey<K extends TemplateKey> = (K extends 'invitation'
  ? { bodyMjml: string }
  : { introText: string; signatureText: string }) &
  SubjectPatch

export const getEmailTemplate = async <K extends TemplateKey>(
  templateKey: K,
): Promise<TemplateForKey<K>> => {
  const { data } = await api.get<ApiResponse<TemplateForKey<K>>>(
    `/admin/settings/email-templates/${templateKey}`,
  )
  return data.data
}

export const patchEmailTemplate = async <K extends TemplateKey>(
  templateKey: K,
  patch: PatchForKey<K>,
): Promise<TemplateForKey<K>> => {
  const { data } = await api.patch<ApiResponse<TemplateForKey<K>>>(
    `/admin/settings/email-templates/${templateKey}`,
    patch,
  )
  return data.data
}

export interface ResetAllEmailTemplatesResult {
  templatesReset: number
  shellPartsDeleted: number
}

// Global reset: restores the 5 UI bodies + shared design (shell_parts
// owner_kind='template') to factory in one server transaction. Preserves brand
// and events. See POST /admin/settings/email-templates/reset-all.
export const resetAllEmailTemplates = async (): Promise<ResetAllEmailTemplatesResult> => {
  const { data } = await api.post<ApiResponse<ResetAllEmailTemplatesResult>>(
    '/admin/settings/email-templates/reset-all',
  )
  return data.data
}

// Test-send (Task 46) — envoie le template système (ou invitation niveau-template)
// rendu avec des données de démonstration à `to`. Ne renvoie pas de corps utile.
export const testSendEmailTemplate = async (
  templateKey: string,
  to: string,
): Promise<void> => {
  await api.post(`/admin/settings/email-templates/${templateKey}/test-send`, { to })
}
