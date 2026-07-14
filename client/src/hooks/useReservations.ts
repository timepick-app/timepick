import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import api from '../services/api'
import { toast } from '../services/toast.service'
import type { Booking, BookingCreated, CreateReservationInput } from '../types/booking'

/**
 * useReservations Hook
 * Gère les mutations et queries pour les réservations de créneaux
 *
 * Features:
 * - Créer une réservation avec invalidation automatique des slots
 * - Annuler une réservation avec invalidation automatique
 * - Lister les réservations de l'utilisateur connecté
 * - Toast de confirmation après création
 *
 * @example
 * const { mutate: createReservation, isPending } = useCreateReservation()
 * createReservation({ slotId: '123' })
 */

const RESERVATIONS_QUERY_KEY = ['reservations']
const SLOTS_QUERY_KEY = ['slots']
const PUBLIC_SLOTS_QUERY_KEY = ['public-slots']

/**
 * Créer une réservation
 * POST /api/public/reservations
 */
export const useCreateReservation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateReservationInput) => {
      const response = await api.post<{ data: BookingCreated; message: string }>('/public/reservations', data)
      return response.data
    },
    onSuccess: () => {
      // Toast de confirmation (AC6: "✓ Réservation confirmée")
      toast.success('✓ Réservation confirmée')
      // Invalider les queries slots pour rafraîchir current_bookings
      queryClient.invalidateQueries({ queryKey: SLOTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: PUBLIC_SLOTS_QUERY_KEY })
      // Invalider les réservations
      queryClient.invalidateQueries({ queryKey: RESERVATIONS_QUERY_KEY })
    },
    onError: (error: AxiosError<{ error?: { code?: string } }>) => {
      // Gérer les erreurs avec des toasts appropriés
      if (error.response?.data?.error?.code === 'SLOT_FULL') {
        // AC5: Message spécifique pour le surbooking dû aux race conditions
        toast.error('Désolé, ce créneau vient d\'être pris. Choisissez un autre créneau.')
      } else if (error.response?.data?.error?.code === 'ALREADY_BOOKED') {
        toast.error('Vous avez déjà réservé ce créneau.')
      } else if (error.response?.status === 404) {
        toast.error('Ce créneau n\'existe plus.')
      } else {
        toast.error('Erreur lors de la réservation. Réessayez.')
      }
    },
  })
}

/**
 * Annuler une réservation par ID
 * DELETE /api/public/reservations/:id
 */
export const useCancelReservation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await api.delete<{ message: string }>(`/public/reservations/${bookingId}`)
      return response.data
    },
    onSuccess: () => {
      // Toast de confirmation (AC9: "Réservation annulée avec succès")
      toast.success('Réservation annulée avec succès')
      // Message de suggestion (AC10)
      setTimeout(() => {
        toast.info('Votre place est libérée. Vous pouvez réserver un autre créneau.')
      }, 1500)
      // Invalider les queries slots pour rafraîchir current_bookings
      queryClient.invalidateQueries({ queryKey: SLOTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: PUBLIC_SLOTS_QUERY_KEY })
      // Invalider les réservations
      queryClient.invalidateQueries({ queryKey: RESERVATIONS_QUERY_KEY })
    },
    onError: (error: AxiosError) => {
      // Gérer les erreurs avec des toasts appropriés
      if (error.response?.status === 404) {
        toast.error('Réservation non trouvée.')
      } else if (error.response?.status === 401) {
        toast.error('Vous devez être connecté pour annuler une réservation.')
      } else {
        toast.error('Erreur lors de l\'annulation. Réessayez.')
      }
    },
  })
}

/**
 * Annuler une réservation par slotId
 * DELETE /api/public/reservations/by-slot/:slotId
 *
 * Plus pratique quand on a le slot mais pas le bookingId
 */
export const useCancelReservationBySlot = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (slotId: string) => {
      const response = await api.delete<{ message: string }>(`/public/reservations/by-slot/${slotId}`)
      return response.data
    },
    onSuccess: () => {
      // Toast de confirmation (AC9: "Réservation annulée avec succès")
      toast.success('Réservation annulée avec succès')
      // Message de suggestion (AC10)
      setTimeout(() => {
        toast.info('Votre place est libérée. Vous pouvez réserver un autre créneau.')
      }, 1500)
      // Invalider les queries slots pour rafraîchir current_bookings
      queryClient.invalidateQueries({ queryKey: SLOTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: PUBLIC_SLOTS_QUERY_KEY })
      // Invalider les réservations
      queryClient.invalidateQueries({ queryKey: RESERVATIONS_QUERY_KEY })
    },
    onError: (error: AxiosError) => {
      // Gérer les erreurs avec des toasts appropriés
      if (error.response?.status === 404) {
        toast.error('Réservation non trouvée.')
      } else if (error.response?.status === 401) {
        toast.error('Vous devez être connecté pour annuler une réservation.')
      } else {
        toast.error('Erreur lors de l\'annulation. Réessayez.')
      }
    },
  })
}

/**
 * Lister les réservations de l'utilisateur connecté
 * GET /api/public/reservations
 *
 * @param enabled - false pour un visiteur anonyme (évite un 401). Défaut : `true`.
 * @returns Les réservations avec détails des créneaux
 */
export const useMyReservations = (enabled = true) => {
  return useQuery<Booking[]>({
    queryKey: RESERVATIONS_QUERY_KEY,
    queryFn: async () => {
      const { data } = await api.get<{ data: Booking[] }>('/public/reservations')
      return data.data
    },
    staleTime: 60000, // 1 minute - les réservations changent moins souvent
    enabled,
  })
}
