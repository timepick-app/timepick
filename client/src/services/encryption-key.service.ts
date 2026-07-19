import api from './api'

export type EncryptionKeySource = 'env' | 'file'

/** Source du transport email détecté par le serveur (cascade buildTransport). */
export type EmailTransportSource = 'db' | 'env' | 'fallback'

export interface SetupEncryptionKeyStatus {
  configured: boolean
  source: EncryptionKeySource
  fingerprint: string
  emailDeliverable: boolean
  /** null quand emailDeliverable est faux (étape SMTP requise). */
  emailTransportSource: EmailTransportSource | null
}

export interface AdminEncryptionKeyStatus {
  source: EncryptionKeySource
  fingerprint: string
}

export const getSetupEncryptionKey = async (): Promise<SetupEncryptionKeyStatus> =>
  (await api.get('/setup/encryption-key')).data.data

export const getAdminEncryptionKey = async (): Promise<AdminEncryptionKeyStatus> =>
  (await api.get('/admin/encryption-key')).data.data

export const revealEncryptionKey = async (): Promise<{ key: string }> =>
  (await api.post('/admin/encryption-key/reveal')).data.data
