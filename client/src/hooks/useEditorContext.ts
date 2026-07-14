import { useQuery } from '@tanstack/react-query'
import {
  getEditorContext,
  type EditorOwnerKind,
  type ResolvedShell,
} from '@/services/editor-context.service'

interface UseEditorContextArgs {
  ownerKind?: EditorOwnerKind
  ownerId?: string
  templateKey?: string
}

export const useEditorContext = ({
  ownerKind,
  ownerId,
  templateKey,
}: UseEditorContextArgs) => {
  const enabled = !!ownerKind && !!ownerId && !!templateKey
  return useQuery<ResolvedShell>({
    queryKey: ['admin', 'editor-context', ownerKind, ownerId, templateKey],
    queryFn: () => {
      // Defense in depth: TanStack Query's `enabled` flag is meant to prevent
      // this branch from running with missing params, but if a future change
      // breaks the gate we want a loud failure here instead of an opaque
      // request with `undefined` query params silently 404-ing on the server.
      if (!ownerKind || !ownerId || !templateKey) {
        throw new Error(
          '[useEditorContext] queryFn invoked with missing params — this should never happen because the `enabled` gate guards it.',
        )
      }
      return getEditorContext({ ownerKind, ownerId, templateKey })
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
