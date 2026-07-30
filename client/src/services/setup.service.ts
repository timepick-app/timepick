import api from './api'
import type { SmtpSettings, EmailSettingsPayload } from './settings.service'
import type { OrganizationSettings } from './organization.service'

export const getSetupSmtp = async (): Promise<SmtpSettings> =>
  (await api.get('/setup/smtp')).data.data

export const saveSetupSmtp = async (p: EmailSettingsPayload): Promise<void> => {
  await api.put('/setup/smtp', p)
}

/** Efface la configuration email enregistrée (miroir setup de
 *  `DELETE /api/admin/settings/smtp`). Sortie de secours de l'étape SMTP du
 *  wizard : rend la main au repli local, donc rouvre le saut d'étape. */
export const clearSetupSmtp = async (): Promise<void> => {
  await api.delete('/setup/smtp')
}

export const testSetupSmtp = async (
  p: EmailSettingsPayload & { recipient: string },
): Promise<{ success: boolean; message: string }> =>
  (await api.post('/setup/smtp/test', p)).data

export const createFirstAdmin = async (
  email: string,
  firstName: string,
  lastName?: string,
): Promise<void> => {
  await api.post('/setup/create-admin', { email, firstName, lastName })
}

// `OrganizationSettings` : type partagé, déclaré dans organization.service.ts.

export const getSetupOrganization = async (): Promise<OrganizationSettings> =>
  (await api.get('/setup/organization')).data.data

export const saveSetupOrganization = async (p: { name: string; description?: string }): Promise<void> => {
  await api.put('/setup/organization', p)
}

export const uploadSetupOrganizationLogo = async (file: File): Promise<{ logo: string }> => {
  const formData = new FormData()
  formData.append('logo', file)
  return (
    await api.post('/setup/organization/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  ).data.data
}

export const deleteSetupOrganizationLogo = async (): Promise<void> => {
  await api.delete('/setup/organization/logo')
}
