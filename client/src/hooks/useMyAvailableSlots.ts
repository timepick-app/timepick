import { useQuery } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import api from '@/services/api'
import type { MyAvailableSlot } from '@/types/member'

/**
 * useMyAvailableSlots — charge les créneaux libres disponibles à la réservation
 * pour le membre connecté, via `GET /api/me/available-slots`.
 *
 * - `queryKey: ['me', 'available-slots']`
 * - `staleTime: 1 min` (AR12 available) : les disponibilités changent plus
 *   fréquemment (autres membres peuvent réserver entre-temps).
 * - `retry` : plafonné à 3 et exclut le 401 (géré globalement par l'intercepteur
 *   axios qui déconnecte et redirige vers `/login?reason=session_expired`).
 * - Résultat : max 10 créneaux, triés `startTime ASC`, dans des événements
 *   publiés rattachés au membre, non déjà réservés par lui.
 */
export function useMyAvailableSlots() {
  return useQuery<MyAvailableSlot[]>({
    queryKey: ['me', 'available-slots'],
    queryFn: async () => {
      const { data } = await api.get('/me/available-slots')
      return data.data as MyAvailableSlot[]
    },
    staleTime: 60 * 1000,
    retry: (failureCount, error) => {
      const err = error as AxiosError
      return failureCount < 3 && err.response?.status !== 401
    },
  })
}
