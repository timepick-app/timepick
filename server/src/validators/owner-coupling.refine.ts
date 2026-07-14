/**
 * Shared superRefine block enforcing the coupling between `ownerKind` and
 * `ownerId` across all shell-parts–adjacent validators:
 *
 *   - ownerKind='event'    → ownerId must be a UUID
 *   - ownerKind='template' → ownerId must be one of the known template keys
 *   - ownerKind='brand'    → ownerId must be '1' (singleton)
 *
 * Extracted from the verbatim duplicate that previously lived in
 * `editor-context.validator.ts` and `shell-parts.validator.ts`. The textual
 * drift guard in `shell-parts.validator.test.ts` is now redundant by
 * construction, but kept as a defence-in-depth regression test.
 *
 * Error messages are part of the public contract — see the drift guard test.
 */

import type { RefinementCtx } from 'zod'
import { z } from 'zod'
import { TEMPLATE_KEY_LIST } from '../services/render-email.service'
import { UUID_RE } from '../lib/constants'

interface OwnerCouplingInput {
  ownerKind: 'brand' | 'template' | 'event'
  ownerId: string
}

export function ownerKindOwnerIdRefine(
  data: OwnerCouplingInput,
  ctx: RefinementCtx,
): void {
  if (data.ownerKind === 'event' && !UUID_RE.test(data.ownerId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ownerId'],
      message: 'ownerId must be a valid UUID when ownerKind=event',
    })
  }
  if (
    data.ownerKind === 'template' &&
    !TEMPLATE_KEY_LIST.includes(data.ownerId as (typeof TEMPLATE_KEY_LIST)[number])
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ownerId'],
      message: `ownerId must be a known templateKey when ownerKind=template (got: ${data.ownerId})`,
    })
  }
  if (data.ownerKind === 'brand' && data.ownerId !== '1') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ownerId'],
      message: "ownerId must be '1' when ownerKind=brand (singleton)",
    })
  }
}
