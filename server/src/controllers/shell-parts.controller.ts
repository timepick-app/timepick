/**
 * PUT /api/admin/shell-parts/:ownerKind/:ownerId/:partKind — upserts a
 * single shell_parts row after Zod path + body validation plus the
 * structural / partKind-coherence / mj-column-presence / whitelist checks
 * in `validateShellContentPart`.
 *
 * Story 26.2c / AC1-AC7. This endpoint is the server-side barrier against
 * a compromised client or malicious script (cf. POC findings.md § Finding
 * #9). It mirrors the patterns established by `editor-context.controller.ts`
 * (Story 26.1): Zod path validation with the same `ownerKindOwnerIdRefine`,
 * eager 404 when ownerKind=event and the event row is missing, envelope
 * `{ data }` on success, structured logging.
 *
 * Logging hygiene
 * - `contentMjml` is never logged (PII / log volume — AC7); only
 *   `contentMjmlLength` is included.
 * - Content-validation failures are logged with an `errorKind` category
 *   rather than the raw error message, so user-supplied attribute names or
 *   `data-part-kind` values cannot leak into the log stream.
 * - Client errors (Zod 400, 404) log at `console.warn`/`console.info`;
 *   only true server-side failures use `console.error`.
 *
 * Concurrency
 * - No optimistic locking (no `If-Unmodified-Since` / ETag). Two concurrent
 *   PUTs on the same `(ownerKind, ownerId, partKind)` resolve as
 *   last-write-wins via the underlying `INSERT … ON CONFLICT DO UPDATE`.
 *   Admin users are trusted and concurrent edits of the same block are
 *   considered unlikely; documented here so a future caller can challenge
 *   the assumption rather than discover it the hard way.
 */

import type { Request, Response } from 'express'
import { ZodError } from 'zod'
import {
  shellPartsBodySchema,
  shellPartsPathSchema,
} from '../validators/shell-parts.validator'
import { validateShellContentPart } from '../validators/shell-content.validator'
import { formatApiError } from '../validators/config.validator'
import { eventService } from '../services/event.service'
import { NotFoundError } from '../errors/NotFoundError'
import { deleteShellPart, upsertShellPart } from '../services/shell-parts.service'

/**
 * Maps a `validateShellContentPart` error message to a stable category so
 * logs remain useful for monitoring without echoing user-supplied strings.
 * The client still receives the precise error message via the response body.
 */
function categorizeContentError(error: string): string {
  if (error.startsWith('contentMjml is empty')) return 'empty_content'
  if (error.startsWith('MJML parse failed')) return 'parse_error'
  if (error.includes('exactly one <mj-section> root')) return 'section_count'
  if (error.includes('exactly one <mj-body> root')) return 'mj_body_count'
  if (error.includes('must declare data-part-kind')) return 'missing_part_kind'
  if (error.startsWith('data-part-kind mismatch')) return 'part_kind_mismatch'
  if (error.includes('must contain at least one <mj-column>')) return 'empty_section'
  if (error.includes('must have no children')) return 'invalid_mj_body_children'
  if (error.startsWith('Invalid attribute on <mj-body>')) return 'invalid_mj_body_attrs'
  if (error.startsWith('Forbidden component')) return 'forbidden_component'
  if (error.startsWith('Invalid attribute')) return 'invalid_attribute'
  return 'unknown'
}

