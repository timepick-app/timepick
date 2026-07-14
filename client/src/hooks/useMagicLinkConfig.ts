import { useQuery } from '@tanstack/react-query'
import api, { type ApiResponse } from '../services/api'

/**
 * Valeurs par défaut des TTL des magic links (en secondes)
 *
 * NOTE: Ces constantes sont définies ici pour être utilisées comme fallback côté frontend
 * en cas d'erreur de l'API. La source de vérité reste le backend. Si les valeurs par défaut
 * changent dans le backend (config.service.ts), elles doivent être mises à jour ici aussi.
 */
const DEFAULT_ADMIN_TTL = 24 * 60 * 60         // 86400 secondes = 24 heures
const DEFAULT_USER_TTL = 7 * 24 * 60 * 60      // 604800 secondes = 7 jours
export const DEFAULT_SESSION_TTL = 2 * 60 * 60        // 7200 secondes = 2 heures

/**
 * Type pour la configuration des magic links (exposé par l'API)
 */
export interface MagicLinkConfig {
  adminTTL: number    // secondes
  userTTL: number     // secondes
  sessionTTL: number  // secondes - durée de session après connexion
}

/**
 * useMagicLinkConfig Hook
 * Récupère la configuration des magic links depuis l'API admin
 *
 * Features:
 * - Cache de 5 minutes (la config change rarement)
 * - Valeurs par défaut si API échoue
 *
 * @returns QueryResult avec la configuration des magic links
 *
 * @example
 * const { data: magicLinkConfig, isLoading } = useMagicLinkConfig()
 */
export const useMagicLinkConfig = () => {
  const query = useQuery<MagicLinkConfig>({
    queryKey: ['config', 'magic-link'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<MagicLinkConfig>>('/admin/config/magic-link')
      return data.data
    },
    // Cache de 5 minutes - la config change rarement
    staleTime: 5 * 60 * 1000,
    // Ne pas recharger automatiquement
    refetchInterval: false,
    // La config est optionnelle - l'erreur n'est pas fatale
    retry: false,
  })

  return {
    ...query,
    defaults: {
      adminTTL: DEFAULT_ADMIN_TTL,
      userTTL: DEFAULT_USER_TTL,
      sessionTTL: DEFAULT_SESSION_TTL,
    },
  }
}

// Re-exporter le hook de mutation pour simplifier les imports
export { useUpdateMagicLinkConfig } from './useUpdateMagicLinkConfig'
