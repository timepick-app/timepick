/**
 * Zod validator for the GET /api/admin/editor-context query.
 *
 * Story 26.1 / AC5 — enforces the coupling between `ownerKind` and `ownerId`:
 *   - ownerKind='event'    → ownerId must be a UUID
 *   - ownerKind='template' → ownerId must be one of the 4 known template keys
 *   - ownerKind='brand'    → ownerId must be '1' (singleton)
 *
 * The coupling logic itself lives in `owner-coupling.refine.ts` and is shared
 * verbatim with `shell-parts.validator.ts` (Story 26.2c) so the two endpoints
 * cannot drift on accepted/rejected `(ownerKind, ownerId)` pairs.
 */

import { z } from 'zod'
import { OWNER_KINDS } from '../services/shell-parts.service'
import { TEMPLATE_KEY_LIST } from '../services/render-email.service'
import { ownerKindOwnerIdRefine } from './owner-coupling.refine'

const TEMPLATE_KEY_ENUM = TEMPLATE_KEY_LIST

export const editorContextQuerySchema = z
  .object({
    ownerKind: z.enum(OWNER_KINDS, {
      error: () => `ownerKind must be one of: ${OWNER_KINDS.join(', ')}`,
    }),
    ownerId: z.string().min(1, 'ownerId is required'),
    templateKey: z.enum(TEMPLATE_KEY_ENUM, {
      error: () => `templateKey must be one of: ${TEMPLATE_KEY_ENUM.join(', ')}`,
    }),
  })
  .strict()
  .superRefine(ownerKindOwnerIdRefine)
