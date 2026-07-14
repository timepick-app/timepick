import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import type { EventStats } from '../types/stats'
import { usePollingConfig } from './usePollingConfig'

/**
 * useAllEventsStats Hook
 * Récupère les statistiques de tous les événements ou d'un événement spécifique
 *
 * @param eventId - UUID de l'événement pour filtrer (optionnel)
 * @returns QueryResult avec les stats de tous les événements ou d'un seul
 */
export const useAllEventsStats = (eventId?: string | null) => {
  const { data: pollingConfig, fallbackInterval } = usePollingConfig()
  const interval = pollingConfig?.interval ?? fallbackInterval

  return useQuery<EventStats[]>({
    queryKey: ['stats', 'all', eventId],
    queryFn: async () => {
      const url = eventId
        ? `/admin/stats?event_id=${eventId}`
        : '/admin/stats'
      const { data } = await api.get<{ data: EventStats[] }>(url)
      return data.data
    },
    // Polling volontairement actif même sans eventId (nourrit la liste globale et le dashboard)
    refetchInterval: interval > 0 ? interval : false,
    staleTime: 30000, // 30 secondes
    retry: false
  })
}
