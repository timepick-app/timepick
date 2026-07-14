/**
 * Plan `2026-05-17-shell-parts-persistance-save` — client consumer of
 * `DELETE /api/admin/shell-parts/:ownerKind/:ownerId/:partKind`. Mirror of
 * `useUpsertShellPart` (same invalidation prefixes, same `skipInvalidate`
 * option). Consumed exclusively by the editor save orchestrator
 * (`MjmlEditorOverlayInner.handleSave`) when an admin restores a section
 * to its inherited cascade value — `origin === ownerKind` + `canvas === résolu`
 * → DELETE relâche la surcharge.
 *
 * No global `onError` — the orchestrator builds a single toast that describes
 * the partial / total success of the `Promise.allSettled` batch.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  deleteShellPart,
  type DeleteShellPartParams,
} from '@/services/shell-parts.service'

export interface UseDeleteShellPartOptions {
  /** When `true`, the `onSuccess` callback does NOT call `invalidateQueries`.
   *  See `useUpsertShellPart` for the rationale (orchestrator-only mode). */
  skipInvalidate?: boolean
}

export const useDeleteShellPart = (options: UseDeleteShellPartOptions = {}) => {
  const queryClient = useQueryClient()
  const skipInvalidate = options.skipInvalidate ?? false

  return useMutation<void, unknown, DeleteShellPartParams>({
    mutationFn: deleteShellPart,
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
