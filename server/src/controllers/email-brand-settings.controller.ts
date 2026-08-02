import { ERROR_CODES } from '@timepick/shared'
import type { Request, Response } from 'express'
import {
  getEmailBrandSettings,
  updateEmailBrandSettings,
  resetEmailBrandToFactory,
  EmailBrandSettingsNotFoundError,
} from '../db/email-brand-settings.db'
import { deleteEmailImage, PathOutsideUploadsRootError } from '../services/email-upload.service'
import { emailBrandSettingsPatchSchema } from '../validators/email-brand-settings.validator'
import { formatApiError } from '../validators/config.validator'
import { invalidateEmailBrandCache } from '../lib/email-brand-cache'

export const getEmailBrandSettingsHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    const settings = await getEmailBrandSettings()
    res.json({ data: settings })
  } catch (error) {
    console.error('[EmailBrandSettings] Error fetching:', error)
    const apiError = formatApiError(error, 'Erreur lors de la récupération des paramètres de marque')
    res.status(500).json({ error: apiError })
  }
}

export const patchEmailBrandSettingsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = emailBrandSettingsPatchSchema.parse(req.body)
    const updated = await updateEmailBrandSettings(validated)
    invalidateEmailBrandCache()
    res.json({ data: updated })
  } catch (error) {
    if (error instanceof EmailBrandSettingsNotFoundError) {
      console.error('[EmailBrandSettings] Singleton row missing:', error)
      res.status(500).json({ error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Erreur lors de la mise à jour des paramètres de marque' } })
      return
    }
    const validationError = formatApiError(error, 'Erreur lors de la mise à jour des paramètres de marque')
    const statusCode = validationError.code === ERROR_CODES.VALIDATION_ERROR ? 400 : 500
    res.status(statusCode).json({ error: validationError })
  }
}

export const resetEmailBrandSettingsHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    const { previousLogoUrl, dto } = await resetEmailBrandToFactory()
    invalidateEmailBrandCache()

    if (previousLogoUrl !== null) {
      try {
        await deleteEmailImage(previousLogoUrl)
      } catch (cleanupErr) {
        if (cleanupErr instanceof PathOutsideUploadsRootError) {
          console.error(
            '[EmailBrand] Path-traversal blocked on logo_url cleanup:',
            previousLogoUrl,
            cleanupErr,
          )
        } else {
          console.warn('[EmailBrand] Logo cleanup failed:', previousLogoUrl, cleanupErr)
        }
      }
    }

    res.status(200).json({ data: dto })
  } catch (error) {
    if (error instanceof EmailBrandSettingsNotFoundError) {
      console.error('[EmailBrandSettings] Singleton row missing on reset:', error)
      res.status(500).json({
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: "Erreur lors de la réinitialisation de l'identité visuelle",
        },
      })
      return
    }
    console.error('[EmailBrandSettings] Error resetting:', error)
    const apiError = formatApiError(error, "Erreur lors de la réinitialisation de l'identité visuelle")
    res.status(500).json({ error: apiError })
  }
}
