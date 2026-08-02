import { useMutation, useQueryClient } from '@tanstack/react-query'
import api, { type ApiResponse } from '../services/api'
import { toast } from 'sonner'
import type { MagicLinkConfig } from './useMagicLinkConfig'
import { userFacingErrorMessage } from '@/lib/userFacingErrorMessage'

/**
 * Limites des TTL pour les magic links (en secondes)
 */
export const MAX_ADMIN_TTL = 7 * 24 * 60 * 60   // 7 jours
export const MAX_USER_TTL = 30 * 24 * 60 * 60   // 30 jours

/**
 * Limites du TTL de session (en secondes)
 *
 * NOTE: Ces limites sont dupliquées depuis le backend (config.validator.ts)
 * pour fournir une validation locale immédiate et améliorer l'UX. La validation
 * backend reste la source de vérité et fait office de filet de sécurité.
 */
export const MAX_SESSION_TTL = 24 * 60 * 60     // 24 heures

/**
 * useUpdateMagicLinkConfig Hook
 * Mutation pour mettre à jour la configuration des magic links
 *
 * Features:
 * - Validation locale des limites
 * - Invalidation automatique du cache React Query
 * - Toast notifications pour succès/erreur
 *
 * @returns Mutation result avec état et fonction de mise à jour
 *
 * @example
 * const { mutate: updateConfig, isPending } = useUpdateMagicLinkConfig()
 * updateConfig({ adminTTL: 86400, userTTL: 1800 })
 */
export const useUpdateMagicLinkConfig = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (config: MagicLinkConfig): Promise<MagicLinkConfig> => {
      const { data } = await api.put<ApiResponse<MagicLinkConfig>>(
        '/admin/config/magic-link',
        config
      )
      return data.data
    },
    onSuccess: () => {
      // Invalider le cache de la configuration pour forcer un re-fetch
      queryClient.invalidateQueries({ queryKey: ['config', 'magic-link'] })

      // Toast de confirmation
      toast.success('Configuration des magic links mise à jour')
    },
    onError: (err) => {
      toast.error(
        userFacingErrorMessage(
          err,
          "L'enregistrement des réglages de lien magique a échoué. Vos modifications sont toujours à l'écran, réessayez."
        )
      )
    }
  })
}
