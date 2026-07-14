import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { setTimeout as delay } from 'node:timers/promises'
import { useAdminSlots } from '../useAdminSlots'

// Mock de l'API — `get` routé par URL (réponses au format Axios { data: { data: T } }).
const mockGet = vi.fn()
vi.mock('../../services/api', () => ({
  default: { get: (...args: unknown[]) => mockGet(...args) },
}))

const EVENT_ID = 'evt-123'
const SLOTS_URL = `/admin/events/${EVENT_ID}/slots`
const POLLING_CONFIG_URL = '/admin/config/polling-interval'

// Intervalle de polling injecté + fenêtre d'attente : à 50 ms d'intervalle, 400 ms
// laissent largement passer >= 2 refetch. Timers RÉELS (React Query v5 interagit
// mal avec vi.useFakeTimers pour refetchInterval) ; `node:timers/promises` évite
// toute construction manuelle de promesse (règle projet). Les fenêtres d'attente
// sont enveloppées dans `act()` pour que les refetch en arrière-plan flushent
// leurs mises à jour d'état dans le scope React (pas de warning act()).
const POLL_INTERVAL_MS = 50
const POLL_WINDOW_MS = 400

/**
 * Installe un routeur `get` renvoyant des réponses Axios ({ data: { data: T } }).
 * @param pollingInterval valeur de `app_config.polling_interval` (0 = désactivé)
 */
function installRouter(pollingInterval: number): void {
  mockGet.mockImplementation(async (url: string) => {
    if (url === POLLING_CONFIG_URL) {
      return { data: { data: { interval: pollingInterval } } }
    }
    if (url === SLOTS_URL) {
      return { data: { data: [] } }
    }
    throw new Error(`URL GET inattendue : ${url}`)
  })
}

/** Nombre d'appels `get` sur une URL exacte. */
const callsTo = (url: string): number =>
  mockGet.mock.calls.filter(([u]) => u === url).length

describe('useAdminSlots — polling automatique piloté par usePollingConfig', () => {
  let queryClient: QueryClient

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    mockGet.mockReset()
  })
  afterEach(() => queryClient.clear())

  it('useAdminSlots rafraîchit /slots périodiquement quand interval > 0', async () => {
    installRouter(POLL_INTERVAL_MS)

    const { unmount } = renderHook(() => useAdminSlots(EVENT_ID), { wrapper })

    await waitFor(() => expect(callsTo(SLOTS_URL)).toBeGreaterThanOrEqual(1))
    await act(async () => { await delay(POLL_WINDOW_MS) })

    expect(callsTo(SLOTS_URL)).toBeGreaterThanOrEqual(2)

    unmount()
  })

  it('useAdminSlots ne polle pas /slots quand interval = 0 (désactivé)', async () => {
    installRouter(0)

    const { unmount } = renderHook(() => useAdminSlots(EVENT_ID), { wrapper })

    await waitFor(() => expect(callsTo(SLOTS_URL)).toBe(1))
    await act(async () => { await delay(POLL_WINDOW_MS) })

    expect(callsTo(SLOTS_URL)).toBe(1)

    unmount()
  })

})
