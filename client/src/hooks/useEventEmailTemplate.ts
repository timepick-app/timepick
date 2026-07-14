/**
 * Per-event email template hook suite (Story 24-3 / E3.S3).
 *
 * Wraps `event-email-templates.service` in TanStack Query primitives and
 * mirrors the `useEmailTemplate.ts` hook pattern. Mutations invalidate the
 * row + preview caches AND the `['events', eventId]` cache that drives the
 * FR59 inheritance badge from Story 24-1, so a per-event PATCH or reset
 * keeps both surfaces in sync without manual refetching.
 *
 * Queries are disabled when `eventId` is empty (create-mode while the draft
 * has not yet landed — the panel will fall back to its loading skeleton
 * until `effectiveEventId` resolves).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getEventEmailTemplate,
  patchEventEmailTemplate,
  resetEventEmailTemplate,
  previewEventEmailTemplate,
  type EventEmailTemplate,
  type EventEmailTemplatePatch,
  type EventEmailTemplatePreview,
} from '../services/event-email-templates.service'

export const eventEmailTemplateQueryKey = (eventId: string) =>
  ['admin', 'events', eventId, 'email-template'] as const

export const eventEmailTemplatePreviewQueryKey = (eventId: string) =>
  ['admin', 'events', eventId, 'email-template-preview'] as const

const STALE_TIME_MS = 5 * 60 * 1000

export const useEventEmailTemplate = (eventId: string) =>
  useQuery<EventEmailTemplate>({
    queryKey: eventEmailTemplateQueryKey(eventId),
    queryFn: () => getEventEmailTemplate(eventId),
    staleTime: STALE_TIME_MS,
    retry: false,
    enabled: Boolean(eventId),
  })

export const useEventEmailTemplatePreview = (eventId: string) =>
  useQuery<EventEmailTemplatePreview>({
    queryKey: eventEmailTemplatePreviewQueryKey(eventId),
    queryFn: () => previewEventEmailTemplate(eventId),
    staleTime: STALE_TIME_MS,
    retry: false,
    enabled: Boolean(eventId),
  })

export const usePatchEventEmailTemplate = (eventId: string) => {
  const queryClient = useQueryClient()
  return useMutation<EventEmailTemplate, unknown, EventEmailTemplatePatch>({
    mutationFn: (patch) => patchEventEmailTemplate(eventId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventEmailTemplateQueryKey(eventId) })
      queryClient.invalidateQueries({
        queryKey: eventEmailTemplatePreviewQueryKey(eventId),
      })
      // Sync the FR59 badge from Story 24-1: useEventDetails reads
      // hasCustomInvitation from this cache key.
      queryClient.invalidateQueries({ queryKey: ['events', eventId] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'editor-context'] })
    },
  })
}

export const useResetEventEmailTemplate = (eventId: string) => {
  const queryClient = useQueryClient()
  return useMutation<EventEmailTemplate, unknown, void>({
    mutationFn: () => resetEventEmailTemplate(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventEmailTemplateQueryKey(eventId) })
      queryClient.invalidateQueries({
        queryKey: eventEmailTemplatePreviewQueryKey(eventId),
      })
      queryClient.invalidateQueries({ queryKey: ['events', eventId] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'editor-context'] })
    },
  })
}
