import { useQuery } from '@tanstack/react-query'
import api, { type ApiResponse } from '../services/api'

/**
 * Configuration par défaut du polling (30 secondes)
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
 * Type pour la configuration de polling
 */
export interface PollingConfig {
  interval: number
}

/**
 * usePollingConfig Hook
 * Récupère la configuration de polling depuis l'API admin
 *
 * Features:
 * - Cache de 5 minutes (la config change rarement)
 * - Fallback sur VITE_POLLING_INTERVAL si API échoue
 * - Valeur par défaut: 30000ms (30 secondes)
 *
 * @returns QueryResult avec la configuration de polling
 *
 * @example
 * const { data: pollingConfig, fallbackInterval } = usePollingConfig()
 * const interval = pollingConfig?.interval || fallbackInterval
 */
export const usePollingConfig = () => {
  const query = useQuery<PollingConfig>({
    queryKey: ['config', 'polling-interval'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<PollingConfig>>('/admin/config/polling-interval')
      return data.data
    },
    // Cache de 5 minutes - la config change rarement
    staleTime: 5 * 60 * 1000,
    // Ne pas recharger automatiquement (pas besoin de polling pour la config)
    refetchInterval: false,
    // La config est optionnelle - l'erreur n'est pas fatale
    retry: false,
  })

  // Fallback sur la variable d'environnement si API échoue
  const fallbackInterval = ENV_POLLING_INTERVAL

  return {
    ...query,
    fallbackInterval,
  }
}

// Re-exporter le hook de mutation pour simplifier les imports
export { useUpdatePollingConfig } from './useUpdatePollingConfig'
export { msToSeconds } from './useUpdatePollingConfig'
