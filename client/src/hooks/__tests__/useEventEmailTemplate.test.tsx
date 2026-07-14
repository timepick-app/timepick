import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  useEventEmailTemplate,
  useEventEmailTemplatePreview,
  usePatchEventEmailTemplate,
  useResetEventEmailTemplate,
  eventEmailTemplateQueryKey,
  eventEmailTemplatePreviewQueryKey,
} from '../useEventEmailTemplate'
import type {
  EventEmailTemplate,
  EventEmailTemplatePreview,
} from '../../services/event-email-templates.service'

const mockGet = vi.fn()
const mockPatch = vi.fn()
const mockPost = vi.fn()

vi.mock('../../services/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

const EVENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const templateDto: EventEmailTemplate = {
  eventId: EVENT_ID,
  templateKey: 'invitation',
  bodyMjml: '<!-- BODY:START --><mj-section>custom</mj-section><!-- BODY:END -->',
  defaultBodyMjml: '<!-- BODY:START --><mj-section>default</mj-section><!-- BODY:END -->',
  isCustom: true,
  updatedAt: '2026-05-02T12:00:00Z',
}

const previewDto: EventEmailTemplatePreview = {
  html: '<html>preview</html>',
  text: 'preview',
  templateKey: 'invitation',
  eventId: EVENT_ID,
}

describe('useEventEmailTemplate hook suite', () => {
  let queryClient: QueryClient

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    queryClient.clear()
  })

  describe('eventEmailTemplateQueryKey / eventEmailTemplatePreviewQueryKey helpers', () => {
    it('return canonical arrays scoped to eventId', () => {
      expect(eventEmailTemplateQueryKey(EVENT_ID)).toEqual([
        'admin',
        'events',
        EVENT_ID,
        'email-template',
      ])
      expect(eventEmailTemplatePreviewQueryKey(EVENT_ID)).toEqual([
        'admin',
        'events',
        EVENT_ID,
        'email-template-preview',
      ])
    })
  })

  describe('useEventEmailTemplate', () => {
    it('resolves to the GET DTO and uses the canonical query key', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: templateDto } })

      const { result } = renderHook(() => useEventEmailTemplate(EVENT_ID), {
        wrapper,
      })

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(templateDto)
      expect(mockGet).toHaveBeenCalledWith(
        `/admin/events/${EVENT_ID}/email-template`,
      )
      expect(
        queryClient.getQueryData(eventEmailTemplateQueryKey(EVENT_ID)),
      ).toEqual(templateDto)
    })

    it('does NOT fire the request when eventId is empty (create-mode draft not yet landed)', async () => {
      const { result } = renderHook(() => useEventEmailTemplate(''), { wrapper })

      // The query is disabled — fetchStatus stays idle and no DTO arrives.
      expect(result.current.fetchStatus).toBe('idle')
      expect(mockGet).not.toHaveBeenCalled()
    })
  })

  describe('useEventEmailTemplatePreview', () => {
    it('resolves and is keyed under the preview namespace scoped to eventId', async () => {
      mockPost.mockResolvedValueOnce({ data: { data: previewDto } })

      const { result } = renderHook(
        () => useEventEmailTemplatePreview(EVENT_ID),
        { wrapper },
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(previewDto)
      expect(mockPost).toHaveBeenCalledWith(
        `/admin/events/${EVENT_ID}/email-template/preview`,
      )
      expect(
        queryClient.getQueryData(eventEmailTemplatePreviewQueryKey(EVENT_ID)),
      ).toEqual(previewDto)
    })

    it('does NOT fire the request when eventId is empty', () => {
      const { result } = renderHook(() => useEventEmailTemplatePreview(''), {
        wrapper,
      })
      expect(result.current.fetchStatus).toBe('idle')
      expect(mockPost).not.toHaveBeenCalled()
    })
  })

  describe('usePatchEventEmailTemplate', () => {
    it('PATCHes the service and invalidates row + preview + ["events", eventId] on success', async () => {
      const updated = { ...templateDto, bodyMjml: '<!-- BODY:START --><mj-section>new</mj-section><!-- BODY:END -->' }
      mockPatch.mockResolvedValueOnce({ data: { data: updated } })

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(
        () => usePatchEventEmailTemplate(EVENT_ID),
        { wrapper },
      )

      await act(async () => {
        await result.current.mutateAsync({ bodyMjml: '<!-- BODY:START --><mj-section>new</mj-section><!-- BODY:END -->' })
      })

      expect(mockPatch).toHaveBeenCalledWith(
        `/admin/events/${EVENT_ID}/email-template`,
        { bodyMjml: '<!-- BODY:START --><mj-section>new</mj-section><!-- BODY:END -->' },
      )

      const calls = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
      expect(calls).toEqual(
        expect.arrayContaining([
          eventEmailTemplateQueryKey(EVENT_ID),
          eventEmailTemplatePreviewQueryKey(EVENT_ID),
          ['events', EVENT_ID],
        ]),
      )
    })

    it('rejects when the service rejects, and does NOT invalidate the cache', async () => {
      const error = new Error('500')
      mockPatch.mockRejectedValueOnce(error)
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(
        () => usePatchEventEmailTemplate(EVENT_ID),
        { wrapper },
      )

      await act(async () => {
        await expect(
          result.current.mutateAsync({ bodyMjml: 'x' }),
        ).rejects.toBe(error)
      })

      expect(invalidateSpy).not.toHaveBeenCalled()
    })
  })

  describe('useResetEventEmailTemplate', () => {
    it('POSTs the reset endpoint and invalidates row + preview + ["events", eventId] on success', async () => {
      const dto = { ...templateDto, isCustom: false, bodyMjml: templateDto.defaultBodyMjml }
      mockPost.mockResolvedValueOnce({ data: { data: dto } })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(
        () => useResetEventEmailTemplate(EVENT_ID),
        { wrapper },
      )

      await act(async () => {
        await result.current.mutateAsync()
      })

      expect(mockPost).toHaveBeenCalledWith(
        `/admin/events/${EVENT_ID}/email-template/reset`,
      )
      const calls = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
      expect(calls).toEqual(
        expect.arrayContaining([
          eventEmailTemplateQueryKey(EVENT_ID),
          eventEmailTemplatePreviewQueryKey(EVENT_ID),
          ['events', EVENT_ID],
        ]),
      )
    })

    it('rejects when the service rejects, and does NOT invalidate the cache', async () => {
      const error = new Error('500')
      mockPost.mockRejectedValueOnce(error)
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(
        () => useResetEventEmailTemplate(EVENT_ID),
        { wrapper },
      )

      await act(async () => {
        await expect(result.current.mutateAsync()).rejects.toBe(error)
      })

      expect(invalidateSpy).not.toHaveBeenCalled()
    })
  })
})