export const putShellPartHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const path = shellPartsPathSchema.parse(req.params)
    const body = shellPartsBodySchema.parse(req.body)

    if (path.ownerKind === 'event') {
      // throws NotFoundError when the event row is missing → caught below
      await eventService.getEventById(path.ownerId)
    }

    const contentResult = validateShellContentPart(body.contentMjml, path.partKind)
    if (!contentResult.ok) {
      console.warn('[ShellParts][PUT] validation failed', {
        ownerKind: path.ownerKind,
        ownerId: path.ownerId,
        partKind: path.partKind,
        errorCode: 'VALIDATION_ERROR',
        errorKind: categorizeContentError(contentResult.error),
        contentMjmlLength: body.contentMjml.length,
      })
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: contentResult.error } })
      return
    }

    const shellPart = await upsertShellPart({
      ownerKind: path.ownerKind,
      ownerId: path.ownerId,
      partKind: path.partKind,
      contentMjml: body.contentMjml,
    })

    res.json({ data: shellPart })
  } catch (error) {
    if (error instanceof NotFoundError) {
      console.info('[ShellParts][PUT] event not found', {
        ownerKind: req.params.ownerKind,
        ownerId: req.params.ownerId,
        partKind: req.params.partKind,
      })
      res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: error.message } })
      return
    }

    if (error instanceof ZodError) {
      console.warn('[ShellParts][PUT] Zod validation failed', {
        ownerKind: req.params.ownerKind,
        ownerId: req.params.ownerId,
        partKind: req.params.partKind,
        issueCount: error.issues.length,
      })
      const apiError = formatApiError(error, "Erreur lors de l'enregistrement du bloc")
      res.status(400).json({ error: apiError })
      return
    }

    console.error('[ShellParts][PUT] unexpected error', error)
    const apiError = formatApiError(
      error,
      "Erreur lors de l'enregistrement du bloc",
    )
    res
      .status(apiError.code === 'VALIDATION_ERROR' ? 400 : 500)
      .json({ error: apiError })
  }
}

/**
 * DELETE /api/admin/shell-parts/:ownerKind/:ownerId/:partKind — removes the
 * surcharge for a single tuple. Reuses `shellPartsPathSchema` from the PUT
 * (mêmes coupling rules, mêmes 3 ownerKinds), keeps an eager 404 when
 * ownerKind=event and the event row is missing.
 *
 * Response shape — **204 No Content** in all cases (row existed and was
 * deleted, OR row was already absent). DELETE is idempotent at the REST
 * boundary: a future call with the same path returns 204 too. The service
 * still distinguishes existed/absent via its return value for tests, but
 * the wire format hides that detail so the orchestrator side (handleSave)
 * can route on `dirty && matchesCascade && origin===ownerKind` without
 * a separate 200/404 branch.
 *
 * Brand symétrie — accepts ownerKind=brand by validator design. The « no
 * brand editing via canvas » rule lives in the UI (EmailBrandSettingsPanel
 * est un formulaire séparé) — gating UI-only, documenté à la conception de la
 * persistance des shell parts (2026-05-17).
 */
export const deleteShellPartHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const path = shellPartsPathSchema.parse(req.params)

    if (path.ownerKind === 'event') {
      await eventService.getEventById(path.ownerId)
    }

    await deleteShellPart({
      ownerKind: path.ownerKind,
      ownerId: path.ownerId,
      partKind: path.partKind,
    })

    res.status(204).send()
  } catch (error) {
    if (error instanceof NotFoundError) {
      console.info('[ShellParts][DELETE] event not found', {
        ownerKind: req.params.ownerKind,
        ownerId: req.params.ownerId,
        partKind: req.params.partKind,
      })
      res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: error.message } })
      return
    }

    if (error instanceof ZodError) {
      console.warn('[ShellParts][DELETE] Zod validation failed', {
        ownerKind: req.params.ownerKind,
        ownerId: req.params.ownerId,
        partKind: req.params.partKind,
        issueCount: error.issues.length,
      })
      const apiError = formatApiError(error, 'Erreur lors de la suppression du bloc')
      res.status(400).json({ error: apiError })
      return
    }

    console.error('[ShellParts][DELETE] unexpected error', error)
    const apiError = formatApiError(error, 'Erreur lors de la suppression du bloc')
    res
      .status(apiError.code === 'VALIDATION_ERROR' ? 400 : 500)
      .json({ error: apiError })
  }
}
