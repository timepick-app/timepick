import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getRecoveryCodesStatus,
  dismissBanner,
  type RecoveryCodesStatus,
} from '@/services/recovery.service'
import { computeRecoveryBanner, type RecoveryBannerPayload } from '@/lib/recoveryBanner'

const RECOVERY_CODES_QUERY_KEY = ['admin', 'recovery-codes', 'status'] as const

export interface UseRecoveryBannerResult {
  banner: RecoveryBannerPayload | null
  dismiss: () => void
  isDismissing: boolean
}

/**
 * Source de données de l'alerte « codes de secours » du tableau de bord : lecture du
 * statut, drapeau de session « connexion via code de secours », calcul de l'alerte
 * (computeRecoveryBanner) et mutation d'ignorance (dismissBanner). À appeler UNE seule
 * fois (dans AttentionZone) pour garder une source de vérité unique : un double appel
 * ferait diverger hasEmergencyFlag après un dismiss.
 *
 * Pas de gate `enabled` : AttentionZone ne monte qu'après la vérification d'auth
 * (Admin fait un early-return si !isAuthChecked), donc la query ne part qu'authentifié.
 */
export function useRecoveryBanner(): UseRecoveryBannerResult {
  const queryClient = useQueryClient()

  const { data: status } = useQuery<RecoveryCodesStatus>({
    queryKey: RECOVERY_CODES_QUERY_KEY,
    queryFn: getRecoveryCodesStatus,
    staleTime: 60_000,
  })

  const [hasEmergencyFlag, setHasEmergencyFlag] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem('emergencySession') === 'true'
  })

  const banner = useMemo(() => computeRecoveryBanner(status, hasEmergencyFlag), [status, hasEmergencyFlag])

  const dismissMutation = useMutation({
    mutationFn: dismissBanner,
    onSuccess: () => {
      if (typeof window !== 'undefined') sessionStorage.removeItem('emergencySession')
      setHasEmergencyFlag(false)
      queryClient.invalidateQueries({ queryKey: RECOVERY_CODES_QUERY_KEY })
    },
  })

  return { banner, dismiss: () => dismissMutation.mutate(), isDismissing: dismissMutation.isPending }
}
