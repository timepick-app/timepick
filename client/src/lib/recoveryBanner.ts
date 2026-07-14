import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { RecoveryCodesStatus } from '@/services/recovery.service'

type RecoveryBannerKind = 'missing' | 'low' | 'expiring' | 'emergency'

export interface RecoveryBannerPayload {
  kind: RecoveryBannerKind
  tone: 'amber'
  message: string
  dismissable: boolean
}

const EXPIRY_WARN_DAYS = 30

/**
 * Calcule l'alerte « codes de secours » à afficher (au plus une), par priorité
 * décroissante : missing > low > expiring > emergency. null si aucune n'est pertinente.
 * Pur : `now` est injectable pour les tests (l'original utilisait Date.now()).
 */
export function computeRecoveryBanner(
  status: RecoveryCodesStatus | undefined,
  hasEmergencyFlag: boolean,
  now: Date = new Date(),
): RecoveryBannerPayload | null {
  if (!status) return null

  if (status.remaining === 0) {
    return { kind: 'missing', tone: 'amber', message: 'Aucun code de secours configuré.', dismissable: false }
  }
  if (status.remaining <= 2) {
    return {
      kind: 'low',
      tone: 'amber',
      message: `Il ne vous reste que ${status.remaining} code${status.remaining > 1 ? 's' : ''} de secours.`,
      dismissable: false,
    }
  }
  if (status.expiresAt) {
    const expires = new Date(status.expiresAt)
    const daysLeft = Math.ceil((expires.getTime() - now.getTime()) / 86_400_000)
    if (daysLeft <= EXPIRY_WARN_DAYS) {
      return {
        kind: 'expiring',
        tone: 'amber',
        message: `Vos codes expirent le ${format(expires, 'd MMMM yyyy', { locale: fr })}.`,
        dismissable: false,
      }
    }
  }
  if (!status.emergencyLoginNotified || hasEmergencyFlag) {
    return { kind: 'emergency', tone: 'amber', message: 'Vous vous êtes connecté via code de secours.', dismissable: true }
  }
  return null
}
