import type { EngagementStats } from '@/types/analytics'
import { Typography } from '@/components/ui/typography'

export interface InvitationFunnelProps {
  engagement: EngagementStats
}

const STEPS: { key: 'invited' | 'sent' | 'clicked' | 'booked'; label: string }[] = [
  { key: 'invited', label: 'Invités' },
  { key: 'sent', label: 'Envoyées' },
  { key: 'clicked', label: 'Cliquées' },
  { key: 'booked', label: 'Réservations' },
]

/** Entonnoir des invitations : 4 barres décroissantes relatives au nombre d'invités. */
export function InvitationFunnel({ engagement }: InvitationFunnelProps) {
  const max = engagement.invited || 0
  return (
    <div className="space-y-3">
      {STEPS.map(({ key, label }) => {
        const value = engagement[key]
        const widthPct = max > 0 ? Math.round((value / max) * 100) : 0
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between">
              <Typography variant="body-sm" color="muted">{label}</Typography>
              <Typography variant="body-sm" weight="semibold">{value}</Typography>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                data-testid="funnel-bar"
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
