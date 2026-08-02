import { ERROR_CODES } from '@timepick/shared'
import type { Request, Response } from 'express'
import { getEncryptionKeySource, fingerprintKey } from '../utils/secret-bootstrap'

/**
 * GET /api/admin/encryption-key
 * Statut de la clé de chiffrement pour le panneau admin Paramètres → Sécurité
 * (source + empreinte — jamais la clé brute).
 */
export const getAdminEncryptionKeyStatus = (_req: Request, res: Response): void => {
  const source = getEncryptionKeySource()
  const key = process.env.ENCRYPTION_KEY
  res.json({ data: { source, fingerprint: key ? fingerprintKey(key) : '' } })
}

/**
 * POST /api/admin/encryption-key/reveal
 * Révèle la clé brute — uniquement quand elle provient du fichier généré
 * (`source==='file'`). Une clé fournie en variable d'environnement n'est
 * jamais révélée via l'API (403 `KEY_ENV_MANAGED`), posture B (§12 · D1).
 */
export const revealAdminEncryptionKey = (_req: Request, res: Response): void => {
  if (getEncryptionKeySource() !== 'file') {
    res.status(403).json({
      error: {
        code: ERROR_CODES.KEY_ENV_MANAGED,
        message: "La clé est gérée via une variable d'environnement et ne peut pas être révélée.",
      },
    })
    return
  }

  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    res.status(500).json({ error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Clé de chiffrement introuvable.' } })
    return
  }

  res.json({ data: { key } })
}
