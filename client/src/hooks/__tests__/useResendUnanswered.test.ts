import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import React from 'react'
import { toast } from 'sonner'
import { useResendUnanswered } from '../useResendUnanswered'

const mockPost = vi.fn()
vi.mock('../../services/api', () => ({
  default: { post: (...args: unknown[]) => mockPost(...args) },
}))

// sonner mocké : on intercepte chaque variante de toast pour asserter le type émis.
vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

// `toast` est mocké (cf. vi.mock ci-dessus) mais TS le type d'après le vrai module
// sonner : on le re-type en registre de mocks pour accéder aux matchers d'appel.
const toastMock = toast as unknown as {
  info: Mock
  success: Mock
  warning: Mock
  error: Mock
}

let queryClient: QueryClient

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: queryClient }, children)

describe('useResendUnanswered — toasts selon { targeted, resent, failed }', () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    vi.clearAllMocks()
  })
  afterEach(() => queryClient.clear())

  const cases: Array<{
    name: string
    resp: { targeted: number; resent: number; failed: number }
    kind: 'info' | 'success' | 'warning' | 'error'
  }> = [
    { name: 'aucune cible (targeted=0) → toast.info', resp: { targeted: 0, resent: 0, failed: 0 }, kind: 'info' },
    { name: 'succès complet (failed=0) → toast.success', resp: { targeted: 2, resent: 2, failed: 0 }, kind: 'success' },
    { name: 'succès partiel (resent>0 && failed>0) → toast.warning', resp: { targeted: 2, resent: 1, failed: 1 }, kind: 'warning' },
    { name: 'tout échec (resent=0 && failed>0) → toast.error', resp: { targeted: 2, resent: 0, failed: 2 }, kind: 'error' },
  ]

  for (const c of cases) {
    it(c.name, async () => {
      mockPost.mockResolvedValueOnce({ data: { data: c.resp } })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useResendUnanswered('evt-1'), { wrapper })
      result.current.resend()

      await waitFor(() => expect(result.current.isResending).toBe(false))

      expect(mockPost).toHaveBeenCalledWith('/admin/events/evt-1/invitations/resend-unanswered')
      expect(toastMock[c.kind]).toHaveBeenCalledTimes(1)
      // Les autres variantes ne sont pas déclenchées pour cette réponse.
      for (const other of ['info', 'success', 'warning', 'error'] as const) {
        if (other !== c.kind) expect(toastMock[other]).not.toHaveBeenCalled()
      }
      // Invalidation de l'activité et de l'engagement du tableau de bord.
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['analytics', 'event-activity'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['analytics', 'engagement'] })
    })
  }

  it('rejet sans code de transport → la phrase de l\'appelant, jamais le texte d\'axios', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network Error'))

    const { result } = renderHook(() => useResendUnanswered('evt-1'), { wrapper })
    result.current.resend()

    await waitFor(() => expect(result.current.isResending).toBe(false))
    expect(toastMock.error).toHaveBeenCalledTimes(1)
    const shown = toastMock.error.mock.calls[0][0] as string
    expect(shown).toContain('La relance a échoué')
    expect(shown).not.toContain('Network Error')
    // Aucun toast de succès en cas d'échec réseau.
    expect(toastMock.success).not.toHaveBeenCalled()
  })

  it('resend transmet les options mutate (onSuccess) au callback', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: { targeted: 1, resent: 1, failed: 0 } } })

    const { result } = renderHook(() => useResendUnanswered('evt-1'), { wrapper })
    const onSuccess = vi.fn()
    result.current.resend({ onSuccess })

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
  })
})
