import api, { type ApiResponse } from './api'

export interface EmailBrandSettings {
  logoUrl: string | null
  primaryColor: string
  buttonTextColor: string
  fontFamily: string
  buttonBorderRadius: number
  updatedAt: string
}

export type EmailBrandSettingsPatch = Partial<Omit<EmailBrandSettings, 'updatedAt'>>

export const getEmailBrandSettings = async (): Promise<EmailBrandSettings> => {
  const { data } = await api.get<ApiResponse<EmailBrandSettings>>('/admin/settings/email-brand')
  return data.data
}

export const patchEmailBrandSettings = async (
  patch: EmailBrandSettingsPatch,
): Promise<EmailBrandSettings> => {
  const { data } = await api.patch<ApiResponse<EmailBrandSettings>>(
    '/admin/settings/email-brand',
    patch,
  )
  return data.data
}

export const resetEmailBrandSettings = async (): Promise<EmailBrandSettings> => {
  const { data } = await api.post<ApiResponse<EmailBrandSettings>>(
    '/admin/settings/email-brand/reset',
  )
  return data.data
}
