import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAdminSlots } from '../useAdminSlots'
import api from '../../services/api'

// Mock de l'API
vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
  },
}))

// Mock des toasts pour vérifier le signalement d'échec de notification.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { toast } from 'sonner'

const mockApiPost = api.post as unknown as ReturnType<typeof vi.fn>
const mockApiPut = api.put as unknown as ReturnType<typeof vi.fn>
const mockApiDelete = api.delete as unknown as ReturnType<typeof vi.fn>
const mockToast = toast as unknown as { success: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> }

type InvalidatePredicate = (query: { queryKey: unknown[] }) => boolean
type InvalidateOptions = { predicate: InvalidatePredicate }

function getInvalidatePredicate(calls: unknown[][]): InvalidatePredicate {
  const firstCall = calls[0]
  if (!firstCall) throw new Error('No invalidate calls captured')
  const [opts] = firstCall as [InvalidateOptions]
  return opts.predicate
}

describe('useAdminSlots Hook', () => {
  let queryClient: QueryClient
  const testEventId = 'event-123'

  const createWrapper = () => {
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
  }

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

  describe('createSlotMutation', () => {
    it('[P1] devrait invalider les queries public-slots après création', async () => {
      const mockSlot = {
        id: 'slot-123',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        capacity: 5,
        currentBookings: 0,
      }

      mockApiPost.mockResolvedValueOnce({
        data: { data: mockSlot },
      })

      // Espionner invalidateQueries
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useAdminSlots(testEventId), { wrapper: createWrapper() })

      await act(async () => {
        await result.current.createSlotAsync({
          startTime: '2026-03-15T10:00:00Z',
          endTime: '2026-03-15T11:00:00Z',
          capacity: 5,
        })
      })

      await waitFor(() => {
        expect(result.current.isCreating).toBe(false)
      })

      // Vérifier que invalidateQueries a été appelé avec predicate pour public-slots
      const predicateCalls = invalidateSpy.mock.calls.filter(call =>
        call[0]?.predicate && typeof call[0].predicate === 'function'
      )

      expect(predicateCalls.length).toBeGreaterThan(0)
      // Vérifier que le predicate matche 'public-slots'
      const predicate = getInvalidatePredicate(predicateCalls)
      expect(predicate({ queryKey: ['public-slots', 'any-uuid'] })).toBe(true)
      expect(predicate({ queryKey: ['other-key'] })).toBe(false)
    })
  })

  describe('updateSlotMutation', () => {
    it('[P1] devrait invalider les queries public-slots après mise à jour', async () => {
      const mockSlot = {
        id: 'slot-123',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:30:00Z',
        capacity: 8,
        currentBookings: 2,
      }

      mockApiPut.mockResolvedValueOnce({
        data: { data: mockSlot },
      })

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useAdminSlots(testEventId), { wrapper: createWrapper() })

      await act(async () => {
        result.current.updateSlot('slot-123', { capacity: 8 })
      })

      await waitFor(() => {
        expect(result.current.isUpdating).toBe(false)
      })

      // Vérifier predicate invalidation
      const predicateCalls = invalidateSpy.mock.calls.filter(call =>
        call[0]?.predicate && typeof call[0].predicate === 'function'
      )

      expect(predicateCalls.length).toBeGreaterThan(0)
      const predicate = getInvalidatePredicate(predicateCalls)
      expect(predicate({ queryKey: ['public-slots', 'any-uuid'] })).toBe(true)
    })
  })

  describe('deleteSlotMutation', () => {
    it('[P1] devrait invalider les queries public-slots après suppression', async () => {
      mockApiDelete.mockResolvedValueOnce({
        data: { data: { cancelled: true, hadReservations: false, notified: 0, failed: 0 } },
      })

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useAdminSlots(testEventId), { wrapper: createWrapper() })

      await act(async () => {
        await result.current.deleteSlotAsync('slot-123')
      })

      await waitFor(() => {
        expect(result.current.isDeleting).toBe(false)
      })

      // Vérifier predicate invalidation
      const predicateCalls = invalidateSpy.mock.calls.filter(call =>
        call[0]?.predicate && typeof call[0].predicate === 'function'
      )

      expect(predicateCalls.length).toBeGreaterThan(0)
      const predicate = getInvalidatePredicate(predicateCalls)
      expect(predicate({ queryKey: ['public-slots', 'any-uuid'] })).toBe(true)
    })

    it('[P0] toast.warning spécifique quand une notification d\'annulation a échoué (failed > 0)', async () => {
      mockApiDelete.mockResolvedValueOnce({
        data: { data: { cancelled: true, hadReservations: true, notified: 0, failed: 2 } },
      })

      const { result } = renderHook(() => useAdminSlots(testEventId), { wrapper: createWrapper() })

      await act(async () => {
        await result.current.deleteSlotAsync('slot-123', 'Reporté', true)
      })

      await waitFor(() => expect(result.current.isDeleting).toBe(false))

      expect(mockToast.warning).toHaveBeenCalledTimes(1)
      expect(mockToast.warning).toHaveBeenCalledWith(expect.stringContaining('2 participants'))
      expect(mockToast.success).not.toHaveBeenCalled()
      // Les surfaces de notifications en attente sont rafraîchies.
    })

    it('[P1] toast de succès (pas de warning) quand tous les envois réussissent', async () => {
      mockApiDelete.mockResolvedValueOnce({
        data: { data: { cancelled: true, hadReservations: true, notified: 1, failed: 0 } },
      })

      const { result } = renderHook(() => useAdminSlots(testEventId), { wrapper: createWrapper() })

      await act(async () => {
        await result.current.deleteSlotAsync('slot-123', undefined, true)
      })

      await waitFor(() => expect(result.current.isDeleting).toBe(false))

      expect(mockToast.success).toHaveBeenCalledWith('Créneau annulé')
      expect(mockToast.warning).not.toHaveBeenCalled()
    })
  })
})
