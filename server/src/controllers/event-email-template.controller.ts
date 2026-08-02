import type { Request, Response } from 'express'
import {
  eventIdParamSchema,
  patchEventEmailTemplateSchema,
} from '../validators/event-email-template.validator'
import {
  getEventEmailTemplateView,
  updateEventEmailTemplate,
  resetEventEmailTemplate,
} from '../services/event-email-template.service'
import { NotFoundError } from '../errors/NotFoundError'
import { ValidationError } from '../errors/ValidationError'
import {
  renderEmail,
  TemplateNotFoundError,
} from '../services/render-email.service'
import { formatApiError } from '../validators/config.validator'
import { query } from '../db'
import { buildPreviewVariables, resolveSubject, sendTemplateTestEmail } from '../services/email.service'
import { testSendBodySchema } from '../validators/email-templates.validator'
import { ERROR_CODES } from '@timepick/shared'

export const readEventEmailTemplateHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const eventId = eventIdParamSchema.parse(req.params.id)
    const view = await getEventEmailTemplateView(eventId)
    res.json({ data: view })
  } catch (error) {
    console.error('[EventEmailTemplate] Error reading template:', error)
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: { code: error.code, message: error.message } })
      return
    }
    if (error instanceof TemplateNotFoundError) {
      res.status(500).json({
        error: {
          code: ERROR_CODES.INVITATION_TEMPLATE_NOT_FOUND,
          message: 'Le template global "invitation" est manquant.',
        },
      })
      return
    }
    const apiError = formatApiError(
      error,
      'Erreur lors de la récupération du template event',
    )
    res.status(apiError.code === ERROR_CODES.VALIDATION_ERROR ? 400 : 500).json({ error: apiError })
  }
}

export const patchEventEmailTemplateHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const eventId = eventIdParamSchema.parse(req.params.id)
    const { bodyMjml, subject } = patchEventEmailTemplateSchema.parse(req.body)
    const view = await updateEventEmailTemplate(eventId, bodyMjml, subject)
    res.json({ data: view })
  } catch (error) {
    console.error('[EventEmailTemplate] Error updating template:', error)
    // Refus de contenu à l'écriture : 400 avec le code montrable porté par
    // l'erreur, pour que l'admin lise QUOI retirer. `formatApiError` ne le sait
    // pas : il replierait un ValidationError non-Zod en 500 INTERNAL_ERROR.
    if (error instanceof ValidationError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      })
      return
    }
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: { code: error.code, message: error.message } })
      return
    }
    if (error instanceof TemplateNotFoundError) {
      res.status(500).json({
        error: {
          code: ERROR_CODES.INVITATION_TEMPLATE_NOT_FOUND,
          message: 'Le template global "invitation" est manquant.',
        },
      })
      return
    }
    const apiError = formatApiError(
      error,
      'Erreur lors de la mise à jour du template event',
    )
    res.status(apiError.code === ERROR_CODES.VALIDATION_ERROR ? 400 : 500).json({ error: apiError })
  }
}

export const resetEventEmailTemplateHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const eventId = eventIdParamSchema.parse(req.params.id)
    const view = await resetEventEmailTemplate(eventId)
    res.json({ data: view })
  } catch (error) {
    console.error('[EventEmailTemplate] Error resetting template:', error)
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: { code: error.code, message: error.message } })
      return
    }
    if (error instanceof TemplateNotFoundError) {
      res.status(500).json({
        error: {
          code: ERROR_CODES.INVITATION_TEMPLATE_NOT_FOUND,
          message: 'Le template global "invitation" est manquant.',
        },
      })
      return
    }
    const apiError = formatApiError(
      error,
      'Erreur lors de la réinitialisation du template event',
    )
    res.status(apiError.code === ERROR_CODES.VALIDATION_ERROR ? 400 : 500).json({ error: apiError })
  }
}

export const previewEventEmailTemplateHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const eventId = eventIdParamSchema.parse(req.params.id)

    const { rows } = await query<{ name: string; description: string | null }>(
      `SELECT name, description FROM events WHERE id = $1`,
      [eventId],
    )
    if (rows.length === 0) {
      throw new NotFoundError('Événement non trouvé', ERROR_CODES.EVENT_NOT_FOUND)
    }

    const variables = buildPreviewVariables({
      eventName: rows[0].name,
      eventDescription: rows[0].description ?? '',
    })
    const { html, text } = await renderEmail({
      templateKey: 'invitation',
      eventId,
      variables,
    })
    // L'objet fait partie de l'aperçu : sans lui, l'aperçu prétend montrer
    // l'e-mail et en cache la partie la plus lue. Interpolé avec les mêmes
    // variables de démonstration que le corps, et passé par la MÊME cascade
    // que l'envoi réel — donc surcharge d'événement comprise.
    const subject = await resolveSubject({ templateKey: 'invitation', eventId, vars: variables })
    res.status(200).json({ data: { html, text, subject, templateKey: 'invitation', eventId } })
  } catch (error) {
    console.error('[EventEmailTemplate] Error previewing template:', error)
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: { code: error.code, message: error.message } })
      return
    }
    if (error instanceof TemplateNotFoundError) {
      res.status(500).json({
        error: {
          code: ERROR_CODES.INVITATION_TEMPLATE_NOT_FOUND,
          message: 'Le template global "invitation" est manquant.',
        },
      })
      return
    }
    const apiError = formatApiError(
      error,
      "Erreur lors de la génération de l'aperçu du template event",
    )
    res.status(apiError.code === ERROR_CODES.VALIDATION_ERROR ? 400 : 500).json({ error: apiError })
  }
}

export const testSendEventEmailTemplateHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const eventId = eventIdParamSchema.parse(req.params.id)
    const { to } = testSendBodySchema.parse(req.body)

    const { rows } = await query<{ name: string; description: string | null }>(
      `SELECT name, description FROM events WHERE id = $1`,
      [eventId],
    )
    if (rows.length === 0) {
      throw new NotFoundError('Événement non trouvé', ERROR_CODES.EVENT_NOT_FOUND)
    }

    const result = await sendTemplateTestEmail({
      templateKey: 'invitation',
      eventId,
      to,
      eventName: rows[0].name,
      eventDescription: rows[0].description ?? '',
    })
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
        error: {
          code: ERROR_CODES.INVITATION_TEMPLATE_NOT_FOUND,
          message: 'Le template global "invitation" est manquant.',
        },
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
    console.error('[EventEmailTemplate] Error sending test email:', error)
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: { code: error.code, message: error.message } })
      return
    }
    const apiError = formatApiError(error, "Erreur lors de l'envoi de l'email de test")
    res.status(apiError.code === ERROR_CODES.VALIDATION_ERROR ? 400 : 500).json({ error: apiError })
  }
}
