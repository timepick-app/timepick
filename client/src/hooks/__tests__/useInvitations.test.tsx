import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { useInvitations } from '../useInvitations'
import api from '../../services/api'

// services/api est aussi auto-mocké dans setup.ts ; on le remocke ici pour piloter post/get.
vi.mock('../../services/api', () => ({
  default: { post: vi.fn(), get: vi.fn() },
}))

describe('useInvitations', () => {
  let queryClient: QueryClient
  const eventId = 'evt-1'

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    vi.mocked(api.get).mockResolvedValue({ data: { data: [] } })
    vi.mocked(api.post).mockResolvedValue({ data: { data: { sent: 1, failed: 0, results: [], message: 'ok' } } })
  })

  afterEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it("envoi → invalide engagement + event-activity du dashboard (le guide d'onboarding reflète sent>=1)", async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useInvitations(eventId), { wrapper })

    act(() => {
      result.current.sendInvitations({ userIds: ['u1'] })
    })

    await waitFor(() => {
      const keys = invalidateSpy.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey))
      expect(keys).toContain(JSON.stringify(['analytics', 'engagement']))
      expect(keys).toContain(JSON.stringify(['analytics', 'event-activity']))
    })
  })

  it('renvoi → invalide aussi les analytics du dashboard', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useInvitations(eventId), { wrapper })

    act(() => {
      result.current.resendInvitation('u1')
    })

    await waitFor(() => {
      const keys = invalidateSpy.mock.calls.map(([arg]) => JSON.stringify(arg?.queryKey))
      expect(keys).toContain(JSON.stringify(['analytics', 'engagement']))
      expect(keys).toContain(JSON.stringify(['analytics', 'event-activity']))
    })
  })
})
