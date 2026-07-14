import { Link } from 'react-router-dom'
import { ShieldAlert, AlertTriangle, KeyRound, X, Info } from 'lucide-react'
import type { RecoveryBannerPayload } from '@/lib/recoveryBanner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AttentionRow } from './AttentionRow'

export interface RecoveryAttentionItemProps {
  banner: RecoveryBannerPayload | null
  onDismiss: () => void
  isDismissing?: boolean
}

/**
 * Alerte « codes de secours » intégrée à la zone « À traiter » (remplace le bandeau
 * autonome RecoveryBanner en tête de page). En tête de zone, avant l'annulation.
 * Ton ambre (warning) pour tous les cas : missing/low (ShieldAlert) et expiring/emergency (AlertTriangle).
 * Source de données distincte (useRecoveryBanner), rendue hors de computeAttentionItems. Ne rend rien si
 * aucune alerte. Seul emergency est ignorable (croix → mutation dismissBanner).
 */
export function RecoveryAttentionItem({ banner, onDismiss, isDismissing }: RecoveryAttentionItemProps) {
  if (!banner) return null

  const Icon = (banner.kind === 'missing' || banner.kind === 'low') ? ShieldAlert : AlertTriangle

  return (
    <AttentionRow
      tone="warning"
      role="alert"
      data-testid="recovery-attention-item"
      data-kind={banner.kind}
      icon={<Icon className="h-5 w-5" aria-hidden="true" />}
      action={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline-warning" size="sm">
            <Link to="/admin/profile">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Gérer mes codes de secours
            </Link>
          </Button>
          {banner.dismissable && (
            <button
              type="button"
              onClick={onDismiss}
              disabled={isDismissing}
              className="rounded p-1 hover:bg-black/5 disabled:opacity-50"
              aria-label="Ignorer cette alerte"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      }
    >
      <div className="flex items-center gap-1">
        <span className="text-body-sm font-medium">{banner.message}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="En savoir plus sur les codes de secours"
              className="inline-flex shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            >
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            Codes à usage unique permettant de se connecter sans email, si votre messagerie est indisponible.
          </TooltipContent>
        </Tooltip>
      </div>
    </AttentionRow>
  )
}
