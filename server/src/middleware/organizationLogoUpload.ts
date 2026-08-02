import { ERROR_CODES } from '@timepick/shared'
import type { Request, Response, NextFunction } from 'express'
import multer, { MulterError } from 'multer'

/**
 * Upload middleware partagé par les deux routes logo d'organisation
 * (`/api/admin/settings/organization/logo` et le miroir `/api/setup/...`) —
 * chantier A1. Même profil que l'upload email (`uploads.routes.ts`) :
 * memoryStorage, 5 MB.
 */
export const organizationLogoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

/**
 * Error handler Multer à monter en fin de routeur (`router.use(...)`) —
 * LIMIT_FILE_SIZE → 413, autre erreur Multer → 400, tout le reste suit `next`.
 */
export const organizationLogoMulterErrorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'Fichier trop volumineux (max 5 Mo)', code: ERROR_CODES.FILE_TOO_LARGE })
    return
  }
  if (err instanceof MulterError) {
    console.error('[Organization] Multer error:', err)
    res.status(400).json({ error: 'Erreur upload — fichier invalide', code: ERROR_CODES.UPLOAD_INVALID_FILE })
    return
  }
  next(err)
}
