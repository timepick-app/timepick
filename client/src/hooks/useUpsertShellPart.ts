/**
 * Story 26-2d — client consumer of `PUT /api/admin/shell-parts` (shipped in
 * Story 26-2c). On success, invalidates two `editor-context` queryKey prefixes
 * so the resolved-shell cache refetches the new `origin` for the impacted
 * block. The wider `['admin', 'editor-context']` prefix is defensive: the
 * TimePick editor mounts a single instance at a time, so the marginal refetch
 * cost is acceptable in exchange for a guaranteed cache miss when several
 * `(ownerKind, ownerId)` tuples coexist in memory (e.g. across tabs).
 *
 * No global `onError` — the consuming component owns the user-facing toast
 * (cf. `LockedShellInfoPanel.handleCustomize` for the pattern).
 *
 * Plan `2026-05-17-shell-parts-persistance-save` — `skipInvalidate` option
 * neutralises the `onSuccess` invalidation when the orchestrator (`handleSave`
 * in `MjmlEditorOverlayInner`) drives a `Promise.allSettled` over multiple
 * mutations. Without this, the 1-3 concurrent `onSuccess` callbacks would
 * each fire an `invalidateQueries`, producing 1-4 refetches that race with
 * `Promise.allSettled` and break the dirty tracker recompute. The orchestrator
 * is responsible for one final `invalidateQueries` after the settled() resolves.
 * Other consumers (`LockedShellInfoPanel`) keep default behaviour (invalidation
 * active) — zero régression.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  upsertShellPart,
  type ShellPart,
  type UpsertShellPartParams,
} from '@/services/shell-parts.service'

export interface UseUpsertShellPartOptions {
  /** When `true`, the `onSuccess` callback does NOT call `invalidateQueries`.
   *  Used by the editor save orchestrator to avoid 1-4 concurrent refetches
   *  during `Promise.allSettled`; the orchestrator runs a single invalidation
   *  itself after all mutations settle. Default `false` (invalidation active). */
  skipInvalidate?: boolean
}

export const useUpsertShellPart = (options: UseUpsertShellPartOptions = {}) => {
  const queryClient = useQueryClient()
  const skipInvalidate = options.skipInvalidate ?? false

  return useMutation<ShellPart, unknown, UpsertShellPartParams>({
    mutationFn: upsertShellPart,
    onSuccess: (_data, variables) => {
      if (skipInvalidate) return
      queryClient.invalidateQueries({
        queryKey: ['admin', 'editor-context', variables.ownerKind, variables.ownerId],
      })
      queryClient.invalidateQueries({
        queryKey: ['admin', 'editor-context'],
      })
    },
  })
}
