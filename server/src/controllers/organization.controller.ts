import type { Request, Response } from 'express'
import { ERROR_CODES } from '@timepick/shared'
import {
  getOrganizationSettings,
  saveOrganizationSettings,
  swapOrganizationLogo,
} from '../services/organization.service'
import {
  processOrganizationLogo,
  deleteOrganizationLogoFile,
  UnsupportedOrganizationLogoError,
} from '../services/organization-logo.service'
import { organizationSettingsSchema } from '../validators/organization.validator'
import { formatApiError } from '../validators/config.validator'

/**
 * GET /api/public/organization, /api/admin/settings/organization and the
 * /api/setup/organization mirror — one handler, the DTO IS the public shape.
 * Non-leak contract: returns EXACTLY the 4 fields of `OrganizationSettings`,
 * destructured explicitly rather than spread so a future field added to the
 * service DTO doesn't silently leak to the unauthenticated route. Split into
 * a separate admin handler the day the admin view exposes more than this.
 */
export const getOrganizationHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    const { name, logo, description, homepageFacade } = await getOrganizationSettings()
    res.json({ data: { name, logo, description, homepageFacade } })
  } catch (error) {
    console.error('[Organization] Error fetching settings:', error)
    res.status(500).json({
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: "Erreur lors de la récupération de l'organisation" },
    })
  }
}

/**
 * PUT /api/admin/settings/organization (+ `/api/setup/organization` mirror)
 */
export const putOrganizationSettingsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = organizationSettingsSchema.parse(req.body)
    const settings = await saveOrganizationSettings(validated)
    res.json({ data: settings })
  } catch (error) {
    console.error('[Organization] Error saving settings:', error)
    const apiError = formatApiError(error, "Erreur lors de la sauvegarde des paramètres de l'organisation")
    const statusCode = apiError.code === 'VALIDATION_ERROR' ? 400 : 500
    res.status(statusCode).json({ error: apiError })
  }
}

/**
 * POST /api/admin/settings/organization/logo (+ `/api/setup/organization/logo` mirror)
 *
 * multipart field `logo` (multer memoryStorage, 5 MB cap enforced by the router).
 * Error shape mirrors `uploads.routes.ts`/`email-upload.service.ts` (plain-string
 * `{ error }`) since this handler's failure modes are the same file-validation
 * ones, not settings validation.
 */
export const uploadOrganizationLogoHandler = async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'Aucun fichier reçu. Sélectionnez un fichier, puis réessayez.', code: ERROR_CODES.NO_FILE_RECEIVED })
    return
  }
  if (req.file.size === 0) {
    res.status(400).json({ error: 'Ce fichier est vide. Choisissez un autre fichier.', code: ERROR_CODES.EMPTY_FILE })
    return
  }

  try {
    // Traitement long (sharp + stockage) délibérément AVANT la section
    // critique : on ne tient jamais un verrou de ligne pendant une I/O.
    const logoUrl = await processOrganizationLogo(
      req.file.buffer,
      `${req.protocol}://${req.get('host')}`,
    )
    const previousLogo = await swapOrganizationLogo(logoUrl)

    if (previousLogo) {
      try {
        await deleteOrganizationLogoFile(previousLogo)
      } catch (cleanupErr) {
        console.warn('[Organization] Previous logo cleanup failed:', previousLogo, cleanupErr)
      }
    }

    res.json({ data: { logo: logoUrl } })
  } catch (error) {
    if (error instanceof UnsupportedOrganizationLogoError) {
      res.status(415).json({ error: error.message, code: ERROR_CODES.UNSUPPORTED_IMAGE })
      return
    }
    console.error('[Organization] Unexpected error uploading logo:', error)
    res.status(500).json({ error: 'Erreur lors du traitement du logo' })
  }
}

/**
 * DELETE /api/admin/settings/organization/logo (+ `/api/setup/organization/logo` mirror)
 *
 * Clears `organization_logo` and best-effort deletes the underlying file — a
 * cleanup failure never blocks the 204 (mirrors `resetEmailBrandSettingsHandler`).
 */
export const deleteOrganizationLogoHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    const previousLogo = await swapOrganizationLogo('')

    if (previousLogo) {
      try {
        await deleteOrganizationLogoFile(previousLogo)
      } catch (cleanupErr) {
        console.warn('[Organization] Logo cleanup failed:', previousLogo, cleanupErr)
      }
    }

    res.status(204).send()
  } catch (error) {
    console.error('[Organization] Error deleting logo:', error)
    res.status(500).json({
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Erreur lors de la suppression du logo' },
    })
  }
}
