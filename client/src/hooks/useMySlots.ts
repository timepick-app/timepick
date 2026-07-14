import { useQuery } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import api from '@/services/api'
import type { MySlotsResponse } from '@/types/member'

/**
 * useMySlots — charge l'agenda (créneaux passés + futurs) du membre connecté
 * via `GET /api/me/slots`.
 *
 * - `staleTime: 5 min` (AR12 upcoming) : la liste change rarement en session.
 * - `retry` : plafonné à 3, exclut le 401 (intercepteur axios → déconnexion + redirection `/login?reason=session_expired`).
 *
 * La page `/me` ne pagine pas `past` en V1. Le contrat `nextCursor` reste exposé
 * côté API, mais aucun consommateur client ne passe de curseur aujourd'hui.
 */
export function useMySlots() {
  return useQuery<MySlotsResponse>({
    queryKey: ['me', 'slots'],
    queryFn: async () => {
      const { data } = await api.get('/me/slots')
      return data.data as MySlotsResponse
    },
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      const err = error as AxiosError
      return failureCount < 3 && err.response?.status !== 401
    },
  })
}
