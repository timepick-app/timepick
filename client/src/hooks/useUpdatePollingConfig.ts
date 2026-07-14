import { useMutation, useQueryClient } from '@tanstack/react-query'
import api, { type ApiResponse } from '../services/api'
import { toast } from 'sonner'
import type { PollingConfig } from './usePollingConfig'
import { extractErrorMessage } from '@/lib/extractErrorMessage'

/**
 * Limites de l'intervalle de polling (en secondes pour l'affichage)
 */
export const MIN_POLLING_SECONDS = 10
export const MAX_POLLING_SECONDS = 120

/**
 * Convertir les secondes en millisecondes
 */
export const secondsToMs = (seconds: number): number => seconds * 1000

/**
 * Convertir les millisecondes en secondes
 */
export const msToSeconds = (ms: number): number => Math.round(ms / 1000)

/**
 * useUpdatePollingConfig Hook
 * Mutation pour mettre à jour la fréquence de polling
 *
 * Features:
 * - Validation locale des limites (10s - 120s)
 * - Invalidation automatique du cache React Query
 * - Toast notifications pour succès/erreur
 * - Conversion automatique secondes ↔ millisecondes
 *
 * @returns Mutation result avec état et fonction de mise à jour
 *
 * @example
 * const { mutate: updateInterval, isPending } = useUpdatePollingConfig()
 * updateInterval(60) // 60 secondes
 */
export const useUpdatePollingConfig = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (intervalSeconds: number): Promise<PollingConfig> => {
      // Convertir en millisecondes pour l'API
      const intervalMs = secondsToMs(intervalSeconds)

      const { data } = await api.put<ApiResponse<PollingConfig>>(
        '/admin/config/polling-interval',
        { interval: intervalMs }
      )
      return data.data
    },
    onSuccess: (_data, updatedInterval) => {
      // Invalider le cache de la configuration pour forcer un re-fetch
      queryClient.invalidateQueries({ queryKey: ['config', 'polling-interval'] })

      // Toast de confirmation avec la valeur en secondes (plus lisible)
      toast.success(`Fréquence de polling mise à jour : ${updatedInterval} secondes`)
    },
    onError: (err) => {
      const errorMsg = extractErrorMessage(err, 'Erreur lors de la mise à jour')
      toast.error(`Erreur: ${errorMsg}`)
    }
  })
}
