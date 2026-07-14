import { useQuery } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import api from '@/services/api'
import type { MemberEvent } from '@/types/member'

/**
 * useMyEvents — charge les événements du membre connecté via `GET /me/events`.
 *
 * - `queryKey: ['me', 'events']` (consommé aussi par `MemberEventPage` pour
 *   résoudre le nom d'un événement depuis le cache, D15).
 * - `staleTime: 5 min` : la liste d'événements d'un membre change rarement.
 * - Pas de polling (`refetchInterval` absent) — un refresh manuel ou une
 *   invalidation de cache suffira (D13).
 * - `retry` : plafonné à 3 tentatives (comme `usePublicSlots`) et exclut le 401,
 *   géré globalement par l'intercepteur axios (`api.ts`) qui déconnecte et
 *   redirige vers `/login?reason=session_expired`. Le plafond évite une boucle
 *   de retry infinie sur une erreur 5xx / réseau persistante.
 *
 * Modèle : `usePublicSlots` sans le polling.
 */
export function useMyEvents() {
  return useQuery<MemberEvent[]>({
    queryKey: ['me', 'events'],
    queryFn: async () => {
      const { data } = await api.get('/me/events')
      return data.data as MemberEvent[]
    },
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      const err = error as AxiosError
      return failureCount < 3 && err.response?.status !== 401
    },
  })
}
