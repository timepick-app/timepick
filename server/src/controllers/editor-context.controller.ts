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
 *
 * Surcharge paresseuse (2026-11-14) — pour `ownerKind=event`, la réponse porte
 * aussi `parent: { header, footer, mjBody }` : la cascade résolue SANS le niveau
 * événement (`template > brand > hardcoded`). L'éditeur compare le canvas à ce
 * parent au save pour décider s'il écrit une surcharge (divergence) ou supprime
 * celle qui existe (retour au parent). Même résolveur, même `brand.logoUrl` :
 * le re-couplage du logo d'en-tête est identique des deux côtés, sinon la
 * comparaison serait toujours fausse et chaque save créerait une surcharge.
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

    const isEvent = query.ownerKind === 'event'
    const [resolved, parent] = await Promise.all([
      resolveShellParts({
        templateKey: query.templateKey,
        eventId: isEvent ? query.ownerId : undefined,
        brand: { logoUrl: brand.logoUrl },
      }),
      isEvent
        ? resolveShellParts({ templateKey: query.templateKey, brand: { logoUrl: brand.logoUrl } })
        : null,
    ])

    res.json({
      data: parent
        ? { ...resolved, parent: { header: parent.header, footer: parent.footer, mjBody: parent.mjBody } }
        : resolved,
    })
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
