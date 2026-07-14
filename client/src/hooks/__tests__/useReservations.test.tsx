import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCreateReservation, useCancelReservation, useMyReservations, useCancelReservationBySlot } from '../useReservations'
import api from '../../services/api'
import { toast } from 'sonner'

// Mock de l'API
vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
  },
}))

// Mock API
const mockApiPost = api.post as unknown as ReturnType<typeof vi.fn>
const mockApiDelete = api.delete as unknown as ReturnType<typeof vi.fn>
const mockApiGet = api.get as unknown as ReturnType<typeof vi.fn>
const mockToast = vi.mocked(toast)

describe('useReservations Hook', () => {
  let queryClient: QueryClient

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

  describe('useCreateReservation', () => {
    it('[P0] devrait créer une réservation avec succès', async () => {
      const mockBooking = {
        id: 'booking-123',
        slotId: 'slot-123',
        userId: 'user-123',
        createdAt: '2026-01-20T10:00:00Z',
      }

      mockApiPost.mockResolvedValueOnce({
        data: { data: mockBooking, message: 'Réservation confirmée' },
      })

      const { result } = renderHook(() => useCreateReservation(), { wrapper: createWrapper() })

      await act(async () => {
        await result.current.mutate({ slotId: 'slot-123' })
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(mockApiPost).toHaveBeenCalledWith('/public/reservations', {
        slotId: 'slot-123',
      })
    })

    it('[P1] devrait gérer l\'erreur créneau complet (409)', async () => {
      const error = {
        response: {
          status: 409,
          data: {
            error: {
              code: 'SLOT_FULL',
              message: 'Désolé, ce créneau vient d\'être pris. Choisissez un autre créneau.',
            },
          },
        },
      }

      mockApiPost.mockRejectedValueOnce(error)

      const { result } = renderHook(() => useCreateReservation(), { wrapper: createWrapper() })

      await act(async () => {
        try {
          await result.current.mutate({ slotId: 'slot-full' })
        } catch {
          // L'erreur est propagée
        }
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })
    })

    it('[P1] devrait afficher le message d\'erreur spécifique pour SLOT_FULL (race condition)', async () => {
      // Spy sur toast.error
      const toastErrorSpy = vi.spyOn(mockToast, 'error')

      const error = {
        response: {
          status: 409,
          data: {
            error: {
              code: 'SLOT_FULL',
              message: 'Désolé, ce créneau vient d\'être pris. Choisissez un autre créneau.',
            },
          },
        },
      }

      mockApiPost.mockRejectedValueOnce(error)

      const { result } = renderHook(() => useCreateReservation(), { wrapper: createWrapper() })

      await act(async () => {
        try {
          await result.current.mutate({ slotId: 'slot-full' })
        } catch {
          // L'erreur est propagée
        }
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      // Vérifier que le message d'erreur spécifique est affiché
      expect(toastErrorSpy).toHaveBeenCalledWith(
        'Désolé, ce créneau vient d\'être pris. Choisissez un autre créneau.'
      )

      toastErrorSpy.mockRestore()
    })

    it('[P1] devrait gérer l\'erreur déjà réservé (409)', async () => {
      const error = {
        response: {
          status: 409,
          data: {
            error: {
              code: 'ALREADY_BOOKED',
              message: 'Vous avez déjà réservé ce créneau.',
            },
          },
        },
      }

      mockApiPost.mockRejectedValueOnce(error)

      const { result } = renderHook(() => useCreateReservation(), { wrapper: createWrapper() })

      await act(async () => {
        try {
          await result.current.mutate({ slotId: 'slot-123' })
        } catch {
          // L'erreur est propagée
        }
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })
    })

    it('[P1] devrait invalider les queries slots et réservations après succès', async () => {
      const mockBooking = {
        id: 'booking-123',
        slotId: 'slot-123',
        userId: 'user-123',
        createdAt: '2026-01-20T10:00:00Z',
      }

      mockApiPost.mockResolvedValueOnce({
        data: { data: mockBooking, message: 'Réservation confirmée' },
      })

      // Espionner invalidateQueries
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useCreateReservation(), { wrapper: createWrapper() })

      await act(async () => {
        await result.current.mutate({ slotId: 'slot-123' })
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Vérifier que les queries appropriées ont été invalidées
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['slots'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['public-slots'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['reservations'] })
    })
  })

  describe('useCancelReservation', () => {
    it('[P1] devrait annuler une réservation par ID', async () => {
      mockApiDelete.mockResolvedValueOnce({
        data: { message: 'Réservation annulée' },
      })

      const { result } = renderHook(() => useCancelReservation(), { wrapper: createWrapper() })

      await act(async () => {
        await result.current.mutate('booking-123')
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(mockApiDelete).toHaveBeenCalledWith('/public/reservations/booking-123')
    })

    it('[P1] devrait invalider les queries après annulation', async () => {
      mockApiDelete.mockResolvedValueOnce({
        data: { message: 'Réservation annulée' },
      })

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useCancelReservation(), { wrapper: createWrapper() })

      await act(async () => {
        await result.current.mutate('booking-123')
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['slots'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['public-slots'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['reservations'] })
    })
  })

  describe('useCancelReservationBySlot', () => {
    it('[P1] devrait annuler une réservation par slotId', async () => {
      mockApiDelete.mockResolvedValueOnce({
        data: { message: 'Réservation annulée' },
      })

      const { result } = renderHook(() => useCancelReservationBySlot(), { wrapper: createWrapper() })

      await act(async () => {
        await result.current.mutate('slot-123')
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(mockApiDelete).toHaveBeenCalledWith('/public/reservations/by-slot/slot-123')
    })
  })

  describe('useMyReservations', () => {
    it('[P1] devrait récupérer les réservations de l\'utilisateur', async () => {
      const mockReservations = [
        {
          id: 'booking-1',
          slotId: 'slot-1',
          userId: 'user-123',
          createdAt: '2026-01-20T10:00:00Z',
          slot: {
            id: 'slot-1',
            startTime: '2026-02-15T14:00:00Z',
            endTime: '2026-02-15T16:00:00Z',
            capacity: 3,
            eventId: 'event-1',
            cancelledAt: null,
            cancellationReason: null,
          },
          eventName: 'Event A',
        },
        {
          id: 'booking-2',
          slotId: 'slot-2',
          userId: 'user-123',
          createdAt: '2026-01-20T11:00:00Z',
          slot: {
            id: 'slot-2',
            startTime: '2026-02-16T10:00:00Z',
            endTime: '2026-02-16T12:00:00Z',
            capacity: 2,
            eventId: 'event-1',
            cancelledAt: null,
            cancellationReason: null,
          },
          eventName: 'Event A',
        },
      ]

      mockApiGet.mockResolvedValueOnce({
        data: { data: mockReservations },
      })

      const { result } = renderHook(() => useMyReservations(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockReservations)
      expect(mockApiGet).toHaveBeenCalledWith('/public/reservations')
    })

    it('[P1] devrait gérer les erreurs de récupération', async () => {
      mockApiGet.mockRejectedValueOnce(new Error('Network error'))

      const { result } = renderHook(() => useMyReservations(), { wrapper: createWrapper() })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error).toBeTruthy()
    })
  })
})
