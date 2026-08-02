import { ERROR_CODES } from '@timepick/shared'
import express, { Router, Request, Response, NextFunction } from 'express'
import multer, { MulterError } from 'multer'
import rateLimit from 'express-rate-limit'
import { requireAdmin } from '../middleware/adminAuth'
import {
  processEmailImage,
  UnsupportedImageError,
} from '../services/email-upload.service'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

const uploadLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans une minute' },
})

router.post(
  '/email-image',
  uploadLimiter,
  requireAdmin,
  upload.single('image'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'Aucun fichier reçu. Sélectionnez un fichier, puis réessayez.', code: ERROR_CODES.NO_FILE_RECEIVED })
      return
    }
    if (req.file.size === 0) {
      res.status(400).json({ error: 'Ce fichier est vide. Choisissez un autre fichier.', code: ERROR_CODES.EMPTY_FILE })
      return
    }

    try {
      // F1 fix: the driver returns an ABSOLUTE URL so the asset works in the
      // Aperçu iframe (sandboxed, opaque origin) AND in real email clients (no
      // base URL). The local driver prefers PUBLIC_BASE_URL, falling back to the
      // request origin passed here; the s3 driver uses S3_PUBLIC_BASE_URL.
      const result = await processEmailImage(
        req.file.buffer,
        `${req.protocol}://${req.get('host')}`,
      )
      res.json({
        data: [
          {
            src: result.src,
            type: 'image',
            width: result.width,
            height: result.height,
          },
        ],
      })
    } catch (err) {
      if (err instanceof UnsupportedImageError) {
        res.status(415).json({ error: err.message, code: ERROR_CODES.UNSUPPORTED_IMAGE })
        return
      }
      console.error('[EmailUpload] Unexpected error:', err)
      res.status(500).json({ error: "Erreur lors du traitement de l'image" })
    }
  }
)

router.use((err: unknown, _req: express.Request, res: express.Response, _next: NextFunction) => {
  if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Fichier trop volumineux (max 5 Mo)', code: ERROR_CODES.FILE_TOO_LARGE })
  }
  if (err instanceof MulterError) {
    console.error('[EmailUpload] Multer error:', err)
    return res.status(400).json({ error: 'Erreur upload — fichier invalide', code: ERROR_CODES.UPLOAD_INVALID_FILE })
  }
  console.error('[EmailUpload] Unhandled error:', err)
  return res.status(500).json({ error: 'Erreur upload' })
})

export default router
