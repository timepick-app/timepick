import axios from 'axios'
import api from './api'

// Public endpoint lives at /api/auth/emergency-login. We must NOT route it
// through the shared `api` axios instance because that instance's response
// interceptor treats any 401 as "session expired" and clears localStorage —
// which would wipe the admin's existing session just because they typed a
// wrong recovery code. Use a bare axios client for this one call.
const serverBaseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
// 15s timeout — the server deliberately takes ~800ms per request for timing
// equivalence, so a generous cap avoids false failures on slow mobile
// networks while still preventing indefinite hangs.
const publicApi = axios.create({ baseURL: serverBaseURL, timeout: 15_000 })

export interface EmergencyLoginResponse {
  token: string
  user: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
    role: 'admin'
  }
  remainingCodes: number
  isLastCode: boolean
  sessionTtl: number
}

export interface RecoveryCodesStatus {
  remaining: number
  expiresAt: string | null
  lastGeneratedAt: string | null
  emergencyLoginNotified: boolean
}

export interface RegenerateCodesResponse {
  codes: string[]
}

export const emergencyLogin = async (
  email: string,
  code: string
): Promise<EmergencyLoginResponse> => {
  const { data } = await publicApi.post<EmergencyLoginResponse>('/auth/emergency-login', { email, code })
  return data
}

export const getRecoveryCodesStatus = async (): Promise<RecoveryCodesStatus> => {
  const { data } = await api.get<RecoveryCodesStatus>('/admin/recovery-codes/status')
  return data
}

export const regenerateCodes = async (): Promise<RegenerateCodesResponse> => {
  const { data } = await api.post<RegenerateCodesResponse>('/admin/recovery-codes/generate')
  return data
}

export const dismissBanner = async (): Promise<void> => {
  await api.patch('/admin/recovery-codes/dismiss')
}
