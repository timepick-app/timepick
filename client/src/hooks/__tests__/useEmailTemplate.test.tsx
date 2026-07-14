import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  useEmailTemplate,
  usePatchEmailTemplate,
  useResetAllEmailTemplates,
  emailTemplateQueryKey,
  emailTemplatePreviewQueryKey,
} from '../useEmailTemplate'
import type {
  InvitationTemplate,
  SystemTemplate,
  TemplateKey,
} from '../../services/email-templates.service'

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

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const invitationDto: InvitationTemplate = {
  templateKey: 'invitation',
  bodyMjml: '<mj-section>body</mj-section>',
  defaultBodyMjml: '<mj-section>default</mj-section>',
  updatedAt: '2026-05-01T10:00:00Z',
}

const magicLinkLoginDto: SystemTemplate = {
  templateKey: 'magic_link_login',
  introText: 'Bonjour',
  signatureText: 'Cordialement',
  defaultIntroText: 'Bonjour par défaut',
  defaultSignatureText: 'Cordialement par défaut',
  updatedAt: '2026-05-01T10:00:00Z',
}

const previewDto = {
  html: '<html>preview</html>',
  text: 'preview',
  templateKey: 'invitation',
}

describe('useEmailTemplate hook suite', () => {
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

  describe('emailTemplateQueryKey / emailTemplatePreviewQueryKey helpers', () => {
    it('returns deeply equal arrays for the same input', () => {
      expect(emailTemplateQueryKey('invitation')).toEqual([
        'settings',
        'email-template',
        'invitation',
      ])
      expect(emailTemplatePreviewQueryKey('invitation')).toEqual([
        'settings',
        'email-template-preview',
        'invitation',
      ])
    })
  })

  describe('useEmailTemplate', () => {
    it('resolves to the GET DTO and flips isLoading false', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: invitationDto } })

      const { result } = renderHook(() => useEmailTemplate('invitation'), {
        wrapper,
      })

      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual(invitationDto)
      expect(mockGet).toHaveBeenCalledWith(
        '/admin/settings/email-templates/invitation',
      )
    })

    it('keys two different templateKeys under separate cache entries', async () => {
      mockGet.mockImplementation((url: string) => {
        if (url.endsWith('/invitation')) {
          return Promise.resolve({ data: { data: invitationDto } })
        }
        if (url.endsWith('/magic_link_login')) {
          return Promise.resolve({ data: { data: magicLinkLoginDto } })
        }
        return Promise.reject(new Error(`unexpected url ${url}`))
      })

      const { result: invitationHook } = renderHook(
        () => useEmailTemplate('invitation'),
        { wrapper },
      )
      const { result: loginHook } = renderHook(
        () => useEmailTemplate('magic_link_login'),
        { wrapper },
      )

      await waitFor(() => {
        expect(invitationHook.current.data).toEqual(invitationDto)
        expect(loginHook.current.data).toEqual(magicLinkLoginDto)
      })

      expect(
        queryClient.getQueryData(emailTemplateQueryKey('invitation')),
      ).toEqual(invitationDto)
      expect(
        queryClient.getQueryData(emailTemplateQueryKey('magic_link_login')),
      ).toEqual(magicLinkLoginDto)
    })
  })

  describe('usePatchEmailTemplate', () => {
    it('calls the service and on success invalidates BOTH the row and preview keys', async () => {
      const updated: InvitationTemplate = { ...invitationDto, bodyMjml: '<mj-section>new</mj-section>' }
      mockPatch.mockResolvedValueOnce({ data: { data: updated } })

      // Pre-seed cache so we can observe staleness flip
      queryClient.setQueryData(emailTemplateQueryKey('invitation'), invitationDto)
      queryClient.setQueryData(emailTemplatePreviewQueryKey('invitation'), previewDto)

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(
        () => usePatchEmailTemplate('invitation'),
        { wrapper },
      )

      await act(async () => {
        await result.current.mutateAsync({ bodyMjml: '<mj-section>new</mj-section>' })
      })

      expect(mockPatch).toHaveBeenCalledWith(
        '/admin/settings/email-templates/invitation',
        { bodyMjml: '<mj-section>new</mj-section>' },
      )
      const calls = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
      expect(calls).toEqual(
        expect.arrayContaining([
          emailTemplateQueryKey('invitation'),
          emailTemplatePreviewQueryKey('invitation'),
        ]),
      )
    })

    it('rejects when the service rejects, and does NOT invalidate the cache', async () => {
      const error = new Error('500')
      mockPatch.mockRejectedValueOnce(error)
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(
        () => usePatchEmailTemplate('invitation'),
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

  describe('templateKey coverage', () => {
    it('all eight templateKey values are accepted by the mutation hook signature', () => {
      const keys: TemplateKey[] = [
        'invitation',
        'magic_link_login',
        'reservation_confirmation',
        'account_created',
        'cancellation_confirmation',
        'role_promoted',
        'role_demoted',
        'unregistration_confirmation',
      ]
      keys.forEach((key) => {
        const { result } = renderHook(() => usePatchEmailTemplate(key), {
          wrapper,
        })
        expect(typeof result.current.mutateAsync).toBe('function')
      })
    })
  })

  describe('useResetAllEmailTemplates', () => {
    it('POSTs reset-all and invalidates editor-context + template + preview, NOT brand', async () => {
      mockPost.mockResolvedValueOnce({
        data: { data: { templatesReset: 4, shellPartsDeleted: 3 } },
      })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useResetAllEmailTemplates(), { wrapper })

      await act(async () => {
        await result.current.mutateAsync()
      })

      expect(mockPost).toHaveBeenCalledWith('/admin/settings/email-templates/reset-all')
      const invalidatedKeys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
      expect(invalidatedKeys).toEqual(
        expect.arrayContaining([
          ['admin', 'editor-context'],
          ['settings', 'email-template'],
          ['settings', 'email-template-preview'],
        ]),
      )
      // Brand is preserved by reset-all → its cache must NOT be invalidated.
      expect(invalidatedKeys).not.toContainEqual(['settings', 'email-brand'])
    })
  })
})
