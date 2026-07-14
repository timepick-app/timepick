import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { useEventActivity } from '../useDashboardAnalytics'
import type { EventActivity } from '../../types/analytics'

const mockGet = vi.fn()
vi.mock('../../services/api', () => ({
  default: { get: (...args: unknown[]) => mockGet(...args) },
}))

describe('useDashboardAnalytics — séries par événement', () => {
  let queryClient: QueryClient

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.clearAllMocks()
  })
  afterEach(() => queryClient.clear())

  it('useEventActivity : récupère la liste d\'activité par événement', async () => {
    const activity: EventActivity[] = [{ eventId: 'e1', lastSentAt: null, lastBookingAt: '2026-05-01T00:00:00Z', unansweredOver3Days: 0 }]
    mockGet.mockResolvedValueOnce({ data: { data: activity } })

    const { result } = renderHook(() => useEventActivity(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(activity)
    expect(mockGet).toHaveBeenCalledWith('/admin/analytics/event-activity')
  })
})
