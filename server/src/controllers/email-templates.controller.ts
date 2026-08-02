import { ERROR_CODES } from '@timepick/shared'
import type { Request, Response } from 'express'
import {
  getEmailTemplateView,
  applyEmailTemplatePatch,
  resetAllEmailTemplates,
  MalformedSystemTemplateError,
} from '../services/email-templates.service'
import { templateKeyParamSchema, pickPatchSchema, testSendBodySchema } from '../validators/email-templates.validator'
import { formatApiError } from '../validators/config.validator'
import { sendTemplateTestEmail } from '../services/email.service'
import { ValidationError } from '../errors/ValidationError'
import { query } from '../db'

export const getEmailTemplateHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const templateKey = templateKeyParamSchema.parse(req.params.templateKey)
    const view = await getEmailTemplateView(templateKey)
    res.json({ data: view })
  } catch (error) {
    console.error('[EmailTemplates] Error fetching template:', error)
    if (error instanceof MalformedSystemTemplateError) {
      res.status(500).json({
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Le corps du template est corrompu — exécutez la rollback puis re-migrer',
        },
      })
      return
    }
    const apiError = formatApiError(error, 'Erreur lors de la récupération du template')
    res.status(apiError.code === ERROR_CODES.VALIDATION_ERROR ? 400 : 500).json({ error: apiError })
  }
}

export const patchEmailTemplateHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const templateKey = templateKeyParamSchema.parse(req.params.templateKey)
    const patch = pickPatchSchema(templateKey).parse(req.body)
    const updated = await applyEmailTemplatePatch(templateKey, patch)
    res.json({ data: updated })
  } catch (error) {
    console.error('[EmailTemplates] Error updating template:', error)
    // Refus de contenu à l'écriture : 400 avec le code montrable porté par
    // l'erreur, pour que l'admin lise QUOI retirer. `formatApiError` ne le sait
    // pas : il replierait un ValidationError non-Zod en 500 INTERNAL_ERROR.
    if (error instanceof ValidationError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      })
      return
    }
    if (error instanceof MalformedSystemTemplateError) {
      res.status(500).json({
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Le corps du template est corrompu — exécutez la rollback puis re-migrer',
        },
      })
      return
    }
    const apiError = formatApiError(error, 'Erreur lors de la mise à jour du template')
    res.status(apiError.code === ERROR_CODES.VALIDATION_ERROR ? 400 : 500).json({ error: apiError })
  }
}

export const resetAllEmailTemplatesHandler = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await resetAllEmailTemplates()
    res.json({ data: result })
  } catch (error) {
    console.error('[EmailTemplates] Error resetting all templates:', error)
    const apiError = formatApiError(error, 'Erreur lors de la réinitialisation globale des modèles')
    res.status(apiError.code === ERROR_CODES.VALIDATION_ERROR ? 400 : 500).json({ error: apiError })
  }
}

export const testSendEmailTemplateHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const templateKey = templateKeyParamSchema.parse(req.params.templateKey)
    const { to } = testSendBodySchema.parse(req.body)
    const { rows } = await query<{ role: string }>(
      'SELECT role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [to],
    )
    const isAdmin = rows[0]?.role === 'admin'
    const result = await sendTemplateTestEmail({ templateKey, to, isAdmin })
    if (result.ok) {
      res.json({ data: { sent: true } })
      return
    }
    if (result.reason === 'no_transport') {
      res.status(503).json({
        error: {
          code: ERROR_CODES.SMTP_NOT_CONFIGURED,
          message:
            "Aucun serveur SMTP n'est configuré. Configurez l'envoi d'emails dans les paramètres.",
        },
      })
      return
    }
    if (result.reason === 'template_not_found') {
      res.status(500).json({
        error: { code: ERROR_CODES.TEMPLATE_NOT_FOUND, message: 'Le template est introuvable.' },
      })
      return
    }
    res.status(502).json({
      error: {
        code: ERROR_CODES.SEND_FAILED,
        message: "L'envoi a échoué. Vérifiez la configuration SMTP.",
      },
    })
  } catch (error) {
    console.error('[EmailTemplates] Error sending test email:', error)
    const apiError = formatApiError(error, "Erreur lors de l'envoi de l'email de test")
    res.status(apiError.code === ERROR_CODES.VALIDATION_ERROR ? 400 : 500).json({ error: apiError })
  }
}
