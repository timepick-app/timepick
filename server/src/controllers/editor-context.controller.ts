/**
 * GET /api/admin/editor-context — resolves the 3-block shell (header, body,
 * footer) along the cascade event → template → brand → hardcoded fallback.
 * Consumed by the GrapesJS editor (story 26.2 / S2) to know which row each
 * block came from and whether to lock or expose the « Reset » action.
 *
 * Story 26.1 / AC5.
 *
 * Plan 1 du 2026-05-22 — étend la réponse avec `mjBody: { attrs, origin }` :
 * attributs (background-color, padding-top, padding-bottom) du <mj-body>
 * racine, résolus via la même cascade. La projection JSON reste tel-quel
 * (spread complet de `resolvedShell`) ; les clients qui n'ont pas connaissance
 * de `mjBody` ignorent simplement la clé.
 */

import { ERROR_CODES } from '@timepick/shared'
import type { Request, Response } from 'express'
import { editorContextQuerySchema } from '../validators/editor-context.validator'
import { formatApiError } from '../validators/config.validator'
import { eventService } from '../services/event.service'
import { NotFoundError } from '../errors/NotFoundError'
import { EmailBrandSettingsNotFoundError } from '../db/email-brand-settings.db'
import { getEmailBrandSettingsCached } from '../lib/email-brand-cache'
import {
  resolveShellParts,
  ShellResolverError,
  TemplateBodyMissingError,
} from '../services/shell-resolver.service'

export const getEditorContextHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const query = editorContextQuerySchema.parse(req.query)

    if (query.ownerKind === 'event') {
      // 404 surface: tolerated as a typed throw from eventService.getEventById
      await eventService.getEventById(query.ownerId)
    }

    const brand = await getEmailBrandSettingsCached()

    const resolved = await resolveShellParts({
      templateKey: query.templateKey,
      eventId: query.ownerKind === 'event' ? query.ownerId : undefined,
      brand: { logoUrl: brand.logoUrl },
    })

    res.json({ data: resolved })
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({
        error: { code: error.code, message: error.message },
      })
      return
    }
    if (error instanceof TemplateBodyMissingError) {
      // Mapped to 500 INTERNAL_ERROR (not 404): the row is supposed to exist
      // post-migration 006; its absence is a DB-corruption incident, not a
      // client-side "resource not found". Cohérent avec EmailBrandSettingsNotFoundError.
      res.status(500).json({
        error: { code: ERROR_CODES.INTERNAL_ERROR, message: error.message },
      })
      return
    }
    if (error instanceof EmailBrandSettingsNotFoundError) {
      res.status(500).json({
        error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'email_brand_settings singleton is missing — re-run migration 006' },
      })
      return
    }
    if (error instanceof ShellResolverError) {
      res.status(500).json({
        error: { code: ERROR_CODES.INTERNAL_ERROR, message: error.message },
      })
      return
    }

    console.error('[EditorContext] Error resolving context:', error)
    const apiError = formatApiError(error, 'Erreur lors de la résolution du contexte éditeur')
    res.status(apiError.code === ERROR_CODES.VALIDATION_ERROR ? 400 : 500).json({ error: apiError })
  }
}
