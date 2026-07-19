import type { Request, Response } from 'express'
import { getEncryptionKeySource, fingerprintKey } from '../utils/secret-bootstrap'
import { isEmailDeliverable, getEmailTransportSource } from '../services/email.service'

/**
 * GET /api/setup/encryption-key
 * Statut public de la clé de chiffrement (empreinte uniquement — ne retourne
 * JAMAIS la clé brute) + signal de délivrabilité email (`emailDeliverable`,
 * probe SMTP courte, cf. `isEmailDeliverable()`) et sa source
 * (`emailTransportSource` : 'db' | 'env' | 'fallback', null si non délivrable)
 * consommés par l'étape wizard SMTP pour la rendre sautable-mais-visible avec
 * un message précis sur CE qui a été détecté (A1).
 * Endpoint gated (checkSetupNotDone + rate-limit), consommé par l'étape
 * wizard « Clé de chiffrement ».
 */
export const getSetupEncryptionKeyStatus = async (_req: Request, res: Response): Promise<void> => {
  const source = getEncryptionKeySource()
  const key = process.env.ENCRYPTION_KEY
  const emailDeliverable = await isEmailDeliverable()
  const emailTransportSource = emailDeliverable ? getEmailTransportSource() : null
  res.json({
    data: {
      configured: !!key,
      source,
      fingerprint: key ? fingerprintKey(key) : '',
      emailDeliverable,
      emailTransportSource,
    },
  })
}
