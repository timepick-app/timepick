/**
 * Zod validators for `PUT /api/admin/shell-parts/:ownerKind/:ownerId/:partKind`.
 *
 * Story 26.2c / AC2 — path params enforce the coupling between `ownerKind`
 * and `ownerId` (UUID for event, known templateKey for template, '1' for
 * brand singleton). The coupling logic is shared with
 * `editor-context.validator.ts` via the `ownerKindOwnerIdRefine` helper
 * (see `owner-coupling.refine.ts`).
 *
 * For `ownerKind=event`, the path schema also lowercases the ownerId after
 * the superRefine: Postgres `uuid` type compares case-insensitively, but the
 * persisted `varchar`/`text` storage in `shell_parts` would diverge if a
 * client sent an uppercase UUID. Normalising on the boundary prevents two
 * rows (one upper-, one lower-cased) coexisting for the same event.
 *
 * Story 26.2c / AC3 — body schema enforces:
 *   - non-empty `contentMjml`,
 *   - upper size bound (defence against a compromised admin / runaway client),
 *   - no NUL byte (Postgres rejects \\0 in `text`; reject early with a
 *     deterministic 400 rather than letting it surface as a verbose 500).
 *
 * The MJML structural validation (1 `<mj-section>` root + `data-part-kind`
 * coherence + whitelist) lives in `validateShellContentPart()` inside
 * `shell-content.validator.ts`.
 */

import { z } from 'zod'
import { OWNER_KINDS, PART_KINDS } from '../services/shell-parts.service'
import { ownerKindOwnerIdRefine } from './owner-coupling.refine'

// Upper bound on `contentMjml`. 64 KB is roughly an order of magnitude above
// realistic shell-part payloads (a header/footer is typically a few KB of
// MJML). The value is kept under the default `express.json()` body limit
// (100 KB) so the Zod 400 response — not Express's bare 413 — is the
// authoritative refusal observed by callers.
export const CONTENT_MJML_MAX_BYTES = 64_000

export const shellPartsPathSchema = z
  .object({
    ownerKind: z.enum(OWNER_KINDS, {
      error: () => `ownerKind must be one of: ${OWNER_KINDS.join(', ')}`,
    }),
    ownerId: z.string().min(1, 'ownerId is required'),
    partKind: z.enum(PART_KINDS, {
      error: () => `partKind must be one of: ${PART_KINDS.join(', ')}`,
    }),
  })
  .strict()
  .superRefine(ownerKindOwnerIdRefine)
  .transform((data) =>
    data.ownerKind === 'event'
      ? { ...data, ownerId: data.ownerId.toLowerCase() }
      : data,
  )

export const shellPartsBodySchema = z
  .object({
    contentMjml: z
      .string({ error: (issue) => issue.input === undefined ? 'contentMjml is required' : undefined })
      .min(1, 'contentMjml is empty')
      .max(CONTENT_MJML_MAX_BYTES, `contentMjml exceeds size limit (${CONTENT_MJML_MAX_BYTES} bytes)`)
      .regex(/^[^\x00]*$/, 'contentMjml contains a NUL byte'),
  })
  .strict()
