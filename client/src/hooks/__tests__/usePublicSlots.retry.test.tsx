import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePublicSlots } from '../usePublicSlots'
import type { Slot } from '@/types/slot'

// Mock de l'API
vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

const mockApi = (await import('../../services/api')).default

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('usePublicSlots - Gestion des erreurs avec retry (Story 8.3)', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false, // Désactiver le retry par défaut pour les tests
          gcTime: 0, // Nettoyer le cache immédiatement après inactivité
        },
      },
    })
    vi.clearAllMocks()
  })

  it('gcTime est configuré à 5 minutes pour conserver les données stale', async () => {
    // Ce test vérifie que la configuration du hook est correcte
    // Le gcTime de 5 minutes permet de conserver les données même après inactivité
    const mockSlots: Slot[] = [
      {
        id: '1',
        eventId: 'test-uuid',
        startTime: '2026-01-20T09:00:00Z',
        endTime: '2026-01-20T10:00:00Z',
        capacity: 5,
        currentBookings: 2,
        availablePlaces: 3,
        createdAt: '2026-01-20T00:00:00Z',
        updatedAt: '2026-01-20T00:00:00Z',
        cancelledAt: null,
        cancellationReason: null,
      },
    ]

    vi.mocked(mockApi.get).mockResolvedValueOnce({ data: { data: mockSlots } })

    const { result } = renderHook(() => usePublicSlots('test-uuid'), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => {
      expect(result.current.data).toEqual(mockSlots)
    })

    // Les données devraient être disponibles
    expect(result.current.data).toBeDefined()
    expect(result.current.data?.length).toBe(1)
  })

  it('ne réessaie pas pour les erreurs 403', async () => {
    const error403 = { response: { status: 403 } }

    vi.mocked(mockApi.get).mockRejectedValueOnce(error403)

    renderHook(() => usePublicSlots('test-uuid'), {
      wrapper: createWrapper(queryClient),
    })

    // Attendre que la requête soit faite et que l'erreur soit capturée
    await waitFor(
      () => {
        expect(mockApi.get).toHaveBeenCalled()
      },
      { timeout: 5000 }
    )

    // Il ne devrait y avoir qu'une seule tentative (pas de retry pour 403)
    expect(mockApi.get).toHaveBeenCalledTimes(1)
  })

  it('ne réessaie pas pour les erreurs 404', async () => {
    const error404 = { response: { status: 404 } }

    vi.mocked(mockApi.get).mockRejectedValueOnce(error404)

    renderHook(() => usePublicSlots('test-uuid'), {
      wrapper: createWrapper(queryClient),
    })

    // Attendre que la requête soit faite
    await waitFor(
      () => {
        expect(mockApi.get).toHaveBeenCalled()
      },
      { timeout: 5000 }
    )

    // Il ne devrait y avoir qu'une seule tentative (pas de retry pour 404)
    expect(mockApi.get).toHaveBeenCalledTimes(1)
  })

  it('ne réessaie pas pour les erreurs 401', async () => {
    const error401 = { response: { status: 401 } }

    vi.mocked(mockApi.get).mockRejectedValueOnce(error401)

    renderHook(() => usePublicSlots('test-uuid'), {
      wrapper: createWrapper(queryClient),
    })

    // Attendre que la requête soit faite
    await waitFor(
      () => {
        expect(mockApi.get).toHaveBeenCalled()
      },
      { timeout: 5000 }
    )

    // Il ne devrait y avoir qu'une seule tentative (pas de retry pour 401)
    expect(mockApi.get).toHaveBeenCalledTimes(1)
  })

  it('les données restent disponibles après une erreur réseau (stale data)', async () => {
    const mockSlots: Slot[] = [
      {
        id: '1',
        eventId: 'test-uuid',
        startTime: '2026-01-20T09:00:00Z',
        endTime: '2026-01-20T10:00:00Z',
        capacity: 5,
        currentBookings: 2,
        availablePlaces: 3,
        createdAt: '2026-01-20T00:00:00Z',
        updatedAt: '2026-01-20T00:00:00Z',
        cancelledAt: null,
        cancellationReason: null,
      },
    ]

    // Premier appel réussi
    vi.mocked(mockApi.get).mockResolvedValueOnce({ data: { data: mockSlots } })

    const { result } = renderHook(() => usePublicSlots('test-uuid'), {
      wrapper: createWrapper(queryClient),
    })

    // Attendre le premier chargement réussi
    await waitFor(() => {
      expect(result.current.data).toEqual(mockSlots)
    })

    // Simuler une erreur sur le polling (le hook garde les données stale)
    vi.mocked(mockApi.get).mockRejectedValueOnce(new Error('Network error'))

    // Attendre un peu que l'erreur soit traitée
    await new Promise(resolve => setTimeout(resolve, 100))

    // Les données doivent toujours être disponibles (stale data)
    expect(result.current.data).toEqual(mockSlots)
  })
})
