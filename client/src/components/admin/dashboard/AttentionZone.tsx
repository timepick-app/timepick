import { CheckCircle2, AlertTriangle } from 'lucide-react'
import type { AttentionItem } from '@/lib/dashboard'
import { useCancellationNotifications } from '@/hooks/useCancellationNotifications'
import { useRecoveryBanner } from '@/hooks/useRecoveryBanner'
import { Typography } from '@/components/ui/typography'
import { Banner, BannerDescription } from '@/components/ui/banner'
import { RecoveryAttentionItem } from './RecoveryAttentionItem'
import { CancellationAttentionItem } from './CancellationAttentionItem'
import { AttentionList } from './AttentionList'

export interface AttentionZoneProps {
  items: AttentionItem[]
  activityError?: boolean
}

/**
 * Conteneur de la zone « À traiter ». Possède l'état vide positif. Ordre : alerte codes
 * de secours (en tête, si pertinente) → alerte d'annulation (si en attente) → alertes
 * génériques. Les deux premières sont des alertes à source de données distincte, rendues
 * hors de computeAttentionItems. useRecoveryBanner est appelé ICI une seule fois (source
 * de vérité unique) et passé en props à RecoveryAttentionItem.
 */
export function AttentionZone({ items, activityError }: AttentionZoneProps) {
  const { data } = useCancellationNotifications()
  const pending = data?.pending ?? 0
  const { banner, dismiss, isDismissing } = useRecoveryBanner()

  if (pending === 0 && items.length === 0 && !banner && !activityError) {
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-4"
        data-testid="attention-empty"
      >
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
        <Typography variant="body-sm" color="muted">Tout est à jour — rien à traiter.</Typography>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {activityError && (
        <Banner variant="warning" density="compact" data-testid="attention-activity-error">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <BannerDescription>Les alertes « invitations sans réponse » n'ont pas pu être chargées.</BannerDescription>
        </Banner>
      )}
      <RecoveryAttentionItem banner={banner} onDismiss={dismiss} isDismissing={isDismissing} />
      <CancellationAttentionItem />
      <AttentionList items={items} />
    </div>
  )
}
