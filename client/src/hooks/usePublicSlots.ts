import { useQuery, keepPreviousData } from '@tanstack/react-query'
import api from '../services/api'
import type { Slot } from '../types/slot'

/**
 * Configuration par défaut du polling (30 secondes)
 * Utilisée comme fallback si la config API n'est pas disponible
 */
const DEFAULT_POLLING_INTERVAL = 30000

/**
 * Intervalle de polling depuis variable d'environnement
 * VITE_POLLING_INTERVAL peut être défini pour override la config serveur
 */
const ENV_POLLING_INTERVAL = import.meta.env.VITE_POLLING_INTERVAL
  ? Number(import.meta.env.VITE_POLLING_INTERVAL)
  : DEFAULT_POLLING_INTERVAL

/**
 * Type d'erreur avec response (pour Axios/React Query errors)
 */
interface ApiError {
  response?: {
    status?: number
  }
  code?: string
}

/**
 * usePublicSlots Hook
 * Récupère les créneaux d'un événement public avec polling automatique
 *
 * @param eventUuid - UUID public de l'événement
 * @param enabled - Activer/désactiver la requête
 * @param pollingInterval - Intervalle de polling en ms (optionnel, utilise la config par défaut)
 * @returns Slots avec état de chargement, erreur et status de rechargement
 *
 * Features:
 * - Polling automatique avec fréquence dynamique (configurable via config API)
 * - Gestion des erreurs 404/403/500 avec backoff exponentiel
 * - Cache React Query avec invalidation automatique
 * - Support de isRefetching pour indiquer le rechargement en cours
 * - Conservation des données stale pendant les tentatives de retry (Story 8.3)
 * - Backoff exponentiel pour éviter de surcharger le serveur (Story 8.3)
 *
 * @example
 * const { data: slots, isLoading, error, isRefetching, failureCount } = usePublicSlots(eventUuid)
 */
export const usePublicSlots = (
  eventUuid: string,
  enabled: boolean = true,
  pollingInterval?: number
) => {
  // Utiliser l'intervalle passé en paramètre, ou l'intervalle par défaut de l'env
  const interval = pollingInterval ?? ENV_POLLING_INTERVAL

  return useQuery<Slot[]>({
    queryKey: ['public-slots', eventUuid],
    queryFn: async () => {
      const { data } = await api.get(`/public/events/${eventUuid}/slots`)
      return data.data as Slot[]
    },
    enabled: !!eventUuid && enabled,
    // Désactiver le polling si interval = 0 ou si eventUuid est vide
    refetchInterval: interval > 0 && !!eventUuid ? interval : false,
    staleTime: 10000, // 10 secondes - les données sont considérées fraîches
    gcTime: 5 * 60 * 1000, // 5 minutes - conserver les données stale plus longtemps (Story 8.3)
    placeholderData: keepPreviousData, // garde les données de l'événement précédent pendant le chargement du nouveau (navigation event→event) → pas de skeleton/flash
    retry: (failureCount, error) => {
      // Ne pas réessayer en cas d'erreur "normales" (Story 8.3)
      const err = error as ApiError
      if (err.response?.status === 404 || err.response?.status === 403 || err.response?.status === 401) {
        return false
      }
      // 3 retries max pour erreurs réseau/500 (Story 8.3)
      return failureCount < 3
    },
    retryDelay: (attemptIndex) => {
      // Backoff exponentiel : 1s, 2s, 4s, ..., max 30s (Story 8.3)
      // Cela évite de surcharger le serveur en cas de problème persistant
      return Math.min(1000 * 2 ** attemptIndex, 30000)
    },
  })
}
