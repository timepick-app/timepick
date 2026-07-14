import api from './api'
import type { SmtpSettings, SmtpSettingsPayload } from './settings.service'

export const getSetupSmtp = async (): Promise<SmtpSettings> =>
  (await api.get('/setup/smtp')).data.data

export const saveSetupSmtp = async (p: SmtpSettingsPayload): Promise<void> => {
  await api.put('/setup/smtp', p)
}

export const testSetupSmtp = async (
  p: SmtpSettingsPayload & { recipient: string },
): Promise<{ success: boolean; message: string }> =>
  (await api.post('/setup/smtp/test', p)).data

export const createFirstAdmin = async (email: string): Promise<void> => {
  await api.post('/setup/create-admin', { email })
}
